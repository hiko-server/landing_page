import type { NextApiRequest, NextApiResponse } from 'next'
import { withApi } from '../../lib/apiHandler'
import { isAdminRequest } from '../../lib/auth'
import { getDb } from '../../lib/db'
import { isR2Configured } from '../../lib/r2'
import { backupHealthWarnings, getBackupStatus } from '../../lib/backupSchedule'
import { bearerMatches } from '../../lib/security/bearer'
import { listLocalBackups } from '../../lib/backup'
import { errorTotals } from '../../lib/errors/store'
import { latestRestoreDrill, restoreDrillSchedule, restoreDrillWarnings } from '../../lib/restoreDrill'

/**
 * Liveness/readiness probe for the Docker HEALTHCHECK, scripts/deploy.sh, CI
 * and any external monitor.
 *
 * The critical dependency is the local SQLite store — the app serves ALL
 * content from it (R2 is an off-site replica synced on boot), so "DB
 * reachable" is what determines healthy (200 vs 503).
 *
 * Everyone gets only the verdict: `{"status":"ok"}` (the exact substring
 * scripts/deploy.sh and CI look for), `{"status":"empty"}` or, with 503,
 * `{"status":"degraded"}`. An empty store still answers 200: a fresh
 * container without R2 legitimately starts empty and seeds itself from the
 * bundled files on first read, and failing the healthcheck would only make
 * the orchestrator cycle a working server. A missing/unreachable R2 never
 * fails the check either.
 *
 * The detail below reveals operational state (backup times, and with them
 * the last deploy; R2 configuration; pending repairs), so it is returned
 * only to a signed-in admin (lib/auth — a same-origin fetch from the admin
 * sends the session cookie) or to a monitor sending
 * `Authorization: Bearer <HEALTH_TOKEN>` when that env var is set
 * (constant-time compare):
 *   db        store reachable
 *   content   { home, cvdata, pages, items, ready }
 *   r2        R2 configured
 *   backup    { lastAt, lastOk, ageHours } from lib/backupSchedule
 *   restoreDrill { lastAt, status } of the newest restore drill (lib/restoreDrill)
 *   openErrors   open fingerprints in the error monitor (lib/errors/store)
 *   r2Pending number of R2 keys known to be stale (repaired by the boot sync)
 *   warnings  human-readable problems: no backup for > 2× the schedule
 *             interval, a failed last backup, pending R2 repairs, a failed
 *             or overdue restore drill
 *   uptime    seconds since the process started
 * None of it changes the status code.
 */
type ContentState = { home: boolean; cvdata: boolean; pages: number; items: number }

/**
 * True when the request may see the operational detail. Never throws: a
 * malformed header or cookie means "no detail", never a failed probe.
 */
function mayReadDetail(req: NextApiRequest, res: NextApiResponse): boolean {
  try {
    return bearerMatches(req.headers?.authorization, process.env.HEALTH_TOKEN) || isAdminRequest(req, res)
  } catch {
    return false
  }
}

export default withApi('health', (req, res, ctx) => {
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

  const hasContent = !!content && (content.home || content.cvdata || content.pages > 0 || content.items > 0)
  const status = !db ? 'degraded' : hasContent ? 'ok' : 'empty'
  res.status(db ? 200 : 503)
  if (!mayReadDetail(req, res)) return res.json({ status })

  const backup = getBackupStatus()
  const drill = latestRestoreDrill()
  const drillSchedule = restoreDrillSchedule()
  let hasBackups = isR2Configured()
  try {
    hasBackups = hasBackups || listLocalBackups().length > 0
  } catch {
    // An unreadable backups dir: the backup warnings already cover it.
  }
  let openErrors: number | null = null
  try {
    openErrors = errorTotals().open
  } catch {
    openErrors = null
  }
  return res.json({
    status,
    db,
    content: content ? { ...content, ready: content.home && content.cvdata } : null,
    r2: isR2Configured(),
    backup: { lastAt: backup.lastAt, lastOk: backup.lastOk, ageHours: backup.ageHours },
    restoreDrill: drill ? { lastAt: drill.ranAt, status: drill.status } : null,
    openErrors,
    r2Pending,
    warnings: [...backupHealthWarnings(backup, r2Pending), ...restoreDrillWarnings(drill, drillSchedule, hasBackups)],
    uptime: Math.round(process.uptime()),
  })
})
