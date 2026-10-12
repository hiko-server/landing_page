import type { NextApiRequest, NextApiResponse } from 'next'
import { createSnapshot, StorageBusyError } from '../../../../lib/backup'
import { isAdminRequest } from '../../../../lib/auth'

const isAuthed = isAdminRequest

/**
 * POST /api/admin/storage/backup
 *
 * Builds a fresh snapshot tarball (full SQLite DB + uploads + version-history
 * snapshots; never admin credentials), writes a local copy under
 * data/backups/, and — if R2 credentials are present — pushes it to
 * backups/<name>.tgz plus the backups/latest.tgz alias. Older snapshots
 * beyond the retention limits (20 local, 30 in R2) are pruned.
 *
 * Always returns 200 when the local snapshot succeeds, even if R2 push
 * failed: the operator still has a recoverable artefact on disk and the
 * `r2.error` field surfaces the remote failure. 409 while another backup or
 * restore is running.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthed(req, res)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const result = await createSnapshot()
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof StorageBusyError) return res.status(409).json({ ok: false, error: err.message })
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
