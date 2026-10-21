import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteCookie } from 'cookies-next'
import { consumeResetToken, ensureAdminFromEnv, readAdmin, updatePassword } from '../../../lib/admin'
import { ADMIN_COOKIE, clearAdminHint, requestOrigin } from '../../../lib/auth'
import { withApi } from '../../../lib/apiHandler'
import { rateLimit } from '../../../lib/rateLimit'
import { revokeSessionsExcept } from '../../../lib/adminAuth/sessions'
import { recordAuthEvent } from '../../../lib/adminAuth/store'
import { siteHost } from '../../../lib/adminAuth/password'
import { checkNewPassword, PASSWORD_ISSUE_MESSAGES, passwordIssues } from '../../../lib/adminAuth/passwordPolicy'

/**
 * POST /api/auth/reset-password { token, password }
 *
 * A successful reset also bumps the session version (lib/admin
 * updatePassword), which signs out every device — including whoever may have
 * been holding a stolen session — and revokes every session row in auth.db
 * (lib/adminAuth/sessions). Passkeys and recovery codes stay: a reset proves
 * control of the mailbox, which is how the password was set in the first
 * place, and with "Require a passkey" on, the password alone still cannot
 * sign in. The new password follows the same rules as a change from Admin →
 * Security (lib/adminAuth/passwordPolicy: 12–256 characters after NFKC, not
 * common or predictable, not the account's or the site's name); a refused
 * password answers 400 PASSWORD_POLICY and leaves the link usable.
 */
export default withApi('auth/reset-password', (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  // Throttle per IP so a reset token can't be brute-forced.
  const rl = rateLimit(req, 5, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests, try later' })
  const { token, password } = req.body || {}
  if (typeof token !== 'string' || !/^[0-9a-f]{48}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid or expired token' })
  }
  // Validate BEFORE consuming the single-use token, so a rejected password
  // doesn't burn the reset link.
  if (typeof password !== 'string' || !password || password.length > 1024) {
    return res.status(400).json({ code: 'PASSWORD_POLICY', error: PASSWORD_ISSUE_MESSAGES.tooShort, issues: ['tooShort'] })
  }
  ensureAdminFromEnv()
  const admin = readAdmin()
  if (!admin) return res.status(500).json({ error: 'Admin not configured' })
  const issues = passwordIssues(checkNewPassword(password, { email: admin.email, siteHost: siteHost() }))
  if (issues.length) {
    return res.status(400).json({ code: 'PASSWORD_POLICY', error: PASSWORD_ISSUE_MESSAGES[issues[0]], issues })
  }
  const ok = consumeResetToken(token)
  if (!ok) return res.status(400).json({ error: 'Invalid or expired token' })
  updatePassword(password)
  try {
    const revoked = revokeSessionsExcept(null, 'password reset')
    recordAuthEvent({ type: 'password-reset', detail: `${revoked} session(s) signed out`, ...requestOrigin(req) })
  } catch {
    // The session version bump above already signed every device out.
  }
  deleteCookie(ADMIN_COOKIE, { req, res, path: '/' })
  clearAdminHint(req, res)
  return res.status(200).json({ ok: true })
})
