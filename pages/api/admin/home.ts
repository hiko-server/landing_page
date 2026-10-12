import type { NextApiRequest, NextApiResponse } from 'next'
import { readHomeWithVersion } from '../../../lib/home'
import { kvEtag } from '../../../lib/contentStore'
import { isAdminRequest } from '../../../lib/auth'
import { sendVersionedJson } from '../../../lib/http'

/**
 * GET /api/admin/home — the FULL home document (hidden photos, switched-off
 * sections' data included) for the admin Home editor. The public
 * GET /api/home returns the publicHome() view.
 *
 * Headers: ETag "<kv updated_at ms>" ("0" when nothing is stored) — send it
 * back as If-Match on PUT /api/home to detect concurrent edits;
 * X-Home-View: admin; Cache-Control: no-store.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { home, version } = readHomeWithVersion()
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Home-View', 'admin')
  return sendVersionedJson(res, 200, home, kvEtag(version))
}
