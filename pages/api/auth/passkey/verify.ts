import type { NextApiRequest } from 'next'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { ensureAdminFromEnv, readAdmin } from '../../../../lib/admin'
import { knownDeviceIdOf, requestOrigin, startAdminSession } from '../../../../lib/auth'
import { withApi } from '../../../../lib/apiHandler'
import { rateLimit, rateLimitNetwork } from '../../../../lib/rateLimit'
import {
  PasskeyError,
  relyingPartyFor,
  verifyAuthentication,
} from '../../../../lib/adminAuth/passkeys'
import { recordAuthEvent } from '../../../../lib/adminAuth/store'

/**
 * POST /api/auth/passkey/verify { response } — sign in with a passkey.
 *
 * The response must answer a challenge from /api/auth/passkey/options that
 * is unexpired and unused (it is consumed here either way), come from the
 * expected origin and relying party, carry user verification and a valid
 * signature from a registered credential with a fresh counter
 * (lib/adminAuth/passkeys.ts). On success: a session row, the session
 * cookies and a sign-in history entry. A passkey is phishing-resistant and
 * a second factor in itself, so "Require a passkey" never asks for more.
 *
 * 401 `{ code: 'UNKNOWN_CREDENTIAL', credentialId }` tells the browser the
 * passkey it offered no longer exists here, so the login page can ask the
 * authenticator to forget it (WebAuthn signalUnknownCredential).
 * Rate limits: 10 / 5 min per client, 30 per IPv6 /48.
 */
const MAX_RESPONSE_CHARS = 16_384

function responseOf(req: NextApiRequest): AuthenticationResponseJSON | null {
  const body = req.body as { response?: unknown } | null
  const r = body?.response
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null
  if (JSON.stringify(r).length > MAX_RESPONSE_CHARS) return null
  const o = r as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.rawId !== 'string' || o.type !== 'public-key')
    return null
  if (!o.response || typeof o.response !== 'object') return null
  return r as AuthenticationResponseJSON
}

export default withApi('auth/passkey/verify', async (req, res, ctx) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const hits = [
    rateLimit(req, 10, 5 * 60_000, 'auth:passkey-verify'),
    rateLimitNetwork(req, 30, 5 * 60_000, 'auth:passkey-verify:net48'),
  ]
  const refused = hits.filter((h) => !h.allowed)
  if (refused.length) {
    res.setHeader(
      'Retry-After',
      String(
        Math.max(1, Math.ceil((Math.max(...refused.map((h) => h.resetAt)) - Date.now()) / 1000))
      )
    )
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait and try again.' })
  }
  const rp = relyingPartyFor(req)
  if (!rp)
    return res
      .status(400)
      .json({ code: 'PASSKEY_UNAVAILABLE', error: 'Passkeys are not available on this host.' })
  const response = responseOf(req)
  if (!response) return res.status(400).json({ error: 'Missing or invalid passkey response' })

  ensureAdminFromEnv()
  const admin = readAdmin()
  if (!admin) return res.status(503).json({ error: 'The admin account is not set up yet.' })

  try {
    const passkey = await verifyAuthentication(rp, 'login', null, response)
    startAdminSession(req, res, {
      email: admin.email,
      method: 'passkey',
      credentialId: passkey.id,
      knownDeviceId: knownDeviceIdOf(req, res),
    })
    return res.status(200).json({ ok: true })
  } catch (err) {
    if (err instanceof PasskeyError) {
      try {
        recordAuthEvent({
          type: 'signin-failed',
          method: 'passkey',
          country: requestOrigin(req).country,
          detail: err.code.toLowerCase(),
        })
      } catch {
        // History is best effort.
      }
      if (err.code === 'UNKNOWN_CREDENTIAL') {
        return res
          .status(401)
          .json({ code: err.code, error: err.message, credentialId: response.id })
      }
      return res.status(401).json({ code: err.code, error: err.message })
    }
    ctx.log.error('passkey sign-in failed unexpectedly', { err })
    return res.status(500).json({ error: 'Sign-in is unavailable right now. Please try again.' })
  }
})
