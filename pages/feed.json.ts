import type { GetServerSideProps } from 'next'
import { blogFeedItems, buildJsonFeed } from '../lib/feedHtml'
import { SITE_URL } from '../lib/schema'
import { FEED_CACHE_CONTROL } from '../lib/feeds'
import { log } from '../lib/log'

// JSON Feed 1.1 (https://jsonfeed.org/version/1.1) for the blog: the same
// published posts and full content as /feed.xml.

const FeedJson = () => null

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  try {
    const feed = buildJsonFeed(SITE_URL, await blogFeedItems(SITE_URL))
    res.setHeader('Content-Type', 'application/feed+json; charset=utf-8')
    res.setHeader('Cache-Control', FEED_CACHE_CONTROL)
    res.end(JSON.stringify(feed))
  } catch (err) {
    log.error('feed.json failed', { err })
    res.statusCode = 503
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Feed temporarily unavailable')
  }
  return { props: {} }
}

export default FeedJson
