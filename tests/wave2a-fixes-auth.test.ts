/**
 * Wave 2A review fixes in the admin sign-in state (data/auth.db):
 *
 *   SECU-2  failed attempts (anyone can cause them) are counted per hour,
 *           method and country in a table of their own, so they can never
 *           push a sign-in or a security change out of the history; the
 *           Security page lists the newest real events plus a summary.
 *
 * Runs the real API handlers in a throw-away working directory.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

const OWNER = 'owner@example.test'
const PASS = 'wave2a fixes passphrase 0123'
process.env.JWT_SECRET = 'wave2a-fixes-auth-secret-0123456789abcd'
process.env.ADMIN_EMAIL = OWNER
process.env.ADMIN_PASS = PASS
delete process.env.SITE_URL
delete process.env.NEXT_PUBLIC_SITE_HOST
delete process.env.TRUSTED_PROXY_IPS
delete process.env.TRUST_CLIENT_IP_HEADER
delete process.env.ADMIN_RECENT_AUTH_MINUTES

const HOST = 'localhost:3509'
const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w2f-auth-'))

type Handler = (req: any, res: any) => Promise<unknown> | unknown
const H: Record<string, Handler> = {}
let store: typeof import('../lib/adminAuth/store')
let overview: typeof import('../lib/adminAuth/overview')
let authDb: typeof import('../lib/adminAuth/db')
let format: typeof import('../components/Admin/security/securityFormat')

before(async () => {
  process.chdir(tmp)
  const load = async (name: string, p: string) => {
    H[name] = (await import(p)).default as Handler
  }
  await load('pkVerify', '../pages/api/auth/passkey/verify')
  await load('security', '../pages/api/admin/security/index')
  store = await import('../lib/adminAuth/store')
  overview = await import('../lib/adminAuth/overview')
  authDb = await import('../lib/adminAuth/db')
  format = await import('../components/Admin/security/securityFormat')
})
after(() => {
  authDb.closeAuthDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

type Out = { statusCode: number; headers: Record<string, string | string[]>; body: any }

async function call(
  handler: Handler,
  opts: { method: string; body?: unknown; cookie?: string; ip: string; country?: string }
): Promise<Out> {
  const req = {
    method: opts.method,
    url: '/api/test',
    query: {},
    body: opts.body,
    headers: {
      host: HOST,
      'cf-connecting-ip': opts.ip,
      'cf-ipcountry': opts.country || 'HK',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
  }
  const out: Out = { statusCode: 200, headers: {}, body: undefined }
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(v: number) {
      out.statusCode = v
    },
    get headersSent() {
      return false
    },
    status(code: number) {
      out.statusCode = code
      return res
    },
    setHeader(name: string, value: string | string[]) {
      out.headers[name.toLowerCase()] = value
      return res
    },
    getHeader: (name: string) => out.headers[name.toLowerCase()],
    json(b: unknown) {
      out.body = b
      return res
    },
    end() {
      return res
    },
    setDraftMode() {
      return res
    },
  }
  await handler(req, res)
  return out
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

const resetHistory = () =>
  authDb.getAuthDb().exec('DELETE FROM auth_events; DELETE FROM auth_failures')

// ── SECU-2 ────────────────────────────────────────────────────────────────

test('SECU-2: 520 junk passkey sign-ins from 52 addresses no longer erase a sign-in and a new passkey', async () => {
  resetHistory()
  const t = Date.now()
  store.recordAuthEvent(
    { type: 'signin', method: 'password', sessionId: 'S'.repeat(22), country: 'GB' },
    t - 2000
  )
  store.recordAuthEvent({ type: 'passkey-added', detail: 'MacBook', country: 'GB' }, t - 1000)

  const junk = { response: { id: 'x', rawId: 'x', type: 'public-key', response: {} } }
  const statuses: Record<number, number> = {}
  for (let a = 0; a < 52; a++) {
    for (let k = 0; k < 11; k++) {
      const out = await call(H.pkVerify, {
        method: 'POST',
        body: junk,
        ip: `198.51.${100 + Math.floor(a / 200)}.${(a % 200) + 1}`,
        country: a % 2 ? 'US' : 'NL',
      })
      statuses[out.statusCode] = (statuses[out.statusCode] || 0) + 1
    }
  }
  assert.deepEqual(statuses, { 401: 520, 429: 52 })

  const events = store.listAuthEvents(500)
  assert.deepEqual(
    events.map((e) => e.type),
    ['passkey-added', 'signin'],
    'the history keeps exactly the real events'
  )
  const rows = authDb.getAuthDb().prepare('SELECT count(*) AS n FROM auth_events').get() as {
    n: number
  }
  assert.equal(rows.n, 2, 'no failure row was written to auth_events')

  const failures = store.authFailureSummary()
  assert.equal(failures.last24h, 520)
  assert.equal(failures.last30d, 520)
  assert.deepEqual(failures.byMethod, [{ type: 'signin-failed', method: 'passkey', count: 520 }])
  assert.deepEqual(failures.byCountry.map((c) => [c.country, c.count]).sort(), [
    ['NL', 260],
    ['US', 260],
  ])
  assert.ok(failures.lastAt !== null && failures.lastAt >= t)
  // One bucket per hour, kind, method, country and reason: a handful of rows, not 520.
  const buckets = authDb.getAuthDb().prepare('SELECT count(*) AS n FROM auth_failures').get() as {
    n: number
  }
  assert.ok(buckets.n <= 4, `${buckets.n} buckets`)
})

test('SECU-2: the Security overview lists the newest real events and summarises the failures', () => {
  // The state from the previous test: 2 events, 520 failures.
  const view = overview.securityOverview(
    { headers: { host: HOST } } as any,
    { claims: { role: 'admin' }, session: null },
    Date.now()
  )
  assert.deepEqual(
    view.events.map((e) => e.type),
    ['passkey-added', 'signin']
  )
  assert.equal(view.failures.last24h, 520)
  assert.equal(view.failures.byMethod[0].method, 'passkey')
})

test('SECU-2: failure windows count by clock hour; buckets expire after 180 days and stay bounded', () => {
  resetHistory()
  const now = Date.UTC(2026, 9, 20, 12, 30)
  const fail = (at: number, over: Partial<import('../lib/adminAuth/store').AuthEventInput> = {}) =>
    store.recordAuthEvent({ type: 'signin-failed', method: 'password', country: 'HK', ...over }, at)
  fail(now - HOUR)
  fail(now - HOUR + 60_000, {
    detail: 'a reason code that is far longer than forty characters in all',
  })
  fail(now - 2 * DAY)
  fail(now - 10 * DAY, { type: 'step-up-failed', method: 'recovery', country: null })
  fail(now - 40 * DAY)
  const s = store.authFailureSummary(now)
  assert.deepEqual([s.last24h, s.last7d, s.last30d], [2, 3, 4])
  assert.equal(s.lastAt, now - HOUR + 60_000)
  assert.deepEqual(s.byMethod, [
    { type: 'signin-failed', method: 'password', count: 3 },
    { type: 'step-up-failed', method: 'recovery', count: 1 },
  ])
  assert.deepEqual(s.byCountry, [
    { country: 'HK', count: 3 },
    { country: null, count: 1 },
  ])
  const reasons = authDb
    .getAuthDb()
    .prepare(`SELECT reason FROM auth_failures WHERE reason != ''`)
    .all() as Array<{ reason: string }>
  assert.deepEqual(
    reasons.map((r) => r.reason.length),
    [40],
    'reason codes are clipped'
  )

  // 180 days later the old buckets are gone.
  fail(now + 181 * DAY)
  const left = authDb.getAuthDb().prepare('SELECT min(hour) AS h FROM auth_failures').get() as {
    h: number
  }
  assert.ok(left.h >= now + DAY, 'everything older than 180 days was pruned')

  // A spray over many countries and hours never grows the table past its bound.
  resetHistory()
  const codes = Array.from({ length: 26 * 26 }, (_, i) =>
    String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26))
  )
  let n = 0
  let lastAt = 0
  for (let h = 0; n < store.AUTH_FAILURE_ROWS + 300; h++) {
    for (const c of codes.slice(0, 100)) {
      lastAt = now - 20 * DAY + h * HOUR
      fail(lastAt, { country: c })
      n++
    }
  }
  const total = authDb.getAuthDb().prepare('SELECT count(*) AS n FROM auth_failures').get() as {
    n: number
  }
  assert.equal(total.n, store.AUTH_FAILURE_ROWS)
  const newest = authDb.getAuthDb().prepare('SELECT max(hour) AS h FROM auth_failures').get() as {
    h: number
  }
  assert.equal(newest.h, lastAt - (lastAt % HOUR), 'the newest buckets are the ones kept')
})

test('SECU-2: migration 2 moves the failures already in the history into the counts', async () => {
  const { runMigrations } = await import('../scripts/db/migrate.mjs')
  const { AUTH_MIGRATIONS } = await import('../scripts/db/auth/index.mjs')
  const file = path.join(tmp, 'v1-auth.db')
  const db = new Database(file)
  try {
    runMigrations(db, AUTH_MIGRATIONS.slice(0, 1), { label: 'auth' })
    const t = Date.UTC(2026, 9, 18, 9, 15)
    const insert = db.prepare(
      'INSERT INTO auth_events (at, type, method, country, detail) VALUES (?, ?, ?, ?, ?)'
    )
    insert.run(t, 'signin', 'password', 'HK', null)
    insert.run(t + 1000, 'signin-failed', 'passkey', 'US', 'challenge')
    insert.run(t + 2000, 'signin-failed', 'passkey', 'US', 'challenge')
    insert.run(t + 3000, 'signin-failed', 'password', null, null)
    insert.run(t + 4000, 'step-up-failed', 'password', 'HK', null)
    const report = runMigrations(db, AUTH_MIGRATIONS, { label: 'auth' })
    assert.deepEqual([report.from, report.to], [1, 2])
    const events = db.prepare('SELECT type FROM auth_events').all() as Array<{ type: string }>
    assert.deepEqual(
      events.map((e) => e.type),
      ['signin']
    )
    const buckets = db
      .prepare(
        'SELECT hour, type, method, country, reason, count, last_at FROM auth_failures ORDER BY type, method'
      )
      .all()
    const hour = t - (t % HOUR)
    assert.deepEqual(buckets, [
      {
        hour,
        type: 'signin-failed',
        method: 'passkey',
        country: 'US',
        reason: 'challenge',
        count: 2,
        last_at: t + 2000,
      },
      {
        hour,
        type: 'signin-failed',
        method: 'password',
        country: '',
        reason: '',
        count: 1,
        last_at: t + 3000,
      },
      {
        hour,
        type: 'step-up-failed',
        method: 'password',
        country: 'HK',
        reason: '',
        count: 1,
        last_at: t + 4000,
      },
    ])
  } finally {
    db.close()
  }
})

test('SECU-2: Security page labels for the failed-attempts summary', () => {
  assert.equal(format.failureKindLabel('signin-failed', 'passkey', 30), '30 passkey sign-ins')
  assert.equal(format.failureKindLabel('signin-failed', 'password', 1), '1 password sign-in')
  assert.equal(
    format.failureKindLabel('signin-failed', 'recovery', 2),
    '2 password + recovery code sign-ins'
  )
  assert.equal(
    format.failureKindLabel('step-up-failed', 'password', 1),
    '1 password identity check'
  )
  assert.equal(format.failureKindLabel('step-up-failed', null, 1200), '1,200 identity checks')
  assert.equal(
    format.failureCountriesLabel([
      { country: 'DE', count: 25 },
      { country: 'US', count: 10 },
      { country: null, count: 5 },
    ]),
    'Germany 25 · United States 10 · unknown 5'
  )
})
