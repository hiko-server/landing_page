import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteCookie } from 'cookies-next'
import { bumpSessionVersion } from '../../../lib/admin'
import { ADMIN_COOKIE, readAdminClaims } from '../../../lib/auth'

/**
 * POST /api/admin/logout — signs out EVERYWHERE.
 *
 * With a valid session, the stored session version is bumped, which revokes
 * every admin token ever issued (other browsers and devices included; their
 * next API call gets 401). Without a valid session it only clears this
 * browser's cookie — an anonymous POST must not be able to sign the owner out.
 * Reachable without a session (middleware allow-list) so a stale cookie can
 * always be cleared; cross-site POSTs are refused by the middleware.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const revoked = readAdminClaims(req, res) !== null
  if (revoked) bumpSessionVersion()
  deleteCookie(ADMIN_COOKIE, { req, res, path: '/' })
  return res.status(200).json({ ok: true, revokedAllSessions: revoked })
}
