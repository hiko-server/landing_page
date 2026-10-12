import type { NextApiRequest, NextApiResponse } from 'next'
import { readCvData, readPublicCvData, writeCvData, syncLanguage, saveSnapshot, listSnapshots, restoreSnapshot, readSnapshot } from '../../lib/cvdata'
import { sendMail } from '../../lib/mailer'
import { rateLimit } from '../../lib/rateLimit'
import { isAdminRequest, readAdminClaims } from '../../lib/auth'

const isAuthed = isAdminRequest

/**
 * Accept real JSON values, or a JSON string (with a BOM / trailing commas
 * tolerated). String *contents* are never rewritten.
 */
function parseLoose(v: any): any {
  if (typeof v !== 'string') return v
  const src = v.replace(/^\uFEFF/, '')
  try {
    return JSON.parse(src)
  } catch {
    try {
      return JSON.parse(src.replace(/,(\s*[}\]])/g, '$1'))
    } catch {
      return undefined
    }
  }
}

function isSectionArray(v: unknown): v is any[] {
  return Array.isArray(v) && v.every((s) => s && typeof s === 'object' && typeof (s as any).sessionName === 'string')
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    // Admins get the full document (with visibility metadata) for editing;
    // everyone else gets the public view — hidden sections, entries, fields
    // and bullets never leave the server.
    if (isAuthed(req, res)) {
      res.setHeader('Cache-Control', 'private, no-store')
      const { en, zh } = readCvData()
      return res.status(200).json({ en, zh })
    }
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
    res.setHeader('Vary', 'Cookie')
    const { en, zh } = readPublicCvData('any')
    return res.status(200).json({ en, zh })
  }

  if (req.method === 'PUT') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    const rl = rateLimit(req, 30, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many updates, try later' })
    const { syncZh } = (req.body || {}) as any
    const en = parseLoose((req.body || {}).en)
    const zh = parseLoose((req.body || {}).zh)
    if (en === undefined && zh === undefined) return res.status(400).json({ error: 'Missing payload' })
    if ((en !== undefined && !isSectionArray(en)) || (zh !== undefined && !isSectionArray(zh))) {
      return res.status(400).json({ error: 'Each language must be an array of sections with a string "sessionName"' })
    }
    const current = readCvData()
    // save snapshot before write
    try {
      saveSnapshot()
    } catch (err) {
      console.warn('cvdata: snapshot before write failed', err)
    }
    const newEn = Array.isArray(en) ? en : current.en
    const baseZh = Array.isArray(zh) ? zh : current.zh
    const newZh = syncZh ? syncLanguage(newEn, baseZh) : baseZh
    const writeResult = await writeCvData({ en: newEn, zh: newZh })
    if (!writeResult.ok) return res.status(500).json({ error: writeResult.error })
    const actor = readAdminClaims(req, res)?.email || 'admin'
    sendMail({
      to: process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'hi@lucian-dev.com',
      subject: 'CV updated',
      text: `CV updated by ${actor} at ${new Date().toISOString()}\nSyncZh=${!!syncZh}`,
    }).catch((err) => console.warn('cvdata: notification mail failed', err?.message || err))
    return res.status(200).json(writeResult)
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
      // Keep the current state recoverable: restoring is itself undoable.
      try {
        saveSnapshot()
      } catch (err) {
        console.warn('cvdata: snapshot before restore failed', err)
      }
      const result = await restoreSnapshot(filename)
      if (!result.ok) return res.status(404).json({ error: result.error })
      return res.status(200).json(result)
    }
    if (action === 'import') {
      // overwrite with provided JSON structure
      const payload = parseLoose(data) ?? data
      if (!payload) return res.status(400).json({ error: 'Missing data' })
      // Accept either { en, zh } or a single array meaning EN only
      let enIn: any[] | undefined
      let zhIn: any[] | undefined
      if (Array.isArray(payload)) {
        enIn = payload
        zhIn = []
      } else if (typeof payload === 'object') {
        enIn = Array.isArray((payload as any).en) ? (payload as any).en : undefined
        zhIn = Array.isArray((payload as any).zh) ? (payload as any).zh : undefined
      }
      if (!enIn && !zhIn) return res.status(400).json({ error: 'Invalid structure' })
      const current = readCvData()
      const newEn = enIn ?? current.en
      const newZh = zhIn ? syncLanguage(newEn, zhIn) : current.zh
      try { saveSnapshot() } catch {
    /* best effort — render with what we have */
  }
      const importResult = await writeCvData({ en: newEn, zh: newZh })
      if (!importResult.ok) return res.status(500).json({ error: importResult.error })
      return res.status(200).json(importResult)
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  res.setHeader('Allow', 'GET,PUT,POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
}
