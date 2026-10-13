/**
 * FIX-30: /api/health tells the public only the verdict; the operational
 * detail needs an admin session or `Authorization: Bearer <HEALTH_TOKEN>`.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { bearerMatches, bearerTokenOf } from '../lib/security/bearer'

const SECRET = 'r6-ops-health-jwt-secret-0123456789'
const TOKEN = 'health-token-0123456789abcdef0123456789abcdef'
const repoRoot = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r6-health-'))

type Handler = (req: any, res: any) => unknown
let health: Handler
let putKv: typeof import('../lib/contentStore').putKv
let closeDb: () => void

async function call(headers: Record<string, string> = {}) {
  const out = { status: 200, headers: {} as Record<string, string>, raw: '' }
  const res: any = {
    get statusCode() {
      return out.status
    },
    status(c: number) {
      out.status = c
      return res
    },
    setHeader(n: string, v: unknown) {
      out.headers[n.toLowerCase()] = String(v)
      return res
    },
    getHeader: (n: string) => out.headers[n.toLowerCase()],
    json(b: unknown) {
      out.raw = JSON.stringify(b)
      return res
    },
    end(payload?: string) {
      if (typeof payload === 'string') out.raw = payload
      return res
    },
  }
  const cookie = headers.cookie
  await health({ method: 'GET', query: {}, headers, cookies: cookie ? Object.fromEntries([cookie.split('=')]) : {}, socket: { remoteAddress: '127.0.0.1' } }, res)
  return { ...out, body: JSON.parse(out.raw || 'null') }
}

const DETAIL_KEYS = ['backup', 'content', 'db', 'openErrors', 'r2', 'r2Pending', 'restoreDrill', 'status', 'uptime', 'warnings']

before(async () => {
  for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'HEALTH_TOKEN']) delete process.env[k]
  process.env.JWT_SECRET = SECRET
  process.env.LOG_LEVEL = 'error'
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  process.chdir(tmp)
  health = (await import('../pages/api/health')).default as Handler
  putKv = (await import('../lib/contentStore')).putKv
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  delete process.env.HEALTH_TOKEN
  process.chdir(repoRoot)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('bearer tokens are parsed strictly and compared only against a configured token', () => {
  assert.equal(bearerTokenOf('Bearer abc'), 'abc')
  assert.equal(bearerTokenOf('bearer  abc '), 'abc')
  assert.equal(bearerTokenOf(['Bearer x', 'Bearer y']), 'x')
  for (const bad of [undefined, '', 'Basic abc', 'Bearer', 'Bearer a b', 'Bearerabc']) assert.equal(bearerTokenOf(bad), null, String(bad))
  assert.equal(bearerMatches(`Bearer ${TOKEN}`, TOKEN), true)
  assert.equal(bearerMatches(`Bearer ${TOKEN}x`, TOKEN), false)
  assert.equal(bearerMatches(`Bearer ${TOKEN.slice(1)}`, TOKEN), false)
  assert.equal(bearerMatches('Bearer anything', undefined), false)
  assert.equal(bearerMatches('Bearer anything', '   '), false)
})

test('everyone gets exactly {"status":…}: "empty" before content, then "ok" (the string deploy.sh greps)', async () => {
  const empty = await call()
  assert.equal(empty.status, 200)
  assert.equal(empty.raw, '{"status":"empty"}')
  assert.equal(empty.headers['cache-control'], 'no-store, max-age=0')

  await putKv('home', { hero: { name: 'x' } })
  const ok = await call()
  assert.equal(ok.status, 200)
  assert.equal(ok.raw, '{"status":"ok"}')
  assert.ok(ok.raw.includes('"status":"ok"'))
})

test('a wrong, malformed or unconfigured token and a forged cookie get the public answer only', async () => {
  assert.deepEqual(Object.keys((await call({ authorization: `Bearer ${TOKEN}` })).body), ['status'], 'HEALTH_TOKEN unset: no token grants the detail')
  process.env.HEALTH_TOKEN = TOKEN
  try {
    for (const authorization of [`Bearer ${TOKEN.slice(0, -1)}`, `Basic ${TOKEN}`, TOKEN]) {
      assert.deepEqual(Object.keys((await call({ authorization })).body), ['status'], authorization)
    }
    const forged = jwt.sign({ role: 'admin' }, 'some-other-secret', { algorithm: 'HS256' })
    assert.deepEqual(Object.keys((await call({ cookie: `cv_admin_token=${forged}` })).body), ['status'])
  } finally {
    delete process.env.HEALTH_TOKEN
  }
})

test('SEC-1: a malformed (undecodable) session or hint cookie gets the public answer, never a 500', async () => {
  for (const cookie of ['cv_admin_token=%E0%A4%A', 'cv_admin_token=%', 'cv_admin_hint=%E0%A4%A']) {
    const r = await call({ cookie })
    assert.equal(r.status, 200, cookie)
    assert.deepEqual(Object.keys(r.body), ['status'], cookie)
  }
  // Even with a monitor token configured, the cookie only means "no session".
  process.env.HEALTH_TOKEN = TOKEN
  try {
    const r = await call({ cookie: 'cv_admin_token=%E0%A4%A' })
    assert.equal(r.status, 200)
    assert.deepEqual(Object.keys(r.body), ['status'])
  } finally {
    delete process.env.HEALTH_TOKEN
  }
})

test('SEC-1: lib/auth reads an undecodable cookie as absent, from the parsed cookies or the raw header', async () => {
  const { readAdminClaims, isAdminRequest, hasAdminHint, readCookie } = await import('../lib/auth')
  const res = { getHeader: () => undefined, setHeader: () => undefined } as any
  const parsed = { headers: {}, cookies: { cv_admin_token: '%E0%A4%A', cv_admin_hint: '%E0%A4%A' } } as any
  const header = { headers: { cookie: 'cv_admin_token=%E0%A4%A; cv_admin_hint=%E0%A4%A' } } as any
  for (const req of [parsed, header]) {
    assert.doesNotThrow(() => readAdminClaims(req, res))
    assert.equal(readAdminClaims(req, res), null)
    assert.equal(isAdminRequest(req, res), false)
    assert.equal(hasAdminHint(req, res), false)
    assert.equal(readCookie(req, res, 'cv_admin_token'), undefined)
  }
  // A well-formed cookie still reads (and still verifies).
  const token = jwt.sign({ role: 'admin', email: 'owner@example.test' }, SECRET, { algorithm: 'HS256' })
  assert.equal(readCookie({ headers: {}, cookies: { cv_admin_hint: '1' } } as any, res, 'cv_admin_hint'), '1')
  assert.equal(isAdminRequest({ headers: {}, cookies: { cv_admin_token: token } } as any, res), true)
})

test('HEALTH_TOKEN bearer and an admin session get the full detail', async () => {
  process.env.HEALTH_TOKEN = TOKEN
  try {
    const viaToken = await call({ authorization: `Bearer ${TOKEN}` })
    assert.equal(viaToken.status, 200)
    assert.deepEqual(Object.keys(viaToken.body).sort(), DETAIL_KEYS)
    assert.equal(viaToken.body.status, 'ok')
    assert.equal(viaToken.body.db, true)
    assert.equal(viaToken.body.r2, false)
    assert.deepEqual(viaToken.body.content, { home: true, cvdata: false, pages: 0, items: 0, ready: false })
    assert.ok(Array.isArray(viaToken.body.warnings))
  } finally {
    delete process.env.HEALTH_TOKEN
  }
  const token = jwt.sign({ role: 'admin', email: 'owner@example.test' }, SECRET, { algorithm: 'HS256' })
  const viaAdmin = await call({ cookie: `cv_admin_token=${token}` })
  assert.deepEqual(Object.keys(viaAdmin.body).sort(), DETAIL_KEYS)
})

test('an unreachable store answers 503 {"status":"degraded"} publicly', async () => {
  closeDb()
  const dbFile = path.join(tmp, 'data', 'content.db')
  for (const f of fs.readdirSync(path.join(tmp, 'data'))) if (f.startsWith('content.db')) fs.rmSync(path.join(tmp, 'data', f), { force: true })
  // A directory where the database file should be makes opening it fail.
  fs.mkdirSync(dbFile)
  try {
    const down = await call()
    assert.equal(down.status, 503)
    assert.equal(down.raw, '{"status":"degraded"}')
  } finally {
    fs.rmSync(dbFile, { recursive: true, force: true })
  }
})
