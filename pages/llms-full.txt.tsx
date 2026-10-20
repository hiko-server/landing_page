import type { GetServerSideProps } from 'next'
import { log } from '../lib/log'
import { MARKDOWN_CACHE_CONTROL } from '../lib/markdownTwinPaths'

/**
 * /llms-full.txt (G9): every published case study and post in full, as
 * their Markdown twins (lib/llms loadLlmsFullTxt). Same rules as /llms.txt:
 * public content only, built per request, five minutes at the edge, purged
 * on saves.
 */

const LlmsFullTxt = () => null

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  try {
    const { loadLlmsFullTxt } = await import('../lib/llms')
    const text = loadLlmsFullTxt()
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', MARKDOWN_CACHE_CONTROL)
    res.setHeader('X-Robots-Tag', 'noindex')
    res.end(text)
  } catch (err) {
    log.error('llms-full.txt failed', { err })
    res.statusCode = 503
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Temporarily unavailable\n')
  }
  return { props: {} }
}

export default LlmsFullTxt
