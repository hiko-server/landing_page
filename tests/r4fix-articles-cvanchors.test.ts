/**
 * CV search docs link to the anchors /cv actually renders: the public A4 CV
 * audience (readPublicCvData('cv')), `cv-<section>` / `cv-<section>-<i>`
 * with i = position in the public pruned list, certificates numbered across
 * all visible issuers (components/CVViewerPage/fields indexedCertificates).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { publicSections } from '../lib/cvVisibility'
import { cvEntryAnchor, indexedCertificates, indexedList } from '../components/CVViewerPage/fields'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r4fix-articles-cvanchors-'))
let search: typeof import('../lib/searchIndex')
let db: typeof import('../lib/db')

const EN = [
  { sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li', email: 'owner@example.com', isVisible: true },
  {
    sessionName: 'workExperience',
    isVisible: true,
    // On the A4 CV but not on the website: /cv renders it, so search must index it.
    showOnWebsite: false,
    experiences: [
      { jobTitle: 'Hidden Role', companyName: 'Gone', isVisible: false },
      { jobTitle: 'Engineer', companyName: 'Acme', startDate: '2024-01', endDate: '2025-06' },
      { jobTitle: '', companyName: 'Untitled entry still counts' },
      { jobTitle: 'Lead', companyName: 'Beta', startDate: '2025-07', endDate: '2025-12' },
    ],
  },
  {
    sessionName: 'education',
    isVisible: true,
    hiddenItems: { educationExperience: [0] },
    educationExperience: [{ schoolName: 'Hidden School' }, { schoolName: 'HKU', degree: 'BEng' }],
  },
  // On the website only: /cv does not render it, so it must not be indexed.
  { sessionName: 'project', isVisible: false, showOnWebsite: true, projectExperience: [{ title: 'Website-only project' }] },
  {
    sessionName: 'certification',
    isVisible: true,
    certifications: [
      { issuingOrganization: 'Hidden Org', isVisible: false, CertificationList: [{ certificationName: 'Hidden Cert' }] },
      {
        issuingOrganization: 'AWS',
        CertificationList: [
          { certificationName: 'Cloud Practitioner', issuedDate: '2024-03' },
          { certificationName: 'Switched off', isVisible: false },
          { certificationName: 'Solutions Architect', issuedDate: '2024-09' },
        ],
      },
      { issuingOrganization: 'CNCF', CertificationList: [{ certificationName: 'CKA', issuedDate: '2025-01' }] },
    ],
  },
  {
    sessionName: 'competitionAwards',
    isVisible: true,
    awards: [
      { contestName: 'Redacted title', hiddenFields: ['contestName'], award: 'Gold' },
      { contestName: 'Hackathon', award: 'First' },
    ],
  },
  { sessionName: 'skill', isVisible: true, technical: [{ name: 'Languages', description: ['TypeScript', 'Python'] }] },
]

const hrefOf = (docs: { title: string; href: string }[], title: string) => docs.find((d) => d.title === title)?.href

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  db = await import('../lib/db')
  const store = await import('../lib/contentStore')
  search = await import('../lib/searchIndex')
  await store.putKv('cvdata', { en: EN, zh: [] })
})

after(() => {
  db.closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('entry anchors are positions in the public pruned list (hidden entries do not count, untitled ones do)', () => {
  const docs = search.cvSearchDocs(publicSections(EN, 'cv'))
  assert.equal(hrefOf(docs, 'Engineer'), '/cv#cv-workExperience-0')
  assert.equal(hrefOf(docs, 'Lead'), '/cv#cv-workExperience-2')
  assert.equal(hrefOf(docs, 'HKU'), '/cv#cv-education-0')
  assert.equal(hrefOf(docs, 'Hackathon'), '/cv#cv-competitionAwards-1')
  const titles = docs.map((d) => d.title)
  for (const hidden of ['Hidden Role', 'Hidden School', 'Redacted title', 'Hidden Cert', 'Switched off']) {
    assert.ok(!titles.includes(hidden), `${hidden} is not indexed`)
  }
})

test('certificates are numbered across all visible issuers, exactly like the sheet', () => {
  const sections = publicSections(EN, 'cv')
  const docs = search.cvSearchDocs(sections)
  assert.equal(hrefOf(docs, 'Cloud Practitioner'), '/cv#cv-certification-0')
  assert.equal(hrefOf(docs, 'Solutions Architect'), '/cv#cv-certification-1')
  assert.equal(hrefOf(docs, 'CKA'), '/cv#cv-certification-2')
  assert.equal(docs.find((d) => d.title === 'CKA')!.description, 'CNCF · Jan 2025')
  // Same ids the renderers give (Certification.tsx / ReadingView via indexedCertificates).
  const certs = sections.find((s) => s.sessionName === 'certification')
  const rendered = indexedCertificates(certs).map(({ cert, index }) => [cert.certificationName, `/cv#${cvEntryAnchor('certification', index)}`])
  for (const [name, href] of rendered) assert.equal(hrefOf(docs, name), href)
  const work = sections.find((s) => s.sessionName === 'workExperience')
  for (const { item, index } of indexedList(work, 'experiences')) {
    if (item.jobTitle) assert.equal(hrefOf(docs, item.jobTitle), `/cv#${cvEntryAnchor('workExperience', index)}`)
  }
})

test('skill groups link to the section anchor', () => {
  const docs = search.cvSearchDocs(publicSections(EN, 'cv'))
  const skill = docs.find((d) => d.title === 'Languages')!
  assert.equal(skill.href, '/cv#cv-skill')
  assert.deepEqual(skill.tags, ['TypeScript', 'Python'])
})

test('the index uses the /cv audience: CV-only sections indexed, website-only sections absent', () => {
  const index = search.buildSearchIndex()
  const cv = index.docs.filter((d) => d.kind === 'cv')
  assert.equal(hrefOf(cv, 'Engineer'), '/cv#cv-workExperience-0')
  assert.equal(hrefOf(cv, 'CKA'), '/cv#cv-certification-2')
  assert.ok(!cv.some((d) => d.title === 'Website-only project'))
  assert.ok(!JSON.stringify(index).includes('owner@example.com'), 'contact details never indexed')
})
