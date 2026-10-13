import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import { listPosts, listWorkInDisplayOrder } from './mdx'
import { getItem, getPage } from './contentStore'
import { readPublicCvData } from './cvdata'
import { readPublicHome } from './home'
import { cleanList, formatCvDate, formatCvRange, safeHref } from './cvFormat'
import { readableText } from './toc'
import type { CvSectionLike } from './cvVisibility'

/**
 * The public search index behind ⌘K (GET /api/search-index):
 *
 *   posts / case studies  frontmatter, h2/h3 headings and the first 4,000
 *                         characters of body text (code excluded)
 *   /now, /uses           page bodies
 *   CV                    one doc per entry of the PUBLIC website CV
 *                         (readPublicCvData('website'): hidden sections,
 *                         entries and fields are already gone), EN only,
 *                         linking to the entry anchor `/cv#cv-<section>-<i>`
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
const range = (start: unknown, end: unknown) => formatCvRange(start, end, 'en', { futureEndAsPresent: true })

function featureText(features: unknown): string {
  if (!Array.isArray(features)) return ''
  return features
    .map((f: any) => [str(f?.description), ...cleanList(f?.furtherExplanation).map(str)].filter(Boolean).join(' '))
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

/** One search doc per entry of the PUBLIC (already pruned) EN CV sections. */
export function cvSearchDocs(sections: readonly CvSectionLike[] | null | undefined): SearchDoc[] {
  const out: (SearchDoc | null)[] = []
  const anchor = (section: string, i?: number) => `/cv#cv-${section}${i === undefined ? '' : `-${i}`}`
  for (const s of Array.isArray(sections) ? sections : []) {
    const name = String(s?.sessionName || '')
    const list = (key: string): any[] => (Array.isArray(s?.[key]) ? s[key] : [])
    switch (name) {
      case 'education':
        list('educationExperience').forEach((e, i) =>
          out.push(cvDoc(str(e?.schoolName), anchor(name, i), joinDot(e?.degree, range(e?.startDate, e?.endDate)), joinDot(e?.major, e?.schoolLocation))),
        )
        break
      case 'workExperience':
        list('experiences').forEach((e, i) =>
          out.push(
            cvDoc(
              str(e?.jobTitle),
              anchor(name, i),
              joinDot(e?.companyName, range(e?.startDate, e?.endDate)),
              `${str(e?.jobDescription)} ${featureText(e?.features)}`,
              cleanList(e?.relatedSkills).map(str),
            ),
          ),
        )
        break
      case 'project':
        list('projectExperience').forEach((e, i) =>
          out.push(cvDoc(str(e?.title), anchor(name, i), joinDot(e?.projectLocation, range(e?.startDate, e?.endDate)), `${str(e?.description)} ${featureText(e?.features)}`)),
        )
        break
      case 'patents':
        list('patentExperience').forEach((e, i) =>
          out.push(cvDoc(str(e?.title), anchor(name, i), joinDot(e?.organization, e?.status, formatCvDate(e?.date)), cleanList(e?.patents).join(' '))),
        )
        break
      case 'competitionAwards':
        list('awards').forEach((e, i) =>
          out.push(cvDoc(str(e?.contestName), anchor(name, i), joinDot(e?.award, e?.organization, formatCvDate(e?.date)), cleanList(e?.description).join(' '))),
        )
        break
      case 'certification':
        list('certifications').forEach((issuer, i) => {
          const certs = Array.isArray(issuer?.CertificationList) ? issuer.CertificationList : []
          for (const c of certs) {
            out.push(cvDoc(str(c?.certificationName), anchor(name, i), joinDot(issuer?.issuingOrganization, formatCvDate(c?.issuedDate)), ''))
          }
        })
        break
      case 'skill':
        list('technical').forEach((g) => {
          const items = cleanList(g?.description).map(str)
          out.push(cvDoc(str(g?.name), anchor(name), items.join(', '), '', items))
        })
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
    ...cvSearchDocs(readPublicCvData('website').en),
  ]
  const home = readPublicHome() as { availability?: { bookingUrl?: unknown } } | null
  const bookingUrl = safeHref(home?.availability?.bookingUrl)
  return {
    v: 1,
    ...(bookingUrl.startsWith('https://') ? { availability: { bookingUrl } } : {}),
    docs,
  }
}
