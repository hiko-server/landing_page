import type { NextApiRequest, NextApiResponse } from 'next'
import { rateLimit } from '../../lib/rateLimit'
import { sendMail } from '../../lib/mailer'

async function verifyHCaptcha(token?: string) {
  const secret = process.env.HCAPTCHA_SECRET
  if (!secret || !token) return false

  try {
    const res = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: new URLSearchParams({
        secret: secret,
        response: token,
        sitekey: process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || ''
      }).toString()
    })

    if (!res.ok) {
      console.error('hCaptcha verification failed:', await res.text())
      return false
    }

    const data = await res.json()
    return data.success === true
  } catch (err) {
    console.error('hCaptcha verification error:', err)
    return false
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const rl = rateLimit(req, 5, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many requests, try later' })

    const { name, email, subject, message, token } = req.body || {}
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (!token) {
      return res.status(400).json({ error: 'Captcha token is required' })
    }

    if (!process.env.HCAPTCHA_SECRET) {
      console.error('HCAPTCHA_SECRET is not configured')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    const captchaValid = await verifyHCaptcha(token)
    if (!captchaValid) {
      return res.status(400).json({ error: 'Captcha verification failed' })
    }

    const to = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL
    if (!to) return res.status(500).json({ error: 'Recipient not configured' })

    await sendMail({
      to,
      subject: `[Contact] ${subject}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Contact form error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
