/**
 * cv-docs E6: the richer Person entity (lib/personExtras.ts, lib/schema.ts
 * personNode, the shared loader lib/personFacts.ts) — completed degrees
 * only, awards, languages with BCP 47 codes, a current role / study only
 * when genuinely current, skills de-duplicated ignoring case and
 * parentheses, dateModified from the CV and home saves, public data only.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { publicSections } from '../lib/cvVisibility'
import { languageCode, personExtrasFromCv } from '../lib/personExtras'
import { personFactsFromCv, personNode, profilePageNode, uniqueSkills } from '../lib/schema'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]

const NOW = '2026-10'

const education = {
  sessionName: 'education',
  educationExperience: [
    { schoolName: 'Uni Now', degree: 'MSc in AI', startDate: '2026-09', endDate: '2028-12' },
    { schoolName: 'Uni Done', degree: 'BSc Computer Engineering', startDate: '2024-09', endDate: '2026-06' },
    { schoolName: 'Uni Hidden End', degree: 'Diploma', startDate: '2019-09', endDate: '2021-06', hiddenFields: ['endDate'] },
    { schoolName: 'Uni Gone', degree: 'Associate', endDate: '2022-06', isVisible: false },
  ],
}
const work = (end: string, extra: Record<string, unknown> = {}) => ({
  sessionName: 'workExperience',
  experiences: [{ jobTitle: 'CTO', companyName: 'Startup', companyURL: 'startup.example', startDate: '2024-11', endDate: end, ...extra }],
})
const awards = {
  sessionName: 'competitionAwards',
  awards: [
    { contestName: 'IEEE Xtreme', award: '18th Worldwide' },
    { contestName: 'Hidden Contest', award: 'Winner', isVisible: false },
  ],
}
const languages = { sessionName: 'extraSkill', points: ['Mandarin: Native', 'English: Fluent', 'Cantonese: Basic', 'Klingon: Hobby'] }

test('completed degrees only: not in progress, not with a hidden end date, not hidden', () => {
  const x = personExtrasFromCv(publicSections([education], 'website'), NOW)
  assert.deepEqual(x.hasCredential, [{ name: 'BSc Computer Engineering', school: 'Uni Done', date: '2026-06' }])
  assert.deepEqual(x.affiliation, [{ name: 'Uni Now' }], 'a running study is an affiliation, not a credential')
})

test('a role is current only while it runs: Present or a future end, already started, end date visible', () => {
  const current = personExtrasFromCv(publicSections([work('Present')], 'website'), NOW)
  assert.equal(current.jobTitle, 'CTO')
  assert.deepEqual(current.worksFor, { name: 'Startup', url: 'https://startup.example' })
  assert.equal(personExtrasFromCv(publicSections([work('2026-03')], 'website'), NOW).worksFor, undefined, 'ended in March')
  assert.equal(personExtrasFromCv(publicSections([work('Present', { hiddenFields: ['endDate'] })], 'website'), NOW).worksFor, undefined, 'hidden end date is not "current"')
  assert.equal(personExtrasFromCv(publicSections([work('Present', { startDate: '2027-01' })], 'website'), NOW).worksFor, undefined, 'not started yet')
})

test('awards and languages (with codes for known names)', () => {
  const x = personExtrasFromCv(publicSections([awards, languages], 'website'), NOW)
  assert.deepEqual(x.award, ['IEEE Xtreme — 18th Worldwide'])
  assert.deepEqual(x.knowsLanguage, [
    { name: 'Mandarin', code: 'cmn' },
    { name: 'English', code: 'en' },
    { name: 'Cantonese', code: 'yue' },
    { name: 'Klingon' },
  ])
  assert.equal(languageCode('粤语'), 'yue')
  assert.equal(languageCode('普通话'), 'cmn')
})

test('the Person node prints the new facts as schema.org types; dateModified stays off the node', () => {
  const node: any = personNode({
    ...personExtrasFromCv(publicSections([education, work('Present'), awards, languages], 'website'), NOW),
    dateModified: '2026-10-13T00:35:19.000Z',
  })
  assert.equal(node.jobTitle, 'CTO')
  assert.deepEqual(node.worksFor, { '@type': 'Organization', name: 'Startup', url: 'https://startup.example' })
  assert.deepEqual(node.hasCredential, [
    {
      '@type': 'EducationalOccupationalCredential',
      name: 'BSc Computer Engineering',
      credentialCategory: 'degree',
      recognizedBy: { '@type': 'EducationalOrganization', name: 'Uni Done' },
      dateCreated: '2026-06',
    },
  ])
  assert.deepEqual(node.affiliation, [{ '@type': 'EducationalOrganization', name: 'Uni Now' }])
  assert.deepEqual(node.award, ['IEEE Xtreme — 18th Worldwide'])
  assert.deepEqual(node.knowsLanguage[0], { '@type': 'Language', name: 'Mandarin', alternateName: 'cmn' })
  assert.equal(node.dateModified, undefined)
  const text = JSON.stringify(node)
  for (const gone of ['Uni Gone', 'Hidden Contest', 'Uni Hidden End']) assert.ok(!text.includes(gone), gone)
  // Without a current role the site-wide default job title stays and there is no employer.
  const past: any = personNode(personExtrasFromCv(publicSections([work('2025-01')], 'website'), NOW))
  assert.equal(past.jobTitle, 'Software Engineer')
  assert.equal(past.worksFor, undefined)
  assert.equal(profilePageNode({ path: '/', dateModified: '2026-10-13T00:35:19.000Z' }).dateModified, '2026-10-13T00:35:19.000Z')
})

test('skills are de-duplicated ignoring case, width and parenthesised notes', () => {
  assert.deepEqual(uniqueSkills(['MongoDB', 'mongodb (NoSQL)', 'MongoDB（NoSQL）', 'Next.js', 'next.js ', 'React']), ['MongoDB', 'Next.js', 'React'])
  const facts = personFactsFromCv(publicSections([{ sessionName: 'skill', languages: [{ language: 'MongoDB' }], technical: [{ name: 'DB', description: ['MongoDB (NoSQL)', 'Redis'] }] }], 'website'))
  assert.deepEqual(facts.knowsAbout, ['MongoDB', 'Redis'])
  assert.deepEqual((personNode({ knowsAbout: ['Python', 'python'] }) as any).knowsAbout, ['Python'])
})

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-docs-person-'))
before(() => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
})
after(async () => {
  const { closeDb } = await import('../lib/db')
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('the shared loader merges the extras and stamps dateModified with the later of the CV / home saves', async () => {
  const { writeCvData } = await import('../lib/cvdata')
  const { writeHome } = await import('../lib/home')
  const { getKvMeta } = await import('../lib/contentStore')
  const { loadPersonFacts } = await import('../lib/personFacts')
  assert.equal((await writeCvData({ en: [{ sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li' }, education, work('Present'), awards, languages], zh: [] })).ok, true)
  assert.equal((await writeHome({ hero: { welcome: '', brand: 'B', tagline: 't', avatarUrl: '' }, socials: {}, brands: [], quickAccess: [], photos: [] } as any)).ok, true)
  const facts = loadPersonFacts(NOW)
  assert.equal(facts.jobTitle, 'CTO')
  assert.equal(facts.hasCredential?.length, 1)
  assert.equal(facts.knowsLanguage?.length, 4)
  const stamp = Math.max(getKvMeta('cvdata')!.updatedAt, getKvMeta('home')!.updatedAt)
  assert.equal(facts.dateModified, new Date(stamp).toISOString())
  // Same facts every call: the pages share one entity.
  assert.deepEqual(loadPersonFacts(NOW), facts)
})
