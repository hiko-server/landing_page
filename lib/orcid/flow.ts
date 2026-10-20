import crypto from 'crypto'
import type { ReplayGuard } from '../security/replayGuard'

/**
 * The OAuth `state` of "Connect your ORCID iD" and the browser binding that
 * goes with it. SERVER-ONLY; pure apart from the randomness (tests pass the
 * secret, the clock and the replay guard).
 *
 * GET /api/admin/orcid/connect (signed-in admin) mints a flow:
 *   - `state`: 32 random bytes (base64url), sent to ORCID and echoed back;
 *   - the flow cookie `cv_orcid_flow` = v1.<state>.<sid>.<sv>.<iat>.<mac>:
 *     the state, the admin session that started the flow (its auth.db row
 *     id and the session version), the issue time, and an HMAC-SHA256 over
 *     all of it keyed with JWT_SECRET under its own purpose label. HttpOnly,
 *     SameSite=Lax, Secure in production, Path=/api/admin/orcid/callback,
 *     ORCID_FLOW_TTL_S.
 *
 * Why a Lax cookie: the admin session cookie is SameSite=Strict, so the
 * browser does NOT send it on the cross-site navigation back from orcid.org.
 * The Lax flow cookie is sent on that top-level GET — and only there (its
 * path) — so the callback can tell that this browser started this flow from
 * this admin session, re-check that the session is still live and current,
 * and act for it once.
 *
 * GET /api/admin/orcid/callback accepts the flow only when the cookie's MAC
 * verifies, it is not expired (or from the future), its state equals the
 * `state` ORCID returned (constant-time), and the state was not used before
 * (the replay guard; the cookie is cleared on every callback as well).
 */

export const ORCID_FLOW_COOKIE = 'cv_orcid_flow'
/** Ten minutes from "Connect" to the return from ORCID. */
export const ORCID_FLOW_TTL_S = 600

const VERSION = 'v1'
const PURPOSE = 'lucian-dev/orcid-connect'
/** Clock skew tolerated for an issue time slightly in the future. */
const SKEW_S = 60
export const STATE_RE = /^[A-Za-z0-9_-]{43}$/
const SID_RE = /^[A-Za-z0-9_-]{22}$/
const MAC_RE = /^[A-Za-z0-9_-]{43}$/

export type OrcidFlow = {
  state: string
  /** auth.db session id of the admin session that started the flow. */
  sid: string
  /** Session version (data/admin.json) when it started. */
  sv: number
  /** Issue time, unix seconds. */
  issuedAt: number
}

function mac(secret: string, state: string, sid: string, sv: number, issuedAt: number): string {
  return crypto.createHmac('sha256', secret).update(`${PURPOSE}|${VERSION}|${state}|${sid}|${sv}|${issuedAt}`).digest('base64url')
}

/** A fresh flow for the admin session `sid` (version `sv`): the state for ORCID and the cookie value. */
export function newOrcidFlow(secret: string, session: { sid: string; sv: number }, nowMs = Date.now()): { state: string; cookie: string; flow: OrcidFlow } {
  if (!SID_RE.test(session.sid)) throw new Error('invalid session id')
  if (!Number.isSafeInteger(session.sv) || session.sv < 0) throw new Error('invalid session version')
  const state = crypto.randomBytes(32).toString('base64url')
  const issuedAt = Math.floor(nowMs / 1000)
  const cookie = `${VERSION}.${state}.${session.sid}.${session.sv}.${issuedAt}.${mac(secret, state, session.sid, session.sv, issuedAt)}`
  return { state, cookie, flow: { state, sid: session.sid, sv: session.sv, issuedAt } }
}

export type FlowProblem = 'no-flow' | 'malformed' | 'expired' | 'state-mismatch' | 'replayed'

/** The flow a cookie value proves (MAC, shape, age), or why not. */
export function readOrcidFlow(secret: string, cookie: unknown, nowMs = Date.now()): { ok: true; flow: OrcidFlow } | { ok: false; problem: FlowProblem } {
  if (cookie === undefined || cookie === null || cookie === '') return { ok: false, problem: 'no-flow' }
  if (typeof cookie !== 'string' || cookie.length > 256) return { ok: false, problem: 'malformed' }
  const parts = cookie.split('.')
  if (parts.length !== 6) return { ok: false, problem: 'malformed' }
  const [version, state, sid, svText, iatText, given] = parts
  if (version !== VERSION || !STATE_RE.test(state) || !SID_RE.test(sid) || !/^\d{1,9}$/.test(svText) || !/^\d{1,12}$/.test(iatText) || !MAC_RE.test(given)) {
    return { ok: false, problem: 'malformed' }
  }
  const sv = Number(svText)
  const issuedAt = Number(iatText)
  const expected = Buffer.from(mac(secret, state, sid, sv, issuedAt), 'base64url')
  const actual = Buffer.from(given, 'base64url')
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return { ok: false, problem: 'malformed' }
  const now = Math.floor(nowMs / 1000)
  if (issuedAt > now + SKEW_S || now - issuedAt >= ORCID_FLOW_TTL_S) return { ok: false, problem: 'expired' }
  return { ok: true, flow: { state, sid, sv, issuedAt } }
}

/**
 * The callback's state check: the cookie's flow, the `state` ORCID returned
 * (must be the same, compared in constant time), and first use (the guard
 * claims the state until the flow would have expired anyway).
 */
export function checkOrcidCallbackState(
  secret: string,
  input: { cookie: unknown; state: unknown },
  guard: ReplayGuard,
  nowMs = Date.now(),
): { ok: true; flow: OrcidFlow } | { ok: false; problem: FlowProblem } {
  const read = readOrcidFlow(secret, input.cookie, nowMs)
  if (!read.ok) return read
  const given = typeof input.state === 'string' ? input.state : ''
  if (!STATE_RE.test(given)) return { ok: false, problem: 'state-mismatch' }
  const a = Buffer.from(read.flow.state)
  const b = Buffer.from(given)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, problem: 'state-mismatch' }
  if (!guard.claim(`orcid:${read.flow.state}`, (read.flow.issuedAt + ORCID_FLOW_TTL_S) * 1000, nowMs)) return { ok: false, problem: 'replayed' }
  return read
}
