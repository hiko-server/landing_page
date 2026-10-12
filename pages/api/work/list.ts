import type { NextApiRequest, NextApiResponse } from 'next'
import { listWorkInDisplayOrder } from '../../../lib/mdx'

/**
 * Public list of project case studies (in /work display order) for the ⌘K
 * palette and index reuse.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const items = listWorkInDisplayOrder().map((w) => ({
    slug: w.slug,
    title: w.frontmatter.title,
    description: w.frontmatter.description || null,
    tech: Array.isArray(w.frontmatter.tech) ? w.frontmatter.tech : [],
    status: w.frontmatter.status || 'case-study',
    featured: w.frontmatter.featured || false,
    lang: w.lang,
    permalink: w.permalink,
  }))
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  res.status(200).json({ items })
}
