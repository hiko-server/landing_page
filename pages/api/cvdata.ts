import type { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
import { getCookie } from 'cookies-next'
import { readCvData, writeCvData, syncStructure, saveSnapshot, listSnapshots, restoreSnapshot, readSnapshot } from '../../lib/cvdata'
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
    // snapshots list (admin only)
    if (req.query.snapshots === '1') {
      if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
      return res.status(200).json({ files: listSnapshots() })
    }
    // download current or a snapshot (admin only)
    if (req.query.download) {
      if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
      const file = (req.query.file as string | undefined) || undefined
      if (file) {
        const raw = readSnapshot(file)
        if (!raw) return res.status(404).json({ error: 'Not found' })
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Content-Disposition', `attachment; filename="${file}"`)
        return res.status(200).send(raw)
      } else {
        const data = readCvData()
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Content-Disposition', 'attachment; filename="cvdata.json"')
        return res.status(200).send(JSON.stringify(data, null, 2))
      }
    }
    const { en, zh } = readCvData()
    return res.status(200).json({ en, zh })
  }

  if (req.method === 'PUT') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    const rl = rateLimit(req, 30, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many updates, try later' })
    const { en, zh, syncZh } = req.body || {}
    if (!en && !zh) return res.status(400).json({ error: 'Missing payload' })
    const current = readCvData()
    // save snapshot before write
    try { saveSnapshot() } catch {}
    const newEn = en ?? current.en
    const newZh = syncZh ? syncStructure(newEn, zh ?? current.zh) : (zh ?? current.zh)
    writeCvData({ en: newEn, zh: newZh })
    try {
      const actor = (() => {
        const token = getCookie('cv_admin_token', { req, res }) as string | undefined
        if (!token) return 'unknown'
        try { const d = jwt.verify(token, getJwtSecret()) as any; return d.email || 'admin'; } catch { return 'admin' }
      })()
      sendMail({ to: process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'hi@hiko.dev', subject: 'CV updated', text: `CV updated by ${actor} at ${new Date().toISOString()}\nSyncZh=${!!syncZh}` })
    } catch {}
    return res.status(200).json({ ok: true })
  }

  // manual snapshot/import/restore ops
  if (req.method === 'POST') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    const { action, filename, data } = req.body || {}
    if (action === 'snapshot') {
      const file = saveSnapshot()
      return res.status(200).json({ ok: true, file })
    }
    if (action === 'restore') {
      if (!filename) return res.status(400).json({ error: 'Missing filename' })
      const ok = restoreSnapshot(filename)
      return ok ? res.status(200).json({ ok: true }) : res.status(404).json({ error: 'Not found' })
    }
    if (action === 'import') {
      // overwrite with provided JSON structure
      if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Missing data' })
      const { en, zh } = data as any
      if (!Array.isArray(en) || !Array.isArray(zh)) return res.status(400).json({ error: 'Invalid structure' })
      try { saveSnapshot() } catch {}
      writeCvData({ en, zh })
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  res.setHeader('Allow', 'GET,PUT,POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
