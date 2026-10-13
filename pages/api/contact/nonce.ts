import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../../lib/env'
import { rateLimit } from '../../../lib/rateLimit'
import { challengeHash, newChallenge } from '../../../lib/security/contactChallenge'
import { withApi } from '../../../lib/apiHandler'
import { contactRetentionDays } from '../../../lib/retention'

/**
 * Signed nonce for the contact form's lightweight human-check.
 *
 * Flow:
 *   1. Client GET /api/contact/nonce on form mount → receives short-lived JWT
 *      and a small sum to show ({ token, challenge: { a, b }, retentionDays })
 *   2. Client posts nonce + the visitor's answer + an empty honeypot
 *   3. POST /api/contact verifies: nonce valid + ≥2s elapsed + honeypot empty
 *      + correct answer (HMAC bound to the nonce id, lib/security/
 *      contactChallenge.ts), and accepts at most one attempt per nonce
 *
 * Minting is stateless (the JWT carries its issued-at and expiry); the only
 * server state is pages/api/contact.ts's bounded used-nonce list. No external
 * service. Rate-limited so a bot can't churn nonces.
 *
 * Caching: `private, no-cache, max-age=0` — never stored by a shared cache,
 * revalidated on every use, and the client fetches with cache:'no-store'
 * anyway; a nonce is single-use and HMAC-bound server side, so a copy could
 * not be replayed. Not `no-store`: a no-store fetch response is one of
 * Chrome's reasons to keep a page out of the back/forward cache
 * (JsNetworkRequestReceivedCacheControlNoStoreResource), so the contact
 * form's challenge would cost every page that shows it its instant Back
 * (FIX-22).
 */
export const NONCE_CACHE_CONTROL = 'private, no-cache, max-age=0'
export default withApi('contact/nonce', (req, res, { log }) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rl = rateLimit(req, 20, 5 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' })

  try {
    const secret = getJwtSecret()
    // `jti` makes every nonce unique (two minted in the same second would
    // otherwise be identical), so single use is tracked per visitor.
    const jti = crypto.randomBytes(12).toString('base64url')
    const challenge = newChallenge()
    const token = jwt.sign(
      // `ah`: HMAC of the expected answer — the sum itself is never in the token.
      { t: 'contact-nonce', iat: Math.floor(Date.now() / 1000), jti, ah: challengeHash(secret, jti, challenge.a + challenge.b) },
      secret,
      // Audience keeps a contact nonce from ever being accepted as anything
      // else signed with the same secret (e.g. an admin session) and vice versa.
      { expiresIn: '30m', audience: 'contact-form', algorithm: 'HS256' },
    )
    res.setHeader('Cache-Control', NONCE_CACHE_CONTROL)
    // The form's privacy notice states the period (pages that are not
    // regenerated with the server's env, e.g. the home page form, read it here).
    return res.status(200).json({ token, challenge, retentionDays: contactRetentionDays() })
  } catch (err) {
    log.error('contact nonce: mint failed', { err })
    return res.status(500).json({ error: 'Nonce mint failed' })
  }
})
