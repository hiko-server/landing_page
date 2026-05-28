import type { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../../lib/env'
import { rateLimit } from '../../../lib/rateLimit'

/**
 * Signed nonce for the contact form's lightweight human-check.
 *
 * Flow:
 *   1. Client GET /api/contact/nonce on form mount → receives short-lived JWT
 *   2. Client embeds nonce + a tiny math captcha answer + an empty honeypot
 *   3. POST /api/contact verifies: nonce valid + ≥2s elapsed + honeypot empty
 *
 * Stateless on the server (JWT carries the issued-at), no external service.
 * Rate-limited so a bot can't churn nonces.
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
    const token = jwt.sign(
      { t: 'contact-nonce', iat: Math.floor(Date.now() / 1000) },
      getJwtSecret(),
      { expiresIn: '10m' },
    )
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ token })
  } catch {
    return res.status(500).json({ error: 'Nonce mint failed' })
  }
}
