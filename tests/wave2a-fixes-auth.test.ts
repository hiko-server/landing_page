/**
 * Wave 2A review fixes in the admin sign-in state (data/auth.db):
 *
 *   SECU-2  failed attempts (anyone can cause them) are counted per hour,
 *           method and country in a table of their own, so they can never
 *           push a sign-in or a security change out of the history; the
 *           Security page lists the newest real events plus a summary.
 *   SECU-3  tokens minted before sessions existed (no `sid`) end as soon as
 *           the owner signs any browser out (Log out, one browser, the
 *           others), without ever signing the owner out.
 *   SECU-4  auth.db, its -wal and -shm files (which hold most of the data)
 *           and its pre-migration copy are owner-only (0600).
 *
 * Runs the real API handlers in a throw-away working directory.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import jwt from 'jsonwebtoken'

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
let auth: typeof import('../lib/auth')
let admin: typeof import('../lib/admin')

before(async () => {
  process.chdir(tmp)
  const load = async (name: string, p: string) => {
    H[name] = (await import(p)).default as Handler
  }
  await load('pkVerify', '../pages/api/auth/passkey/verify')
  await load('security', '../pages/api/admin/security/index')
  await load('login', '../pages/api/auth/email-login')
  await load('logout', '../pages/api/admin/logout')
  await load('sessions', '../pages/api/admin/security/sessions')
  await load('session', '../pages/api/admin/session')
  store = await import('../lib/adminAuth/store')
  overview = await import('../lib/adminAuth/overview')
  authDb = await import('../lib/adminAuth/db')
  format = await import('../components/Admin/security/securityFormat')
  auth = await import('../lib/auth')
  admin = await import('../lib/admin')
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
    const report = runMigrations(db, AUTH_MIGRATIONS.slice(0, 2), { label: 'auth' })
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

// ── SECU-3 ────────────────────────────────────────────────────────────────

let ipSeq = 0
const nextIp = () => `192.0.2.${(ipSeq++ % 250) + 1}`

const setCookies = (o: Out): string[] => {
  const v = o.headers['set-cookie']
  return Array.isArray(v) ? v : v ? [v] : []
}
const sessionCookieOf = (o: Out) =>
  (setCookies(o).find((c) => c.startsWith('cv_admin_token=') && !/Max-Age=0/.test(c)) || '').split(
    ';'
  )[0]
const claimsOf = (cookie: string) =>
  jwt.decode(decodeURIComponent(cookie.split('=')[1])) as Record<string, any>

/** A token exactly as the build before sessions minted it: no `sid`. */
const legacyCookie = () =>
  `cv_admin_token=${jwt.sign(
    { sub: 'cv-admin', role: 'admin', email: OWNER, sv: admin.getSessionVersion() },
    process.env.JWT_SECRET as string,
    { algorithm: 'HS256', expiresIn: 7 * 24 * 3600 }
  )}`

/** lib/auth readAdminContext for a request carrying `cookie`. */
function readCtx(cookie: string) {
  const [name, ...rest] = cookie.split('=')
  const req = { headers: { cookie }, cookies: { [name]: decodeURIComponent(rest.join('=')) } }
  return auth.readAdminContext(
    req as any,
    { getHeader: () => undefined, setHeader: () => {} } as any
  )
}

async function ownerSignIn(): Promise<string> {
  const out = await call(H.login, {
    method: 'POST',
    body: { email: OWNER, password: PASS },
    ip: nextIp(),
  })
  assert.equal(out.statusCode, 200)
  return sessionCookieOf(out)
}

/** Forget any cutoff, as on the day of the deploy. */
const freshDeploy = () =>
  authDb.getAuthDb().prepare(`DELETE FROM auth_settings WHERE key = 'legacy_cutoff'`).run()

const securityView = (now = Date.now()) =>
  overview.securityOverview(
    { headers: { host: HOST } } as any,
    { claims: { role: 'admin' }, session: null },
    now
  )

test('SECU-3: "Sign out other browsers" ends a stolen pre-session token the list never showed', async () => {
  freshDeploy()
  const stolen = legacyCookie()
  const owner = await ownerSignIn()
  assert.ok(readCtx(stolen), 'accepted until the owner signs a browser out')
  assert.equal(securityView().legacySessions, true, 'the page says such browsers may exist')

  const out = await call(H.sessions, {
    method: 'DELETE',
    body: { others: true },
    cookie: owner,
    ip: nextIp(),
  })
  assert.equal(out.statusCode, 200)
  assert.equal(readCtx(stolen), null, 'the pre-session token is refused')
  assert.ok(readCtx(owner)?.session, 'the owner stays signed in')
  assert.equal(securityView().legacySessions, false)
  // …and it can no longer be upgraded to a session either.
  const upgrade = await call(H.session, { method: 'GET', cookie: stolen, ip: nextIp() })
  assert.deepEqual(upgrade.body, { authenticated: false })
  assert.equal(sessionCookieOf(upgrade), '')
})

test('SECU-3: revoking the session a stolen copy was upgraded to also ends the original token', async () => {
  freshDeploy()
  const stolen = legacyCookie()
  const owner = await ownerSignIn()
  // The thief's copy upgrades itself to a session row of its own.
  const upgraded = await call(H.session, { method: 'GET', cookie: stolen, ip: nextIp() })
  const thief = sessionCookieOf(upgraded)
  const thiefSid = claimsOf(thief).sid as string
  assert.ok(readCtx(thief)?.session)

  const out = await call(H.sessions, {
    method: 'DELETE',
    body: { id: thiefSid },
    cookie: owner,
    ip: nextIp(),
  })
  assert.equal(out.statusCode, 200)
  assert.equal(readCtx(thief), null, 'the upgraded token is revoked')
  assert.equal(readCtx(stolen), null, 'and the original cannot upgrade again')
  assert.ok(readCtx(owner)?.session)
})

test('SECU-3: the owner logging out ends pre-session tokens too, as before sessions existed', async () => {
  freshDeploy()
  const stolen = legacyCookie()
  const other = await ownerSignIn()
  const owner = await ownerSignIn()
  const out = await call(H.logout, { method: 'POST', cookie: owner, ip: nextIp() })
  assert.deepEqual(out.body, { ok: true, signedOut: true, revokedAllSessions: false })
  assert.equal(readCtx(owner), null)
  assert.equal(readCtx(stolen), null, 'the pre-session token is refused')
  assert.ok(readCtx(other)?.session, 'browsers with a session stay signed in')

  // Signing this browser out from its own row in the list does the same.
  freshDeploy()
  const stolen2 = legacyCookie()
  const own = await ownerSignIn()
  const sid = claimsOf(own).sid as string
  const self = await call(H.sessions, {
    method: 'DELETE',
    body: { id: sid },
    cookie: own,
    ip: nextIp(),
  })
  assert.equal(self.statusCode, 200)
  assert.equal(readCtx(stolen2), null)
})

test('SECU-3: an anonymous logout or a refused request never ends anything', async () => {
  freshDeploy()
  const stolen = legacyCookie()
  const anon = await call(H.logout, { method: 'POST', ip: nextIp() })
  assert.equal(anon.body.signedOut, false)
  const owner = await ownerSignIn()
  // Signing out another browser without a recent verification is refused first.
  authDb
    .getAuthDb()
    .prepare('UPDATE auth_sessions SET verified_at = verified_at - ? WHERE id = ?')
    .run(60 * 60_000, claimsOf(owner).sid)
  const refused = await call(H.sessions, {
    method: 'DELETE',
    body: { others: true },
    cookie: owner,
    ip: nextIp(),
  })
  assert.equal(refused.statusCode, 403)
  assert.ok(readCtx(stolen), 'nothing was ended')
  assert.equal(store.legacyCutoff(), null)
})

test('SECU-3: the cutoff compares issue times and only moves forward; the page flag ends after a week', () => {
  freshDeploy()
  assert.equal(store.isLegacyTokenEnded(Math.floor(Date.now() / 1000)), false, 'no cutoff yet')
  const cutoff = Date.UTC(2026, 9, 20, 12)
  store.endLegacyTokens(cutoff)
  assert.equal(store.isLegacyTokenEnded(cutoff / 1000 - 3600), true)
  assert.equal(store.isLegacyTokenEnded(cutoff / 1000), true, 'issued at the cutoff')
  assert.equal(store.isLegacyTokenEnded(cutoff / 1000 + 1), false)
  assert.equal(store.isLegacyTokenEnded(undefined), true, 'a token without iat')
  store.endLegacyTokens(cutoff - 60_000)
  assert.equal(store.legacyCutoff(), cutoff, 'never moves back')

  freshDeploy()
  const created = (
    authDb.getAuthDb().prepare('SELECT applied_at FROM schema_version WHERE version = 1').get() as {
      applied_at: number
    }
  ).applied_at
  const week = 7 * DAY
  assert.equal(store.legacyTokensMayBeValid(week, created + week - 1), true)
  assert.equal(
    store.legacyTokensMayBeValid(week, created + week),
    false,
    'every pre-session token has expired a week after auth.db was created'
  )
})

// ── SECU-4 ────────────────────────────────────────────────────────────────

const modeOf = (p: string) => fs.statSync(p).mode & 0o777
const sidecars = (file: string) => [file, `${file}-wal`, `${file}-shm`]

/** Run `fn` under the usual server umask (022: new files 0644 unless asked otherwise). */
function withUmask<T>(fn: () => T): T {
  const prev = process.umask(0o022)
  try {
    return fn()
  } finally {
    process.umask(prev)
  }
}

/** Open `file` like the app does (WAL) and write a few rows, so -wal and -shm exist. */
function writeSome(file: string): Database.Database {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE IF NOT EXISTS t (v TEXT)')
  const insert = db.prepare('INSERT INTO t (v) VALUES (?)')
  for (let i = 0; i < 50; i++) insert.run(`secret ${i}`)
  return db
}

test('SECU-4: a new auth.db and the -wal / -shm files SQLite creates for it are 0600 (and a new data dir 0700)', async () => {
  const { preparePrivateDbFile } = await import('../scripts/db/migrate.mjs')
  const dir = path.join(tmp, 'fresh', 'data')
  const file = path.join(dir, 'auth.db')
  withUmask(() => {
    preparePrivateDbFile(file)
    assert.equal(modeOf(dir), 0o700)
    assert.equal(modeOf(file), 0o600)
    assert.equal(fs.statSync(file).size, 0)
    const db = writeSome(file)
    try {
      for (const p of sidecars(file)) assert.equal(modeOf(p), 0o600, p)
    } finally {
      db.close()
    }
  })
})

test('SECU-4: an existing world-readable auth.db is repaired, before SQLite creates new sidecars and after', async () => {
  const { preparePrivateDbFile, restrictPrivateDbFiles } = await import('../scripts/db/migrate.mjs')
  const dir = path.join(tmp, 'older-release')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'auth.db')
  withUmask(() => {
    // What the earlier release left behind: everything 0644 while the server runs.
    const db = writeSome(file)
    for (const p of sidecars(file)) assert.equal(modeOf(p), 0o644, p)
    assert.deepEqual(restrictPrivateDbFiles(file), [])
    for (const p of sidecars(file)) assert.equal(modeOf(p), 0o600, p)
    db.close()

    // A 0644 main file without sidecars: fixed before opening, so new sidecars start 0600.
    fs.chmodSync(file, 0o644)
    for (const p of sidecars(file).slice(1)) fs.rmSync(p, { force: true })
    preparePrivateDbFile(file)
    const again = writeSome(file)
    try {
      for (const p of sidecars(file)) assert.equal(modeOf(p), 0o600, p)
    } finally {
      again.close()
    }
    // Missing files are not an error.
    assert.deepEqual(restrictPrivateDbFiles(path.join(dir, 'missing.db')), [])
  })
})

test('SECU-4: getAuthDb keeps data/auth.db, -wal and -shm owner-only, repairing 0644 files on open', () => {
  withUmask(() => {
    authDb.closeAuthDb()
    const file = authDb.authDbPath()
    for (const p of sidecars(file)) if (fs.existsSync(p)) fs.chmodSync(p, 0o644)
    authDb.getAuthDb()
    store.generateRecoveryCodes()
    for (const p of sidecars(file)) assert.equal(modeOf(p), 0o600, p)
  })
})

test('SECU-4: the pre-migration copy of auth.db is owner-only too', async () => {
  const { runMigrations } = await import('../scripts/db/migrate.mjs')
  const { AUTH_MIGRATIONS } = await import('../scripts/db/auth/index.mjs')
  const dir = path.join(tmp, 'premigration')
  fs.mkdirSync(dir, { recursive: true })
  const backups = path.join(dir, 'copies')
  withUmask(() => {
    const db = new Database(path.join(dir, 'auth.db'))
    try {
      // A store at version 1: migrating it to version 2 copies it aside first.
      runMigrations(db, AUTH_MIGRATIONS.slice(0, 1), { label: 'auth' })
      authDb.migrateAuthDb(db, backups)
    } finally {
      db.close()
    }
  })
  const copies = fs.readdirSync(backups)
  assert.equal(copies.length, 1)
  assert.match(copies[0], /^auth-v1-/)
  assert.equal(modeOf(path.join(backups, copies[0])), 0o600)
  assert.equal(modeOf(backups), 0o700)
})

test('SECU-4: the migration CLI keeps an auth.db it migrates owner-only (sidecars and copy included)', async () => {
  const { execFileSync } = await import('node:child_process')
  const { runMigrations } = await import('../scripts/db/migrate.mjs')
  const { AUTH_MIGRATIONS } = await import('../scripts/db/auth/index.mjs')
  const dir = path.join(tmp, 'cli')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'auth.db')
  withUmask(() => {
    const db = new Database(file)
    runMigrations(db, AUTH_MIGRATIONS.slice(0, 1), { label: 'auth' })
    db.close()
  })
  assert.equal(modeOf(file), 0o644, 'made the old way')
  const cli = path.join(prevCwd, 'scripts', 'migrate-db.mjs')
  const out = execFileSync(process.execPath, [cli, '--db', 'auth', '--file', file], {
    encoding: 'utf8',
  })
  // v1 → the newest auth.db migration (v2 when this was written; v3 adds the CV share links).
  assert.match(out, /auth: migrated v1 → v\d+ \(2-failure-counts/)
  for (const p of sidecars(file)) if (fs.existsSync(p)) assert.equal(modeOf(p), 0o600, p)
  const copies = fs.readdirSync(path.join(dir, 'backups', 'pre-migration'))
  assert.equal(copies.length, 1)
  assert.equal(modeOf(path.join(dir, 'backups', 'pre-migration', copies[0])), 0o600)
})
