/**
 * Changing the admin password from Admin → Security
 * (POST /api/admin/security/password, lib/adminAuth/password.ts) and the
 * shared password policy (lib/adminAuth/passwordPolicy.ts):
 *
 *   - the policy: length in code points after NFKC, common / predictable
 *     passwords, the account's and the site's names, "not the current one";
 *   - lib/admin: NFKC hashing with a per-record marker (older records keep
 *     verifying the password as typed), compare-and-swap writes;
 *   - the route: wrong current password → nothing changes and a failure is
 *     counted; success → the old password stops working, the new one works,
 *     reset links are gone, other sessions end iff asked, this browser keeps
 *     a fresh session, history + activity log record it without secrets;
 *     rate limit, shared lockout, step-up with "Require a passkey", the
 *     ADMIN_PASS bootstrap hint and the e-mail notice.
 *
 * Runs the real API handlers in a throw-away working directory.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'

const OWNER = 'owner@example.test'
// Decomposed "é" (e + U+0301): the bootstrap hashes its NFKC form, so the
// composed spelling signs in too.
const PASS = 'Café harbour lantern 0123'
const SECRET = 'admin-password-secret-0123456789abcdefgh'
process.env.JWT_SECRET = SECRET
process.env.ADMIN_EMAIL = OWNER
process.env.ADMIN_PASS = PASS
process.env.SITE_URL = 'https://lucian-dev.example'
delete process.env.NEXT_PUBLIC_SITE_HOST
delete process.env.TRUSTED_PROXY_IPS
delete process.env.TRUST_CLIENT_IP_HEADER
delete process.env.ADMIN_RECENT_AUTH_MINUTES
delete process.env.NOTIFY_EMAIL
for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL'])
  delete process.env[k]

const HOST = 'localhost:3541'
const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-password-'))

type Handler = (req: any, res: any) => Promise<unknown> | unknown
const H: Record<string, Handler> = {}
let policy: typeof import('../lib/adminAuth/passwordPolicy')
let pw: typeof import('../lib/adminAuth/password')
let admin: typeof import('../lib/admin')
let auth: typeof import('../lib/auth')
let store: typeof import('../lib/adminAuth/store')
let sessions: typeof import('../lib/adminAuth/sessions')
let authDb: typeof import('../lib/adminAuth/db')
let auditStore: typeof import('../lib/audit/store')
let auditDb: typeof import('../lib/audit/db')
let format: typeof import('../components/Admin/security/securityFormat')
let cardRules: typeof import('../components/Admin/security/passwordRules')

before(async () => {
  process.chdir(tmp)
  const load = async (name: string, p: string) => {
    H[name] = (await import(p)).default as Handler
  }
  await load('change', '../pages/api/admin/security/password')
  await load('login', '../pages/api/auth/email-login')
  await load('security', '../pages/api/admin/security/index')
  await load('reset', '../pages/api/auth/reset-password')
  await load('verify', '../pages/api/admin/security/verify')
  policy = await import('../lib/adminAuth/passwordPolicy')
  pw = await import('../lib/adminAuth/password')
  admin = await import('../lib/admin')
  auth = await import('../lib/auth')
  store = await import('../lib/adminAuth/store')
  sessions = await import('../lib/adminAuth/sessions')
  authDb = await import('../lib/adminAuth/db')
  auditStore = await import('../lib/audit/store')
  auditDb = await import('../lib/audit/db')
  format = await import('../components/Admin/security/securityFormat')
  cardRules = await import('../components/Admin/security/passwordRules')
})
after(() => {
  authDb.closeAuthDb()
  auditDb.closeAuditDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

// ── Harness ──────────────────────────────────────────────────────────────

type Out = { statusCode: number; headers: Record<string, string | string[]>; body: any }
let ipSeq = 0
const nextIp = () => `192.0.2.${(ipSeq++ % 250) + 1}`
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

async function call(
  handler: Handler,
  opts: { method: string; body?: unknown; cookie?: string; ip?: string; url?: string }
): Promise<Out> {
  const req = {
    method: opts.method,
    url: opts.url || '/api/test',
    query: {},
    body: opts.body,
    headers: {
      host: HOST,
      'cf-connecting-ip': opts.ip || nextIp(),
      'cf-ipcountry': 'HK',
      'user-agent': UA,
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
  }
  await handler(req, res)
  return out
}

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

/** lib/auth readAdminContext for a request carrying `cookie`. */
function readCtx(cookie: string) {
  const [name, ...rest] = cookie.split('=')
  const req = { headers: { cookie }, cookies: { [name]: decodeURIComponent(rest.join('=')) } }
  return auth.readAdminContext(
    req as any,
    { getHeader: () => undefined, setHeader: () => {} } as any
  )
}

async function login(password: string, ip = nextIp()): Promise<Out> {
  return call(H.login, { method: 'POST', body: { email: OWNER, password }, ip })
}

async function signIn(password: string): Promise<string> {
  const out = await login(password)
  assert.equal(out.statusCode, 200, `sign-in with the expected password (${out.statusCode})`)
  const cookie = sessionCookieOf(out)
  assert.ok(cookie)
  return cookie
}

const change = (cookie: string, body: unknown, ip?: string) =>
  call(H.change, { method: 'POST', body, cookie, ip, url: '/api/admin/security/password' })

/** The password the stored record currently has (tracked by the tests). */
let live = PASS
const readRecord = () =>
  JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'admin.json'), 'utf8')) as Record<string, any>

// ── Policy (pure) ────────────────────────────────────────────────────────

const CTX = { email: 'sam.rivers@example.test', siteHost: 'www.lucian-dev.example' }

test('policy: length counts code points after NFKC, 12 to 256, every character allowed', () => {
  assert.equal(policy.passwordLength('🔐'.repeat(12)), 12)
  assert.equal(policy.passwordLength('é'), 1, 'a decomposed é is one character')
  const eleven = 'mk4 vq9 zt2'
  assert.equal(policy.checkNewPassword(eleven, CTX).tooShort, true)
  assert.equal(policy.checkNewPassword(`${eleven}w`, CTX).ok, true)
  const long = Array.from({ length: 257 }, (_, i) =>
    String.fromCharCode(0x4e00 + ((i * 7919) % 2000))
  ).join('')
  assert.equal(policy.checkNewPassword(long, CTX).tooLong, true)
  assert.equal(policy.checkNewPassword(long.slice(0, 256), CTX).tooLong, false)
  for (const ok of [
    'velvet orbit canyon pickle',
    'x7#Kp9$mQ2!vL4zR',
    'café crème brûlée 2026',
    '月亮代表我的心永远不变啊',
    '  spaces at both ends  ',
  ]) {
    assert.equal(policy.checkNewPassword(ok, CTX).ok, true, ok)
  }
})

test('policy: common and predictable passwords are refused, also through look-alikes', () => {
  for (const bad of [
    'Password1234!',
    'P@ssw0rd2024!!',
    'qwertyuiop12',
    '123456789012',
    'abcdefghijkl',
    'aaaaaaaaaaaa',
    'monkeymonkey',
    'Iloveyou2026',
    'Summer2026!!',
    'zaq12wsxcde3',
    'ｐａｓｓｗｏｒｄ１２３４',
    '1etmein1etmein',
  ]) {
    const c = policy.checkNewPassword(bad, CTX)
    assert.equal(c.predictable, true, bad)
    assert.equal(c.ok, false, bad)
    assert.equal(c.strength, 'too-weak', bad)
  }
  assert.equal(policy.predictableUnits('Password2026!'), 3)
  assert.equal(policy.predictableUnits('x7#Kp9$mQ2!vL4zR'), 16)
})

test('policy: interleaved keyboard rows, numpad columns, stuttered runs and their roots are predictable', () => {
  const ctx = { email: 'owner@example.test', siteHost: 'lucian-dev.example' }
  for (const bad of [
    '1q2w3e4r5t6y',
    'q1w2e3r4t5y6',
    'a1b2c3d4e5f6',
    '1a2s3d4f5g6h',
    '147258369147',
    '741852963741',
    '789456123789',
    '11223344556677',
    'aabbccddeeff',
    '111222333444',
    '1q2w3e4r1q2w3e4r',
    'blink182blink182',
    'loveyou12345',
  ]) {
    const c = policy.checkNewPassword(bad, ctx)
    assert.equal(c.predictable, true, bad)
    assert.equal(c.ok, false, bad)
  }
  // The new orders do not catch ordinary passphrases or generated passwords.
  for (const ok of [
    'x7#Kp9$mQ2!vL4zR',
    'a quiet harbour at dawn',
    'velvet orbit canyon pickle',
    'café crème brûlée 2026',
    'mk4 vq9 zt2w',
  ]) {
    assert.equal(policy.checkNewPassword(ok, ctx).ok, true, ok)
  }
  // 500 generated 14-character letters-and-digits passwords (seeded): none refused.
  let seed = 20261021
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let n = 0; n < 500; n++) {
    const p = Array.from({ length: 14 }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('')
    assert.equal(policy.checkNewPassword(p, ctx).predictable, false, p)
  }
})

test('strength: word passphrases count by the word, and the best-known phrases are refused', () => {
  const ctx = { email: 'owner@example.test', siteHost: 'lucian-site.test' }
  const strength = (p: string) => policy.checkNewPassword(p, ctx).strength
  for (const famous of [
    'correct horse battery staple',
    'correcthorsebatterystaple',
    'Correct-Horse-Battery-Staple',
    'c0rrect h0rse battery staple',
    'Hello World 2026',
    'helloworld2026!',
  ]) {
    assert.equal(policy.checkNewPassword(famous, ctx).predictable, true, famous)
  }
  assert.equal(strength('tidal mosaic river'), 'fair', 'three words')
  assert.equal(strength('iamtheadminhere'), 'fair')
  assert.equal(strength('velvet orbit canyon pickle'), 'good', 'four words')
  assert.equal(strength('velvet orbit canyon pickle meadow'), 'strong', 'five words')
  assert.equal(strength('x7#Kp9$mQ2!vL4zR'), 'strong', 'a generated password')
  assert.equal(strength('qhzvbmwkxtrplndg'), 'strong', 'random letters are not read as words')
})

test('policy: the e-mail name and the site name are refused, separators and look-alikes included', () => {
  assert.deepEqual(
    policy.personalTokens('sam.rivers@example.test', 'www.lucian-dev.example').sort(),
    ['lucian', 'luciandev', 'rivers', 'samrivers']
  )
  assert.deepEqual(policy.personalTokens('', '127.0.0.1'), [])
  assert.deepEqual(policy.personalTokens('', 'localhost'), [])
  for (const bad of [
    'my Lucian-Dev passphrase',
    'the lucian_dev quiet harbour',
    'L u c 1 a n morning tide',
    'rivers walk the harbour',
    'Sam-Rivers by the harbour',
  ]) {
    assert.equal(policy.checkNewPassword(bad, CTX).personal, true, bad)
  }
  assert.equal(policy.checkNewPassword('a quiet harbour at dawn', CTX).personal, false)
})

test('policy: "not the current one" compares the normalised forms; issues come most basic first', () => {
  const c = policy.checkNewPassword('ｑｕｉｅｔ harbour lantern', {
    ...CTX,
    current: 'quiet harbour lantern',
  })
  assert.equal(c.sameAsCurrent, true)
  assert.deepEqual(policy.passwordIssues(c), ['sameAsCurrent'])
  assert.equal(policy.checkNewPassword('quiet harbour lantern', CTX).sameAsCurrent, null)
  assert.deepEqual(policy.passwordIssues(policy.checkNewPassword('lucian1', CTX)), [
    'tooShort',
    'personal',
    'predictable',
  ])
  // Strength grows with unpredictable length and variety.
  const order = ['too-weak', 'fair', 'good', 'strong']
  const s = (p: string) => order.indexOf(policy.checkNewPassword(p, CTX).strength)
  assert.ok(s('dragonfly-x9z') < s('quiet harbour lantern'))
  assert.ok(s('quiet harbour lantern') <= s('Qu1et harbour lantern at dawn, 7 bells'))
  assert.equal(policy.checkNewPassword('', CTX).strength, 'none')
})

test('the checklist and wait labels of the Password card', () => {
  const rules = (p: string, current = '') =>
    cardRules
      .passwordRules(policy.checkNewPassword(p, { ...CTX, current }), 12, 256)
      .map((r) => `${r.key}:${r.state}`)
  assert.deepEqual(rules(''), [
    'length:pending',
    'common:pending',
    'personal:pending',
    'current:pending',
  ])
  assert.deepEqual(rules('Password1234!'), [
    'length:met',
    'common:unmet',
    'personal:met',
    'current:pending',
  ])
  assert.deepEqual(rules('quiet harbour lantern', 'something else'), [
    'length:met',
    'common:met',
    'personal:met',
    'current:met',
  ])
  assert.equal(
    cardRules.passwordRules(policy.checkNewPassword('short', CTX), 12, 256)[0].label,
    'At least 12 characters (5)'
  )
  assert.equal(cardRules.waitLabel(0, 0), '1 min')
  assert.equal(cardRules.waitLabel(4 * 60_000 + 1, 0), '5 min')
  assert.equal(cardRules.waitLabel(65 * 60_000, 0), '1 h 5 min')
  assert.equal(
    format.failureKindLabel('password-change-failed', 'password', 2),
    '2 password changes'
  )
  assert.equal(format.eventLabel('password-changed'), 'Changed the password')
})

// ── lib/admin: hashing, normalisation, writes ──────────────────────────────

test('bootstrap hashes the NFKC form: the composed spelling of the decomposed ADMIN_PASS signs in', async () => {
  const out = await login('Café harbour lantern 0123')
  assert.equal(out.statusCode, 200)
  assert.equal(readRecord().passwordNorm, 'NFKC')
  assert.equal(typeof readRecord().passwordChangedAt, 'number')
  assert.equal(
    (await login('Cafe harbour lantern 0123')).statusCode,
    401,
    'still a different password'
  )
})

test('a record from before normalisation keeps verifying the password as typed', async () => {
  const file = path.join(tmp, 'data', 'admin.json')
  const saved = fs.readFileSync(file, 'utf8')
  try {
    const raw = 'ｆｕｌｌ width harbour 0123'
    const salt = crypto.randomBytes(16).toString('hex')
    const legacy = {
      ...JSON.parse(saved),
      salt,
      passwordHash: crypto.scryptSync(raw, salt, 64).toString('hex'),
    }
    delete legacy.passwordNorm
    fs.writeFileSync(file, JSON.stringify(legacy))
    assert.equal((await login(raw)).statusCode, 200)
    assert.equal(await admin.passwordMatchesRecord(raw, admin.readAdmin()!), true)
    assert.equal(
      await admin.passwordMatchesRecord('full width harbour 0123', admin.readAdmin()!),
      false
    )
  } finally {
    fs.writeFileSync(file, saved)
  }
})

test('changeAdminPassword: compare-and-swap against the verified hash, atomic, owner-only', async () => {
  const before = readRecord()
  const lost = await admin.changeAdminPassword('a quiet harbour at dawn', {
    expectedHash: 'f'.repeat(128),
    signOutEverywhere: true,
  })
  assert.deepEqual(lost, { ok: false, reason: 'changed' })
  assert.deepEqual(readRecord(), before, 'nothing written')
  assert.equal(fs.statSync(path.join(tmp, 'data', 'admin.json')).mode & 0o777, 0o600)
})

// ── The route ────────────────────────────────────────────────────────────

test('route: method, session and body shape', async () => {
  const cookie = await signIn(live)
  assert.equal((await call(H.change, { method: 'GET', cookie })).statusCode, 405)
  const anon = await change('', { currentPassword: live, newPassword: 'a quiet harbour at dawn' })
  assert.equal(anon.statusCode, 401)
  assert.equal(anon.body.code, 'NO_SESSION')
  for (const body of [
    null,
    [],
    { currentPassword: live },
    { currentPassword: live, newPassword: 'a quiet harbour at dawn', extra: 1 },
    { currentPassword: live, newPassword: 'a quiet harbour at dawn', signOutOthers: 'yes' },
    { currentPassword: '', newPassword: 'a quiet harbour at dawn' },
    { currentPassword: live, newPassword: 'x'.repeat(1025) },
  ]) {
    const out = await change(cookie, body)
    assert.equal(out.statusCode, 400, JSON.stringify(body))
    assert.equal(out.body.code, 'INVALID_INPUT')
  }
})

test('route: a refused new password changes nothing and costs no lockout attempt', async () => {
  const cookie = await signIn(live)
  const before = readRecord()
  const out = await change(cookie, {
    currentPassword: 'not even checked',
    newPassword: 'Password1234!',
  })
  assert.equal(out.statusCode, 400)
  assert.equal(out.body.code, 'PASSWORD_POLICY')
  assert.deepEqual(out.body.issues, ['predictable'])
  const personal = await change(cookie, {
    currentPassword: live,
    newPassword: 'owner of the quiet harbour',
  })
  assert.deepEqual(personal.body.issues, ['personal'])
  const site = await change(cookie, {
    currentPassword: live,
    newPassword: 'the lucian-dev harbour at dawn',
  })
  assert.deepEqual(site.body.issues, ['personal'])
  const same = await change(cookie, {
    currentPassword: live,
    newPassword: 'Café harbour lantern 0123',
  })
  assert.equal(same.statusCode, 400)
  assert.deepEqual(same.body.issues, ['sameAsCurrent'], 'NFKC-equal to the current password')
  assert.deepEqual(readRecord(), before)
})

test('route: a wrong current password → "incorrect" only, nothing changes, a failure is counted', async () => {
  const cookie = await signIn(live)
  const before = readRecord()
  const failuresBefore =
    store.authFailureSummary().byMethod.find((m) => m.type === 'password-change-failed')?.count ?? 0
  const out = await change(cookie, {
    currentPassword: 'definitely not it',
    newPassword: 'a quiet harbour at dawn',
  })
  assert.equal(out.statusCode, 401)
  assert.deepEqual(out.body, {
    code: 'CURRENT_PASSWORD_INCORRECT',
    error: 'The current password is incorrect.',
  })
  assert.deepEqual(readRecord(), before)
  assert.equal(setCookies(out).length, 0, 'the session is not touched')
  assert.ok(readCtx(cookie), 'still signed in')
  const failures = store
    .authFailureSummary()
    .byMethod.find((m) => m.type === 'password-change-failed')
  assert.equal(failures?.count, failuresBefore + 1)
  assert.ok(
    !store.listAuthEvents(50).some((e) => e.type === 'password-change-failed'),
    'failures stay out of the history list'
  )
})

test('route: success (default: sign out other browsers) — old password out, new in, sessions, history, activity', async () => {
  const other = await signIn(live)
  const cookie = await signIn(live)
  const mine = claimsOf(cookie).sid as string
  const theirs = claimsOf(other).sid as string
  admin.createResetToken()
  assert.equal(readRecord().resets.length, 1)
  const versionBefore = admin.getSessionVersion()
  const next = 'a quiet harbour at dawn, 7 bells'

  const out = await change(cookie, {
    currentPassword: 'Café harbour lantern 0123',
    newPassword: next,
  })
  assert.equal(out.statusCode, 200, JSON.stringify(out.body))
  assert.equal(out.body.ok, true)
  assert.equal(out.body.signedOutOthers, true)
  assert.equal(out.body.signedIn, true)
  assert.ok(out.body.revoked >= 1)
  assert.deepEqual(out.body.bootstrap, { envSet: true, matchesCurrent: false })
  live = next

  const record = readRecord()
  assert.deepEqual(record.resets, [], 'reset links burnt')
  assert.equal(record.passwordNorm, 'NFKC')
  assert.equal(admin.getSessionVersion(), versionBefore + 1)
  assert.equal((await login(PASS)).statusCode, 401, 'the old password no longer signs in')
  assert.equal((await login(next)).statusCode, 200, 'the new one does')

  // This browser: a new session (new row and cookie), verified now; the old token is gone.
  const fresh = sessionCookieOf(out)
  assert.ok(fresh)
  const ctx = readCtx(fresh)
  assert.ok(ctx?.session)
  assert.notEqual(ctx!.session!.id, mine)
  assert.ok(Date.now() - ctx!.session!.verifiedAt < 5000)
  assert.equal(readCtx(cookie), null)
  assert.equal(sessions.getSession(mine)?.revokedReason, 'renewed after password change')
  // The other browser is signed out, with the reason.
  assert.equal(readCtx(other), null)
  assert.equal(sessions.getSession(theirs)?.revokedReason, 'password-changed')
  assert.ok(store.legacyCutoff(), 'tokens from before sessions end too')

  const event = store.listAuthEvents(10).find((e) => e.type === 'password-changed')
  assert.ok(event)
  assert.equal(event!.sessionId, ctx!.session!.id)
  assert.match(String(event!.detail), /other session\(s\) signed out/)
  const [entry] = auditStore.listAudit({ area: 'security' }).entries
  assert.equal(entry.action, 'security.password-change')
  assert.equal(entry.summary, 'Changed the admin password and signed out every other browser')
  assert.equal(entry.sessionId, mine, 'attributed to the browser that made the change')

  // No secret anywhere in the history, the activity log or the record.
  const dump = JSON.stringify({
    audit: auditDb.getAuditDb().prepare('SELECT * FROM audit_log').all(),
    events: authDb.getAuthDb().prepare('SELECT * FROM auth_events').all(),
    failures: authDb.getAuthDb().prepare('SELECT * FROM auth_failures').all(),
    record,
  })
  for (const secret of [next, PASS, 'Café harbour lantern 0123', 'definitely not it']) {
    assert.ok(!dump.includes(secret), `no "${secret}" stored`)
  }
})

test('route: "sign out other browsers" off keeps them, renews only this browser', async () => {
  const other = await signIn(live)
  const cookie = await signIn(live)
  const mine = claimsOf(cookie).sid as string
  const versionBefore = admin.getSessionVersion()
  const next = 'lanterns over the quiet bay 42'
  const out = await change(cookie, {
    currentPassword: live,
    newPassword: next,
    signOutOthers: false,
  })
  assert.equal(out.statusCode, 200)
  assert.equal(out.body.signedOutOthers, false)
  assert.equal(out.body.revoked, 0)
  live = next
  assert.equal(admin.getSessionVersion(), versionBefore, 'no session version bump')
  assert.ok(readCtx(other), 'the other browser stays signed in')
  assert.equal(readCtx(cookie), null, 'the old token of this browser is replaced')
  assert.equal(sessions.getSession(mine)?.revokedReason, 'renewed after password change')
  assert.ok(readCtx(sessionCookieOf(out)))
  const [entry] = auditStore.listAudit({ area: 'security' }).entries
  assert.equal(entry.summary, 'Changed the admin password')
  assert.equal(store.listAuthEvents(1)[0].detail, 'other browsers kept')
})

test('route: normalisation parity with sign-in — a full-width new password signs in typed in ASCII', async () => {
  const cookie = await signIn(live)
  const next = 'Ｑｕｉｅｔ ｈａｒｂｏｕｒ ｎｉｇｈｔｓ 2026'
  const out = await change(cookie, {
    currentPassword: live,
    newPassword: next,
    signOutOthers: false,
  })
  assert.equal(out.statusCode, 200, JSON.stringify(out.body))
  live = next
  assert.equal((await login('Quiet harbour nights 2026')).statusCode, 200)
  assert.equal((await login(next)).statusCode, 200)
  // The current password is checked normalised as well.
  const back = await change(sessionCookieOf(out), {
    currentPassword: 'Quiet harbour nights 2026',
    newPassword: 'evening tide on the old pier',
    signOutOthers: false,
  })
  assert.equal(back.statusCode, 200)
  live = 'evening tide on the old pier'
})

test('route: 10 attempts per 15 minutes per client, then 429 with Retry-After', async () => {
  const cookie = await signIn(live)
  const ip = '198.51.100.77'
  for (let i = 0; i < 10; i++) assert.equal((await change(cookie, {}, ip)).statusCode, 400)
  const out = await change(cookie, {}, ip)
  assert.equal(out.statusCode, 429)
  assert.equal(out.body.code, 'THROTTLED')
  assert.ok(Number(out.headers['retry-after']) > 0)
})

const changeFailures = () =>
  store.authFailureSummary().byMethod.find((m) => m.type === 'password-change-failed')?.count ?? 0

test('route: wrong current passwords share the sign-in lockout of that client; a wait is not counted as a failure', async () => {
  const ip = '198.51.100.88'
  // Two sessions on one network: the lockout is per (e-mail, network), not per session.
  const a = await signIn(live)
  const b = await signIn(live)
  const wrong = (cookie: string, i: number) =>
    change(cookie, { currentPassword: `wrong guess ${i}`, newPassword: 'a quiet harbour at dawn' }, ip)
  const before = changeFailures()
  const statuses: number[] = []
  for (let i = 0; i < 4; i++) statuses.push((await wrong(a, i)).statusCode)
  // The fifth wrong password from that network locks it (and was checked: it counts).
  statuses.push((await wrong(b, 4)).statusCode)
  assert.deepEqual(statuses, [401, 401, 401, 401, 429])
  assert.equal(changeFailures(), before + 5, 'five passwords were checked and wrong')

  // While locked nothing is checked — and nothing is counted as a failed change.
  assert.equal((await wrong(b, 5)).statusCode, 429)
  const locked = await change(b, { currentPassword: live, newPassword: 'a quiet harbour at dawn' }, ip)
  assert.equal(locked.statusCode, 429, 'even the right password waits')
  assert.ok(Number(locked.headers['retry-after']) > 0)
  assert.equal(changeFailures(), before + 5, 'requests turned away by the lockout are not failures')
  assert.ok(readCtx(b), 'waiting does not use up the session’s budget')
  assert.equal(
    (await login(live, ip)).statusCode,
    429,
    'the sign-in form of that client is locked too'
  )
})

test('route: a session that types five wrong current passwords is signed out — from any network', async () => {
  const cookie = await signIn(live)
  const sid = claimsOf(cookie).sid as string
  const guess = (c: string, i: number, ip: string) =>
    change(c, { currentPassword: `stolen guess ${i}`, newPassword: 'a quiet harbour at dawn' }, ip)
  // A new /64 every time (one /48): no network lockout ever applies.
  const statuses: number[] = []
  for (let i = 0; i < pw.WRONG_PASSWORDS_PER_SESSION - 1; i++)
    statuses.push((await guess(cookie, i, `2001:db8:77:${i}::1`)).statusCode)
  assert.deepEqual(statuses, [401, 401, 401, 401])
  const last = await guess(cookie, 4, '2001:db8:77:99::1')
  assert.equal(last.statusCode, 401)
  assert.deepEqual(last.body, {
    code: 'SIGNED_OUT',
    error: 'Too many wrong passwords: this browser was signed out. Sign in again to continue.',
  })
  assert.ok(
    setCookies(last).some((c) => /^cv_admin_token=;/.test(c)),
    'the session cookie is cleared'
  )
  assert.equal(readCtx(cookie), null, 'the session no longer works')
  assert.equal(sessions.getSession(sid)?.revokedReason, 'too many wrong passwords')
  assert.equal((await guess(cookie, 5, '2001:db8:77:100::1')).body.code, 'NO_SESSION')
  const event = store.listAuthEvents(5).find((e) => e.type === 'session-revoked')
  assert.equal(event?.sessionId, sid)
  assert.equal(event?.detail, 'too many wrong passwords')

  // The owner signs in again; a right current password starts the count over.
  const fresh = await signIn(live)
  for (let i = 0; i < 4; i++) await guess(fresh, i, `2001:db8:78:${i}::1`)
  const same = await change(fresh, { currentPassword: live, newPassword: live }, '2001:db8:78:50::1')
  assert.deepEqual(same.body.issues, ['sameAsCurrent'], 'checked, and right')
  for (let i = 0; i < 4; i++)
    assert.equal((await guess(fresh, i, `2001:db8:78:${60 + i}::1`)).statusCode, 401)
  assert.ok(readCtx(fresh), 'still signed in')
})

test('route: wrong passwords in a step-up and in a change share the session’s budget', async () => {
  const cookie = await signIn(live)
  const stepUp = (password: string, ip: string) =>
    call(H.verify, {
      method: 'POST',
      body: { method: 'password', password },
      cookie,
      ip,
      url: '/api/admin/security/verify',
    })
  for (let i = 0; i < 3; i++)
    assert.equal((await stepUp(`step-up guess ${i}`, `2001:db8:79:${i}::1`)).statusCode, 401)
  assert.equal(
    (
      await change(
        cookie,
        { currentPassword: 'change guess 0', newPassword: 'a quiet harbour at dawn' },
        '2001:db8:79:10::1'
      )
    ).statusCode,
    401
  )
  const fifth = await stepUp('step-up guess 4', '2001:db8:79:11::1')
  assert.equal(fifth.statusCode, 401)
  assert.equal(fifth.body.code, 'SIGNED_OUT')
  assert.equal(readCtx(cookie), null)
})

test('route: one IPv6 /48 gets 30 attempts per 15 minutes across its /64s', async () => {
  const cookie = await signIn(live)
  const statuses: number[] = []
  for (let i = 0; i < 31; i++)
    statuses.push((await change(cookie, {}, `2001:db8:48:${i.toString(16)}::1`)).statusCode)
  assert.deepEqual(statuses.slice(0, 30), Array(30).fill(400), 'each /64 is under its own limit')
  assert.equal(statuses[30], 429)
})

test('route: with "Require a passkey" on, a change needs a recent verification (and only then)', async () => {
  const cookie = await signIn(live)
  const db = authDb.getAuthDb()
  db.prepare(
    `INSERT INTO webauthn_credentials (id, public_key, counter, transports, device_type, backed_up, aaguid, name, created_at)
     VALUES ('pw-test-credential', x'00', 0, '[]', 'singleDevice', 0, NULL, 'Test key', ?)`
  ).run(Date.now())
  store.setPasskeyRequired(true)
  try {
    const sid = claimsOf(cookie).sid as string
    db.prepare('UPDATE auth_sessions SET verified_at = ? WHERE id = ?').run(
      Date.now() - 3_600_000,
      sid
    )
    const stale = await change(cookie, {
      currentPassword: live,
      newPassword: 'the late ferry to the islands',
    })
    assert.equal(stale.statusCode, 403)
    assert.equal(stale.body.code, 'STEP_UP_REQUIRED')
    assert.deepEqual(stale.body.methods, ['passkey', 'password'])
    assert.equal(stale.body.recoveryRequired, true)
    // Verified five minutes ago (a passkey step-up): recent enough.
    const stepUpAt = Date.now() - 300_000
    db.prepare('UPDATE auth_sessions SET verified_at = ? WHERE id = ?').run(stepUpAt, sid)
    const ok = await change(cookie, {
      currentPassword: live,
      newPassword: 'the late ferry to the islands',
      signOutOthers: false,
    })
    assert.equal(ok.statusCode, 200)
    live = 'the late ferry to the islands'
    // The password alone proves nothing here: the new session keeps the step-up's time.
    assert.equal(readCtx(sessionCookieOf(ok))?.session?.verifiedAt, stepUpAt)
  } finally {
    store.setPasskeyRequired(false)
    db.prepare(`DELETE FROM webauthn_credentials WHERE id = 'pw-test-credential'`).run()
  }
})

test('GET /api/admin/security: the Password card, and whether ADMIN_PASS still matches (never the value)', async () => {
  const cookie = await signIn(live)
  const out = await call(H.security, { method: 'GET', cookie })
  assert.equal(out.statusCode, 200)
  const p = out.body.password
  assert.equal(p.email, OWNER)
  assert.equal(p.siteHost, 'lucian-dev.example')
  assert.equal(p.minLength, 12)
  assert.equal(p.maxLength, 256)
  assert.ok(p.changedAt > 0)
  assert.deepEqual(p.bootstrap, { envSet: true, matchesCurrent: false })
  assert.ok(!JSON.stringify(out.body).includes(PASS))

  process.env.ADMIN_PASS = live
  try {
    assert.deepEqual(await pw.bootstrapPasswordStatus(), { envSet: true, matchesCurrent: true })
  } finally {
    process.env.ADMIN_PASS = PASS
  }
  delete process.env.ADMIN_PASS
  try {
    assert.deepEqual(await pw.bootstrapPasswordStatus(), { envSet: false, matchesCurrent: null })
  } finally {
    process.env.ADMIN_PASS = PASS
  }
})

test('notice: time, browser and country, what to do — never an address; a mail failure never fails the change', async () => {
  const mail = pw.passwordChangedMail({
    at: Date.UTC(2026, 9, 21, 6, 5),
    device: 'Chrome on macOS',
    country: 'HK',
    signedOutOthers: true,
    revoked: 2,
    site: 'https://lucian-dev.example',
  })
  assert.equal(mail.subject, 'Your admin password on lucian-dev.example was changed')
  assert.match(mail.text, /Wed 21 Oct 2026, 14:05 HKT \(2026-10-21T06:05:00Z\)/)
  assert.match(mail.text, /from Chrome on macOS, Hong Kong/)
  assert.match(mail.text, /Every other browser was signed out \(2 sessions\)/)
  assert.match(mail.text, /https:\/\/lucian-dev\.example\/admin\/forgot/)
  assert.match(mail.text, /Sign out everywhere/)
  assert.doesNotMatch(mail.text, /\d+\.\d+\.\d+\.|::/, 'no network address')
  assert.equal(pw.noticeRecipient(OWNER), OWNER)

  // SMTP configured but unreachable: the change still succeeds.
  Object.assign(process.env, {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '9',
    SMTP_USER: 'mailer@example.test',
    SMTP_PASS: 'not-a-real-secret',
    NOTIFY_EMAIL: 'notify@example.test',
  })
  try {
    assert.equal(pw.noticeRecipient(OWNER), 'notify@example.test')
    const cookie = await signIn(live)
    const out = await change(cookie, {
      currentPassword: live,
      newPassword: 'a lighthouse keeper’s logbook',
      signOutOthers: false,
    })
    assert.equal(out.statusCode, 200)
    live = 'a lighthouse keeper’s logbook'
  } finally {
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'NOTIFY_EMAIL'])
      delete process.env[k]
  }
})

test('the e-mail reset applies the same rules and keeps a refused link usable', async () => {
  const issued = admin.createResetToken()!
  const weak = await call(H.reset, {
    method: 'POST',
    body: { token: issued.token, password: 'Password1234!' },
  })
  assert.equal(weak.statusCode, 400)
  assert.equal(weak.body.code, 'PASSWORD_POLICY')
  assert.deepEqual(weak.body.issues, ['predictable'])
  const ok = await call(H.reset, {
    method: 'POST',
    body: { token: issued.token, password: 'the reset harbour at noon' },
  })
  assert.equal(ok.statusCode, 200, 'the link survived the refusal')
  live = 'the reset harbour at noon'
  assert.equal((await login(live)).statusCode, 200)
})

test('the e-mail reset judges the password only for a live link: no rule answers a made-up token (no e-mail oracle)', async () => {
  admin.ensureAdminFromEnv()
  const before = readRecord()
  const forged = '0'.repeat(48)
  for (const password of [
    // Contains the e-mail's local part ("owner"): the "personal" rule must not answer.
    'kestrel harbour owner lantern 93',
    'alpha bravo owner delta echo',
    // Breaks other rules too: still only "invalid or expired".
    'Password1234!',
    'short',
    '',
  ]) {
    const out = await call(H.reset, { method: 'POST', body: { token: forged, password } })
    assert.equal(out.statusCode, 400, password)
    assert.deepEqual(out.body, { error: 'Invalid or expired token' }, `no rule leaks for "${password}"`)
  }
  // A link that expired is refused the same way.
  const issued = admin.createResetToken()!
  const file = path.join(tmp, 'data', 'admin.json')
  const rec = readRecord()
  rec.resets = rec.resets.map((r: { token: string }) =>
    r.token === issued.token ? { ...r, expires: Date.now() - 1 } : r
  )
  fs.writeFileSync(file, JSON.stringify(rec))
  const expired = await call(H.reset, {
    method: 'POST',
    body: { token: issued.token, password: 'kestrel harbour owner lantern 93' },
  })
  assert.deepEqual(expired.body, { error: 'Invalid or expired token' })
  // The check does not consume anything: a live link still gets the rules, and survives them.
  const live = admin.createResetToken()!
  assert.equal(admin.isLiveResetToken(live.token), true)
  assert.equal(admin.isLiveResetToken(forged), false)
  const personal = await call(H.reset, {
    method: 'POST',
    body: { token: live.token, password: 'kestrel harbour owner lantern 93' },
  })
  assert.equal(personal.body.code, 'PASSWORD_POLICY')
  assert.deepEqual(personal.body.issues, ['personal'])
  assert.equal(admin.isLiveResetToken(live.token), true, 'a refused password keeps the link')
  // Leave the record as it was (the link unused).
  fs.writeFileSync(file, JSON.stringify(before))
})

test('activity log describes the change without the passwords', async () => {
  const { describeAdminWrite } = await import('../lib/audit/describe')
  const d = describeAdminWrite('admin/security/password', {
    method: 'POST',
    query: {},
    body: {
      currentPassword: 'old secret value',
      newPassword: 'new secret value',
      signOutOthers: false,
    },
  })
  assert.deepEqual(d, {
    action: 'security.password-change',
    area: 'security',
    target: null,
    summary: 'Changed the admin password',
  })
  assert.equal(
    describeAdminWrite('admin/security/password', { method: 'GET', query: {}, body: undefined }),
    null
  )
})

test('route: at most 30 current-password checks an hour for the whole site, then everyone waits', async () => {
  // The API limits are process memory shared by every route: start this one from fresh counters.
  const resetApiLimits = () =>
    delete (globalThis as Record<symbol, unknown>)[Symbol.for('lucian-dev.rateLimit.api')]
  resetApiLimits()
  try {
    const cookie = await signIn(live)
    const statuses: number[] = []
    for (let i = 0; i <= pw.SITE_CHECKS_PER_HOUR; i++) {
      // Right current password, same new one: checked, then refused — a fresh network each time.
      const out = await change(cookie, { currentPassword: live, newPassword: live }, `203.0.113.${i + 1}`)
      statuses.push(out.statusCode)
    }
    assert.deepEqual(statuses.slice(0, pw.SITE_CHECKS_PER_HOUR), Array(pw.SITE_CHECKS_PER_HOUR).fill(400))
    assert.equal(statuses[pw.SITE_CHECKS_PER_HOUR], 429)
    // Another session on another network waits too.
    const other = await signIn(live)
    const out = await change(
      other,
      { currentPassword: live, newPassword: 'a quiet harbour at dawn' },
      '203.0.113.200'
    )
    assert.equal(out.statusCode, 429)
    assert.equal(out.body.code, 'THROTTLED')
    assert.ok(Number(out.headers['retry-after']) > 0)
  } finally {
    resetApiLimits()
  }
})
