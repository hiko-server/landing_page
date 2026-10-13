import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import Database from 'better-sqlite3'

/**
 * R2 round trips against an in-process S3-compatible server:
 *   - scripts/sync-from-r2.mjs, run as a child process from a throwaway
 *     project root (the script resolves data/ and content/ next to itself);
 *   - lib/backup.ts restore → R2 re-mirror and R2 backup retention, imported
 *     in this process with cwd switched to a second throwaway root.
 */

type Obj = { body: Buffer; at: number }
const objects = new Map<string, Obj>()
let failListing = false
/** Keys whose PUT / DELETE is refused (403, not retried by the SDK). */
const failWrites = new Set<string>()
/** Object GETs served, in order (listings are not counted). */
const gets: string[] = []
const puts: string[] = []

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const server = http.createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const url = new URL(req.url || '/', 'http://x')
    const [, bucket, ...rest] = url.pathname.split('/')
    const key = decodeURIComponent(rest.join('/'))
    if (bucket !== 'test-bucket') {
      res.statusCode = 404
      return res.end()
    }
    if (req.method === 'GET' && !key) {
      if (failListing) {
        res.statusCode = 403
        res.setHeader('content-type', 'application/xml')
        return res.end('<?xml version="1.0"?><Error><Code>AccessDenied</Code><Message>denied</Message></Error>')
      }
      const prefix = url.searchParams.get('prefix') || ''
      const items = [...objects.entries()].filter(([k]) => k.startsWith(prefix))
      res.setHeader('content-type', 'application/xml')
      return res.end(
        '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>test-bucket</Name>' +
          `<KeyCount>${items.length}</KeyCount><IsTruncated>false</IsTruncated>` +
          items
            .map(
              ([k, o]) =>
                `<Contents><Key>${xml(k)}</Key><LastModified>${new Date(o.at).toISOString()}</LastModified>` +
                `<Size>${o.body.length}</Size></Contents>`,
            )
            .join('') +
          '</ListBucketResult>',
      )
    }
    if ((req.method === 'PUT' || req.method === 'DELETE') && failWrites.has(key)) {
      res.statusCode = 403
      res.setHeader('content-type', 'application/xml')
      return res.end('<?xml version="1.0"?><Error><Code>AccessDenied</Code><Message>denied</Message></Error>')
    }
    if (req.method === 'GET') {
      gets.push(key)
      const o = objects.get(key)
      if (!o) {
        res.statusCode = 404
        res.setHeader('content-type', 'application/xml')
        return res.end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>')
      }
      return res.end(o.body)
    }
    if (req.method === 'PUT') {
      puts.push(key)
      objects.set(key, { body: Buffer.concat(chunks), at: Date.now() })
      return res.end()
    }
    if (req.method === 'DELETE') {
      objects.delete(key)
      res.statusCode = 204
      return res.end()
    }
    res.statusCode = 405
    res.end()
  })
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = (server.address() as { port: number }).port

const repoRoot = process.cwd()
const root = fs.mkdtempSync(path.join(os.tmpdir(), 's3-sync-'))
fs.mkdirSync(path.join(root, 'scripts'))
for (const f of ['sync-from-r2.mjs', 'content-helpers.mjs']) {
  fs.copyFileSync(path.join(repoRoot, 'scripts', f), path.join(root, 'scripts', f))
}
// content-helpers.mjs applies the shared, versioned migrations in scripts/db.
fs.cpSync(path.join(repoRoot, 'scripts', 'db'), path.join(root, 'scripts', 'db'), { recursive: true })
fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir')
const dbPath = path.join(root, 'data', 'content.db')

// lib/r2.ts reads its env at import time; lib/db.ts and lib/backup.ts resolve
// data/ from the cwd. Both are set up before the dynamic import below.
const libRoot = fs.mkdtempSync(path.join(os.tmpdir(), 's3-restore-'))
Object.assign(process.env, {
  R2_ENDPOINT: `http://127.0.0.1:${port}`,
  R2_BUCKET: 'test-bucket',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
})
process.chdir(libRoot)
fs.mkdirSync(path.join(libRoot, 'public', 'uploads'), { recursive: true })
const { getDb, closeDb } = await import('../lib/db')
const backup = await import('../lib/backup')

after(() => {
  server.close()
  closeDb()
  process.chdir(repoRoot)
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(libRoot, { recursive: true, force: true })
})

function runSync(projectRoot = root): Promise<{ code: number; out: string }> {
  gets.length = 0
  puts.length = 0
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(projectRoot, 'scripts', 'sync-from-r2.mjs')], {
      cwd: projectRoot,
      env: {
        ...process.env,
        R2_REQUIRED: '',
        R2_ENDPOINT: `http://127.0.0.1:${port}`,
        R2_BUCKET: 'test-bucket',
        R2_ACCESS_KEY_ID: 'test',
        R2_SECRET_ACCESS_KEY: 'test',
      },
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (code) => resolve({ code: code ?? -1, out }))
  })
}

function resetRoot() {
  objects.clear()
  failListing = false
  failWrites.clear()
  for (const dir of ['data', 'content', 'public']) fs.rmSync(path.join(root, dir), { recursive: true, force: true })
  fs.mkdirSync(path.join(root, 'data'), { recursive: true })
  fs.mkdirSync(path.join(root, 'content', 'blog'), { recursive: true })
}

function openDb() {
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (name TEXT PRIMARY KEY, frontmatter TEXT NOT NULL DEFAULT '{}', body TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS collection_items (collection TEXT NOT NULL, slug TEXT NOT NULL, frontmatter TEXT NOT NULL DEFAULT '{}', body TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL, PRIMARY KEY (collection, slug));
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS r2_pending (key TEXT PRIMARY KEY, op TEXT NOT NULL, updated_at INTEGER NOT NULL);
  `)
  return db
}

const put = (key: string, body: string, at: number) => objects.set(key, { body: Buffer.from(body), at })

test('timestamps and seeds decide each key; local-newer rows go back to R2; tombstones hold', async () => {
  resetRoot()
  const now = Date.now()
  const hourAgo = now - 3_600_000
  const dayAgo = now - 86_400_000

  // Bundled git seeds.
  fs.writeFileSync(path.join(root, 'data', 'home.json'), JSON.stringify({ hero: { brand: 'Seed' } }, null, 2))
  fs.writeFileSync(path.join(root, 'content', 'blog', 'seeded.mdx'), '---\ntitle: Seed post\ndate: 2024-01-01\n---\nSeed body\n')

  const db = openDb()
  // kv home: auto-seeded copy written "just now" — must NOT beat R2's older real edit.
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('home', JSON.stringify({ hero: { brand: 'Seed' } }), now)
  // kv cvdata: a real edit newer than R2 (an earlier R2 push failed).
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('cvdata', '{"en":{"v":2}}', now)
  // blog/seeded: seed copy; R2 has the edited version.
  db.prepare('INSERT INTO collection_items VALUES (?, ?, ?, ?, ?)').run('blog', 'seeded', '{"title":"Seed post","date":"2024-01-01"}', 'Seed body\n', now)
  // blog/gone: deleted here after R2 last saw it.
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('tombstones:blog', '["gone"]', hourAgo)
  // work/local-only: never reached R2.
  db.prepare('INSERT INTO collection_items VALUES (?, ?, ?, ?, ?)').run('work', 'local-only', '{"title":"Local"}', 'Only here', now - 60_000)
  // pages/now: identical on both sides.
  db.prepare('INSERT INTO pages VALUES (?, ?, ?, ?)').run('now', '{"title":"Now"}', 'Same\n', dayAgo)
  db.close()

  put('data/home.json', JSON.stringify({ hero: { brand: 'Edited' } }, null, 2), dayAgo)
  put('data/cvdata.json', '{"en":{"v":1}}', dayAgo)
  put('data/broken.json', '{"not": json', dayAgo)
  put('blog/seeded.mdx', '---\ntitle: Edited post\ndate: 2024-01-01\n---\nEdited body\n', dayAgo)
  put('blog/gone.mdx', '---\ntitle: Gone\n---\nbye\n', dayAgo)
  put('blog/fresh.mdx', '---\ntitle: Fresh\ndate: 2024-02-02\n---\nNew from R2\n', dayAgo)
  put('pages/now.mdx', '---\ntitle: Now\n---\nSame\n', dayAgo + 10)
  put('uploads/pic.png', 'PNGDATA', dayAgo)

  const { code, out } = await runSync()
  assert.equal(code, 0, out)
  assert.match(out, /OK: pulled 3, pushed 2, unchanged 1, removed 1, invalid 1, uploads 1/)

  const check = new Database(dbPath, { readonly: true })
  const kv = (k: string) => check.prepare('SELECT value, updated_at FROM kv WHERE key = ?').get(k) as { value: string; updated_at: number } | undefined
  assert.deepEqual(JSON.parse(kv('home')!.value), { hero: { brand: 'Edited' } })
  assert.equal(kv('home')!.updated_at, dayAgo)
  assert.equal(kv('cvdata')!.value, '{"en":{"v":2}}')
  assert.equal(kv('broken'), undefined)

  const item = (c: string, s: string) =>
    check.prepare('SELECT frontmatter, body, updated_at FROM collection_items WHERE collection = ? AND slug = ?').get(c, s) as
      | { frontmatter: string; body: string; updated_at: number }
      | undefined
  assert.equal(JSON.parse(item('blog', 'seeded')!.frontmatter).title, 'Edited post')
  assert.deepEqual(JSON.parse(item('blog', 'fresh')!.frontmatter), { title: 'Fresh', date: '2024-02-02' })
  assert.equal(item('blog', 'fresh')!.updated_at, dayAgo)
  assert.equal(item('blog', 'gone'), undefined)
  // Identical on both sides: settled to the object's LastModified.
  assert.equal((check.prepare("SELECT updated_at FROM pages WHERE name = 'now'").get() as { updated_at: number }).updated_at, dayAgo + 10)
  check.close()

  // Local-newer rows were pushed; the tombstoned object was deleted.
  assert.deepEqual(JSON.parse(objects.get('data/cvdata.json')!.body.toString()), { en: { v: 2 } })
  assert.match(objects.get('work/local-only.mdx')!.body.toString(), /title: Local[\s\S]*Only here/)
  assert.equal(objects.has('blog/gone.mdx'), false)
  assert.equal(fs.readFileSync(path.join(root, 'public', 'uploads', 'pic.png'), 'utf-8'), 'PNGDATA')

  // A second run is a no-op, and every settled key costs no GET (only the
  // unparseable object is fetched again).
  const again = await runSync()
  assert.equal(again.code, 0, again.out)
  assert.match(again.out, /OK: pulled 0, pushed 0, unchanged 0, removed 0, invalid 1, uploads 0/)
  assert.deepEqual(gets, ['data/broken.json'])
  assert.deepEqual(puts, [])
})

const pendingRows = (file = dbPath) => {
  const d = new Database(file, { readonly: true })
  try {
    return d.prepare('SELECT key, op FROM r2_pending ORDER BY key').all() as Array<{ key: string; op: string }>
  } finally {
    d.close()
  }
}

test('pending keys are repaired from the local row first, regardless of timestamps', async () => {
  resetRoot()
  const t = Date.now() - 3_600_000
  const db = openDb()
  // Save #1 reached R2 at t+50; save #2 two seconds later did not (F1).
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('cvdata', '{"en":{"v":2}}', t + 2000)
  db.prepare('INSERT INTO r2_pending VALUES (?, ?, ?)').run('data/cvdata.json', 'put', t + 2100)
  // Deleted here, R2 delete failed; R2 even looks newer than the tombstone.
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('tombstones:blog', '["removed"]', t)
  db.prepare('INSERT INTO r2_pending VALUES (?, ?, ?)').run('blog/removed.mdx', 'delete', t + 10)
  // Nothing on either side any more: the entry is simply dropped.
  db.prepare('INSERT INTO r2_pending VALUES (?, ?, ?)').run('work/ghost.mdx', 'delete', t)
  // Still unreachable: stays pending for the next boot.
  db.prepare('INSERT INTO pages VALUES (?, ?, ?, ?)').run('now', '{"title":"Now"}', 'Local now\n', t + 2000)
  db.prepare('INSERT INTO r2_pending VALUES (?, ?, ?)').run('pages/now.mdx', 'put', t + 2100)
  db.close()

  put('data/cvdata.json', '{"en":{"v":1}}', t + 50)
  put('blog/removed.mdx', '---\ntitle: Removed\n---\nx\n', t + 60_000)
  put('pages/now.mdx', '---\ntitle: Now\n---\nRemote now\n', t + 50)
  failWrites.add('pages/now.mdx')

  const { code, out } = await runSync()
  assert.equal(code, 0, out)
  assert.match(out, /4 key\(s\) left stale in R2/)
  assert.match(out, /push pages\/now\.mdx failed/)
  assert.deepEqual(JSON.parse(objects.get('data/cvdata.json')!.body.toString()), { en: { v: 2 } })
  assert.equal(objects.has('blog/removed.mdx'), false)
  assert.match(objects.get('pages/now.mdx')!.body.toString(), /Remote now/)
  assert.deepEqual(pendingRows(), [{ key: 'pages/now.mdx', op: 'put' }])

  const check = new Database(dbPath, { readonly: true })
  // Local content is never replaced by the stale R2 copy.
  assert.equal((check.prepare("SELECT value FROM kv WHERE key = 'cvdata'").get() as { value: string }).value, '{"en":{"v":2}}')
  assert.equal((check.prepare("SELECT body FROM pages WHERE name = 'now'").get() as { body: string }).body, 'Local now\n')
  // The repaired key is settled to the new object's LastModified.
  assert.equal((check.prepare("SELECT updated_at FROM kv WHERE key = 'cvdata'").get() as { updated_at: number }).updated_at, objects.get('data/cvdata.json')!.at)
  check.close()

  // R2 is back: the remaining pending key is repaired and cleared.
  failWrites.clear()
  const again = await runSync()
  assert.equal(again.code, 0, again.out)
  assert.match(objects.get('pages/now.mdx')!.body.toString(), /Local now/)
  assert.deepEqual(pendingRows(), [])
})

test('push decisions compare content first; settled rows cost no GET on the next boot', async () => {
  resetRoot()
  const now = Date.now()
  const oldBoot = now - 3_600_000
  const dayAgo = now - 86_400_000
  const db = openDb()
  // Rows an older sync re-stamped with its boot time; R2 holds the same documents.
  db.prepare('INSERT INTO pages VALUES (?, ?, ?, ?)').run('uses', '{"title":"Uses","updated":"2026-05-28"}', 'Kit\n', oldBoot)
  db.prepare('INSERT INTO collection_items VALUES (?, ?, ?, ?, ?)').run('blog', 'a', '{"title":"A"}', 'Body A\n', oldBoot)
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('tombstones:blog', '[]', oldBoot)
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('home', '{"hero":{"brand":"X"}}', oldBoot)
  // A real local edit is still pushed.
  db.prepare('INSERT INTO collection_items VALUES (?, ?, ?, ?, ?)').run('blog', 'b', '{"title":"B2"}', 'New\n', oldBoot)
  db.close()
  const usesBody = '---\ntitle: Uses\nupdated: 2026-05-28\n---\nKit\n'
  put('pages/uses.mdx', usesBody, dayAgo)
  put('blog/a.mdx', '---\ntitle: A\n---\nBody A\n', dayAgo)
  put('data/home.json', '{\n  "hero": { "brand": "X" }\n}', dayAgo)
  put('blog/b.mdx', '---\ntitle: B1\n---\nOld\n', dayAgo)

  const { code, out } = await runSync()
  assert.equal(code, 0, out)
  assert.match(out, /OK: pulled 0, pushed 1, unchanged 3, removed 0/)
  assert.deepEqual(puts, ['blog/b.mdx'])
  // The R2 object was not re-serialised (its YAML date stays unquoted).
  assert.equal(objects.get('pages/uses.mdx')!.body.toString(), usesBody)

  const check = new Database(dbPath, { readonly: true })
  const at = (sql: string) => (check.prepare(sql).get() as { updated_at: number }).updated_at
  assert.equal(at("SELECT updated_at FROM pages WHERE name = 'uses'"), dayAgo)
  assert.equal(at("SELECT updated_at FROM collection_items WHERE slug = 'a'"), dayAgo)
  assert.equal(at("SELECT updated_at FROM kv WHERE key = 'home'"), dayAgo)
  assert.equal(at("SELECT updated_at FROM collection_items WHERE slug = 'b'"), objects.get('blog/b.mdx')!.at)
  check.close()

  const again = await runSync()
  assert.equal(again.code, 0, again.out)
  assert.match(again.out, /OK: pulled 0, pushed 0, unchanged 0, removed 0/)
  assert.deepEqual(gets, [])
  assert.deepEqual(puts, [])
})

test('without any tombstone row, remote-only items are imported and each one is logged', async () => {
  resetRoot()
  const dayAgo = Date.now() - 86_400_000
  const db = openDb()
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('home', '{"hero":{}}', dayAgo)
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('tombstones:work', '[]', dayAgo)
  db.close()
  put('data/home.json', '{"hero":{}}', dayAgo)
  put('blog/x.mdx', '---\ntitle: X\n---\nx\n', dayAgo)
  put('work/y.mdx', '---\ntitle: Y\n---\ny\n', dayAgo)

  const { code, out } = await runSync()
  assert.equal(code, 0, out)
  assert.match(out, /remote-only item imported: blog\/x — delete it in the admin if it was removed on purpose/)
  // work/ records deletions: a remote-only item there is simply new.
  assert.doesNotMatch(out, /remote-only item imported: work\/y/)
  const check = new Database(dbPath, { readonly: true })
  assert.ok(check.prepare("SELECT 1 FROM collection_items WHERE collection = 'blog' AND slug = 'x'").get())
  assert.ok(check.prepare("SELECT 1 FROM collection_items WHERE collection = 'work' AND slug = 'y'").get())
  check.close()

  // An empty store is a fresh restore from R2: nothing to flag.
  resetRoot()
  put('blog/x.mdx', '---\ntitle: X\n---\nx\n', dayAgo)
  const fresh = await runSync()
  assert.equal(fresh.code, 0, fresh.out)
  assert.doesNotMatch(fresh.out, /remote-only item imported/)
})

test('an item R2 rewrote after the local deletion comes back and its tombstone is cleared', async () => {
  resetRoot()
  const now = Date.now()
  const db = openDb()
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('tombstones:blog', '["back","other"]', now - 3_600_000)
  db.close()
  put('blog/back.mdx', '---\ntitle: Back\n---\nAgain\n', now - 60_000)

  const { code, out } = await runSync()
  assert.equal(code, 0, out)
  const check = new Database(dbPath, { readonly: true })
  assert.ok(check.prepare("SELECT 1 FROM collection_items WHERE slug = 'back'").get())
  assert.deepEqual(JSON.parse((check.prepare("SELECT value FROM kv WHERE key = 'tombstones:blog'").get() as { value: string }).value), ['other'])
  check.close()
})

test('R2 failure: exit 3 keeps existing local content, exit 1 when the store is empty', async () => {
  resetRoot()
  failListing = true
  const empty = await runSync()
  assert.equal(empty.code, 1, empty.out)

  resetRoot()
  failListing = true
  const db = openDb()
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('home', '{"hero":{}}', Date.now())
  db.close()
  const kept = await runSync()
  assert.equal(kept.code, 3, kept.out)
  const check = new Database(dbPath, { readonly: true })
  assert.equal((check.prepare("SELECT value FROM kv WHERE key = 'home'").get() as { value: string }).value, '{"hero":{}}')
  check.close()
})

test('restore re-mirrors every row to R2, removes stale item objects and uploads missing images', async () => {
  objects.clear()
  failListing = false
  const db = getDb()
  db.exec('DELETE FROM pages; DELETE FROM collection_items; DELETE FROM kv;')
  db.prepare('INSERT INTO pages VALUES (?, ?, ?, ?)').run('now', '{"title":"Now"}', 'Restored now', 1)
  db.prepare('INSERT INTO collection_items VALUES (?, ?, ?, ?, ?)').run('blog', 'kept', '{"title":"Kept"}', 'Body', 1)
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('home', '{"hero":{"brand":"Restored"}}', 1)
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('tombstones:blog', '[]', 1)
  fs.writeFileSync(path.join(libRoot, 'public', 'uploads', 'img.png'), 'PNG')
  const snap = await backup.createSnapshot()
  assert.equal(snap.r2.pushed, true)
  assert.ok(objects.has('backups/latest.tgz'))
  assert.ok(objects.has(`backups/${snap.filename}`))

  // After the snapshot: R2 picks up content the restore must undo.
  const t = Date.now()
  put('blog/kept.mdx', '---\ntitle: Newer\n---\nx\n', t)
  put('blog/added-later.mdx', '---\ntitle: Later\n---\nx\n', t)
  put('work/dup.md', '---\ntitle: Dup\n---\nx\n', t)
  put('blog/notes.txt', 'not an item', t)
  db.prepare("UPDATE kv SET value = ? WHERE key = 'home'").run('{"hero":{"brand":"Changed"}}')

  const result = await backup.restoreLatestFromR2()
  assert.equal(result.report.dbReplaced, true)
  assert.deepEqual(result.report.warnings, [])
  // pages/now + blog/kept + kv home, plus the image R2 did not have.
  assert.equal(result.report.r2Mirrored, 4)
  assert.equal(result.report.r2Removed, 2)
  assert.match(objects.get('blog/kept.mdx')!.body.toString(), /title: Kept/)
  assert.equal(objects.has('blog/added-later.mdx'), false)
  assert.equal(objects.has('work/dup.md'), false)
  assert.ok(objects.has('blog/notes.txt'))
  assert.equal(objects.get('data/home.json')!.body.toString(), '{\n  "hero": {\n    "brand": "Restored"\n  }\n}')
  assert.equal(objects.has('data/tombstones:blog.json'), false)
  assert.equal(objects.get('uploads/img.png')!.body.toString(), 'PNG')
  assert.match(objects.get('pages/now.mdx')!.body.toString(), /Restored now/)
  assert.ok(result.pathsToRevalidate.includes('/blog/kept'))
})

test('a restore whose R2 mirror fails is not undone by the next boot sync', async () => {
  objects.clear()
  failListing = false
  failWrites.clear()
  const db = getDb()
  db.exec('DELETE FROM pages; DELETE FROM collection_items; DELETE FROM kv; DELETE FROM r2_pending;')
  db.prepare('INSERT INTO pages VALUES (?, ?, ?, ?)').run('now', '{"title":"Now"}', 'Restored now', 1)
  db.prepare('INSERT INTO collection_items VALUES (?, ?, ?, ?, ?)').run('blog', 'kept', '{"title":"Kept"}', 'Old body', 1)
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('tombstones:blog', '["older"]', 1)
  db.prepare('INSERT INTO r2_pending VALUES (?, ?, ?)').run('data/stale.json', 'put', 1)
  const snap = await backup.createSnapshot()

  // After the snapshot the site moves on, and R2 follows it.
  const t = Date.now()
  db.prepare("UPDATE collection_items SET body = 'Newer body', updated_at = ? WHERE slug = 'kept'").run(t)
  db.prepare('INSERT INTO collection_items VALUES (?, ?, ?, ?, ?)').run('blog', 'later', '{"title":"Later"}', 'x', t)
  put('blog/kept.mdx', '---\ntitle: Kept\n---\nNewer body\n', t)
  put('blog/later.mdx', '---\ntitle: Later\n---\nx\n', t)
  put('pages/now.mdx', '---\ntitle: Now\n---\nRestored now\n', t)

  // Restore while R2 refuses the item upload and cannot list anything.
  failWrites.add('blog/kept.mdx')
  failListing = true
  const started = Date.now()
  const result = await backup.restoreLocalSnapshot(snap.filename)
  assert.equal(result.report.dbReplaced, true)
  const warnings = result.report.warnings.join('\n')
  assert.match(warnings, /R2 mirror failed for 1 object\(s\): blog\/kept\.mdx/)
  assert.match(warnings, /R2 is stale until the next successful sync/)
  assert.match(warnings, /run `yarn content:push`/)

  const live = getDb()
  const stamps = live
    .prepare('SELECT updated_at AS at FROM pages UNION ALL SELECT updated_at FROM collection_items UNION ALL SELECT updated_at FROM kv')
    .all() as Array<{ at: number }>
  assert.ok(stamps.length > 0 && stamps.every((r) => r.at >= started), JSON.stringify(stamps))
  // Above every pre-restore version, so no old ETag can match a restored row.
  assert.ok(stamps.every((r) => r.at > t))
  const tomb = live.prepare("SELECT value FROM kv WHERE key = 'tombstones:blog'").get() as { value: string }
  assert.deepEqual(JSON.parse(tomb.value).sort(), ['later', 'older'])
  // The snapshot's own pending entry is gone; the mirror's failure is recorded.
  assert.deepEqual(live.prepare('SELECT key, op FROM r2_pending ORDER BY key').all(), [{ key: 'blog/kept.mdx', op: 'put' }])
  closeDb()

  // Next container start, R2 healthy again: the boot sync finishes the job.
  failListing = false
  failWrites.clear()
  fs.mkdirSync(path.join(libRoot, 'scripts'), { recursive: true })
  for (const f of ['sync-from-r2.mjs', 'content-helpers.mjs']) {
    fs.copyFileSync(path.join(repoRoot, 'scripts', f), path.join(libRoot, 'scripts', f))
  }
  fs.cpSync(path.join(repoRoot, 'scripts', 'db'), path.join(libRoot, 'scripts', 'db'), { recursive: true })
  if (!fs.existsSync(path.join(libRoot, 'node_modules'))) {
    fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(libRoot, 'node_modules'), 'dir')
  }
  const boot = await runSync(libRoot)
  assert.equal(boot.code, 0, boot.out)
  assert.match(objects.get('blog/kept.mdx')!.body.toString(), /Old body/)
  assert.equal(objects.has('blog/later.mdx'), false)
  const after = new Database(path.join(libRoot, 'data', 'content.db'), { readonly: true })
  assert.equal((after.prepare("SELECT body FROM collection_items WHERE slug = 'kept'").get() as { body: string }).body, 'Old body')
  assert.equal(after.prepare("SELECT 1 FROM collection_items WHERE slug = 'later'").get(), undefined)
  assert.deepEqual(after.prepare('SELECT key FROM r2_pending').all(), [])
  after.close()
})

test('R2 retention keeps the newest 30 snapshots plus latest.tgz', async () => {
  objects.clear()
  const base = Date.now() - 1_000_000
  for (let i = 0; i < 33; i++) put(`backups/snapshot-20200101-0000${String(i).padStart(2, '0')}.tgz`, 'old', base + i * 1000)
  put('backups/manual-upload.tgz', 'keep', base - 10_000)
  const snap = await backup.createSnapshot()
  const keys = [...objects.keys()].filter((k) => k.startsWith('backups/'))
  const snapshots = keys.filter((k) => backup.SNAPSHOT_FILE_RE.test(k.slice('backups/'.length)))
  assert.equal(snapshots.length, backup.R2_KEEP)
  assert.ok(keys.includes('backups/latest.tgz'))
  assert.ok(keys.includes('backups/manual-upload.tgz'))
  assert.ok(keys.includes(`backups/${snap.filename}`))
  assert.equal(keys.includes('backups/snapshot-20200101-000000.tgz'), false)
  assert.equal(snap.pruned.r2.length, 4)
})
