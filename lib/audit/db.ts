import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { backupBeforeMigration, ensureWal, runMigrations, type MigrationReport } from '../../scripts/db/migrate.mjs'
import { AUDIT_MIGRATIONS } from '../../scripts/db/audit/index.mjs'
import { logMigrationReport } from '../dbMigrations'
import { log } from '../log'

/**
 * The admin activity log: data/audit.db, a SQLite file of its own (schema:
 * scripts/db/audit). Like auth.db it is per server and deliberately kept out
 * of content.db, so a content restore can never rewrite the record of what
 * happened; it is not packed into the scheduled snapshots or mirrored to R2.
 * scripts/deploy.sh takes an online copy of it before every deploy.
 *
 * The connection lives on globalThis (one per process across Next's webpack
 * runtimes); the path is resolved when it is first opened, so tests can chdir
 * into a temp directory first.
 */

export function auditDbPath(): string {
  return path.join(process.cwd(), 'data', 'audit.db')
}

type AuditGlobal = typeof globalThis & { __auditDb?: Database.Database | null }
const g = globalThis as AuditGlobal

export function migrateAuditDb(db: Database.Database, backupDir?: string): MigrationReport {
  const dir = backupDir ?? path.join(path.dirname(db.name), 'backups', 'pre-migration')
  const report = runMigrations(db, AUDIT_MIGRATIONS, {
    label: 'audit',
    beforeMigrate: ({ from }) => {
      const copy = backupBeforeMigration(db, { dir, label: 'audit', from })
      if (copy) log.info('audit.db copied before migrating', { file: copy, from })
    },
  })
  logMigrationReport(report)
  return report
}

export function getAuditDb(): Database.Database {
  const cached = g.__auditDb
  if (cached && cached.open) return cached
  const file = auditDbPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file, { timeout: 5000 })
  try {
    ensureWal(db, 5000)
    db.pragma('synchronous = NORMAL')
    migrateAuditDb(db)
    try {
      fs.chmodSync(file, 0o600)
    } catch {
      // Not the owner (a bind mount with other ownership): keep going.
    }
  } catch (err) {
    db.close()
    throw err
  }
  g.__auditDb = db
  return db
}

export function closeAuditDb(): void {
  const db = g.__auditDb
  g.__auditDb = null
  if (db && db.open) db.close()
}
