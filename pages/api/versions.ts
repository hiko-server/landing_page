/**
 * Unified version history API
 * GET  ?type=cv   → list CV file snapshots
 * GET  ?type=home → list Home file snapshots
 * GET  ?type=cv&file=filename&preview=1 → read snapshot JSON (preview)
 * GET  ?type=home&file=filename&preview=1 → read snapshot JSON (preview)
 * POST { action:'restore', type:'cv'|'home', filename } → restore a file snapshot
 * POST { action:'snapshot', type:'cv'|'home' } → take a manual snapshot
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../lib/env'
import {
  listSnapshots,
  restoreSnapshot,
  saveSnapshot,
  readSnapshot,
} from '../../lib/cvdata'
import {
  listHomeSnapshots,
  restoreHomeSnapshot,
  saveHomeSnapshot,
  readHomeSnapshot,
} from '../../lib/home'

function isAuthed(req: NextApiRequest, res: NextApiResponse): boolean {
  const token = getCookie('cv_admin_token', { req, res }) as string | undefined
  if (!token) return false
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any
    return decoded?.role === 'admin'
  } catch {
    return false
  }
}

function parseFilename(name: string): { date: string; label: string } {
  // cv_2025-09-09_03-17-28-947.json  or  home_2025-09-09_03-17-28-947.json
  const m = name.match(/^(?:cv|home)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/)
  if (m) {
    const dateStr = `${m[1]} ${m[2].replace(/-/g, ':')}`
    return { date: dateStr, label: new Date(dateStr).toLocaleString() }
  }
  return { date: '', label: name }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })

  const type = (req.query.type as string) || 'cv'

  if (req.method === 'GET') {
    const file = req.query.file as string | undefined
    const preview = req.query.preview === '1'

    // Preview a specific snapshot
    if (file && preview) {
      const raw = type === 'home' ? readHomeSnapshot(file) : readSnapshot(file)
      if (!raw) return res.status(404).json({ error: 'Not found' })
      try {
        return res.status(200).json({ ok: true, data: JSON.parse(raw) })
      } catch {
        return res.status(200).json({ ok: true, data: raw })
      }
    }

    // List all snapshots with metadata
    const files = type === 'home' ? listHomeSnapshots() : listSnapshots()
    const versions = files.map((f, idx) => {
      const { date, label } = parseFilename(f)
      return {
        filename: f,
        date,
        label,
        index: idx,
        isLatest: idx === 0,
        type,
      }
    })
    return res.status(200).json({ ok: true, versions })
  }

  if (req.method === 'POST') {
    const { action, filename } = req.body || {}

    if (action === 'snapshot') {
      const file = type === 'home' ? saveHomeSnapshot() : saveSnapshot()
      return res.status(200).json({ ok: true, file })
    }

    if (action === 'restore') {
      if (!filename) return res.status(400).json({ error: 'Missing filename' })
      const ok = type === 'home' ? restoreHomeSnapshot(filename) : restoreSnapshot(filename)
      return ok
        ? res.status(200).json({ ok: true })
        : res.status(404).json({ error: 'Snapshot not found' })
    }

    return res.status(400).json({ error: 'Unknown action' })
  }

  res.setHeader('Allow', 'GET,POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
