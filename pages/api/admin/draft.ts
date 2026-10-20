import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'

/**
 * Draft Mode for previewing unpublished posts and case studies at their real
 * URL.
 *
 *   GET /api/admin/draft?path=/blog/<slug>|/work/<slug>
 *       → enables Draft Mode (Next's bypass cookie) and 307s to the page,
 *         which then renders drafts and skips the ISR cache.
 *   GET /api/admin/draft?disable=1&path=…
 *       → clears Draft Mode and 307s back to the page (or "/").
 *
 * Only these two path shapes are accepted (no open redirect). Admin-only:
 * the proxy gates /api/admin/*, and the session is checked here too.
 */

export const DRAFT_PATH_RE = /^\/(blog|work)\/[a-z0-9][a-z0-9-_]*$/

export default withApi('admin/draft', async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const rawPath = req.query.path
  const path = typeof rawPath === 'string' ? rawPath : undefined
  const disable = req.query.disable === '1'

  if (disable) {
    if (path !== undefined && !DRAFT_PATH_RE.test(path)) return res.status(400).json({ error: 'Invalid path' })
    res.setDraftMode({ enable: false })
    return res.redirect(307, path || '/')
  }

  if (!path || !DRAFT_PATH_RE.test(path)) return res.status(400).json({ error: 'Invalid path' })
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setDraftMode({ enable: true })
  return res.redirect(307, path)
})
