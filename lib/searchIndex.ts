import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import { listPosts, listWorkInDisplayOrder } from './mdx'
import { getItem, getPage } from './contentStore'
import { readPublicCvData } from './cvdata'
import { readPublicHome } from './home'
import { cleanList, formatCvDate, formatCvRange, safeHref } from './cvFormat'
import {
  bullets,
  cvEntryAnchor,
  cvSectionAnchor,
  entries,
  field,
  indexedCertificates,
  indexedList,
  list,
} from '../components/CVViewerPage/fields'
import { readableText } from './toc'
import type { CvSectionLike } from './cvVisibility'

/**
 * The public search index behind ⌘K (GET /api/search-index):
 *
 *   posts / case studies  frontmatter, h2/h3 headings and the first 4,000
 *                         characters of body text (code excluded)
 *   /now, /uses           page bodies
 *   CV                    one doc per entry of the PUBLIC A4 CV — the
 *                         audience /cv renders (readPublicCvData('cv'):
 *                         hidden sections, entries and fields are already
 *                         gone), EN only, linking to the anchors /cv
 *                         renders: `/cv#cv-<section>-<i>` for entries,
 *                         `/cv#cv-<section>` for skill groups
 *
 * Contact details are never indexed. Drafts never appear (listPosts /
 * listWork exclude them).
 */

export type SearchDoc = {
  kind: 'post' | 'work' | 'page' | 'cv'
  title: string
  href: string
  description?: string
  tags?: string[]
  headings?: string[]
  body?: string
  lang?: string
}

export type SearchIndex = {
  v: 1
  availability?: { bookingUrl?: string }
  docs: SearchDoc[]
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
  return { headings, text: clampChars(squash(mdText(tree)), BODY_MAX_CHARS) }
}

const str = (v: unknown): string => (typeof v === 'string' ? squash(v) : '')
const joinDot = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(' · ')
const range = (start: string, end: string) => formatCvRange(start, end, 'en', { futureEndAsPresent: true })

/** A string field of a public CV node ('' when redacted by the owner), whitespace squashed. */
const f = (node: unknown, key: string): string => squash(field(node, key))

function featureText(entry: unknown): string {
  return list(entry, 'features')
    .map((feat) => [f(feat, 'description'), ...bullets(feat, 'furtherExplanation').map(squash)].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' ')
}

function cvDoc(title: string, href: string, description: string, body: string, tags?: string[]): SearchDoc | null {
  if (!title) return null
  const doc: SearchDoc = { kind: 'cv', title, href, lang: 'en' }
  if (description) doc.description = description
  const b = clampChars(squash(body), BODY_MAX_CHARS)
  if (b) doc.body = b
  if (tags && tags.length) doc.tags = tags
  return doc
}

const sectionHref = (sessionName: string) => `/cv#${cvSectionAnchor(sessionName)}`
const entryHref = (sessionName: string, index: number) => `/cv#${cvEntryAnchor(sessionName, index)}`

/**
 * One search doc per entry of the PUBLIC (already pruned) EN sections of the
 * A4 CV (readPublicCvData('cv'), the audience /cv renders). Anchors are
 * computed with the same helpers the sheet and the Reading view use
 * (components/CVViewerPage/fields): the entry index is its position in the
 * visible list (`indexedList`), certificates are numbered across all visible
 * issuers in order (`indexedCertificates`). Entries without a title get no
 * doc, but still count towards the index, exactly as on the page.
 */
export function cvSearchDocs(sections: readonly CvSectionLike[] | null | undefined): SearchDoc[] {
  const out: (SearchDoc | null)[] = []
  for (const s of entries(Array.isArray(sections) ? sections : [])) {
    const name = String(s?.sessionName || '')
    switch (name) {
      case 'education':
        for (const { item: e, index } of indexedList(s, 'educationExperience')) {
          out.push(
            cvDoc(
              f(e, 'schoolName'),
              entryHref(name, index),
              joinDot(f(e, 'degree'), range(field(e, 'startDate'), field(e, 'endDate'))),
              joinDot(f(e, 'major'), f(e, 'schoolLocation')),
            ),
          )
        }
        break
      case 'workExperience':
        for (const { item: e, index } of indexedList(s, 'experiences')) {
          out.push(
            cvDoc(
              f(e, 'jobTitle'),
              entryHref(name, index),
              joinDot(f(e, 'companyName'), range(field(e, 'startDate'), field(e, 'endDate'))),
              `${f(e, 'jobDescription')} ${featureText(e)}`,
              bullets(e, 'relatedSkills').map(squash),
            ),
          )
        }
        break
      case 'project':
        for (const { item: e, index } of indexedList(s, 'projectExperience')) {
          out.push(
            cvDoc(
              f(e, 'title'),
              entryHref(name, index),
              joinDot(f(e, 'projectLocation'), range(field(e, 'startDate'), field(e, 'endDate'))),
              `${f(e, 'description')} ${featureText(e)}`,
            ),
          )
        }
        break
      case 'patents':
        for (const { item: e, index } of indexedList(s, 'patentExperience')) {
          out.push(
            cvDoc(
              f(e, 'title'),
              entryHref(name, index),
              joinDot(f(e, 'organization'), f(e, 'status'), formatCvDate(field(e, 'date'))),
              bullets(e, 'patents').join(' '),
            ),
          )
        }
        break
      case 'competitionAwards':
        for (const { item: e, index } of indexedList(s, 'awards')) {
          out.push(
            cvDoc(
              f(e, 'contestName'),
              entryHref(name, index),
              joinDot(f(e, 'award'), f(e, 'organization'), formatCvDate(field(e, 'date'))),
              bullets(e, 'description').join(' '),
            ),
          )
        }
        break
      case 'certification':
        for (const { org, cert, index } of indexedCertificates(s)) {
          out.push(
            cvDoc(
              f(cert, 'certificationName'),
              entryHref(name, index),
              joinDot(f(org, 'issuingOrganization'), formatCvDate(field(cert, 'issuedDate'))),
              '',
            ),
          )
        }
        break
      case 'skill':
        for (const g of list(s, 'technical')) {
          const items = bullets(g, 'description').map(squash)
          out.push(cvDoc(f(g, 'name'), sectionHref(name), items.join(', '), '', items))
        }
        break
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
  const doc: SearchDoc = { kind: 'page', title: str(page?.frontmatter?.title) || fallbackTitle, href: `/${name}`, lang: 'en' }
  const description = str(page?.frontmatter?.description)
  if (description) doc.description = description
  if (page?.body) {
    const { headings, text } = outlineOf(page.body)
    if (headings.length) doc.headings = headings
    if (text) doc.body = text
  }
  return doc
}

const bodyOf = (collection: 'blog' | 'work', slug: string): string => getItem(collection, slug)?.body || ''

/** The whole public index (posts, case studies, /now, /uses, CV entries). */
export function buildSearchIndex(): SearchIndex {
  const docs: SearchDoc[] = [
    ...listPosts().map((p) => articleDoc('post', p, bodyOf('blog', p.slug), p.frontmatter.tags)),
    ...listWorkInDisplayOrder().map((w) => articleDoc('work', w, bodyOf('work', w.slug), w.frontmatter.tech)),
    pageDoc('now', 'Now'),
    pageDoc('uses', 'Uses'),
    ...cvSearchDocs(readPublicCvData('cv').en),
  ]
  const home = readPublicHome() as { availability?: { bookingUrl?: unknown } } | null
  const bookingUrl = safeHref(home?.availability?.bookingUrl)
  return {
    v: 1,
    ...(bookingUrl.startsWith('https://') ? { availability: { bookingUrl } } : {}),
    docs,
  }
}
