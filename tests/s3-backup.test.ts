import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'

// lib/db.ts and lib/backup.ts resolve data/ from process.cwd() at import time,
// so the whole suite runs inside a throwaway project root without R2.
const repoRoot = process.cwd()
const root = fs.mkdtempSync(path.join(os.tmpdir(), 's3-backup-'))
for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]
process.chdir(root)

const dataDir = path.join(root, 'data')
const uploadsDir = path.join(root, 'public', 'uploads')
const backupsDir = path.join(dataDir, 'backups')
fs.mkdirSync(path.join(dataDir, 'cv_snapshots'), { recursive: true })
fs.mkdirSync(uploadsDir, { recursive: true })
fs.writeFileSync(path.join(dataDir, 'admin.json'), '{"email":"owner@example.com","hash":"original"}')
fs.writeFileSync(path.join(dataDir, 'mongo_config.json'), '{"uri":""}')
fs.writeFileSync(path.join(dataDir, 'cv_snapshots', 'cv_1.json'), '{"v":1}')
fs.writeFileSync(path.join(uploadsDir, 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

const dbMod = await import('../lib/db')
const backup = await import('../lib/backup')
const { getDb, closeDb, reopenDb } = dbMod

after(() => {
  closeDb()
  process.chdir(repoRoot)
  fs.rmSync(root, { recursive: true, force: true })
})

function seed() {
  const db = getDb()
  db.exec('DELETE FROM pages; DELETE FROM collection_items; DELETE FROM kv;')
  db.prepare('INSERT INTO pages VALUES (?, ?, ?, ?)').run('now', '{"title":"Now"}', 'Building things', 1)
  db.prepare('INSERT INTO collection_items VALUES (?, ?, ?, ?, ?)').run('blog', 'first', '{"title":"First"}', 'Hello', 1)
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('home', '{"hero":{"brand":"A"}}', 1)
}

const tar = createRequire(import.meta.url)('tar-stream')

async function tarball(entries: Record<string, Buffer | string>): Promise<Buffer> {
  const pack = tar.pack()
  for (const [name, body] of Object.entries(entries)) pack.entry({ name }, body)
  pack.finalize()
  const chunks: Buffer[] = []
  for await (const c of pack.pipe(zlib.createGzip())) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

test('the connection is shared through globalThis and reset by closeDb/reopenDb', () => {
  const g = globalThis as { __contentDb?: unknown }
  const a = getDb()
  assert.equal(getDb(), a)
  assert.equal(g.__contentDb, a)
  closeDb()
  assert.equal(g.__contentDb, null)
  assert.equal(a.open, false)
  const b = getDb()
  assert.notEqual(b, a)
  const c = reopenDb()
  assert.notEqual(c, b)
  assert.equal(b.open, false)
  assert.equal(getDb(), c)
})

test('snapshot names are unique even within the same millisecond', () => {
  const d = new Date('2026-10-12T10:15:00.123Z')
  const a = backup.snapshotFilename(d)
  const b = backup.snapshotFilename(d)
  assert.match(a, /^snapshot-20261012-101500-123-[0-9a-f]{6}\.tgz$/)
  assert.notEqual(a, b)
  assert.match(a, backup.SNAPSHOT_FILE_RE)
  assert.match('snapshot-20250101-000000.tgz', backup.SNAPSHOT_FILE_RE)
  assert.doesNotMatch('latest.tgz', backup.SNAPSHOT_FILE_RE)
  assert.doesNotMatch('my-upload.tgz', backup.SNAPSHOT_FILE_RE)
})

test('selectForPruning keeps the newest N', () => {
  const items = [5, 1, 4, 2, 3].map((t) => ({ name: `s${t}`, t }))
  assert.deepEqual(
    backup.selectForPruning(items, 2, (i) => i.t).map((i) => i.name),
    ['s3', 's2', 's1'],
  )
  assert.deepEqual(backup.selectForPruning(items, 10, (i) => i.t), [])
  assert.equal(backup.selectForPruning(items, 0, (i) => i.t).length, 5)
})

test('new snapshots carry content but never admin credentials or Mongo settings', async () => {
  seed()
  const snap = await backup.createSnapshot()
  const paths = snap.manifest.files.map((f) => f.path)
  assert.ok(paths.includes('db/content.db'))
  assert.ok(paths.includes('uploads/photo.png'))
  assert.ok(paths.includes('data/snapshots/cv_snapshots/cv_1.json'))
  assert.equal(paths.some((p) => p.includes('admin.json') || p.includes('mongo_config.json')), false)
  assert.equal(snap.r2.pushed, false)
  assert.ok(fs.existsSync(path.join(backupsDir, snap.filename)))
})

test('restore swaps the DB, keeps admin.json, writes a safety snapshot and lists paths to refresh', async () => {
  seed()
  const snap = await backup.createSnapshot()

  // Diverge: delete the post, add another, change home, change the password.
  const db = getDb()
  db.prepare('DELETE FROM collection_items WHERE slug = ?').run('first')
  db.prepare('INSERT INTO collection_items VALUES (?, ?, ?, ?, ?)').run('work', 'later', '{"title":"Later"}', '', 2)
  db.prepare('UPDATE kv SET value = ? WHERE key = ?').run('{"hero":{"brand":"B"}}', 'home')
  fs.writeFileSync(path.join(dataDir, 'admin.json'), '{"email":"owner@example.com","hash":"changed"}')
  fs.rmSync(path.join(uploadsDir, 'photo.png'))

  const result = await backup.restoreLocalSnapshot(snap.filename)
  assert.equal(result.report.dbReplaced, true)
  assert.equal(result.restored.dbReplaced, true)
  assert.equal(result.report.r2Mirrored, 0)
  assert.equal(result.report.r2Removed, 0)
  assert.ok(result.safetySnapshot && fs.existsSync(path.join(backupsDir, result.safetySnapshot)))

  const live = getDb()
  assert.equal(live.open, true)
  assert.deepEqual(
    live.prepare('SELECT collection, slug FROM collection_items ORDER BY slug').all(),
    [{ collection: 'blog', slug: 'first' }],
  )
  assert.equal((live.prepare("SELECT value FROM kv WHERE key = 'home'").get() as { value: string }).value, '{"hero":{"brand":"A"}}')
  assert.ok(fs.existsSync(path.join(uploadsDir, 'photo.png')))
  assert.match(fs.readFileSync(path.join(dataDir, 'admin.json'), 'utf-8'), /"changed"/)

  for (const p of ['/blog', '/work', '/now', '/uses', '/blog/first', '/work/later']) {
    assert.ok(result.pathsToRevalidate.includes(p), p)
  }

  // The safety snapshot really holds the replaced state.
  const undo = await backup.restoreLocalSnapshot(result.safetySnapshot!)
  assert.deepEqual(
    getDb().prepare('SELECT slug FROM collection_items ORDER BY slug').all(),
    [{ slug: 'later' }],
  )
  assert.equal(undo.report.dbReplaced, true)
})

test('an old snapshot that still contains admin.json never overwrites the current file', async () => {
  seed()
  fs.writeFileSync(path.join(dataDir, 'admin.json'), '{"hash":"current"}')
  fs.writeFileSync(
    path.join(backupsDir, 'legacy.tgz'),
    await tarball({
      'MANIFEST.json': '{"version":1}',
      'data/admin.json': '{"hash":"from-snapshot"}',
      'data/mongo_config.json': '{"uri":"mongodb://old"}',
      'uploads/legacy.png': Buffer.from([0x89, 0x50]),
      'uploads/nested/skip.png': Buffer.from([0x89]),
    }),
  )
  const result = await backup.restoreLocalSnapshot('legacy.tgz')
  assert.equal(fs.readFileSync(path.join(dataDir, 'admin.json'), 'utf-8'), '{"hash":"current"}')
  assert.equal(fs.readFileSync(path.join(dataDir, 'mongo_config.json'), 'utf-8'), '{"uri":""}')
  assert.equal(result.report.dbReplaced, false)
  assert.ok(result.report.warnings.some((w) => w.includes('data/admin.json')))
  assert.ok(result.report.warnings.some((w) => w.includes('no database')))
  assert.ok(fs.existsSync(path.join(uploadsDir, 'legacy.png')))
  assert.equal(fs.existsSync(path.join(uploadsDir, 'nested')), false)
  // The live DB was left alone.
  assert.deepEqual(getDb().prepare('SELECT slug FROM collection_items').all(), [{ slug: 'first' }])
})

test('a corrupt database in a snapshot aborts the restore before anything changes', async () => {
  seed()
  const before = fs.readdirSync(backupsDir).length
  fs.writeFileSync(
    path.join(backupsDir, 'corrupt.tgz'),
    await tarball({ 'db/content.db': 'this is not sqlite at all, just text padding'.repeat(20), 'uploads/new.png': 'x' }),
  )
  await assert.rejects(backup.restoreLocalSnapshot('corrupt.tgz'), /unusable/)
  assert.deepEqual(getDb().prepare('SELECT slug FROM collection_items').all(), [{ slug: 'first' }])
  assert.equal(fs.existsSync(path.join(uploadsDir, 'new.png')), false)
  // No safety snapshot and no leftover staging directory.
  assert.equal(fs.readdirSync(backupsDir).length, before + 1)
})

test('restore refuses paths outside data/backups', async () => {
  await assert.rejects(backup.restoreLocalSnapshot('../admin.json'), /outside data\/backups/)
  await assert.rejects(backup.restoreLocalSnapshot('missing.tgz'), /not found/)
})

test('backup and restore never run concurrently', async () => {
  seed()
  const first = backup.createSnapshot()
  await assert.rejects(backup.createSnapshot(), (err: Error) => err instanceof backup.StorageBusyError)
  await first
  // The lock is released afterwards.
  await backup.createSnapshot()
})

test('local retention keeps the newest 20 snapshots and never touches other archives', async () => {
  for (const f of fs.readdirSync(backupsDir)) fs.rmSync(path.join(backupsDir, f), { recursive: true, force: true })
  fs.writeFileSync(path.join(backupsDir, 'keep-me.tgz'), 'manual archive')
  const base = Date.now() / 1000 - 10_000
  for (let i = 0; i < 25; i++) {
    const name = `snapshot-20200101-0000${String(i).padStart(2, '0')}.tgz`
    const fp = path.join(backupsDir, name)
    fs.writeFileSync(fp, 'old')
    fs.utimesSync(fp, base + i, base + i)
  }
  const snap = await backup.createSnapshot()
  const left = fs.readdirSync(backupsDir).filter((f) => backup.SNAPSHOT_FILE_RE.test(f))
  assert.equal(left.length, backup.LOCAL_KEEP)
  assert.ok(left.includes(snap.filename))
  assert.ok(fs.existsSync(path.join(backupsDir, 'keep-me.tgz')))
  // The oldest ones went first.
  assert.equal(left.includes('snapshot-20200101-000000.tgz'), false)
  assert.ok(left.includes('snapshot-20200101-000024.tgz'))
  assert.equal(snap.pruned.local.length, 6)
})

test('OPS-2: a trash row the restore brings back beside a live file is dropped (the file is back in the library); a tombstone without its file stays', async () => {
  seed()
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  fs.writeFileSync(path.join(uploadsDir, 'probe.png'), png)
  const db = getDb()
  db.exec('DELETE FROM media_trash; DELETE FROM media_redirects;')
  // A snapshot taken while probe.png waited in the trash (its folder is never in a snapshot) …
  db.prepare("INSERT INTO media_trash (name, files, deleted_at, meta) VALUES ('probe.png', '[\"probe.png\"]', ?, ?)").run(Date.now(), JSON.stringify({ alt: 'A probe card', altZh: '', caption: '', captionZh: '' }))
  db.prepare("INSERT INTO media_trash (name, files, deleted_at) VALUES ('tomb.png', '[\"tomb.png\"]', ?)").run(Date.now())
  db.prepare("INSERT INTO media_redirects (from_name, to_name, created_at) VALUES ('probe.png', 'newer.png', 1)").run()
  const snap = await backup.createSnapshot()
  // … then probe.png was restored from the trash and is live: restoring that snapshot must not hide it again.
  db.prepare("DELETE FROM media_trash WHERE name = 'probe.png'").run()

  const result = await backup.restoreLocalSnapshot(snap.filename)
  const live = getDb()
  assert.deepEqual(live.prepare('SELECT name FROM media_trash ORDER BY name').all(), [{ name: 'tomb.png' }], 'the tombstone (no file) stays')
  assert.deepEqual(live.prepare("SELECT * FROM media_redirects WHERE from_name = 'probe.png'").all(), [], 'its own address serves it again')
  const { readMediaMeta } = await import('../lib/media/metaStore')
  assert.equal(readMediaMeta().doc.items['probe.png']?.alt, 'A probe card', 'its texts come back')
  assert.ok(result.report.warnings.some((w) => /back in the media library \(probe\.png\)/.test(w)), result.report.warnings.join(' | '))
  const { listLibrary } = await import('../lib/media/list')
  assert.ok(listLibrary().items.some((i) => i.name === 'probe.png'), 'listed in the library')
  fs.rmSync(path.join(uploadsDir, 'probe.png'))
})
