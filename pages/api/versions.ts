/**
 * Unified version history API (admin only)
 * GET  ?type=cv   → list CV file snapshots
 * GET  ?type=home → list Home file snapshots
 * GET  ?type=cv&file=filename&preview=1 → read snapshot JSON (preview)
 * GET  ?type=home&file=filename&preview=1 → read snapshot JSON (preview)
 * POST ?type=cv|home { action:'restore', filename } → restore a file snapshot
 * POST ?type=cv|home { action:'snapshot' } → take a manual snapshot
 *
 * `type` may also be sent in the POST body; the query string wins.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
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
import { kvEtag, restoreErrorStatus, safeSnapshotName } from '../../lib/contentStore'
import { isAdminRequest } from '../../lib/auth'
import { sendVersionedJson } from '../../lib/http'
import { revalidatePaths } from '../../lib/revalidate'

const isAuthed = isAdminRequest

type VersionType = 'cv' | 'home'

/**
 * Statically generated pages rendered from each document: /now reads the
 * public CV sections and home.hero.currentlyCoding, so restoring either one
 * must regenerate it instead of leaving the ISR copy live.
 */
const STATIC_PATHS: Record<VersionType, string[]> = { cv: ['/now'], home: ['/now'] }

function parseType(value: unknown): VersionType | null {
  if (value === undefined || value === '') return null
  return value === 'cv' || value === 'home' ? value : null
}

function parseFilename(name: string): { date: string; label: string } {
  // cv_2025-09-09_03-17-28-947.json  or  home_2025-09-09_03-17-28-947.json
  const m = name.match(/^(?:cv|home)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/)
  if (m) {
    // Snapshot stamps are UTC (toISOString) — keep the Z so clients convert
    // to their own timezone instead of misreading it as local time.
    const dateStr = `${m[1]}T${m[2].replace(/-/g, ':')}Z`
    return { date: dateStr, label: new Date(dateStr).toUTCString() }
  }
  return { date: '', label: name }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  const rawType = req.query.type ?? (req.method === 'POST' ? req.body?.type : undefined)
  const parsedType = parseType(rawType)
  if (rawType !== undefined && rawType !== '' && !parsedType) {
    return res.status(400).json({ error: 'type must be "cv" or "home"' })
  }
  const type: VersionType = parsedType ?? 'cv'

  if (req.method === 'GET') {
    const fileParam = req.query.file
    const preview = req.query.preview === '1'

    // Preview a specific snapshot
    if (fileParam !== undefined && preview) {
      const file = safeSnapshotName(fileParam)
      if (!file) return res.status(400).json({ error: 'Invalid file name' })
      const raw = type === 'home' ? readHomeSnapshot(file) : readSnapshot(file)
      if (raw === null) return res.status(404).json({ error: 'Not found' })
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
      if (!safeSnapshotName(filename)) return res.status(400).json({ error: 'Missing or invalid filename' })
      // Snapshot the live state first so a restore can itself be undone.
      try {
        if (type === 'home') saveHomeSnapshot()
        else saveSnapshot()
      } catch (err) {
        console.warn('versions: snapshot before restore failed', err)
      }
      const result = type === 'home' ? await restoreHomeSnapshot(filename) : await restoreSnapshot(filename)
      if (!result.ok) return res.status(restoreErrorStatus(result.error)).json({ error: result.error })
      const etag = kvEtag(result.updatedAt)
      const paths = STATIC_PATHS[type]
      const failed = await revalidatePaths(res, paths)
      return sendVersionedJson(res, 200, {
        ok: true,
        etag,
        ...(result.r2Warning ? { r2Warning: result.r2Warning } : {}),
        revalidated: paths.filter((p) => !failed.includes(p)),
        ...(failed.length ? { revalidateFailed: failed } : {}),
      }, etag)
    }

    return res.status(400).json({ error: 'Unknown action' })
  }

  res.setHeader('Allow', 'GET,POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
