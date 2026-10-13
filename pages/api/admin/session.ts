import type { NextApiRequest, NextApiResponse } from 'next'
import { ADMIN_COOKIE, clearAdminHint, hasAdminHint, isAdminRequest, setAdminHint } from '../../../lib/auth'
import { withApi } from '../../../lib/apiHandler'

/**
 * GET /api/admin/session → { authenticated: boolean }
 *
 * Always 200: the header asks this on every page view to decide whether to
 * show Dashboard / Logout, and a 401 for every visitor would put an error in
 * every visitor's console. The cookie is httpOnly, so the client can't check
 * it itself. Uses the full check (signature + session version), so a token
 * revoked by "log out everywhere" or a password reset reads as signed out.
 * Never cached.
 *
 * Keeps the readable `cv_admin_hint` cookie in step with the real session:
 * re-set (sliding) while the session is valid, cleared once it is not — but
 * only for browsers that carry a session or hint cookie, so anonymous
 * visitors never receive a Set-Cookie.
 */
export default withApi('admin/session', (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'private, no-store')
  const authenticated = isAdminRequest(req, res)
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
