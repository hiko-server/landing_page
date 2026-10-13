import type { NextApiRequest, NextApiResponse } from 'next'
import { readAdminContext, type AdminContext } from '../auth'
import { passkeyCount } from './passkeys'
import { isPasskeyRequired } from './store'

/**
 * Recent verification ("step-up") for dangerous actions: restoring a backup,
 * deleting a post or case study, MongoDB restore and target changes, and
 * every passkey / recovery-code / session change. The owner must have signed
 * in or re-verified on this browser recently (recentAuthWindowMs: 10 minutes
 * unless ADMIN_RECENT_AUTH_MINUTES says otherwise); otherwise the
 * route answers 403 STEP_UP_REQUIRED with the ways to verify, the admin UI
 * asks (components/Admin/security/StepUpDialog.tsx) and retries.
 *
 * Verification takes what sign-in takes: a passkey, or the password — plus a
 * recovery code when the owner has turned on "Require a passkey".
 */

export const DEFAULT_RECENT_AUTH_MINUTES = 10

/**
 * How long a sign-in or step-up counts as recent: ADMIN_RECENT_AUTH_MINUTES
 * (whole minutes, 1–60; default 10). Read on every check, so a change to the
 * env applies on the next restart without a rebuild.
 */
export function recentAuthWindowMs(raw: string | undefined = process.env.ADMIN_RECENT_AUTH_MINUTES): number {
  const n = Number(raw)
  const minutes = raw !== undefined && raw.trim() !== '' && Number.isInteger(n) ? Math.min(60, Math.max(1, n)) : DEFAULT_RECENT_AUTH_MINUTES
  return minutes * 60_000
}

export type StepUpMethods = { methods: Array<'passkey' | 'password'>; recoveryRequired: boolean }

export function stepUpMethods(): StepUpMethods {
  const passkeys = passkeyCount()
  const required = passkeys > 0 && isPasskeyRequired()
  return { methods: passkeys > 0 ? ['passkey', 'password'] : ['password'], recoveryRequired: required }
}

/** Did this session sign in or re-verify within the recent-auth window? (A pre-session token never counts.) */
export function hasRecentAuth(ctx: AdminContext, now = Date.now()): boolean {
  return !!ctx.session && now - ctx.session.verifiedAt <= recentAuthWindowMs() && ctx.session.verifiedAt <= now
}

/**
 * Gate a dangerous action. Returns the admin context when the request may
 * proceed; otherwise answers 401 (no session) or 403 STEP_UP_REQUIRED and
 * returns null.
 */
export function requireRecentAuth(req: NextApiRequest, res: NextApiResponse, now = Date.now()): AdminContext | null {
  const ctx = readAdminContext(req, res)
  if (!ctx) {
    res.status(401).json({ error: 'Unauthorized', code: 'NO_SESSION' })
    return null
  }
  if (hasRecentAuth(ctx, now)) return ctx
  res.setHeader('Cache-Control', 'no-store')
  res.status(403).json({
    code: 'STEP_UP_REQUIRED',
    error: 'Confirm it’s you to continue.',
    ...stepUpMethods(),
    windowMinutes: recentAuthWindowMs() / 60_000,
  })
  return null
}
