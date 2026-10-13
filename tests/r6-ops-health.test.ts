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

const DETAIL_KEYS = ['backup', 'content', 'db', 'r2', 'r2Pending', 'status', 'uptime', 'warnings']

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
