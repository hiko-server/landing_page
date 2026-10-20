import type { GetServerSideProps } from 'next'
import { log } from '../lib/log'
import { MARKDOWN_CACHE_CONTROL } from '../lib/markdownTwinPaths'

/**
 * /llms.txt (llmstxt.org, G9): whose site this is, a summary, and links to
 * the CV and to the Markdown twin of every published case study and post
 * (lib/markdownTwin buildLlmsTxt, loaded by lib/llms). Public content only,
 * no contact details; robots.txt is unchanged. Built per request like the
 * sitemap, kept five minutes at the edge and purged whenever what it lists
 * changes — posts, case studies, /now, /uses, the CV, /publications
 * (lib/revalidate derivedPurgePaths).
 */

const LlmsTxt = () => null

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  try {
    const { loadLlmsTxt } = await import('../lib/llms')
    const text = await loadLlmsTxt()
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', MARKDOWN_CACHE_CONTROL)
    res.setHeader('X-Robots-Tag', 'noindex')
    res.end(text)
  } catch (err) {
    log.error('llms.txt failed', { err })
    res.statusCode = 503
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Temporarily unavailable\n')
  }
  return { props: {} }
}

export default LlmsTxt
