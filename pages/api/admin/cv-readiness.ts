import type { NextApiRequest, NextApiResponse } from 'next'
import { isAdminRequest } from '../../../lib/auth'
import { withApi } from '../../../lib/apiHandler'
import { readinessContext } from '../../../lib/cvReadinessServer'

/**
 * GET /api/admin/cv-readiness — what the CV Studio's readiness checks need
 * besides the CV itself (lib/cvReadiness.ts): the site's reference month,
 * the home page's public e-mail and the case-study index (slug, title,
 * draft flag). Admin only, never cached; the checks themselves run in the
 * browser on the document being edited.
 */
export default withApi('admin/cv-readiness', (req: NextApiRequest, res: NextApiResponse) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json(readinessContext())
})
