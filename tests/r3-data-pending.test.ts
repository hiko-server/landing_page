/**
 * contentStore records the R2 keys it failed to upload/delete in r2_pending
 * (so the boot sync repairs them instead of trusting timestamps) and clears
 * them once a later upload/delete of the same key succeeds. Runs against an
 * in-process S3-compatible stub and a throw-away project root.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const objects = new Map<string, Buffer>()
let refuseWrites = false

const server = http.createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const url = new URL(req.url || '/', 'http://x')
    const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/'))
    if ((req.method === 'PUT' || req.method === 'DELETE') && refuseWrites) {
      res.statusCode = 403
      res.setHeader('content-type', 'application/xml')
      return res.end('<?xml version="1.0"?><Error><Code>AccessDenied</Code><Message>denied</Message></Error>')
    }
    if (req.method === 'PUT') {
      objects.set(key, Buffer.concat(chunks))
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

// lib/r2.ts reads its env at import time; lib/db.ts resolves data/ from the cwd.
const repoRoot = process.cwd()
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-pending-'))
fs.mkdirSync(path.join(root, 'data'), { recursive: true })
Object.assign(process.env, {
  R2_ENDPOINT: `http://127.0.0.1:${port}`,
  R2_BUCKET: 'test-bucket',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
})
process.chdir(root)
const db = await import('../lib/db')
const store = await import('../lib/contentStore')

after(() => {
  server.close()
  db.closeDb()
  process.chdir(repoRoot)
  fs.rmSync(root, { recursive: true, force: true })
})

const pending = () =>
  db.getDb().prepare('SELECT key, op, updated_at FROM r2_pending ORDER BY key').all() as Array<{
    key: string
    op: string
    updated_at: number
  }>

test('a kv save that never reaches R2 is recorded, and the next successful save clears it', async () => {
  refuseWrites = true
  const failed = await store.putKv('home', { hero: { brand: 'Two' } })
  assert.equal(failed.ok, true)
  assert.match((failed as { r2Warning?: string }).r2Warning || '', /R2 sync failed/)
  assert.deepEqual(
    pending().map(({ key, op }) => ({ key, op })),
    [{ key: 'data/home.json', op: 'put' }],
  )

  refuseWrites = false
  const ok = await store.putKv('home', { hero: { brand: 'Three' } })
  assert.deepEqual(ok, { ok: true, updatedAt: (ok as { updatedAt: number }).updatedAt })
  assert.deepEqual(pending(), [])
  assert.match(objects.get('data/home.json')!.toString(), /Three/)
})

test('a failed item delete is recorded as a pending delete; re-creating the item clears it', async () => {
  refuseWrites = false
  assert.deepEqual(await store.putItem('blog', 'post', { title: 'Post' }, 'Body'), { ok: true })
  assert.ok(objects.has('blog/post.mdx'))

  refuseWrites = true
  const removed = await store.removeItem('blog', 'post')
  assert.match((removed as { r2Warning?: string }).r2Warning || '', /R2 delete failed/)
  assert.deepEqual(
    pending().map(({ key, op }) => ({ key, op })),
    [{ key: 'blog/post.mdx', op: 'delete' }],
  )

  // Re-created while R2 is still down: now an upload is owed instead.
  const again = await store.putItem('blog', 'post', { title: 'Post 2' }, 'Body 2')
  assert.match((again as { r2Warning?: string }).r2Warning || '', /R2 sync failed/)
  assert.deepEqual(
    pending().map(({ key, op }) => ({ key, op })),
    [{ key: 'blog/post.mdx', op: 'put' }],
  )

  refuseWrites = false
  assert.deepEqual(await store.putPage('now', { title: 'Now' }, 'Now body'), { ok: true })
  // A different key succeeding leaves the item's entry alone.
  assert.deepEqual(
    pending().map(({ key }) => key),
    ['blog/post.mdx'],
  )
  assert.deepEqual(await store.putItem('blog', 'post', { title: 'Post 3' }, 'Body 3'), { ok: true })
  assert.deepEqual(pending(), [])
})

test('a success only clears failures recorded before it started; marks only move forward', () => {
  store.markR2Pending('pages/uses.mdx', 'put', 1_000)
  store.markR2Pending('pages/uses.mdx', 'put', 1_000)
  assert.equal(pending()[0].updated_at, 1_001)

  // An upload that started before the newest failure must not hide it.
  store.clearR2Pending('pages/uses.mdx', 1_000)
  assert.equal(pending().length, 1)
  store.clearR2Pending('pages/uses.mdx', 1_001)
  assert.deepEqual(pending(), [])
})
