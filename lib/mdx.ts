import crypto from 'crypto'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypePrettyCode from 'rehype-pretty-code'
import type { Root as HastRoot } from 'hast'
import { listItems, getItem, getPage } from './contentStore'
import { detectContentLang, readingMinutes, type TocEntry } from './toc'
import remarkStripMdxExpressions from './rehype/stripMdxExpressions'
import rehypeHeadings from './rehype/headings'
import rehypeImages, { type SizeResolver, type SrcSetResolver } from './rehype/images'
import rehypeLangSpans from './rehype/langSpans'
import { resolveImageSize } from './rehype/imageSize'
import { variantSrcSet } from './uploadVariants'
import { isElement, textOf, walk, type HastNode } from './rehype/hast'
import { clampAtBoundary } from './schema'

/**
 * MDX content loader (content store first, content/*.mdx as the seed — see
 * lib/contentStore.ts).
 *
 *   blog/{slug}   posts (editable via /admin/blog)
 *   work/{slug}   project case studies (editable via /admin/work)
 *   pages now/uses single pages
 *
 * Bodies are compiled on the server into a plain, JSON-serialisable hast
 * tree that the client renders with hast-util-to-jsx-runtime
 * (components/MDX/MDXContent.tsx). Nothing is ever evaluated: MDX
 * expressions / ESM are stripped and JSX is reduced to an allow-list with
 * literal attributes (lib/rehype/stripMdxExpressions.ts), so the CSP needs no
 * 'unsafe-eval'.
 *
 *   remark-parse → remark-mdx → remark-gfm → strip expressions / map JSX →
 *   remark-rehype → heading ids + TOC → image sizes / srcset / figures →
 *   language-of-parts spans → rehype-pretty-code → drop positions / data
 *
 * Slugs are restricted to [a-z0-9-_]+ before any lookup.
 */

export type { HastRoot }

/** One h2/h3 entry of an article outline (alias kept for the shared contract). */
export type TocItem = TocEntry

export type PostFrontmatter = {
  title: string
  /** Search-result title when it should differ from the on-page title (≤ 60 chars). */
  seoTitle?: string
  description?: string
  date: string
  updated?: string
  tags?: string[]
  draft?: boolean
  cover?: string
  coverAlt?: string
  /** BCP-47 language of the post (e.g. "zh-Hans"); detected when absent. */
  lang?: string
}

export type WorkFrontmatter = {
  title: string
  seoTitle?: string
  description?: string
  role?: string
  period?: string
  tech?: string[]
  featured?: boolean
  status?: 'live' | 'archived' | 'case-study'
  link?: string
  repo?: string
  cover?: string
  coverAlt?: string
  /** Unpublished case study: hidden everywhere except Draft Mode. Default published. */
  draft?: boolean
  /** BCP-47 language of the case study; detected when absent. */
  lang?: string
}

export type PageFrontmatter = {
  title: string
  description?: string
  updated?: string
  lang?: string
}

export type MDXIndexEntry<T> = {
  slug: string
  permalink: string
  readingMinutes: number
  /** Language of the piece (frontmatter `lang` or detected from title/body). */
  lang: string
  /** Last write to the content store, epoch ms; null when the store does not track it. */
  updatedAt: number | null
  frontmatter: T
}

export type MDXRendered<T> = MDXIndexEntry<T> & {
  /** Compiled body: plain hast, rendered by <MDXContent tree /> / <ArticleBody tree toc />. */
  tree: HastRoot
  /** h2/h3 outline of the body, ids identical to the rendered headings. */
  toc: TocEntry[]
  /** First paragraph as plain text (≤ 155 chars): the fallback meta description. */
  excerpt: string
}

export type GetOptions = {
  /** Draft Mode: also return unpublished items. */
  includeDrafts?: boolean
}

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/

// ── Compilation ───────────────────────────────────────────────────────────

/** A body that cannot be compiled; line/column point into the MDX source. */
export class MdxCompileError extends Error {
  readonly line?: number
  readonly column?: number
  readonly reason: string

  constructor(reason: string, line?: number, column?: number) {
    super(line ? `${reason} (line ${line}${column ? `, column ${column}` : ''})` : reason)
    this.name = 'MdxCompileError'
    this.reason = reason
    if (line) this.line = line
    if (column) this.column = column
  }
}

type VFileMessageLike = {
  reason?: unknown
  message?: unknown
  line?: unknown
  column?: unknown
  place?: { line?: unknown; column?: unknown; start?: { line?: unknown; column?: unknown } } | null
}

const posInt = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined)

function toCompileError(err: unknown): MdxCompileError {
  if (err instanceof MdxCompileError) return err
  const e = (err && typeof err === 'object' ? err : {}) as VFileMessageLike
  const reason = String(e.reason || e.message || err || 'Could not compile the MDX body').trim()
  const place = e.place || undefined
  const line = posInt(e.line) ?? posInt(place?.start?.line) ?? posInt(place?.line)
  const column = posInt(e.column) ?? posInt(place?.start?.column) ?? posInt(place?.column)
  return new MdxCompileError(reason, line, column)
}

export type CompileOptions = {
  /** Article language: drives the language-of-parts spans. Detected from the body when absent. */
  lang?: string
  /** Intrinsic image sizes (default: local files, uploads, R2 and remote headers). */
  resolveSize?: SizeResolver
  /** Responsive `srcset` for an image (default: upload variants). */
  srcSetFor?: SrcSetResolver
}

/** Remove positional info, plugin data and undefined properties: the tree becomes plain JSON. */
function toPlainTree(node: HastNode & { position?: unknown; data?: unknown }): void {
  delete node.position
  delete node.data
  if (node.properties) {
    for (const [k, v] of Object.entries(node.properties)) if (v === undefined || v === null) delete node.properties[k]
  }
  for (const child of node.children || []) toPlainTree(child)
}

/**
 * Compile an MDX body to a plain hast tree plus its h2/h3 outline.
 * Throws MdxCompileError (with line/column when known) on invalid MDX.
 */
export async function compileMdx(body: string, opts: CompileOptions = {}): Promise<{ tree: HastRoot; toc: TocItem[] }> {
  let toc: TocItem[] = []
  const lang = opts.lang || detectContentLang({ body })
  const processor = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkGfm)
    .use(remarkStripMdxExpressions)
    .use(remarkRehype)
    .use(rehypeHeadings, { onToc: (t: TocItem[]) => (toc = t) })
    .use(rehypeImages, {
      resolveSize: opts.resolveSize || resolveImageSize,
      srcSetFor: opts.srcSetFor || variantSrcSet,
    })
    .use(rehypeLangSpans, { lang })
    .use(rehypePrettyCode, { theme: { dark: 'github-dark-dimmed', light: 'github-light' }, keepBackground: false })
  let tree: HastRoot
  try {
    const mdast = processor.parse(String(body ?? ''))
    tree = (await processor.run(mdast)) as HastRoot
  } catch (err) {
    throw toCompileError(err)
  }
  toPlainTree(tree as unknown as HastNode)
  return { tree, toc }
}

/** Text of a node outside any links (a paragraph that is only a link is not prose). */
function textOutsideLinks(node: HastNode): string {
  if (node.type === 'text') return node.value ?? ''
  if (isElement(node, 'a')) return ''
  return (node.children || []).map(textOutsideLinks).join('')
}

/**
 * Plain text of the first real paragraph — not a caption, quote, list item
 * or a paragraph that is just a link — clamped to `max` chars at a boundary.
 */
export function excerptOf(tree: HastRoot, max = 155): string {
  let found = ''
  walk(tree as unknown as HastNode, (node, parent) => {
    if (found || !isElement(node, 'p')) return
    if (parent && isElement(parent, ['figure', 'blockquote', 'li', 'td', 'th'])) return
    const text = textOf(node).replace(/\s+/g, ' ').trim()
    const own = textOutsideLinks(node).replace(/\s+/g, ' ').trim()
    if (Array.from(text).length >= 20 && Array.from(own).length >= 10) found = text
  })
  return clampAtBoundary(found, max)
}

const COMPILE_CACHE_MAX = 64
const compileCache = new Map<string, Promise<{ tree: HastRoot; toc: TocItem[] }>>()

/**
 * compileMdx memoised by (body, lang) for the public pages, feeds and ISR
 * revalidations. Returned trees are shared: callers must not mutate them.
 */
export function compileMdxCached(body: string, lang: string): Promise<{ tree: HastRoot; toc: TocItem[] }> {
  const key = crypto.createHash('sha1').update(lang).update('\0').update(body).digest('hex')
  const hit = compileCache.get(key)
  if (hit) {
    compileCache.delete(key)
    compileCache.set(key, hit)
    return hit
  }
  const pending = compileMdx(body, { lang })
  compileCache.set(key, pending)
  pending.catch(() => compileCache.delete(key))
  while (compileCache.size > COMPILE_CACHE_MAX) compileCache.delete(compileCache.keys().next().value as string)
  return pending
}

// ── Frontmatter ───────────────────────────────────────────────────────────

const trimmed = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : undefined)

/** Trim the free-text fields every page prints (titles, descriptions). */
function cleanFrontmatter<T extends { title: string; description?: string; seoTitle?: string }>(fm: T, slug: string): T {
  const out = { ...fm, title: trimmed(fm.title) || slug }
  const description = trimmed(fm.description)
  if (description) out.description = description
  else delete out.description
  const seo = trimmed(fm.seoTitle)
  if (seo) out.seoTitle = seo.slice(0, 60)
  else delete out.seoTitle
  return out
}

function langOf(frontmatter: { lang?: unknown; title?: unknown }, body: string): string {
  return detectContentLang({ lang: frontmatter.lang, title: frontmatter.title, body })
}

async function render<T extends { title: string }>(
  entry: MDXIndexEntry<T>,
  body: string,
): Promise<MDXRendered<T>> {
  const { tree, toc } = await compileMdxCached(body, entry.lang)
  return { ...entry, tree, toc, excerpt: excerptOf(tree) }
}

// ── Posts (blog) ──────────────────────────────────────────────────────────
function postEntry(item: { slug: string; frontmatter: Record<string, any>; body: string; updated_at: number }): MDXIndexEntry<PostFrontmatter> {
  const fm = cleanFrontmatter(item.frontmatter as PostFrontmatter, item.slug)
  return {
    slug: item.slug,
    permalink: `/blog/${item.slug}`,
    readingMinutes: readingMinutes(item.body),
    lang: langOf(fm, item.body),
    updatedAt: item.updated_at,
    frontmatter: fm,
  }
}

/** Published posts, newest first (drafts never appear). */
export function listPosts(): MDXIndexEntry<PostFrontmatter>[] {
  return listItems('blog')
    .map(postEntry)
    .filter((p) => !p.frontmatter.draft)
    .sort((a, b) => +new Date(b.frontmatter.date) - +new Date(a.frontmatter.date))
}

export async function getPost(slug: string, opts: GetOptions = {}): Promise<MDXRendered<PostFrontmatter> | null> {
  if (!SLUG_RE.test(slug)) return null
  const item = getItem('blog', slug)
  if (!item) return null
  const entry = postEntry(item)
  if (entry.frontmatter.draft && !opts.includeDrafts) return null
  return render(entry, item.body)
}

// ── Work (case studies) ───────────────────────────────────────────────────
function workEntry(item: { slug: string; frontmatter: Record<string, any>; body: string; updated_at: number }): MDXIndexEntry<WorkFrontmatter> {
  const fm = cleanFrontmatter(item.frontmatter as WorkFrontmatter, item.slug)
  return {
    slug: item.slug,
    permalink: `/work/${item.slug}`,
    readingMinutes: readingMinutes(item.body),
    lang: langOf(fm, item.body),
    updatedAt: item.updated_at,
    frontmatter: fm,
  }
}

/** Published case studies in store order (drafts never appear). */
export function listWork(): MDXIndexEntry<WorkFrontmatter>[] {
  return listItems('work')
    .map(workEntry)
    .filter((w) => !w.frontmatter.draft)
}

/** Work entries in the order /work shows them: featured first, then the rest. */
export function listWorkInDisplayOrder(): MDXIndexEntry<WorkFrontmatter>[] {
  const all = listWork()
  return [...all.filter((w) => w.frontmatter.featured), ...all.filter((w) => !w.frontmatter.featured)]
}

export async function getWork(slug: string, opts: GetOptions = {}): Promise<MDXRendered<WorkFrontmatter> | null> {
  if (!SLUG_RE.test(slug)) return null
  const item = getItem('work', slug)
  if (!item) return null
  const entry = workEntry(item)
  if (entry.frontmatter.draft && !opts.includeDrafts) return null
  return render(entry, item.body)
}

// ── Static pages (now, uses, etc.) ────────────────────────────────────────
export async function getStaticMdxPage(name: 'now' | 'uses'): Promise<MDXRendered<PageFrontmatter> | null> {
  const page = getPage(name)
  if (!page) return null
  const fm = cleanFrontmatter(page.frontmatter as PageFrontmatter, name)
  return render(
    {
      slug: name,
      permalink: `/${name}`,
      readingMinutes: readingMinutes(page.body),
      lang: langOf(fm, page.body),
      updatedAt: null,
      frontmatter: fm,
    },
    page.body,
  )
}
