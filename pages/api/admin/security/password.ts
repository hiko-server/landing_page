import { withApi } from '../../../../lib/apiHandler'
import { readAdminContext } from '../../../../lib/auth'
import { rateLimit, rateLimitNetwork } from '../../../../lib/rateLimit'
import { changePassword, parseChangePasswordBody } from '../../../../lib/adminAuth/password'
import { requireRecentAuth, stepUpMethods } from '../../../../lib/adminAuth/stepUp'

/**
 * POST /api/admin/security/password
 *   { currentPassword, newPassword, signOutOthers? = true }
 *   → 200 { ok, changedAt, signedOutOthers, revoked, signedIn, bootstrap }
 *   → 400 PASSWORD_POLICY { error, issues }   the new password breaks a rule
 *   → 401 CURRENT_PASSWORD_INCORRECT          (NO_SESSION: not signed in;
 *                                             SIGNED_OUT: too many wrong current
 *                                             passwords — this session was ended)
 *   → 403 STEP_UP_REQUIRED                    "Require a passkey" is on and this
 *                                             browser has not verified recently
 *   → 409 PASSWORD_CHANGED_ELSEWHERE · 429 THROTTLED (Retry-After)
 *
 * Admin session required; the proxy refuses cross-site and non-JSON writes
 * (lib/security/csrf.ts) before this runs. 10 attempts per 15 minutes per
 * client and 30 per IPv6 /48, on top of the sign-in lockout the
 * current-password check shares, a per-session limit of wrong current
 * passwords (the session is signed out) and a site-wide cap on checks
 * (lib/adminAuth/password.ts has the whole sequence).
 *
 * Step-up: the current password IS the re-authentication, so with the
 * password allowed to sign in nothing else is asked (no double prompt). With
 * "Require a passkey" on, the password alone proves nothing anywhere in the
 * admin, so the change also needs a recent verification — a passkey, or the
 * password plus a recovery code — like every other dangerous action
 * (lib/adminAuth/stepUp.ts; the Security page asks first with
 * fetchWithStepUp).
 */
export default withApi('admin/security/password', async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  let ctx = readAdminContext(req, res)
  if (!ctx) return res.status(401).json({ code: 'NO_SESSION', error: 'Unauthorized' })

  const hits = [
    rateLimit(req, 10, 15 * 60_000, 'admin:password-change'),
    // One IPv6 allocation must not multiply its budget across its /64s.
    rateLimitNetwork(req, 30, 15 * 60_000, 'admin:password-change:net48'),
  ]
  res.setHeader('X-RateLimit-Remaining', String(Math.min(...hits.map((h) => h.remaining))))
  const refused = hits.filter((h) => !h.allowed)
  if (refused.length) {
    const resetAt = Math.max(...refused.map((h) => h.resetAt))
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
    res.setHeader('Retry-After', String(retryAfterSeconds))
    return res
      .status(429)
      .json({ code: 'THROTTLED', error: 'Too many attempts. Try again later.', retryAfterSeconds })
  }

  const input = parseChangePasswordBody(req.body)
  if (!input)
    return res
      .status(400)
      .json({
        code: 'INVALID_INPUT',
        error: 'Send { currentPassword, newPassword, signOutOthers }.',
      })

  if (stepUpMethods().recoveryRequired) {
    ctx = requireRecentAuth(req, res)
    if (!ctx) return
  }

  const result = await changePassword(req, res, ctx, input)
  if (result.status === 429) res.setHeader('Retry-After', String(result.body.retryAfterSeconds))
  return res.status(result.status).json(result.body)
})
