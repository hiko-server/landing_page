/**
 * S1: the Home editor's form model (stable `_id`s that never reach the PUT
 * payload), write-time validation of the new home fields, and publicHome
 * passing availability / openSource / site through.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import {
  ensureIds,
  formFromHome,
  insertAt,
  moveItem,
  serializeHome,
  stripTs,
  updatedAgo,
  validateHomeForm,
} from '../components/Admin/home/homeForm'
import { HOME_SECTION_META, isHttpsUrl, normalizeHomeWrite, publicHome, snapBrandScale, type HomeData } from '../lib/homeShape'

const repoRoot = process.cwd()

function hasKeyDeep(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key))
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([k, v]) => k === key || hasKeyDeep(v, key))
  }
  return false
}

const sample = (): HomeData =>
  ({
    hero: { welcome: 'Hi', brand: 'B', tagline: 't', avatarUrl: '/uploads/a.jpg' },
    socials: { github: 'https://github.com/x' },
    brands: [{ name: 'Uni', href: 'https://uni.example', image: '/images/u.svg', scale: 1.25 }],
    quickAccess: [{ label: 'App', url: 'https://app.example' }],
    photos: [
      { url: '/p/1.jpg', describe: 'One', redirectTo: 'https://x.example', visible: true },
      { url: '/p/2.jpg', describe: '', visible: false },
    ],
    sections: { brands: true, writing: false },
    contact: { heading: '', blurb: '', eyebrow: '', reasons: ['Hiring'] },
    availability: { status: 'open', label: 'Open to roles', roles: ['Frontend'], from: '2026-11', bookingUrl: 'https://cal.com/x', updatedAt: 1_700_000_000_000 },
    openSource: { featured: [{ name: 'landing_page', blurb: 'This site' }, { name: 'tool' }], showVanityStats: true },
    site: { name: 'Lucian' },
    futureKey: { kept: true },
  }) as HomeData

test('serializeHome strips every _id (and __ts cache-busters) and keeps the payload shape', () => {
  const form = formFromHome(sample(), (() => {
    let n = 0
    return () => `id-${++n}`
  })())
  assert.ok(form.photos.every((p) => p._id) && form.brands[0]._id && form.openSource.featured[0]._id)
  form.photos[0].url = '/p/1.jpg?__ts=1712345678901'
  form.brands[0].image = '/images/u.svg?v=2&__ts=1712345678901'
  const out = serializeHome(form)
  assert.equal(hasKeyDeep(out, '_id'), false, 'no _id keys in the payload')
  assert.equal(JSON.stringify(out).includes('__ts'), false, 'no cache-busters in the payload')
  assert.equal(out.photos?.[0].url, '/p/1.jpg')
  assert.equal(out.brands[0].image, '/images/u.svg?v=2')
  assert.deepEqual((out as Record<string, unknown>).futureKey, { kept: true }, 'unknown keys pass through')
  assert.deepEqual(out.openSource, { featured: [{ name: 'landing_page', blurb: 'This site' }, { name: 'tool' }], showVanityStats: true })
  assert.deepEqual(out.site, { name: 'Lucian' })
  assert.equal(out.brands[0].scale, 1.25)
})

test('the tracked home seed round-trips through the form unchanged', () => {
  const seed = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'home.json'), 'utf8'))
  const round = serializeHome(formFromHome(seed))
  assert.equal(normalizeHomeWrite(round).ok, true)
  for (const key of ['hero', 'socials', 'quickAccess', 'contact', 'sections'] as const) {
    if (seed[key] !== undefined) assert.deepEqual((round as Record<string, unknown>)[key], seed[key], key)
  }
  assert.deepEqual(
    round.brands.map((b) => b.name),
    (seed.brands || []).map((b: { name: string }) => b.name),
  )
})

test('empty optional groups are omitted; a draft without ids gets them back', () => {
  const form = formFromHome({ hero: {}, socials: {}, brands: [] })
  const out = serializeHome(form)
  assert.equal('availability' in out, false)
  assert.equal('openSource' in out, false)
  assert.equal('site' in out, false)
  const withoutIds = { ...form, photos: [{ url: '/a.jpg', describe: '', redirectTo: '', visible: true }] } as unknown as typeof form
  assert.ok(ensureIds(withoutIds, () => 'fresh').photos[0]._id === 'fresh')
})

test('bookingUrl must be https; other availability rules', () => {
  assert.equal(isHttpsUrl('https://cal.com/lucian'), true)
  for (const bad of ['http://cal.com/x', 'javascript:alert(1)', 'cal.com/x', 'https://user:pw@cal.com', 'https://', '']) {
    assert.equal(isHttpsUrl(bad), false, bad)
  }
  const doc = sample()
  doc.availability = { status: 'open', bookingUrl: 'http://cal.com/x' }
  const r = normalizeHomeWrite(doc)
  assert.equal(r.ok, false)
  if (!r.ok) assert.deepEqual(r.errors.map((e) => e.path), ['availability.bookingUrl'])

  const form = formFromHome(sample())
  form.availability.bookingUrl = 'ftp://files.example'
  assert.ok(validateHomeForm(form).some((e) => e.path === 'availability.bookingUrl'), 'the editor reports it before saving')

  const month = normalizeHomeWrite({ ...sample(), availability: { status: 'limited', from: '2026-13' } })
  assert.equal(month.ok, false)
  const status = normalizeHomeWrite({ ...sample(), availability: { status: 'busy' } as never })
  assert.equal(status.ok, false)

  const trimmed = normalizeHomeWrite({ ...sample(), availability: { status: 'closed', label: '  ', roles: [' A ', 'A', ''], bookingUrl: '' } }, 42)
  assert.equal(trimmed.ok, true)
  if (trimmed.ok) assert.deepEqual(trimmed.home.availability, { status: 'closed', roles: ['A'], updatedAt: 42 })
})

test('open source picks, site name and logo scales are validated and normalised', () => {
  const blurb = normalizeHomeWrite({ ...sample(), openSource: { featured: [{ name: 'x', blurb: 'a'.repeat(141) }] } })
  assert.equal(blurb.ok, false)
  const repo = normalizeHomeWrite({ ...sample(), openSource: { featured: [{ name: 'bad name!' }] } })
  assert.equal(repo.ok, false)
  const dedupe = normalizeHomeWrite({ ...sample(), openSource: { featured: [{ name: 'A' }, { name: 'a', blurb: '' }], showVanityStats: false } })
  assert.equal(dedupe.ok, true)
  if (dedupe.ok) assert.deepEqual(dedupe.home.openSource, { featured: [{ name: 'A' }], showVanityStats: false })

  const site = normalizeHomeWrite({ ...sample(), site: { name: '  ' } })
  assert.equal(site.ok, true)
  if (site.ok) assert.deepEqual(site.home.site, {})

  const scale = normalizeHomeWrite({ ...sample(), brands: [{ name: 'a', href: '', image: '', scale: 1.234 }] })
  assert.equal(scale.ok, true)
  if (scale.ok) assert.equal(scale.home.brands[0].scale, 1.25)
  assert.equal(normalizeHomeWrite({ ...sample(), brands: [{ name: 'a', href: '', image: '', scale: 3 }] }).ok, false)
  assert.equal(snapBrandScale(0.1), 0.5)
  assert.equal(snapBrandScale(1.97), 1.95)
})

test('publicHome passes availability, openSource and site through untouched', () => {
  const doc = sample()
  const pub = publicHome(doc)
  assert.ok(pub)
  assert.deepEqual(pub.availability, doc.availability)
  assert.deepEqual(pub.openSource, doc.openSource)
  assert.deepEqual(pub.site, doc.site)
  // Existing pruning still applies.
  assert.equal(pub.photos?.length, 1)
  assert.ok(HOME_SECTION_META.some((m) => m.key === 'writing' && m.label === 'Writing & case studies'))
})

test('list helpers and the availability age label', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b'])
  assert.deepEqual(moveItem(['a', 'b'], 0, 5), ['a', 'b'])
  assert.deepEqual(insertAt(['a', 'c'], 1, 'b'), ['a', 'b', 'c'])
  assert.deepEqual(insertAt(['a'], 9, 'b'), ['a', 'b'])
  assert.equal(stripTs('/x.jpg?__ts=1'), '/x.jpg')
  assert.equal(stripTs('https://cdn.example/x.jpg?a=1&__ts=2'), 'https://cdn.example/x.jpg?a=1')
  const day = 86_400_000
  assert.equal(updatedAgo(null, 0), '')
  assert.equal(updatedAgo(10 * day, 10 * day + 1000), 'updated today')
  assert.equal(updatedAgo(1, day + 1), 'updated 1 day ago')
  assert.equal(updatedAgo(1, 12 * day + 5), 'updated 12 days ago')
})

// ── Through PUT /api/home ──────────────────────────────────────────────────

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'r4-adminshell-home-secret'
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-home-'))
type Handler = (req: any, res: any) => unknown
let home: Handler, adminHome: Handler
let closeDb: () => void

async function call(handler: Handler, opts: { method?: string; body?: any; admin?: boolean } = {}) {
  const token = jwt.sign({ role: 'admin', email: 'owner@example.test' }, 'r4-adminshell-home-secret', { algorithm: 'HS256' })
  const admin = opts.admin !== false
  const req = {
    method: opts.method || 'GET',
    query: {},
    body: opts.body,
    cookies: admin ? { cv_admin_token: token } : {},
    headers: admin ? { cookie: `cv_admin_token=${token}` } : {},
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
  home = (await import('../pages/api/home')).default
  adminHome = (await import('../pages/api/admin/home')).default
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  process.chdir(repoRoot)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('PUT /api/home stores normalised extras, answers 422 INVALID_HOME on bad ones, and the public view keeps them', async () => {
  const ok = await call(home, { method: 'PUT', body: sample() })
  assert.equal(ok.statusCode, 200)

  const bad = { ...sample(), availability: { status: 'open', bookingUrl: 'http://insecure.example' } }
  const rejected = await call(home, { method: 'PUT', body: bad })
  assert.equal(rejected.statusCode, 422)
  assert.equal(rejected.body.code, 'INVALID_HOME')
  assert.equal(rejected.body.errors[0].path, 'availability.bookingUrl')

  const stored = await call(adminHome)
  assert.equal(stored.body.availability.bookingUrl, 'https://cal.com/x', 'the rejected write changed nothing')

  const pub = await call(home, { admin: false })
  assert.deepEqual(pub.body.openSource, sample().openSource)
  assert.deepEqual(pub.body.site, { name: 'Lucian' })
  assert.equal(pub.body.availability.status, 'open')
})
