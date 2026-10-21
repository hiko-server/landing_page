import crypto from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import {
  changeAdminPassword,
  ensureAdminFromEnv,
  normalizeEmail,
  passwordMatchesRecord,
  readAdmin,
  readAdminStrict,
  verifyCredentials,
  type AdminData,
} from '../admin'
import { knownDeviceIdOf, requestOrigin, startAdminSession, type AdminContext } from '../auth'
import { clientKey } from '../rateLimit'
import { log } from '../log'
import { sendMail, siteUrl } from '../mailer'
import { formatSiteTime } from '../schedule/time'
import { revokeSession, revokeSessionsExcept } from './sessions'
import { stepUpMethods } from './stepUp'
import { endLegacyTokens, recordAuthEvent } from './store'
import {
  checkNewPassword,
  normalizePassword,
  PASSWORD_ISSUE_MESSAGES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordIssues,
  type PasswordIssue,
} from './passwordPolicy'

/**
 * Changing the admin password from Admin → Security (SERVER-ONLY; the route
 * is pages/api/admin/security/password.ts, which adds the session, rate
 * limit and step-up gates).
 *
 *   1. The new password is checked against the policy first
 *      (lib/adminAuth/passwordPolicy — length, common / predictable, the
 *      account's own words), so a refused choice costs no scrypt and no
 *      lockout attempt.
 *   2. The current password is verified exactly like a sign-in
 *      (lib/admin verifyCredentials: async scrypt, constant-time compare,
 *      NFKC as sign-in does) under the SAME per-(e-mail, client) lockout, so
 *      a stolen session cannot be used to guess it any faster than the
 *      sign-in form; a wrong one is answered "incorrect" and nothing more, and
 *      counted with the failed sign-ins (auth_failures, kind
 *      'password-change-failed').
 *   3. The new password may not equal the current one (compared normalised).
 *   4. It is hashed with a fresh salt and written atomically, with every
 *      e-mailed reset link burnt; compare-and-swap against the hash that was
 *      verified, and one change at a time per process.
 *   5. "Sign out other browsers" (default on) bumps the session version and
 *      revokes every other session row (reason 'password-changed') and every
 *      token from before sessions; either way this browser gets a new session
 *      (row + cookie) the way sign-in issues one — a credential change
 *      re-authenticated it, so its old token is not kept — marked verified
 *      now (with "Require a passkey" on: as recently as its step-up was).
 *   6. A 'password-changed' event goes to the sign-in history (the activity
 *      log entry comes from lib/audit's capture), and NOTIFY_EMAIL (else the
 *      account address) gets a short notice when SMTP is configured; a mail
 *      failure never fails the change.
 */

export type ChangePasswordInput = {
  currentPassword: string
  newPassword: string
  /** End every other browser's session (default true). */
  signOutOthers: boolean
}

const ALLOWED_KEYS = new Set(['currentPassword', 'newPassword', 'signOutOthers'])
/** What sign-in accepts for a typed password (UTF-16 units). */
const MAX_TYPED = 1024

/** The request body, or null when it is not exactly { currentPassword, newPassword, signOutOthers? }. */
export function parseChangePasswordBody(body: unknown): ChangePasswordInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  if (Object.keys(b).some((k) => !ALLOWED_KEYS.has(k))) return null
  const { currentPassword, newPassword, signOutOthers } = b
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') return null
  if (!currentPassword || currentPassword.length > MAX_TYPED || newPassword.length > MAX_TYPED)
    return null
  if (signOutOthers !== undefined && typeof signOutOthers !== 'boolean') return null
  return { currentPassword, newPassword, signOutOthers: signOutOthers !== false }
}

/** The site's host from SITE_URL ("lucian-dev.com"), for the "not the site's name" rule. */
export function siteHost(): string | null {
  try {
    return new URL(siteUrl()).hostname || null
  } catch {
    return null
  }
}

// ── Bootstrap hint ───────────────────────────────────────────────────────

export type BootstrapStatus = {
  /** ADMIN_PASS is set in the server's environment. */
  envSet: boolean
  /** It still equals the current password (null when unknown: no record, or the check failed). */
  matchesCurrent: boolean | null
}

const bootstrapCache = new Map<string, boolean>()

/**
 * Whether ADMIN_PASS is set and still equals the current password — computed
 * here, never sent: ADMIN_PASS is only read while data/admin.json does not
 * exist (lib/admin ensureAdminFromEnv), so after a change the owner should
 * remove or replace it in the server's .env. One scrypt per (record, value)
 * pair, remembered in memory under a hash of both.
 */
export async function bootstrapPasswordStatus(
  data: AdminData | null = readAdmin()
): Promise<BootstrapStatus> {
  const env = process.env.ADMIN_PASS
  if (!env) return { envSet: false, matchesCurrent: null }
  if (!data?.passwordHash || !data.salt) return { envSet: true, matchesCurrent: null }
  const key = crypto
    .createHash('sha256')
    .update(`${data.salt}\n${data.passwordHash}\n${data.passwordNorm || ''}\n${env}`)
    .digest('hex')
  const known = bootstrapCache.get(key)
  if (known !== undefined) return { envSet: true, matchesCurrent: known }
  try {
    const matches = await passwordMatchesRecord(env, data)
    if (bootstrapCache.size > 16) bootstrapCache.clear()
    bootstrapCache.set(key, matches)
    return { envSet: true, matchesCurrent: matches }
  } catch {
    return { envSet: true, matchesCurrent: null }
  }
}

// ── Overview ─────────────────────────────────────────────────────────────

/** The Password card of GET /api/admin/security. */
export type PasswordOverview = {
  /** The account address, for the password manager's (hidden) username field. */
  email: string
  siteHost: string | null
  /** When the password was last set, when the record knows. */
  changedAt: number | null
  minLength: number
  maxLength: number
  bootstrap: BootstrapStatus
}

export async function passwordOverview(): Promise<PasswordOverview> {
  const data = readAdmin()
  return {
    email: data?.email || '',
    siteHost: siteHost(),
    changedAt: typeof data?.passwordChangedAt === 'number' ? data.passwordChangedAt : null,
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    bootstrap: await bootstrapPasswordStatus(data),
  }
}

// ── One change at a time ─────────────────────────────────────────────────

/**
 * Serialise password changes in this process (on globalThis: every route
 * bundle shares it), so two concurrent requests cannot both verify the old
 * password and race on the write.
 */
function withPasswordLock<T>(fn: () => Promise<T>): Promise<T> {
  const registry = globalThis as unknown as Record<symbol, Promise<unknown> | undefined>
  const key = Symbol.for('lucian-dev.passwordChangeLock')
  const before = registry[key] ?? Promise.resolve()
  const run = before.then(fn, fn)
  registry[key] = run.catch(() => undefined)
  return run
}

// ── The change ───────────────────────────────────────────────────────────

export type ChangePasswordResult =
  | {
      status: 200
      body: {
        ok: true
        changedAt: number
        signedOutOthers: boolean
        /** Other browsers signed out (0 when kept). */
        revoked: number
        /** This browser is still signed in (its session was re-issued). */
        signedIn: boolean
        bootstrap: BootstrapStatus
      }
    }
  | { status: 400; body: { code: 'PASSWORD_POLICY'; error: string; issues: PasswordIssue[] } }
  | { status: 401; body: { code: 'CURRENT_PASSWORD_INCORRECT'; error: string } }
  | { status: 409; body: { code: 'PASSWORD_CHANGED_ELSEWHERE'; error: string } }
  | { status: 429; body: { code: 'THROTTLED'; error: string; retryAfterSeconds: number } }
  | { status: 503; body: { code: 'NOT_CONFIGURED'; error: string } }

export const INCORRECT_CURRENT = 'The current password is incorrect.'

function policyRefusal(issues: PasswordIssue[]): ChangePasswordResult {
  return {
    status: 400,
    body: { code: 'PASSWORD_POLICY', error: PASSWORD_ISSUE_MESSAGES[issues[0]], issues },
  }
}

function throttled(retryAfterMs: number): ChangePasswordResult {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return {
    status: 429,
    body: { code: 'THROTTLED', error: 'Too many attempts. Try again later.', retryAfterSeconds },
  }
}

/** Count a wrong current password with the failed sign-ins (hour, kind and country only). */
function recordFailure(req: NextApiRequest): void {
  try {
    recordAuthEvent({
      type: 'password-change-failed',
      method: 'password',
      country: requestOrigin(req).country,
    })
  } catch {
    // History is best effort; the lockout already counted it.
  }
}

/**
 * Verify, write, re-issue sessions, record and notify. The caller has
 * checked the session (ctx), the rate limit and — with "Require a passkey"
 * on — a recent verification.
 */
export async function changePassword(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AdminContext,
  input: ChangePasswordInput
): Promise<ChangePasswordResult> {
  ensureAdminFromEnv()
  let admin: AdminData | null
  try {
    admin = readAdminStrict()
  } catch {
    admin = null
  }
  if (!admin)
    return {
      status: 503,
      body: { code: 'NOT_CONFIGURED', error: 'The admin account is not set up yet.' },
    }

  // 1. The policy, before any hashing (and before any lockout bookkeeping).
  const host = siteHost()
  const issues = passwordIssues(
    checkNewPassword(input.newPassword, { email: admin.email, siteHost: host })
  )
  if (issues.length) return policyRefusal(issues)

  const bucket = clientKey(req)
  const written = await withPasswordLock(async () => {
    const before = readAdminStrict()
    if (!before) return { kind: 'missing' as const }
    // 2. The current password, exactly as sign-in checks it (same lockout).
    const outcome = await verifyCredentials(before.email, input.currentPassword, bucket)
    if (!outcome.ok)
      return outcome.reason === 'locked'
        ? { kind: 'locked' as const, retryAfterMs: outcome.retryAfterMs }
        : { kind: 'wrong' as const }
    // 3. Not the same password again.
    if (normalizePassword(input.currentPassword) === normalizePassword(input.newPassword))
      return { kind: 'same' as const }
    // 4. Fresh salt, async scrypt, atomic write, reset links burnt.
    const write = await changeAdminPassword(input.newPassword, {
      expectedHash: before.passwordHash,
      signOutEverywhere: input.signOutOthers,
    })
    return write.ok
      ? { kind: 'ok' as const, changedAt: write.changedAt, admin: before }
      : { kind: write.reason }
  })

  switch (written.kind) {
    case 'locked':
      recordFailure(req)
      return throttled(written.retryAfterMs)
    case 'wrong':
      recordFailure(req)
      return { status: 401, body: { code: 'CURRENT_PASSWORD_INCORRECT', error: INCORRECT_CURRENT } }
    case 'same':
      return policyRefusal(['sameAsCurrent'])
    case 'missing':
      return {
        status: 503,
        body: { code: 'NOT_CONFIGURED', error: 'The admin account is not set up yet.' },
      }
    case 'changed':
      return {
        status: 409,
        body: {
          code: 'PASSWORD_CHANGED_ELSEWHERE',
          error: 'The password was changed elsewhere a moment ago. Reload the page and try again.',
        },
      }
  }

  // 5. Sessions: a new one for this browser, then the others (when asked).
  const { changedAt } = written
  const origin = requestOrigin(req)
  const previousId = ctx.session?.id ?? null
  // The password just proven counts as a re-verification (as a password
  // step-up would) — unless "Require a passkey" is on: then the password
  // alone proves nothing, and the step-up this change needed keeps its time.
  const verifiedAt =
    stepUpMethods().recoveryRequired && ctx.session ? ctx.session.verifiedAt : changedAt
  let newSessionId: string | null = null
  try {
    const session = startAdminSession(req, res, {
      email: written.admin.email,
      method: ctx.session && ctx.session.method !== 'legacy' ? ctx.session.method : 'password',
      credentialId: ctx.session?.credentialId ?? null,
      knownDeviceId: knownDeviceIdOf(req, res),
      verifiedAt,
      record: false,
    })
    newSessionId = session.id
  } catch (err) {
    log.error('password change: this browser’s session could not be re-issued', { err })
  }
  let revoked = 0
  try {
    if (previousId && newSessionId)
      revokeSession(previousId, 'renewed after password change', changedAt)
    if (input.signOutOthers) {
      revoked = revokeSessionsExcept(newSessionId ?? previousId, 'password-changed', changedAt)
      endLegacyTokens(changedAt)
    }
  } catch (err) {
    // With "sign out other browsers" the session version bump has ended every other token already.
    log.error('password change: session rows not updated', { err })
  }
  // Signed in when the new session exists — or, keeping the others, when the old one still does.
  const signedIn = newSessionId !== null || !input.signOutOthers

  // 6. History, notice.
  try {
    recordAuthEvent({
      type: 'password-changed',
      sessionId: newSessionId ?? previousId,
      detail: input.signOutOthers
        ? `${revoked} other session(s) signed out`
        : 'other browsers kept',
      ...origin,
    })
  } catch {
    // Best effort, like every history entry.
  }
  notifyPasswordChanged({
    at: changedAt,
    device: origin.device,
    country: origin.country,
    signedOutOthers: input.signOutOthers,
    revoked,
    accountEmail: written.admin.email,
  })

  return {
    status: 200,
    body: {
      ok: true,
      changedAt,
      signedOutOthers: input.signOutOthers,
      revoked,
      signedIn,
      bootstrap: await bootstrapPasswordStatus(readAdmin()),
    },
  }
}

// ── Notice ───────────────────────────────────────────────────────────────

function countryName(code: string | null): string | null {
  if (!code) return null
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

/**
 * The "your admin password was changed" e-mail (pure): when, from which
 * browser and country (the coarse device label — never an IP address), what
 * happened to other browsers, and what to do if it was not the owner.
 */
export function passwordChangedMail(input: {
  at: number
  device: string | null
  country: string | null
  signedOutOthers: boolean
  revoked: number
  site: string
}): { subject: string; text: string } {
  const host = (() => {
    try {
      return new URL(input.site).host
    } catch {
      return input.site
    }
  })()
  const where = [input.device || 'an unknown browser', countryName(input.country)]
    .filter(Boolean)
    .join(', ')
  const others = input.signedOutOthers
    ? `Every other browser was signed out (${input.revoked} session${input.revoked === 1 ? '' : 's'}).`
    : 'Other signed-in browsers were kept signed in.'
  return {
    subject: `Your admin password on ${host} was changed`,
    text: [
      `The admin password of ${host} was changed on ${formatSiteTime(input.at)} (${new Date(input.at).toISOString().replace(/\.\d{3}Z$/, 'Z')}) from ${where}.`,
      others,
      '',
      'If this was you, there is nothing else to do.',
      '',
      'If it was not you:',
      `  1. Sign in with a passkey, or reset the password: ${input.site}/admin/forgot`,
      `  2. In Admin → Security (${input.site}/admin/security), choose "Sign out everywhere" and check the sign-in history.`,
      '  3. Change the password again, and remove ADMIN_PASS from the server’s .env if it is still set.',
      '',
      'This notice never contains a link that signs you in.',
    ].join('\n'),
  }
}

/** Whether SMTP is configured (lib/mailer sends nothing otherwise). */
function mailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

/** NOTIFY_EMAIL, else the account's own address — whichever looks like an address. */
export function noticeRecipient(accountEmail: string): string | null {
  for (const v of [process.env.NOTIFY_EMAIL, accountEmail]) {
    const s = String(v || '').trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s
  }
  return null
}

/** Fire and forget: the change has happened, a mail problem is only logged. */
function notifyPasswordChanged(input: {
  at: number
  device: string | null
  country: string | null
  signedOutOthers: boolean
  revoked: number
  accountEmail: string
}): void {
  if (!mailConfigured()) return
  const to = noticeRecipient(normalizeEmail(input.accountEmail))
  if (!to) return
  const mail = passwordChangedMail({ ...input, site: siteUrl() })
  sendMail({ to, subject: mail.subject, text: mail.text }).catch((err) =>
    log.warn('password change notice not sent', {
      err: err instanceof Error ? err.message : String(err),
    })
  )
}
