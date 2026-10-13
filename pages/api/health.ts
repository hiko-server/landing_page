import { withApi } from '../../lib/apiHandler'
import { getDb } from '../../lib/db'
import { isR2Configured } from '../../lib/r2'
import { backupHealthWarnings, getBackupStatus } from '../../lib/backupSchedule'

/**
 * Liveness/readiness probe for the Docker HEALTHCHECK and any external monitor.
 *
 * The critical dependency is the local SQLite store — the app serves ALL
 * content from it (R2 is an off-site replica synced on boot), so "DB
 * reachable" is what determines healthy (200 vs 503).
 *
 * `content` says whether the store actually holds the site's content. An
 * empty store is reported (status "empty") but still answers 200: a fresh
 * container without R2 legitimately starts empty and seeds itself from the
 * bundled files on first read, and failing the healthcheck would only make
 * the orchestrator cycle a working server. Likewise a missing/unreachable R2
 * never fails the check.
 *
 * Durability signals never change the status code either:
 *   backup    { lastAt, lastOk, ageHours } from lib/backupSchedule
 *   r2Pending number of R2 keys known to be stale (repaired by the boot sync)
 *   warnings  human-readable problems: no backup for > 2× the schedule
 *             interval, a failed last backup, pending R2 repairs
 */
type ContentState = { home: boolean; cvdata: boolean; pages: number; items: number }

export default withApi('health', (_req, res, ctx) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  let db = false
  let content: ContentState | null = null
  let r2Pending = 0
  try {
    const conn = getDb()
    const row = conn
      .prepare(
        `SELECT
           EXISTS(SELECT 1 FROM kv WHERE key = 'home')   AS home,
           EXISTS(SELECT 1 FROM kv WHERE key = 'cvdata') AS cvdata,
           (SELECT count(*) FROM pages)                  AS pages,
           (SELECT count(*) FROM collection_items)       AS items,
           (SELECT count(*) FROM r2_pending)             AS pending`,
      )
      .get() as { home: number; cvdata: number; pages: number; items: number; pending: number }
    db = true
    content = { home: row.home === 1, cvdata: row.cvdata === 1, pages: row.pages, items: row.items }
    r2Pending = row.pending
  } catch (err) {
    db = false
    ctx.log.error('health: content store unreachable', { err })
  }

  const backup = getBackupStatus()
  const warnings = backupHealthWarnings(backup, r2Pending)
  const hasContent = !!content && (content.home || content.cvdata || content.pages > 0 || content.items > 0)
  return res.status(db ? 200 : 503).json({
    status: !db ? 'degraded' : hasContent ? 'ok' : 'empty',
    db,
    content: content ? { ...content, ready: content.home && content.cvdata } : null,
    r2: isR2Configured(),
    backup: { lastAt: backup.lastAt, lastOk: backup.lastOk, ageHours: backup.ageHours },
    r2Pending,
    warnings,
    uptime: Math.round(process.uptime()),
  })
})
