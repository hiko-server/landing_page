/**
 * Public search index for ⌘K (C5): posts, case studies, pages and the
 * public website CV — hidden CV content and drafts never appear. Runs
 * against a throw-away content store in a temp directory.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-articles-search-'))
let search: typeof import('../lib/searchIndex')
let db: typeof import('../lib/db')

const CV = {
  en: [
    {
      sessionName: 'personalInformation',
      firstName: 'Yanpei',
      lastName: 'Li',
      email: 'owner@example.com',
      phoneNumber: '+852 0000 0000',
      isVisible: true,
    },
    {
      sessionName: 'workExperience',
      isVisible: true,
      hiddenItems: { experiences: [1] },
      experiences: [
        { jobTitle: 'Software Engineer', companyName: 'Acme', startDate: '2024-01', endDate: '2025-06', jobDescription: 'Built things.', relatedSkills: ['TypeScript'], features: [{ description: 'Shipped X' }] },
        { jobTitle: 'Secret Role', companyName: 'Hidden Co', startDate: '2023-01', endDate: '2023-06' },
      ],
    },
    { sessionName: 'project', isVisible: false, showOnWebsite: false, projectExperience: [{ title: 'Invisible project' }] },
    {
      sessionName: 'certification',
      isVisible: true,
      certifications: [{ issuingOrganization: 'AWS', CertificationList: [{ certificationName: 'Cloud Practitioner', issuedDate: '2024-03' }] }],
    },
  ],
  zh: [],
}

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  db = await import('../lib/db')
  const store = await import('../lib/contentStore')
  search = await import('../lib/searchIndex')
  await store.putItem('blog', 'post', { title: 'Edge sorting', description: 'Lessons.', date: '2026-05-30', tags: ['Edge AI'] }, [
    'Intro paragraph about servos.',
    '',
    '## Where the time goes',
    '',
    '```python',
    'secret_code_token = 1',
    '```',
    '',
    '### Power integrity',
    '',
    'Grounding matters {expression}.',
  ].join('\n'))
  await store.putItem('blog', 'draft', { title: 'Draft title', date: '2026-06-01', draft: true }, 'Draft body.')
  await store.putItem('work', 'case', { title: 'Case', tech: ['Jetson'] }, 'Case body.')
  await store.putKv('cvdata', CV)
})

after(() => {
  db.closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('posts carry headings and body text without code; drafts are absent', () => {
  const index = search.buildSearchIndex()
  assert.equal(index.v, 1)
  const post = index.docs.find((d) => d.href === '/blog/post')!
  assert.equal(post.kind, 'post')
  assert.deepEqual(post.headings, ['Where the time goes', 'Power integrity'])
  assert.deepEqual(post.tags, ['Edge AI'])
  assert.match(post.body!, /Intro paragraph about servos/)
  assert.ok(!post.body!.includes('secret_code_token'), 'code excluded')
  assert.ok(!post.body!.includes('expression'), 'MDX expressions excluded')
  assert.ok(!index.docs.some((d) => d.title === 'Draft title'))
  const work = index.docs.find((d) => d.href === '/work/case')!
  assert.deepEqual(work.tags, ['Jetson'])
  assert.ok(index.docs.some((d) => d.kind === 'page' && d.href === '/now'))
})

test('CV docs come from the public website CV only (hidden entries and sections absent)', () => {
  const index = search.buildSearchIndex()
  const cv = index.docs.filter((d) => d.kind === 'cv')
  const titles = cv.map((d) => d.title)
  assert.ok(titles.includes('Software Engineer'))
  assert.ok(titles.includes('Cloud Practitioner'))
  assert.ok(!titles.includes('Secret Role'), 'hidden entry absent')
  assert.ok(!titles.includes('Invisible project'), 'hidden section absent')
  const json = JSON.stringify(index)
  assert.ok(!json.includes('owner@example.com') && !json.includes('+852'), 'contact details never indexed')
  const job = cv.find((d) => d.title === 'Software Engineer')!
  assert.equal(job.href, '/cv#cv-workExperience-0')
  assert.equal(job.description, 'Acme · Jan 2024 – Jun 2025')
  assert.equal(cv.find((d) => d.title === 'Cloud Practitioner')!.href, '/cv#cv-certification-0')
})

test('outlineOf tolerates invalid MDX', () => {
  const out = search.outlineOf('Broken <b>\n\n```js\nhidden()\n```\n\nstill searchable')
  assert.match(out.text, /still searchable/)
  assert.ok(!out.text.includes('hidden()'))
})
