import { serialize } from 'next-mdx-remote/serialize'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'
import rehypePrettyCode from 'rehype-pretty-code'
import { listItems, getItem, getPage } from './contentStore'
import { detectContentLang, readingMinutes, type TocEntry } from './toc'
import rehypeHeadings from './rehype/headings'
import rehypeImages from './rehype/images'
import { localImageSize } from './rehype/imageSize'
import { isoDate } from './postDate'

/**
 * MDX content loader for the v6 site (content store first, content/*.mdx as
 * the seed — see lib/contentStore.ts).
 *
 *   blog/{slug}   posts (editable via /admin/blog)
 *   work/{slug}   project case studies (editable via /admin/work)
 *   pages now/uses single pages
 *
 * Bodies are serialised with next-mdx-remote. The rehype pipeline adds
 * heading ids + self-links and collects the table of contents
 * (lib/rehype/headings.ts), sizes / lazy-loads / captions images
 * (lib/rehype/images.ts) and highlights code (rehype-pretty-code).
 *
 * Slugs are restricted to [a-z0-9-_]+ before any lookup.
 */

export type PostFrontmatter = {
  title: string
  description?: string
  date: string
  updated?: string
  tags?: string[]
  draft?: boolean
  cover?: string
  /** BCP-47 language of the post (e.g. "zh-Hans"); detected when absent. */
  lang?: string
}

export type WorkFrontmatter = {
  title: string
  description?: string
  role?: string
  period?: string
  tech?: string[]
  featured?: boolean
  status?: 'live' | 'archived' | 'case-study'
  link?: string
  repo?: string
  cover?: string
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
  source: MDXRemoteSerializeResult
  /** h2/h3 outline of the body, ids identical to the rendered headings. */
  toc: TocEntry[]
}

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/

type MdxOptions = NonNullable<NonNullable<Parameters<typeof serialize>[1]>['mdxOptions']>
type RehypePlugins = NonNullable<MdxOptions['rehypePlugins']>

async function serializeMdx(raw: string): Promise<{ source: MDXRemoteSerializeResult; toc: TocEntry[] }> {
  let toc: TocEntry[] = []
  const rehypePlugins = [
    [rehypeHeadings, { onToc: (t: TocEntry[]) => (toc = t) }],
    [rehypeImages, { resolveSize: (src: string) => localImageSize(src) }],
    [
      rehypePrettyCode,
      {
        theme: { dark: 'github-dark-dimmed', light: 'github-light' },
        keepBackground: false,
      },
    ],
  ] as unknown as RehypePlugins
  const source = await serialize(raw, {
    mdxOptions: {
      // Force the production JSX runtime. Default is `development: true`
      // which compiles to `_jsxDEV(...)` calls — the client bundle doesn't
      // expose that symbol, so every MDX page crashed at hydrate with
      //   TypeError: _jsxDEV is not a function
      development: false,
      rehypePlugins,
    },
    parseFrontmatter: false,
  })
  return { source, toc }
}

function langOf(frontmatter: { lang?: unknown; title?: unknown }, body: string): string {
  return detectContentLang({ lang: frontmatter.lang, title: frontmatter.title, body })
}

// ── Posts (blog) ──────────────────────────────────────────────────────────
export function listPosts(): MDXIndexEntry<PostFrontmatter>[] {
  return listItems('blog')
    .map((item) => {
      const fm = item.frontmatter as PostFrontmatter
      return {
        slug: item.slug,
        permalink: `/blog/${item.slug}`,
        readingMinutes: readingMinutes(item.body),
        lang: langOf(fm, item.body),
        updatedAt: item.updated_at,
        frontmatter: fm,
      }
    })
    .filter((p) => !p.frontmatter.draft)
    .sort((a, b) => +new Date(b.frontmatter.date) - +new Date(a.frontmatter.date))
}

export async function getPost(slug: string): Promise<MDXRendered<PostFrontmatter> | null> {
  if (!SLUG_RE.test(slug)) return null
  const item = getItem('blog', slug)
  if (!item) return null
  const fm = item.frontmatter as PostFrontmatter
  if (fm.draft) return null
  const { source, toc } = await serializeMdx(item.body)
  return {
    slug,
    permalink: `/blog/${slug}`,
    readingMinutes: readingMinutes(item.body),
    lang: langOf(fm, item.body),
    updatedAt: item.updated_at,
    frontmatter: fm,
    source,
    toc,
  }
}

// ── Work (case studies) ───────────────────────────────────────────────────
export function listWork(): MDXIndexEntry<WorkFrontmatter>[] {
  return listItems('work').map((item) => {
    const fm = item.frontmatter as WorkFrontmatter
    return {
      slug: item.slug,
      permalink: `/work/${item.slug}`,
      readingMinutes: readingMinutes(item.body),
      lang: langOf(fm, item.body),
      updatedAt: item.updated_at,
      frontmatter: fm,
    }
  })
}

/** Work entries in the order /work shows them: featured first, then the rest. */
export function listWorkInDisplayOrder(): MDXIndexEntry<WorkFrontmatter>[] {
  const all = listWork()
  return [...all.filter((w) => w.frontmatter.featured), ...all.filter((w) => !w.frontmatter.featured)]
}

export async function getWork(slug: string): Promise<MDXRendered<WorkFrontmatter> | null> {
  if (!SLUG_RE.test(slug)) return null
  const item = getItem('work', slug)
  if (!item) return null
  const fm = item.frontmatter as WorkFrontmatter
  const { source, toc } = await serializeMdx(item.body)
  return {
    slug,
    permalink: `/work/${slug}`,
    readingMinutes: readingMinutes(item.body),
    lang: langOf(fm, item.body),
    updatedAt: item.updated_at,
    frontmatter: fm,
    source,
    toc,
  }
}

// ── Static pages (now, uses, etc.) ────────────────────────────────────────
export async function getStaticMdxPage(name: 'now' | 'uses'): Promise<MDXRendered<PageFrontmatter> | null> {
  const page = getPage(name)
  if (!page) return null
  const fm = page.frontmatter as PageFrontmatter
  const { source, toc } = await serializeMdx(page.body)
  return {
    slug: name,
    permalink: `/${name}`,
    readingMinutes: readingMinutes(page.body),
    lang: langOf(fm, page.body),
    updatedAt: null,
    frontmatter: fm,
    source,
    toc,
  }
}

// ── RSS ───────────────────────────────────────────────────────────────────
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function rfc822(value: unknown): string {
  const iso = isoDate(value)
  return iso ? new Date(`${iso}T00:00:00Z`).toUTCString() : ''
}

/**
 * RSS 2.0 document for the blog, shared by /feed.xml and /api/rss.xml.
 * `selfUrl` is the absolute URL the feed is served from (atom:link rel=self).
 */
export function buildRssFeed(site: string, selfUrl: string): string {
  const posts = listPosts()
  const items = posts
    .map((p) => {
      const fm = p.frontmatter
      const url = `${site}${p.permalink}`
      const pub = rfc822(fm.date)
      return `
    <item>
      <title>${xmlEscape(String(fm.title || p.slug))}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>${pub ? `\n      <pubDate>${pub}</pubDate>` : ''}${
        fm.description ? `\n      <description>${xmlEscape(String(fm.description))}</description>` : ''
      }${(fm.tags || []).map((t) => `\n      <category>${xmlEscape(String(t))}</category>`).join('')}
    </item>`
    })
    .join('')
  const newest = posts
    .map((p) => isoDate(p.frontmatter.updated || p.frontmatter.date))
    .filter(Boolean)
    .sort()
    .pop()
  const lastBuild = newest ? new Date(`${newest}T00:00:00Z`).toUTCString() : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(new URL(site).host.toUpperCase())} — Writing</title>
    <link>${xmlEscape(`${site}/blog`)}</link>
    <atom:link href="${xmlEscape(selfUrl)}" rel="self" type="application/rss+xml" />
    <description>Engineering essays, ML notes, and write-ups by Li Yanpei.</description>
    <language>en</language>${lastBuild ? `\n    <lastBuildDate>${lastBuild}</lastBuildDate>` : ''}${items}
  </channel>
</rss>`
}
