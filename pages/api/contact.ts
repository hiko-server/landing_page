import type { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
import { rateLimit } from '../../lib/rateLimit'
import { sendMail } from '../../lib/mailer'
import { getJwtSecret } from '../../lib/env'

/**
 * Contact endpoint.
 *
 * v6 replaces hCaptcha with a stateless three-layer human check:
 *   1. Signed nonce from /api/contact/nonce (JWT, 10-min TTL)
 *      → proves the form was actually loaded by a browser
 *      → also encodes issued-at so we can require ≥ 2s elapsed
 *   2. Math captcha answer (verified client-side; server only enforces the
 *      field is present and non-empty — math is for UX deterrence of dumb bots)
 *   3. Honeypot field 'hp' (hidden from humans, bots auto-fill)
 *      → if non-empty, reject silently with 200 so the bot thinks it worked
 *
 * No external dependency. No HCAPTCHA_SECRET env required.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const rl = rateLimit(req, 5, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many requests, try later' })

    const { name, email, subject, message, nonce, mathAnswer, hp } = req.body || {}

    // 1. Honeypot (silent accept — pretend it worked so bot doesn't retry)
    if (typeof hp === 'string' && hp.trim().length > 0) {
      return res.status(200).json({ ok: true })
    }

    // 2. Required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // 3. Nonce
    if (!nonce || typeof nonce !== 'string') {
      return res.status(400).json({ error: 'Missing verification token' })
    }
    try {
      const decoded = jwt.verify(nonce, getJwtSecret()) as { iat?: number; t?: string }
      if (decoded.t !== 'contact-nonce') {
        return res.status(400).json({ error: 'Invalid verification token' })
      }
      const issuedAt = (decoded.iat || 0) * 1000
      const elapsed = Date.now() - issuedAt
      if (elapsed < 2_000) {
        return res.status(400).json({ error: 'Please slow down a moment.' })
      }
    } catch {
      return res.status(400).json({ error: 'Verification token expired — refresh the form.' })
    }

    // 4. Math captcha — server only checks it's present (UX deterrent only)
    if (!mathAnswer && mathAnswer !== 0) {
      return res.status(400).json({ error: 'Please complete the human check.' })
    }

    // 5. Sanitize: strip CR/LF (mail-header injection) + cap lengths.
    const clean = (v: unknown, max: number) =>
      String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, max).trim()
    const safeName = clean(name, 200)
    const safeEmail = clean(email, 254)
    const safeSubject = clean(subject, 200)
    const safeMessage = String(message ?? '').slice(0, 10_000)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' })
    }

    // 6. Deliver — and NEVER drop the message silently. If SMTP is unconfigured
    // or the send fails, persist to the bind-mounted data dir so the message is
    // recoverable, and log loudly (captured by Sentry once a DSN is set).
    const to = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL
    if (!to) return res.status(500).json({ error: 'Recipient not configured' })

    let delivered = false
    try {
      const result = await sendMail({
        to,
        subject: `[Contact] ${safeSubject}`,
        text: `From: ${safeName} <${safeEmail}>\n\n${safeMessage}`,
      })
      delivered = !!result?.ok
    } catch (e) {
      console.error('[contact] sendMail threw', e)
    }
    if (!delivered) {
      try {
        const fs = await import('fs')
        const path = await import('path')
        const dir = path.join(process.cwd(), 'data')
        fs.mkdirSync(dir, { recursive: true })
        fs.appendFileSync(
          path.join(dir, 'contact-inbox.jsonl'),
          JSON.stringify({ at: new Date().toISOString(), name: safeName, email: safeEmail, subject: safeSubject, message: safeMessage }) + '\n',
          'utf-8',
        )
        console.error('[contact] mail NOT delivered — saved to data/contact-inbox.jsonl')
      } catch (e) {
        console.error('[contact] FAILED to persist fallback contact message', e)
      }
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Contact form error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
