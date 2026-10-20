import { bumpSessionVersion } from '../../../../lib/admin'
import { clearAdminCookies, readAdminContext, requestOrigin } from '../../../../lib/auth'
import { withApi } from '../../../../lib/apiHandler'
import {
  revokeSession,
  revokeSessionsExcept,
  SESSION_ID_RE,
} from '../../../../lib/adminAuth/sessions'
import { requireRecentAuth } from '../../../../lib/adminAuth/stepUp'
import { endLegacyTokens, recordAuthEvent } from '../../../../lib/adminAuth/store'

/**
 * Sign browsers out (admin only):
 *
 *   DELETE { id }            → { ok }       one browser (another one needs a recent verification)
 *   DELETE { others: true }  → { revoked }  every browser but this one (recent verification)
 *   DELETE { all: true }     → { revoked }  every browser, this one included: also bumps the
 *                                           session version (recent verification)
 *
 * A signed-out browser's next request is refused (lib/auth readAdminContext).
 * Every one of these also ends the tokens from before sessions existed (no
 * session id, so never listed or revocable one by one; lib/adminAuth/store
 * endLegacyTokens): signing any browser out leaves none of them valid. The
 * caller never holds one (each action needs a session row), so this never
 * signs the caller out by itself.
 */
export default withApi('admin/security/sessions', (req, res) => {
  const ctx = readAdminContext(req, res)
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const body = (req.body || {}) as { id?: unknown; others?: unknown; all?: unknown }
  const origin = requestOrigin(req)
  const currentId = ctx.session?.id ?? null

  if (typeof body.id === 'string') {
    if (!SESSION_ID_RE.test(body.id)) return res.status(400).json({ error: 'Invalid session id' })
    const own = body.id === currentId
    if (!own && !requireRecentAuth(req, res)) return
    if (!revokeSession(body.id, own ? 'signed out' : 'signed out from another browser'))
      return res.status(404).json({ error: 'Not found' })
    endLegacyTokens()
    recordAuthEvent({ type: own ? 'signout' : 'session-revoked', sessionId: body.id, ...origin })
    if (own) clearAdminCookies(req, res)
    return res.status(200).json({ ok: true })
  }

  if (body.others === true || body.all === true) {
    if (!requireRecentAuth(req, res)) return
    const all = body.all === true
    const revoked = revokeSessionsExcept(
      all ? null : currentId,
      all ? 'signed out everywhere' : 'signed out from another browser'
    )
    endLegacyTokens()
    if (all) {
      bumpSessionVersion()
      clearAdminCookies(req, res)
    }
    recordAuthEvent({
      type: 'sessions-revoked',
      sessionId: currentId,
      detail: all ? `everywhere (${revoked})` : `other browsers (${revoked})`,
      ...origin,
    })
    return res.status(200).json({ revoked })
  }

  return res.status(400).json({ error: 'Send { id }, { others: true } or { all: true }' })
})
