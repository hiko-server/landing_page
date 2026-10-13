import type { GetServerSideProps } from 'next'
import { buildBlogRss } from '../lib/feedHtml'
import { SITE_URL } from '../lib/schema'
import { FEED_CACHE_CONTROL } from '../lib/feeds'
import { log } from '../lib/log'

// Root-level RSS 2.0 feed (same document as /api/rss.xml) so feed readers
// that probe /feed.xml by convention find the writing feed without a hop.
// Full content per item (content:encoded); see lib/feedHtml.ts.

const FeedXml = () => null

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  try {
    const xml = await buildBlogRss(SITE_URL, `${SITE_URL}/feed.xml`)
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', FEED_CACHE_CONTROL)
    res.end(xml)
  } catch (err) {
    log.error('feed.xml failed', { err })
    res.statusCode = 503
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Feed temporarily unavailable')
  }
  return { props: {} }
}

export default FeedXml
