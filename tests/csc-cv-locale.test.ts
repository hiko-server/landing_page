/**
 * E10 / E11 / CRIT-work-status — CV localisation and recommendations:
 *   - lib/cvLocale: header extras (right-to-work line, 求职意向) and the PDF
 *     photo hook;
 *   - lib/cvVisibility publication rules: the photo never public, consent
 *     required for recommendations, editor metadata stripped;
 *   - lib/cvValidate's image / switch kinds, lib/cvSync's per-language keys;
 *   - nothing of it in JSON-LD or the vCard; availability validation.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cvHeaderExtras, pdfPhoto } from '../lib/cvLocale'
import { publicCvDoc, publicSections } from '../lib/cvVisibility'
import { validateCvDoc } from '../lib/cvValidate'
import { syncLanguage } from '../lib/cvSync'
import { blankSection, SECTION_BY_NAME } from '../lib/cvSections'
import { recommendationCredit, recommendationItems, recommendationsSection } from '../components/CVViewerPage/recommendationView'
import { extrasLines } from '../components/CVViewerPage/headerExtrasLines'
import { buildVcard } from '../lib/vcard'
import { personFactsFromCv, personNode } from '../lib/schema'
import { normalizeHomeWrite, type HomeData } from '../lib/homeShape'
import { formFromHome, serializeHome } from '../components/Admin/home/homeForm'

const availability = {
  status: 'open',
  from: '2027-01-15',
  roles: ['Frontend engineer'],
  roles_zh: ['前端工程师', '全栈工程师', '前端工程师', ' '],
  city_zh: '香港',
  workStatus: 'Right to work line',
  workStatus_zh: '工作身份行',
}

test('header extras: English shows the right-to-work line only; Chinese adds 求职意向', () => {
  assert.deepEqual(cvHeaderExtras(availability, 'en'), { workStatus: 'Right to work line' })
  assert.deepEqual(cvHeaderExtras(availability, 'zh'), {
    workStatus: '工作身份行',
    jobIntent: { roles: ['前端工程师', '全栈工程师'], city: '香港', from: '2027-01' },
  })
  // Closed: no job intent, the right-to-work line stays.
  assert.deepEqual(cvHeaderExtras({ ...availability, status: 'closed' }, 'zh'), { workStatus: '工作身份行' })
  // A start date alone is not a job intent.
  assert.equal(cvHeaderExtras({ status: 'open', from: '2027-01' }, 'zh'), null)
  assert.equal(cvHeaderExtras({ status: 'open', city_zh: '深圳' }, 'zh')?.jobIntent?.city, '深圳')
  // No status: nothing at all (availability is "not set").
  assert.equal(cvHeaderExtras({ ...availability, status: undefined }, 'en'), null)
  assert.equal(cvHeaderExtras(null, 'zh'), null)
  assert.equal(cvHeaderExtras({ status: 'open', workStatus: 'a\nb' }, 'en')?.workStatus, 'a b')
})

test('header lines are labelled per language and formatted for the sheet', () => {
  assert.deepEqual(extrasLines(cvHeaderExtras(availability, 'zh'), 'zh'), [
    { key: 'jobIntent', label: '求职意向', value: '前端工程师、全栈工程师 ｜ 意向城市：香港 ｜ 到岗时间：2027.01' },
    { key: 'workStatus', label: '工作身份', value: '工作身份行' },
  ])
  assert.deepEqual(extrasLines(cvHeaderExtras(availability, 'en'), 'en'), [{ key: 'workStatus', label: 'Work authorisation', value: 'Right to work line' }])
  assert.deepEqual(extrasLines(null, 'en'), [])
})

const personalInfo = (over: Record<string, unknown> = {}) => ({
  ...blankSection('personalInformation', 'zh'),
  firstName: '彦霈',
  lastName: '李',
  photo: '/uploads/id-photo.webp',
  ...over,
})

test('pdfPhoto: only with its switch on, on a section that is on the CV, and only a safe image reference', () => {
  assert.equal(pdfPhoto([personalInfo()]), null, 'off by default')
  assert.equal(pdfPhoto([personalInfo({ photoOnPdf: true })]), '/uploads/id-photo.webp')
  assert.equal(pdfPhoto([personalInfo({ photoOnPdf: true, isVisible: false })]), null)
  assert.equal(pdfPhoto([personalInfo({ photoOnPdf: 'true' })]), null)
  assert.equal(pdfPhoto([personalInfo({ photoOnPdf: true, photo: 'javascript:alert(1)' })]), null)
  assert.equal(pdfPhoto([personalInfo({ photoOnPdf: true, photo: '/uploads/../admin.json' })]), null)
  assert.equal(pdfPhoto([personalInfo({ photoOnPdf: true, photo: 'https://cdn.example.com/p.jpg' })]), 'https://cdn.example.com/p.jpg')
  assert.equal(pdfPhoto(undefined), null)
})

test('the photo and its switch never reach a public view; the PDF hook still sees them in the full document', () => {
  const doc = { en: [personalInfo({ photoOnPdf: true })], zh: [personalInfo({ photoOnPdf: true })] }
  for (const audience of ['cv', 'website', 'any'] as const) {
    const text = JSON.stringify(publicCvDoc(doc, audience))
    assert.ok(!text.includes('id-photo'), audience)
    assert.ok(!text.includes('photoOnPdf'), audience)
  }
  assert.equal(pdfPhoto(doc.zh), '/uploads/id-photo.webp')
})

test('recommendations: permission required, flag dropped, hiddenItems positions intact, editor metadata stripped', () => {
  const section = {
    ...blankSection('recommendations', 'en'),
    readinessDismissed: ['weak-opening:en:deadbeef'],
    items: [
      { quote: 'Q1', name: 'A', permission: true },
      { quote: 'Q2', name: 'B', permission: false },
      { quote: 'Q3', name: 'C', permission: true, isVisible: false },
      { quote: 'Q4', name: 'D', permission: true, role: 'Lead, Acme', relation: 'managed me', date: '2026-03' },
    ],
    hiddenItems: { items: [0] },
  }
  const [pub] = publicSections([section], 'cv')
  assert.deepEqual(
    pub.items.map((i: any) => i.quote),
    ['Q4'],
    'hidden by position (0), no permission (1), entry hidden (2)',
  )
  assert.ok(!JSON.stringify(pub).includes('permission'))
  assert.ok(!JSON.stringify(pub).includes('readinessDismissed'))
  const items = recommendationItems(pub)
  assert.equal(items.length, 1)
  assert.equal(recommendationCredit(items[0].item, 'en'), 'Lead, Acme · managed me · Mar 2026')
  assert.equal(recommendationCredit(items[0].item, 'zh'), 'Lead, Acme · managed me · 2026.03')
  // Renderer defence in depth: an unpruned entry without permission is skipped.
  assert.equal(recommendationItems({ items: [{ quote: 'x', name: 'y', permission: false }] }).length, 0)
  assert.equal(recommendationItems({ items: [{ quote: '', name: 'y' }] }).length, 0, 'needs a quote and a name')
  assert.equal(recommendationItems({ items: [{ quote: 'q', name: 'n', sourceUrl: 'javascript:x' }] })[0].item.sourceUrl, '')
  assert.equal(recommendationsSection([pub])?.sessionName, 'recommendations')
  assert.equal(recommendationsSection([{ sessionName: 'recommendations', items: [] }]), null, 'hidden until present')
})

test('validation knows the image and switch kinds', () => {
  const pi = (over: Record<string, unknown>) => ({ en: [{ ...blankSection('personalInformation', 'en'), ...over }], zh: [] })
  assert.equal(validateCvDoc(pi({})).ok, true, 'blank photo, switch off')
  assert.equal(validateCvDoc(pi({ photo: '/uploads/a.webp', photoOnPdf: true })).ok, true)
  assert.equal(validateCvDoc(pi({ photo: 'https://cdn.example.com/a.png' })).ok, true)
  const bad = validateCvDoc(pi({ photo: 'data:image/png;base64,AAA', photoOnPdf: 'yes' }))
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.deepEqual(bad.errors.map((e) => e.path.slice(2).join('.')), ['photo', 'photoOnPdf'])
  const rec = validateCvDoc({ en: [{ sessionName: 'recommendations', items: [{ quote: 'q', name: 'n', permission: 1 }] }], zh: [] })
  assert.equal(rec.ok, false)
  assert.ok(SECTION_BY_NAME.selfAssessment && SECTION_BY_NAME.recommendations)
  assert.equal(blankSection('recommendations', 'zh')?.headerName, '推荐语')
  assert.equal(blankSection('selfAssessment', 'zh')?.headerName, '自我评价')
})

test('Sync 中 ← EN never copies the photo, its switch or dismissed checks', () => {
  const en = [{ ...personalInfo({ photo: '/uploads/en.webp', photoOnPdf: true }), readinessDismissed: ['a'] }]
  const zhWith = [{ ...personalInfo({ photo: '/uploads/zh.webp', photoOnPdf: false }), readinessDismissed: ['b', 'c'] }]
  const [synced] = syncLanguage(en, zhWith)
  assert.equal(synced.photo, '/uploads/zh.webp')
  assert.equal(synced.photoOnPdf, false)
  assert.deepEqual(synced.readinessDismissed, ['b', 'c'])
  const [fresh] = syncLanguage(en, [])
  assert.equal('photo' in fresh, false)
  assert.equal('photoOnPdf' in fresh, false)
  assert.equal('readinessDismissed' in fresh, false)
})

test('neither the vCard nor the Person JSON-LD can carry the photo or the right-to-work line', () => {
  const pub = publicCvDoc({ en: [personalInfo({ photoOnPdf: true, email: 'a@example.com' })], zh: [] }, 'cv')
  const card = buildVcard(pub.en[0], null, {})
  assert.match(card, /EMAIL/)
  assert.ok(!card.includes('id-photo'))
  const node = JSON.stringify(personNode(personFactsFromCv(pub.en)))
  assert.ok(!node.includes('id-photo'))
  assert.ok(!node.includes(availability.workStatus))
})

test('availability: roles_zh, city_zh and the right-to-work lines are validated and round-trip through the editor', () => {
  const base: HomeData = { hero: { welcome: '', brand: '', tagline: '', avatarUrl: '' }, socials: {}, brands: [], quickAccess: [] }
  const ok = normalizeHomeWrite({ ...base, availability: { ...availability, status: 'open', from: '2027-01', workStatus: ' A\r\nB ' } as never }, 5)
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.deepEqual(ok.home.availability?.roles_zh, ['前端工程师', '全栈工程师'])
    assert.equal(ok.home.availability?.city_zh, '香港')
    assert.equal(ok.home.availability?.workStatus, 'A B')
    assert.equal(ok.home.availability?.workStatus_zh, '工作身份行')
  }
  const tooLong = normalizeHomeWrite({ ...base, availability: { status: 'open', workStatus: 'x'.repeat(161) } })
  assert.equal(tooLong.ok, false)
  const badType = normalizeHomeWrite({ ...base, availability: { status: 'open', roles_zh: 'x' as never } })
  assert.equal(badType.ok, false)
  const form = formFromHome({ ...base, availability: { status: 'limited', roles_zh: ['研究员'], city_zh: '上海', workStatus: 'W', workStatus_zh: 'W中' } })
  assert.deepEqual(serializeHome(form).availability, { status: 'limited', roles_zh: ['研究员'], city_zh: '上海', workStatus: 'W', workStatus_zh: 'W中' })
})
