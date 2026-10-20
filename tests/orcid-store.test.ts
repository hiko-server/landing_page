/**
 * orcid over a real (temporary) content store: the public readers behind
 * /publications (header iD + ScholarlyArticle author), the shared Person
 * facts (every page's JSON-LD), the /about rail's value and /llms.txt show
 * the iD once it is set — and nothing once the owner hides the field or the
 * section leaves the website.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'orcid-store-secret'

const ID = '0000-0002-1825-0097'
const URL = `https://orcid.org/${ID}`

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orcid-store-'))
let writeCvData: (doc: { en: any[]; zh: any[] }) => Promise<{ ok: boolean }>
let readPublicCvSections: (a: 'cv' | 'website' | 'any', names: readonly string[], langs?: readonly ('en' | 'zh')[]) => { en: any[]; zh: any[] }
let data: typeof import('../lib/publicationsData')
let personFacts: typeof import('../lib/personFacts')
let llms: typeof import('../lib/llms')
let cvLinks: typeof import('../lib/cvLinks')
let closeDb: () => void

const personal = (extra: Record<string, unknown> = {}) => ({
  sessionName: 'personalInformation',
  firstName: 'Example',
  lastName: 'Person',
  nickName: '',
  orcid: ID,
  ...extra,
})
const papers = [{ title: 'An example paper', authors: ['Example Person'], venue: 'Journal of Examples', venueType: 'journal', status: 'published', date: '2025', doi: '10.5555/example' }]
const cv = (extra: Record<string, unknown> = {}, pubExtra: Record<string, unknown> = {}) => ({
  en: [personal(extra), { sessionName: 'publications', headerName: 'Publications', papers, ...pubExtra }],
  zh: [personal({ firstName: '例', lastName: '人', ...extra })],
})

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  const cvdata = await import('../lib/cvdata')
  writeCvData = cvdata.writeCvData as any
  readPublicCvSections = cvdata.readPublicCvSections as any
  data = await import('../lib/publicationsData')
  personFacts = await import('../lib/personFacts')
  llms = await import('../lib/llms')
  cvLinks = await import('../lib/cvLinks')
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('set: /publications shows the iD and names the author by the record URI; Person facts, the rail reader and llms.txt carry it', async () => {
  assert.equal((await writeCvData(cv())).ok, true)
  const page = data.buildPublicationsPage()!
  assert.ok(page)
  assert.equal(page.orcid, ID)
  const article = (page.jsonLd[0] as any).mainEntity.itemListElement[0].item
  assert.equal(article.author[0]['@id'], URL)
  assert.equal(article.author[0]['@type'], 'Person')

  const facts = personFacts.loadPersonFacts('2026-10')
  assert.equal(facts.orcid, ID)

  const pi = readPublicCvSections('website', ['personalInformation'], ['en', 'zh'])
  assert.equal(cvLinks.orcidOf(pi.en[0]) || cvLinks.orcidOf(pi.zh[0]), ID, 'what /about passes to the rail')

  const txt = await llms.loadLlmsTxt()
  assert.ok(txt.includes(`- ORCID iD: ${URL}`), txt)
})

test('the Chinese Personal Info alone is enough for /publications and the rail; a pasted link is served as the bare iD', async () => {
  await writeCvData({ en: [personal({ orcid: '' }), cv().en[1]], zh: [personal({ orcid: `${URL}/` })] })
  assert.equal(data.readPublicationsView().orcid, ID)
  const pi = readPublicCvSections('website', ['personalInformation'], ['en', 'zh'])
  assert.equal(cvLinks.orcidOf(pi.en[0]) || cvLinks.orcidOf(pi.zh[0]), ID)
  assert.equal(data.buildPublicationsPage()!.orcid, ID)
})

test('hidden (the field) or off the website (the section): the iD reaches none of the public readers', async () => {
  for (const [label, document] of [
    ['hidden field', cv({ hiddenFields: ['orcid'] })],
    ['Personal Info off the website', cv({ showOnWebsite: false })],
    // The API refuses a typo on save; the store itself does not validate, so the readers must ignore one that got in (the raw JSON editor, an old backup).
    ['a typo', cv({ orcid: '0000-0002-1825-0098' })],
  ] as const) {
    assert.equal((await writeCvData(document)).ok, true, label)
    const page = data.buildPublicationsPage()!
    assert.ok(page, label)
    assert.equal(page.orcid, '', label)
    assert.ok(!JSON.stringify(page).includes(ID), `${label}: page props / JSON-LD`)
    // With the field hidden the owner stays the site Person; with Personal
    // Info off the website there are no owner names either, so the author
    // is a plain Person. Either way, never the ORCID URI.
    const article = (page.jsonLd[0] as any).mainEntity.itemListElement[0].item
    assert.notEqual(article.author[0]['@id'], URL, label)
    if (label === 'hidden field') assert.equal(article.author[0]['@id'], 'https://lucian-dev.com/#person', label)
    assert.ok(!JSON.stringify(personFacts.loadPersonFacts('2026-10')).includes(ID), `${label}: Person facts`)
    const pi = readPublicCvSections('website', ['personalInformation'], ['en', 'zh'])
    assert.equal(cvLinks.orcidOf(pi.en[0]) || cvLinks.orcidOf(pi.zh[0]), '', `${label}: rail`)
    assert.ok(!/orcid/i.test(await llms.loadLlmsTxt()), `${label}: llms.txt`)
    for (const view of [readPublicCvSections('any', ['personalInformation']), readPublicCvSections('cv', ['personalInformation'])]) {
      if (label === 'hidden field') assert.ok(!JSON.stringify(view).includes(ID), `${label}: public API`)
    }
  }
})
