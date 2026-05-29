import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../../../lib/env'
import { createSnapshot } from '../../../../lib/backup'

/**
 * POST /api/admin/storage/backup
 *
 * Builds a fresh snapshot tarball (full SQLite DB + uploads + history
 * snapshots + admin/mongo config), writes a local copy under
 * data/backups/, and — if R2 credentials are present — pushes it to
 * backups/<ts>.tgz plus the backups/latest.tgz alias.
 *
 * Always returns 200 when the local snapshot succeeds, even if R2 push
 * failed: the operator still has a recoverable artefact on disk and the
 * `r2.error` field surfaces the remote failure.
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

  try {
    const result = await createSnapshot()
    return res.status(200).json({ ok: true, ...result })
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) })
  }
}
