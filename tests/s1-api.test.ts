/**
 * HTTP contracts A–D (admin full-document GETs with ETags, public-only GETs,
 * If-Match on PUT) exercised through the real route handlers against a
 * throw-away SQLite file in a temp working directory. R2 and SMTP disabled.
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
process.env.JWT_SECRET = 's1-api-test-secret'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's1-api-'))
type Handler = (req: any, res: any) => unknown
let cvdata: Handler, home: Handler, adminCv: Handler, adminHome: Handler, versions: Handler, derived: Handler
let closeDb: () => void

const adminToken = () => jwt.sign({ role: 'admin', email: 'owner@example.test' }, 's1-api-test-secret', { algorithm: 'HS256' })

type MockRes = { statusCode: number; headers: Record<string, string>; body: any }

async function call(
  handler: Handler,
  opts: { method?: string; query?: Record<string, any>; body?: any; admin?: boolean; headers?: Record<string, string> } = {},
): Promise<MockRes> {
  const cookies: Record<string, string> = opts.admin ? { cv_admin_token: adminToken() } : {}
  const req = {
    method: opts.method || 'GET',
    query: opts.query || {},
    body: opts.body,
    cookies,
    headers: { ...(opts.headers || {}), ...(opts.admin ? { cookie: `cv_admin_token=${cookies.cv_admin_token}` } : {}) },
    socket: { remoteAddress: '127.0.0.1' },
  }
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined }
  const res: any = {
    get statusCode() { return out.statusCode },
    set statusCode(code: number) { out.statusCode = code },
    status(code: number) { out.statusCode = code; return res },
    setHeader(name: string, value: any) { out.headers[name.toLowerCase()] = String(value); return res },
    getHeader(name: string) { return out.headers[name.toLowerCase()] },
    json(body: any) { out.body = JSON.parse(JSON.stringify(body)); return res },
    send(body: any) { out.body = body; return res },
    // sendVersionedJson (lib/http.ts) writes the JSON payload with end().
    end(payload?: string) {
      if (typeof payload === 'string' && /json/.test(out.headers['content-type'] || '')) out.body = JSON.parse(payload)
      return res
    },
  }
  await handler(req, res)
  return out
}

const SECRET_GPA = 'GPA-SENTINEL-9.99'
const fullCv = () => ({
  en: [
    { sessionName: 'personalInformation', firstName: 'Ada', phoneNumber: '+1 555', hiddenFields: ['phoneNumber'] },
    { sessionName: 'education', educationExperience: [{ schoolName: 'Uni', gpa: SECRET_GPA, hiddenFields: ['gpa'] }] },
    {
      sessionName: 'workExperience',
      experiences: [
        { companyName: 'Past Co', startDate: '2018-01', endDate: '2019-06', hiddenFields: ['endDate'] },
        { companyName: 'Latest Co', startDate: '2020-01', endDate: '2021-01' },
      ],
    },
  ],
  zh: [{ sessionName: 'education', educationExperience: [{ schoolName: '大学', gpa: SECRET_GPA, hiddenFields: ['gpa'] }] }],
})

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  cvdata = (await import('../pages/api/cvdata')).default
  home = (await import('../pages/api/home')).default
  adminCv = (await import('../pages/api/admin/cvdata')).default
  adminHome = (await import('../pages/api/admin/home')).default
  versions = (await import('../pages/api/versions')).default
  derived = (await import('../pages/api/admin/cv-derived')).default
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('(A) admin GET requires a session and returns the full document with ETag "0" when empty', async () => {
  assert.equal((await call(adminCv)).statusCode, 401)
  const r = await call(adminCv, { admin: true })
  assert.equal(r.statusCode, 200)
  assert.deepEqual(r.body, { en: [], zh: [] })
  assert.equal(r.headers.etag, '"0"')
  assert.equal(r.headers['x-cv-view'], 'admin')
  assert.equal(r.headers['cache-control'], 'no-store')
  assert.equal((await call(adminCv, { admin: true, method: 'POST' })).statusCode, 405)
})

test('(D) PUT with matching If-Match writes and returns the new ETag; a stale one gets 409 and writes nothing', async () => {
  const first = await call(cvdata, { method: 'PUT', admin: true, body: fullCv(), headers: { 'if-match': '"0"' } })
  assert.equal(first.statusCode, 200)
  assert.match(first.body.etag, /^"\d+"$/)
  assert.equal(first.headers.etag, first.body.etag)

  const admin = await call(adminCv, { admin: true })
  assert.equal(admin.headers.etag, first.body.etag)
  assert.equal(admin.body.en[1].educationExperience[0].gpa, SECRET_GPA, 'admin view is full')

  const edited = fullCv()
  edited.en[0].firstName = 'Ada L.'
  const stale = await call(cvdata, { method: 'PUT', admin: true, body: edited, headers: { 'if-match': '"0"' } })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.body.error, 'conflict')
  assert.equal(stale.body.etag, first.body.etag)
  assert.equal(typeof stale.body.message, 'string')
  assert.equal((await call(adminCv, { admin: true })).body.en[0].firstName, 'Ada', 'nothing written')

  const ok = await call(cvdata, { method: 'PUT', admin: true, body: edited, headers: { 'if-match': first.body.etag } })
  assert.equal(ok.statusCode, 200)
  assert.notEqual(ok.body.etag, first.body.etag)

  // No If-Match → backward compatible write.
  const legacy = fullCv()
  const noHeader = await call(cvdata, { method: 'PUT', admin: true, body: legacy })
  assert.equal(noHeader.statusCode, 200)
  assert.match(noHeader.body.etag, /^"\d+"$/)
})

test('an unchanged PUT neither snapshots nor bumps the version', async () => {
  const before = await call(adminCv, { admin: true })
  const snapsBefore = (await call(cvdata, { admin: true, query: { snapshots: '1' } })).body.files.length
  const again = await call(cvdata, { method: 'PUT', admin: true, body: { en: before.body.en, zh: before.body.zh } })
  assert.equal(again.statusCode, 200)
  assert.equal(again.body.unchanged, true)
  assert.equal(again.body.etag, before.headers.etag)
  assert.equal((await call(cvdata, { admin: true, query: { snapshots: '1' } })).body.files.length, snapsBefore)
})

test('(C) public GET /api/cvdata is always the pruned view, even for an admin', async () => {
  for (const admin of [false, true]) {
    const r = await call(cvdata, { admin })
    assert.equal(r.statusCode, 200)
    assert.equal(r.headers['x-cv-view'], 'public')
    assert.equal(r.headers['cache-control'], 'no-store')
    const text = JSON.stringify(r.body)
    assert.ok(!text.includes(SECRET_GPA))
    assert.ok(!text.includes('+1 555'))
    assert.ok(!text.includes('hiddenFields'))
    assert.deepEqual(r.body.en[0].redacted, ['phoneNumber'])
  }
})

test('download validates the file query and never 500s on non-string input', async () => {
  assert.equal((await call(cvdata, { query: { download: '1' } })).statusCode, 401)
  const bad = await call(cvdata, { admin: true, query: { download: '1', file: ['a.json', 'b.json'] } })
  assert.equal(bad.statusCode, 400)
  assert.equal((await call(cvdata, { admin: true, query: { download: '1', file: '../content.db' } })).statusCode, 400)
  assert.equal((await call(cvdata, { admin: true, query: { download: '1', file: 'cv_missing.json' } })).statusCode, 404)
  const files = (await call(cvdata, { admin: true, query: { snapshots: '1' } })).body.files as string[]
  assert.ok(files.length > 0)
  const dl = await call(cvdata, { admin: true, query: { download: '1', file: files[0] } })
  assert.equal(dl.statusCode, 200)
  assert.equal(dl.headers['content-disposition'], `attachment; filename="${files[0]}"; filename*=UTF-8''${files[0]}`)
  const current = await call(cvdata, { admin: true, query: { download: 'current' } })
  assert.equal(current.statusCode, 200)
  assert.ok(String(current.body).includes(SECRET_GPA), 'admin download is the full document')
})

test('versions API validates type and file, and restore reports the new ETag', async () => {
  assert.equal((await call(versions, { admin: true, query: { type: 'nope' } })).statusCode, 400)
  assert.equal((await call(versions, { admin: true, query: { type: 'cv', file: ['x'], preview: '1' } })).statusCode, 400)
  const list = await call(versions, { admin: true, query: { type: 'cv' } })
  assert.equal(list.statusCode, 200)
  const oldest = list.body.versions[list.body.versions.length - 1].filename
  const restored = await call(versions, { admin: true, method: 'POST', query: { type: 'cv' }, body: { action: 'restore', filename: oldest } })
  assert.equal(restored.statusCode, 200)
  assert.equal(restored.body.etag, (await call(adminCv, { admin: true })).headers.etag)
  const missing = await call(versions, { admin: true, method: 'POST', query: { type: 'cv' }, body: { action: 'restore', filename: 'cv_none.json' } })
  assert.equal(missing.statusCode, 404)
})

test('cv-derived uses the website view: a hidden end date never makes a past job current, an ended job is never offered', async () => {
  await call(cvdata, { method: 'PUT', admin: true, body: fullCv() })
  const r = await call(derived, { admin: true })
  assert.equal(r.statusCode, 200)
  assert.deepEqual(r.body.currentlyCoding, { label: '', project: '', note: '' })
  // A running role is offered — exactly the chip the home page derives.
  const running: any = fullCv()
  running.en[2].experiences.push({ companyName: 'Running Co', jobTitle: 'Engineer', startDate: '2022-01', endDate: 'Present' })
  await call(cvdata, { method: 'PUT', admin: true, body: running })
  const r2 = await call(derived, { admin: true })
  assert.deepEqual(r2.body.currentlyCoding, { label: 'currently coding', project: 'Running Co', note: 'Engineer' })
  await call(cvdata, { method: 'PUT', admin: true, body: fullCv() })
})

test('(B)/(C)/(D) home: admin full view with ETag, public pruned view, If-Match conflicts', async () => {
  const doc = {
    hero: { welcome: '', brand: 'B', tagline: 't', avatarUrl: '' },
    socials: {},
    brands: [{ name: 'Brand', href: '', image: '' }],
    quickAccess: [],
    photos: [{ url: '/shown.jpg' }, { url: '/hidden-photo.jpg', visible: false }],
    sections: { brands: false },
  }
  assert.equal((await call(adminHome)).statusCode, 401)
  const empty = await call(adminHome, { admin: true })
  assert.equal(empty.headers.etag, '"0"')
  assert.equal(empty.body, null)

  assert.equal((await call(home, { method: 'PUT', admin: true, body: { hero: {} } })).statusCode, 400)
  const put = await call(home, { method: 'PUT', admin: true, body: doc, headers: { 'if-match': '"0"' } })
  assert.equal(put.statusCode, 200)
  assert.match(put.body.etag, /^"\d+"$/)

  const admin = await call(adminHome, { admin: true })
  assert.equal(admin.headers['x-home-view'], 'admin')
  assert.equal(admin.headers['cache-control'], 'no-store')
  assert.equal(admin.headers.etag, put.body.etag)
  assert.equal(admin.body.photos.length, 2)

  for (const asAdmin of [false, true]) {
    const pub = await call(home, { admin: asAdmin })
    assert.equal(pub.headers['x-home-view'], 'public')
    assert.equal(pub.headers['cache-control'], 'no-store')
    assert.ok(!JSON.stringify(pub.body).includes('hidden-photo'))
    assert.deepEqual(pub.body.brands, [])
  }

  const conflict = await call(home, { method: 'PUT', admin: true, body: { ...doc, quickAccess: [{ label: 'x', url: '/x' }] }, headers: { 'if-match': '"1"' } })
  assert.equal(conflict.statusCode, 409)
  assert.equal(conflict.body.error, 'conflict')
  assert.equal(conflict.body.etag, put.body.etag)

  const same = await call(home, { method: 'PUT', admin: true, body: doc, headers: { 'if-match': put.body.etag } })
  assert.equal(same.body.unchanged, true)
  assert.equal(same.body.etag, put.body.etag)

  assert.equal((await call(home, { admin: true, query: { download: '1', file: { x: 1 } } })).statusCode, 400)
})
