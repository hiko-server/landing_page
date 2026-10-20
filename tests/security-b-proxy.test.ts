/**
 * security-b / NEXT16-proxy — proxy.ts (Next 16's Node.js-runtime proxy):
 *   - the admin gate checks revocation, not just the signature: a token whose
 *     session version was bumped, or whose auth.db session row was revoked or
 *     expired, can no longer load an admin page or call an admin API;
 *   - verifyAdminToken's verdicts (algorithm pinned, role, sid shape, fail
 *     closed when the stores cannot be read);
 *   - every response it produces carries the full header set; CSRF refusals
 *     and the public admin routes behave as before.
 * Runs against real data/admin.json + data/auth.db in a temp directory.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import jwt from 'jsonwebtoken'

// `next` has no package "exports": map the extensionless `next/server` that proxy.ts imports.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier === 'next/server') return next('next/server.js', context)
        return next(specifier, context)
      }
    `),
  import.meta.url,
)

const SECRET = 'security-b-proxy-secret-0123456789abcdef'
process.env.JWT_SECRET = SECRET
process.env.ADMIN_EMAIL = 'owner@example.test'
process.env.ADMIN_PASS = 'security-b proxy test password'
delete process.env.SITE_URL
delete process.env.NEXT_PUBLIC_SITE_HOST

const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'security-b-proxy-'))

type ProxyMod = typeof import('../proxy')
let proxyMod: ProxyMod
let NextRequestCtor: typeof import('next/server').NextRequest
let gate: typeof import('../lib/adminAuth/proxyGate')
let sessions: typeof import('../lib/adminAuth/sessions')
let admin: typeof import('../lib/admin')
let auth: typeof import('../lib/auth')
let authDb: typeof import('../lib/adminAuth/db')
let responseHeaders: typeof import('../lib/security/responseHeaders')

before(async () => {
  // lib/admin resolves data/admin.json from the cwd at import time.
  process.chdir(tmp)
  NextRequestCtor = (await import('next/server.js')).NextRequest as typeof NextRequestCtor
  proxyMod = await import('../proxy')
  gate = await import('../lib/adminAuth/proxyGate')
  sessions = await import('../lib/adminAuth/sessions')
  admin = await import('../lib/admin')
  auth = await import('../lib/auth')
  authDb = await import('../lib/adminAuth/db')
  responseHeaders = await import('../lib/security/responseHeaders')
  admin.ensureAdminFromEnv()
})
after(() => {
  authDb.closeAuthDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

function req(url: string, init: { method?: string; headers?: Record<string, string>; token?: string } = {}) {
  const u = new URL(url)
  const headers: Record<string, string> = { host: u.host, ...(init.headers || {}) }
  if (init.token) headers.cookie = `cv_admin_token=${init.token}`
  return new NextRequestCtor(url, { method: init.method || 'GET', headers })
}

/** A live session row and a token bound to it, minted the way sign-in does (lib/auth.ts). */
function signIn(): { token: string; sid: string } {
  const s = sessions.createSession({ method: 'password', ttlMs: 3_600_000, device: null, ipPrefix: null, country: null })
  return { token: auth.signAdminToken('owner@example.test', { sid: s.id, amr: ['pwd'] }), sid: s.id }
}

const passes = (res: Response) => res.headers.get('x-middleware-next') === '1'

test('a live session passes the gate; revoking that browser locks it out of pages and APIs', async () => {
  const { token, sid } = signIn()
  assert.ok(passes(await proxyMod.proxy(req('https://lucian-dev.com/admin/system', { token }))))
  assert.ok(passes(await proxyMod.proxy(req('https://lucian-dev.com/api/admin/inbox', { token }))))

  assert.equal(sessions.revokeSession(sid, 'signed out from another browser'), true)
  const page = await proxyMod.proxy(req('https://lucian-dev.com/admin/system?view=errors', { token }))
  assert.equal(page.status, 307)
  const loc = new URL(page.headers.get('location') || '')
  assert.equal(loc.pathname, '/admin/login')
  assert.equal(loc.searchParams.get('next'), '/admin/system?view=errors')
  assert.equal(page.headers.get('cache-control'), 'no-store, max-age=0, must-revalidate')
  assert.ok(page.headers.get('content-security-policy'))

  const api = await proxyMod.proxy(req('https://lucian-dev.com/api/admin/inbox', { token }))
  assert.equal(api.status, 401)
  assert.deepEqual(await api.json(), { error: 'Unauthorized', code: 'NO_SESSION' })
})

test('"Sign out everywhere" (session version bump) locks out every outstanding token', async () => {
  const a = signIn()
  const legacy = auth.signAdminToken('owner@example.test') // minted before sessions existed: no sid
  assert.ok(passes(await proxyMod.proxy(req('https://lucian-dev.com/admin', { token: a.token }))))
  assert.ok(passes(await proxyMod.proxy(req('https://lucian-dev.com/admin', { token: legacy }))), 'a legacy token passes on its version')

  admin.bumpSessionVersion()
  for (const token of [a.token, legacy]) {
    assert.equal((await proxyMod.proxy(req('https://lucian-dev.com/admin', { token }))).status, 307)
    assert.equal((await proxyMod.proxy(req('https://lucian-dev.com/api/admin/system', { token }))).status, 401)
  }
  // A sign-in after the bump works again.
  assert.ok(passes(await proxyMod.proxy(req('https://lucian-dev.com/admin', { token: signIn().token }))))
})

test('an expired session row is refused even while its token is unexpired', async () => {
  const s = sessions.createSession({ method: 'password', ttlMs: 1, device: null, ipPrefix: null, country: null }, Date.now() - 10_000)
  const token = auth.signAdminToken('owner@example.test', { sid: s.id })
  assert.equal(await gate.verifyAdminToken(token), 'revoked')
})

test('the public admin routes stay reachable without a session', async () => {
  for (const url of [
    'https://lucian-dev.com/admin/login',
    'https://lucian-dev.com/admin/forgot',
    'https://lucian-dev.com/admin/reset',
    'https://lucian-dev.com/api/admin/session',
    'https://lucian-dev.com/api/admin/draft?disable=1&path=/blog/x',
  ]) {
    const res = await proxyMod.proxy(req(url))
    assert.ok(passes(res), url)
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive', url)
  }
  const out = await proxyMod.proxy(req('https://lucian-dev.com/api/admin/logout', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } }))
  assert.ok(passes(out))
  const guest = await proxyMod.proxy(req('https://lucian-dev.com/admin'))
  assert.equal(new URL(guest.headers.get('location') || '').searchParams.get('next'), '/admin')
})

// ── verifyAdminToken ───────────────────────────────────────────────────────

const deps = (over: Partial<import('../lib/adminAuth/proxyGate').AdminGateDeps> = {}) => ({
  secret: SECRET,
  sessionVersion: () => 3,
  isLiveSession: (sid: string) => sid === 'A'.repeat(22),
  legacyEnded: () => false,
  ...over,
})
const sign = (payload: Record<string, unknown>, opts: jwt.SignOptions = {}) =>
  jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn: 600, ...opts })

test('verifyAdminToken: signature, algorithm, expiry, role, sid shape, version and row', async () => {
  const v = (token: string | undefined, over = {}) => gate.verifyAdminToken(token, deps(over))
  const live = { role: 'admin', sv: 3, sid: 'A'.repeat(22) }
  assert.equal(await v(sign(live)), 'ok')
  assert.equal(await v(sign({ role: 'admin', sv: 3 })), 'ok', 'legacy token without sid')
  assert.equal(await v(sign({ role: 'admin', sv: 3 }), { legacyEnded: () => true }), 'revoked', 'a sid-less token is refused once the owner signed a browser out (legacy_cutoff)')
  assert.equal(await v(sign(live), { legacyEnded: () => true }), 'ok', 'the cutoff never touches a token with a session row')
  assert.equal(await v(undefined), 'missing')
  assert.equal(await v(''), 'missing')
  assert.equal(await v(sign(live), { secret: undefined }), 'invalid', 'no secret configured')
  assert.equal(await v(sign(live), { secret: 'change-me' }), 'invalid', 'placeholder secret')
  assert.equal(await v(jwt.sign(live, 'another-secret-0123456789abcdef', { algorithm: 'HS256' })), 'invalid', 'wrong key')
  assert.equal(await v(jwt.sign(live, SECRET, { algorithm: 'HS512' })), 'invalid', 'algorithm pinned to HS256')
  const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(live)).toString('base64url')}.`
  assert.equal(await v(unsigned), 'invalid', 'alg none')
  const expired = jwt.sign({ ...live, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET, { algorithm: 'HS256' })
  assert.equal(await v(expired), 'invalid', 'expired')
  assert.equal(await v(sign({ ...live, role: 'editor' })), 'invalid', 'not the admin role')
  assert.equal(await v(sign({ ...live, sid: 42 })), 'invalid', 'sid of the wrong type')
  assert.equal(await v(sign({ ...live, sid: '../../etc' })), 'invalid', 'sid of the wrong shape')
  assert.equal(await v(sign({ ...live, sv: 2 })), 'revoked', 'old session version')
  assert.equal(await v(sign({ role: 'admin', sid: 'A'.repeat(22) })), 'revoked', 'no sv counts as version 0')
  assert.equal(await v(sign({ ...live, sid: 'B'.repeat(22) })), 'revoked', 'revoked or unknown row')
  assert.equal(
    await v(sign(live), { isLiveSession: () => { throw new Error('SQLITE_CORRUPT') } }),
    'unavailable',
    'auth.db unreadable: fail closed',
  )
  assert.equal(
    await v(sign(live), { sessionVersion: () => { throw new Error('EACCES') } }),
    'unavailable',
    'admin.json unreadable: fail closed',
  )
  assert.equal(await v('not.a.jwt'), 'invalid')
})

// ── headers and CSRF on proxy responses ────────────────────────────────────

test('every proxy response carries the CSP with the script hashes, Trusted Types report-only and CORP by path', async () => {
  const pageRes = await proxyMod.proxy(req('https://lucian-dev.com/blog/x'))
  assert.equal(pageRes.headers.get('content-security-policy'), responseHeaders.contentSecurityPolicy())
  assert.match(pageRes.headers.get('content-security-policy') || '', /script-src 'self'( 'sha256-[A-Za-z0-9+/]{43}='){4};/)
  assert.match(pageRes.headers.get('content-security-policy-report-only') || '', /^require-trusted-types-for 'script'; /)
  assert.equal(pageRes.headers.get('reporting-endpoints'), 'csp="/api/e"')
  assert.equal(pageRes.headers.get('cross-origin-opener-policy'), 'same-origin')
  assert.equal(pageRes.headers.get('cross-origin-resource-policy'), 'same-origin')
  assert.equal(pageRes.headers.get('cache-control'), null)
  const upload = await proxyMod.proxy(req('https://lucian-dev.com/uploads/a.webp'))
  assert.equal(upload.headers.get('cross-origin-resource-policy'), 'cross-origin')
  const og = await proxyMod.proxy(req('https://lucian-dev.com/api/og?card=about'))
  assert.equal(og.headers.get('cross-origin-resource-policy'), 'cross-origin')
  const legacyCv = await proxyMod.proxy(req('https://lucian-dev.com/cv?lang=zh'))
  assert.equal(legacyCv.status, 308)
  assert.equal(legacyCv.headers.get('cross-origin-opener-policy'), 'same-origin')
})

test('CSRF: cross-site writes get 403, form bodies 415 — with the security headers', async () => {
  const cross = await proxyMod.proxy(
    req('https://lucian-dev.com/api/admin/inbox', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' } }),
  )
  assert.equal(cross.status, 403)
  assert.ok(cross.headers.get('content-security-policy'))
  const form = await proxyMod.proxy(
    req('https://lucian-dev.com/api/auth/email-login', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded' } }),
  )
  assert.equal(form.status, 415)
  // Public, non-protected writes are not the proxy's business.
  assert.ok(passes(await proxyMod.proxy(req('https://lucian-dev.com/api/e', { method: 'POST', headers: { origin: 'https://evil.example' } }))))
})

test('proxy.ts is the Next 16 file convention: a `proxy` export, no `middleware` file, no runtime option', () => {
  const root = path.join(import.meta.dirname, '..')
  assert.equal(fs.existsSync(path.join(root, 'middleware.ts')), false)
  assert.equal(typeof proxyMod.proxy, 'function')
  const code = fs.readFileSync(path.join(root, 'proxy.ts'), 'utf8')
  // Next 16 throws on a `runtime` option in proxy files (it always runs on Node.js).
  assert.doesNotMatch(code, /runtime\s*:/)
  assert.doesNotMatch(code, /export (async )?function middleware\b/)
})
