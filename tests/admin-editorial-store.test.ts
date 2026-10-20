/**
 * The store side shared by H4 and H6: content migration 002 ("editorial")
 * adds the pending_revisions and redirects tables — expand-only, so it
 * applies cleanly on the production store (already at v1) and an older
 * image keeps working on a v2 store — and the editorial event hook the
 * admin audit log can subscribe to.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { CONTENT_MIGRATIONS } from '../scripts/db/content/index.mjs'
import { currentVersion, runMigrations } from '../scripts/db/migrate.mjs'
import { emitEditorialEvent, onEditorialEvent } from '../lib/editorialEvents'

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'admin-editorial-store-'))

test('migration 2 is "editorial", right after the baseline', () => {
  assert.deepEqual(
    CONTENT_MIGRATIONS.slice(0, 2).map((m) => `${m.version}-${m.name}`),
    ['1-baseline', '2-editorial'],
  )
})

test('a v1 store (production today) gains both tables without any row changing', () => {
  const dir = tmpDir()
  try {
    const file = path.join(dir, 'content.db')
    const db = new Database(file)
    runMigrations(db, CONTENT_MIGRATIONS.slice(0, 1))
    assert.equal(currentVersion(db), 1)
    db.prepare("INSERT INTO collection_items VALUES ('blog', 'a', '{\"title\":\"A\"}', 'Body', 5)").run()
    db.prepare("INSERT INTO kv VALUES ('home', '{}', 6)").run()
    const report = runMigrations(db, CONTENT_MIGRATIONS)
    assert.deepEqual(report.applied.map((a) => a.name).slice(0, 1), ['editorial'])
    assert.equal(currentVersion(db), CONTENT_MIGRATIONS.length)
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name)
    assert.ok(tables.includes('pending_revisions') && tables.includes('redirects'))
    assert.deepEqual(db.prepare('SELECT * FROM collection_items').all(), [{ collection: 'blog', slug: 'a', frontmatter: '{"title":"A"}', body: 'Body', updated_at: 5 }])
    // Replaying is a no-op.
    assert.deepEqual(runMigrations(db, CONTENT_MIGRATIONS).applied, [])
    db.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the redirects table refuses a row that leads to itself or to another collection', () => {
  const db = new Database(':memory:')
  runMigrations(db, CONTENT_MIGRATIONS)
  const insert = db.prepare('INSERT INTO redirects (collection, from_slug, to_slug, created_at) VALUES (?, ?, ?, ?)')
  insert.run('blog', 'old', 'new', 1)
  assert.throws(() => insert.run('blog', 'same', 'same', 1), /CHECK/)
  assert.throws(() => insert.run('cv', 'a', 'b', 1), /CHECK/)
  assert.throws(() => insert.run('blog', 'old', 'other', 1), /UNIQUE|PRIMARY/)
  const plan = (db.prepare("EXPLAIN QUERY PLAN SELECT from_slug FROM redirects WHERE collection = 'blog' AND to_slug = 'new'").all() as Array<{ detail: string }>).map((r) => r.detail).join(' ')
  assert.match(plan, /idx_redirects_target/, 'the "old addresses of this item" lookup uses the index')
  db.close()
})

test('editorial events reach every listener with a timestamp; a failing listener is ignored; unsubscribe works', () => {
  const seen: unknown[] = []
  const offBad = onEditorialEvent(() => {
    throw new Error('audit log down')
  })
  const off = onEditorialEvent((e, ctx) => seen.push([e.action, typeof e.at, ctx.req]))
  emitEditorialEvent({ action: 'discard-changes', collection: 'blog', slug: 'x' }, { req: 'REQ' })
  off()
  offBad()
  emitEditorialEvent({ action: 'content-export', files: 3, bytes: 10 })
  assert.deepEqual(seen, [['discard-changes', 'number', 'REQ']])
})
