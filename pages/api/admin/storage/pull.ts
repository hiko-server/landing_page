import { withApi } from '../../../../lib/apiHandler'
import { isR2Configured } from '../../../../lib/r2'
import { restoreLatestFromR2, restoreLocalSnapshot, StorageBusyError, type RestoreResult } from '../../../../lib/backup'
import { revalidatePaths } from '../../../../lib/revalidate'
import { isAdminRequest } from '../../../../lib/auth'

/**
 * POST /api/admin/storage/pull
 *
 * Fetches a snapshot tarball and atomically restores the SQLite DB, the
 * uploads tree and the version-history snapshots. Admin credentials
 * (data/admin.json) and Mongo settings are never taken from a snapshot.
 * A safety snapshot of the replaced state is written to data/backups first.
 *
 * After the swap, every content row is re-mirrored to its R2 object (item
 * objects the restored DB no longer has are deleted) and every public page
 * that renders store content is regenerated.
 *
 * Body (optional):
 *   { source: 'r2' }                  ← default; pulls backups/latest.tgz
 *   { source: 'local', filename: '…' } ← restore an on-disk tarball
 *
 * Response: { ok, source, key, bytes, manifest, restored, safetySnapshot,
 *             report: { dbReplaced, r2Mirrored, r2Removed, revalidated, warnings } }
 *
 * R2 must be configured for the default path; the handler returns 503
 * (not 500) when it isn't, so the UI can show a friendly "configure R2"
 * hint instead of a generic error. 409 when a backup/restore is running.
 */
export default withApi('admin/storage/pull', async (req, res, ctx) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ ok: false, error: 'Unauthorized' })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const source = req.body?.source === 'local' ? 'local' : 'r2'

  try {
    let result: RestoreResult
    if (source === 'local') {
      const filename = typeof req.body?.filename === 'string' ? req.body.filename : ''
      if (!filename) return res.status(400).json({ ok: false, error: 'filename required' })
      result = await restoreLocalSnapshot(filename)
    } else {
      if (!isR2Configured()) {
        return res.status(503).json({
          ok: false,
          error:
            'R2 is not configured. Set R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in .env, then restart.',
        })
      }
      result = await restoreLatestFromR2()
    }

    const { pathsToRevalidate, report, ...rest } = result
    const failed = await revalidatePaths(res, pathsToRevalidate)
    const warnings = [...report.warnings]
    if (failed.length) warnings.push(`Could not refresh ${failed.join(', ')}; they update within 60 s on their own.`)
    return res.status(200).json({
      ok: true,
      ...rest,
      report: {
        dbReplaced: report.dbReplaced,
        r2Mirrored: report.r2Mirrored,
        r2Removed: report.r2Removed,
        revalidated: pathsToRevalidate.filter((p) => !failed.includes(p)),
        warnings,
      },
    })
  } catch (err) {
    if (err instanceof StorageBusyError) return res.status(409).json({ ok: false, error: err.message })
    ctx.log.error('restore failed', { source, err })
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})
