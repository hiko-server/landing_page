import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import readingTime from 'reading-time'
import { serialize } from 'next-mdx-remote/serialize'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'
import rehypePrettyCode from 'rehype-pretty-code'

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

const CONTENT_DIR = path.join(process.cwd(), 'content')

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

function safeJoin(dir: string, file: string): string | null {
  const resolved = path.resolve(dir, file)
  if (!resolved.startsWith(path.resolve(dir))) return null
  return resolved
}

function listMdxFiles(subdir: string): string[] {
  const dir = path.join(CONTENT_DIR, subdir)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    .filter((f) => !f.startsWith('.'))
}

function readRaw(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

async function serializeMdx(raw: string) {
  return serialize(raw, {
    mdxOptions: {
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
  return listMdxFiles('blog')
    .map((file) => {
      const slug = file.replace(/\.(mdx|md)$/, '')
      const raw = readRaw(path.join(CONTENT_DIR, 'blog', file))
      if (!raw) return null
      const { data, content } = matter(raw)
      const fm = data as PostFrontmatter
      return {
        slug,
        permalink: `/blog/${slug}`,
        readingMinutes: Math.max(1, Math.round(readingTime(content).minutes)),
        frontmatter: fm,
      }
    })
    .filter((p): p is MDXIndexEntry<PostFrontmatter> => p !== null && !p.frontmatter.draft)
    .sort((a, b) => +new Date(b.frontmatter.date) - +new Date(a.frontmatter.date))
}

export async function getPost(slug: string): Promise<MDXRendered<PostFrontmatter> | null> {
  if (!SLUG_RE.test(slug)) return null
  const filePath = safeJoin(path.join(CONTENT_DIR, 'blog'), `${slug}.mdx`)
  if (!filePath) return null
  const raw = readRaw(filePath)
  if (!raw) return null
  const { data, content } = matter(raw)
  const fm = data as PostFrontmatter
  if (fm.draft) return null
  return {
    slug,
    permalink: `/blog/${slug}`,
    readingMinutes: Math.max(1, Math.round(readingTime(content).minutes)),
    frontmatter: fm,
    source: await serializeMdx(content),
  }
}

// ── Work (case studies) ───────────────────────────────────────────────────
export function listWork(): MDXIndexEntry<WorkFrontmatter>[] {
  return listMdxFiles('work')
    .map((file) => {
      const slug = file.replace(/\.(mdx|md)$/, '')
      const raw = readRaw(path.join(CONTENT_DIR, 'work', file))
      if (!raw) return null
      const { data, content } = matter(raw)
      return {
        slug,
        permalink: `/work/${slug}`,
        readingMinutes: Math.max(1, Math.round(readingTime(content).minutes)),
        frontmatter: data as WorkFrontmatter,
      }
    })
    .filter((p): p is MDXIndexEntry<WorkFrontmatter> => p !== null)
}

export async function getWork(slug: string): Promise<MDXRendered<WorkFrontmatter> | null> {
  if (!SLUG_RE.test(slug)) return null
  const filePath = safeJoin(path.join(CONTENT_DIR, 'work'), `${slug}.mdx`)
  if (!filePath) return null
  const raw = readRaw(filePath)
  if (!raw) return null
  const { data, content } = matter(raw)
  return {
    slug,
    permalink: `/work/${slug}`,
    readingMinutes: Math.max(1, Math.round(readingTime(content).minutes)),
    frontmatter: data as WorkFrontmatter,
    source: await serializeMdx(content),
  }
}

// ── Static pages (now, uses, etc.) ────────────────────────────────────────
export async function getStaticMdxPage(name: 'now' | 'uses'): Promise<MDXRendered<PageFrontmatter> | null> {
  const filePath = path.join(CONTENT_DIR, `${name}.mdx`)
  const raw = readRaw(filePath)
  if (!raw) return null
  const { data, content } = matter(raw)
  return {
    slug: name,
    permalink: `/${name}`,
    readingMinutes: Math.max(1, Math.round(readingTime(content).minutes)),
    frontmatter: data as PageFrontmatter,
    source: await serializeMdx(content),
  }
}
