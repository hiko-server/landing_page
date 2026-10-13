import fs from 'fs'
import path from 'path'
import { getAnalyticsDb, analyticsDbPath } from './analytics/db'
import { authDbPath, getAuthDb } from './adminAuth/db'
import { backupHealthWarnings, getBackupStatus, type BackupStatus } from './backupSchedule'
import { listLocalBackups } from './backup'
import { CONTENT_DB_PATH, getDb } from './db'
import { schemaStatus, type SchemaStatus } from './dbMigrations'
import { errorTotals, type ErrorTotals } from './errors/store'
import { logEntryTotal, recentLogEntries, type LogEntry } from './logBuffer'
import { isR2Configured } from './r2'
import {
  latestRestoreDrill,
  restoreDrillSchedule,
  restoreDrillWarnings,
  type DrillResult,
  type DrillScheduleStatus,
} from './restoreDrill'
import { CONTENT_MIGRATIONS } from '../scripts/db/content/index.mjs'
import { ANALYTICS_MIGRATIONS } from '../scripts/db/analytics/index.mjs'
import { AUTH_MIGRATIONS } from '../scripts/db/auth/index.mjs'

/**
 * Everything the admin System panel shows (GET /api/admin/system), read
 * live from this process: the deployed build, runtime, disk, the three
 * SQLite stores (size, WAL, schema version), backups, restore drills, the
 * error monitor's totals and the recent warn / error log entries. Each part
 * fails on its own — an unreadable store reports its error instead of
 * failing the whole snapshot.
 */

export type DatabaseInfo = {
  name: 'content' | 'analytics' | 'auth'
  file: string
  bytes: number | null
  walBytes: number | null
  schema: SchemaStatus | null
  error: string | null
}

export type DiskInfo = {
  path: string
  freeBytes: number
  totalBytes: number
  usedPct: number
} | null

export type SystemSnapshot = {
  now: number
  release: {
    sha: string | null
    nodeVersion: string
    startedAt: number
    uptimeS: number
    env: string
  }
  memory: { rssBytes: number; heapUsedBytes: number; heapTotalBytes: number }
  disk: DiskInfo
  databases: DatabaseInfo[]
  backup: BackupStatus & { localCount: number }
  r2: { configured: boolean; pending: number | null }
  restoreDrill: { latest: DrillResult | null; schedule: DrillScheduleStatus }
  errors: ErrorTotals | null
  logs: { entries: LogEntry[]; total: number }
  warnings: string[]
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err))

function sizeOf(file: string): number | null {
  try {
    return fs.statSync(file).size
  } catch {
    return null
  }
}

/** Free / total bytes of the file system holding `dir` (fs.statfsSync; null where unsupported). */
export function diskInfo(dir: string): DiskInfo {
  try {
    const s = fs.statfsSync(dir)
    const total = Number(s.blocks) * Number(s.bsize)
    const free = Number(s.bavail) * Number(s.bsize)
    if (!Number.isFinite(total) || total <= 0) return null
    return {
      path: dir,
      freeBytes: free,
      totalBytes: total,
      usedPct: Math.round(((total - free) / total) * 1000) / 10,
    }
  } catch {
    return null
  }
}

/** Disk warnings: under 10 % or 1 GB free. */
export function diskWarnings(disk: DiskInfo): string[] {
  if (!disk) return []
  const freePct = (disk.freeBytes / disk.totalBytes) * 100
  if (freePct < 10 || disk.freeBytes < 1024 ** 3) {
    return [
      `Disk space is low: ${(disk.freeBytes / 1024 ** 3).toFixed(1)} GB free (${freePct.toFixed(0)} %).`,
    ]
  }
  return []
}

function databaseInfo(
  name: DatabaseInfo['name'],
  file: string,
  open: () => Parameters<typeof schemaStatus>[1],
  migrations: Parameters<typeof schemaStatus>[2]
): DatabaseInfo {
  const info: DatabaseInfo = {
    name,
    file: path.relative(process.cwd(), file),
    bytes: sizeOf(file),
    walBytes: sizeOf(`${file}-wal`),
    schema: null,
    error: null,
  }
  try {
    info.schema = schemaStatus(name, open(), migrations)
    info.bytes = sizeOf(file)
    info.walBytes = sizeOf(`${file}-wal`)
  } catch (err) {
    info.error = errMsg(err)
  }
  return info
}

export function systemSnapshot(now = Date.now()): SystemSnapshot {
  const warnings: string[] = []
  const mem = process.memoryUsage()
  const dataDir = path.dirname(CONTENT_DB_PATH)
  const disk = diskInfo(fs.existsSync(dataDir) ? dataDir : process.cwd())
  warnings.push(...diskWarnings(disk))

  const databases = [
    databaseInfo('content', CONTENT_DB_PATH, () => getDb(), CONTENT_MIGRATIONS),
    databaseInfo('analytics', analyticsDbPath(), () => getAnalyticsDb(), ANALYTICS_MIGRATIONS),
    databaseInfo('auth', authDbPath(), () => getAuthDb(), AUTH_MIGRATIONS),
  ]
  for (const d of databases) {
    if (d.error) warnings.push(`The ${d.name} database cannot be opened: ${d.error}`)
    else if (d.schema?.state === 'behind')
      warnings.push(`The ${d.name} database has pending migrations.`)
  }

  let pending: number | null = null
  try {
    pending =
      Number((getDb().prepare('SELECT count(*) AS n FROM r2_pending').get() as { n: number }).n) ||
      0
  } catch {
    pending = null
  }

  const backup = getBackupStatus(now)
  let localCount = 0
  try {
    localCount = listLocalBackups().length
  } catch {
    localCount = 0
  }
  warnings.push(...backupHealthWarnings(backup, pending ?? 0))

  const latest = latestRestoreDrill()
  const schedule = restoreDrillSchedule()
  warnings.push(...restoreDrillWarnings(latest, schedule, localCount > 0 || isR2Configured(), now))

  let errors: ErrorTotals | null = null
  try {
    errors = errorTotals(now)
    if (errors.new24h > 0)
      warnings.push(
        `${errors.new24h} new error${errors.new24h === 1 ? '' : 's'} in the last 24 hours.`
      )
  } catch {
    errors = null
  }

  const sha = (process.env.NEXT_PUBLIC_BUILD_SHA || '').trim()
  return {
    now,
    release: {
      sha: /^[0-9a-f]{7,40}$/i.test(sha) ? sha.toLowerCase() : null,
      nodeVersion: process.version,
      startedAt: Math.round(now - process.uptime() * 1000),
      uptimeS: Math.round(process.uptime()),
      env: process.env.NODE_ENV || 'development',
    },
    memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed, heapTotalBytes: mem.heapTotal },
    disk,
    databases,
    backup: { ...backup, localCount },
    r2: { configured: isR2Configured(), pending },
    restoreDrill: { latest, schedule },
    errors,
    logs: { entries: recentLogEntries(50), total: logEntryTotal() },
    warnings,
  }
}
