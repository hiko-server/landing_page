import { jwtVerify } from 'jose'
import { getSessionVersion } from '../admin'
import { isSessionCurrent } from '../security/session'
import { liveSession, SESSION_ID_RE } from './sessions'
import { isLegacyTokenEnded } from './store'

/**
 * The admin gate's session check (proxy.ts, before any /admin page or
 * /api/admin route runs). The proxy runs on the Node.js runtime, so it
 * enforces revocation itself instead of leaving it to each API route:
 *
 *   - signature (HS256 only — the algorithm is pinned) and expiry;
 *   - role `admin`;
 *   - session version: the token's `sv` must equal data/admin.json's
 *     `sessionVersion` ("Sign out everywhere", a password reset);
 *   - session row: a token with `sid` must name a live auth.db session (not
 *     revoked, not expired) — one browser signed out from Admin → Security
 *     can no longer load an admin page either.
 * A token minted before sessions existed (no `sid`) passes on the version
 * check alone; /api/admin/session swaps it for one bound to a row on the
 * first page view (lib/auth.ts).
 *
 * Read-only and fail-closed: it never refreshes last-seen (the API routes
 * do), and an unreadable admin.json / auth.db answers `unavailable`, which
 * the gate treats like no session. lib/auth.ts readAdminContext stays the
 * authoritative check inside every route.
 */

export type AdminTokenVerdict = 'ok' | 'missing' | 'invalid' | 'revoked' | 'unavailable'

export type AdminGateDeps = {
  /** JWT_SECRET; unset or the placeholder `change-me` lets nobody in. */
  secret: string | undefined
  /** data/admin.json `sessionVersion` (0 when absent). */
  sessionVersion: () => number
  /** True while the auth.db session row may still be used. */
  isLiveSession: (sid: string) => boolean
  /** A token WITHOUT a session id (minted before sessions existed) is refused once the owner has signed any browser out (auth_settings legacy_cutoff, lib/adminAuth/store). */
  legacyEnded: (iat: unknown) => boolean
}

/** The production dependencies (read at call time, so tests can change the environment). */
export function adminGateDeps(): AdminGateDeps {
  return {
    secret: process.env.JWT_SECRET,
    sessionVersion: () => getSessionVersion(),
    isLiveSession: (sid) => liveSession(sid) !== null,
    legacyEnded: (iat) => isLegacyTokenEnded(iat),
  }
}

/** Verdict for the `cv_admin_token` cookie value. Never throws. */
export async function verifyAdminToken(token: string | undefined, deps: AdminGateDeps = adminGateDeps()): Promise<AdminTokenVerdict> {
  if (!token) return 'missing'
  const { secret } = deps
  if (!secret || secret === 'change-me') return 'invalid'
  let payload: Record<string, unknown>
  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] })
    payload = verified.payload
  } catch {
    return 'invalid'
  }
  if (payload.role !== 'admin') return 'invalid'
  const sid = payload.sid
  if (sid !== undefined && (typeof sid !== 'string' || !SESSION_ID_RE.test(sid))) return 'invalid'
  try {
    if (!isSessionCurrent(payload, deps.sessionVersion())) return 'revoked'
    if (typeof sid === 'string' && !deps.isLiveSession(sid)) return 'revoked'
    // SECU-3's rule, at the gate too: lib/auth already refuses these on every API.
    if (sid === undefined && deps.legacyEnded(payload.iat)) return 'revoked'
  } catch {
    return 'unavailable'
  }
  return 'ok'
}
