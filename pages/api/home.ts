import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { readHome, writeHome, saveHomeSnapshot, listHomeSnapshots, restoreHomeSnapshot, readHomeSnapshot, type HomeData } from '../../lib/home'
import { sendMail } from '../../lib/mailer'
import { getJwtSecret } from '../../lib/env'
import { rateLimit } from '../../lib/rateLimit'

function isAuthed(req: NextApiRequest, res: NextApiResponse) {
  const token = getCookie('cv_admin_token', { req, res }) as string | undefined
  if (!token) return false
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any
    return decoded?.role === 'admin'
  } catch {
    return false
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // List home snapshots
    if (req.query.snapshots === '1') {
      if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
      return res.status(200).json({ files: listHomeSnapshots() })
    }
    // Download a specific snapshot
    if (req.query.download) {
      if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
      const file = req.query.file as string | undefined
      if (file) {
        const raw = readHomeSnapshot(file)
        if (!raw) return res.status(404).json({ error: 'Not found' })
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Content-Disposition', `attachment; filename="${file}"`)
        return res.status(200).send(raw)
      }
      const data = readHome()
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', 'attachment; filename="home.json"')
      return res.status(200).send(JSON.stringify(data, null, 2))
    }
    const data = readHome()
    return res.status(200).json(data)
  }

  if (req.method === 'PUT') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    const rl = rateLimit(req, 30, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many updates, try later' })
    const body = req.body as HomeData
    if (!body || !body.hero || !body.socials || !Array.isArray(body.brands)) {
      return res.status(400).json({ error: 'Invalid payload' })
    }
    // Save snapshot before write
    try { saveHomeSnapshot() } catch {}
    writeHome(body)
    try {
      sendMail({ to: process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'hi@hiko.dev', subject: 'Home updated', text: `Home updated at ${new Date().toISOString()}` })
    } catch {}
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'POST') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    const { action, filename } = req.body || {}
    if (action === 'snapshot') {
      const file = saveHomeSnapshot()
      return res.status(200).json({ ok: true, file })
    }
    if (action === 'restore') {
      if (!filename) return res.status(400).json({ error: 'Missing filename' })
      const ok = restoreHomeSnapshot(filename)
      return ok ? res.status(200).json({ ok: true }) : res.status(404).json({ error: 'Not found' })
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  res.setHeader('Allow', 'GET,PUT,POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

