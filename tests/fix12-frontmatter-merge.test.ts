/**
 * FIX-12 — admin saves keep the frontmatter fields the editors do not model.
 *
 * The admin PUT stores the frontmatter it receives as the whole new
 * frontmatter, and the post / case-study / page forms only model some keys,
 * so every save erased seoTitle (→ <title>), updated (→ dateModified), lang
 * and a post's coverAlt. The editors now keep
 * extra = stored − modelled keys on load and merge it back on save
 * (components/Admin/shell/frontmatterMerge.ts); a modelled field the editor
 * clears is still removed.
 *
 * Unit tests of the merge with the real editor forms
 * (components/Admin/shell/itemFrontmatter.ts), then the same round trip
 * through the real admin APIs against a throw-away SQLite store.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { mergeFrontmatter, modelledKeys, unmodelledFrontmatter } from '../components/Admin/shell/frontmatterMerge'
import {
  BLOG_EMPTY,
  PAGE_MODELLED_KEYS,
  WORK_EMPTY,
  blogFromServer,
  blogToServer,
  pageToServer,
  workFromServer,
  workToServer,
} from '../components/Admin/shell/itemFrontmatter'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CF_API_TOKEN', 'CF_ZONE_ID', 'INDEXNOW_KEY']) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'fix12-frontmatter-secret'
process.env.LOG_LEVEL = 'error'

const BLOG_KEYS = modelledKeys(BLOG_EMPTY, blogToServer(BLOG_EMPTY, []))
const WORK_KEYS = modelledKeys(WORK_EMPTY, workToServer(WORK_EMPTY, []))

/** What the post editor sends after loading `stored` and applying `edit` to its form. */
function blogSave(stored: Record<string, any>, edit: (fm: ReturnType<typeof blogFromServer>) => void) {
  const fm = blogFromServer(stored)
  const extra = unmodelledFrontmatter(stored, BLOG_KEYS)
  edit(fm)
  return mergeFrontmatter(extra, blogToServer(fm, fm.tags), BLOG_KEYS)
}

function workSave(stored: Record<string, any>, edit: (fm: ReturnType<typeof workFromServer>) => void) {
  const fm = workFromServer(stored)
  const extra = unmodelledFrontmatter(stored, WORK_KEYS)
  edit(fm)
  return mergeFrontmatter(extra, workToServer(fm, fm.tech), WORK_KEYS)
}

// ── Merge ────────────────────────────────────────────────────────────────

test('modelledKeys: the keys of the empty form and of what toServer writes', () => {
  assert.deepEqual([...BLOG_KEYS].sort(), ['cover', 'date', 'description', 'draft', 'tags', 'title'])
  assert.ok(WORK_KEYS.has('coverAlt') && WORK_KEYS.has('status') && !WORK_KEYS.has('seoTitle'))
  assert.deepEqual([...PAGE_MODELLED_KEYS].sort(), ['description', 'title', 'updated'])
  assert.deepEqual([...modelledKeys(null, undefined, { a: undefined })], ['a'])
})

test('unmodelledFrontmatter: the stored keys the form does not show, as stored', () => {
  const stored = { title: 'T', seoTitle: 'S', updated: '2026-10-01', tags: ['x'], outcomes: [{ k: 1 }], gone: undefined }
  assert.deepEqual(unmodelledFrontmatter(stored, BLOG_KEYS), { seoTitle: 'S', updated: '2026-10-01', outcomes: [{ k: 1 }] })
  assert.deepEqual(unmodelledFrontmatter(null, BLOG_KEYS), {})
  assert.deepEqual(unmodelledFrontmatter(['x'], BLOG_KEYS), {})
})

test('mergeFrontmatter: extras kept, cleared modelled fields removed, modelled keys never come back from extra', () => {
  const modelled = new Set(['title', 'description'])
  assert.deepEqual(mergeFrontmatter({ seoTitle: 'S', lang: 'zh-Hans' }, { title: 'New', description: undefined }, modelled), {
    seoTitle: 'S',
    lang: 'zh-Hans',
    title: 'New',
  })
  // A modelled key smuggled into extra (or one the form clears) does not survive.
  assert.deepEqual(mergeFrontmatter({ description: 'old', seoTitle: 'S' }, { title: 'T', description: undefined }, modelled), { seoTitle: 'S', title: 'T' })
  // The form's value wins over an extra of the same name.
  assert.deepEqual(mergeFrontmatter({ title: 'stale' }, { title: 'fresh' }), { title: 'fresh' })
})

test('post form: seoTitle, updated, lang, coverAlt and unknown keys survive a save; a cleared description is removed', () => {
  const stored = {
    title: 'Edge waste sorter',
    seoTitle: 'Edge AI waste sorter — lessons',
    description: 'Lessons from building it.',
    date: '2026-05-30',
    updated: '2026-10-01',
    lang: 'zh-Hans',
    cover: '/uploads/cover.png',
    coverAlt: 'The sorting station on a bench',
    tags: ['Edge AI'],
    outcomes: ['61 ms inference'],
  }
  // Before the fix the editor sent only this: every unmodelled key was lost.
  assert.equal('seoTitle' in blogToServer(blogFromServer(stored), stored.tags), false)

  const saved = blogSave(stored, (fm) => {
    fm.title = 'Edge waste sorter, revisited'
    fm.description = ''
  })
  assert.equal(saved.title, 'Edge waste sorter, revisited')
  assert.equal('description' in saved, false, 'a field the editor cleared is removed')
  for (const k of ['seoTitle', 'updated', 'lang', 'cover', 'coverAlt', 'tags', 'outcomes'] as const) {
    assert.deepEqual(saved[k], stored[k], `${k} kept`)
  }
})

test('case-study form: unmodelled keys survive; coverAlt (modelled) goes with a removed cover', () => {
  const stored = {
    title: 'SWCS',
    seoTitle: 'Smart Waste Classification System',
    updated: '2026-10-02',
    lang: 'en',
    status: 'case-study',
    cover: '/uploads/swcs.png',
    coverAlt: 'Station overview',
    tech: ['Jetson'],
  }
  const kept = workSave(stored, (fm) => {
    fm.role = 'Solo capstone'
  })
  assert.deepEqual(
    { seoTitle: kept.seoTitle, updated: kept.updated, lang: kept.lang, coverAlt: kept.coverAlt, role: kept.role },
    { seoTitle: stored.seoTitle, updated: stored.updated, lang: 'en', coverAlt: 'Station overview', role: 'Solo capstone' },
  )
  const noCover = workSave(stored, (fm) => {
    fm.cover = ''
  })
  assert.equal('cover' in noCover, false)
  assert.equal('coverAlt' in noCover, false, 'the editor’s own rule still clears the alt with the cover')
  assert.equal(noCover.seoTitle, stored.seoTitle)
})

// ── Through the admin APIs ───────────────────────────────────────────────

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fix12-frontmatter-'))
type Handler = (req: any, res: any) => unknown
let posts: Handler, work: Handler, page: Handler
let closeDb: () => void

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  posts = (await import('../pages/api/admin/posts')).default
  work = (await import('../pages/api/admin/work')).default
  page = (await import('../pages/api/admin/page')).default
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const adminToken = () => jwt.sign({ role: 'admin', email: 'owner@example.test' }, 'fix12-frontmatter-secret', { algorithm: 'HS256' })

type MockRes = { statusCode: number; headers: Record<string, string>; body: any }

let ip = 0
async function call(handler: Handler, opts: { method?: string; query?: Record<string, any>; body?: any; headers?: Record<string, string> } = {}): Promise<MockRes> {
  const token = adminToken()
  ip++
  const req = {
    method: opts.method || 'GET',
    url: '/api/test',
    query: opts.query || {},
    body: opts.body,
    cookies: { cv_admin_token: token },
    headers: { ...(opts.headers || {}), cookie: `cv_admin_token=${token}` },
    socket: { remoteAddress: `127.0.1.${(ip % 250) + 1}` },
  }
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined }
  let ended = false
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(code: number) {
      out.statusCode = code
    },
    get headersSent() {
      return ended
    },
    get writableEnded() {
      return ended
    },
    status(code: number) {
      out.statusCode = code
      return res
    },
    setHeader(name: string, value: any) {
      out.headers[name.toLowerCase()] = String(value)
      return res
    },
    getHeader(name: string) {
      return out.headers[name.toLowerCase()]
    },
    json(body: any) {
      out.body = JSON.parse(JSON.stringify(body))
      ended = true
      return res
    },
    send(body: any) {
      out.body = body
      ended = true
      return res
    },
    end(payload?: string) {
      if (typeof payload === 'string' && /json/.test(out.headers['content-type'] || '')) out.body = JSON.parse(payload)
      ended = true
      return res
    },
    async revalidate() {},
  }
  await handler(req, res)
  return out
}

test('API: a post editor save keeps seoTitle / updated / lang / coverAlt; a cleared field is removed', async () => {
  const created = await call(posts, {
    method: 'PUT',
    body: {
      slug: 'seo-post',
      create: true,
      body: 'Hello **world**.',
      frontmatter: {
        title: 'Original',
        seoTitle: 'Search title',
        description: 'A description that will be cleared.',
        date: '2026-10-01',
        updated: '2026-10-05',
        lang: 'zh-Hans',
        cover: '/uploads/cover.png',
        coverAlt: 'A real description of the cover',
        tags: ['One'],
      },
    },
  })
  assert.equal(created.statusCode, 200)

  const loaded = await call(posts, { query: { slug: 'seo-post' } })
  const frontmatter = blogSave(loaded.body.frontmatter, (fm) => {
    fm.title = 'Edited'
    fm.description = ''
  })
  const saved = await call(posts, { method: 'PUT', headers: { 'if-match': loaded.headers.etag }, body: { slug: 'seo-post', frontmatter, body: loaded.body.body } })
  assert.equal(saved.statusCode, 200)

  const after = (await call(posts, { query: { slug: 'seo-post' } })).body.frontmatter
  assert.equal(after.title, 'Edited')
  assert.equal(after.seoTitle, 'Search title')
  assert.equal(after.updated, '2026-10-05')
  assert.equal(after.lang, 'zh-Hans')
  assert.equal(after.coverAlt, 'A real description of the cover')
  assert.deepEqual(after.tags, ['One'])
  assert.equal('description' in after, false)
})

test('API: a case-study editor save keeps seoTitle / updated / lang / coverAlt', async () => {
  const created = await call(work, {
    method: 'PUT',
    body: {
      slug: 'seo-case',
      create: true,
      body: 'Case body.',
      frontmatter: {
        title: 'Case',
        seoTitle: 'Case — search title',
        updated: '2026-10-06',
        lang: 'en',
        status: 'case-study',
        cover: '/uploads/case.png',
        coverAlt: 'Overview of the build',
      },
    },
  })
  assert.equal(created.statusCode, 200)
  const loaded = await call(work, { query: { slug: 'seo-case' } })
  const frontmatter = workSave(loaded.body.frontmatter, (fm) => {
    fm.period = '2025 – 2026'
  })
  const saved = await call(work, { method: 'PUT', headers: { 'if-match': loaded.headers.etag }, body: { slug: 'seo-case', frontmatter, body: loaded.body.body } })
  assert.equal(saved.statusCode, 200)
  const after = (await call(work, { query: { slug: 'seo-case' } })).body.frontmatter
  assert.deepEqual(
    { seoTitle: after.seoTitle, updated: after.updated, lang: after.lang, coverAlt: after.coverAlt, period: after.period },
    { seoTitle: 'Case — search title', updated: '2026-10-06', lang: 'en', coverAlt: 'Overview of the build', period: '2025 – 2026' },
  )
})

test('API: a /now page editor save keeps lang', async () => {
  const first = await call(page, { method: 'PUT', body: { name: 'now', frontmatter: { title: 'Now', description: 'What I am doing.', updated: '2026-10-01', lang: 'zh-Hans' }, body: '现在在做的事情。' } })
  assert.equal(first.statusCode, 200)
  const loaded = await call(page, { query: { name: 'now' } })
  const stored = loaded.body.frontmatter
  const form = { title: String(stored.title), description: '', updated: '2026-10-07' }
  const frontmatter = mergeFrontmatter(unmodelledFrontmatter(stored, PAGE_MODELLED_KEYS), pageToServer(form), PAGE_MODELLED_KEYS)
  const saved = await call(page, { method: 'PUT', headers: { 'if-match': loaded.headers.etag }, body: { name: 'now', frontmatter, body: loaded.body.body } })
  assert.equal(saved.statusCode, 200)
  const after = (await call(page, { query: { name: 'now' } })).body.frontmatter
  assert.equal(after.lang, 'zh-Hans')
  assert.equal(after.updated, '2026-10-07')
  assert.equal('description' in after, false)
})
