/**
 * Parses the `report` of POST /api/admin/storage/pull (pure — unit tested):
 *   { dbReplaced: boolean, r2Mirrored: number, r2Removed: number,
 *     revalidated: string[], warnings: string[] }
 * Returns null when the response carries no report (older servers).
 */

export type RestoreReport = {
  dbReplaced: boolean
  r2Mirrored: number
  r2Removed: number
  revalidated: string[]
  warnings: string[]
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0

export function parseRestoreReport(body: unknown): RestoreReport | null {
  if (!body || typeof body !== 'object') return null
  const r = (body as { report?: unknown }).report
  if (!r || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  return {
    dbReplaced: o.dbReplaced === true,
    r2Mirrored: count(o.r2Mirrored),
    r2Removed: count(o.r2Removed),
    revalidated: strings(o.revalidated).filter((p) => p.startsWith('/')),
    warnings: strings(o.warnings),
  }
}

/**
 * The `schedule` block of GET /api/admin/storage (lib/backupSchedule
 * getBackupStatus()), validated so the panel never renders garbage.
 */
export type BackupSchedule = {
  scheduled: boolean
  intervalHours: number
  lastAt: number | null
  lastRunAt: number | null
  lastResult: 'created' | 'unchanged' | 'empty' | 'failed' | 'busy' | null
  lastOk: boolean | null
  lastError: string | null
  nextAt: number | null
  ageHours: number | null
}

const stamp = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const LAST_RESULTS = ['created', 'unchanged', 'empty', 'failed', 'busy'] as const

export function parseBackupSchedule(body: unknown): BackupSchedule | null {
  if (!body || typeof body !== 'object') return null
  const s = (body as { schedule?: unknown }).schedule
  if (!s || typeof s !== 'object') return null
  const o = s as Record<string, unknown>
  const interval = typeof o.intervalHours === 'number' && Number.isFinite(o.intervalHours) && o.intervalHours > 0 ? o.intervalHours : 0
  const result = LAST_RESULTS.find((r) => r === o.lastResult) ?? null
  return {
    scheduled: o.scheduled === true && interval > 0,
    intervalHours: interval,
    lastAt: stamp(o.lastAt),
    lastRunAt: stamp(o.lastRunAt),
    lastResult: result,
    lastOk: typeof o.lastOk === 'boolean' ? o.lastOk : null,
    lastError: typeof o.lastError === 'string' && o.lastError ? o.lastError : null,
    nextAt: stamp(o.nextAt),
    ageHours: typeof o.ageHours === 'number' && Number.isFinite(o.ageHours) && o.ageHours >= 0 ? o.ageHours : null,
  }
}

/** "24 h", "30 min", "1.5 h", "2 d". */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
  if (hours >= 48 && Number.isInteger(hours / 24)) return `${hours / 24} d`
  return `${Math.round(hours * 10) / 10} h`
}

/** Elapsed / remaining time in the panel's compact style: "45 min", "3 h", "2 d". */
export function formatSpan(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000))
  if (mins < 1) return 'under a minute'
  if (mins < 60) return `${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} d`
}

/**
 * One-line schedule summary:
 *   "Scheduled: every 24 h · last run 3 h ago · next in 21 h"
 *   "Scheduled backups are off (BACKUP_INTERVAL_HOURS=0)"
 */
export function scheduleLine(s: BackupSchedule, now: number): string {
  if (!s.scheduled) return 'Scheduled backups are off (BACKUP_INTERVAL_HOURS=0)'
  const parts = [`Scheduled: every ${formatHours(s.intervalHours)}`]
  parts.push(s.lastRunAt ? `last run ${formatSpan(now - s.lastRunAt)} ago` : 'no run yet')
  if (s.nextAt) parts.push(s.nextAt <= now ? 'next run due now' : `next in ${formatSpan(s.nextAt - now)}`)
  return parts.join(' · ')
}

/** What the last scheduled/manual run did, for the line under the summary. */
export function lastRunDetail(s: BackupSchedule): string | null {
  switch (s.lastResult) {
    case 'created':
      return s.lastOk === false ? s.lastError || 'The last backup did not complete.' : 'The last run created a snapshot.'
    case 'unchanged':
      return 'The last run found no changes since the newest snapshot, so it was skipped.'
    case 'empty':
      return 'The last run was skipped because the content store is empty.'
    case 'busy':
      return 'The last run was postponed because another backup or restore was running.'
    case 'failed':
      return s.lastError ? `The last run failed: ${s.lastError}` : 'The last run failed.'
    default:
      return null
  }
}
