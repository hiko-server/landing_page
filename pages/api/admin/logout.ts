import type { NextApiRequest, NextApiResponse } from 'next'
import { bumpSessionVersion } from '../../../lib/admin'
import { clearAdminCookies, readAdminContext, requestOrigin } from '../../../lib/auth'
import { withApi } from '../../../lib/apiHandler'
import { revokeSession } from '../../../lib/adminAuth/sessions'
import { endLegacyTokens, recordAuthEvent } from '../../../lib/adminAuth/store'

/**
 * POST /api/admin/logout — signs THIS browser out.
 *
 * With a valid session, its auth.db row is revoked, so the token is dead
 * even if a copy of the cookie survives anywhere; other browsers stay signed
 * in (sign them out from Admin → Security) — except any still holding a
 * token from before sessions existed: those carry no session id, cannot be
 * listed or revoked one by one, and are all refused from now on
 * (lib/adminAuth/store endLegacyTokens). When this browser itself holds such
 * a token, the stored session version is bumped instead, which signs out
 * every device (the old behaviour).
 * Without a valid session it only clears this browser's cookies — an
 * anonymous POST must not be able to sign the owner out. Reachable without
 * a session (middleware allow-list) so a stale cookie can always be cleared;
 * cross-site POSTs are refused by the middleware.
 * Draft Mode is switched off too: its bypass cookie alone makes /blog and
 * /work render unpublished drafts, so it must not outlive the session.
 */
export default withApi('admin/logout', (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const ctx = readAdminContext(req, res)
  let revokedAllSessions = false
  if (ctx?.session) {
    revokeSession(ctx.session.id, 'signed out')
    endLegacyTokens()
    try {
      recordAuthEvent({ type: 'signout', sessionId: ctx.session.id, ...requestOrigin(req) })
    } catch {
      // History is best effort; the session is revoked either way.
    }
  } else if (ctx) {
    bumpSessionVersion()
    revokedAllSessions = true
  }
  clearAdminCookies(req, res)
  res.setDraftMode({ enable: false })
  return res.status(200).json({ ok: true, signedOut: ctx !== null, revokedAllSessions })
})
