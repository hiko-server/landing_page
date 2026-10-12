import type { NextApiRequest, NextApiResponse } from 'next'
import { listPosts } from '../../../lib/mdx'

/**
 * Public, cacheable list of published blog posts — enough for the ⌘K
 * command palette (title, description and tags feed its fuzzy search).
 * Drafts are filtered out upstream by lib/mdx.ts:listPosts().
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const items = listPosts().map((p) => ({
    slug: p.slug,
    title: p.frontmatter.title,
    description: p.frontmatter.description || null,
    tags: Array.isArray(p.frontmatter.tags) ? p.frontmatter.tags : [],
    date: p.frontmatter.date ? String(p.frontmatter.date).slice(0, 10) : null,
    readingMinutes: p.readingMinutes,
    lang: p.lang,
    permalink: p.permalink,
  }))
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  res.status(200).json({ items })
}
