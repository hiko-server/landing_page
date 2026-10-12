import type { NextApiRequest, NextApiResponse } from 'next'
import { isAdminRequest } from '../../../lib/auth'

/**
 * GET /api/admin/session → { authenticated: boolean }
 *
 * Always 200: the header asks this on every page view to decide whether to
 * show Dashboard / Logout, and a 401 for every visitor would put an error in
 * every visitor's console. The cookie is httpOnly, so the client can't check
 * it itself. Uses the full check (signature + session version), so a token
 * revoked by "log out everywhere" or a password reset reads as signed out.
 * Never cached.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'private, no-store')
  return res.status(200).json({ authenticated: isAdminRequest(req, res) })
}
