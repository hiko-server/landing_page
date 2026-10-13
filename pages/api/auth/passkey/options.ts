import { withApi } from '../../../../lib/apiHandler'
import { rateLimit, rateLimitNetwork } from '../../../../lib/rateLimit'
import { authenticationOptions, relyingPartyFor } from '../../../../lib/adminAuth/passkeys'

/**
 * POST /api/auth/passkey/options → { options } — a single-use sign-in
 * challenge (5 minutes) for a passkey, with no allow-list so the browser can
 * offer the site's passkeys, including through autofill on /admin/login.
 * Public; cross-site and non-JSON posts are refused by the middleware.
 * 400 PASSKEY_UNAVAILABLE when the host the browser uses cannot have a
 * relying-party id (an IP address).
 */
export default withApi('auth/passkey/options', async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  const hits = [
    rateLimit(req, 30, 5 * 60_000, 'auth:passkey-options'),
    rateLimitNetwork(req, 90, 5 * 60_000, 'auth:passkey-options:net48'),
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
  if (!rp) {
    return res.status(400).json({
      code: 'PASSKEY_UNAVAILABLE',
      error:
        'Passkeys need a host name. Open the admin through the site’s address (or localhost), not an IP address.',
    })
  }
  return res.status(200).json({ options: await authenticationOptions(rp, 'login', null) })
})
