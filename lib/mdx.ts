import readingTime from 'reading-time'
import { serialize } from 'next-mdx-remote/serialize'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'
import rehypePrettyCode from 'rehype-pretty-code'
import { listItems, getItem, getPage } from './contentStore'

/**
 * File-based MDX content loader for the v6 site.
 *
 * Conventions:
 *   content/blog/{slug}.mdx        — blog posts (also editable via /admin/blog)
 *   content/work/{slug}.mdx        — project case studies (also editable via /admin/work)
 *   content/now.mdx                — current focus (single file)
 *   content/uses.mdx               — tools & setup (single file)
 *
 * Frontmatter (see types below) is parsed with gray-matter; body is serialized
 * via next-mdx-remote so the rendered output is a plain serialised string
 * (works in both Pages Router and Edge runtimes).
 *
 * All paths are sanitised — slugs are restricted to [a-z0-9-_]+ before
 * touching the filesystem. Files outside content/ cannot be addressed.
 */

export type PostFrontmatter = {
  title: string
  description?: string
  date: string
  updated?: string
  tags?: string[]
  draft?: boolean
  cover?: string
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
}

export type PageFrontmatter = {
  title: string
  description?: string
  updated?: string
}

export type MDXIndexEntry<T> = {
  slug: string
  permalink: string
  readingMinutes: number
  frontmatter: T
}

export type MDXRendered<T> = MDXIndexEntry<T> & {
  source: MDXRemoteSerializeResult
}

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/

async function serializeMdx(raw: string) {
  return serialize(raw, {
    mdxOptions: {
      // Force the production JSX runtime. Default is `development: true`
      // which compiles to `_jsxDEV(...)` calls — Next 13.5's client bundle
      // doesn't expose that symbol, so /now, /uses, /blog/[slug] and
      // /work/[slug] all crashed at hydrate with
      //   TypeError: _jsxDEV is not a function
      development: false,
      rehypePlugins: [
        [
          rehypePrettyCode,
          {
            theme: { dark: 'github-dark-dimmed', light: 'github-light' },
            keepBackground: false,
          } as any,
        ],
      ],
    },
    parseFrontmatter: false,
  })
}

// ── Posts (blog) ──────────────────────────────────────────────────────────
export function listPosts(): MDXIndexEntry<PostFrontmatter>[] {
  return listItems('blog')
    .map((item) => {
      const fm = item.frontmatter as PostFrontmatter
      return {
        slug: item.slug,
        permalink: `/blog/${item.slug}`,
        readingMinutes: Math.max(1, Math.round(readingTime(item.body).minutes)),
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
  return {
    slug,
    permalink: `/blog/${slug}`,
    readingMinutes: Math.max(1, Math.round(readingTime(item.body).minutes)),
    frontmatter: fm,
    source: await serializeMdx(item.body),
  }
}

// ── Work (case studies) ───────────────────────────────────────────────────
export function listWork(): MDXIndexEntry<WorkFrontmatter>[] {
  return listItems('work').map((item) => ({
    slug: item.slug,
    permalink: `/work/${item.slug}`,
    readingMinutes: Math.max(1, Math.round(readingTime(item.body).minutes)),
    frontmatter: item.frontmatter as WorkFrontmatter,
  }))
}

export async function getWork(slug: string): Promise<MDXRendered<WorkFrontmatter> | null> {
  if (!SLUG_RE.test(slug)) return null
  const item = getItem('work', slug)
  if (!item) return null
  return {
    slug,
    permalink: `/work/${slug}`,
    readingMinutes: Math.max(1, Math.round(readingTime(item.body).minutes)),
    frontmatter: item.frontmatter as WorkFrontmatter,
    source: await serializeMdx(item.body),
  }
}

// ── Static pages (now, uses, etc.) ────────────────────────────────────────
export async function getStaticMdxPage(name: 'now' | 'uses'): Promise<MDXRendered<PageFrontmatter> | null> {
  const page = getPage(name)
  if (!page) return null
  return {
    slug: name,
    permalink: `/${name}`,
    readingMinutes: Math.max(1, Math.round(readingTime(page.body).minutes)),
    frontmatter: page.frontmatter as PageFrontmatter,
    source: await serializeMdx(page.body),
  }
}
