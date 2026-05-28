import type { NextApiRequest, NextApiResponse } from 'next'
import { listPosts } from '../../../lib/mdx'

/**
 * Public, cacheable list of published blog posts.
 * Returns just slug + title + date + readingMinutes — enough for the ⌘K
 * command palette and any future client-side index. Drafts are filtered out
 * upstream by lib/mdx.ts:listPosts().
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const items = listPosts().map((p) => ({
    slug: p.slug,
    title: p.frontmatter.title,
    date: p.frontmatter.date ? String(p.frontmatter.date).slice(0, 10) : null,
    readingMinutes: p.readingMinutes,
    permalink: p.permalink,
  }))
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  res.status(200).json({ items })
}
