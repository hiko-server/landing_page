import type { NextApiRequest, NextApiResponse } from 'next'
import { ADMIN_COOKIE, clearAdminHint, hasAdminHint, knownDeviceIdOf, readAdminContext, setAdminHint, startAdminSession } from '../../../lib/auth'
import { withApi } from '../../../lib/apiHandler'

/**
 * GET /api/admin/session → { authenticated: boolean }
 *
 * Always 200: the header asks this on every page view to decide whether to
 * show Dashboard / Logout, and a 401 for every visitor would put an error in
 * every visitor's console. The cookie is httpOnly, so the client can't check
 * it itself. Uses the full check (signature, session version and the auth.db
 * session row), so a token revoked by a sign-out — of this browser or from
 * another one — or by a password reset reads as signed out. Never cached.
 *
 * A valid token minted before sessions existed (no `sid`) is swapped for one
 * bound to a new session row, once; its original sign-in time is kept, so
 * the upgrade never counts as a recent verification.
 *
 * Keeps the readable `cv_admin_hint` cookie in step with the real session:
 * re-set (sliding) while the session is valid, cleared once it is not — but
 * only for browsers that carry a session or hint cookie, so anonymous
 * visitors never receive a Set-Cookie.
 */
export default withApi('admin/session', (req: NextApiRequest, res: NextApiResponse, ctx) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'private, no-store')
  const admin = readAdminContext(req, res)
  if (admin && !admin.session) {
    try {
      const signedInAt = typeof admin.claims.iat === 'number' ? admin.claims.iat * 1000 : 0
      startAdminSession(req, res, { email: admin.claims.email || 'admin', method: 'legacy', verifiedAt: signedInAt, knownDeviceId: knownDeviceIdOf(req, res) })
    } catch (err) {
      ctx.log.warn('could not upgrade a pre-session admin token', { err })
    }
  }
  const authenticated = admin !== null
  if (authenticated) setAdminHint(req, res)
  else if (hasAdminHint(req, res) || hasSessionCookie(req)) clearAdminHint(req, res)
  return res.status(200).json({ authenticated })
})

function hasSessionCookie(req: NextApiRequest): boolean {
  const fromParser = req.cookies?.[ADMIN_COOKIE]
  if (typeof fromParser === 'string' && fromParser) return true
  const header = req.headers?.cookie
  return typeof header === 'string' && header.split(';').some((c) => c.trim().startsWith(`${ADMIN_COOKIE}=`))
}
