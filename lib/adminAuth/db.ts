import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import {
  backupBeforeMigration,
  ensureWal,
  runMigrations,
  type MigrationReport,
} from '../../scripts/db/migrate.mjs'
import { AUTH_MIGRATIONS } from '../../scripts/db/auth/index.mjs'
import { logMigrationReport } from '../dbMigrations'
import { log } from '../log'

/**
 * Admin sign-in state: data/auth.db (schema: scripts/db/auth). A database of
 * its own — never packed into a content snapshot, mirrored to R2 or replaced
 * by a restore (lib/backup.ts only handles content.db), so a restore cannot
 * resurrect a removed passkey, a used recovery code or a revoked session.
 * Like data/admin.json it is per-server: after moving to a new server the
 * owner signs in with the password (ADMIN_EMAIL / ADMIN_PASS bootstrap) and
 * registers passkeys again.
 *
 * The connection lives on globalThis (one per process across Next's webpack
 * runtimes); the path is resolved when it is first opened, so tests can chdir
 * into a temp directory first.
 */

export function authDbPath(): string {
  return path.join(process.cwd(), 'data', 'auth.db')
}

type AuthGlobal = typeof globalThis & { __authDb?: Database.Database | null }
const g = globalThis as AuthGlobal

export function migrateAuthDb(db: Database.Database, backupDir?: string): MigrationReport {
  const dir = backupDir ?? path.join(path.dirname(db.name), 'backups', 'pre-migration')
  const report = runMigrations(db, AUTH_MIGRATIONS, {
    label: 'auth',
    beforeMigrate: ({ from }) => {
      const copy = backupBeforeMigration(db, { dir, label: 'auth', from })
      if (copy) log.info('auth.db copied before migrating', { file: copy, from })
    },
  })
  logMigrationReport(report)
  return report
}

export function getAuthDb(): Database.Database {
  const cached = g.__authDb
  if (cached && cached.open) return cached
  const file = authDbPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file, { timeout: 5000 })
  try {
    ensureWal(db, 5000)
    db.pragma('synchronous = NORMAL')
    migrateAuthDb(db)
    try {
      fs.chmodSync(file, 0o600)
    } catch {
      // Not the owner (a bind mount with other ownership): keep going.
    }
  } catch (err) {
    db.close()
    throw err
  }
  g.__authDb = db
  return db
}

export function closeAuthDb(): void {
  const db = g.__authDb
  g.__authDb = null
  if (db && db.open) db.close()
}
