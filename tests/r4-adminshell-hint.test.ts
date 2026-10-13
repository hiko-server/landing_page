/**
 * S3 hint cookie: `cv_admin_hint=1` (readable, grants nothing) is set next to
 * the session cookie on sign-in, re-set by a valid session check, and cleared
 * (Max-Age=0) on logout, password reset and an invalid session check. The
 * admin account is provisioned from ADMIN_EMAIL / ADMIN_PASS in a throw-away
 * working directory, as in r3-security-login.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const OWNER = 'owner@example.test'
const PASS = 'hint cookie test passphrase'
process.env.JWT_SECRET = 'r4-adminshell-hint-secret-0123456789abcdef'
process.env.ADMIN_EMAIL = OWNER
process.env.ADMIN_PASS = PASS
delete process.env.TRUSTED_PROXY_IPS
delete process.env.TRUST_CLIENT_IP_HEADER

const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-hint-'))
type Handler = (req: any, res: any) => Promise<unknown> | unknown
let login: Handler, session: Handler, logout: Handler, reset: Handler
let auth: typeof import('../lib/auth')

before(async () => {
  process.chdir(tmp)
  login = (await import('../pages/api/auth/email-login')).default as Handler
  session = (await import('../pages/api/admin/session')).default as Handler
  logout = (await import('../pages/api/admin/logout')).default as Handler
  reset = (await import('../pages/api/auth/reset-password')).default as Handler
  auth = await import('../lib/auth')
})
after(() => {
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

type Out = { statusCode: number; headers: Record<string, string | string[]>; body: any; draftMode?: boolean }

async function call(handler: Handler, opts: { method: string; body?: unknown; cookie?: string; ip?: string }): Promise<Out> {
  const req = {
    method: opts.method,
    url: '/api/test',
    query: {},
    body: opts.body,
    headers: { 'cf-connecting-ip': opts.ip || '203.0.113.50', ...(opts.cookie ? { cookie: opts.cookie } : {}) },
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
    setDraftMode({ enable }: { enable: boolean }) {
      out.draftMode = enable
      return res
    },
  }
  await handler(req, res)
  return out
}

const cookies = (o: Out): string[] => {
  const v = o.headers['set-cookie']
  return Array.isArray(v) ? v : v ? [v] : []
}
const hintOf = (o: Out) => cookies(o).find((c) => c.startsWith(`${auth.ADMIN_HINT_COOKIE}=`))

test('the constant is the shared cookie name', () => {
  assert.equal(auth.ADMIN_HINT_COOKIE, 'cv_admin_hint')
})

let sessionCookie = ''

test('sign-in sets the httpOnly session cookie and the readable hint cookie', async () => {
  const ok = await call(login, { method: 'POST', body: { email: OWNER, password: PASS } })
  assert.equal(ok.statusCode, 200)
  const token = cookies(ok).find((c) => c.startsWith('cv_admin_token='))
  assert.ok(token, 'session cookie set')
  assert.match(token, /HttpOnly/)
  const hint = hintOf(ok)
  assert.ok(hint, 'hint cookie set')
  assert.match(hint, /^cv_admin_hint=1;/)
  assert.match(hint, /Path=\//)
  assert.match(hint, /SameSite=Lax/)
  assert.match(hint, new RegExp(`Max-Age=${auth.ADMIN_SESSION_TTL_S}`))
  assert.doesNotMatch(hint, /HttpOnly/, 'readable from JS')
  sessionCookie = token.split(';')[0]
})

test('a failed sign-in sets no cookies at all', async () => {
  const bad = await call(login, { method: 'POST', body: { email: OWNER, password: 'wrong' }, ip: '203.0.113.51' })
  assert.equal(bad.statusCode, 401)
  assert.equal(cookies(bad).length, 0)
})

test('a valid session check re-sets the hint; an invalid one clears it; anonymous visitors get no cookie', async () => {
  const valid = await call(session, { method: 'GET', cookie: sessionCookie })
  assert.deepEqual(valid.body, { authenticated: true })
  assert.match(hintOf(valid) || '', /^cv_admin_hint=1;/)

  const stale = await call(session, { method: 'GET', cookie: 'cv_admin_token=forged; cv_admin_hint=1' })
  assert.deepEqual(stale.body, { authenticated: false })
  assert.match(hintOf(stale) || '', /^cv_admin_hint=;.*Max-Age=0/)

  const anonymous = await call(session, { method: 'GET' })
  assert.deepEqual(anonymous.body, { authenticated: false })
  assert.equal(cookies(anonymous).length, 0)
})

test('logout clears the hint cookie', async () => {
  const out = await call(logout, { method: 'POST', cookie: `${sessionCookie}; cv_admin_hint=1` })
  assert.equal(out.statusCode, 200)
  assert.match(hintOf(out) || '', /^cv_admin_hint=;.*Max-Age=0/)
})

test('logout also ends Draft Mode, with or without a valid session', async () => {
  const signedIn = await call(logout, { method: 'POST', cookie: `${sessionCookie}; __prerender_bypass=x` })
  assert.equal(signedIn.draftMode, false)
  const stale = await call(logout, { method: 'POST', cookie: '__prerender_bypass=x' })
  assert.equal(stale.statusCode, 200)
  assert.equal(stale.draftMode, false)
})

test('a successful password reset clears the hint cookie', async () => {
  const { createResetToken } = await import('../lib/admin')
  const created = createResetToken()
  assert.ok(created, 'reset token issued')
  const out = await call(reset, { method: 'POST', body: { token: created.token, password: 'a brand new passphrase' } })
  assert.equal(out.statusCode, 200)
  assert.match(hintOf(out) || '', /^cv_admin_hint=;.*Max-Age=0/)
})
