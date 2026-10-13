import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { isPageName } from '../../../lib/mdx-admin'
import { referenceMonth } from '../../../lib/clock'
import { buildNowSignals, signalSources, signalsToMarkdown, type PageSignals } from '../../../lib/nowMarkdown'

/**
 * GET /api/admin/page-derived?name=now|uses — what visitors see on /now or
 * /uses while the page has no body of its own:
 *
 *   { name, signals, sources: string[], markdown }
 *
 * Built only from public data (the website view of the CV, the public home
 * document, published posts / case studies, the curated stack), so "Start
 * from this" in the editor can never copy hidden CV content into the page.
 * Each source is optional: one that fails to load is simply left out.
 */
export default withApi('admin/page-derived', async (req, res, ctx) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const name = req.query.name
  if (!isPageName(name)) return res.status(400).json({ error: 'name must be "now" or "uses"' })

  const attempt = async <T>(what: string, fn: () => T | Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      ctx.log.warn('page-derived source failed', { what, err })
      return fallback
    }
  }

  let signals: PageSignals
  if (name === 'uses') {
    const groups = await attempt('stack', async () => (await import('../../../lib/stack')).readStack().groups, [])
    signals = { name: 'uses', groups }
    return res.status(200).json({ name, signals, sources: signalSources(signals), markdown: signalsToMarkdown('uses', signals) })
  }

  const cvWebsiteEn = await attempt(
    'cv',
    async () =>
      (await import('../../../lib/cvdata')).readPublicCvSections('website', ['workExperience', 'education', 'project'], ['en']).en,
    [],
  )
  const manualCoding = await attempt('home', async () => (await import('../../../lib/home')).readPublicHome()?.hero?.currentlyCoding ?? null, null)
  const mdx = await attempt('mdx', async () => await import('../../../lib/mdx'), null)
  const posts = mdx ? await attempt('posts', () => mdx.listPosts(), []) : []
  const work = mdx ? await attempt('work', () => mdx.listWork(), []) : []
  const now = buildNowSignals({ cvWebsiteEn, manualCoding, posts, work, now: referenceMonth(new Date()) })
  signals = { name: 'now', ...now }
  return res.status(200).json({ name, signals, sources: signalSources(signals), markdown: signalsToMarkdown('now', now) })
})
