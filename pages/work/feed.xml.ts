import type { GetServerSideProps } from 'next'
import { buildWorkRss } from '../../lib/feedHtml'
import { SITE_URL } from '../../lib/schema'
import { FEED_CACHE_CONTROL } from '../../lib/feeds'
import { log } from '../../lib/log'

// RSS 2.0 feed of the published case studies, full content per item.

const WorkFeedXml = () => null

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  try {
    const xml = await buildWorkRss(SITE_URL, `${SITE_URL}/work/feed.xml`)
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', FEED_CACHE_CONTROL)
    res.end(xml)
  } catch (err) {
    log.error('work/feed.xml failed', { err })
    res.statusCode = 503
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Feed temporarily unavailable')
  }
  return { props: {} }
}

export default WorkFeedXml
