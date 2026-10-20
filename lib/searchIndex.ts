import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import { listPosts, listWorkInDisplayOrder } from './mdx'
import { getItem, getPage } from './contentStore'
import { readPublicCvData } from './cvdata'
import { readPublicHome } from './home'
import { readCvOwnerNames } from './publicationsData'
import { cleanList, cvLabels, formatCvDate, majorAddsInfo, safeHref } from './cvFormat'
import { SECTION_BY_NAME } from './cvSections'
import {
  bullets,
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
import { detectContentLang, readableText } from './toc'
import type { CvLang, CvSectionLike } from './cvVisibility'
import type { AskIndex } from './askIndex'
import { searchIndexGeneration } from './searchIndexCache'
import { readPublicationsView } from './publicationsData'
import { publicationDocs } from './publicationsSearch'

/**
 * The public search index behind ⌘K (GET /api/search-index):
 *
 *   posts / case studies  frontmatter, h2/h3 headings and the first 4,000
 *                         characters of body text (code excluded)
 *   /now, /uses           page bodies
 *   /about                the owner's bio, only once written
 *   CV                    one doc per entry of the PUBLIC A4 CV — the
 *                         audience /cv renders (readPublicCvData('cv'):
 *                         hidden sections, entries, fields and bullets are
 *                         already gone), in English AND Chinese, linking
 *                         to the anchors /cv and /cv/zh render:
 *                         `/cv#cv-<section>-<i>` (`/cv/zh#…`) for entries,
 *                         `/cv#cv-<section>` for skill groups, languages
 *                         and the self-assessment
 *   publications          one doc per public paper (lib/publicationsSearch):
 *                         `/publications#<key>`, or the CV anchors when the
 *                         section is on the CV only
 *   subject               the owner's public names (CV Personal Info), so
 *                         "Does Lucian have patents?" searches "patents"
 *   ask                   GET /api/search-index only: the "Ask" passage
 *                         index (lib/askIndex.ts)
 *
 * Contact details are never indexed. Drafts never appear (listPosts /
 * listWork exclude them).
 */

export type SearchDoc = {
  kind: 'post' | 'work' | 'page' | 'cv' | 'publication'
  title: string
  href: string
  description?: string
  tags?: string[]
  headings?: string[]
  body?: string
  lang?: string
  /** CV docs: the section heading as the page prints it ("PATENTS", "专利"). */
  section?: string
  /**
   * CV docs: the same entry in the other language's CV has the same key
   * ("patents:0"), so a result list can show one of the two.
   */
  twin?: string
}

export type SearchIndex = {
  v: 2
  availability?: { bookingUrl?: string }
  /** The owner's public names: lower-case words and CJK names (never contact details). */
  subject?: string[]
  docs: SearchDoc[]
  /** The "Ask" passage index (lib/askIndex.ts) — GET /api/search-index only. */
  ask?: AskIndex
}

export const BODY_MAX_CHARS = 4000

type MdNode = { type: string; value?: string; depth?: number; children?: MdNode[] }

const SKIP = new Set(['code', 'mdxjsEsm', 'mdxFlowExpression', 'mdxTextExpression', 'html', 'image', 'imageReference', 'definition'])
const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'tableCell', 'mdxJsxFlowElement'])

function mdText(node: MdNode): string {
  if (SKIP.has(node.type)) return ''
  if (node.type === 'text' || node.type === 'inlineCode') return node.value || ''
  if (node.type === 'break') return ' '
  const inner = (node.children || []).map(mdText).join('')
  return BLOCKS.has(node.type) ? ` ${inner} ` : inner
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

function clampChars(s: string, max: number): string {
  const chars = Array.from(s)
  return chars.length <= max ? s : chars.slice(0, max).join('').trimEnd()
}

/** h2/h3 heading texts and the readable body text (≤ 4,000 chars, code excluded) of an MDX body. */
export function outlineOf(body: string): { headings: string[]; text: string } {
  let tree: MdNode
  try {
    tree = unified().use(remarkParse).use(remarkMdx).use(remarkGfm).parse(String(body || '')) as unknown as MdNode
  } catch {
    // Invalid MDX still has searchable words (fenced code removed first).
    const prose = String(body || '').replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, ' ')
    return { headings: [], text: clampChars(squash(readableText(prose)), BODY_MAX_CHARS) }
  }
  const headings: string[] = []
  const walk = (node: MdNode) => {
    if (node.type === 'heading' && (node.depth === 2 || node.depth === 3)) {
      const h = squash(mdText(node))
      if (h) headings.push(h)
    }
    for (const c of node.children || []) walk(c)
  }
  walk(tree)
  // Callout markers (`> [!NOTE]`, lib/rehype/alerts.ts) are syntax, not words.
  const text = mdText(tree).replace(/\[!(?:note|tip|important|warning|caution)\]/gi, ' ')
  return { headings, text: clampChars(squash(text), BODY_MAX_CHARS) }
}

const str = (v: unknown): string => (typeof v === 'string' ? squash(v) : '')
const joinDot = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(' · ')

/** A string field of a public CV node ('' when redacted by the owner), whitespace squashed. */
const f = (node: unknown, key: string): string => squash(field(node, key))

function featureText(entry: unknown): string {
  return list(entry, 'features')
    .map((feat) => [f(feat, 'description'), ...bullets(feat, 'furtherExplanation').map(squash)].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' ')
}

// ── CV ────────────────────────────────────────────────────────────────────

/** The CV page of each language. */
export const CV_PATHS: Record<CvLang, string> = { en: '/cv', zh: '/cv/zh' }
/** BCP-47 tag of each CV page (its <html lang>). */
export const CV_LANG_TAGS: Record<CvLang, string> = { en: 'en', zh: 'zh-Hans' }

/** The heading a CV section prints: the owner's, else the section's default (lib/cvSections). */
export function cvSectionLabel(section: unknown, lang: CvLang): string {
  const name = String((section as { sessionName?: unknown } | null)?.sessionName || '')
  return f(section, 'headerName') || SECTION_BY_NAME[name]?.headerDefault[lang] || name
}

/** The visible-entry lists of each CV section (what `cv-<section>-<i>` anchors count). */
const ENTRY_LISTS: Record<string, string> = {
  education: 'educationExperience',
  workExperience: 'experiences',
  project: 'projectExperience',
  patents: 'patentExperience',
  competitionAwards: 'awards',
  recommendations: 'items',
}

/** How many entries (or groups / points) each list of a language's public CV has: `section` / `section.list` → count. */
function listCounts(sections: readonly CvSectionLike[] | null | undefined): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of entries(Array.isArray(sections) ? sections : [])) {
    const name = String(s?.sessionName || '')
    if (ENTRY_LISTS[name]) out.set(name, list(s, ENTRY_LISTS[name]).length)
    else if (name === 'certification') out.set(name, indexedCertificates(s).length)
    else if (name === 'skill') {
      out.set('skill.technical', list(s, 'technical').length)
      out.set('skill.languages', list(s, 'languages').length)
    } else if (name === 'extraSkill') out.set(name, bullets(s, 'points').length)
    else if (name) out.set(name, 1)
  }
  return out
}

/**
 * Which lists of the English and the Chinese CV line up entry for entry: the
 * same section with the same number of entries (cvSync keeps the two in step;
 * an owner who edits one language only breaks the pairing for that list).
 * Twin keys (SearchDoc.twin, the Ask passages' `align`) are given only there.
 */
export function cvAlignment(en: readonly CvSectionLike[] | null | undefined, zh: readonly CvSectionLike[] | null | undefined): Set<string> {
  const a = listCounts(en)
  const b = listCounts(zh)
  return new Set(Array.from(a.keys()).filter((k) => b.get(k) === a.get(k)))
}

/**
 * One search doc per entry of the PUBLIC (already pruned) sections of one
 * language of the A4 CV (readPublicCvData('cv'), the audience /cv and
 * /cv/zh render). Anchors are computed with the same helpers the sheet and
 * the Reading view use (components/CVViewerPage/fields): the entry index is
 * its position in the visible list (`indexedList`), certificates are
 * numbered across all visible issuers in order (`indexedCertificates`).
 * Entries without a title get no doc, but still count towards the index,
 * exactly as on the page. Personal Info (contact details) and
 * recommendations (other people's words) are never search results.
 * `aligned` (cvAlignment) marks the lists whose entries have a twin in the
 * other language: their docs carry the same `twin` key in both.
 */
export function cvSearchDocs(sections: readonly CvSectionLike[] | null | undefined, lang: CvLang = 'en', aligned: ReadonlySet<string> = new Set()): SearchDoc[] {
  const out: (SearchDoc | null)[] = []
  const base = CV_PATHS[lang]
  const sep = lang === 'zh' ? '：' : ': '
  for (const s of entries(Array.isArray(sections) ? sections : [])) {
    const name = String(s?.sessionName || '')
    const section = cvSectionLabel(s, lang)
    const doc = (title: string, href: string, description: string, body: string, tags?: string[], twin?: string): SearchDoc | null => {
      if (!title) return null
      const d: SearchDoc = { kind: 'cv', title, href, lang: CV_LANG_TAGS[lang] }
      if (description) d.description = description
      const b = clampChars(squash(body), BODY_MAX_CHARS)
      if (b) d.body = b
      if (tags && tags.length) d.tags = tags
      if (section) d.section = section
      if (twin) d.twin = twin
      return d
    }
    const sectionHref = `${base}#${cvSectionAnchor(name)}`
    const entryHref = (index: number) => `${base}#${cvEntryAnchor(name, index)}`
    const twin = (key: string, index?: number) => (aligned.has(key) ? (index === undefined ? key : `${key}:${index}`) : undefined)
    switch (name) {
      case 'education':
        for (const { item: e, index } of indexedList(s, 'educationExperience')) {
          const degree = f(e, 'degree')
          const major = majorAddsInfo(degree, f(e, 'major')) ? f(e, 'major') : ''
          out.push(
            doc(
              f(e, 'schoolName'),
              entryHref(index),
              joinDot(joinParts([degree, major], lang === 'zh' ? ' · ' : ', '), graduation(e, lang)),
              joinDot(f(e, 'major'), f(e, 'schoolLocation'), labelled(cvLabels(lang).gpa, f(e, 'gpa'), lang)),
              undefined,
              twin(name, index),
            ),
          )
        }
        break
      case 'workExperience':
        for (const { item: e, index } of indexedList(s, 'experiences')) {
          out.push(
            doc(
              f(e, 'jobTitle'),
              entryHref(index),
              joinDot(f(e, 'companyName'), entryRange(e, lang)),
              `${f(e, 'location')} ${f(e, 'jobDescription')} ${featureText(e)}`,
              bullets(e, 'relatedSkills').map(squash),
              twin(name, index),
            ),
          )
        }
        break
      case 'project':
        for (const { item: e, index } of indexedList(s, 'projectExperience')) {
          out.push(
            doc(
              f(e, 'title'),
              entryHref(index),
              joinDot(f(e, 'projectLocation'), entryRange(e, lang, { futureEndAsPresent: true })),
              `${f(e, 'description')} ${featureText(e)}`,
              undefined,
              twin(name, index),
            ),
          )
        }
        break
      case 'patents':
        for (const { item: e, index } of indexedList(s, 'patentExperience')) {
          out.push(
            doc(
              f(e, 'title'),
              entryHref(index),
              joinDot(f(e, 'organization'), labelled(cvLabels(lang).status, f(e, 'status'), lang), formatCvDate(field(e, 'date'), lang)),
              `${f(e, 'authority')} ${bullets(e, 'patents').join(' ')}`,
              undefined,
              twin(name, index),
            ),
          )
        }
        break
      case 'competitionAwards':
        for (const { item: e, index } of indexedList(s, 'awards')) {
          out.push(
            doc(
              f(e, 'contestName'),
              entryHref(index),
              joinDot(f(e, 'award'), f(e, 'organization'), formatCvDate(field(e, 'date'), lang)),
              `${f(e, 'location')} ${bullets(e, 'description').join(' ')}`,
              undefined,
              twin(name, index),
            ),
          )
        }
        break
      case 'certification':
        for (const { org, cert, index } of indexedCertificates(s)) {
          out.push(doc(f(cert, 'certificationName'), entryHref(index), joinDot(f(org, 'issuingOrganization'), formatCvDate(field(cert, 'issuedDate'), lang)), '', undefined, twin(name, index)))
        }
        break
      case 'skill': {
        const languages = list(s, 'languages')
        const levels = languages.map((l) => [f(l, 'language'), f(l, 'level')].filter(Boolean).join(sep)).filter(Boolean)
        if (levels.length) {
          out.push(doc(section, sectionHref, '', levels.join(' · '), languages.map((l) => f(l, 'language')).filter(Boolean), twin('skill.languages')))
        }
        list(s, 'technical').forEach((g, i) => {
          const items = bullets(g, 'description').map(squash)
          out.push(doc(f(g, 'name'), sectionHref, items.join(', '), '', items, twin('skill.technical', i)))
        })
        break
      }
      case 'extraSkill': {
        const points = bullets(s, 'points').map(squash)
        if (points.length) out.push(doc(section, sectionHref, '', points.join(' · '), undefined, twin(name)))
        break
      }
      case 'selfAssessment': {
        const body = [f(s, 'text'), ...bullets(s, 'points').map(squash)].filter(Boolean).join(' ')
        if (body) out.push(doc(section, sectionHref, '', body, undefined, twin(name)))
        break
      }
      default:
        break
    }
  }
  return out.filter((d): d is SearchDoc => !!d)
}

// ── Assembly ──────────────────────────────────────────────────────────────

const outlineCache = new Map<string, { headings: string[]; text: string }>()
const OUTLINE_CACHE_MAX = 200

/** outlineOf memoised per item version, so rebuilding the index stays cheap. */
function cachedOutline(key: string, body: string) {
  const hit = outlineCache.get(key)
  if (hit) return hit
  const value = outlineOf(body)
  outlineCache.set(key, value)
  while (outlineCache.size > OUTLINE_CACHE_MAX) outlineCache.delete(outlineCache.keys().next().value as string)
  return value
}

function articleDoc(
  kind: 'post' | 'work',
  entry: { permalink: string; lang: string; updatedAt: number | null; frontmatter: { title: string; description?: string } },
  body: string,
  tags: unknown,
): SearchDoc {
  const { headings, text } = cachedOutline(`${entry.permalink}@${entry.updatedAt ?? 0}:${body.length}`, body)
  const doc: SearchDoc = { kind, title: entry.frontmatter.title, href: entry.permalink, lang: entry.lang }
  if (entry.frontmatter.description) doc.description = entry.frontmatter.description
  const t = cleanList(tags).map(str)
  if (t.length) doc.tags = t
  if (headings.length) doc.headings = headings
  if (text) doc.body = text
  return doc
}

function pageDoc(name: 'now' | 'uses', fallbackTitle: string): SearchDoc {
  const page = getPage(name)
  const doc: SearchDoc = {
    kind: 'page',
    title: str(page?.frontmatter?.title) || fallbackTitle,
    href: `/${name}`,
    lang: detectContentLang({ lang: page?.frontmatter?.lang, title: page?.frontmatter?.title, body: page?.body || '' }),
  }
  const description = str(page?.frontmatter?.description)
  if (description) doc.description = description
  if (page?.body) {
    const { headings, text } = outlineOf(page.body)
    if (headings.length) doc.headings = headings
    if (text) doc.body = text
  }
  return doc
}

/**
 * The owner's bio on /about, linking to its section; null while it is empty
 * (the page then shows no bio, and an "About" result would only repeat the
 * navigation entry).
 */
function aboutDoc(name: 'about' | 'about-zh' = 'about'): SearchDoc | null {
  const page = getPage(name)
  if (!(page?.body || '').trim()) return null
  const fm = (page?.frontmatter || {}) as Record<string, unknown>
  const body = page?.body || ''
  const zh = name === 'about-zh'
  const doc: SearchDoc = {
    kind: 'page',
    title: str(fm.title) || (zh ? '关于' : 'About'),
    // The Chinese bio is on /zh/about (F3), which exists while it has text.
    href: zh ? '/zh/about#about-bio' : '/about#about-bio',
    // The bio's own language (frontmatter `lang`, else detected), as the page marks it.
    lang: detectContentLang({ lang: fm.lang || (zh ? 'zh-Hans' : undefined), body }),
  }
  const description = str(fm.description)
  if (description) doc.description = description
  const { headings, text } = outlineOf(body)
  if (headings.length) doc.headings = headings
  if (text) doc.body = text
  return doc
}

/** The public body of a post or case study (the one its page renders). */
export const bodyOf = (collection: 'blog' | 'work', slug: string): string => getItem(collection, slug)?.body || ''

/**
 * The owner's public names as lower-case words and CJK names, from the
 * CV-audience Personal Info (a name the owner hides is never shipped).
 * Questions drop them: "Does Lucian have patents?" → patents.
 */
export function subjectNames(): string[] {
  const names = readCvOwnerNames()
  const out = new Set<string>()
  for (const p of names.latin) for (const w of [...p.given, p.family]) if (w && w.length > 1) out.add(w)
  for (const c of names.cjk) if (c) out.add(c)
  return Array.from(out).slice(0, 12)
}

/** The whole public index (posts, case studies, /now, /uses, the /about and /zh/about bios, CV entries in both languages, papers). */
export function buildSearchIndex(): SearchIndex {
  const cv = readPublicCvData('cv')
  const aligned = cvAlignment(cv.en, cv.zh)
  const docs: SearchDoc[] = [
    ...listPosts().map((p) => articleDoc('post', p, bodyOf('blog', p.slug), p.frontmatter.tags)),
    ...listWorkInDisplayOrder().map((w) => articleDoc('work', w, bodyOf('work', w.slug), w.frontmatter.tech)),
    pageDoc('now', 'Now'),
    pageDoc('uses', 'Uses'),
    ...[aboutDoc('about'), aboutDoc('about-zh')].filter((d): d is SearchDoc => d !== null),
    ...cvSearchDocs(cv.en, 'en', aligned),
    ...cvSearchDocs(cv.zh, 'zh', aligned),
    ...publicationDocs(readPublicationsView(), cv.en),
  ]
  const home = readPublicHome() as { availability?: { bookingUrl?: unknown } } | null
  const bookingUrl = safeHref(home?.availability?.bookingUrl)
  let subject: string[] = []
  try {
    subject = subjectNames()
  } catch {
    /* questions keep the names as typed */
  }
  return {
    v: 2,
    ...(bookingUrl.startsWith('https://') ? { availability: { bookingUrl } } : {}),
    ...(subject.length ? { subject } : {}),
    docs,
  }
}

/**
 * What GET /api/search-index serves: buildSearchIndex() plus the "Ask"
 * passages (lib/askIndex.ts), built from the same public sources and docs.
 */
export async function buildSearchIndexWithPassages(): Promise<SearchIndex> {
  const index = buildSearchIndex()
  const { buildAskIndex } = await import('./askIndex')
  return { ...index, ask: await buildAskIndex(index.docs) }
}

// ── The served payload (built once per content version) ─────────────────

/** A built payload is reused for at most this long (a fallback: every save invalidates it at once). */
export const SEARCH_INDEX_TTL_MS = 10 * 60 * 1000

export type SearchIndexPayload = {
  /** The JSON body. */
  body: string
  /** Content generation it was built from (lib/searchIndexCache). */
  generation: number
  builtAt: number
  docs: number
  passages: number
}

type PayloadGlobal = typeof globalThis & {
  __searchIndexPayload?: SearchIndexPayload | null
  __searchIndexBuild?: { generation: number; promise: Promise<SearchIndexPayload> } | null
}

/**
 * The search index as GET /api/search-index serves it, built at most once
 * per content version: like an ISR page, it is rebuilt after a content or CV
 * save (lib/revalidate.ts calls invalidateSearchIndex), and at the latest
 * SEARCH_INDEX_TTL_MS after the previous build. Concurrent requests share
 * one build. Process-wide (globalThis), like the content store itself.
 */
export async function searchIndexPayload(now: number = Date.now()): Promise<SearchIndexPayload> {
  const g = globalThis as PayloadGlobal
  const generation = searchIndexGeneration()
  const hit = g.__searchIndexPayload
  if (hit && hit.generation === generation && now - hit.builtAt < SEARCH_INDEX_TTL_MS) return hit
  const running = g.__searchIndexBuild
  if (running && running.generation === generation) return running.promise
  const promise = (async () => {
    const index = await buildSearchIndexWithPassages()
    const body = JSON.stringify(index)
    const payload: SearchIndexPayload = {
      body,
      generation,
      builtAt: Date.now(),
      docs: index.docs.length,
      passages: index.ask?.passages.length ?? 0,
    }
    // A save that landed during the build has bumped the generation: the next request rebuilds.
    if (searchIndexGeneration() === generation) g.__searchIndexPayload = payload
    return payload
  })()
  g.__searchIndexBuild = { generation, promise }
  try {
    return await promise
  } finally {
    if (g.__searchIndexBuild?.promise === promise) g.__searchIndexBuild = null
  }
}
