/**
 * search-ask (F4 / J1): the whole index builder (buildSearchIndexWithPassages,
 * what GET /api/search-index serves) against a throw-away content store in a
 * temp directory: drafts, a hidden entry and section, a hidden
 * introduction, a recommendation without consent, a hidden name and the
 * contact details never appear in the documents or the "Ask" passages; the
 * visible counterparts do.
 *
 * Every module that reaches the content store is imported only after the
 * working directory has moved to the temp store (lib/db resolves data/ from
 * the working directory when it loads).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'search-ask-leak-'))
let search: typeof import('../lib/searchIndex')
let db: typeof import('../lib/db')

const STORE_CV = {
  en: [
    {
      sessionName: 'personalInformation',
      firstName: 'Example',
      lastName: 'Person',
      nickName: 'Zedname',
      email: 'example.person@example.com',
      phoneNumber: '+852 5555 0199',
      introduction: 'ZZ-HIDDEN-INTRO-ZZ builds things.',
      hiddenFields: ['introduction', 'nickName'],
    },
    {
      sessionName: 'workExperience',
      experiences: [
        { jobTitle: 'Example Engineer', companyName: 'Example Co', startDate: '2024-01', endDate: '2025-06', jobDescription: 'Built example systems.', features: [{ description: 'Shipped the visible feature' }] },
        { jobTitle: 'ZZ-HIDDEN-ROLE-ZZ', companyName: 'Hidden Co', startDate: '2023-01', endDate: '2023-06', isVisible: false },
      ],
    },
    {
      sessionName: 'recommendations',
      items: [
        { quote: 'ZZ-NO-CONSENT-ZZ said something.', name: 'Example Colleague', permission: false },
        { quote: 'A thoughtful example colleague to work with.', name: 'Example Manager', permission: true },
      ],
    },
    { sessionName: 'patents', isVisible: false, patentExperience: [{ title: 'ZZ-HIDDEN-SECTION-ZZ', patents: ['ZZ-HIDDEN-SECTION-ZZ'] }] },
  ],
  zh: [
    { sessionName: 'workExperience', experiences: [{ jobTitle: '示例工程师', companyName: '示例公司', startDate: '2024-01', endDate: '2025-06', jobDescription: '构建示例系统。' }] },
  ],
}

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  db = await import('../lib/db')
  const store = await import('../lib/contentStore')
  search = await import('../lib/searchIndex')
  await store.putItem('blog', 'visible-post', { title: 'Visible post', date: '2026-05-30', description: 'A visible example post about edge sorting.' }, 'The visible paragraph about servos and sorting belts.')
  await store.putItem('blog', 'draft-post', { title: 'ZZ-DRAFT-TITLE-ZZ', date: '2026-06-01', draft: true }, 'ZZ-DRAFT-BODY-ZZ paragraph that is long enough to quote.')
  await store.putItem('work', 'draft-case', { title: 'ZZ-DRAFT-CASE-ZZ', draft: true }, 'ZZ-DRAFT-CASE-BODY-ZZ paragraph that is long enough to quote.')
  await store.putKv('cvdata', STORE_CV)
})

after(() => {
  db.closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('GET /api/search-index content: no draft, hidden entry, hidden section, hidden introduction, consent-less quote, hidden name or contact detail', async () => {
  const index = await search.buildSearchIndexWithPassages()
  const json = JSON.stringify(index)
  for (const needle of ['ZZ-DRAFT-TITLE-ZZ', 'ZZ-DRAFT-BODY-ZZ', 'ZZ-DRAFT-CASE-ZZ', 'ZZ-DRAFT-CASE-BODY-ZZ', 'ZZ-HIDDEN-ROLE-ZZ', 'ZZ-HIDDEN-SECTION-ZZ', 'ZZ-HIDDEN-INTRO-ZZ', 'ZZ-NO-CONSENT-ZZ', 'zedname', 'Zedname', 'example.person@example.com', '5555 0199']) {
    assert.ok(!json.includes(needle), `${needle} must not be served`)
  }
  // Controls: the visible content is there, in both parts of the index.
  const passages = index.ask!.passages.map((p) => p.t)
  assert.ok(index.docs.some((d) => d.title === 'Example Engineer'))
  assert.ok(index.docs.some((d) => d.title === '示例工程师'))
  assert.ok(passages.includes('Built example systems.'))
  assert.ok(passages.includes('构建示例系统。'))
  assert.ok(passages.includes('A thoughtful example colleague to work with.'))
  assert.ok(passages.includes('The visible paragraph about servos and sorting belts.'))
  assert.deepEqual([...(index.subject || [])].sort(), ['example', 'person'], 'only the public names are shipped')
})
