import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../../lib/env'

/**
 * GET /api/admin/session → { authenticated: boolean }
 *
 * Always 200: the header asks this on every page view to decide whether to
 * show Dashboard / Logout, and a 401 for every visitor would put an error in
 * every visitor's console. The cookie is httpOnly, so the client can't check
 * it itself. Never cached.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'private, no-store')

  const token = getCookie('cv_admin_token', { req, res }) as string | undefined
  if (!token) return res.status(200).json({ authenticated: false })
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as any
    return res.status(200).json({ authenticated: decoded?.role === 'admin' })
  } catch {
    return res.status(200).json({ authenticated: false })
  }
}
