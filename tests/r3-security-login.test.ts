/**
 * POST /api/auth/email-login through the real handler: identical answers for
 * unknown email vs wrong password, the known-device cookie, the global
 * throughput cap under pressure, and the per-/48 limit.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const OWNER = 'owner@example.test'
const PASS = 'correct horse battery staple'
process.env.JWT_SECRET = 'r3-security-login-secret-0123456789abcdef'
process.env.ADMIN_EMAIL = OWNER
process.env.ADMIN_PASS = PASS
delete process.env.TRUSTED_PROXY_IPS
delete process.env.TRUST_CLIENT_IP_HEADER

const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-login-'))
type Handler = (req: any, res: any) => Promise<unknown>
let handler: Handler

before(async () => {
  // lib/admin resolves data/admin.json from the cwd at import time.
  process.chdir(tmp)
  handler = (await import('../pages/api/auth/email-login')).default as Handler
})
after(() => {
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

type Out = { statusCode: number; headers: Record<string, string | string[]>; body: any; ms: number }

async function login(email: string, password: string, ip: string, cookie?: string): Promise<Out> {
  const req = {
    method: 'POST',
    url: '/api/auth/email-login',
    body: { email, password },
    headers: { 'cf-connecting-ip': ip, ...(cookie ? { cookie } : {}) },
    socket: { remoteAddress: '127.0.0.1' },
  }
  const out: Out = { statusCode: 200, headers: {}, body: undefined, ms: 0 }
  const res: any = {
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
  }
  const t0 = Date.now()
  await handler(req, res)
  out.ms = Date.now() - t0
  return out
}

const setCookies = (o: Out): string[] => {
  const v = o.headers['set-cookie']
  return Array.isArray(v) ? v : v ? [v] : []
}

let deviceCookie = ''

test('success sets the session, the readable admin hint and a long-lived signed known-device cookie', async () => {
  const ok = await login(OWNER, PASS, '203.0.113.10')
  assert.equal(ok.statusCode, 200)
  const cookies = setCookies(ok)
  assert.ok(cookies.some((c) => c.startsWith('cv_admin_token=')))
  const hint = cookies.find((c) => c.startsWith('cv_admin_hint='))
  assert.ok(hint, 'admin hint cookie set')
  assert.doesNotMatch(hint, /HttpOnly/)
  const device = cookies.find((c) => c.startsWith('cv_known_device='))
  assert.ok(device, 'known-device cookie set')
  assert.match(device, /Max-Age=15552000/)
  assert.match(device, /HttpOnly/)
  assert.match(device, /SameSite=Strict/)
  deviceCookie = device.split(';')[0]
  // A second sign-in from the same browser keeps the device id.
  const again = await login(OWNER, PASS, '203.0.113.10', deviceCookie)
  const id = (c: string) => c.split('=')[1].split('.')[1]
  const renewed = setCookies(again).find((c) => c.startsWith('cv_known_device='))
  assert.ok(renewed)
  assert.equal(id(renewed.split(';')[0]), id(deviceCookie))
})

test('unknown email and wrong password get the same answer', async () => {
  const a = await login('nobody@example.test', 'whatever', '203.0.113.20')
  const b = await login(OWNER, 'wrong password', '203.0.113.21')
  assert.equal(a.statusCode, 401)
  assert.deepEqual([a.statusCode, a.body], [b.statusCode, b.body])
  assert.equal(setCookies(a).length, 0)
})

test('IPv6: one /48 shares a budget across its /64s', async () => {
  const statuses: number[] = []
  // 3 × 10 per 5 min for the /48; each /64 alone stays under its own limit.
  for (let i = 0; i < 31; i++) {
    const r = await login(`x${i}@example.test`, 'nope', `2001:db8:77:${i.toString(16)}::1`)
    statuses.push(r.statusCode)
  }
  assert.equal(statuses.filter((s) => s === 429).length >= 1, true, String(statuses))
  assert.equal(statuses[0], 401)
})

test('under pressure: unknown devices are serialised and spaced, known devices skip the queue', async () => {
  // Push site-wide failures past the slowdown threshold (distinct IPv4 clients).
  const { loginPressure } = await import('../lib/admin')
  for (let i = 1; !loginPressure().underAttack && i < 200; i++) await login(`warm${i}@example.test`, 'nope', `198.51.100.${i}`)
  assert.equal(loginPressure().underAttack, true)

  const t0 = Date.now()
  const queued = [1, 2, 3].map((i) => login(`q${i}@example.test`, 'nope', `192.0.2.${i}`))
  const owner = await login(OWNER, PASS, '192.0.2.200', deviceCookie)
  const ownerAt = Date.now() - t0
  const results = await Promise.all(queued)
  const total = Date.now() - t0

  assert.equal(owner.statusCode, 200)
  assert.ok(results.every((r) => r.statusCode === 401), results.map((r) => r.statusCode).join())
  // ≥ 0.5 s between queued checks: 3 checks need at least two gaps.
  assert.ok(total >= 1000, `queued checks were spaced (${total} ms)`)
  assert.ok(ownerAt < total, `known device answered before the queue drained (${ownerAt} < ${total} ms)`)

  // Without the cookie the owner waits in the same queue (still succeeds).
  const slow = await login(OWNER, PASS, '192.0.2.201')
  assert.equal(slow.statusCode, 200)
})
