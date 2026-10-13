/**
 * Home identity (round 6): the hero meta line comes from the public CV, the
 * stats row never splits a label word, and the site's one Person entity is
 * built by one loader (lib/personFacts) with the real portrait.
 *
 * The loader runs against a throw-away content store in a temp working
 * directory (R2 disabled), like the API contract tests.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { heroMeta, languageNames } from '../components/LandingPage/heroIdentity'
import { statColumns, statTiles } from '../components/Common/githubEvents'
import { publicSections } from '../lib/cvVisibility'
import { absUrl, personNode, PERSON_ID } from '../lib/schema'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r6-home-identity-'))

before(() => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true })
})
after(async () => {
  const { closeDb } = await import('../lib/db')
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** The live CV's shape: language points in the CV's own order (Cantonese last). */
const personalInformation = (extra: Record<string, any> = {}) => ({
  sessionName: 'personalInformation',
  firstName: 'Yanpei',
  lastName: 'Li',
  nickName: 'Lucian',
  email: 'owner@example.test',
  phoneNumber: '+852 0000 0000',
  address: 'Ma Liu Shui, Hong Kong SAR, China',
  hiddenFields: ['phoneNumber'],
  ...extra,
})
const languages = (extra: Record<string, any> = {}) => ({
  sessionName: 'extraSkill',
  headerName: 'LANGUAGE SKILLS',
  points: ['Mandarin: Native', 'English: Professional Working Proficiency (IELTS 6.0)', 'Cantonese: Basic (Conversational)'],
  ...extra,
})

test('hero meta: location and languages come from the public CV, in the CV’s order', () => {
  const meta = heroMeta(publicSections([personalInformation(), languages()], 'website'))
  assert.deepEqual(meta, { location: 'Ma Liu Shui, Hong Kong SAR, China', languages: 'Mandarin · English · Cantonese' })
  // Only the display strings — never contact details.
  assert.ok(!JSON.stringify(meta).includes('example.test') && !JSON.stringify(meta).includes('+852'))
})

test('hero meta: hidden fields, hidden points and website-hidden sections are not shown', () => {
  const hiddenAddress = heroMeta(publicSections([personalInformation({ hiddenFields: ['address'] }), languages()], 'website'))
  assert.equal(hiddenAddress.location, '')
  const hiddenPoint = heroMeta(publicSections([personalInformation(), languages({ hiddenItems: { points: [2] } })], 'website'))
  assert.equal(hiddenPoint.languages, 'Mandarin · English')
  const offSite = heroMeta(publicSections([personalInformation({ showOnWebsite: false }), languages({ showOnWebsite: false })], 'website'))
  assert.deepEqual(offSite, { location: '', languages: '' })
  // Full editor documents are read the same way.
  assert.deepEqual(heroMeta([personalInformation({ showOnWebsite: false }), languages({ hiddenFields: ['points'] })]), { location: '', languages: '' })
  assert.deepEqual(heroMeta([]), { location: '', languages: '' })
  assert.deepEqual(heroMeta(undefined), { location: '', languages: '' })
})

test('language names: "Label: detail" points (EN and ZH colons), short plain points, no repeats', () => {
  assert.deepEqual(languageNames(['普通话：母语', '英语：职业工作水平（IELTS 6.0）', '粤语：基础会话']), ['普通话', '英语', '粤语'])
  assert.deepEqual(languageNames(['French', 'french: B2', 'Mandarin: Native']), ['French', 'Mandarin'])
  assert.deepEqual(languageNames(['An extra point that is a whole sentence rather than a language name']), [])
  assert.deepEqual(languageNames([]), [])
})

test('stats row: no tablet row is so wide that "CONTRIBUTIONS" would break mid-word', () => {
  const tiles = statTiles({ public_repos: 14, contributions: 1641, languages: 12, followers: 5, total_stars: 2, showVanity: true } as any)
  assert.equal(tiles.length, 5)
  // 5 tiles: 3 per row on phones and tablets, one row from the desktop breakpoint.
  assert.deepEqual(statColumns(5), { base: 'repeat(3, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' })
  assert.deepEqual(statColumns(4), { base: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' })
  assert.deepEqual(statColumns(3), { base: 'repeat(3, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' })
  assert.equal(statColumns(0).base, 'repeat(1, minmax(0, 1fr))')
})

test('variantUrl prefers a stored width variant and passes anything else through', async () => {
  const { variantUrl } = await import('../lib/uploadVariants')
  const dir = path.join(tmp, 'public', 'uploads')
  fs.writeFileSync(path.join(dir, 'portrait.jpg'), 'x')
  assert.equal(variantUrl('/uploads/portrait.jpg', 640), '/uploads/portrait.jpg')
  fs.writeFileSync(path.join(dir, 'portrait.jpg.w640.webp'), 'x')
  assert.equal(variantUrl('/uploads/portrait.jpg', 640), '/uploads/portrait.jpg.w640.webp')
  assert.equal(variantUrl('/images/hikoAvator.png', 640), '/images/hikoAvator.png')
  assert.equal(variantUrl('https://cdn.example.test/a.jpg', 640), 'https://cdn.example.test/a.jpg')
})

test('one Person loader: real portrait (640 px variant), the 中文 name, public CV facts only', async () => {
  const { writeCvData } = await import('../lib/cvdata')
  const { writeHome } = await import('../lib/home')
  const { loadPersonFacts } = await import('../lib/personFacts')
  const dir = path.join(tmp, 'public', 'uploads')
  fs.writeFileSync(path.join(dir, 'face.jpg'), 'x')

  const cv = {
    en: [
      personalInformation(),
      { sessionName: 'education', educationExperience: [{ schoolName: 'Uni One' }, { schoolName: 'Hidden College', isVisible: false }] },
      { sessionName: 'skill', languages: [{ language: 'TypeScript' }], technical: [{ name: 'Web', description: ['React'] }] },
      languages(),
    ],
    zh: [personalInformation({ firstName: '彦霈', lastName: '李', address: '马料水' })],
  }
  assert.equal((await writeCvData(cv)).ok, true)
  const home = { hero: { welcome: '', brand: 'B', tagline: 't', avatarUrl: '/uploads/face.jpg' }, socials: {}, brands: [], quickAccess: [], photos: [] }
  assert.equal((await writeHome(home as any)).ok, true)

  // No variant stored yet: the original upload.
  const original = personNode(loadPersonFacts())
  assert.equal(original.image, absUrl('/uploads/face.jpg'))

  fs.writeFileSync(path.join(dir, 'face.jpg.w640.webp'), 'x')
  const facts = loadPersonFacts()
  const node: any = personNode(facts)
  assert.equal(node['@id'], PERSON_ID)
  assert.equal(node.image, absUrl('/uploads/face.jpg.w640.webp'))
  assert.ok(/^https:\/\//.test(node.image), 'absolute image URL')
  assert.deepEqual(node.alternateName, ['Lucian', '李彦霈'])
  assert.equal(node.address, 'Ma Liu Shui, Hong Kong SAR, China')
  assert.deepEqual(node.alumniOf, [{ '@type': 'EducationalOrganization', name: 'Uni One' }])
  assert.deepEqual(node.knowsAbout, ['TypeScript', 'React'])
  const text = JSON.stringify(node)
  for (const secret of ['owner@example.test', '+852', 'Hidden College', '马料水']) assert.ok(!text.includes(secret), `no ${secret}`)

  // Every call gives the same node — the pages share it.
  assert.deepEqual(personNode(loadPersonFacts()), node)

  // Hidden in the CV editor → gone from the entity.
  cv.en[0] = personalInformation({ hiddenFields: ['phoneNumber', 'address'] })
  cv.zh[0] = personalInformation({ firstName: '彦霈', lastName: '李', showOnWebsite: false })
  assert.equal((await writeCvData(cv)).ok, true)
  const hidden: any = personNode(loadPersonFacts())
  assert.equal('address' in hidden, false)
  assert.deepEqual(hidden.alternateName, ['Lucian'])

  // No portrait set: the site default (what the hero shows), never a broken URL.
  assert.equal((await writeHome({ ...home, hero: { ...home.hero, avatarUrl: '' } } as any)).ok, true)
  assert.equal(personNode(loadPersonFacts()).image, absUrl('/images/hikoAvator.png'))
})
