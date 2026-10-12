import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from './env'
import { getSessionVersion } from './admin'
import { isSessionCurrent, SESSION_VERSION_CLAIM } from './security/session'

/**
 * Single admin-session check for every Node API route.
 *
 * The edge middleware gates /api/admin/* with a fast signature-only check;
 * this is the authoritative copy that every handler calls (it also covers
 * mixed public/admin routes like /api/cvdata and /api/home). On top of the
 * signature it enforces session revocation: the token's `sv` claim must equal
 * data/admin.json's `sessionVersion` (missing on either side = 0), so a
 * logout or password reset invalidates every outstanding token.
 *
 * The algorithm is pinned so a token can never be verified under anything
 * but the HMAC we sign with.
 */
export const ADMIN_COOKIE = 'cv_admin_token'

/** Admin sessions last a week; the cookie and the token expire together. */
export const ADMIN_SESSION_TTL_S = 60 * 60 * 24 * 7

export type AdminClaims = { role?: string; email?: string; sub?: string; sv?: number }

export function readAdminClaims(req: NextApiRequest, res: NextApiResponse): AdminClaims | null {
  const token = getCookie(ADMIN_COOKIE, { req, res })
  if (typeof token !== 'string' || !token) return null
  try {
    const claims = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as AdminClaims
    if (claims?.role !== 'admin') return null
    return isSessionCurrent(claims as Record<string, unknown>, getSessionVersion()) ? claims : null
  } catch {
    return null
  }
}

export function isAdminRequest(req: NextApiRequest, res: NextApiResponse): boolean {
  return readAdminClaims(req, res) !== null
}

/** Mint an admin session token bound to the current session version. */
export function signAdminToken(email: string): string {
  return jwt.sign(
    { sub: 'cv-admin', role: 'admin', email, [SESSION_VERSION_CLAIM]: getSessionVersion() },
    getJwtSecret(),
    { algorithm: 'HS256', expiresIn: ADMIN_SESSION_TTL_S },
  )
}
