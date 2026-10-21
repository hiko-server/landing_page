import { bumpSessionVersion } from '../admin'
import { ADMIN_SESSION_TTL_S, type AdminContext } from '../auth'
import { log } from '../log'
import { revokeSession, type SessionOrigin } from './sessions'
import { endLegacyTokens, recordAuthEvent } from './store'

/**
 * Wrong passwords typed INSIDE a signed-in session — the current password of
 * a change (lib/adminAuth/password.ts) and a password step-up
 * (pages/api/admin/security/verify.ts). SERVER-ONLY.
 *
 * Those checks share the sign-in lockout, but that lockout is per (e-mail,
 * client network): someone holding a stolen session cookie could move
 * between networks and keep guessing. So the session itself is the budget:
 * after WRONG_PASSWORDS_PER_SESSION wrong passwords it is signed out
 * (revoked_reason 'too many wrong passwords', and a "Signed a browser out"
 * entry in the sign-in history) and the owner simply signs in again. A
 * stolen session therefore gives at most that many guesses, from anywhere —
 * fewer than the sign-in form allows one network. A right password clears
 * the count.
 *
 * A token from before sessions existed has no row of its own: those share
 * one count, and reaching it ends every such token (as "Sign out
 * everywhere" does).
 *
 * In memory and bounded, like the sign-in lockout: a restart (which only
 * the operator can trigger) forgets the counts.
 */

export const WRONG_PASSWORDS_PER_SESSION = 5
export const TOO_MANY_WRONG_REASON = 'too many wrong passwords'
export const SIGNED_OUT_MESSAGE =
  'Too many wrong passwords: this browser was signed out. Sign in again to continue.'

type Entry = { count: number; until: number }
const MAX_TRACKED = 1_000

function counts(): Map<string, Entry> {
  // On globalThis so every route bundle (and dev reloads) share one map.
  const registry = globalThis as unknown as Record<symbol, Map<string, Entry> | undefined>
  const key = Symbol.for('lucian-dev.sessionWrongPasswords')
  let m = registry[key]
  if (!m) {
    m = new Map()
    registry[key] = m
  }
  return m
}

const keyOf = (ctx: AdminContext): string => (ctx.session ? `sid:${ctx.session.id}` : 'legacy')

function prune(m: Map<string, Entry>, now: number): void {
  if (m.size < MAX_TRACKED) return
  m.forEach((e, k) => {
    if (e.until <= now) m.delete(k)
  })
  // Still full: forget the oldest (a session can only lose its own count this way).
  while (m.size >= MAX_TRACKED) {
    const first = m.keys().next()
    if (first.done) break
    m.delete(first.value)
  }
}

/** Wrong passwords this session has typed so far (0 when none or forgotten). */
export function wrongPasswordCount(ctx: AdminContext, now = Date.now()): number {
  const e = counts().get(keyOf(ctx))
  return e && e.until > now ? e.count : 0
}

/**
 * Count one wrong password typed in this session. At the limit the session
 * is signed out — its row revoked (or, for a pre-session token, every such
 * token ended) — and `signedOut` is true: the caller clears the cookies and
 * answers 401 SIGNED_OUT.
 */
export function noteWrongPassword(
  ctx: AdminContext,
  origin: SessionOrigin,
  now = Date.now()
): { signedOut: boolean; count: number } {
  const m = counts()
  prune(m, now)
  const key = keyOf(ctx)
  const prev = m.get(key)
  // Counted for as long as a session can live.
  const entry = prev && prev.until > now ? prev : { count: 0, until: now + ADMIN_SESSION_TTL_S * 1000 }
  entry.count += 1
  m.delete(key)
  if (entry.count < WRONG_PASSWORDS_PER_SESSION) {
    m.set(key, entry)
    return { signedOut: false, count: entry.count }
  }
  try {
    if (ctx.session) revokeSession(ctx.session.id, TOO_MANY_WRONG_REASON, now)
    else endLegacyTokens(now)
  } catch (err) {
    // The row could not be revoked: end every token instead (fail closed).
    log.error('wrong-password limit: session not revoked, signing out everywhere', { err })
    bumpSessionVersion()
  }
  try {
    recordAuthEvent({
      type: 'session-revoked',
      sessionId: ctx.session?.id ?? null,
      detail: TOO_MANY_WRONG_REASON,
      ...origin,
    })
  } catch {
    // History is best effort; the session is already ended.
  }
  return { signedOut: true, count: entry.count }
}

/** A right password (or a passkey) in this session: start counting again. */
export function clearWrongPasswords(ctx: AdminContext): void {
  counts().delete(keyOf(ctx))
}
