/**
 * Intrinsic image sizes for zero-CLS article images (C2): uploads (disk,
 * then R2), remote headers through a ranged request, the LRU, and the
 * timeout fallback.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createImageSizeResolver, uploadNameOf, REMOTE_HEAD_BYTES, type RemoteFetcher } from '../lib/rehype/imageSize'

function png(width: number, height: number, total = 64): Uint8Array {
  const b = new Uint8Array(total)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const dv = new DataView(b.buffer)
  dv.setUint32(16, width)
  dv.setUint32(20, height)
  return b
}

test('remote images are sized from a ranged request (only image/*, cached)', async () => {
  const calls: { url: string; range: string; maxBytes: number }[] = []
  const fetchRemote: RemoteFetcher = async (url, init) => {
    calls.push({ url, range: init.headers.Range, maxBytes: init.maxBytes })
    return { status: 206, headers: { 'content-type': 'image/png' }, body: png(1200, 800) }
  }
  const resolve = createImageSizeResolver({ fetchRemote, readUpload: () => null, readR2: async () => null })
  assert.deepEqual(await resolve('https://cdn.example/a.png'), { width: 1200, height: 800 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].range, `bytes=0-${REMOTE_HEAD_BYTES - 1}`)
  assert.ok(calls[0].maxBytes <= 128 * 1024)
  // Cached: no second request.
  assert.deepEqual(await resolve('https://cdn.example/a.png'), { width: 1200, height: 800 })
  assert.equal(calls.length, 1)
})

test('non-image responses, plain http and odd schemes resolve to null', async () => {
  const html: RemoteFetcher = async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: png(10, 10) })
  const resolve = createImageSizeResolver({ fetchRemote: html, readUpload: () => null, readR2: async () => null })
  assert.equal(await resolve('https://cdn.example/page'), null)
  assert.equal(await resolve('http://cdn.example/a.png'), null)
  assert.equal(await resolve('data:image/png;base64,AAAA'), null)
  assert.equal(await resolve('//cdn.example/a.png'), null)
})

test('a hung remote request falls back to null after the timeout', async () => {
  const never: RemoteFetcher = () => new Promise(() => undefined)
  const resolve = createImageSizeResolver({ fetchRemote: never, readUpload: () => null, readR2: async () => null, timeoutMs: 30 })
  const started = Date.now()
  assert.equal(await resolve('https://slow.example/a.jpg'), null)
  assert.ok(Date.now() - started < 1000)
})

test('a failed lookup is retried once the failure TTL has passed', async () => {
  let now = 0
  let calls = 0
  const flaky: RemoteFetcher = async () => {
    calls++
    if (calls === 1) throw new Error('boom')
    return { status: 200, headers: { 'content-type': 'image/png' }, body: png(5, 6) }
  }
  const resolve = createImageSizeResolver({ fetchRemote: flaky, readUpload: () => null, readR2: async () => null, now: () => now })
  assert.equal(await resolve('https://x.example/a.png'), null)
  assert.equal(await resolve('https://x.example/a.png'), null)
  assert.equal(calls, 1, 'failure remembered')
  now += 11 * 60 * 1000
  assert.deepEqual(await resolve('https://x.example/a.png'), { width: 5, height: 6 })
})

test('uploads: disk first, then the R2 copy; invalid names never touch storage', async () => {
  const seen: string[] = []
  const resolve = createImageSizeResolver({
    fetchRemote: async () => {
      throw new Error('no network for uploads')
    },
    readUpload: (name) => (seen.push(`disk:${name}`), name === 'local.png' ? { width: 10, height: 20 } : null),
    readR2: async (name) => (seen.push(`r2:${name}`), png(300, 200)),
  })
  assert.deepEqual(await resolve('/uploads/local.png'), { width: 10, height: 20 })
  assert.deepEqual(await resolve('/uploads/remote-only.png'), { width: 300, height: 200 })
  assert.equal(await resolve('/uploads/..%2Fetc%2Fpasswd'), null)
  assert.deepEqual(seen, ['disk:local.png', 'disk:remote-only.png', 'r2:remote-only.png'])
  assert.equal(uploadNameOf('/uploads/a.png?x=1'), 'a.png')
  assert.equal(uploadNameOf('/uploads/../a.png'), null)
  assert.equal(uploadNameOf('/images/a.png'), null)
})

test('the LRU stays bounded', async () => {
  const ok: RemoteFetcher = async () => ({ status: 200, headers: { 'content-type': 'image/png' }, body: png(1, 1) })
  let calls = 0
  const counting: RemoteFetcher = async (u, i) => (calls++, ok(u, i))
  const resolve = createImageSizeResolver({ fetchRemote: counting, readUpload: () => null, readR2: async () => null, cacheSize: 2 })
  await resolve('https://a.example/1.png')
  await resolve('https://a.example/2.png')
  await resolve('https://a.example/3.png')
  await resolve('https://a.example/1.png')
  assert.equal(calls, 4, 'the oldest entry was evicted')
})
