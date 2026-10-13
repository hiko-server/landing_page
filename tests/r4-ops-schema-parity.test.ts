import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { initSchema } from '../lib/db'
import { UPLOAD_NAME_RE } from '../lib/security/uploadName'
import { SAFE_UPLOAD, openContentDb } from '../scripts/content-helpers.mjs'

// The plain-Node scripts (container boot sync, operator CLI) cannot import
// lib/*.ts, so the SQLite DDL and the upload-name rule are duplicated in
// scripts/content-helpers.mjs. These tests fail as soon as the copies drift.

type MasterRow = { type: string; name: string; tbl_name: string; sql: string | null }

/** Whitespace-insensitive DDL: collapse runs, drop spaces around punctuation. */
function normaliseSql(sql: string | null): string {
  return String(sql ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim()
}

function schemaOf(db: Database.Database) {
  const rows = db
    .prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`)
    .all() as MasterRow[]
  return rows.map((r) => ({
    type: r.type,
    name: r.name,
    tbl_name: r.tbl_name,
    sql: normaliseSql(r.sql),
    columns:
      r.type === 'table'
        ? (db.prepare(`PRAGMA table_info(${JSON.stringify(r.name)})`).all() as unknown[])
        : (db.prepare(`PRAGMA index_info(${JSON.stringify(r.name)})`).all() as unknown[]),
  }))
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-parity-'))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('lib/db initSchema and scripts/content-helpers openContentDb create the same schema', () => {
  withTempDir((dir) => {
    const appDb = new Database(path.join(dir, 'app.db'))
    const scriptDb = openContentDb(path.join(dir, 'nested', 'script.db'))
    try {
      initSchema(appDb)
      const app = schemaOf(appDb)
      const script = schemaOf(scriptDb)
      assert.ok(app.length >= 5, 'expected the four tables plus the index')
      assert.deepEqual(script, app)
      for (const db of [appDb, scriptDb]) {
        assert.equal(String(db.pragma('journal_mode', { simple: true })).toLowerCase(), 'wal')
      }
    } finally {
      appDb.close()
      scriptDb.close()
    }
  })
})

test('initSchema is idempotent on an existing store', () => {
  withTempDir((dir) => {
    const file = path.join(dir, 'content.db')
    const first = openContentDb(file)
    first.prepare(`INSERT INTO kv (key, value, updated_at) VALUES ('home', '{}', 1)`).run()
    first.close()
    const db = new Database(file)
    try {
      initSchema(db)
      initSchema(db)
      assert.equal((db.prepare('SELECT count(*) AS n FROM kv').get() as { n: number }).n, 1)
    } finally {
      db.close()
    }
  })
})

test('the upload-name rule is identical in the app and the scripts', () => {
  assert.equal(SAFE_UPLOAD.source, UPLOAD_NAME_RE.source)
  assert.equal(SAFE_UPLOAD.flags, UPLOAD_NAME_RE.flags)
  const fixtures = [
    'photo.png',
    'photo-a1b2c3d4e5.webp',
    'IMG_2024.06.01.jpg',
    '_underscore.avif',
    'a',
    'x'.repeat(255),
    'x'.repeat(256),
    '.hidden.png',
    '..',
    'a..b.png',
    'dir/photo.png',
    'dir\\photo.png',
    'space name.png',
    'naïve.png',
    '',
    '-dash-first.gif',
  ]
  for (const name of fixtures) {
    assert.equal(SAFE_UPLOAD.test(name), UPLOAD_NAME_RE.test(name), name)
  }
  assert.equal(UPLOAD_NAME_RE.test('photo.png'), true)
  assert.equal(UPLOAD_NAME_RE.test('../etc/passwd'), false)
})
