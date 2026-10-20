/**
 * I7 — versioned SQLite migrations (scripts/db/migrate.mjs) shared by the app
 * (lib/db.ts, lib/analytics/db.ts, lib/auth/db.ts) and the plain-Node scripts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  appliedMigrations,
  backupBeforeMigration,
  currentVersion,
  migrationDrift,
  PRE_MIGRATION_KEEP,
  runMigrations,
  validateMigrations,
  type Migration,
} from '../scripts/db/migrate.mjs'
import { CONTENT_MIGRATIONS } from '../scripts/db/content/index.mjs'
import { ANALYTICS_MIGRATIONS } from '../scripts/db/analytics/index.mjs'
import { AUTH_MIGRATIONS } from '../scripts/db/auth/index.mjs'
import { initSchema } from '../lib/db'
import { migrateAnalyticsDb } from '../lib/analytics/db'

const ROOT = path.resolve(import.meta.dirname, '..')

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sa-migrations-'))
}

const count = (db: Database.Database, sql: string) => (db.prepare(sql).get() as { n: number }).n

/** The content DDL every store had through 2.3.0 (lib/db.ts initSchema before migrations). */
const LEGACY_CONTENT_DDL = `
  CREATE TABLE IF NOT EXISTS pages (name TEXT PRIMARY KEY, frontmatter TEXT NOT NULL DEFAULT '{}', body TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS collection_items (collection TEXT NOT NULL, slug TEXT NOT NULL, frontmatter TEXT NOT NULL DEFAULT '{}', body TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL, PRIMARY KEY (collection, slug));
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS r2_pending (key TEXT PRIMARY KEY, op TEXT NOT NULL CHECK (op IN ('put', 'delete')), updated_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_collection_items_updated ON collection_items (collection, updated_at DESC);
`

const m = (version: number, name: string, up: Migration['up']): Migration => ({ version, name, up })

test('validateMigrations: versions 1…n in order, slug names, an up() each', () => {
  const ok = [m(1, 'a', () => {}), m(2, 'b-2', () => {})]
  assert.doesNotThrow(() => validateMigrations(ok))
  assert.throws(() => validateMigrations([m(2, 'a', () => {})]), /versions must be 1…n/)
  assert.throws(
    () => validateMigrations([m(1, 'a', () => {}), m(3, 'c', () => {})]),
    /without gaps/
  )
  assert.throws(() => validateMigrations([m(1, 'a', () => {}), m(1, 'b', () => {})]), /version 1/)
  assert.throws(() => validateMigrations([m(1, 'Bad Name', () => {})]), /slug name/)
  assert.throws(
    () => validateMigrations([{ version: 1, name: 'a' } as unknown as Migration]),
    /up\(db\)/
  )
  for (const list of [CONTENT_MIGRATIONS, ANALYTICS_MIGRATIONS, AUTH_MIGRATIONS])
    assert.doesNotThrow(() => validateMigrations(list))
})

test('a fresh store gets every migration once, recorded in schema_version and user_version', () => {
  const db = new Database(':memory:')
  const report = runMigrations(db, ANALYTICS_MIGRATIONS, { label: 'analytics', now: () => 1234 })
  assert.equal(report.from, 0)
  assert.equal(report.to, ANALYTICS_MIGRATIONS.length)
  assert.deepEqual(
    report.applied.map((a) => a.name),
    ANALYTICS_MIGRATIONS.map((x) => x.name)
  )
  assert.equal(currentVersion(db), ANALYTICS_MIGRATIONS.length)
  assert.equal(db.pragma('user_version', { simple: true }), ANALYTICS_MIGRATIONS.length)
  assert.deepEqual(
    appliedMigrations(db).map((a) => [a.version, a.appliedAt]),
    ANALYTICS_MIGRATIONS.map((x) => [x.version, 1234])
  )
  const again = runMigrations(db, ANALYTICS_MIGRATIONS, { label: 'analytics' })
  assert.deepEqual(again.applied, [])
  assert.equal(count(db, 'SELECT count(*) AS n FROM schema_version'), ANALYTICS_MIGRATIONS.length)
  db.close()
})

test('a failing migration rolls back completely and leaves the store at the last good version', () => {
  const db = new Database(':memory:')
  const list = [
    m(1, 'one', (d) => d.exec('CREATE TABLE a (x INTEGER)')),
    m(2, 'two', (d) => {
      d.exec('CREATE TABLE b (y INTEGER)')
      d.exec('INSERT INTO a VALUES (1)')
      throw new Error('boom')
    }),
  ]
  assert.throws(
    () => runMigrations(db, list, { label: 'test' }),
    /test migration 2 \(two\) failed: boom/
  )
  assert.equal(currentVersion(db), 1)
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get(), undefined)
  assert.equal(count(db, 'SELECT count(*) AS n FROM a'), 0)
  assert.equal(db.inTransaction, false)
  // Fixed code applies cleanly on the next start.
  list[1] = m(2, 'two', (d) => d.exec('CREATE TABLE b (y INTEGER)'))
  assert.equal(runMigrations(db, list, { label: 'test' }).to, 2)
  db.close()
})

test('a migration may not end the runner transaction itself', () => {
  const db = new Database(':memory:')
  assert.throws(
    () => runMigrations(db, [m(1, 'sneaky', (d) => d.exec('COMMIT'))], { label: 't' }),
    /ended the runner's transaction/
  )
  assert.equal(currentVersion(db), 0)
  db.close()
})

test('a store newer than the build (a rollback) is reported as ahead and left alone', () => {
  const db = new Database(':memory:')
  runMigrations(db, [m(1, 'a', () => {}), m(2, 'b', (d) => d.exec('CREATE TABLE extra (z TEXT)'))])
  const report = runMigrations(db, [m(1, 'a', () => {})], { label: 'older-image' })
  assert.equal(report.ahead, true)
  assert.deepEqual(report.applied, [])
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'extra'").get())
  db.close()
})

test('migrationDrift names versions recorded under a different name', () => {
  const db = new Database(':memory:')
  runMigrations(db, [m(1, 'baseline', () => {})])
  assert.deepEqual(migrationDrift(db, [m(1, 'baseline', () => {})]), [])
  assert.deepEqual(migrationDrift(db, [m(1, 'other', () => {})]), [
    'version 1: store says "baseline", code says "other"',
  ])
  db.close()
})

test('a content store from before migrations adopts the baseline without touching its rows', () => {
  const dir = tmpDir()
  try {
    const file = path.join(dir, 'content.db')
    const legacy = new Database(file)
    legacy.pragma('journal_mode = WAL')
    legacy.exec(LEGACY_CONTENT_DDL)
    legacy.prepare("INSERT INTO kv VALUES ('home', '{\"a\":1}', 5)").run()
    legacy.prepare("INSERT INTO pages VALUES ('now', '{}', 'body', 6)").run()
    legacy.prepare("INSERT INTO collection_items VALUES ('blog', 'x', '{}', 'b', 7)").run()
    const before = legacy
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
    legacy.close()

    const db = new Database(file)
    const report = initSchema(db, { backupDir: path.join(dir, 'pre') })
    // The baseline is adopted as is; later migrations only add tables (expand-only).
    assert.deepEqual(report.applied[0], { version: 1, name: 'baseline' })
    assert.deepEqual(report.applied.map((a) => a.version), CONTENT_MIGRATIONS.map((x) => x.version))
    assert.equal(fs.existsSync(path.join(dir, 'pre')), false, 'adopting the baseline needs no copy')
    // Every table, index and column the legacy store had is exactly as it was.
    const legacyNames = new Set((before as Array<{ name: string }>).map((r) => r.name))
    const after = db
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .filter((r) => legacyNames.has((r as { name: string }).name))
    assert.deepEqual(after, before)
    assert.equal(count(db, 'SELECT count(*) AS n FROM kv'), 1)
    assert.equal(count(db, 'SELECT count(*) AS n FROM pages'), 1)
    assert.equal(count(db, 'SELECT count(*) AS n FROM collection_items'), 1)
    db.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a versioned store is copied aside (VACUUM INTO) before a new migration, newest copies kept', () => {
  const dir = tmpDir()
  try {
    const file = path.join(dir, 'content.db')
    const db = new Database(file)
    runMigrations(db, CONTENT_MIGRATIONS)
    db.prepare("INSERT INTO kv VALUES ('home', '{}', 1)").run()
    const pre = path.join(dir, 'pre')
    const next = [
      ...CONTENT_MIGRATIONS,
      m(CONTENT_MIGRATIONS.length + 1, 'add-x', (d) => d.exec('ALTER TABLE kv ADD COLUMN x TEXT')),
    ]
    let copy: string | null = null
    runMigrations(db, next, {
      label: 'content',
      beforeMigrate: ({ from }) => {
        copy = backupBeforeMigration(db, { dir: pre, label: 'content', from })
      },
    })
    assert.ok(copy && fs.existsSync(copy), 'copy written')
    const snap = new Database(copy as unknown as string, { readonly: true })
    assert.equal(count(snap, 'SELECT count(*) AS n FROM kv'), 1)
    assert.equal(currentVersion(snap), CONTENT_MIGRATIONS.length, 'the copy is the pre-migration state')
    snap.close()

    for (let i = 0; i < PRE_MIGRATION_KEEP + 3; i++) {
      backupBeforeMigration(db, {
        dir: pre,
        label: 'content',
        from: 2,
        now: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      })
    }
    assert.equal(
      fs.readdirSync(pre).filter((f) => f.startsWith('content-v')).length,
      PRE_MIGRATION_KEEP
    )
    assert.equal(backupBeforeMigration(db, { dir: pre, label: 'content', from: 0 }), null)
    db.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an analytics store created before vitals.vkey gains the column and its unique index', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE vitals (ts INTEGER NOT NULL, day TEXT NOT NULL, route TEXT NOT NULL, name TEXT NOT NULL,
             value REAL NOT NULL, rating TEXT NOT NULL, device TEXT, nav TEXT)`)
  db.prepare(
    "INSERT INTO vitals VALUES (1, '2026-01-01', '/', 'LCP', 1200, 'good', 'desktop', 'navigate')"
  ).run()
  const report = migrateAnalyticsDb(db)
  assert.equal(report.to, ANALYTICS_MIGRATIONS.length)
  assert.ok(
    (db.prepare('PRAGMA table_info(vitals)').all() as Array<{ name: string }>).some(
      (c) => c.name === 'vkey'
    )
  )
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_vitals_key'").get())
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'errors'").get())
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'restore_drills'").get())
  assert.equal(count(db, 'SELECT count(*) AS n FROM vitals'), 1)
  db.close()
})

test('processes migrating the same new file at once apply each migration exactly once', async () => {
  const dir = tmpDir()
  try {
    const file = path.join(dir, 'race.db')
    const script = `
      import Database from 'better-sqlite3'
      import { ensureWal, runMigrations } from ${JSON.stringify(path.join(ROOT, 'scripts/db/migrate.mjs'))}
      import { ANALYTICS_MIGRATIONS } from ${JSON.stringify(path.join(ROOT, 'scripts/db/analytics/index.mjs'))}
      const db = new Database(process.argv[1], { timeout: 10000 })
      ensureWal(db)
      const r = runMigrations(db, ANALYTICS_MIGRATIONS, { label: 'race' })
      console.log(JSON.stringify(r.applied.map((a) => a.version)))
      db.close()
    `
    const runs = await Promise.all(
      Array.from(
        { length: 4 },
        () =>
          new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
            const child = spawn(process.execPath, ['--input-type=module', '-e', script, file], {
              cwd: ROOT,
            })
            let out = ''
            let err = ''
            child.stdout.on('data', (c) => (out += c))
            child.stderr.on('data', (c) => (err += c))
            child.on('close', (code) => resolve({ code, out, err }))
          })
      )
    )
    for (const r of runs) assert.equal(r.code, 0, r.err)
    const appliedAcross = runs
      .flatMap((r) => JSON.parse(r.out.trim()) as number[])
      .sort((a, b) => a - b)
    assert.deepEqual(
      appliedAcross,
      ANALYTICS_MIGRATIONS.map((x) => x.version)
    )
    const db = new Database(file, { readonly: true })
    assert.equal(count(db, 'SELECT count(*) AS n FROM schema_version'), ANALYTICS_MIGRATIONS.length)
    db.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the operator CLI reports status without writing and migrates a given file', () => {
  const dir = tmpDir()
  try {
    const file = path.join(dir, 'copy.db')
    const legacy = new Database(file)
    legacy.exec(LEGACY_CONTENT_DDL)
    legacy.close()
    const cli = path.join(ROOT, 'scripts/migrate-db.mjs')
    const status = spawnSync(
      process.execPath,
      [cli, '--status', '--db', 'content', '--file', file],
      { encoding: 'utf8' }
    )
    assert.equal(status.status, 0, status.stderr)
    const all = CONTENT_MIGRATIONS.map((x) => `${x.version}-${x.name}`).join(', ')
    const latest = CONTENT_MIGRATIONS.length
    assert.ok(status.stdout.includes(`v0/${latest}  behind: ${all}`), status.stdout)
    const migrated = spawnSync(process.execPath, [cli, '--db', 'content', '--file', file], {
      encoding: 'utf8',
    })
    assert.equal(migrated.status, 0, migrated.stderr)
    assert.ok(migrated.stdout.includes(`content: migrated v0 → v${latest} (${all})`), migrated.stdout)
    const again = spawnSync(
      process.execPath,
      [cli, '--status', '--db', 'content', '--file', file],
      { encoding: 'utf8' }
    )
    assert.ok(again.stdout.includes(`v${latest}/${latest}  current`), again.stdout)
    const bad = spawnSync(process.execPath, [cli, '--db', 'nope'], { encoding: 'utf8' })
    assert.equal(bad.status, 2)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// A copy of the live snapshot, when one is present (the realistic data the
// stream setup copies into data/content.db; never committed).
const LIVE = path.join(ROOT, 'data', 'content.db')
test(
  'migrating a copy of the live content snapshot keeps every row and passes integrity_check',
  { skip: !fs.existsSync(LIVE) && 'no data/content.db' },
  () => {
    const dir = tmpDir()
    try {
      const src = new Database(LIVE, { readonly: true })
      const copyFile = path.join(dir, 'live-copy.db')
      src.prepare('VACUUM INTO ?').run(copyFile)
      const tables = ['pages', 'collection_items', 'kv', 'r2_pending']
      const before = Object.fromEntries(
        tables.map((t) => [t, count(src, `SELECT count(*) AS n FROM ${t}`)])
      )
      const checksum = (db: Database.Database) =>
        (
          db
            .prepare(
              "SELECT group_concat(key || ':' || length(value) || ':' || updated_at, ',') AS s FROM (SELECT * FROM kv ORDER BY key)"
            )
            .get() as { s: string }
        ).s
      const kvBefore = checksum(src)
      src.close()

      const db = new Database(copyFile)
      const report = initSchema(db, { backupDir: path.join(dir, 'pre') })
      assert.equal(report.to, CONTENT_MIGRATIONS.length)
      for (const t of tables)
        assert.equal(count(db, `SELECT count(*) AS n FROM ${t}`), before[t], t)
      assert.equal(checksum(db), kvBefore)
      assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
      assert.equal(initSchema(db).applied.length, 0, 'idempotent')
      db.close()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
)
