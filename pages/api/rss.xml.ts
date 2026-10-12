import type { NextApiRequest, NextApiResponse } from 'next'
import { buildRssFeed } from '../../lib/mdx'
import { SITE_URL } from '../../lib/schema'

/**
 * RSS 2.0 feed for the blog at /api/rss.xml (same document as /feed.xml);
 * cached for 5 minutes. Escaping lives in lib/mdx.ts:buildRssFeed.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  res.status(200).send(buildRssFeed(SITE_URL, `${SITE_URL}/api/rss.xml`))
}
