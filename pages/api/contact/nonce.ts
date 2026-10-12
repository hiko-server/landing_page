import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../../lib/env'
import { rateLimit } from '../../../lib/rateLimit'
import { challengeHash, newChallenge } from '../../../lib/security/contactChallenge'

/**
 * Signed nonce for the contact form's lightweight human-check.
 *
 * Flow:
 *   1. Client GET /api/contact/nonce on form mount → receives short-lived JWT
 *      and a small sum to show ({ token, challenge: { a, b } })
 *   2. Client posts nonce + the visitor's answer + an empty honeypot
 *   3. POST /api/contact verifies: nonce valid + ≥2s elapsed + honeypot empty
 *      + correct answer (HMAC bound to the nonce id, lib/security/
 *      contactChallenge.ts), and accepts at most one attempt per nonce
 *
 * Minting is stateless (the JWT carries its issued-at and expiry); the only
 * server state is pages/api/contact.ts's bounded used-nonce list. No external
 * service. Rate-limited so a bot can't churn nonces.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
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
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ token, challenge })
  } catch {
    return res.status(500).json({ error: 'Nonce mint failed' })
  }
}
