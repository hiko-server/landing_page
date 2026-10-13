import { requestOrigin } from '../../../../lib/auth'
import { withApi } from '../../../../lib/apiHandler'
import { passkeyCount } from '../../../../lib/adminAuth/passkeys'
import { requireRecentAuth } from '../../../../lib/adminAuth/stepUp'
import {
  generateRecoveryCodes,
  isPasskeyRequired,
  recordAuthEvent,
  recoveryStatus,
  setPasskeyRequired,
} from '../../../../lib/adminAuth/store'

/**
 * PUT /api/admin/security/policy { passkeyRequired } → { passkeyRequired, recoveryCodes? }
 *
 * "Require a passkey": password sign-in (and password step-up) then also
 * needs a one-time recovery code. Turning it on needs at least one passkey;
 * when no unused recovery code is left, a fresh set is created and returned
 * once, so the owner can never lock themselves out. Needs a recent
 * verification.
 */
export default withApi('admin/security/policy', (req, res) => {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const ctx = requireRecentAuth(req, res)
  if (!ctx) return
  const wanted = (req.body as { passkeyRequired?: unknown } | null)?.passkeyRequired
  if (typeof wanted !== 'boolean')
    return res.status(400).json({ error: 'Send { passkeyRequired: true | false }' })
  if (wanted && passkeyCount() === 0) {
    return res.status(409).json({ code: 'NO_PASSKEY', error: 'Add a passkey first.' })
  }
  let recoveryCodes: string[] | undefined
  if (wanted && recoveryStatus().remaining === 0) {
    recoveryCodes = generateRecoveryCodes()
    recordAuthEvent({
      type: 'recovery-codes-generated',
      sessionId: ctx.session?.id ?? null,
      ...requestOrigin(req),
    })
  }
  if (wanted !== isPasskeyRequired()) {
    setPasskeyRequired(wanted)
    recordAuthEvent({
      type: 'policy-changed',
      sessionId: ctx.session?.id ?? null,
      detail: wanted ? 'passkey required' : 'password allowed',
      ...requestOrigin(req),
    })
  }
  return res
    .status(200)
    .json({ passkeyRequired: wanted, ...(recoveryCodes ? { recoveryCodes } : {}) })
})
