import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import {
  backupBeforeMigration,
  ensureWal,
  PRIVATE_FILE_MODE,
  preparePrivateDbFile,
  restrictPrivateDbFiles,
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
 *
 * Owner-only on disk: auth.db is created 0600 before SQLite opens it (data/
 * 0700 when it is created here), so the -wal and -shm files SQLite makes
 * start 0600 too, and all three — plus a pre-migration copy — are chmodded
 * 0600 after every open, which also repairs sidecars an earlier release left
 * world-readable (wave 2A review, SECU-4).
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
      if (!copy) return
      try {
        fs.chmodSync(copy, PRIVATE_FILE_MODE)
      } catch {
        // Not the owner: the pre-migration directory itself is 0700.
      }
      log.info('auth.db copied before migrating', { file: copy, from })
    },
  })
  logMigrationReport(report)
  return report
}

export function getAuthDb(): Database.Database {
  const cached = g.__authDb
  if (cached && cached.open) return cached
  const file = authDbPath()
  preparePrivateDbFile(file)
  const db = new Database(file, { timeout: 5000 })
  try {
    ensureWal(db, 5000)
    db.pragma('synchronous = NORMAL')
    migrateAuthDb(db)
    // Files this process does not own (a bind mount) are skipped quietly.
    for (const f of restrictPrivateDbFiles(file))
      log.warn('could not make an auth.db file owner-only', { file: f.path, code: f.code })
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
