/**
 * Content-store behaviour that the CV/home APIs rely on: versions (ETags),
 * atomic If-Match writes, corrupt-row handling, transactional item writes,
 * R2 retry and snapshot hygiene. Runs against a throw-away SQLite file in a
 * temp working directory — never data/content.db — with R2 disabled.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's1-store-'))
let store: typeof import('../lib/contentStore')
let db: typeof import('../lib/db')

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  db = await import('../lib/db')
  store = await import('../lib/contentStore')
})

after(() => {
  db.closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('kv versions are strictly increasing and readable as metadata', async () => {
  assert.equal(store.getKvMeta('doc'), null)
  assert.deepEqual(store.getKvWithMeta('doc'), { value: null, updatedAt: 0, corrupt: false, raw: null })
  const a = await store.putKv('doc', { n: 1 })
  const b = await store.putKv('doc', { n: 2 })
  assert.ok(a.ok && b.ok)
  if (!a.ok || !b.ok) return
  assert.ok(b.updatedAt > a.updatedAt, 'two writes in the same ms still get distinct versions')
  assert.equal(store.getKvMeta('doc')?.updatedAt, b.updatedAt)
  assert.deepEqual(store.getKv('doc'), { n: 2 })
})

test('precondition is evaluated atomically; a failed check writes nothing', async () => {
  const first = await store.putKv('cas', { v: 'one' })
  assert.ok(first.ok)
  if (!first.ok) return
  const stale = await store.putKv('cas', { v: 'two' }, { precondition: (cur) => cur === first.updatedAt - 1 })
  assert.equal(stale.ok, false)
  assert.ok(!stale.ok && stale.conflict?.updatedAt === first.updatedAt)
  assert.deepEqual(store.getKv('cas'), { v: 'one' })
  const fresh = await store.putKv('cas', { v: 'three' }, { precondition: (cur) => cur === first.updatedAt })
  assert.ok(fresh.ok)
  assert.deepEqual(store.getKv('cas'), { v: 'three' })
})

test('a missing row is seeded from data/<key>.json, a corrupt row is never replaced by the seed', () => {
  fs.writeFileSync(path.join(tmp, 'data', 'seeded.json'), JSON.stringify({ from: 'seed' }))
  const seeded = store.getKvWithMeta('seeded')
  assert.deepEqual(seeded.value, { from: 'seed' })
  assert.ok(seeded.updatedAt > 0)

  fs.writeFileSync(path.join(tmp, 'data', 'broken.json'), JSON.stringify({ stale: true }))
  db.getDb().prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)').run('broken', '{not json', 1234)
  const errors: unknown[] = []
  const origError = console.error
  console.error = (...args: unknown[]) => errors.push(args)
  try {
    const read = store.getKvWithMeta('broken')
    assert.equal(read.value, null)
    assert.equal(read.corrupt, true)
    assert.equal(read.raw, '{not json')
    assert.equal(read.updatedAt, 1234)
    assert.equal(store.getKv('broken'), null)
  } finally {
    console.error = origError
  }
  assert.equal(errors.length, 1, 'reported loudly, once per row version')
  const row = db.getDb().prepare('SELECT value, updated_at FROM kv WHERE key = ?').get('broken') as { value: string; updated_at: number }
  assert.deepEqual(row, { value: '{not json', updated_at: 1234 }, 'row left untouched')
})

test('item put/delete keep tombstones consistent and refuse to clobber a corrupt tombstone list', async () => {
  assert.ok((await store.putItem('blog', 'hello', { title: 'Hi' }, 'body')).ok)
  assert.ok((await store.removeItem('blog', 'hello')).ok)
  assert.equal(store.getItemFromDb('blog', 'hello'), null)
  assert.deepEqual(store.getKv('tombstones:blog'), ['hello'])
  assert.ok((await store.putItem('blog', 'hello', { title: 'Back' }, 'body')).ok)
  assert.deepEqual(store.getKv('tombstones:blog'), [])

  db.getDb().prepare("UPDATE kv SET value = 'oops' WHERE key = 'tombstones:blog'").run()
  const origError = console.error
  console.error = () => {}
  try {
    const res = await store.removeItem('blog', 'hello')
    assert.equal(res.ok, false)
    assert.ok(store.getItemFromDb('blog', 'hello'), 'delete rolled back with the tombstone update')
    const raw = db.getDb().prepare("SELECT value FROM kv WHERE key = 'tombstones:blog'").get() as { value: string }
    assert.equal(raw.value, 'oops')
    assert.ok((await store.putItem('blog', 'hello', { title: 'Still' }, 'b')).ok, 'saves still work')
  } finally {
    console.error = origError
  }
})

test('retryAsync retries with exponential backoff and rethrows the last error', async () => {
  const delays: number[] = []
  let calls = 0
  const value = await store.retryAsync(
    async () => {
      calls++
      if (calls < 3) throw new Error(`fail ${calls}`)
      return 'ok'
    },
    { attempts: 3, baseDelayMs: 10, sleep: async (ms) => void delays.push(ms) },
  )
  assert.equal(value, 'ok')
  assert.deepEqual(delays, [10, 40])

  let n = 0
  await assert.rejects(
    store.retryAsync(async () => { n++; throw new Error(`boom ${n}`) }, { attempts: 2, baseDelayMs: 0, sleep: async () => {} }),
    /boom 2/,
  )
})

test('If-Match evaluation and ETag formatting', () => {
  assert.equal(store.kvEtag(1700000000123), '"1700000000123"')
  assert.equal(store.kvEtag(0), '"0"')
  assert.equal(store.kvEtag(Number.NaN), '"0"')
  assert.equal(store.ifMatchAllows(undefined, 5), true)
  assert.equal(store.ifMatchAllows('', 5), true)
  assert.equal(store.ifMatchAllows('"5"', 5), true)
  assert.equal(store.ifMatchAllows('"4"', 5), false)
  assert.equal(store.ifMatchAllows('"4", "5"', 5), true)
  assert.equal(store.ifMatchAllows(['"4"', '"5"'], 5), true)
  assert.equal(store.ifMatchAllows('W/"5"', 5), false, 'strong comparison')
  assert.equal(store.ifMatchAllows('5', 5), false, 'unquoted is not an entity tag')
  assert.equal(store.ifMatchAllows('*', 5), true)
  assert.equal(store.ifMatchAllows('*', 0), false)
  assert.equal(store.ifMatchAllows('"0"', 0), true)
})

test('stableStringify ignores key order and undefined values', () => {
  assert.equal(store.stableStringify({ b: 1, a: [{ y: 2, x: 1 }], c: undefined }), store.stableStringify({ a: [{ x: 1, y: 2 }], b: 1 }))
  assert.notEqual(store.stableStringify([1, 2]), store.stableStringify([2, 1]))
})

test('snapshot names are validated; non-strings are rejected, never thrown on', () => {
  assert.equal(store.safeSnapshotName('cv_2025-09-09_03-17-28-947.json'), 'cv_2025-09-09_03-17-28-947.json')
  for (const bad of ['../etc/passwd', 'a/b.json', 'cv.txt', '.hidden.json', 'x..json', '', 'é.json', ['a.json'], 42, null, undefined, { a: 1 }]) {
    assert.equal(store.safeSnapshotName(bad), null, JSON.stringify(bad))
  }
  assert.equal(store.readSnapshotFile(tmp, ['x.json']), null)
})

test('Content-Disposition carries an ASCII fallback and an RFC 5987 filename*', () => {
  assert.equal(
    store.attachmentDisposition('cv_2025-01-01.json'),
    `attachment; filename="cv_2025-01-01.json"; filename*=UTF-8''cv_2025-01-01.json`,
  )
  assert.equal(
    store.attachmentDisposition('简历 "v2".json'),
    `attachment; filename="____v2_.json"; filename*=UTF-8''%E7%AE%80%E5%8E%86%20%22v2%22.json`,
  )
})

test('snapshots skip identical content and are pruned to the newest SNAPSHOT_KEEP', () => {
  const dir = path.join(tmp, 'snaps')
  const t0 = Date.parse('2026-01-01T00:00:00.000Z')
  const first = store.writeSnapshotFile(dir, 'cv', '{"a":1}', new Date(t0))
  assert.equal(store.writeSnapshotFile(dir, 'cv', '{"a":1}', new Date(t0 + 1000)), first, 'duplicate not written')
  assert.equal(store.listSnapshotFiles(dir).length, 1)
  fs.writeFileSync(path.join(dir, 'home_2020-01-01_00-00-00-000.json'), '{}')
  for (let i = 1; i <= store.SNAPSHOT_KEEP + 5; i++) {
    store.writeSnapshotFile(dir, 'cv', JSON.stringify({ i }), new Date(t0 + i * 1000))
  }
  const cv = store.listSnapshotFiles(dir).filter((f) => f.startsWith('cv_'))
  assert.equal(cv.length, store.SNAPSHOT_KEEP)
  assert.equal(store.readSnapshotFile(dir, cv[0]), JSON.stringify({ i: store.SNAPSHOT_KEEP + 5 }), 'newest kept')
  assert.ok(!cv.includes(first), 'oldest pruned')
  assert.ok(fs.existsSync(path.join(dir, 'home_2020-01-01_00-00-00-000.json')), 'other prefixes untouched')
})

test('restore errors map to HTTP statuses', () => {
  assert.equal(store.restoreErrorStatus(store.SNAPSHOT_NOT_FOUND), 404)
  assert.equal(store.restoreErrorStatus('DB write failed: disk I/O'), 500)
  assert.equal(store.restoreErrorStatus('Snapshot is not valid JSON'), 400)
})
