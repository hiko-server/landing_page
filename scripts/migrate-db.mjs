#!/usr/bin/env node
/**
 * Operator CLI for the versioned SQLite migrations (scripts/db/migrate.mjs).
 * The app migrates every store when it opens it and the boot scripts migrate
 * content.db, so this is for looking before a deploy, or for migrating a copy.
 *
 *   node scripts/migrate-db.mjs --status            versions + pending, no writes
 *   node scripts/migrate-db.mjs                     migrate the stores in ./data that exist
 *   node scripts/migrate-db.mjs --db content --file /tmp/copy.db
 *                                                   migrate one file (content | analytics | auth | audit)
 *
 * Exit codes: 0 ok, 1 a migration failed, 2 bad arguments.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import {
  appliedMigrations,
  backupBeforeMigration,
  currentVersion,
  ensureWal,
  migrationDrift,
  runMigrations,
} from './db/migrate.mjs'
import { CONTENT_MIGRATIONS } from './db/content/index.mjs'
import { ANALYTICS_MIGRATIONS } from './db/analytics/index.mjs'
import { AUTH_MIGRATIONS } from './db/auth/index.mjs'
import { AUDIT_MIGRATIONS } from './db/audit/index.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(path.resolve(here, '..'), 'data')

const STORES = {
  content: { file: 'content.db', migrations: CONTENT_MIGRATIONS, backup: true },
  analytics: { file: 'analytics.db', migrations: ANALYTICS_MIGRATIONS, backup: false },
  auth: { file: 'auth.db', migrations: AUTH_MIGRATIONS, backup: true },
  audit: { file: 'audit.db', migrations: AUDIT_MIGRATIONS, backup: true },
}

function parseArgs(argv) {
  const out = { status: false, db: null, file: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--status') out.status = true
    else if (a === '--db') out.db = argv[++i] || ''
    else if (a === '--file') out.file = argv[++i] || ''
    else if (a === '--help' || a === '-h') out.help = true
    else return { error: `unknown argument: ${a}` }
  }
  if (out.file && !out.db) return { error: '--file needs --db content|analytics|auth|audit' }
  if (out.db && !STORES[out.db])
    return { error: `unknown store: ${out.db} (content | analytics | auth | audit)` }
  return out
}

function describe(label, db, migrations) {
  const version = currentVersion(db)
  const latest = migrations.length
  const pending = migrations.filter((m) => m.version > version).map((m) => `${m.version}-${m.name}`)
  const last = appliedMigrations(db).at(-1)
  const drift = migrationDrift(db, migrations)
  const state =
    version === latest
      ? 'current'
      : version < latest
        ? `behind: ${pending.join(', ')}`
        : `ahead of this build (${latest})`
  console.log(
    `${label.padEnd(9)} v${version}/${latest}  ${state}${last ? `  (last applied ${new Date(last.appliedAt).toISOString()})` : ''}`
  )
  for (const d of drift) console.log(`          drift: ${d}`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.error) {
    console.error(args.error)
    return 2
  }
  if (args.help) {
    console.log(
      'usage: node scripts/migrate-db.mjs [--status] [--db content|analytics|auth|audit [--file <path>]]'
    )
    return 0
  }
  const targets = args.db
    ? [[args.db, path.resolve(args.file || path.join(dataDir, STORES[args.db].file))]]
    : Object.entries(STORES).map(([label, s]) => [label, path.join(dataDir, s.file)])

  let failed = false
  for (const [label, file] of targets) {
    const store = STORES[label]
    if (!fs.existsSync(file)) {
      if (args.db) {
        console.error(`${label}: ${file} does not exist`)
        failed = true
      } else {
        console.log(
          `${label.padEnd(9)} (no ${path.relative(process.cwd(), file) || file} yet — created on first use)`
        )
      }
      continue
    }
    const db = new Database(file, { timeout: 10_000, readonly: args.status, fileMustExist: true })
    try {
      if (args.status) {
        describe(label, db, store.migrations)
        continue
      }
      ensureWal(db)
      const report = runMigrations(db, store.migrations, {
        label,
        beforeMigrate: ({ from }) => {
          if (!store.backup) return
          const copy = backupBeforeMigration(db, {
            dir: path.join(path.dirname(file), 'backups', 'pre-migration'),
            label,
            from,
          })
          if (copy) console.log(`${label}: copied to ${copy} first`)
        },
      })
      if (report.applied.length) {
        console.log(
          `${label}: migrated v${report.from} → v${report.to} (${report.applied.map((m) => `${m.version}-${m.name}`).join(', ')})`
        )
      } else if (report.ahead) {
        console.log(
          `${label}: v${report.from} is newer than this build (v${report.latest}); nothing to do`
        )
      } else {
        console.log(`${label}: already current (v${report.to})`)
      }
    } catch (err) {
      failed = true
      console.error(`${label}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      db.close()
    }
  }
  return failed ? 1 : 0
}

process.exitCode = main()
