/**
 * The "Ask" passage index (J1), served inside GET /api/search-index. SERVER-ONLY.
 *
 * "Ask" answers a visitor's question ONLY by quoting passages of this site
 * (lib/ask/engine.ts runs in the browser; nothing is generated, nothing is
 * sent anywhere). A passage is one quotable block, verbatim, with where it
 * lives:
 *
 *   CV (EN → /cv, ZH → /cv/zh)   per entry of the PUBLIC 'cv' audience —
 *       its facts line (title · organisation · place · dates, exactly the
 *       parts the sheet prints; marked `m`, it is shown as facts, not as a
 *       quote) and every summary, highlight, sub-point, patent and award
 *       line, verbatim; skill groups, languages, the self-assessment, the
 *       Personal Info summary (never a contact detail) and recommendations
 *       given with permission. EN and ZH passages of the same entry line
 *       share an `align` key where both languages list the same entries and
 *       lines (lib/searchIndex cvAlignment), so an answer shows one of the
 *       twins, not both.
 *   posts, case studies   the lede (frontmatter description) and each
 *       paragraph and list item of the rendered body (code, figures, tables
 *       and endnotes excluded), under its h2/h3 (linked to the heading's
 *       id); long paragraphs are cut into sentence runs.
 *   /now, /uses, the /about bio   the same, for their bodies.
 *   /contact   the owner's availability, when set (Home editor).
 *   any other document of the search index (publications, …)   its
 *       description and body sentences, linked to the document.
 *
 * Every quote that is one rendered block carries a text directive
 * (lib/search/textFragment.ts) so the citation link scrolls to it and
 * highlights it.
 *
 * Public data only: the same readers as the pages (readPublicCvData with
 * the CV audience, listPosts / listWork without drafts, the public page
 * bodies, readPublicHome), so hidden sections, entries, fields and bullets,
 * recommendations without consent, drafts and contact details can never
 * become an answer (tests/search-ask-leak.test.ts).
 */

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import remarkStripMdxExpressions from './rehype/stripMdxExpressions'
import rehypeSafeUrls from './rehype/safeUrls'
import rehypeAlerts from './rehype/alerts'
import rehypeLiftBlocks from './rehype/liftBlocks'
import rehypeHeadings from './rehype/headings'
import { footnoteOptions } from './rehype/footnotes'
import { classList, isElement, textOf, type HastNode } from './rehype/hast'
import { listPosts, listWorkInDisplayOrder } from './mdx'
import { getPage } from './contentStore'
import { readPublicCvData } from './cvdata'
import { readPublicHome } from './home'
import {
  bullets,
  certificateValidity,
  cvEntryAnchor,
  cvSectionAnchor,
  entries,
  entryRange,
  field,
  graduation,
  indexedCertificates,
  indexedList,
  joinParts,
  labelled,
  list,
} from '../components/CVViewerPage/fields'
import { recommendationCredit, recommendationItems } from '../components/CVViewerPage/recommendationView'
import { availabilityView } from '../components/Common/contactForm'
import { cvLabels, formatCvDate, majorAddsInfo } from './cvFormat'
import { detectContentLang } from './toc'
import { textDirectiveTerms } from './search/textFragment'
import { hasCjk } from './search/text'
import { bodyOf, cvAlignment, cvSectionLabel, CV_LANG_TAGS, CV_PATHS, type SearchDoc } from './searchIndex'
import type { CvLang, CvSectionLike } from './cvVisibility'

/** Where quotes live: one page section (a CV entry, an article's h2/h3 section). */
export type AskSource = {
  /** Same-site URL of the page, with the section's anchor when it has one. */
  url: string
  /** The page ("CV", "简历", a post's title). */
  page: string
  /** The page section (a CV section heading, an article's h2/h3). */
  section?: string
  /** The entry within it (a CV entry's title). */
  title?: string
  /** BCP-47 language of the source ('en', 'zh-Hans'). */
  lang: string
  kind: SearchDoc['kind']
  /**
   * What the source is about: the CV section (sessionName) or
   * 'availability' — "Has he won awards?" asks for every competitionAwards
   * entry (lib/search/synonyms `sections`).
   */
  topic?: string
  /** CV sources: the same entry in the other language has the same key ("patents:0"). */
  align?: string
}

/**
 * One passage. `f` says how to highlight it on its page with a text
 * directive: 1 = the whole quote; [a, b] = from the quote's first `a`
 * characters to the part starting at `b`; [start] / [start, end] = these
 * terms (the rendered text differs from the quote, e.g. footnote marks).
 * Absent when the passage is not one rendered block: the link then goes to
 * the source's anchor only.
 */
export type AskPassage = {
  /** The text, verbatim from the page (whitespace collapsed). */
  t: string
  /** Index into AskIndex.sources. */
  s: number
  f?: 1 | [number, number] | string[]
  /** Its line within the aligned entry ("p3"): source.align + ':' + a identifies the twin. */
  a?: string
  /** Language of the text when it differs from the source's. */
  l?: string
  /**
   * 1: a facts line put together from fields the page prints separately
   * (an entry's title · organisation · dates, a skill group) — shown as
   * facts, never as a verbatim quote.
   */
  m?: 1
}

export type AskIndex = { sources: AskSource[]; passages: AskPassage[] }

/** Longest quote; longer paragraphs are cut into sentence runs of at most this many characters. */
export const PASSAGE_MAX_CHARS = 320
/** Shortest paragraph worth quoting (code points; CJK counts double). */
const PASSAGE_MIN_WEIGHT = 16

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const f = (node: unknown, key: string): string => squash(field(node, key))
const joinDot = (...parts: string[]) => parts.map(squash).filter(Boolean).join(' · ')

/** Reading weight of a text: a CJK character counts as two. */
function weight(text: string): number {
  let n = 0
  for (const ch of text) n += hasCjk(ch) ? 2 : 1
  return n
}

/** The language of one quote: the page's, unless the quote is mostly in the other script. */
export function quoteLang(text: string, pageLang: string): string {
  const han = Array.from(text.matchAll(/\p{Script=Han}/gu)).length
  const latin = Array.from(text.matchAll(/[A-Za-z]+/g)).length
  const cjkPage = /^(zh|ja|ko)(-|$)/i.test(pageLang)
  if (!cjkPage && han > latin * 2 && han >= 4) return 'zh-Hans'
  if (cjkPage && han === 0 && latin >= 3) return 'en'
  return pageLang
}

// ── Sentences ─────────────────────────────────────────────────────────────

const CJK_END = /[。！？；]/u
const LATIN_END = /[.!?]/
/** Closing quotes and brackets that belong to the sentence they follow. */
const CLOSERS = /[”’」』）)"'\]]/u

/**
 * Sentences of a paragraph: CJK ones end after 。！？；, Latin ones after
 * . ! ? followed by a space (a '.' inside a word — Next.js, 3.5 — is not an
 * end). Closing quotes and brackets stay with their sentence. Nothing is
 * dropped: the sentences joined again give the paragraph back.
 */
export function sentences(text: string): string[] {
  const out: string[] = []
  const chars = Array.from(text)
  let cur = ''
  let ended = false
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const next = chars[i + 1]
    cur += ch
    if (CJK_END.test(ch)) ended = true
    else if (LATIN_END.test(ch)) ended = ended || next === undefined || /\s/.test(next) || CLOSERS.test(next)
    else if (!(ended && CLOSERS.test(ch))) ended = false
    // Split after the end mark (and its closers), before the next sentence.
    if (ended && (next === undefined || !(CLOSERS.test(next) || CJK_END.test(next) || LATIN_END.test(next)))) {
      if (next === undefined || /\s/.test(next) || CJK_END.test(ch) || CLOSERS.test(ch)) {
        const s = cur.trim()
        if (s) out.push(s)
        cur = ''
        ended = false
      }
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** A paragraph cut into runs of whole sentences, each at most `max` characters (a longer sentence stays whole). */
export function sentenceRuns(text: string, max = PASSAGE_MAX_CHARS): string[] {
  const t = squash(text)
  if (Array.from(t).length <= max) return t ? [t] : []
  const runs: string[] = []
  let cur = ''
  for (const s of sentences(t)) {
    const joined = cur ? `${cur}${hasCjk(cur) ? '' : ' '}${s}` : s
    if (cur && Array.from(joined).length > max) {
      runs.push(cur)
      cur = s
    } else cur = joined
  }
  if (cur) runs.push(cur)
  return runs
}

// ── Passage drafts (frags are computed per page once all are known) ─────

export type Draft = {
  text: string
  url: string
  page: string
  section?: string
  title?: string
  lang: string
  kind: SearchDoc['kind']
  topic?: string
  /** Twin key: entry ("patents:0") and line ("p3"). */
  align?: { entry: string; line: string }
  /** The text is (a sentence run of) one rendered block: give it a text directive. */
  block?: boolean
  /** The block's text as rendered, when it differs from the text (footnote marks). */
  dom?: string
  /** A facts line (AskPassage.m). */
  meta?: boolean
}

/** The compact form of a text directive's terms for `text` (see AskPassage.f). */
export function fragSpec(text: string, terms: readonly string[]): AskPassage['f'] {
  if (!terms.length) return undefined
  if (terms.length === 1 && terms[0] === text) return 1
  if (terms.length === 2 && text.startsWith(terms[0]) && text.endsWith(terms[1])) return [terms[0].length, text.length - terms[1].length]
  return [...terms]
}

/**
 * Keep a line's twin key only where the twin really is the same line: both
 * languages have the entry, and the entry has the same lines in both (an
 * owner who added a bullet in one language only breaks the pairing of that
 * entry's lines, never of other entries).
 */
function pairTwins(drafts: Draft[]): void {
  const lines = new Map<string, Map<string, string[]>>()
  for (const d of drafts) {
    if (!d.align) continue
    const byLang = lines.get(d.align.entry) ?? new Map<string, string[]>()
    lines.set(d.align.entry, byLang)
    const keys = byLang.get(d.lang) ?? []
    keys.push(d.align.line)
    byLang.set(d.lang, keys)
  }
  for (const d of drafts) {
    if (!d.align) continue
    const sets = Array.from(lines.get(d.align.entry)?.values() ?? [])
    const same = sets.length === 2 && sets[0].slice().sort().join('|') === sets[1].slice().sort().join('|')
    if (!same) delete d.align
  }
}

/** Group drafts into sources, compute their text directives (unique per page) and pack them. */
export function finish(drafts: Draft[]): AskIndex {
  pairTwins(drafts)
  const byPage = new Map<string, Draft[]>()
  for (const d of drafts) {
    const path = d.url.split('#')[0]
    const group = byPage.get(path)
    if (group) group.push(d)
    else byPage.set(path, [d])
  }
  const sources: AskSource[] = []
  const sourceIds = new Map<string, number>()
  const passages: AskPassage[] = []
  for (const d of drafts) {
    const key = JSON.stringify([d.url, d.page, d.section || '', d.title || '', d.kind, d.topic || '', d.align?.entry || ''])
    let s = sourceIds.get(key)
    if (s === undefined) {
      const src: AskSource = { url: d.url, page: d.page, lang: d.lang, kind: d.kind }
      if (d.section) src.section = d.section
      if (d.title) src.title = d.title
      if (d.topic) src.topic = d.topic
      if (d.align) src.align = d.align.entry
      s = sources.push(src) - 1
      sourceIds.set(key, s)
    }
    const row: AskPassage = { t: d.text, s }
    if (d.block) {
      const own = d.dom || d.text
      const others = (byPage.get(d.url.split('#')[0]) || []).filter((o) => o !== d && !o.meta).map((o) => o.dom || o.text)
      const spec = fragSpec(d.text, textDirectiveTerms(own, others))
      if (spec !== undefined) row.f = spec
    }
    if (d.align && sources[s].align === d.align.entry) row.a = d.align.line
    if (d.lang !== sources[s].lang) row.l = d.lang
    if (d.meta) row.m = 1
    passages.push(row)
  }
  return { sources, passages }
}

// ── CV ────────────────────────────────────────────────────────────────────

const CV_PAGE_LABEL: Record<CvLang, string> = { en: 'CV', zh: '简历' }
const SKILLS_LABEL: Record<CvLang, string> = { en: 'Skills', zh: '技能' }

/** The list each entry section numbers its anchors by. */
const ENTRY_LIST: Record<string, string> = {
  education: 'educationExperience',
  workExperience: 'experiences',
  project: 'projectExperience',
  patents: 'patentExperience',
  competitionAwards: 'awards',
}

/**
 * Passages of one language of the PUBLIC CV ('cv' audience, pruned).
 * `aligned` (lib/searchIndex cvAlignment) names the lists whose entries have
 * a twin in the other language.
 */
export function cvPassages(sections: readonly CvSectionLike[] | null | undefined, lang: CvLang, aligned: ReadonlySet<string> = new Set()): Draft[] {
  const out: Draft[] = []
  const base = CV_PATHS[lang]
  const tag = CV_LANG_TAGS[lang]
  const page = CV_PAGE_LABEL[lang]
  const L = cvLabels(lang)
  const sep = lang === 'zh' ? '：' : ': '
  const listSep = lang === 'zh' ? '、' : ', '
  for (const s of entries(Array.isArray(sections) ? sections : [])) {
    const name = String(s?.sessionName || '')
    const label = cvSectionLabel(s, lang)
    const sectionUrl = `${base}#${cvSectionAnchor(name)}`
    const add = (text: string, opts: { url?: string; title?: string; twin?: [string, string]; block?: boolean; meta?: boolean }) => {
      const t = squash(text)
      if (!t) return
      const d: Draft = { text: t, url: opts.url || sectionUrl, page, section: label, lang: tag, kind: 'cv', topic: name, block: !!opts.block }
      if (opts.title) d.title = opts.title
      if (opts.meta) d.meta = true
      if (opts.twin) d.align = { entry: opts.twin[0], line: opts.twin[1] }
      out.push(d)
    }
    /** An entry: its facts line, then each verbatim line. */
    const entry = (listKey: string, index: number, title: string, facts: string, lines: Array<[string, string]>) => {
      const url = `${base}#${cvEntryAnchor(name, index)}`
      const twinOf = (line: string): [string, string] | undefined => (aligned.has(listKey) ? [`${listKey}:${index}`, line] : undefined)
      add(facts, { url, title, twin: twinOf('h'), meta: true })
      for (const [key, text] of lines) add(text, { url, title, twin: twinOf(key), block: true })
    }
    const features = (e: unknown): Array<[string, string]> => {
      const parts: Array<[string, string]> = []
      list(e, 'features').forEach((feat, i) => {
        parts.push([`f${i}`, f(feat, 'description')])
        bullets(feat, 'furtherExplanation').forEach((sub, j) => parts.push([`f${i}.${j}`, sub]))
      })
      return parts
    }
    switch (name) {
      case 'personalInformation': {
        // Only the summary (when the owner shows it on the CV) — contact details are never quoted.
        field(s, 'introduction')
          .split(/\n+/)
          .forEach((line, i) => add(line, { twin: aligned.has(name) ? [name, `intro${i}`] : undefined, block: true }))
        break
      }
      case 'education':
        for (const { item: e, index } of indexedList(s, ENTRY_LIST[name])) {
          const degree = f(e, 'degree')
          const major = majorAddsInfo(degree, f(e, 'major')) ? f(e, 'major') : ''
          const school = joinParts([f(e, 'schoolName'), f(e, 'schoolLocation')], ', ')
          const title = joinParts([degree, major], lang === 'zh' ? ' · ' : ', ')
          entry(name, index, f(e, 'schoolName') || title, joinDot(title, school, graduation(e, lang), labelled(L.gpa, f(e, 'gpa'), lang)), [])
        }
        break
      case 'workExperience':
        for (const { item: e, index } of indexedList(s, ENTRY_LIST[name])) {
          const title = f(e, 'jobTitle') || f(e, 'companyName')
          entry(name, index, title, joinDot(f(e, 'jobTitle'), f(e, 'companyName'), f(e, 'location'), entryRange(e, lang)), [['d', f(e, 'jobDescription')], ...features(e)])
          const skills = bullets(e, 'relatedSkills').map(squash).filter(Boolean)
          if (skills.length) {
            add(`${SKILLS_LABEL[lang]}${sep}${skills.join(listSep)}`, {
              url: `${base}#${cvEntryAnchor(name, index)}`,
              title,
              twin: aligned.has(name) ? [`${name}:${index}`, 'skills'] : undefined,
              meta: true,
            })
          }
        }
        break
      case 'project':
        for (const { item: e, index } of indexedList(s, ENTRY_LIST[name])) {
          entry(name, index, f(e, 'title'), joinDot(f(e, 'title'), f(e, 'projectLocation'), entryRange(e, lang, { futureEndAsPresent: true })), [
            ['d', f(e, 'description')],
            ...features(e),
          ])
        }
        break
      case 'patents':
        for (const { item: e, index } of indexedList(s, ENTRY_LIST[name])) {
          entry(
            name,
            index,
            f(e, 'title'),
            joinDot(f(e, 'title'), f(e, 'organization'), labelled(L.status, f(e, 'status'), lang), formatCvDate(field(e, 'date'), lang), f(e, 'authority')),
            bullets(e, 'patents').map((p, i): [string, string] => [`p${i}`, p]),
          )
        }
        break
      case 'competitionAwards':
        for (const { item: e, index } of indexedList(s, ENTRY_LIST[name])) {
          entry(
            name,
            index,
            f(e, 'contestName') || f(e, 'award'),
            joinDot(f(e, 'contestName'), f(e, 'award'), f(e, 'organization'), formatCvDate(field(e, 'date'), lang), f(e, 'location')),
            bullets(e, 'description').map((p, i): [string, string] => [`d${i}`, p]),
          )
        }
        break
      case 'certification':
        for (const { org, cert, index } of indexedCertificates(s)) {
          entry(name, index, f(cert, 'certificationName'), joinDot(f(cert, 'certificationName'), f(org, 'issuingOrganization'), certificateValidity(cert, lang)), [])
        }
        break
      case 'skill': {
        list(s, 'languages').forEach((l, i) => {
          add([f(l, 'language'), f(l, 'level')].filter(Boolean).join(sep), { twin: aligned.has('skill.languages') ? ['skill.languages', `${i}`] : undefined, meta: true })
        })
        list(s, 'technical').forEach((g, i) => {
          const items = bullets(g, 'description').map(squash).filter(Boolean)
          if (!items.length) return
          const groupName = f(g, 'name')
          add(groupName ? `${groupName}${sep}${items.join(listSep)}` : items.join(listSep), {
            title: groupName || undefined,
            twin: aligned.has('skill.technical') ? ['skill.technical', `${i}`] : undefined,
            meta: true,
          })
        })
        break
      }
      case 'extraSkill':
        bullets(s, 'points').forEach((p, i) => add(p, { twin: aligned.has(name) ? [name, `p${i}`] : undefined, block: true }))
        break
      case 'selfAssessment':
        field(s, 'text')
          .split(/\n+/)
          .forEach((line, i) => add(line, { twin: aligned.has(name) ? [name, `t${i}`] : undefined, block: true }))
        bullets(s, 'points').forEach((p, i) => add(p, { twin: aligned.has(name) ? [name, `p${i}`] : undefined, block: true }))
        break
      case 'recommendations':
        // recommendationItems re-checks the permission flag (defence in depth).
        for (const { item, index } of recommendationItems(s)) {
          const url = `${base}#${cvEntryAnchor(name, index)}`
          const title = joinParts([item.name, recommendationCredit(item, lang)], ' · ')
          add(item.quote, { url, title, twin: aligned.has(name) ? [`${name}:${index}`, 'q'] : undefined, block: true })
        }
        break
      default:
        break
    }
  }
  return out
}

// ── Rendered bodies (posts, case studies, pages) ─────────────────────────

/**
 * The rendering pipeline of lib/mdx.ts compileMdx up to the heading ids —
 * the steps that decide the text and the ids a reader sees (embeds, images,
 * galleries, language spans and code highlighting change neither).
 * tests/search-ask.test.ts keeps the ids identical to compileMdx's.
 */
export function bodyTree(body: string, lang: string): HastNode | null {
  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkGfm)
      .use(remarkStripMdxExpressions)
      .use(remarkRehype, footnoteOptions(lang))
      .use(rehypeSafeUrls)
      .use(rehypeAlerts, { lang })
      .use(rehypeLiftBlocks)
      .use(rehypeHeadings)
    const mdast = processor.parse(String(body ?? ''))
    return processor.runSync(mdast) as unknown as HastNode
  } catch {
    return null
  }
}

/** Never quoted: code, media, tables, endnotes, players, interactive bits. */
const SKIP_TAGS = new Set(['pre', 'figure', 'img', 'video', 'audio', 'iframe', 'svg', 'table', 'button', 'script', 'style', 'nav', 'summary', 'hr'])
const HEADINGS = new Set(['h2', 'h3'])

const isFootnoteRef = (node: HastNode) =>
  isElement(node, 'sup') && (node.children || []).some((c) => isElement(c, 'a') && !!c.properties?.dataFootnoteRef)

/** Text without footnote reference marks. */
function displayText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? ''
  if (isFootnoteRef(node)) return ''
  return (node.children || []).map(displayText).join('')
}

/** Text outside links (a paragraph that is only a link is not prose). */
function textOutsideLinks(node: HastNode): string {
  if (node.type === 'text') return node.value ?? ''
  if (isElement(node, 'a')) return ''
  return (node.children || []).map(textOutsideLinks).join('')
}

/** Heading text without the self-link marker ("#"). */
function headingText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? ''
  if (isElement(node) && classList(node).includes('heading-anchor-icon')) return ''
  return (node.children || []).map(headingText).join('')
}

type BodyBase = { url: string; page: string; lang: string; kind: SearchDoc['kind']; section?: string }

/** Passages of a compiled body: each paragraph / leaf list item under its h2/h3. */
export function bodyPassages(tree: HastNode | null, base: BodyBase): Draft[] {
  if (!tree) return []
  const out: Draft[] = []
  let heading: { id: string; text: string } | null = null
  const push = (node: HastNode) => {
    const dom = squash(textOf(node))
    const text = squash(displayText(node))
    if (weight(text) < PASSAGE_MIN_WEIGHT) return
    if (weight(squash(textOutsideLinks(node))) < 10) return
    const url = heading ? `${base.url.split('#')[0]}#${heading.id}` : base.url
    const own = quoteLang(text, base.lang)
    const runs = sentenceRuns(text)
    runs.forEach((run) => {
      out.push({
        text: run,
        url,
        page: base.page,
        section: heading?.text || base.section,
        lang: own,
        kind: base.kind,
        // A quote is one block when it is the whole paragraph (or a sentence
        // run of it with no footnote marks to trip over).
        block: runs.length === 1 || dom === text,
        ...(runs.length === 1 && dom !== text ? { dom } : {}),
      })
    })
  }
  const visit = (node: HastNode) => {
    if (!isElement(node)) return
    const tag = node.tagName
    if (SKIP_TAGS.has(tag)) return
    if (tag === 'section' && node.properties?.dataFootnotes) return
    if (HEADINGS.has(tag)) {
      const id = typeof node.properties?.id === 'string' ? node.properties.id : ''
      heading = id ? { id, text: squash(headingText(node)) } : heading
      return
    }
    if (/^h[1-6]$/.test(tag)) return
    if (tag === 'p') return push(node)
    if (tag === 'li') {
      const blocks = (node.children || []).some((c) => isElement(c, ['p', 'ul', 'ol', 'div', 'blockquote', 'pre', 'figure', 'table']))
      if (!blocks) return push(node)
    }
    for (const c of node.children || []) visit(c)
  }
  for (const c of tree.children || []) visit(c)
  return out
}

const treeCache = new Map<string, HastNode | null>()
const TREE_CACHE_MAX = 200

/** bodyTree memoised per item version, so rebuilding the index stays cheap. */
function cachedTree(key: string, body: string, lang: string): HastNode | null {
  if (treeCache.has(key)) return treeCache.get(key) ?? null
  const tree = bodyTree(body, lang)
  treeCache.set(key, tree)
  while (treeCache.size > TREE_CACHE_MAX) treeCache.delete(treeCache.keys().next().value as string)
  return tree
}

const str = (v: unknown): string => (typeof v === 'string' ? squash(v) : '')

/** The lede of a post or case study (its frontmatter description, shown under the title). */
function ledePassage(kind: 'post' | 'work', url: string, page: string, lang: string, description: unknown): Draft[] {
  const text = str(description)
  if (weight(text) < PASSAGE_MIN_WEIGHT) return []
  return [{ text, url, page, lang: quoteLang(text, lang), kind, block: true }]
}

function pagePassages(name: 'now' | 'uses' | 'about', fallbackTitle: string): Draft[] {
  const page = getPage(name)
  const body = page?.body || ''
  if (!body.trim()) return []
  const fm = (page?.frontmatter || {}) as Record<string, unknown>
  const title = str(fm.title) || fallbackTitle
  const lang = detectContentLang({ lang: fm.lang, title: fm.title, body })
  const url = name === 'about' ? '/about#about-bio' : `/${name}`
  return bodyPassages(cachedTree(`page:${name}:${lang}:${body}`, body, lang), {
    url,
    page: name === 'about' ? 'About' : title,
    lang,
    kind: 'page',
    section: name === 'about' ? 'Bio' : undefined,
  })
}

/** The owner's availability as /contact shows it (only when a status is set). */
export function availabilityPassages(availability: unknown): Draft[] {
  const view = availabilityView(availability as Parameters<typeof availabilityView>[0])
  if (!view) return []
  const base = { url: '/contact#availability', page: 'Contact', section: 'Availability', lang: 'en', kind: 'page' as const, topic: 'availability' }
  const out: Draft[] = [{ ...base, text: view.label, block: true }]
  if (view.from) out.push({ ...base, text: `From ${view.from}`, meta: true })
  if (view.roles.length) out.push({ ...base, text: view.roles.join(' · '), meta: true })
  if (view.workStatus) out.push({ ...base, text: view.workStatus, block: true })
  return out
}

// ── Other documents (publications, …) ─────────────────────────────────────

/** The topic (lib/search/synonyms `sections`) a document kind answers: papers answer "publications". */
const DOC_TOPIC: Partial<Record<SearchDoc['kind'], string>> = { publication: 'publications' }

/** Kinds whose passages are built from their sources above. */
const SOURCED_KINDS = new Set<SearchDoc['kind']>(['cv', 'post', 'work', 'page'])

/** Passages of a search document no builder above covers: its description and body sentences. */
export function docPassages(doc: SearchDoc): Draft[] {
  const lang = doc.lang || detectContentLang({ title: doc.title, body: doc.body || doc.description || '' })
  const out: Draft[] = []
  for (const text of [doc.description || '', doc.body || '']) {
    for (const run of sentenceRuns(text)) {
      if (weight(run) < PASSAGE_MIN_WEIGHT) continue
      out.push({ text: run, url: doc.href, page: doc.title, lang: quoteLang(run, lang), kind: doc.kind, topic: DOC_TOPIC[doc.kind] || doc.kind })
    }
  }
  return out
}

// ── Assembly ──────────────────────────────────────────────────────────────

/**
 * Every passage of the public site. `docs` are the search index's documents
 * (buildSearchIndex().docs): the ones no source builder covers (e.g.
 * publications) contribute their own text.
 */
export async function buildAskIndex(docs: readonly SearchDoc[] = []): Promise<AskIndex> {
  const drafts: Draft[] = []
  const cv = readPublicCvData('cv')
  const aligned = cvAlignment(cv.en, cv.zh)
  drafts.push(...cvPassages(cv.en, 'en', aligned), ...cvPassages(cv.zh, 'zh', aligned))

  const articles = [
    ...listPosts().map((p) => ({ kind: 'post' as const, entry: p, body: bodyOf('blog', p.slug) })),
    ...listWorkInDisplayOrder().map((w) => ({ kind: 'work' as const, entry: w, body: bodyOf('work', w.slug) })),
  ]
  for (const { kind, entry, body } of articles) {
    const page = entry.frontmatter.title
    drafts.push(...ledePassage(kind, entry.permalink, page, entry.lang, entry.frontmatter.description))
    const tree = cachedTree(`${entry.permalink}@${entry.updatedAt ?? 0}:${entry.lang}:${body.length}`, body, entry.lang)
    drafts.push(...bodyPassages(tree, { url: entry.permalink, page, lang: entry.lang, kind }))
  }
  drafts.push(...pagePassages('now', 'Now'), ...pagePassages('uses', 'Uses'), ...pagePassages('about', 'About'))
  drafts.push(...availabilityPassages((readPublicHome() as { availability?: unknown } | null)?.availability))
  for (const doc of docs) if (!SOURCED_KINDS.has(doc.kind)) drafts.push(...docPassages(doc))
  return finish(drafts)
}
