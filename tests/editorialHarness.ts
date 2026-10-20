/**
 * Shared harness of the admin-editorial tests: a throw-away content store
 * (temp working directory, no R2 / CDN / IndexNow), a signed-in admin
 * session, and a mock req/res pair to drive the real API routes.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CF_API_TOKEN', 'CF_ZONE_ID', 'INDEXNOW_KEY']) {
  delete process.env[k]
}

export type Handler = (req: any, res: any) => unknown

export type CallResult = { statusCode: number; body: any; headers: Record<string, string>; revalidated: string[] }

export function editorialHarness(name: string, secret = `${name}-secret`) {
  process.env.JWT_SECRET = secret
  const originalCwd = process.cwd()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  let sessionId = ''
  let closeDb: (() => void) | null = null
  let closeAuthDb: (() => void) | null = null

  async function setup() {
    process.chdir(tmp)
    fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
    const db = await import('../lib/db')
    // lib/db resolves data/ when it is first loaded: a test that imported it
    // (directly or through a store module) before this point would write to
    // the real data/content.db. Refuse instead.
    if (fs.realpathSync(path.dirname(db.CONTENT_DB_PATH)) !== path.join(fs.realpathSync(tmp), 'data')) {
      process.chdir(originalCwd)
      throw new Error(`lib/db was loaded before the harness moved to ${tmp}; import store modules inside tests`)
    }
    closeDb = db.closeDb
    closeAuthDb = (await import('../lib/adminAuth/db')).closeAuthDb
    const { createSession } = await import('../lib/adminAuth/sessions')
    sessionId = createSession({ method: 'password', ttlMs: 3_600_000, device: null, ipPrefix: null, country: null }).id
  }

  function teardown() {
    closeDb?.()
    closeAuthDb?.()
    process.chdir(originalCwd)
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  async function call(
    handler: Handler,
    opts: { method?: string; query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string>; auth?: boolean; ip?: string } = {},
  ): Promise<CallResult> {
    const token = jwt.sign({ role: 'admin', email: 'owner@example.test', sid: sessionId }, secret, { algorithm: 'HS256' })
    const out: CallResult = { statusCode: 200, body: undefined, headers: {}, revalidated: [] }
    const res: any = {
      get statusCode() {
        return out.statusCode
      },
      set statusCode(c: number) {
        out.statusCode = c
      },
      status(c: number) {
        out.statusCode = c
        return res
      },
      setHeader(k: string, v: unknown) {
        out.headers[k.toLowerCase()] = String(v)
        return res
      },
      getHeader: (k: string) => out.headers[k.toLowerCase()],
      json(b: unknown) {
        out.body = JSON.parse(JSON.stringify(b))
        return res
      },
      send(b: unknown) {
        out.body = b
        return res
      },
      end(payload?: string) {
        if (typeof payload === 'string' && /json/.test(out.headers['content-type'] || '')) out.body = JSON.parse(payload)
        return res
      },
      async revalidate(p: string) {
        out.revalidated.push(p)
      },
    }
    const auth = opts.auth !== false
    await handler(
      {
        method: opts.method || 'GET',
        url: '/api/test',
        query: opts.query || {},
        body: opts.body,
        cookies: auth ? { cv_admin_token: token } : {},
        headers: { ...(auth ? { cookie: `cv_admin_token=${token}` } : {}), ...(opts.headers || {}) },
        // Vary `ip` to stay under the per-client write limits in long scenarios.
        socket: { remoteAddress: opts.ip || '127.0.0.41' },
      },
      res,
    )
    return out
  }

  return { tmp, setup, teardown, call }
}
