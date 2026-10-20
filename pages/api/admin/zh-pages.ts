import type { NextApiRequest, NextApiResponse } from 'next'
import { isAdminRequest } from '../../../lib/auth'
import { withApi } from '../../../lib/apiHandler'
import { ZH_PAIRED, zhPathOf, type ZhPageStatus } from '../../../lib/zhRoutes'
import { zhAvailable } from '../../../lib/zhSite'

/**
 * GET /api/admin/zh-pages — which Chinese pages exist now (F3, lib/zhSite),
 * for the Home and About editors' Chinese sections:
 *
 *   { pages: [{ path: '/zh', en: '/', live: true }, …] }   in nav order
 *
 * A Chinese page exists only while the owner's Chinese copy for it is saved
 * (never a translation or a placeholder). Admin only, never cached.
 */
export default withApi('admin/zh-pages', (req: NextApiRequest, res: NextApiResponse) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const live = new Set(zhAvailable())
  const pages: ZhPageStatus[] = ZH_PAIRED.flatMap((en) => {
    const path = zhPathOf(en)
    return path ? [{ path, en, live: live.has(en) }] : []
  })
  return res.status(200).json({ pages })
})
