import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { readHome, writeHome, type HomeData } from '../../lib/home'
import { sendMail } from '../../lib/mailer'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me'

function isAuthed(req: NextApiRequest, res: NextApiResponse) {
  const token = getCookie('cv_admin_token', { req, res }) as string | undefined
  if (!token) return false
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    return decoded?.role === 'admin'
  } catch {
    return false
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const data = readHome()
    return res.status(200).json(data)
  }
  if (req.method === 'PUT') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    const body = req.body as HomeData
    if (!body || !body.hero || !body.socials || !Array.isArray(body.brands)) {
      return res.status(400).json({ error: 'Invalid payload' })
    }
    writeHome(body)
    try {
      sendMail({ to: process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'hi@hiko.dev', subject: 'Home updated', text: `Home updated at ${new Date().toISOString()}` })
    } catch {}
    return res.status(200).json({ ok: true })
  }
  res.setHeader('Allow', 'GET,PUT')
  return res.status(405).json({ error: 'Method not allowed' })
}
