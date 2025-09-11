import type { NextApiRequest, NextApiResponse } from 'next'
import { rateLimit } from '../../lib/rateLimit'
import { sendMail } from '../../lib/mailer'

async function verifyHCaptcha(token?: string) {
  const secret = process.env.HCAPTCHA_SECRET
  if (!secret || !token) return false
  try {
    const res = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    })
    const data = await res.json()
    return !!data.success
  } catch {
    return false
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const rl = rateLimit(req, 5, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests, try later' })

  const { name, email, subject, message, token } = req.body || {}
  if (!name || !email || !subject || !message || !token) {
    return res.status(400).json({ error: 'Missing fields' })
  }
  const ok = await verifyHCaptcha(token)
  if (!ok) return res.status(400).json({ error: 'Captcha failed' })

  const to = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL
  if (!to) return res.status(500).json({ error: 'Recipient not configured' })

  await sendMail({
    to,
    subject: `[Contact] ${subject}`,
    text: `From: ${name} <${email}>\n\n${message}`,
  })

  return res.status(200).json({ ok: true })
}

