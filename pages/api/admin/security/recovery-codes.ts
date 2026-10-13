import { requestOrigin } from '../../../../lib/auth'
import { withApi } from '../../../../lib/apiHandler'
import { requireRecentAuth } from '../../../../lib/adminAuth/stepUp'
import { generateRecoveryCodes, recordAuthEvent } from '../../../../lib/adminAuth/store'

/**
 * POST /api/admin/security/recovery-codes → { codes } — a fresh set of ten
 * one-time recovery codes (every earlier code stops working). Shown once:
 * only SHA-256 hashes are stored. Needs a recent verification.
 */
export default withApi('admin/security/recovery-codes', (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const ctx = requireRecentAuth(req, res)
  if (!ctx) return
  const codes = generateRecoveryCodes()
  recordAuthEvent({
    type: 'recovery-codes-generated',
    sessionId: ctx.session?.id ?? null,
    ...requestOrigin(req),
  })
  return res.status(200).json({ codes })
})
