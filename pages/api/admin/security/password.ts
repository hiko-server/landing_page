import { withApi } from '../../../../lib/apiHandler'
import { readAdminContext } from '../../../../lib/auth'
import { rateLimit } from '../../../../lib/rateLimit'
import { changePassword, parseChangePasswordBody } from '../../../../lib/adminAuth/password'
import { requireRecentAuth, stepUpMethods } from '../../../../lib/adminAuth/stepUp'

/**
 * POST /api/admin/security/password
 *   { currentPassword, newPassword, signOutOthers? = true }
 *   → 200 { ok, changedAt, signedOutOthers, revoked, signedIn, bootstrap }
 *   → 400 PASSWORD_POLICY { error, issues }   the new password breaks a rule
 *   → 401 CURRENT_PASSWORD_INCORRECT          (NO_SESSION: not signed in)
 *   → 403 STEP_UP_REQUIRED                    "Require a passkey" is on and this
 *                                             browser has not verified recently
 *   → 409 PASSWORD_CHANGED_ELSEWHERE · 429 THROTTLED (Retry-After)
 *
 * Admin session required; the proxy refuses cross-site and non-JSON writes
 * (lib/security/csrf.ts) before this runs. 10 attempts per 15 minutes per
 * client, on top of the sign-in lockout the current-password check shares
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

  const rl = rateLimit(req, 10, 15 * 60_000, 'admin:password-change')
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
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
