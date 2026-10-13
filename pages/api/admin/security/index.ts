import { withApi } from '../../../../lib/apiHandler'
import { readAdminContext } from '../../../../lib/auth'
import { securityOverview } from '../../../../lib/adminAuth/overview'

/**
 * GET /api/admin/security — the Security page: passkeys, recovery-code
 * status, the "Require a passkey" policy, signed-in browsers, the sign-in
 * history and how recently this browser verified (admin only, never cached).
 */
export default withApi('admin/security', (req, res) => {
  const ctx = readAdminContext(req, res)
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json(securityOverview(req, ctx))
})
