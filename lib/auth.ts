import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie, setCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret, isProd } from './env'
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

/**
 * Non-httpOnly companion of the session cookie: `cv_admin_hint=1` tells
 * client code (edit pills, the command palette, analytics opt-out) that this
 * browser is probably signed in, without an API round trip. It grants
 * nothing — every admin API still verifies the httpOnly token — so it may be
 * readable from JS. Set on sign-in and on every valid session check, cleared
 * on logout, password reset and any invalid session check.
 */
export const ADMIN_HINT_COOKIE = 'cv_admin_hint'

function hintCookieOptions(req: NextApiRequest, res: NextApiResponse, maxAge: number) {
  return { req, res, path: '/', sameSite: 'lax' as const, secure: isProd(), httpOnly: false, maxAge }
}

/** Set the admin hint cookie for the lifetime of a session. */
export function setAdminHint(req: NextApiRequest, res: NextApiResponse): void {
  setCookie(ADMIN_HINT_COOKIE, '1', hintCookieOptions(req, res, ADMIN_SESSION_TTL_S))
}

/** Expire the admin hint cookie (Max-Age=0). */
export function clearAdminHint(req: NextApiRequest, res: NextApiResponse): void {
  setCookie(ADMIN_HINT_COOKIE, '', hintCookieOptions(req, res, 0))
}

/** True when the request carries the hint cookie (so clearing it is worth a header). */
export function hasAdminHint(req: NextApiRequest, res: NextApiResponse): boolean {
  return getCookie(ADMIN_HINT_COOKIE, { req, res }) !== undefined
}

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
