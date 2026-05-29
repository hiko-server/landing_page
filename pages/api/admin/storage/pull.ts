import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../../../lib/env'
import { isR2Configured } from '../../../../lib/r2'
import { restoreLatestFromR2, restoreLocalSnapshot } from '../../../../lib/backup'

/**
 * POST /api/admin/storage/pull
 *
 * Fetches a snapshot tarball and atomically restores the SQLite DB,
 * uploads tree, version-history snapshots, and admin/mongo config.
 *
 * Body (optional):
 *   { source: 'r2' }                  ← default; pulls backups/latest.tgz
 *   { source: 'local', filename: '…' } ← restore an on-disk tarball
 *
 * R2 must be configured for the default path; the handler returns 503
 * (not 500) when it isn't, so the UI can show a friendly "configure R2"
 * hint instead of a generic error.
 */
function isAuthed(req: NextApiRequest, res: NextApiResponse): boolean {
  const token = getCookie('cv_admin_token', { req, res }) as string | undefined
  if (!token) return false
  try {
    return (jwt.verify(token, getJwtSecret()) as { role?: string })?.role === 'admin'
  } catch {
    return false
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthed(req, res)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const source = (req.body?.source as 'r2' | 'local' | undefined) || 'r2'

  try {
    if (source === 'local') {
      const filename = String(req.body?.filename || '')
      if (!filename) return res.status(400).json({ ok: false, error: 'filename required' })
      const result = await restoreLocalSnapshot(filename)
      return res.status(200).json({ ok: true, ...result })
    }

    if (!isR2Configured()) {
      return res.status(503).json({
        ok: false,
        error:
          'R2 is not configured. Set R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in .env, then restart.',
      })
    }
    const result = await restoreLatestFromR2()
    return res.status(200).json({ ok: true, ...result })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) })
  }
}
