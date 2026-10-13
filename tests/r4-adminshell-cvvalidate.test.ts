/**
 * S3: CV writes are validated against the section registry (lib/cvValidate)
 * and rejected with 422 {code:'INVALID_CV', errors} before anything is stored.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { MAX_ERRORS, errorFocusPath, readCvErrors, validateCvDoc } from '../lib/cvValidate'
import { CV_SECTIONS } from '../lib/cvSections'

const repoRoot = process.cwd()
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'))

test('the tracked CV seed and its snapshot validate', () => {
  const seed = readJson('data/cvdata.json')
  const r = validateCvDoc(seed)
  assert.equal(r.ok, true, r.ok ? '' : JSON.stringify(r.errors.slice(0, 5)))
  const snapDir = path.join(repoRoot, 'data', 'cv_snapshots')
  for (const f of fs.existsSync(snapDir) ? fs.readdirSync(snapDir).filter((n) => n.endsWith('.json')) : []) {
    const snap = validateCvDoc(readJson(path.join('data', 'cv_snapshots', f)))
    assert.equal(snap.ok, true, `${f}: ${snap.ok ? '' : JSON.stringify(snap.errors.slice(0, 5))}`)
  }
})

test('a string where bullets are expected fails with its path', () => {
  const doc = {
    en: [
      { sessionName: 'personalInformation', firstName: 'Ada' },
      {
        sessionName: 'workExperience',
        experiences: [{ jobTitle: 'Engineer', relatedSkills: 'TypeScript, React' }],
      },
    ],
    zh: [],
  }
  const r = validateCvDoc(doc)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.deepEqual(r.errors[0].path, ['en', 1, 'experiences', 0, 'relatedSkills'])
  assert.match(r.errors[0].message, /Skills/)
})

test('dates: YYYY, YYYY-MM, YYYY-MM-DD or empty; endMonth also takes Present markers', () => {
  const entry = (startDate: unknown, endDate: unknown) => ({
    en: [{ sessionName: 'education', educationExperience: [{ schoolName: 'Uni', startDate, endDate }] }],
  })
  for (const [s, e] of [['2024', '2025-06'], ['2024-09-01', ''], ['', 'Present'], ['2022-09', '至今'], [undefined, null]]) {
    assert.equal(validateCvDoc(entry(s, e)).ok, true, `${s} → ${e}`)
  }
  const badStart = validateCvDoc(entry('Sep 2024', ''))
  assert.equal(badStart.ok, false)
  if (!badStart.ok) assert.deepEqual(badStart.errors[0].path, ['en', 0, 'educationExperience', 0, 'startDate'])
  // "Present" is only for end dates.
  assert.equal(validateCvDoc(entry('Present', '')).ok, false)
  assert.equal(validateCvDoc(entry('2024-09', 2025)).ok, false)
})

test('visibility metadata is type-checked; unknown sections and keys pass through', () => {
  const ok = validateCvDoc({
    en: [
      { sessionName: 'customThing', anything: { goes: [1, 2, 3] } },
      {
        sessionName: 'skill',
        isVisible: false,
        showOnWebsite: true,
        hiddenFields: ['languages'],
        unknownKey: 42,
        languages: [{ language: 'TS', level: 'Daily', hiddenFields: ['level'] }],
        technical: [{ name: 'Web', description: ['React', 'Next.js'], hiddenItems: { description: [1] } }],
      },
    ],
    zh: [],
  })
  assert.equal(ok.ok, true, ok.ok ? '' : JSON.stringify(ok.errors))

  const bad = validateCvDoc({
    en: [
      {
        sessionName: 'skill',
        isVisible: 'yes',
        technical: [{ name: 'Web', description: ['React'], hiddenItems: { description: ['first'] } }],
      },
    ],
  })
  assert.equal(bad.ok, false)
  if (bad.ok) return
  assert.deepEqual(
    bad.errors.map((e) => e.path),
    [
      ['en', 0, 'isVisible'],
      ['en', 0, 'technical', 0, 'hiddenItems', 'description'],
    ],
  )
})

test('non-object entries and missing sessionName are reported; errors are capped', () => {
  const r = validateCvDoc({ en: [{ sessionName: 'project', projectExperience: ['not an object'] }, { nope: true }] })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.deepEqual(r.errors.map((e) => e.path), [['en', 0, 'projectExperience', 0], ['en', 1]])
  }
  const many = validateCvDoc({
    en: [{ sessionName: 'extraSkill', points: Array.from({ length: 200 }, (_, i) => i) }],
  })
  assert.equal(many.ok, false)
  if (!many.ok) assert.equal(many.errors.length, MAX_ERRORS)
})

test('the project registry has the caseStudy slug field, and it validates as text', () => {
  const project = CV_SECTIONS.find((s) => s.sessionName === 'project')
  const field = project?.lists?.[0].fields.find((f) => f.key === 'caseStudy')
  assert.deepEqual(field && { key: field.key, label: field.label, kind: field.kind }, {
    key: 'caseStudy',
    label: 'Case study slug (/work/…)',
    kind: 'text',
  })
  const bad = validateCvDoc({ en: [{ sessionName: 'project', projectExperience: [{ title: 'X', caseStudy: 7 }] }] })
  assert.equal(bad.ok, false)
})

test('errorFocusPath maps visibility metadata to its node; readCvErrors drops malformed entries', () => {
  assert.deepEqual(errorFocusPath(['zh', 3, 'experiences', 1, 'startDate']), { lang: 'zh', sectionIdx: 3, path: [3, 'experiences', 1, 'startDate'] })
  assert.deepEqual(errorFocusPath(['en', 1, 'experiences', 0, 'hiddenItems', 'relatedSkills']), { lang: 'en', sectionIdx: 1, path: [1, 'experiences', 0] })
  assert.deepEqual(errorFocusPath(['en', 2, 'isVisible']), { lang: 'en', sectionIdx: 2, path: [2] })
  assert.deepEqual(
    readCvErrors({ errors: [{ path: ['en', 0, 'x'], message: 'm' }, { path: ['fr', 0], message: 'm' }, { path: ['en', 'a'], message: 'm' }, null] }),
    [{ path: ['en', 0, 'x'], message: 'm' }],
  )
})

// ── Through the real route handler ─────────────────────────────────────────

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'r4-adminshell-cvvalidate-secret'
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-cvvalidate-'))
type Handler = (req: any, res: any) => unknown
let cvdata: Handler, adminCv: Handler
let closeDb: () => void

async function call(handler: Handler, opts: { method?: string; body?: any } = {}) {
  const token = jwt.sign({ role: 'admin', email: 'owner@example.test' }, 'r4-adminshell-cvvalidate-secret', { algorithm: 'HS256' })
  const req = {
    method: opts.method || 'GET',
    query: {},
    body: opts.body,
    cookies: { cv_admin_token: token },
    headers: { cookie: `cv_admin_token=${token}` },
    socket: { remoteAddress: '127.0.0.1' },
  }
  const out = { statusCode: 200, headers: {} as Record<string, string>, body: undefined as any }
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
    setHeader(n: string, v: any) {
      out.headers[n.toLowerCase()] = String(v)
      return res
    },
    getHeader: (n: string) => out.headers[n.toLowerCase()],
    json(b: any) {
      out.body = JSON.parse(JSON.stringify(b))
      return res
    },
    send(b: any) {
      out.body = b
      return res
    },
    end(payload?: string) {
      if (typeof payload === 'string' && /json/.test(out.headers['content-type'] || '')) out.body = JSON.parse(payload)
      return res
    },
    async revalidate() {},
  }
  await handler(req, res)
  return out
}

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  cvdata = (await import('../pages/api/cvdata')).default
  adminCv = (await import('../pages/api/admin/cvdata')).default
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  process.chdir(repoRoot)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('PUT and import answer 422 INVALID_CV and store nothing', async () => {
  const good = { en: [{ sessionName: 'extraSkill', points: ['English: fluent'] }], zh: [] }
  assert.equal((await call(cvdata, { method: 'PUT', body: good })).statusCode, 200)
  const before = await call(adminCv)

  const bad = { en: [{ sessionName: 'extraSkill', points: 'English: fluent' }], zh: [] }
  const put = await call(cvdata, { method: 'PUT', body: bad })
  assert.equal(put.statusCode, 422)
  assert.equal(put.body.code, 'INVALID_CV')
  assert.deepEqual(put.body.errors[0].path, ['en', 0, 'points'])

  const imported = await call(cvdata, { method: 'POST', body: { action: 'import', data: bad } })
  assert.equal(imported.statusCode, 422)
  assert.equal(imported.body.code, 'INVALID_CV')

  const after = await call(adminCv)
  assert.equal(after.headers.etag, before.headers.etag, 'version unchanged')
  assert.deepEqual(after.body, before.body, 'nothing written')
})

test('a write that only sends one language is checked for that language only', async () => {
  const r = await call(cvdata, { method: 'PUT', body: { zh: [{ sessionName: 'extraSkill', points: ['英语：流利'] }] } })
  assert.equal(r.statusCode, 200)
})
