import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../../lib/env'
import { isR2Configured, getR2Bucket, r2ListDetailed } from '../../../lib/r2'
import { getDb } from '../../../lib/db'
import { listLocalBackups, BACKUP_CONSTANTS } from '../../../lib/backup'

function isAuthed(req: NextApiRequest, res: NextApiResponse): boolean {
  const token = getCookie('cv_admin_token', { req, res }) as string | undefined
  if (!token) return false
  try {
    return ((jwt.verify(token, getJwtSecret()) as { role?: string })?.role === 'admin')
  } catch {
    return false
  }
}

/**
 * Inventory of the content store, surfaced in the admin UI so an operator
 * can see at a glance:
 *   - whether R2 credentials are even loaded into the running process,
 *   - what's in the local SQLite (canonical),
 *   - what's in the R2 mirror (and whether they match),
 *   - which snapshot tarballs already exist locally + remotely.
 *
 * Never throws on R2 errors — the failure is the answer.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // ── Local DB summary ────────────────────────────────────────────────
  const db = getDb()
  const pages = db
    .prepare('SELECT name, length(body) AS bytes, updated_at FROM pages ORDER BY name')
    .all() as Array<{ name: string; bytes: number; updated_at: number }>
  const items = db
    .prepare(
      'SELECT collection, slug, length(body) AS bytes, updated_at FROM collection_items ORDER BY collection, slug',
    )
    .all() as Array<{ collection: string; slug: string; bytes: number; updated_at: number }>
  const kv = db
    .prepare('SELECT key, length(value) AS bytes, updated_at FROM kv ORDER BY key')
    .all() as Array<{ key: string; bytes: number; updated_at: number }>

  const dbSummary = {
    pages,
    items,
    kv,
    totals: {
      pages: pages.length,
      items: items.length,
      kv: kv.length,
    },
  }

  // ── Local snapshot tarballs ─────────────────────────────────────────
  const localBackups = listLocalBackups()
  const backups = {
    localDir: BACKUP_CONSTANTS.BACKUPS_DIR,
    local: localBackups,
    lastLocalAt: localBackups[0]?.mtime ?? null,
    r2Prefix: BACKUP_CONSTANTS.R2_PREFIX,
    r2LatestKey: BACKUP_CONSTANTS.R2_LATEST_KEY,
  }

  // ── R2 summary ──────────────────────────────────────────────────────
  const r2 = {
    configured: isR2Configured(),
    bucket: isR2Configured() ? getR2Bucket() : null,
    endpoint: process.env.R2_ENDPOINT || null,
    ok: false as boolean,
    error: null as string | null,
    objects: [] as Array<{ key: string; size: number; lastModified: string | null }>,
    totalSize: 0,
    snapshots: [] as Array<{ key: string; size: number; lastModified: string | null }>,
    hasLatest: false,
  }
  if (r2.configured) {
    try {
      r2.objects = await r2ListDetailed('')
      r2.ok = true
      r2.totalSize = r2.objects.reduce((n, o) => n + o.size, 0)
      r2.snapshots = r2.objects
        .filter((o) => o.key.startsWith(BACKUP_CONSTANTS.R2_PREFIX) && o.key.endsWith('.tgz'))
        .sort((a, b) => (a.lastModified || '').localeCompare(b.lastModified || '') * -1)
      r2.hasLatest = r2.objects.some((o) => o.key === BACKUP_CONSTANTS.R2_LATEST_KEY)
    } catch (err: any) {
      r2.error = err?.message || String(err)
    }
  }

  return res.status(200).json({ db: dbSummary, r2, backups, now: Date.now() })
}
