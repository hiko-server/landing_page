/**
 * I3 — passkey (WebAuthn) sign-in for the admin: registration, sign-in,
 * recovery codes, "Require a passkey", per-browser sessions, step-up, and
 * the sign-in history. Ceremonies run against a software authenticator with
 * real keys and signatures (tests/softAuthenticator.ts), through the real API
 * handlers, in a throw-away working directory.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { SoftAuthenticator } from './softAuthenticator'

const OWNER = 'owner@example.test'
const PASS = 'passkey test passphrase 0123'
const SECRET = 'sa-passkeys-secret-0123456789abcdefghij'
process.env.JWT_SECRET = SECRET
process.env.ADMIN_EMAIL = OWNER
process.env.ADMIN_PASS = PASS
delete process.env.SITE_URL
delete process.env.NEXT_PUBLIC_SITE_HOST
delete process.env.TRUSTED_PROXY_IPS
delete process.env.TRUST_CLIENT_IP_HEADER
delete process.env.ADMIN_RECENT_AUTH_MINUTES

const HOST = 'localhost:3407'
const ORIGIN = `http://${HOST}`
const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-passkeys-'))

type Handler = (req: any, res: any) => Promise<unknown> | unknown
const H: Record<string, Handler> = {}
let auth: typeof import('../lib/auth')
let store: typeof import('../lib/adminAuth/store')
let sessions: typeof import('../lib/adminAuth/sessions')
let passkeys: typeof import('../lib/adminAuth/passkeys')
let stepUp: typeof import('../lib/adminAuth/stepUp')
let describe: typeof import('../lib/adminAuth/describe')
let authDb: typeof import('../lib/adminAuth/db')
let admin: typeof import('../lib/admin')

before(async () => {
  process.chdir(tmp)
  const load = async (name: string, p: string) => {
    H[name] = (await import(p)).default as Handler
  }
  await load('login', '../pages/api/auth/email-login')
  await load('pkOptions', '../pages/api/auth/passkey/options')
  await load('pkVerify', '../pages/api/auth/passkey/verify')
  await load('security', '../pages/api/admin/security/index')
  await load('verify', '../pages/api/admin/security/verify')
  await load('passkeys', '../pages/api/admin/security/passkeys')
  await load('codes', '../pages/api/admin/security/recovery-codes')
  await load('policy', '../pages/api/admin/security/policy')
  await load('sessions', '../pages/api/admin/security/sessions')
  await load('confirm', '../pages/api/admin/security/confirm')
  await load('recent', '../pages/api/admin/security/recent')
  await load('logout', '../pages/api/admin/logout')
  await load('session', '../pages/api/admin/session')
  await load('reset', '../pages/api/auth/reset-password')
  auth = await import('../lib/auth')
  store = await import('../lib/adminAuth/store')
  sessions = await import('../lib/adminAuth/sessions')
  passkeys = await import('../lib/adminAuth/passkeys')
  stepUp = await import('../lib/adminAuth/stepUp')
  describe = await import('../lib/adminAuth/describe')
  authDb = await import('../lib/adminAuth/db')
  admin = await import('../lib/admin')
})
after(() => {
  authDb.closeAuthDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

type Out = { statusCode: number; headers: Record<string, string | string[]>; body: any }
let ipSeq = 10

async function call(
  handler: Handler,
  opts: { method: string; body?: unknown; cookie?: string; host?: string; ua?: string }
): Promise<Out> {
  ipSeq++
  const req = {
    method: opts.method,
    url: '/api/test',
    query: {},
    body: opts.body,
    headers: {
      host: opts.host || HOST,
      'cf-connecting-ip': `203.0.113.${ipSeq % 250}`,
      'user-agent':
        opts.ua ||
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
      'cf-ipcountry': 'HK',
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

const setCookies = (o: Out): string[] => {
  const v = o.headers['set-cookie']
  return Array.isArray(v) ? v : v ? [v] : []
}
/** The session cookie pair ("cv_admin_token=…") a response set. */
const sessionCookieOf = (o: Out) =>
  (setCookies(o).find((c) => c.startsWith('cv_admin_token=') && !/Max-Age=0/.test(c)) || '').split(
    ';'
  )[0]
const claimsOf = (cookie: string) =>
  jwt.decode(decodeURIComponent(cookie.split('=')[1])) as Record<string, any>

async function passwordLogin(
  extra: Record<string, unknown> = {}
): Promise<{ out: Out; cookie: string }> {
  const out = await call(H.login, {
    method: 'POST',
    body: { email: OWNER, password: PASS, ...extra },
  })
  return { out, cookie: sessionCookieOf(out) }
}

/** lib/auth readAdminContext for a request carrying `cookie` ("name=value"). */
function readCtx(cookie: string) {
  const [name, ...rest] = cookie.split('=')
  const req = { headers: { cookie }, cookies: { [name]: decodeURIComponent(rest.join('=')) } }
  return auth.readAdminContext(
    req as any,
    { getHeader: () => undefined, setHeader: () => {} } as any
  )
}

/** Make a session's last verification older than the recent-auth window. */
function ageVerification(cookie: string, ms = 11 * 60_000) {
  const sid = claimsOf(cookie).sid as string
  authDb
    .getAuthDb()
    .prepare('UPDATE auth_sessions SET verified_at = verified_at - ? WHERE id = ?')
    .run(ms, sid)
}

// ── Pure helpers ───────────────────────────────────────────────────────────

test('describe: coarse device, network prefix and suggested passkey names', () => {
  assert.equal(
    describe.deviceLabel(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    ),
    'Safari on iOS'
  )
  assert.equal(
    describe.deviceLabel(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0'
    ),
    'Edge on Windows'
  )
  assert.equal(describe.deviceLabel(''), 'Unknown device')
  assert.equal(describe.ipPrefix('203.0.113.77'), '203.0.113.x')
  assert.equal(describe.ipPrefix('2001:db8:abcd:12::1'), '2001:db8:abcd::/48')
  assert.equal(describe.ipPrefix('nonsense'), null)
  assert.equal(describe.ipPrefix('127.0.0.1'), 'loopback')
  assert.equal(describe.ipPrefix('::1'), 'loopback')
  assert.equal(
    describe.suggestPasskeyName(
      'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Version/18.0 Safari/605.1.15'
    ),
    'iCloud Keychain (Safari on macOS)'
  )
  assert.equal(describe.suggestPasskeyName(null, ''), 'Passkey')
  assert.equal(describe.cleanPasskeyName('  Work\n laptop  '), 'Work laptop')
  assert.equal(describe.cleanPasskeyName('   '), null)
  assert.equal(Array.from(describe.cleanPasskeyName('鍵'.repeat(80)) || '').length, 60)
})

test('recovery codes: 80-bit Crockford base32, forgiving input, stored as hashes only', () => {
  const code = store.formatRecoveryCode(Buffer.alloc(10, 0xff))
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/)
  assert.equal(store.normalizeRecoveryCode('abcd efgh-jkmn pqrs'), 'ABCDEFGHJKMNPQRS')
  assert.equal(store.normalizeRecoveryCode('O0IL-0000-0000-0000'), '0011000000000000')
  assert.equal(store.normalizeRecoveryCode('ABCD-EFGH-JKMN-PQRU'), null, 'U is not in the alphabet')
  assert.equal(store.normalizeRecoveryCode('short'), null)
  assert.equal(store.normalizeRecoveryCode(42), null)
})

test('relying party: the public host, localhost for local work, nothing for IP literals', () => {
  const rp = (host: string) => passkeys.relyingPartyFor({ headers: { host } })
  assert.deepEqual(rp('localhost:3407'), {
    rpID: 'localhost',
    rpName: 'localhost',
    origin: 'http://localhost:3407',
  })
  assert.equal(rp('admin.localhost:3000')?.rpID, 'admin.localhost')
  assert.equal(rp('127.0.0.1:3407'), null)
  assert.equal(rp('[::1]:3407'), null)
  assert.equal(rp(''), null)
  assert.deepEqual(rp('example.org'), {
    rpID: 'example.org',
    rpName: 'example.org',
    origin: 'https://example.org',
  })
  process.env.SITE_URL = 'https://lucian-dev.com'
  try {
    assert.deepEqual(rp('lucian-dev.com'), {
      rpID: 'lucian-dev.com',
      rpName: 'lucian-dev.com',
      origin: 'https://lucian-dev.com',
    })
    assert.equal(rp('evil.example')?.rpID, 'lucian-dev.com', 'a forged Host never becomes the RP')
  } finally {
    delete process.env.SITE_URL
  }
})

test('ADMIN_RECENT_AUTH_MINUTES: whole minutes 1–60, default 10', () => {
  assert.equal(stepUp.recentAuthWindowMs(undefined), 10 * 60_000)
  assert.equal(stepUp.recentAuthWindowMs(''), 10 * 60_000)
  assert.equal(stepUp.recentAuthWindowMs('5'), 5 * 60_000)
  assert.equal(stepUp.recentAuthWindowMs('0'), 60_000)
  assert.equal(stepUp.recentAuthWindowMs('999'), 60 * 60_000)
  assert.equal(stepUp.recentAuthWindowMs('2.5'), 10 * 60_000)
})

// ── Flows ──────────────────────────────────────────────────────────────────

let cookieA = ''
const authenticator = new SoftAuthenticator()
let recoveryCodes: string[] = []

test('password sign-in creates a session row bound to the token (sid), recorded in the history', async () => {
  const { out, cookie } = await passwordLogin()
  assert.equal(out.statusCode, 200)
  const claims = claimsOf(cookie)
  assert.match(claims.sid, sessions.SESSION_ID_RE)
  assert.deepEqual(claims.amr, ['pwd'])
  const row = sessions.liveSession(claims.sid)
  assert.ok(row)
  assert.equal(row!.method, 'password')
  assert.equal(row!.device, 'Chrome on macOS')
  assert.equal(row!.country, 'HK')
  assert.match(row!.ipPrefix || '', /^203\.0\.113\.x$/)
  assert.equal(store.listAuthEvents(1)[0].type, 'signin')
  cookieA = cookie
})

test('a passkey is registered from a fresh session; the first one comes with ten recovery codes', async () => {
  const opt = await call(H.passkeys, {
    method: 'POST',
    body: { action: 'options' },
    cookie: cookieA,
  })
  assert.equal(opt.statusCode, 200, JSON.stringify(opt.body))
  const options = opt.body.options
  assert.equal(options.rp.id, 'localhost')
  assert.equal(options.user.name, OWNER)
  assert.equal(options.attestation, 'none')
  assert.equal(options.authenticatorSelection.residentKey, 'required')
  assert.equal(options.authenticatorSelection.userVerification, 'required')
  assert.deepEqual(options.excludeCredentials, [])

  const response = authenticator.register(options, ORIGIN)
  const reg = await call(H.passkeys, {
    method: 'POST',
    body: { action: 'register', response },
    cookie: cookieA,
  })
  assert.equal(reg.statusCode, 200, JSON.stringify(reg.body))
  assert.equal(reg.body.passkey.id, authenticator.id)
  assert.equal(reg.body.passkey.name, 'iCloud Keychain (Chrome on macOS)')
  assert.equal(reg.body.passkey.backedUp, true)
  assert.equal(reg.body.recoveryCodes.length, 10)
  recoveryCodes = reg.body.recoveryCodes
  assert.deepEqual(store.recoveryStatus().remaining, 10)
  const stored = authDb.getAuthDb().prepare('SELECT code_hash FROM recovery_codes').all() as Array<{
    code_hash: string
  }>
  assert.ok(
    stored.every((r) => /^[0-9a-f]{64}$/.test(r.code_hash)),
    'only hashes are stored'
  )
  assert.ok(!JSON.stringify(stored).includes(recoveryCodes[0].replace(/-/g, '')))

  // The challenge was consumed: the same response cannot register twice.
  const replay = await call(H.passkeys, {
    method: 'POST',
    body: { action: 'register', response },
    cookie: cookieA,
  })
  assert.equal(replay.statusCode, 400)
  assert.equal(replay.body.code, 'CHALLENGE')
  // The next registration excludes the authenticator already there.
  const again = await call(H.passkeys, {
    method: 'POST',
    body: { action: 'options' },
    cookie: cookieA,
  })
  assert.deepEqual(
    again.body.options.excludeCredentials.map((c: { id: string }) => c.id),
    [authenticator.id]
  )
})

test('a registration from the wrong origin is refused', async () => {
  const other = new SoftAuthenticator()
  const opt = await call(H.passkeys, {
    method: 'POST',
    body: { action: 'options' },
    cookie: cookieA,
  })
  const response = other.register(opt.body.options, 'https://evil.example')
  const reg = await call(H.passkeys, {
    method: 'POST',
    body: { action: 'register', response },
    cookie: cookieA,
  })
  assert.equal(reg.statusCode, 400)
  assert.equal(reg.body.code, 'VERIFICATION')
  assert.equal(passkeys.passkeyCount(), 1)
})

let cookieB = ''

test('sign in with the passkey: a new session (method passkey), the counter is stored', async () => {
  const opt = await call(H.pkOptions, { method: 'POST', body: {} })
  assert.equal(opt.statusCode, 200)
  assert.deepEqual(
    opt.body.options.allowCredentials,
    [],
    'discoverable: the browser lists the passkeys'
  )
  assert.equal(opt.body.options.userVerification, 'required')
  const response = authenticator.authenticate(opt.body.options, ORIGIN)
  const ok = await call(H.pkVerify, { method: 'POST', body: { response } })
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body))
  cookieB = sessionCookieOf(ok)
  const claims = claimsOf(cookieB)
  assert.deepEqual(claims.amr, ['passkey'])
  assert.equal(sessions.liveSession(claims.sid)?.credentialId, authenticator.id)
  assert.ok(passkeys.getPasskey(authenticator.id)?.lastUsedAt)
  assert.ok(
    setCookies(ok).some((c) => c.startsWith('cv_known_device=')),
    'known-device cookie'
  )
  // The challenge is single use.
  const replay = await call(H.pkVerify, { method: 'POST', body: { response } })
  assert.equal(replay.statusCode, 401)
  assert.equal(replay.body.code, 'CHALLENGE')
})

test('a cloned authenticator (stale counter), a foreign passkey and a wrong origin cannot sign in', async () => {
  let opt = await call(H.pkOptions, { method: 'POST', body: {} })
  const clone = await call(H.pkVerify, {
    method: 'POST',
    body: { response: authenticator.authenticate(opt.body.options, ORIGIN, 'localhost', 0) },
  })
  assert.equal(clone.statusCode, 401)
  assert.equal(clone.body.code, 'VERIFICATION')

  opt = await call(H.pkOptions, { method: 'POST', body: {} })
  const stranger = new SoftAuthenticator()
  const unknown = await call(H.pkVerify, {
    method: 'POST',
    body: { response: stranger.authenticate(opt.body.options, ORIGIN) },
  })
  assert.equal(unknown.statusCode, 401)
  assert.equal(unknown.body.code, 'UNKNOWN_CREDENTIAL')
  assert.equal(unknown.body.credentialId, stranger.id)

  opt = await call(H.pkOptions, { method: 'POST', body: {} })
  const phished = await call(H.pkVerify, {
    method: 'POST',
    body: {
      response: authenticator.authenticate(
        opt.body.options,
        'https://lucian-dev.com.evil.example',
        'localhost'
      ),
    },
  })
  assert.equal(phished.statusCode, 401)
  assert.equal(phished.body.code, 'VERIFICATION')

  const ip = await call(H.pkOptions, { method: 'POST', body: {}, host: '127.0.0.1:3407' })
  assert.equal(ip.statusCode, 400)
  assert.equal(ip.body.code, 'PASSKEY_UNAVAILABLE')
  assert.equal(store.listAuthEvents(5).filter((e) => e.type === 'signin-failed').length >= 3, true)
})

test('dangerous actions need a recent verification: 403 STEP_UP_REQUIRED, then a passkey step-up', async () => {
  ageVerification(cookieA)
  const blocked = await call(H.codes, { method: 'POST', body: {}, cookie: cookieA })
  assert.equal(blocked.statusCode, 403)
  assert.equal(blocked.body.code, 'STEP_UP_REQUIRED')
  assert.deepEqual(blocked.body.methods, ['passkey', 'password'])
  assert.equal(blocked.body.recoveryRequired, false)
  assert.equal(blocked.body.windowMinutes, 10)

  const opt = await call(H.verify, { method: 'POST', body: { action: 'options' }, cookie: cookieA })
  assert.equal(opt.statusCode, 200)
  assert.deepEqual(
    opt.body.options.allowCredentials.map((c: { id: string }) => c.id),
    [authenticator.id]
  )
  // The challenge belongs to session A: session B cannot use it.
  const stolen = await call(H.verify, {
    method: 'POST',
    body: { method: 'passkey', response: authenticator.authenticate(opt.body.options, ORIGIN) },
    cookie: cookieB,
  })
  assert.equal(stolen.statusCode, 401)
  assert.equal(stolen.body.code, 'CHALLENGE')

  const opt2 = await call(H.verify, {
    method: 'POST',
    body: { action: 'options' },
    cookie: cookieA,
  })
  const ok = await call(H.verify, {
    method: 'POST',
    body: { method: 'passkey', response: authenticator.authenticate(opt2.body.options, ORIGIN) },
    cookie: cookieA,
  })
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body))
  assert.ok(ok.body.recentUntil > Date.now())
  const codes = await call(H.codes, { method: 'POST', body: {}, cookie: cookieA })
  assert.equal(codes.statusCode, 200)
  assert.equal(codes.body.codes.length, 10)
  // The new set replaces the old one.
  assert.equal(store.consumeRecoveryCode(recoveryCodes[0]), false)
  recoveryCodes = codes.body.codes
})

test('a password step-up works too, and a wrong password is refused and recorded', async () => {
  ageVerification(cookieA)
  const wrong = await call(H.verify, {
    method: 'POST',
    body: { method: 'password', password: 'nope' },
    cookie: cookieA,
  })
  assert.equal(wrong.statusCode, 401)
  const stale = await call(H.recent, { method: 'GET', cookie: cookieA })
  assert.deepEqual([stale.statusCode, stale.body.recent, stale.body.recentUntil], [200, false, null])
  assert.deepEqual(stale.body.methods, ['passkey', 'password'])
  const ok = await call(H.verify, {
    method: 'POST',
    body: { method: 'password', password: PASS },
    cookie: cookieA,
  })
  assert.equal(ok.statusCode, 200)
  const confirm = await call(H.confirm, { method: 'POST', body: {}, cookie: cookieA })
  assert.equal(confirm.statusCode, 200)
  const fresh = await call(H.recent, { method: 'GET', cookie: cookieA })
  assert.equal(fresh.body.recent, true)
  assert.ok(fresh.body.recentUntil > Date.now())
  assert.equal((await call(H.recent, { method: 'GET' })).statusCode, 401)
  const types = store.listAuthEvents(4).map((e) => e.type)
  assert.ok(types.includes('step-up') && types.includes('step-up-failed'), types.join(','))
})

test('"Require a passkey": the password alone stops working; password + a recovery code (once) signs in', async () => {
  const on = await call(H.policy, {
    method: 'PUT',
    body: { passkeyRequired: true },
    cookie: cookieA,
  })
  assert.equal(on.statusCode, 200)
  assert.equal(store.isPasskeyRequired(), true)

  const plain = await passwordLogin()
  assert.equal(plain.out.statusCode, 403)
  assert.equal(plain.out.body.code, 'PASSKEY_REQUIRED')
  assert.equal(plain.cookie, '')
  // The answer does not depend on the password (nothing was checked).
  const wrongPlain = await call(H.login, {
    method: 'POST',
    body: { email: OWNER, password: 'wrong' },
  })
  assert.deepEqual([wrongPlain.statusCode, wrongPlain.body.code], [403, 'PASSKEY_REQUIRED'])

  const badCode = await passwordLogin({ recoveryCode: 'AAAA-AAAA-AAAA-AAAA' })
  assert.equal(badCode.out.statusCode, 401)
  assert.equal(badCode.out.body.code, 'PASSWORD_OR_RECOVERY_INVALID')
  const wrongPass = await call(H.login, {
    method: 'POST',
    body: { email: OWNER, password: 'wrong', recoveryCode: recoveryCodes[1] },
  })
  assert.deepEqual(
    [wrongPass.statusCode, wrongPass.body.code],
    [401, 'PASSWORD_OR_RECOVERY_INVALID'],
    'same answer for a wrong password'
  )
  assert.equal(store.recoveryStatus().remaining, 10, 'a wrong password spends no code')

  const ok = await passwordLogin({
    recoveryCode: recoveryCodes[1].toLowerCase().replace(/-/g, ' '),
  })
  assert.equal(ok.out.statusCode, 200, JSON.stringify(ok.out.body))
  assert.deepEqual(claimsOf(ok.cookie).amr, ['pwd', 'recovery'])
  assert.equal(store.recoveryStatus().remaining, 9)
  const reuse = await passwordLogin({ recoveryCode: recoveryCodes[1] })
  assert.equal(reuse.out.statusCode, 401)

  // Step-up by password now needs a code as well.
  ageVerification(cookieA)
  const noCode = await call(H.verify, {
    method: 'POST',
    body: { method: 'password', password: PASS },
    cookie: cookieA,
  })
  assert.deepEqual([noCode.statusCode, noCode.body.code], [400, 'RECOVERY_CODE_REQUIRED'])
  const withCode = await call(H.verify, {
    method: 'POST',
    body: { method: 'password', password: PASS, recoveryCode: recoveryCodes[2] },
    cookie: cookieA,
  })
  assert.equal(withCode.statusCode, 200)

  // The only passkey cannot be removed while the requirement is on.
  const last = await call(H.passkeys, {
    method: 'DELETE',
    body: { id: authenticator.id },
    cookie: cookieA,
  })
  assert.deepEqual([last.statusCode, last.body.code], [409, 'LAST_PASSKEY'])
  const off = await call(H.policy, {
    method: 'PUT',
    body: { passkeyRequired: false },
    cookie: cookieA,
  })
  assert.equal(off.statusCode, 200)
})

test('renaming needs no step-up; removing does; the overview lists everything', async () => {
  ageVerification(cookieA)
  const renamed = await call(H.passkeys, {
    method: 'PATCH',
    body: { id: authenticator.id, name: 'MacBook' },
    cookie: cookieA,
  })
  assert.equal(renamed.statusCode, 200)
  assert.equal(renamed.body.passkey.name, 'MacBook')
  const overview = await call(H.security, { method: 'GET', cookie: cookieA })
  assert.equal(overview.statusCode, 200)
  assert.equal(overview.body.rp.id, 'localhost')
  assert.equal(overview.body.passkeys[0].provider, 'iCloud Keychain')
  assert.ok(overview.body.sessions.some((s: { current: boolean }) => s.current))
  assert.equal(overview.body.current.recentUntil, null)
  assert.match(overview.body.userId, /^[A-Za-z0-9_-]{43}$/)
  const remove = await call(H.passkeys, {
    method: 'DELETE',
    body: { id: authenticator.id },
    cookie: cookieA,
  })
  assert.equal(remove.statusCode, 403)
  assert.equal(remove.body.code, 'STEP_UP_REQUIRED')
})

test('sessions: sign one browser out, the others, and everywhere', async () => {
  const c = (await passwordLogin()).cookie
  const d = (await passwordLogin()).cookie
  const sidOf = (cookie: string) => claimsOf(cookie).sid as string
  const ctxOf = readCtx
  assert.ok(ctxOf(c))

  // Another browser: needs a recent verification (c was just signed in).
  const one = await call(H.sessions, { method: 'DELETE', body: { id: sidOf(d) }, cookie: c })
  assert.equal(one.statusCode, 200)
  assert.equal(ctxOf(d), null, 'the revoked browser is signed out')
  assert.ok(ctxOf(c), 'this browser is not')

  // Logout revokes this browser only.
  const e = (await passwordLogin()).cookie
  const out = await call(H.logout, { method: 'POST', cookie: e })
  assert.equal(out.body.revokedAllSessions, false)
  assert.equal(ctxOf(e), null)
  assert.ok(ctxOf(c))

  const others = await call(H.sessions, { method: 'DELETE', body: { others: true }, cookie: c })
  assert.equal(others.statusCode, 200)
  assert.ok(others.body.revoked >= 1)
  assert.equal(ctxOf(cookieB), null)
  assert.ok(ctxOf(c))

  const all = await call(H.sessions, { method: 'DELETE', body: { all: true }, cookie: c })
  assert.equal(all.statusCode, 200)
  assert.equal(ctxOf(c), null, 'everywhere includes this browser (session version bumped)')
  cookieA = (await passwordLogin()).cookie
  assert.ok(ctxOf(cookieA))
})

test('a token from before sessions keeps working, is upgraded once, and never counts as recent', async () => {
  const legacy = `cv_admin_token=${auth.signAdminToken(OWNER)}`
  const ctx = readCtx(legacy)
  assert.ok(ctx)
  assert.equal(ctx!.session, null)
  const denied = await call(H.codes, { method: 'POST', body: {}, cookie: legacy })
  assert.equal(denied.statusCode, 403, 'a pre-session token is never "recent"')
  const upgraded = await call(H.session, { method: 'GET', cookie: legacy })
  assert.deepEqual(upgraded.body, { authenticated: true })
  const fresh = sessionCookieOf(upgraded)
  const row = sessions.liveSession(claimsOf(fresh).sid)
  assert.equal(row?.method, 'legacy')
  assert.equal(row!.verifiedAt, claimsOf(legacy).iat * 1000, 'kept the original sign-in time')

  // A token whose sid is not a string, or names no row, is refused.
  const bogus = `cv_admin_token=${jwt.sign({ role: 'admin', email: OWNER, sv: admin.getSessionVersion(), sid: 42 }, SECRET, { algorithm: 'HS256' })}`
  const ghost = `cv_admin_token=${jwt.sign({ role: 'admin', email: OWNER, sv: admin.getSessionVersion(), sid: 'A'.repeat(22) }, SECRET, { algorithm: 'HS256' })}`
  for (const cookie of [bogus, ghost]) {
    assert.equal(readCtx(cookie), null)
  }
})

test('a password reset signs every session out and is recorded', async () => {
  const before = sessions.listLiveSessions().length
  assert.ok(before >= 1)
  const reset = admin.createResetToken()
  const out = await call(H.reset, {
    method: 'POST',
    body: { token: reset!.token, password: 'a brand new passphrase 42' },
  })
  assert.equal(out.statusCode, 200)
  assert.equal(sessions.listLiveSessions().length, 0)
  assert.equal(store.listAuthEvents(1)[0].type, 'password-reset')
})
