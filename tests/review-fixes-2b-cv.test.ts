/**
 * CV-L-2 (rest) and CV-L-3 (wave 2B review) — a link to a case study that is
 * not published (a draft, or deleted) never ships its slug:
 *   - a CV project's `caseStudy` is the slug of a PUBLISHED case study or ''
 *     in every public CV payload (lib/cvdata readPublicCvData: GET /api/cvdata,
 *     /now, /work's archive, the CV pages, home and /about);
 *   - a post's `project` is kept in public post data (lib/mdx listPosts /
 *     getPost: /blog, /blog/<slug>, the Markdown twins) only while it names a
 *     published case study, and the article siblings (prev / next / related
 *     on every post page) never carry an unresolved one;
 *   - Draft Mode keeps the owner's value; publishing the case study links it.
 * Runs over a real (temporary) content store.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'CF_ZONE_ID', 'CF_API_TOKEN', 'INDEXNOW_KEY']) delete process.env[k]
process.env.JWT_SECRET = 'review-fixes-2b-cv-secret-0123456789abcd'
process.env.LOG_LEVEL = 'error'

const DRAFT = 'zz-hidden-case'
const GONE = 'zz-deleted-case'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf2b-cv-'))
let store: typeof import('../lib/contentStore')
let cvdata: typeof import('../lib/cvdata')
let mdx: typeof import('../lib/mdx')
let siblings: typeof import('../lib/articleSiblings')
let closeDb: () => void

const en = 'An English body about the sorter, long enough to read as English text for the language check.'

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  store = await import('../lib/contentStore')
  cvdata = await import('../lib/cvdata')
  mdx = await import('../lib/mdx')
  siblings = await import('../lib/articleSiblings')
  closeDb = (await import('../lib/db')).closeDb
  await store.putItem('work', 'open-work', { title: 'Open work' }, en)
  await store.putItem('work', DRAFT, { title: 'A case study still in draft', draft: true }, en)
  await store.putItem('blog', 'post-draft-link', { title: 'Links a draft', date: '2026-05-04', project: DRAFT, tags: ['Edge'] }, en)
  await store.putItem('blog', 'post-open-link', { title: 'Links the open one', date: '2026-05-03', project: '/work/open-work', tags: ['Edge'] }, en)
  await store.putItem('blog', 'post-gone-link', { title: 'Links a deleted one', date: '2026-05-02', project: GONE, tags: ['Edge'] }, en)
  await store.putItem('blog', 'post-plain', { title: 'No case study', date: '2026-05-01', tags: ['Edge'] }, en)
  const project = (title: string, extra: Record<string, unknown> = {}) => ({ title, startDate: '2025-01', endDate: '2025-06', description: 'Built it.', features: [], ...extra })
  const section = (headerName: string) => ({
    sessionName: 'project',
    headerName,
    projectExperience: [
      project('Secret project', { caseStudy: DRAFT }),
      project('Open project', { caseStudy: '/work/open-work/' }),
      project('Gone project', { caseStudy: GONE }),
      project('Unlinked project'),
      project('Hidden link', { caseStudy: DRAFT, hiddenFields: ['caseStudy'] }),
    ],
  })
  const ok = await cvdata.writeCvData({ en: [section('PROJECTS')], zh: [section('项目')] })
  assert.equal(ok.ok, true)
})

after(() => {
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** GET /api/cvdata as an anonymous visitor. */
async function apiCvdata(): Promise<{ status: number; body: any }> {
  const handler = (await import('../pages/api/cvdata')).default
  const out = { status: 200, body: undefined as any, headers: {} as Record<string, string> }
  const res: any = {
    get statusCode() {
      return out.status
    },
    set statusCode(c: number) {
      out.status = c
    },
    status(c: number) {
      out.status = c
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
    end() {
      return res
    },
  }
  await handler({ method: 'GET', query: {}, headers: {}, cookies: {}, url: '/api/cvdata', socket: { remoteAddress: '127.0.0.1' } } as never, res)
  return { status: out.status, body: out.body }
}

const caseStudies = (sections: any[]) =>
  (sections.find((s) => s.sessionName === 'project')?.projectExperience || []).map((p: any) => ('caseStudy' in p ? p.caseStudy : null))

test('CV: a project names only a published case study in every public payload (GET /api/cvdata included)', async () => {
  for (const audience of ['any', 'cv', 'website'] as const) {
    const doc = cvdata.readPublicCvData(audience)
    for (const lang of ['en', 'zh'] as const) assert.deepEqual(caseStudies(doc[lang]), ['', 'open-work', '', null, ''], `${audience}/${lang}`)
  }
  assert.deepEqual(caseStudies(cvdata.readPublicCvSections('website', ['project'], ['en']).en), ['', 'open-work', '', null, ''])
  const api = await apiCvdata()
  assert.equal(api.status, 200)
  const text = JSON.stringify(api.body)
  assert.ok(!text.includes(DRAFT), 'no draft slug in /api/cvdata')
  assert.ok(!text.includes(GONE), 'no deleted slug in /api/cvdata')
  assert.deepEqual(caseStudies(api.body.en), ['', 'open-work', '', null, ''])
  // The editors still read the owner's values (GET /api/admin/cvdata reads the full document).
  assert.equal(cvdata.readCvData().en[0].projectExperience[0].caseStudy, DRAFT)
})

test('posts: `project` only while it names a published case study; Draft Mode keeps the owner\'s value', async () => {
  const projects = Object.fromEntries(mdx.listPosts().map((p) => [p.slug, p.frontmatter.project ?? null]))
  assert.deepEqual(projects, { 'post-draft-link': null, 'post-open-link': 'open-work', 'post-gone-link': null, 'post-plain': null })
  assert.ok(!JSON.stringify(mdx.listPosts()).includes(DRAFT), '/blog props carry no draft slug')
  assert.equal((await mdx.getPost('post-draft-link'))!.frontmatter.project, undefined, '/blog/<slug> frontmatter')
  assert.equal((await mdx.getPost('post-open-link'))!.frontmatter.project, 'open-work')
  // Draft Mode: the owner sees what they wrote.
  const preview = mdx.listPosts({ includeDrafts: true }).find((p) => p.slug === 'post-draft-link')!
  assert.equal(preview.frontmatter.project, DRAFT)
  assert.equal((await mdx.getPost('post-draft-link', { includeDrafts: true }))!.frontmatter.project, DRAFT)
})

test('article siblings: no neighbour or related link carries an unpublished case study, in public or in Draft Mode', async () => {
  const plain = (await mdx.getPost('post-plain'))!
  for (const draftMode of [false, true]) {
    const s = siblings.articleSiblings('blog', plain, { draftMode })
    const text = JSON.stringify({ posts: s.posts, work: s.work })
    assert.ok(!text.includes(DRAFT), `draftMode=${draftMode}: draft slug`)
    assert.ok(!text.includes(GONE), `draftMode=${draftMode}: deleted slug`)
    assert.deepEqual(
      s.posts.map((p) => [p.slug, p.project ?? null]),
      [['post-draft-link', null], ['post-open-link', 'open-work'], ['post-gone-link', null], ['post-plain', null]],
    )
    assert.equal(s.projectFor(DRAFT), undefined)
    assert.equal(s.projectFor(GONE), undefined)
    assert.equal(s.projectFor('open-work'), 'open-work')
  }
  // The post being previewed links its draft case study: still no slug in its siblings.
  const own = (await mdx.getPost('post-draft-link', { includeDrafts: true, pending: true }))!
  const s = siblings.articleSiblings('blog', own, { draftMode: true })
  assert.equal(s.projectFor(own.frontmatter.project), undefined)
})

test('control: once the case study is published, the CV project, the post and the siblings link it', async () => {
  await store.putItem('work', DRAFT, { title: 'A case study now published' }, en)
  try {
    assert.deepEqual(caseStudies(cvdata.readPublicCvData('any').en), [DRAFT, 'open-work', '', null, ''], 'a hidden link stays hidden')
    assert.equal((await mdx.getPost('post-draft-link'))!.frontmatter.project, DRAFT)
    const s = siblings.articleSiblings('blog', (await mdx.getPost('post-plain'))!, { draftMode: false })
    assert.equal(s.posts.find((p) => p.slug === 'post-draft-link')?.project, DRAFT)
  } finally {
    await store.putItem('work', DRAFT, { title: 'A case study still in draft', draft: true }, en)
  }
})
