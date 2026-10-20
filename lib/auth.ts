import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteCookie, getCookie, setCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret, isProd } from './env'
import { getSessionVersion } from './admin'
import { isSessionCurrent, SESSION_VERSION_CLAIM } from './security/session'
import { ADMIN_HINT_COOKIE } from './adminHint'
import { ipFromReq } from './rateLimit'
import { KNOWN_DEVICE_COOKIE, KNOWN_DEVICE_TTL_S, signKnownDevice, verifyKnownDevice } from './security/knownDevice'
import { deviceLabel, ipPrefix } from './adminAuth/describe'
import { createSession, liveSession, touchSession, type AdminSession, type SessionOrigin } from './adminAuth/sessions'
import { isLegacyTokenEnded, recordAuthEvent, type AuthMethod } from './adminAuth/store'

/**
 * Single admin-session check for every Node API route.
 *
 * The edge middleware gates /api/admin/* with a fast signature-only check;
 * this is the authoritative copy that every handler calls (it also covers
 * mixed public/admin routes like /api/cvdata and /api/home). On top of the
 * signature it enforces revocation twice over:
 *   - the token's `sv` claim must equal data/admin.json's `sessionVersion`
 *     (missing on either side = 0), so a password reset or "sign out
 *     everywhere" invalidates every outstanding token;
 *   - the token's `sid` must name a live row in auth.db (lib/adminAuth/
 *     sessions.ts), so one browser can be signed out on its own.
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
export { ADMIN_HINT_COOKIE }

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

/**
 * A request cookie's value, or undefined when it is absent or cannot be
 * decoded. cookies-next percent-decodes values with decodeURIComponent, which
 * throws on a malformed escape (`cv_admin_token=%E0%A4%A`); a cookie the
 * visitor's browser — or anyone — can set must never turn a public route
 * into a 500, so an undecodable cookie reads as absent.
 */
export function readCookie(req: NextApiRequest, res: NextApiResponse, name: string): string | undefined {
  try {
    // cookies-next turns "true" / "false" / "null" into values; give the text back.
    const value: unknown = getCookie(name, { req, res })
    return value === undefined ? undefined : String(value)
  } catch {
    return undefined
  }
}

/** True when the request carries the hint cookie (so clearing it is worth a header). */
export function hasAdminHint(req: NextApiRequest, res: NextApiResponse): boolean {
  return readCookie(req, res, ADMIN_HINT_COOKIE) !== undefined
}

/**
 * Claims of an admin token. `sid` names its auth.db session row (every token
 * minted since passkeys were added carries one); `amr` says how the session
 * signed in ('pwd', 'passkey', 'recovery'); `auth_time` is that moment
 * (seconds) — informational, the session row's verified_at decides recency.
 */
export type AdminClaims = {
  role?: string
  email?: string
  sub?: string
  sv?: number
  sid?: string
  amr?: string[]
  auth_time?: number
  iat?: number
}

/**
 * The request's verified admin session: the token's claims plus its session
 * row (null for a token minted before sessions existed — signature, expiry
 * and session version still apply to it, it is refused once the owner signs
 * any browser out (lib/adminAuth/store legacy_cutoff), and
 * /api/admin/session upgrades it to a row on the next page view).
 */
export type AdminContext = { claims: AdminClaims; session: AdminSession | null }

/**
 * Full check: signature (HS256 only), role, session version, and — for a
 * token with `sid` — a live session row (not revoked, not expired), whose
 * last-seen time is refreshed; a token without `sid` only until the legacy
 * cutoff. Null for anything else. Never throws: an unreadable auth.db fails
 * closed (no session).
 */
export function readAdminContext(req: NextApiRequest, res: NextApiResponse): AdminContext | null {
  try {
    const token = readCookie(req, res, ADMIN_COOKIE)
    if (!token) return null
    const claims = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as AdminClaims
    if (claims?.role !== 'admin') return null
    if (!isSessionCurrent(claims as Record<string, unknown>, getSessionVersion())) return null
    if (claims.sid === undefined) return isLegacyTokenEnded(claims.iat) ? null : { claims, session: null }
    if (typeof claims.sid !== 'string') return null
    const session = liveSession(claims.sid)
    if (!session) return null
    touchSession(session)
    return { claims, session }
  } catch {
    return null
  }
}

/** The verified, current admin session's claims, or null (absent, undecodable, invalid, expired or revoked token). Never throws. */
export function readAdminClaims(req: NextApiRequest, res: NextApiResponse): AdminClaims | null {
  return readAdminContext(req, res)?.claims ?? null
}

export function isAdminRequest(req: NextApiRequest, res: NextApiResponse): boolean {
  return readAdminContext(req, res) !== null
}

/** Mint an admin session token bound to the current session version (and to a session row when `sid` is given). */
export function signAdminToken(email: string, opts: { sid?: string; amr?: string[]; authTime?: number } = {}): string {
  const payload: Record<string, unknown> = { sub: 'cv-admin', role: 'admin', email, [SESSION_VERSION_CLAIM]: getSessionVersion() }
  if (opts.sid) payload.sid = opts.sid
  if (opts.amr?.length) payload.amr = opts.amr
  if (opts.authTime) payload.auth_time = Math.floor(opts.authTime / 1000)
  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: ADMIN_SESSION_TTL_S })
}

const header = (req: NextApiRequest, name: string): string => {
  const v = req.headers?.[name]
  return (Array.isArray(v) ? v[0] : v) || ''
}

/** Coarse origin of a request, for the session list and history (lib/adminAuth/describe.ts). */
export function requestOrigin(req: NextApiRequest): SessionOrigin {
  const country = header(req, 'cf-ipcountry').toUpperCase()
  return {
    device: deviceLabel(header(req, 'user-agent')),
    ipPrefix: ipPrefix(ipFromReq(req)),
    country: /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1' ? country : null,
  }
}

const AMR: Record<AuthMethod, string[]> = { password: ['pwd'], passkey: ['passkey'], recovery: ['pwd', 'recovery'], legacy: ['pwd'] }

/**
 * Sign this browser in: create its session row, set the httpOnly session
 * cookie (SameSite=Strict, Secure in production), the readable hint cookie
 * and the signed known-device cookie (keeping `knownDeviceId` when the
 * browser was already known), and record the sign-in.
 */
export function startAdminSession(
  req: NextApiRequest,
  res: NextApiResponse,
  opts: { email: string; method: AuthMethod; credentialId?: string | null; knownDeviceId?: string | null; verifiedAt?: number; record?: boolean },
): AdminSession {
  const origin = requestOrigin(req)
  const session = createSession({ method: opts.method, ttlMs: ADMIN_SESSION_TTL_S * 1000, credentialId: opts.credentialId ?? null, verifiedAt: opts.verifiedAt, ...origin })
  const secret = getJwtSecret()
  const cookieBase = { req, res, httpOnly: true, sameSite: 'strict' as const, secure: isProd(), path: '/' }
  const token = signAdminToken(opts.email, { sid: session.id, amr: AMR[opts.method], authTime: session.verifiedAt })
  setCookie(ADMIN_COOKIE, token, { ...cookieBase, maxAge: ADMIN_SESSION_TTL_S })
  // Remember this browser so it skips the login queue during a distributed attack.
  setCookie(KNOWN_DEVICE_COOKIE, signKnownDevice(secret, opts.knownDeviceId || undefined), { ...cookieBase, maxAge: KNOWN_DEVICE_TTL_S })
  setAdminHint(req, res)
  if (opts.record !== false) {
    recordAuthEvent({ type: 'signin', method: opts.method, sessionId: session.id, ...origin, detail: opts.method === 'legacy' ? 'session from before passkeys' : null })
  }
  return session
}

/** The known-device id this browser presents (null when none or forged). */
export function knownDeviceIdOf(req: NextApiRequest, res: NextApiResponse): string | null {
  return verifyKnownDevice(getJwtSecret(), readCookie(req, res, KNOWN_DEVICE_COOKIE))?.id ?? null
}

/** Expire the session and hint cookies of this browser. */
export function clearAdminCookies(req: NextApiRequest, res: NextApiResponse): void {
  deleteCookie(ADMIN_COOKIE, { req, res, path: '/' })
  clearAdminHint(req, res)
}

