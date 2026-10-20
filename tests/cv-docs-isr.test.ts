/**
 * cv-docs G1 + E2 / E5 endpoints, against a throw-away content store:
 *   - /cv and /cv/zh are ISR: getStaticProps returns the page data with a
 *     time-based revalidate (60 s; 1 s during `next build`), the
 *     "Updated" month, the download stem and the skill evidence;
 *   - GET /api/cv/export (behind /cv.pdf, /cv.txt, /cv.json, /cv/zh.*):
 *     content type, dated inline file name, strong ETag that changes with
 *     a CV save, 304 on If-None-Match, HEAD without a body, 400 / 404 / 405.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadPdfFonts } from '../lib/cvExport/pdf'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'NEXT_PHASE']) delete process.env[k]

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-docs-isr-'))

before(() => {
  // Fonts are read from the app root once per process; load them before leaving it.
  loadPdfFonts(originalCwd)
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
})
after(async () => {
  const { closeDb } = await import('../lib/db')
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const cvDoc = (title: string) => ({
  en: [
    { sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li', email: 'owner@example.test', introduction: 'Secret intro', hiddenFields: ['introduction'] },
    { sessionName: 'skill', headerName: 'SKILLS', languages: [{ language: 'Python', level: 'Proficient' }], technical: [] },
    { sessionName: 'project', headerName: 'PROJECTS', projectExperience: [{ title, description: 'Python tooling.', startDate: '2024-01', endDate: '2024-06' }] },
  ],
  zh: [
    { sessionName: 'personalInformation', firstName: '彦霈', lastName: '李' },
    { sessionName: 'project', headerName: '项目', projectExperience: [{ title: `${title}（中文）`, description: '使用 Python。' }] },
  ],
})

type Res = { statusCode: number; headers: Record<string, string>; body: Buffer | string | undefined }

async function call(query: Record<string, string>, opts: { method?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  const { default: handler } = await import('../pages/api/cv/export')
  const out: Res = { statusCode: 200, headers: {}, body: undefined }
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(c: number) {
      out.statusCode = c
    },
    headersSent: false,
    writableEnded: false,
    status(c: number) {
      out.statusCode = c
      return res
    },
    setHeader(k: string, v: unknown) {
      out.headers[k.toLowerCase()] = String(v)
      return res
    },
    getHeader(k: string) {
      return out.headers[k.toLowerCase()]
    },
    removeHeader(k: string) {
      delete out.headers[k.toLowerCase()]
    },
    json(b: unknown) {
      out.body = JSON.stringify(b)
      res.writableEnded = true
      return res
    },
    send(b: any) {
      out.body = b
      res.writableEnded = true
      return res
    },
    end(b?: any) {
      out.body = b
      res.writableEnded = true
      return res
    },
  }
  await handler({ method: opts.method || 'GET', query, headers: opts.headers || {}, socket: { remoteAddress: '127.0.0.1' } } as any, res)
  return out
}

test('nothing published yet: 404 for the files, no download stem on the page', async () => {
  const r = await call({ lang: 'en', format: 'pdf' })
  assert.equal(r.statusCode, 404)
  assert.equal(r.headers['cache-control'], 'no-store')
  const { loadCvPageProps } = await import('../lib/cvPage')
  const page: any = await loadCvPageProps('en')
  assert.equal(page.props.fileBase, '')
  assert.equal(page.revalidate, 60)
})

test('the pages are getStaticProps (ISR) pages that delegate to lib/cvPage', () => {
  for (const [file, lang] of [['pages/cv/index.tsx', 'en'], ['pages/cv/zh.tsx', 'zh']]) {
    const src = fs.readFileSync(path.join(originalCwd, file), 'utf8')
    assert.ok(/export const getStaticProps\b/.test(src), `${file}: getStaticProps`)
    assert.ok(!/getServerSideProps/.test(src), `${file}: no getServerSideProps`)
    assert.ok(src.includes(`loadCvPageProps('${lang}')`), `${file}: loads ${lang}`)
  }
})

test('/cv and /cv/zh are ISR with a 60 s revalidation (1 s at build time) and carry the new page data', async () => {
  const { writeCvData } = await import('../lib/cvdata')
  assert.equal((await writeCvData(cvDoc('Scraper'))).ok, true)
  const { loadCvPageProps } = await import('../lib/cvPage')
  const en: any = await loadCvPageProps('en')
  const zh: any = await loadCvPageProps('zh')
  assert.equal(en.revalidate, 60)
  assert.equal(zh.revalidate, 60)
  assert.match(en.props.updatedMonth, /^\d{4}-\d{2}$/)
  assert.match(en.props.updatedIso, /^\d{4}-\d{2}-\d{2}T/)
  assert.match(en.props.fileBase, /^Li-Yanpei-CV-\d{4}-\d{2}$/)
  assert.match(zh.props.fileBase, /^Li-Yanpei-CV-zh-\d{4}-\d{2}$/, 'the Chinese file is named from the English name')
  assert.equal(en.props.lang, 'en')
  assert.equal(zh.props.lang, 'zh-Hans')
  assert.equal(zh.props.nameZh, '李彦霈')
  assert.deepEqual(en.props.skillEvidence.map((e: any) => [e.name, e.items.map((i: any) => i.href)]), [['Python', ['#cv-project-0']]])
  assert.deepEqual(en.props.skillLinks, { Python: 'skill-python' })
  assert.ok(!JSON.stringify(en.props).includes('Secret intro'), 'hidden fields never reach the page props')
  assert.ok(!JSON.stringify(zh.props.sections).includes('Scraper"'), 'the Chinese page ships only Chinese sections')

  process.env.NEXT_PHASE = 'phase-production-build'
  try {
    const built: any = await loadCvPageProps('en')
    assert.equal(built.revalidate, 1, 'a build-time copy is replaced on the first request')
  } finally {
    delete process.env.NEXT_PHASE
  }
})

test('the export endpoint: types, dated inline names, canonical link, strong ETag, 304, HEAD', async () => {
  const pdf = await call({ lang: 'en', format: 'pdf' })
  assert.equal(pdf.statusCode, 200)
  assert.equal(pdf.headers['content-type'], 'application/pdf')
  assert.match(pdf.headers['content-disposition'], /^inline; filename="Li-Yanpei-CV-\d{4}-\d{2}\.pdf"/)
  assert.equal(pdf.headers['cache-control'], 'public, max-age=0, must-revalidate')
  assert.match(pdf.headers.etag, /^"[A-Za-z0-9_-]{32}"$/)
  assert.equal(pdf.headers.link, '<https://lucian-dev.com/cv>; rel="canonical"')
  assert.equal(pdf.headers['x-robots-tag'], undefined, 'the PDF may be indexed (canonical → /cv)')
  assert.ok(Buffer.isBuffer(pdf.body) && (pdf.body as Buffer).subarray(0, 8).toString() === '%PDF-1.7')
  assert.equal(pdf.headers['content-length'], String((pdf.body as Buffer).length))

  const again = await call({ lang: 'en', format: 'pdf' }, { headers: { 'if-none-match': pdf.headers.etag } })
  assert.equal(again.statusCode, 304)
  assert.equal(again.body, undefined)
  assert.equal(again.headers.etag, pdf.headers.etag)

  const head = await call({ lang: 'en', format: 'pdf' }, { method: 'HEAD' })
  assert.equal(head.statusCode, 200)
  assert.equal(head.body, undefined)
  assert.equal(head.headers['content-length'], pdf.headers['content-length'])

  const txt = await call({ lang: 'zh', format: 'txt' })
  assert.equal(txt.headers['content-type'], 'text/plain; charset=utf-8')
  assert.equal(txt.headers['content-language'], 'zh-Hans')
  assert.equal(txt.headers['x-robots-tag'], 'noindex')
  assert.match(txt.headers['content-disposition'], /filename="Li-Yanpei-CV-zh-\d{4}-\d{2}\.txt"/)
  assert.ok((txt.body as Buffer).toString('utf8').startsWith('李彦霈\n'))

  const json = await call({ lang: 'en', format: 'json' })
  const resume = JSON.parse((json.body as Buffer).toString('utf8'))
  assert.equal(resume.basics.name, 'Li Yanpei')
  assert.equal(resume.projects[0].name, 'Scraper')
  assert.ok(!JSON.stringify(resume).includes('Secret intro'))
})

test('a CV save changes the file and its ETag (no stale copy is served)', async () => {
  const before = await call({ lang: 'en', format: 'pdf' })
  const beforeTxt = await call({ lang: 'en', format: 'txt' })
  const { writeCvData } = await import('../lib/cvdata')
  assert.equal((await writeCvData(cvDoc('Crawler'))).ok, true)
  const after = await call({ lang: 'en', format: 'pdf' })
  const afterTxt = await call({ lang: 'en', format: 'txt' })
  assert.notEqual(after.headers.etag, before.headers.etag)
  assert.notEqual(afterTxt.headers.etag, beforeTxt.headers.etag)
  assert.ok((afterTxt.body as Buffer).toString('utf8').includes('Crawler'))
  const stale = await call({ lang: 'en', format: 'pdf' }, { headers: { 'if-none-match': before.headers.etag } })
  assert.equal(stale.statusCode, 200, 'the old ETag no longer matches')
})

test('bad requests', async () => {
  assert.equal((await call({ lang: 'fr', format: 'pdf' })).statusCode, 400)
  assert.equal((await call({ lang: 'en', format: 'docx' })).statusCode, 400)
  const post = await call({ lang: 'en', format: 'pdf' }, { method: 'POST' })
  assert.equal(post.statusCode, 405)
  assert.equal(post.headers.allow, 'GET, HEAD')
})

test('CV-L-2: the page names its files only with what the web view AND the files show — a name kept to downloads stays off /cv', async () => {
  const { writeCvData } = await import('../lib/cvdata')
  const { loadCvPageProps } = await import('../lib/cvPage')
  const withName = (fieldsOnlyIn: Record<string, string[]>) => {
    const doc = cvDoc('Name check')
    const pi = { sessionName: 'personalInformation', firstName: 'Zqfirst', lastName: 'Zqlast', email: 'person@example.test', fieldsOnlyIn }
    return { en: [pi, ...doc.en.slice(1)], zh: [{ ...pi, firstName: '名', lastName: '姓' }, ...doc.zh.slice(1)] }
  }
  // Kept to the downloads: not in the page props (= __NEXT_DATA__, the download attributes, the JSON-LD encoding names) …
  assert.equal((await writeCvData(withName({ firstName: ['download'], lastName: ['download'] }))).ok, true)
  for (const lang of ['en', 'zh'] as const) {
    const page: any = await loadCvPageProps(lang)
    assert.match(page.props.fileBase, lang === 'en' ? /^CV-\d{4}-\d{2}$/ : /^CV-zh-\d{4}-\d{2}$/, `${lang}: ${page.props.fileBase}`)
    assert.ok(!JSON.stringify(page.props).includes('Zqfirst') && !JSON.stringify(page.props).includes('Zqlast'), `${lang}: nowhere in the page data`)
  }
  // … while the file itself is still named in full (the download surface shows the name).
  const pdf = await call({ lang: 'en', format: 'pdf' })
  assert.match(pdf.headers['content-disposition'], /filename="Zqlast-Zqfirst-CV-\d{4}-\d{2}\.pdf"/)

  // Kept to the web pages: the page does not claim a name the files do not carry.
  assert.equal((await writeCvData(withName({ firstName: ['web'], lastName: ['web'] }))).ok, true)
  assert.match((await loadCvPageProps('en') as any).props.fileBase, /^CV-\d{4}-\d{2}$/)
  // Shown everywhere: the usual name.
  assert.equal((await writeCvData(withName({}))).ok, true)
  assert.match((await loadCvPageProps('en') as any).props.fileBase, /^Zqlast-Zqfirst-CV-\d{4}-\d{2}$/)
})
