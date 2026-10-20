import fs from 'fs'
import path from 'path'
import { withApi } from '../../../../lib/apiHandler'
import { isAdminRequest } from '../../../../lib/auth'
import { trashPreviewFile } from '../../../../lib/media/trash'

/**
 * GET /api/admin/media/preview?name=<upload> — a look at an upload in the
 * media library's trash (H7): its small WebP version, else the file itself.
 * Trashed files are never served at /uploads; this is the admin's only way
 * to see what it is about to restore or delete for good. Admin only,
 * private, never cached; served with the same sandboxing CSP as /uploads.
 */

const TYPES: Record<string, string> = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.avif': 'image/avif' }

export default withApi('admin/media/preview', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  const name = typeof req.query.name === 'string' ? req.query.name : ''
  const file = trashPreviewFile(name)
  const type = file ? TYPES[path.extname(file).toLowerCase()] : undefined
  if (!file || !type) return res.status(404).json({ error: 'Not in the trash' })
  const buf = fs.readFileSync(file)
  res.setHeader('Content-Type', type)
  res.setHeader('Content-Length', String(buf.length))
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox")
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.method === 'HEAD') return res.status(200).end()
  return res.status(200).send(buf)
})
