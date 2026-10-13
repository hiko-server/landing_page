/**
 * Authoring APIs (E1–E3) through the real route handlers against a
 * throw-away SQLite store in a temp working directory (R2 disabled):
 *
 *   - admin item GET carries the version ETag; PUT honours If-Match
 *     (409 VERSION_CONFLICT with the current ETag), a missing If-Match keeps
 *     last-write-wins, `create` on an existing slug is 409 SLUG_EXISTS
 *   - a body that does not compile is 422 MDX_INVALID and nothing is stored
 *   - snapshots are listed per slug (slugs with '_'), restorable, and a
 *     deleted item shows up in "recently deleted" and comes back (undo)
 *   - /api/admin/page has the same version contract; /api/admin/preview
 *     returns the rendered tree or the error position
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CF_API_TOKEN', 'CF_ZONE_ID', 'INDEXNOW_KEY']) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'r4-authoring-ifmatch-secret'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-authoring-'))
type Handler = (req: any, res: any) => unknown
let posts: Handler, page: Handler, versions: Handler, preview: Handler
let closeDb: () => void
let closeAuthDb: () => void
// A token bound to a fresh session row: signed in just now, so deletes pass the recent-verification check.
let sessionId = ''

const adminToken = () =>
  jwt.sign({ role: 'admin', email: 'owner@example.test', sid: sessionId }, 'r4-authoring-ifmatch-secret', { algorithm: 'HS256' })

type MockRes = { statusCode: number; headers: Record<string, string>; body: any; revalidated: string[] }

let ip = 0
async function call(
  handler: Handler,
  opts: { method?: string; query?: Record<string, any>; body?: any; headers?: Record<string, string>; url?: string } = {},
): Promise<MockRes> {
  const token = adminToken()
  // A fresh client address per call keeps the per-IP write limits out of the way.
  ip++
  const req = {
    method: opts.method || 'GET',
    url: opts.url || '/api/test',
    query: opts.query || {},
    body: opts.body,
    cookies: { cv_admin_token: token },
    headers: { ...(opts.headers || {}), cookie: `cv_admin_token=${token}` },
    socket: { remoteAddress: `127.0.0.${(ip % 250) + 1}` },
  }
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined, revalidated: [] }
  let ended = false
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(code: number) {
      out.statusCode = code
    },
    get headersSent() {
      return ended
    },
    get writableEnded() {
      return ended
    },
    status(code: number) {
      out.statusCode = code
      return res
    },
    setHeader(name: string, value: any) {
      out.headers[name.toLowerCase()] = String(value)
      return res
    },
    getHeader(name: string) {
      return out.headers[name.toLowerCase()]
    },
    json(body: any) {
      out.body = JSON.parse(JSON.stringify(body))
      ended = true
      return res
    },
    send(body: any) {
      out.body = body
      ended = true
      return res
    },
    end(payload?: string) {
      if (typeof payload === 'string' && /json/.test(out.headers['content-type'] || '')) out.body = JSON.parse(payload)
      ended = true
      return res
    },
    async revalidate(p: string) {
      out.revalidated.push(p)
    },
  }
  await handler(req, res)
  return out
}

const post = (title: string, body = 'Hello **world**.') => ({ slug: 'my_post', frontmatter: { title, date: '2026-10-01' }, body })

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  posts = (await import('../pages/api/admin/posts')).default
  page = (await import('../pages/api/admin/page')).default
  versions = (await import('../pages/api/versions')).default
  preview = (await import('../pages/api/admin/preview')).default
  closeDb = (await import('../lib/db')).closeDb
  closeAuthDb = (await import('../lib/adminAuth/db')).closeAuthDb
  const { createSession } = await import('../lib/adminAuth/sessions')
  sessionId = createSession({ method: 'password', ttlMs: 3_600_000, device: null, ipPrefix: null, country: null }).id
})

after(() => {
  closeDb()
  closeAuthDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('create, then GET returns the item with its version as ETag', async () => {
  const created = await call(posts, { method: 'PUT', body: { ...post('First'), create: true } })
  assert.equal(created.statusCode, 200)
  assert.match(created.body.etag, /^"\d+"$/)
  assert.equal(created.headers.etag, created.body.etag)
  assert.deepEqual(created.revalidated.slice(0, 2), ['/blog', '/blog/my_post'])

  const got = await call(posts, { query: { slug: 'my_post' } })
  assert.equal(got.statusCode, 200)
  assert.equal(got.headers.etag, created.body.etag)
  assert.equal(got.headers['cache-control'], 'no-store')
  assert.equal(got.body.frontmatter.title, 'First')
  assert.equal(`"${got.body.updatedAt}"`, got.headers.etag)
})

test('create on an existing slug is 409 SLUG_EXISTS', async () => {
  const dup = await call(posts, { method: 'PUT', body: { ...post('Dup'), create: true } })
  assert.equal(dup.statusCode, 409)
  assert.equal(dup.body.code, 'SLUG_EXISTS')
})

test('a stale If-Match is 409 VERSION_CONFLICT with the current ETag; nothing is written', async () => {
  const current = (await call(posts, { query: { slug: 'my_post' } })).headers.etag
  const stale = await call(posts, { method: 'PUT', body: post('Stale edit'), headers: { 'if-match': '"1"' } })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.body.code, 'VERSION_CONFLICT')
  assert.equal(stale.body.etag, current)
  assert.equal(stale.headers.etag, current)
  assert.equal((await call(posts, { query: { slug: 'my_post' } })).body.frontmatter.title, 'First')
})

test('a matching If-Match writes and returns the next version', async () => {
  const current = (await call(posts, { query: { slug: 'my_post' } })).headers.etag
  await new Promise((r) => setTimeout(r, 5))
  const ok = await call(posts, { method: 'PUT', body: post('Second'), headers: { 'if-match': current } })
  assert.equal(ok.statusCode, 200)
  assert.notEqual(ok.body.etag, current)
  assert.equal((await call(posts, { query: { slug: 'my_post' } })).headers.etag, ok.body.etag)
})

test('a missing If-Match keeps the legacy last-write-wins behaviour', async () => {
  await new Promise((r) => setTimeout(r, 5))
  const legacy = await call(posts, { method: 'PUT', body: post('Third') })
  assert.equal(legacy.statusCode, 200)
  assert.equal((await call(posts, { query: { slug: 'my_post' } })).body.frontmatter.title, 'Third')
})

test('a body that does not compile is 422 MDX_INVALID with its position, and is not stored', async () => {
  const bad = await call(posts, { method: 'PUT', body: post('Broken', '# Title\n\n<Callout>\nnever closed') })
  assert.equal(bad.statusCode, 422)
  assert.equal(bad.body.code, 'MDX_INVALID')
  assert.equal(typeof bad.body.reason, 'string')
  assert.equal(typeof bad.body.line, 'number')
  assert.equal((await call(posts, { query: { slug: 'my_post' } })).body.frontmatter.title, 'Third')
})

test('history: snapshots of a slug with "_" are listed, previewed and restorable', async () => {
  const list = await call(versions, { query: { type: 'blog', slug: 'my_post' } })
  assert.equal(list.statusCode, 200)
  assert.equal(list.body.versions.length, 2, 'one snapshot per overwrite (Second, Third)')
  assert.ok(list.body.versions.every((v: any) => v.filename.startsWith('my_post_')))
  const oldest = list.body.versions[list.body.versions.length - 1].filename
  const prev = await call(versions, { query: { type: 'blog', slug: 'my_post', file: oldest, preview: '1' } })
  assert.equal(prev.statusCode, 200)
  assert.equal(prev.body.data.frontmatter.title, 'First')

  const wrongSlug = await call(versions, { query: { type: 'blog', slug: 'other', file: oldest, preview: '1' } })
  assert.equal(wrongSlug.statusCode, 400, 'a snapshot is only served for its own slug')

  const restored = await call(versions, { method: 'POST', query: { type: 'blog' }, body: { action: 'restore', slug: 'my_post', filename: oldest } })
  assert.equal(restored.statusCode, 200)
  assert.match(restored.body.etag, /^"\d+"$/)
  assert.ok(restored.revalidated.includes('/blog/my_post'))
  assert.equal((await call(posts, { query: { slug: 'my_post' } })).body.frontmatter.title, 'First')
})

test('delete → recently deleted → undo restores the item', async () => {
  const del = await call(posts, { method: 'DELETE', query: { slug: 'my_post' } })
  assert.equal(del.statusCode, 200)
  assert.match(del.body.snapshot, /^my_post_\d{4}-/)
  assert.equal((await call(posts, { query: { slug: 'my_post' } })).statusCode, 404)

  const gone = await call(versions, { query: { type: 'blog', deleted: '1' } })
  assert.equal(gone.statusCode, 200)
  assert.deepEqual(
    gone.body.deleted.map((d: any) => [d.slug, d.filename, d.title]),
    [['my_post', del.body.snapshot, 'First']],
  )

  const undo = await call(versions, { method: 'POST', query: { type: 'blog' }, body: { action: 'restore', slug: 'my_post', filename: del.body.snapshot } })
  assert.equal(undo.statusCode, 200)
  assert.equal((await call(posts, { query: { slug: 'my_post' } })).body.frontmatter.title, 'First')
  assert.deepEqual((await call(versions, { query: { type: 'blog', deleted: '1' } })).body.deleted, [])
})

test('versions rejects unknown types, bad slugs and foreign snapshot names', async () => {
  assert.equal((await call(versions, { query: { type: 'nope' } })).statusCode, 400)
  assert.equal((await call(versions, { query: { type: 'blog', slug: '../x' } })).statusCode, 400)
  const bad = await call(versions, { method: 'POST', query: { type: 'blog' }, body: { action: 'restore', slug: 'my_post', filename: '../../etc/passwd' } })
  assert.equal(bad.statusCode, 400)
})

test('/api/admin/page: ETag on GET, If-Match on PUT, empty body allowed', async () => {
  const first = await call(page, { query: { name: 'now' } })
  assert.equal(first.statusCode, 200)
  assert.equal(first.headers.etag, '"0"', 'never stored yet')
  const created = await call(page, { method: 'PUT', body: { name: 'now', frontmatter: { title: 'Now' }, body: '## Focus\n\nShipping.' }, headers: { 'if-match': '"0"' } })
  assert.equal(created.statusCode, 200)
  const conflict = await call(page, { method: 'PUT', body: { name: 'now', frontmatter: { title: 'Now' }, body: 'x' }, headers: { 'if-match': '"0"' } })
  assert.equal(conflict.statusCode, 409)
  assert.equal(conflict.body.code, 'VERSION_CONFLICT')
  await new Promise((r) => setTimeout(r, 5))
  const cleared = await call(page, { method: 'PUT', body: { name: 'now', frontmatter: { title: 'Now' }, body: '' }, headers: { 'if-match': created.body.etag } })
  assert.equal(cleared.statusCode, 200)
  assert.deepEqual(cleared.revalidated, ['/now'])
  const hist = await call(versions, { query: { type: 'page', name: 'now' } })
  assert.equal(hist.body.versions.length, 1)
})

test('/api/admin/preview compiles a draft body or reports where it fails', async () => {
  const ok = await call(preview, { method: 'POST', url: '/api/admin/preview', body: { body: '## One\n\n## Two\n\ntext' } })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body.tree.type, 'root')
  assert.deepEqual(
    ok.body.toc.map((t: any) => t.text),
    ['One', 'Two'],
  )
  const bad = await call(preview, { method: 'POST', url: '/api/admin/preview', body: { body: 'ok\n\n<Box>\nunclosed' } })
  assert.equal(bad.statusCode, 422)
  assert.equal(bad.body.code, 'MDX_INVALID')
  assert.equal((await call(preview, { method: 'GET', url: '/api/admin/preview' })).statusCode, 405)
})
