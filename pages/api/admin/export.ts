import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import { emitEditorialEvent } from '../../../lib/editorialEvents'

/**
 * GET /api/admin/export → the content export (H16): a .zip of every post,
 * case study and single page as MDX with YAML frontmatter, unpublished
 * changes, the CV and home documents as JSON, the redirects and the list of
 * images (lib/contentExport). Admin-only (middleware gate plus the session
 * check here), built on request, never cached, rate-limited.
 */
export default withApi('admin/export', async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const rl = rateLimit(req, 10, 10 * 60 * 1000, 'admin-export')
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))))
    return res.status(429).json({ error: 'Too many exports in a short time — try again in a few minutes' })
  }
  const { buildContentExport } = await import('../../../lib/contentExport')
  const out = await buildContentExport()
  emitEditorialEvent({ action: 'content-export', files: out.files, bytes: out.zip.length }, { req })
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`)
  res.setHeader('Content-Length', String(out.zip.length))
  res.setHeader('X-Content-Type-Options', 'nosniff')
  return res.status(200).send(out.zip)
})
