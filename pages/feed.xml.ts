import type { GetServerSideProps } from 'next'
import { buildRssFeed } from '../lib/mdx'
import { SITE_URL } from '../lib/schema'

// Root-level RSS 2.0 feed (same document as /api/rss.xml) so feed readers
// that probe /feed.xml by convention find the writing feed without a hop.

const FeedXml = () => null

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  res.write(buildRssFeed(SITE_URL, `${SITE_URL}/feed.xml`))
  res.end()
  return { props: {} }
}

export default FeedXml
