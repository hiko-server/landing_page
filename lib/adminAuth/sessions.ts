import crypto from 'crypto'
import { getAuthDb } from './db'
import type { AuthMethod } from './store'

/**
 * One row per signed-in browser (auth.db auth_sessions). The admin JWT
 * carries the row id as its `sid` claim; lib/auth.ts honours a token only
 * while its row exists, is not revoked and has not expired — so one device
 * can be signed out on its own, and "sign out everywhere" really is.
 *
 * verified_at is the last time the owner proved who they are on that
 * browser (sign-in or step-up); once that is no longer recent, dangerous actions
 * ask again (lib/adminAuth/stepUp.ts).
 */

export const SESSION_ID_RE = /^[A-Za-z0-9_-]{22}$/
/** last_seen_at is written at most this often per session. */
const TOUCH_EVERY_MS = 60_000
/** Expired or revoked rows are kept this long for the history view, then deleted. */
const KEEP_ENDED_MS = 30 * 86_400_000

export type SessionOrigin = { device: string | null; ipPrefix: string | null; country: string | null }

export type AdminSession = {
  id: string
  createdAt: number
  expiresAt: number
  lastSeenAt: number
  verifiedAt: number
  method: AuthMethod
  credentialId: string | null
  device: string | null
  ipPrefix: string | null
  country: string | null
  revokedAt: number | null
  revokedReason: string | null
}

type Row = {
  id: string
  created_at: number
  expires_at: number
  last_seen_at: number
  verified_at: number
  method: AuthMethod
  credential_id: string | null
  device: string | null
  ip_prefix: string | null
  country: string | null
  revoked_at: number | null
  revoked_reason: string | null
}

function fromRow(r: Row): AdminSession {
  return {
    id: r.id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    lastSeenAt: r.last_seen_at,
    verifiedAt: r.verified_at,
    method: r.method,
    credentialId: r.credential_id,
    device: r.device,
    ipPrefix: r.ip_prefix,
    country: r.country,
    revokedAt: r.revoked_at,
    revokedReason: r.revoked_reason,
  }
}

export function newSessionId(): string {
  return crypto.randomBytes(16).toString('base64url')
}

export function createSession(
  input: { method: AuthMethod; ttlMs: number; credentialId?: string | null; verifiedAt?: number } & SessionOrigin,
  now = Date.now(),
): AdminSession {
  const db = getAuthDb()
  const id = newSessionId()
  const verifiedAt = Math.min(now, input.verifiedAt ?? now)
  db.prepare(
    `INSERT INTO auth_sessions (id, created_at, expires_at, last_seen_at, verified_at, method, credential_id, device, ip_prefix, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, now, now + input.ttlMs, now, verifiedAt, input.method, input.credentialId ?? null, input.device, input.ipPrefix, input.country)
  pruneSessions(now)
  return getSession(id) as AdminSession
}

export function getSession(id: string): AdminSession | null {
  if (!SESSION_ID_RE.test(id)) return null
  const row = getAuthDb().prepare('SELECT * FROM auth_sessions WHERE id = ?').get(id) as Row | undefined
  return row ? fromRow(row) : null
}

/** The session when it may still be used (exists, not revoked, not expired). */
export function liveSession(id: string, now = Date.now()): AdminSession | null {
  const s = getSession(id)
  if (!s || s.revokedAt !== null || s.expiresAt <= now) return null
  return s
}

/** Record activity (throttled to one write a minute per session). */
export function touchSession(s: AdminSession, now = Date.now()): void {
  if (now - s.lastSeenAt < TOUCH_EVERY_MS) return
  getAuthDb().prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, s.id)
}

/** The owner proved who they are again on this browser. */
export function markVerified(id: string, now = Date.now()): void {
  getAuthDb().prepare('UPDATE auth_sessions SET verified_at = ?, last_seen_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, now, id)
}

export function revokeSession(id: string, reason: string, now = Date.now()): boolean {
  if (!SESSION_ID_RE.test(id)) return false
  return getAuthDb().prepare('UPDATE auth_sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL').run(now, reason, id).changes === 1
}

/** Revoke every live session except `keepId` (all when null). Returns how many. */
export function revokeSessionsExcept(keepId: string | null, reason: string, now = Date.now()): number {
  return getAuthDb()
    .prepare('UPDATE auth_sessions SET revoked_at = ?, revoked_reason = ? WHERE revoked_at IS NULL AND expires_at > ? AND id IS NOT ?')
    .run(now, reason, now, keepId).changes
}

/** Live sessions, most recently active first. */
export function listLiveSessions(now = Date.now()): AdminSession[] {
  const rows = getAuthDb()
    .prepare('SELECT * FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC')
    .all(now) as Row[]
  return rows.map(fromRow)
}

export function pruneSessions(now = Date.now()): void {
  getAuthDb()
    .prepare('DELETE FROM auth_sessions WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR expires_at < ?')
    .run(now - KEEP_ENDED_MS, now - KEEP_ENDED_MS)
}
