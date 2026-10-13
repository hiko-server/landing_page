import type { NextApiRequest, NextApiResponse } from 'next'
import { readCvDataWithVersion } from '../../../lib/cvdata'
import { kvEtag } from '../../../lib/contentStore'
import { isAdminRequest } from '../../../lib/auth'
import { sendVersionedJson } from '../../../lib/http'
import { withApi } from '../../../lib/apiHandler'

/**
 * GET /api/admin/cvdata — the FULL CV document {en, zh} with all visibility
 * metadata, for the admin editors. (The public GET /api/cvdata always
 * returns the pruned view, even to an admin.)
 *
 * Headers: ETag "<kv updated_at ms>" ("0" when nothing is stored) — send it
 * back as If-Match on PUT /api/cvdata to detect concurrent edits;
 * X-CV-View: admin; Cache-Control: no-store.
 */
export default withApi('admin/cvdata', (req: NextApiRequest, res: NextApiResponse) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { en, zh, version } = readCvDataWithVersion()
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-CV-View', 'admin')
  return sendVersionedJson(res, 200, { en, zh }, kvEtag(version))
})
