/**
 * VIS-2 / S3: every successful CV write (PUT, restore, import, versions
 * restore) and home write (PUT, restore, versions restore) regenerates the
 * ISR pages that render that data (CV_STATIC_PATHS / HOME_STATIC_PATHS) and
 * reports them; the version ETag survives untouched. Server-rendered pages
 * (/, /about, /contact) are always fresh and never listed; /cv and /cv/zh
 * are ISR (lib/cvPage.ts) and regenerate on CV and home writes (G1).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'r3-cvadmin-revalidate-secret'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-cvadmin-'))
type Handler = (req: any, res: any) => unknown
let cvdata: Handler, home: Handler, versions: Handler
let closeDb: () => void
let CV_PATHS: readonly string[] = []
let HOME_PATHS: readonly string[] = []
const SSR_PATHS = ['/', '/about', '/contact']
const CV_PAGES = ['/cv', '/cv/zh']

type MockRes = { statusCode: number; headers: Record<string, string>; body: any; revalidated: string[] }

async function call(
  handler: Handler,
  opts: { method?: string; query?: Record<string, any>; body?: any; failRevalidate?: boolean } = {},
): Promise<MockRes> {
  const token = jwt.sign({ role: 'admin', email: 'owner@example.test' }, 'r3-cvadmin-revalidate-secret', { algorithm: 'HS256' })
  const req = {
    method: opts.method || 'GET',
    query: opts.query || {},
    body: opts.body,
    cookies: { cv_admin_token: token },
    headers: { cookie: `cv_admin_token=${token}` },
    socket: { remoteAddress: '127.0.0.1' },
  }
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined, revalidated: [] }
  const res: any = {
    get statusCode() { return out.statusCode },
    set statusCode(code: number) { out.statusCode = code },
    status(code: number) { out.statusCode = code; return res },
    setHeader(name: string, value: any) { out.headers[name.toLowerCase()] = String(value); return res },
    getHeader(name: string) { return out.headers[name.toLowerCase()] },
    json(body: any) { out.body = JSON.parse(JSON.stringify(body)); return res },
    send(body: any) { out.body = body; return res },
    end(payload?: string) {
      if (typeof payload === 'string' && /json/.test(out.headers['content-type'] || '')) out.body = JSON.parse(payload)
      return res
    },
    async revalidate(p: string) {
      if (opts.failRevalidate) throw new Error('revalidation unavailable')
      out.revalidated.push(p)
    },
  }
  await handler(req, res)
  return out
}

const cv = (company: string) => ({
  en: [{ sessionName: 'workExperience', experiences: [{ companyName: company, startDate: '2024-01' }] }],
  zh: [{ sessionName: 'workExperience', experiences: [{ companyName: company, startDate: '2024-01' }] }],
})

const homeDoc = (coding: string) => ({
  hero: { welcome: '', brand: 'B', tagline: 't', avatarUrl: '', currentlyCoding: coding },
  socials: {},
  brands: [],
})

function assertRevalidated(r: MockRes, label: string, paths: readonly string[]) {
  assert.equal(r.statusCode, 200, label)
  // Each page is regenerated twice (lib/revalidate `confirm`): once, then again after that render finished.
  assert.deepEqual([...new Set(r.revalidated)].sort(), [...paths].sort(), `${label}: ISR pages regenerated`)
  for (const p of paths) assert.equal(r.revalidated.filter((x) => x === p).length, 2, `${label}: ${p} confirmed by a second render`)
  assert.deepEqual([...r.body.revalidated].sort(), [...paths].sort(), `${label}: reported`)
  assert.equal(r.body.revalidateFailed, undefined, label)
  assert.match(r.body.etag, /^"\d+"$/, label)
  assert.equal(r.headers.etag, r.body.etag, `${label}: version ETag kept`)
}

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  const cvMod = await import('../pages/api/cvdata')
  const homeMod = await import('../pages/api/home')
  cvdata = cvMod.default
  home = homeMod.default
  CV_PATHS = cvMod.CV_STATIC_PATHS
  HOME_PATHS = homeMod.HOME_STATIC_PATHS
  versions = (await import('../pages/api/versions')).default
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('the path lists hold only ISR pages that render CV / home data', () => {
  assert.ok(CV_PATHS.includes('/now'), 'CV: /now renders public CV sections')
  assert.ok(HOME_PATHS.includes('/now'), 'home: /now renders hero.currentlyCoding')
  for (const p of CV_PAGES) {
    assert.ok(CV_PATHS.includes(p), `CV: ${p} renders the CV`)
    assert.ok(HOME_PATHS.includes(p), `home: ${p} renders the socials and the portrait`)
  }
  for (const p of SSR_PATHS) {
    assert.ok(!CV_PATHS.includes(p), `CV list must not contain the SSR page ${p}`)
    assert.ok(!HOME_PATHS.includes(p), `home list must not contain the SSR page ${p}`)
  }
})

test('CV PUT, import and restore regenerate the CV ISR pages', async () => {
  assertRevalidated(await call(cvdata, { method: 'PUT', body: cv('First Co') }), 'PUT', CV_PATHS)

  const unchanged = await call(cvdata, { method: 'PUT', body: cv('First Co') })
  assert.equal(unchanged.body.unchanged, true)
  assert.deepEqual(unchanged.revalidated, [], 'no write, nothing to regenerate')

  const snap = await call(cvdata, { method: 'POST', body: { action: 'snapshot' } })
  assert.equal(snap.statusCode, 200)
  assertRevalidated(await call(cvdata, { method: 'POST', body: { action: 'import', data: cv('Imported Co') } }), 'import', CV_PATHS)
  assertRevalidated(await call(cvdata, { method: 'POST', body: { action: 'restore', filename: snap.body.file } }), 'restore', CV_PATHS)

  const failedImport = await call(cvdata, { method: 'POST', body: { action: 'import', data: 'not json' } })
  assert.equal(failedImport.statusCode, 400)
  assert.deepEqual(failedImport.revalidated, [], 'a rejected write regenerates nothing')
})

test('a failed revalidation is reported without failing the save', async () => {
  const r = await call(cvdata, { method: 'PUT', body: cv('Second Co'), failRevalidate: true })
  assert.equal(r.statusCode, 200)
  assert.equal(r.body.ok, true)
  assert.deepEqual(r.body.revalidated, [])
  assert.deepEqual([...r.body.revalidateFailed].sort(), [...CV_PATHS].sort())
  assert.equal(r.headers.etag, r.body.etag)
})

test('home PUT and restore regenerate the home ISR pages', async () => {
  assertRevalidated(await call(home, { method: 'PUT', body: homeDoc('lucian-dev') }), 'home PUT', HOME_PATHS)
  const snap = await call(home, { method: 'POST', body: { action: 'snapshot' } })
  await call(home, { method: 'PUT', body: homeDoc('') })
  assertRevalidated(await call(home, { method: 'POST', body: { action: 'restore', filename: snap.body.file } }), 'home restore', HOME_PATHS)
})

test('versions restore regenerates /now for CV and home', async () => {
  for (const type of ['cv', 'home'] as const) {
    const snap = await call(versions, { method: 'POST', query: { type }, body: { action: 'snapshot' } })
    assert.equal(snap.statusCode, 200)
    // pages/api/versions.ts keeps its own list (authoring stream); it must
    // at least refresh /now and report exactly what it refreshed.
    const r = await call(versions, { method: 'POST', query: { type }, body: { action: 'restore', filename: snap.body.file } })
    assert.equal(r.statusCode, 200, `versions ${type}`)
    assert.ok(r.revalidated.includes('/now'), `versions ${type}: /now regenerated`)
    for (const p of CV_PAGES) assert.ok(r.revalidated.includes(p), `versions ${type}: ${p} regenerated`)
    assert.deepEqual([...r.body.revalidated].sort(), [...new Set(r.revalidated)].sort(), `versions ${type}: reported`)
    assert.equal(r.headers.etag, r.body.etag, `versions ${type}: version ETag kept`)
  }
  const missing = await call(versions, { method: 'POST', query: { type: 'cv' }, body: { action: 'restore', filename: 'cv_2000-01-01_00-00-00-000.json' } })
  assert.notEqual(missing.statusCode, 200)
  assert.deepEqual(missing.revalidated, [])
})
