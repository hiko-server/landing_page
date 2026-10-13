import {
  appliedMigrations,
  currentVersion,
  migrationDrift,
  type Migration,
  type MigrationReport,
} from '../scripts/db/migrate.mjs'
import { log } from './log'

/**
 * App-side glue for the versioned SQLite migrations (scripts/db/migrate.mjs):
 * one log line per migration run, and the per-database status the admin
 * System panel shows.
 */

type Db = Parameters<typeof currentVersion>[0]

/** Log what a runMigrations() call changed (nothing when the store was current). */
export function logMigrationReport(report: MigrationReport): void {
  if (report.applied.length) {
    log.info('database migrated', {
      db: report.label,
      from: report.from,
      to: report.to,
      applied: report.applied.map((m) => `${m.version}-${m.name}`),
    })
  }
  if (report.ahead) {
    // An older image on a newer store (a rollback): fine while every
    // migration is additive, which scripts/db/migrate.mjs requires.
    log.warn('database is newer than this build knows; running on the additive schema', {
      db: report.label,
      storeVersion: report.from,
      buildVersion: report.latest,
    })
  }
}

export type SchemaStatus = {
  db: string
  version: number
  latest: number
  /** 'current' | 'behind' (pending migrations) | 'ahead' (newer than this build). */
  state: 'current' | 'behind' | 'ahead'
  lastAppliedAt: number | null
  drift: string[]
}

/** Version, pending/ahead state and name drift of an open store. */
export function schemaStatus(
  label: string,
  db: Db,
  migrations: readonly Migration[]
): SchemaStatus {
  const version = currentVersion(db)
  const latest = migrations.length
  const applied = appliedMigrations(db)
  return {
    db: label,
    version,
    latest,
    state: version === latest ? 'current' : version < latest ? 'behind' : 'ahead',
    lastAppliedAt: applied.length ? applied[applied.length - 1].appliedAt : null,
    drift: migrationDrift(db, migrations),
  }
}
