/**
 * H7 — the media library and R2, against an in-process S3-compatible server:
 *
 *   - the boot sync (scripts/sync-from-r2.mjs, run as a child process from a
 *     throwaway project root) never pulls a trashed upload back and removes
 *     R2's copies of it, and repairs pending uploads/ keys (push the file
 *     that is there, delete the one that is not) instead of dropping them;
 *   - lib/media/r2sync: listing R2 into the index (an upload only R2 holds
 *     is listed, its size read from a ranged GET), mirroring what R2 lacks
 *     and pulling an R2-only upload to the server.
 *
 * Synthetic images only.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import Database from 'better-sqlite3'
import sharp from 'sharp'

type Obj = { body: Buffer; at: number }
const objects = new Map<string, Obj>()
const failWrites = new Set<string>()
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
      const prefix = url.searchParams.get('prefix') || ''
      const items = [...objects.entries()].filter(([k]) => k.startsWith(prefix))
      res.setHeader('content-type', 'application/xml')
      return res.end(
        '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>test-bucket</Name>' +
          `<KeyCount>${items.length}</KeyCount><IsTruncated>false</IsTruncated>` +
          items
            .map(([k, o]) => `<Contents><Key>${xml(k)}</Key><LastModified>${new Date(o.at).toISOString()}</LastModified><Size>${o.body.length}</Size></Contents>`)
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
      const o = objects.get(key)
      if (!o) {
        res.statusCode = 404
        res.setHeader('content-type', 'application/xml')
        return res.end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>')
      }
      const range = /^bytes=0-(\d+)$/.exec(String(req.headers.range || ''))
      if (range) {
        res.statusCode = 206
        return res.end(o.body.subarray(0, Number(range[1]) + 1))
      }
      return res.end(o.body)
    }
    if (req.method === 'PUT') {
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
const R2_ENV = { R2_ENDPOINT: `http://127.0.0.1:${port}`, R2_BUCKET: 'test-bucket', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test' }

const repoRoot = process.cwd()
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-sync-'))
fs.mkdirSync(path.join(root, 'scripts'))
for (const f of ['sync-from-r2.mjs', 'content-helpers.mjs']) fs.copyFileSync(path.join(repoRoot, 'scripts', f), path.join(root, 'scripts', f))
fs.cpSync(path.join(repoRoot, 'scripts', 'db'), path.join(root, 'scripts', 'db'), { recursive: true })
fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir')
fs.mkdirSync(path.join(root, 'data'), { recursive: true })
fs.mkdirSync(path.join(root, 'public', 'uploads'), { recursive: true })

// lib/r2 reads its env at import time; lib/db resolves data/ from the cwd.
const libRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'media-r2-'))
for (const k of ['CF_API_TOKEN', 'CF_ZONE_ID', 'INDEXNOW_KEY']) delete process.env[k]
Object.assign(process.env, R2_ENV, { LOG_LEVEL: 'error' })
process.chdir(libRoot)
fs.mkdirSync(path.join(libRoot, 'data'), { recursive: true })
fs.mkdirSync(path.join(libRoot, 'public', 'uploads'), { recursive: true })
const { closeDb } = await import('../lib/db')
const r2sync = await import('../lib/media/r2sync')
const list = await import('../lib/media/list')

after(() => {
  server.close()
  closeDb()
  process.chdir(repoRoot)
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(libRoot, { recursive: true, force: true })
})

function runSync(): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'sync-from-r2.mjs')], { cwd: root, env: { ...process.env, ...R2_ENV, R2_REQUIRED: '' } })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (code) => resolve({ code: code ?? -1, out }))
  })
}

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#3366aa' } }).png().toBuffer()

test('H7 boot sync: a trashed upload is never pulled back and its R2 copies go; pending upload keys are repaired', async () => {
  const img = await png(64, 48)
  const now = Date.now()
  objects.set('uploads/keep.png', { body: img, at: now })
  objects.set('uploads/keep.png.w32.webp', { body: Buffer.from('RIFFxxxxWEBP'), at: now })
  objects.set('uploads/gone.png', { body: img, at: now })
  objects.set('uploads/gone.png.w320.webp', { body: Buffer.from('RIFFxxxxWEBP'), at: now })
  objects.set('uploads/stale-delete.png', { body: img, at: now })

  // The app's store: migrated by the script itself on open; seed the media rows first.
  const dbPath = path.join(root, 'data', 'content.db')
  const helpers = await import(path.join(root, 'scripts', 'content-helpers.mjs'))
  const db0 = helpers.openContentDb(dbPath) as Database.Database
  db0.prepare("INSERT INTO media_trash (name, files, deleted_at) VALUES ('gone.png', '[\"gone.png\"]', ?)").run(now)
  db0.prepare("INSERT INTO r2_pending (key, op, updated_at) VALUES ('uploads/stale-delete.png', 'delete', ?)").run(now)
  db0.prepare("INSERT INTO r2_pending (key, op, updated_at) VALUES ('uploads/local-only.png', 'put', ?)").run(now)
  db0.close()
  fs.writeFileSync(path.join(root, 'public', 'uploads', 'local-only.png'), img)

  const { code, out } = await runSync()
  assert.equal(code, 0, out)
  const local = fs.readdirSync(path.join(root, 'public', 'uploads')).sort()
  assert.deepEqual(local, ['keep.png', 'keep.png.w32.webp', 'local-only.png'], out)
  assert.ok(!objects.has('uploads/gone.png') && !objects.has('uploads/gone.png.w320.webp'), 'R2 copies of a trashed upload are deleted')
  assert.ok(!objects.has('uploads/stale-delete.png'), 'a pending delete is carried out')
  assert.ok(objects.has('uploads/local-only.png'), 'a pending upload is pushed')
  const db = new Database(dbPath)
  try {
    assert.deepEqual(db.prepare('SELECT key FROM r2_pending').all(), [], 'pending upload keys are cleared once repaired')
  } finally {
    db.close()
  }
})

test('H7 R2 index: listing records what R2 holds, an R2-only upload is listed with its size; mirror and pull repair', async () => {
  objects.clear()
  const uploads = path.join(libRoot, 'public', 'uploads')
  const local = await png(300, 200)
  fs.writeFileSync(path.join(uploads, 'here.png'), local)
  const remote = await png(120, 90)
  objects.set('uploads/remote.png', { body: remote, at: Date.UTC(2026, 9, 1) })
  objects.set('uploads/remote.png.w32.webp', { body: Buffer.from('RIFF\0\0\0\0WEBPVP8 '), at: Date.UTC(2026, 9, 1) })

  const scan = await r2sync.scanR2()
  assert.ok(scan.ok)
  assert.equal(scan.onlyInR2, 1)
  assert.equal(scan.notMirrored, 1)
  let lib = list.listLibrary()
  assert.ok(lib.r2.configured && lib.r2.checkedAt)
  const here = lib.items.find((i) => i.name === 'here.png')
  const only = lib.items.find((i) => i.name === 'remote.png')
  assert.equal(here?.r2, false)
  assert.equal(here?.r2Missing, 1)
  assert.equal(only?.local, false)
  assert.equal(only?.r2, true)
  assert.equal(only?.width, 120, 'read from the first bytes of the object')
  assert.equal(only?.height, 90)
  assert.equal(only?.addedAt, Date.UTC(2026, 9, 1))

  const mirrored = await r2sync.mirrorToR2(['here.png'])
  assert.deepEqual(mirrored, { done: ['here.png'], failed: [] })
  assert.ok(objects.has('uploads/here.png'))
  const pulled = await r2sync.pullFromR2(['remote.png', 'here.png'])
  assert.deepEqual(pulled.done, ['remote.png'])
  assert.equal(pulled.failed[0].name, 'here.png')
  assert.ok(fs.existsSync(path.join(uploads, 'remote.png')) && fs.existsSync(path.join(uploads, 'remote.png.w32.webp')))
  lib = list.listLibrary()
  assert.equal(lib.items.find((i) => i.name === 'remote.png')?.local, true)
  assert.equal(lib.items.find((i) => i.name === 'here.png')?.r2, true)

  // Something that is not an image under an image's name is never written.
  objects.set('uploads/fake.png', { body: Buffer.from('<html>nope</html>'), at: Date.now() })
  await r2sync.scanR2()
  const fake = await r2sync.pullFromR2(['fake.png'])
  assert.equal(fake.failed[0].error, 'R2 holds something that is not an image under this name')
  assert.ok(!fs.existsSync(path.join(uploads, 'fake.png')))
})
