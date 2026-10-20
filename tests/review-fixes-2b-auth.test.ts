/**
 * SECU-3 (wave 2B review) — the admin gate fails closed on an unreadable
 * data/admin.json. readAdmin() answered null for ANY read error, so the
 * session version silently became 0 whenever the file could not be read or
 * parsed (EACCES, EIO, a bad bind mount, a truncated write): a token revoked
 * by "Sign out everywhere" (sv 0 after a bump to 1) passed the gate and
 * every /api/admin route again, and the next sign-in attempt re-created the
 * record from the environment over the unreadable one (version 0 again).
 *
 * Now: an admin.json that exists but cannot be read or parsed answers
 * `unavailable` at the gate, no session in lib/auth, and is never
 * overwritten by the bootstrap; a genuinely missing admin.json (first boot,
 * before the bootstrap from ADMIN_EMAIL / ADMIN_PASS) behaves as before.
 * Runs against real data/admin.json + data/auth.db in a temp directory.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SECRET = 'review-fixes-2b-auth-secret-0123456789abc'
process.env.JWT_SECRET = SECRET
process.env.ADMIN_EMAIL = 'owner@example.test'
process.env.ADMIN_PASS = 'review-fixes-2b auth test password'

const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf2b-auth-'))
const adminFile = path.join(tmp, 'data', 'admin.json')

let gate: typeof import('../lib/adminAuth/proxyGate')
let sessions: typeof import('../lib/adminAuth/sessions')
let admin: typeof import('../lib/admin')
let auth: typeof import('../lib/auth')
let authDb: typeof import('../lib/adminAuth/db')

before(async () => {
  // lib/admin resolves data/admin.json from the cwd at import time.
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  gate = await import('../lib/adminAuth/proxyGate')
  sessions = await import('../lib/adminAuth/sessions')
  admin = await import('../lib/admin')
  auth = await import('../lib/auth')
  authDb = await import('../lib/adminAuth/db')
})
after(() => {
  authDb.closeAuthDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** A live session row and a token bound to it, minted the way sign-in does (lib/auth.ts). */
function signIn(): string {
  const s = sessions.createSession({ method: 'password', ttlMs: 3_600_000, device: null, ipPrefix: null, country: null })
  return auth.signAdminToken('owner@example.test', { sid: s.id, amr: ['pwd'] })
}

/** lib/auth's check inside every /api/admin route, for a request carrying `token`. */
function apiSession(token: string) {
  const headers: Record<string, string> = { cookie: `cv_admin_token=${token}` }
  const res = { getHeader: () => undefined, setHeader: () => undefined } as never
  return auth.readAdminContext({ headers, cookies: { cv_admin_token: token } } as never, res)
}

test('a missing admin.json (first boot, before the bootstrap) keeps today\'s behaviour: version 0', async () => {
  assert.equal(fs.existsSync(adminFile), false)
  assert.equal(admin.getSessionVersion(), 0)
  assert.equal(admin.currentSessionVersion(), 0)
  const token = signIn()
  assert.equal(await gate.verifyAdminToken(token), 'ok')
  assert.ok(apiSession(token))
})

test('an admin.json that cannot be read or parsed fails closed: the gate answers unavailable, the API has no session, the bootstrap leaves it alone', async () => {
  admin.ensureAdminFromEnv()
  const before = signIn() // sv 0
  assert.equal(admin.bumpSessionVersion(), 1, '"Sign out everywhere"')
  assert.equal(await gate.verifyAdminToken(before), 'revoked')
  const current = signIn() // sv 1
  assert.equal(await gate.verifyAdminToken(current), 'ok')
  const good = fs.readFileSync(adminFile, 'utf8')

  const broken: Array<[string, () => void]> = [
    ['truncated JSON', () => fs.writeFileSync(adminFile, good.slice(0, 20))],
    ['not an object', () => fs.writeFileSync(adminFile, '[]')],
    ['a directory in its place (EISDIR)', () => {
      fs.rmSync(adminFile)
      fs.mkdirSync(adminFile)
    }],
  ]
  // Unreadable permissions only bite a non-root user (CI containers may run as root).
  if (typeof process.getuid === 'function' && process.getuid() !== 0)
    broken.push(['no read permission (EACCES)', () => {
      fs.writeFileSync(adminFile, good)
      fs.chmodSync(adminFile, 0o000)
    }])

  for (const [label, breakIt] of broken) {
    breakIt()
    assert.throws(() => admin.currentSessionVersion(), Error, `${label}: the version is unknown, not 0`)
    assert.equal(await gate.verifyAdminToken(before), 'unavailable', `${label}: a revoked (sv 0) token`)
    assert.equal(await gate.verifyAdminToken(current), 'unavailable', `${label}: a current token`)
    assert.equal(apiSession(before), null, `${label}: no API session for the revoked token`)
    assert.equal(apiSession(current), null, `${label}: no API session while the version is unknown`)
    // A sign-in attempt does not re-create the record over the unreadable one (which would reset the version to 0).
    assert.equal(admin.ensureAdminFromEnv(), null, `${label}: no bootstrap over an existing file`)
    const outcome = await admin.verifyCredentials('owner@example.test', 'review-fixes-2b auth test password', 'test-client')
    assert.equal(outcome.ok, false, `${label}: no sign-in while the record is unreadable`)
    // Restore.
    const st = fs.statSync(adminFile)
    if (st.isDirectory()) fs.rmSync(adminFile, { recursive: true })
    else fs.chmodSync(adminFile, 0o600)
    fs.writeFileSync(adminFile, good)
    assert.equal(await gate.verifyAdminToken(current), 'ok', `${label}: readable again`)
    assert.equal(await gate.verifyAdminToken(before), 'revoked', `${label}: the revocation holds`)
  }
})
