import type { NextApiRequest, NextApiResponse } from 'next'
import { listWork } from '../../../lib/mdx'

/**
 * Public list of project case studies for the ⌘K palette / index reuse.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const items = listWork().map((w) => ({
    slug: w.slug,
    title: w.frontmatter.title,
    status: w.frontmatter.status || 'case-study',
    featured: w.frontmatter.featured || false,
    permalink: w.permalink,
  }))
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  res.status(200).json({ items })
}
