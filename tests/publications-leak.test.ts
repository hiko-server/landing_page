/**
 * Publications end to end over a real (temporary) content store:
 *   - /publications exists only with a public paper (the Website switch,
 *     per-entry and per-field hides), else getStaticProps answers 404 and the
 *     chrome / sitemap flag is false;
 *   - nothing hidden — a field, an entry, an author, the whole list, the
 *     section — reaches the page props (= __NEXT_DATA__ and the HTML), its
 *     JSON-LD, the public /api/cvdata view, or the CV-page views; nor does
 *     what no view shows: the venue fields of a paper under review, or a
 *     paper without a valid status (wave 2B review CV-L-1 / CV-L-4 / CV-L-5:
 *     asserted on the raw projections — the /api/cvdata handler's JSON and
 *     the /cv and /cv/zh page props);
 *   - CV writes regenerate /publications; the chrome helpers and the
 *     Studio's linked "shared" values behave.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { navLinksFor, PRIMARY_LINKS, adminEditTarget } from '../components/Chrome/chrome'
import { normalizeTrackedPath } from '../lib/analytics/shared'
import { setSharedValue, type Doc } from '../components/Admin/cvStudio/docOps'
import jwt from 'jsonwebtoken'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
  delete process.env[k]
}

process.env.JWT_SECRET = 'publications-leak-secret'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publications-leak-'))
let writeCvData: (doc: { en: any[]; zh: any[] }) => Promise<{ ok: boolean }>
let readPublicCvData: (a?: 'cv' | 'website' | 'any') => { en: any[]; zh: any[] }
let readPublicCvSections: (a: 'cv' | 'website' | 'any', names: readonly string[], langs?: readonly ('en' | 'zh')[]) => { en: any[]; zh: any[] }
let data: typeof import('../lib/publicationsData')
let closeDb: () => void

const SECRET = 'ZZ-SECRET-ZZ'

const personal = (lang: 'en' | 'zh') =>
  lang === 'en'
    ? { sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li', nickName: 'Lucian', email: `${SECRET}@example.test`, hiddenFields: ['email'] }
    : { sessionName: 'personalInformation', firstName: '彦霈', lastName: '李', nickName: 'Lucian' }

/**
 * Papers the editor refuses to save (lib/cvValidate: a status is required)
 * but a restored snapshot or older data can hold: rendered nowhere, so never
 * shipped either.
 */
function withStatuslessPapers(doc: { en: any[]; zh: any[] }) {
  const add = (sections: any[]) =>
    sections.map((s) =>
      s.sessionName === 'publications'
        ? {
            ...s,
            papers: [
              ...s.papers,
              { title: 'No status yet', status: '', venue: 'STATUSLESS Venue', doi: '10.5555/statusless', abstract: 'STATUSLESS abstract.', authors: ['Jane Doe', 'STATUSLESS Coauthor'] },
              { title: 'Unknown status', status: 'submitted', venue: 'STATUSLESS Unknown Venue' },
            ],
          }
        : s,
    )
  return { en: add(doc.en), zh: add(doc.zh) }
}

/** A CV whose publications hide something at every level. */
function cv(extra: Record<string, unknown> = {}) {
  const papers = [
    {
      title: 'Tiny models at the edge',
      authors: ['Jane Doe', `${SECRET} Coauthor`, 'Yanpei Li*'],
      hiddenItems: { authors: [1], keywords: [1] },
      venue: 'Journal of Edge Computing',
      venueType: 'journal',
      status: 'published',
      date: '2025-03',
      volume: '12',
      issue: '3',
      pages: '45-67',
      publisher: 'ACM',
      doi: `10.5555/${SECRET}`,
      hiddenFields: ['doi', 'abstract'],
      url: 'https://example.org/paper',
      pdfUrl: '/uploads/paper.pdf',
      abstract: `Abstract with ${SECRET}.`,
      keywords: ['edge', SECRET],
      award: 'Best Paper Award',
    },
    { title: `${SECRET} hidden paper`, status: 'published', isVisible: false, authors: ['Yanpei Li'] },
    { title: 'Under review paper', status: 'under-review', venue: 'SUBMITTED-TO Venue', volume: 'SUBMITTED-TO-VOL', issue: 'SUBMITTED-TO-ISSUE', pages: 'SUBMITTED-TO-PAGES', publisher: 'SUBMITTED-TO Press', date: '2026', authors: ['Yanpei Li'] },
    // Rendered nowhere (its status is hidden): never shipped either.
    { title: 'Status hidden', status: 'published', hiddenFields: ['status'], venue: 'STATUSLESS Hidden Venue', abstract: 'STATUSLESS hidden abstract.' },
  ]
  const section = { sessionName: 'publications', headerName: 'Publications', papers, ...extra }
  return { en: [personal('en'), section], zh: [personal('zh'), { ...section, headerName: '论文' }] }
}

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  const cvdata = await import('../lib/cvdata')
  writeCvData = cvdata.writeCvData as any
  readPublicCvData = cvdata.readPublicCvData as any
  readPublicCvSections = cvdata.readPublicCvSections as any
  data = await import('../lib/publicationsData')
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('an empty store: no page (404), no nav link, nothing in the sitemap', async () => {
  assert.equal(data.buildPublicationsPage(), null)
  assert.equal(data.hasPublicationsPage(), false)
  assert.deepEqual(data.chromePublicationsProp(), { chromePublications: false })
  const ok = await writeCvData({ en: [personal('en')], zh: [] })
  assert.equal(ok.ok, true)
  assert.equal(data.buildPublicationsPage(), null, 'a CV without the section')
  await writeCvData({ en: [personal('en'), { sessionName: 'publications', papers: [{ title: '', status: '' }] }], zh: [] })
  assert.equal(data.buildPublicationsPage(), null, 'an untitled blank paper is not a paper')
  await writeCvData({ en: [personal('en'), { sessionName: 'publications', papers: [{ title: 'No status yet', status: '' }] }], zh: [] })
  assert.equal(data.hasPublicationsPage(), false, 'a paper without a status is never shown')
})

test('nothing hidden reaches the page props, the JSON-LD, the public API or the CV views', async () => {
  await writeCvData(withStatuslessPapers(cv()))
  const page = data.buildPublicationsPage()
  assert.ok(page)
  assert.equal(data.hasPublicationsPage(), true)
  assert.deepEqual(data.chromePublicationsProp(), { chromePublications: true })

  const props = JSON.stringify(page)
  assert.ok(!props.includes(SECRET), 'page props / __NEXT_DATA__ / JSON-LD')
  assert.equal(page.items.length, 2)
  const [published, review] = page.items
  assert.equal(published.pub.doi, '')
  assert.equal(published.parts.doiUrl, '')
  assert.doesNotMatch(published.bibtex, /doi/)
  assert.deepEqual(published.parts.authors, [
    { name: 'Jane Doe', hidden: false, self: false },
    { name: '', hidden: true, self: false },
    { name: 'Yanpei Li*', hidden: false, self: true },
  ])
  assert.match(published.apa, /^Doe, J\., …, & Li, Y\. \(2025\)\./)
  assert.match(published.bibtex, /author\s+= \{Doe, Jane and Li, Yanpei and others\}/)
  assert.match(published.bibtex, /url\s+= \{https:\/\/example\.org\/paper\}/)
  assert.equal(review.parts.status, 'Under review')
  assert.equal(review.parts.venue, '', 'the venue of a paper under review is not shown')
  assert.ok(!props.includes('SUBMITTED-TO'), '… nor shipped with the page')

  // JSON-LD: the owner is the site Person; the hidden co-author is absent.
  const list = (page.jsonLd[0] as any).mainEntity.itemListElement
  assert.equal(list.length, 2)
  const article = list[0].item
  assert.equal(article['@type'], 'ScholarlyArticle')
  assert.deepEqual(
    article.author.map((a: any) => a['@id'] || a.name),
    ['Jane Doe', 'https://lucian-dev.com/#person'],
  )
  assert.equal(article.identifier, undefined, 'hidden DOI')
  assert.equal(article.abstract, undefined, 'hidden abstract')
  assert.equal(list[1].item.datePublished, undefined, 'under review: not published')

  // The public API (GET /api/cvdata: the real handler) and the CV pages'
  // loaders (the /cv and /cv/zh page props = their __NEXT_DATA__), raw.
  const api = await callPublic((await import('../pages/api/cvdata')).default, 'GET')
  assert.equal(api.statusCode, 200)
  const { loadCvPageProps } = await import('../lib/cvPage')
  const views: Array<[string, unknown]> = [
    ['readPublicCvData(any)', readPublicCvData('any')],
    ['readPublicCvSections(cv)', readPublicCvSections('cv', ['publications', 'personalInformation'])],
    ['GET /api/cvdata', api.body],
    ['/cv props', (await loadCvPageProps('en')).props],
    ['/cv/zh props', (await loadCvPageProps('zh')).props],
  ]
  for (const [where, view] of views) {
    const text = JSON.stringify(view)
    assert.ok(text.includes('Tiny models at the edge') && text.includes('Under review paper'), `${where}: the public papers are there`)
    assert.ok(!text.includes(SECRET), `${where}: a hidden value`)
    assert.ok(!text.includes('SUBMITTED-TO'), `${where}: where a paper under review was submitted`)
    assert.ok(!text.includes('STATUSLESS'), `${where}: a paper without a valid status`)
    for (const title of ['No status yet', 'Status hidden', 'Unknown status']) assert.ok(!text.includes(title), `${where}: ${title}`)
  }
  const owner = data.readCvOwnerNames()
  assert.ok(owner.latin.length && owner.cjk.includes('李彦霈'))
})

test('the switches: website off → no page; CV off → the CV views have none; all hidden → no page', async () => {
  await writeCvData(cv({ showOnWebsite: false }))
  assert.equal(data.buildPublicationsPage(), null)
  assert.equal(data.hasPublicationsPage(), false)
  assert.equal(readPublicCvSections('cv', ['publications']).en.length, 1, 'still on the CV')

  await writeCvData(cv({ isVisible: false }))
  assert.equal(readPublicCvSections('cv', ['publications']).en.length, 0)
  assert.ok(data.hasPublicationsPage(), 'still on the website')

  await writeCvData(cv({ hiddenFields: ['papers'] }))
  assert.equal(data.hasPublicationsPage(), false)
})

test('the Chinese list is used only when the English CV has no public paper', async () => {
  const doc = cv()
  doc.en[1] = { ...doc.en[1], papers: [] } as any
  await writeCvData(doc)
  const page = data.buildPublicationsPage()
  assert.ok(page)
  assert.equal(page.lang, 'zh')
})

test('CV writes regenerate /publications; the sitemap lists it only while it exists', async () => {
  const cvMod = await import('../pages/api/cvdata')
  assert.ok(cvMod.CV_STATIC_PATHS.includes('/publications'))
  const sitemap = fs.readFileSync(path.join(originalCwd, 'pages/sitemap.xml.tsx'), 'utf8')
  assert.match(sitemap, /\.\.\.\(hasPublicationsPage\(\) \? \[\{ path: '\/publications'/)
})

/** Call an API handler as the admin with a mock response that records res.revalidate(). */
async function callAdmin(handler: (req: any, res: any) => unknown, method: string, body?: unknown) {
  const token = jwt.sign({ role: 'admin', email: 'owner@example.test' }, 'publications-leak-secret', { algorithm: 'HS256' })
  return callApi(handler, method, body, token)
}

/** Call an API handler as an anonymous visitor. */
function callPublic(handler: (req: any, res: any) => unknown, method: string) {
  return callApi(handler, method)
}

async function callApi(handler: (req: any, res: any) => unknown, method: string, body?: unknown, token?: string) {
  const out = { statusCode: 200, body: undefined as any, revalidated: [] as string[], headers: {} as Record<string, string> }
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
  const cookies = token ? { cv_admin_token: token } : {}
  const headers = token ? { cookie: `cv_admin_token=${token}` } : {}
  await handler({ method, query: {}, body, cookies, headers, socket: { remoteAddress: '127.0.0.1' } }, res)
  return out
}

test('a CV save that makes /publications appear or disappear also regenerates the other ISR pages (their nav link)', async () => {
  const cvMod = await import('../pages/api/cvdata')
  await writeCvData({ en: [personal('en')], zh: [personal('zh')] })
  const appear = await callAdmin(cvMod.default, 'PUT', cv())
  assert.equal(appear.statusCode, 200, JSON.stringify(appear.body))
  for (const p of ['/now', '/publications', '/blog', '/work', '/uses', '/contact', '/cv', '/']) assert.ok(appear.revalidated.includes(p), `${p} regenerated`)
  assert.ok(!appear.revalidated.includes('/colophon'), 'the build-time /colophon is left alone')
  // Every path is rendered twice (the confirm pass) but reported once.
  const unique = (list: string[]) => Array.from(new Set(list)).sort()
  assert.deepEqual([...appear.body.revalidated].sort(), unique(appear.revalidated))

  const edit = cv()
  edit.en[1] = { ...edit.en[1], headerName: 'Papers' } as any
  const same = await callAdmin(cvMod.default, 'PUT', edit)
  assert.deepEqual(unique(same.revalidated), [...cvMod.CV_STATIC_PATHS].sort(), 'no change in the nav: only the CV pages')

  // Next keeps the last 200 copy of an ISR page on disk when it turns notFound:
  // a CV write that removes the last paper deletes it, so a restart cannot serve it.
  const cached = persistedPage()
  const gone = await callAdmin(cvMod.default, 'PUT', { en: [personal('en')], zh: [personal('zh')] })
  assert.ok(gone.revalidated.includes('/blog') && gone.revalidated.includes('/publications'))
  assert.equal(data.hasPublicationsPage(), false)
  for (const f of cached.page) assert.equal(fs.existsSync(f), false, `${f} removed`)
  for (const f of cached.others) assert.equal(fs.existsSync(f), true, `${f} kept`)
})

/** Plant Next-style persisted ISR files for /publications (and /blog) under ./.next/server. */
function persistedPage() {
  const server = path.join(process.cwd(), '.next', 'server')
  const route = path.join(server, 'route-cache', 'PAGES', 'build-key', '$')
  fs.mkdirSync(route, { recursive: true })
  fs.mkdirSync(path.join(server, 'pages'), { recursive: true })
  const page = [...['html', 'json', 'meta'].map((x) => path.join(route, `publications.${x}`)), path.join(server, 'pages', 'publications.html')]
  const others = [path.join(route, 'blog.html'), path.join(server, 'pages', 'publications.js')]
  for (const f of [...page, ...others]) fs.writeFileSync(f, 'x')
  return { page, others }
}

test('the persisted /publications page is removed (server start); other pages are kept', async () => {
  const { forgetPersistedPublicationsPage } = await import('../lib/publicationsCache')
  const files = persistedPage()
  assert.equal(forgetPersistedPublicationsPage().length, 4)
  for (const f of files.page) assert.equal(fs.existsSync(f), false)
  for (const f of files.others) assert.equal(fs.existsSync(f), true)
  assert.deepEqual(forgetPersistedPublicationsPage(), [], 'nothing left to remove')
  assert.deepEqual(forgetPersistedPublicationsPage(path.join(tmp, 'missing')), [], 'no cache directory: nothing to do')
  // At server start the general clean-up runs (lib/isrPages: /publications without a paper, gone posts and case studies).
  assert.match(fs.readFileSync(path.join(originalCwd, 'instrumentation.ts'), 'utf8'), /forgetVanishedContentPages\(\)/)
})

test('chrome: the nav link, the edit target and analytics know /publications', () => {
  assert.equal(navLinksFor(), PRIMARY_LINKS)
  assert.equal(navLinksFor({ publications: false }), PRIMARY_LINKS)
  const withPubs = navLinksFor({ publications: true }).map((l) => l.url)
  assert.deepEqual(withPubs, ['/', '/about', '/work', '/blog', '/cv', '/publications', '/now', '/uses', '/contact'])
  assert.deepEqual(adminEditTarget('/publications', undefined), { label: 'Edit publications in CV Studio', href: '/admin/dashboard?tab=cv' })
  assert.equal(normalizeTrackedPath('/publications'), '/publications')
  assert.equal(normalizeTrackedPath('/publications/'), '/publications')
})

test('Studio: a shared value reaches the aligned twin only when linked', () => {
  const doc: Doc = {
    en: [{ sessionName: 'publications', papers: [{ title: 'A', status: '' }] }],
    zh: [{ sessionName: 'publications', papers: [{ title: '甲', status: '' }] }],
  }
  const path = [0, 'papers', 0, 'status']
  const linked = setSharedValue(doc, 'en', path, 'accepted', true)
  assert.equal(linked.reached, true)
  assert.equal(linked.doc.zh[0].papers[0].status, 'accepted')
  assert.equal(linked.doc.zh[0].papers[0].title, '甲', 'text stays per language')
  const unlinked = setSharedValue(doc, 'en', path, 'accepted', false)
  assert.equal(unlinked.reached, false)
  assert.equal(unlinked.doc.zh[0].papers[0].status, '')
  // Lists of different lengths: index 0 is not known to be the same paper.
  const misaligned: Doc = { ...doc, zh: [{ sessionName: 'publications', papers: [] }] }
  const r = setSharedValue(misaligned, 'en', path, 'accepted', true)
  assert.equal(r.reached, false)
  assert.deepEqual(r.doc.zh, misaligned.zh)
})
