import type { NextApiRequest } from 'next'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import {
  clearLoginFailures,
  ensureAdminFromEnv,
  readAdmin,
  recordLoginFailure,
  verifyCredentials,
} from '../../../../lib/admin'
import { readAdminContext, requestOrigin, startAdminSession } from '../../../../lib/auth'
import { withApi } from '../../../../lib/apiHandler'
import { clientKey, rateLimit } from '../../../../lib/rateLimit'
import {
  authenticationOptions,
  passkeyCount,
  PasskeyError,
  relyingPartyFor,
  verifyAuthentication,
} from '../../../../lib/adminAuth/passkeys'
import { markVerified } from '../../../../lib/adminAuth/sessions'
import { recentAuthWindowMs, stepUpMethods } from '../../../../lib/adminAuth/stepUp'
import {
  consumeRecoveryCode,
  isPasskeyRequired,
  recordAuthEvent,
  type AuthMethod,
} from '../../../../lib/adminAuth/store'

/**
 * Step-up: prove it is still you on this browser (lib/adminAuth/stepUp.ts).
 *
 *   POST { action: 'options' }                       → { options }  passkey challenge
 *                                                      (single use, 5 min, bound to this session)
 *   POST { method: 'passkey', response }             → { ok, recentUntil }
 *   POST { method: 'password', password, recoveryCode? } → { ok, recentUntil }
 *        (with "Require a passkey" on, the password needs a recovery code too)
 *
 * Password checks share the sign-in lockout (lib/admin verifyCredentials);
 * 10 attempts per 10 minutes per client on top. Success stamps the session's
 * verified_at; a session from before sessions existed is replaced by a new
 * one. Every attempt goes to the sign-in history.
 */
const MAX_RESPONSE_CHARS = 16_384

function passkeyResponse(req: NextApiRequest): AuthenticationResponseJSON | null {
  const r = (req.body as { response?: unknown } | null)?.response
  if (
    !r ||
    typeof r !== 'object' ||
    Array.isArray(r) ||
    JSON.stringify(r).length > MAX_RESPONSE_CHARS
  )
    return null
  const o = r as Record<string, unknown>
  return typeof o.id === 'string' &&
    o.type === 'public-key' &&
    o.response &&
    typeof o.response === 'object'
    ? (r as AuthenticationResponseJSON)
    : null
}

export default withApi('admin/security/verify', async (req, res, apiCtx) => {
  const ctx = readAdminContext(req, res)
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const body = (req.body || {}) as {
    action?: unknown
    method?: unknown
    password?: unknown
    recoveryCode?: unknown
  }

  if (body.action === 'options') {
    const rp = relyingPartyFor(req)
    if (!rp)
      return res
        .status(400)
        .json({ code: 'PASSKEY_UNAVAILABLE', error: 'Passkeys are not available on this host.' })
    if (!passkeyCount()) return res.status(409).json({ error: 'No passkey is registered yet.' })
    if (!ctx.session)
      return res
        .status(409)
        .json({ error: 'Confirm with your password once; this session predates passkeys.' })
    const rl = rateLimit(req, 30, 10 * 60_000, 'admin:step-up-options')
    if (!rl.allowed)
      return res.status(429).json({ error: 'Too many attempts — try again shortly.' })
    return res
      .status(200)
      .json({ options: await authenticationOptions(rp, 'step-up', ctx.session.id) })
  }

  const rl = rateLimit(req, 10, 10 * 60_000, 'admin:step-up')
  if (!rl.allowed)
    return res.status(429).json({ error: 'Too many attempts — try again in a few minutes.' })
  ensureAdminFromEnv()
  const admin = readAdmin()
  if (!admin) return res.status(503).json({ error: 'The admin account is not set up yet.' })
  const origin = requestOrigin(req)
  const fail = (method: AuthMethod, status: number, payload: Record<string, unknown>) => {
    recordAuthEvent({
      type: 'step-up-failed',
      method,
      sessionId: ctx.session?.id ?? null,
      ...origin,
    })
    return res.status(status).json(payload)
  }

  let method: AuthMethod
  if (body.method === 'passkey') {
    const rp = relyingPartyFor(req)
    if (!rp)
      return res
        .status(400)
        .json({ code: 'PASSKEY_UNAVAILABLE', error: 'Passkeys are not available on this host.' })
    const response = passkeyResponse(req)
    if (!response || !ctx.session)
      return res.status(400).json({ error: 'Missing or invalid passkey response' })
    try {
      await verifyAuthentication(rp, 'step-up', ctx.session.id, response)
    } catch (err) {
      if (err instanceof PasskeyError)
        return fail('passkey', 401, { code: err.code, error: err.message })
      apiCtx.log.error('step-up passkey check failed unexpectedly', { err })
      return res.status(500).json({ error: 'Verification is unavailable right now.' })
    }
    method = 'passkey'
  } else if (body.method === 'password') {
    if (typeof body.password !== 'string' || !body.password || body.password.length > 1024) {
      return res.status(400).json({ error: 'Enter your password.' })
    }
    const recoveryRequired = stepUpMethods().recoveryRequired
    if (recoveryRequired && (typeof body.recoveryCode !== 'string' || !body.recoveryCode.trim())) {
      return res
        .status(400)
        .json({
          code: 'RECOVERY_CODE_REQUIRED',
          error: 'With “Require a passkey” on, the password needs one of your recovery codes.',
        })
    }
    const bucket = clientKey(req)
    const outcome = await verifyCredentials(admin.email, body.password, bucket, {
      secondStepFollows: recoveryRequired,
    })
    if (!outcome.ok) {
      if (outcome.reason === 'locked') {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(outcome.retryAfterMs / 1000))))
        return fail('password', 429, { error: 'Too many attempts — try again later.' })
      }
      return fail(recoveryRequired ? 'recovery' : 'password', 401, {
        error: recoveryRequired
          ? 'The password or the recovery code is not right.'
          : 'That password is not right.',
      })
    }
    method = 'password'
    if (recoveryRequired) {
      if (!consumeRecoveryCode(body.recoveryCode)) {
        recordLoginFailure(admin.email, bucket)
        return fail('recovery', 401, { error: 'The password or the recovery code is not right.' })
      }
      clearLoginFailures(admin.email, bucket)
      method = 'recovery'
      recordAuthEvent({
        type: 'recovery-code-used',
        method,
        sessionId: ctx.session?.id ?? null,
        ...origin,
      })
    }
  } else {
    return res.status(400).json({ error: 'Send { method: "passkey" | "password" }' })
  }

  const now = Date.now()
  let sessionId = ctx.session?.id ?? null
  if (ctx.session) markVerified(ctx.session.id, now)
  else sessionId = startAdminSession(req, res, { email: admin.email, method, record: false }).id
  recordAuthEvent({ type: 'step-up', method, sessionId, ...origin })
  return res
    .status(200)
    .json({
      ok: true,
      recentUntil: now + recentAuthWindowMs(),
      passkeyRequired: isPasskeyRequired(),
    })
})
