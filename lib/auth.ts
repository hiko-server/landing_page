import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from './env'

/**
 * Single admin-session check for every Node API route (the edge middleware
 * gates /api/admin/* too; this is the defence-in-depth copy that also covers
 * mixed public/admin routes like /api/cvdata and /api/home).
 *
 * The algorithm is pinned so a token can never be verified under anything
 * but the HMAC we sign with.
 */
export const ADMIN_COOKIE = 'cv_admin_token'

export type AdminClaims = { role?: string; email?: string; sub?: string }

export function readAdminClaims(req: NextApiRequest, res: NextApiResponse): AdminClaims | null {
  const token = getCookie(ADMIN_COOKIE, { req, res })
  if (typeof token !== 'string' || !token) return null
  try {
    const claims = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as AdminClaims
    return claims?.role === 'admin' ? claims : null
  } catch {
    return null
  }
}

export function isAdminRequest(req: NextApiRequest, res: NextApiResponse): boolean {
  return readAdminClaims(req, res) !== null
}
