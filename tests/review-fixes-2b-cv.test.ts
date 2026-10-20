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
 * CV-L-4: a paper no view renders (no title, or a status that is empty,
 * hidden or unknown) is not in the public CV data at all.
 * Runs over a real (temporary) content store.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { publicSections, UNDER_REVIEW_WITHHELD } from '../lib/cvVisibility'
import { toPublication } from '../lib/publications/normalize'

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

test('CV-L-4: a paper no view renders (no title; empty, hidden or unknown status) is left out of the public data whole', () => {
  const papers = [
    { title: 'Printed work', status: 'published', venue: 'Known Venue', authors: ['Jane Doe'] },
    { title: 'No status yet', status: '', venue: 'ZZ-NOSTATUS-VENUE', doi: '10.5555/zznostatus', abstract: 'ZZ-NOSTATUS-ABSTRACT', authors: ['ZZ-COAUTHOR'] },
    { title: 'Status hidden', status: 'published', hiddenFields: ['status'], venue: 'ZZ-HIDDENSTATUS-VENUE', abstract: 'ZZ-HIDDENSTATUS-ABSTRACT' },
    { title: 'Unknown status', status: 'submitted', venue: 'ZZ-BADSTATUS-VENUE' },
    { title: '', status: 'published', venue: 'ZZ-UNTITLED-VENUE' },
    { title: 'Title hidden', status: 'published', hiddenFields: ['title'], venue: 'ZZ-HIDDENTITLE-VENUE' },
    { title: '  Spaced   status ', status: ' published ', venue: 'Spaced Venue' },
    { title: 'Spaced review', status: ' under-review ', venue: 'ZZ-SPACED-SUBMITTED-TO', volume: '9' },
  ]
  const section = { sessionName: 'publications', headerName: 'PUBLICATIONS', papers }
  // The rule mirrors the renderers': exactly the papers toPublication renders stay.
  const rendered = papers.map((p, i) => toPublication(p, i)).filter(Boolean).map((p) => p!.title)
  assert.deepEqual(rendered, ['Printed work', 'Spaced status', 'Spaced review'])
  for (const audience of ['any', 'cv', 'website'] as const) {
    const [pub] = publicSections([section], audience)
    const kept = pub.papers as Array<Record<string, unknown>>
    assert.deepEqual(kept.map((p) => String(p.title).replace(/\s+/g, ' ').trim()), rendered, audience)
    const text = JSON.stringify(pub)
    for (const needle of ['ZZ-NOSTATUS', 'ZZ-COAUTHOR', 'ZZ-HIDDENSTATUS', 'ZZ-BADSTATUS', 'ZZ-UNTITLED', 'ZZ-HIDDENTITLE', 'ZZ-SPACED-SUBMITTED-TO'])
      assert.ok(!text.includes(needle), `${audience}: ${needle}`)
    for (const key of UNDER_REVIEW_WITHHELD) assert.equal(key in kept[2], false, `${key} withheld while under review (status with spaces)`)
    assert.equal(kept[1].venue, 'Spaced Venue')
  }
  // Every paper renders nowhere: the list is empty, the section stays (its switches are the renderers').
  const [none] = publicSections([{ sessionName: 'publications', papers: papers.slice(1, 6) }], 'any')
  assert.deepEqual(none.papers, [])
})

/** Every module reached from `entry` through static and literal dynamic imports (type-only imports excluded), with the packages they import. */
function importGraph(entry: string): { files: string[]; packages: Map<string, string> } {
  const root = originalCwd
  const seen = new Set<string>()
  const packages = new Map<string, string>()
  const resolve = (from: string, spec: string): string | null => {
    const base = path.resolve(path.dirname(from), spec)
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, 'index.ts')])
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
    return null
  }
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const src = fs.readFileSync(file, 'utf8')
    const specs = [
      ...Array.from(src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?from\s+['"]([^'"]+)['"]/gm), (m) => m[1]),
      ...Array.from(src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm), (m) => m[1]),
      ...Array.from(src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g), (m) => m[1]),
    ]
    for (const spec of specs) {
      if (spec.startsWith('.')) {
        const next = resolve(file, spec)
        if (next) visit(next)
      } else if (!packages.has(spec)) packages.set(spec, path.relative(root, file))
    }
  }
  visit(path.join(root, entry))
  return { files: [...seen].map((f) => path.relative(root, f)), packages }
}

test('the server-start clean-up (instrumentation.ts → lib/isrPages, through lib/cvdata) stays React-free', () => {
  // Next refuses to build the instrumentation bundle when it reaches React client APIs (createContext…).
  const { files, packages } = importGraph('lib/isrPages.ts')
  assert.ok(files.includes('lib/cvdata.ts') && files.includes('lib/cvVisibility.ts'), files.join(', '))
  for (const pkg of ['react', 'react-dom', '@chakra-ui/react', 'framer-motion', '@emotion/react'])
    assert.equal(packages.get(pkg), undefined, `${pkg} reached through ${packages.get(pkg)}`)
})
