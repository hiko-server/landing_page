/**
 * Wave 2A integration (b): the server-rendered PDF (cv-docs E2) renders the
 * cv-studio-contact additions from PUBLIC data — the availability header
 * lines (right to work; 求职意向 on the Chinese CV), the self-assessment and
 * the recommendations given with permission — and the optional photo only
 * in the language whose PDF the owner switched it on for.
 *
 * Leak checks (extending tests/cv-docs-leak.test.ts): a recommendation
 * without permission, a hidden self-assessment point and the private photo
 * URL never reach the model, the plain text, the JSON Resume or the strings
 * the PDF draws.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { publicCvDoc, type CvDoc } from '../lib/cvVisibility'
import { withEvidenceLinks } from '../lib/cvLinks'
import { cvHeaderExtras } from '../lib/cvLocale'
import { buildCvModel, modelStrings } from '../lib/cvExport/model'
import { renderCvText } from '../lib/cvExport/text'
import { buildJsonResume } from '../lib/cvExport/jsonResume'
import { loadPdfFonts, photoDrawSize, renderCvPdf } from '../lib/cvExport/pdf'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'NEXT_PHASE']) delete process.env[k]

const NOW = '2026-10'
const SECRET_QUOTE = 'ZZ-NO-PERMISSION-QUOTE-ZZ'
const SECRET_NAME = 'ZZ-Unconsenting Person-ZZ'
const HIDDEN_POINT = 'ZZ-HIDDEN-SELF-POINT-ZZ'
const PHOTO = '/uploads/zz-private-photo.png'

const availability = {
  status: 'open',
  label: 'Open to roles',
  from: '2027-01',
  workStatus: 'Hong Kong permanent resident, no sponsorship needed',
  workStatus_zh: '香港永久居民，无需工作签证',
  roles_zh: ['前端工程师', '全栈工程师'],
  city_zh: '香港',
}

function doc(): CvDoc {
  const recommendations = (lang: 'en' | 'zh') => ({
    sessionName: 'recommendations',
    headerName: lang === 'zh' ? '推荐语' : 'RECOMMENDATIONS',
    items: [
      { quote: lang === 'zh' ? '他总是把事情做完。' : 'He ships what he promises.', name: 'Ada Example', role: 'Engineering lead, Acme', relation: 'managed me', date: '2026-03', sourceUrl: 'https://example.org/rec', permission: true },
      { quote: SECRET_QUOTE, name: SECRET_NAME, role: 'Someone', permission: false },
    ],
  })
  const selfAssessment = (lang: 'en' | 'zh') => ({
    sessionName: 'selfAssessment',
    headerName: lang === 'zh' ? '自我评价' : 'SELF-ASSESSMENT',
    text: lang === 'zh' ? '踏实、好学，乐于沟通。' : 'Calm under pressure; I write things down.',
    points: [lang === 'zh' ? '善于拆解问题' : 'Breaks problems down', HIDDEN_POINT],
    hiddenItems: { points: [1] },
  })
  return {
    en: [
      { sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li', email: 'owner@example.test', photo: PHOTO, photoOnPdf: false },
      { sessionName: 'skill', headerName: 'SKILLS', languages: [{ language: 'Python', level: 'Proficient' }], technical: [] },
      selfAssessment('en'),
      recommendations('en'),
    ],
    zh: [
      { sessionName: 'personalInformation', firstName: '彦霈', lastName: '李', email: 'owner@example.test', photo: PHOTO, photoOnPdf: true },
      { sessionName: 'skill', headerName: '技能', languages: [{ language: 'Python', level: '熟练' }], technical: [] },
      selfAssessment('zh'),
      recommendations('zh'),
    ],
  }
}

function model(lang: 'en' | 'zh') {
  const sections = withEvidenceLinks(publicCvDoc(doc(), 'cv')[lang], { works: [], socials: null })
  return {
    sections,
    model: buildCvModel(sections, { lang, now: NOW, updatedAt: Date.UTC(2026, 9, 13), canonical: `https://lucian-dev.com/${lang === 'zh' ? 'cv/zh' : 'cv'}`, headerExtras: cvHeaderExtras(availability, lang) }),
  }
}

const LEAKS = [SECRET_QUOTE, SECRET_NAME, HIDDEN_POINT, 'zz-private-photo', 'photoOnPdf']

test('(b) the model carries the availability lines, the self-assessment and the permitted recommendations only', () => {
  const en = model('en').model
  assert.deepEqual(en.headerLines, [{ key: 'workStatus', label: 'Work authorisation', value: availability.workStatus }])
  const zh = model('zh').model
  assert.equal(zh.headerLines[0].key, 'jobIntent')
  assert.equal(zh.headerLines[0].label, '求职意向')
  assert.match(zh.headerLines[0].value, /前端工程师、全栈工程师 ｜ 意向城市：香港 ｜ 到岗时间：2027/)
  assert.deepEqual(zh.headerLines[1], { key: 'workStatus', label: '工作身份', value: availability.workStatus_zh })

  const statement = en.sections.find((s) => s.kind === 'statement')
  assert.ok(statement && statement.kind === 'statement')
  assert.equal(statement.text, 'Calm under pressure; I write things down.')
  assert.deepEqual(statement.items, ['Breaks problems down'])
  const quotes = en.sections.find((s) => s.kind === 'quotes')
  assert.ok(quotes && quotes.kind === 'quotes')
  assert.equal(quotes.items.length, 1)
  assert.deepEqual(
    { quote: quotes.items[0].quote, name: quotes.items[0].name, href: quotes.items[0].href },
    { quote: 'He ships what he promises.', name: 'Ada Example', href: 'https://example.org/rec' },
  )
  assert.match(quotes.items[0].credit, /Engineering lead, Acme · managed me · Mar 2026/)

  for (const lang of ['en', 'zh'] as const) {
    const { sections, model: m } = model(lang)
    const all = [modelStrings(m).join('\n'), renderCvText(m), JSON.stringify(buildJsonResume(sections, { lang, now: NOW, canonical: 'https://lucian-dev.com/cv.json' }))].join('\n')
    for (const leak of LEAKS) assert.ok(!all.includes(leak), `${lang}: ${leak} leaked`)
  }
  // Without an availability status there are no header lines.
  const closed = buildCvModel(model('zh').sections, { lang: 'zh', now: NOW, canonical: 'https://lucian-dev.com/cv/zh', headerExtras: cvHeaderExtras({ ...availability, status: '' }, 'zh') })
  assert.deepEqual(closed.headerLines, [])
})

test('(b) the plain text and the JSON Resume print the same additions', () => {
  const { sections, model: m } = model('en')
  const text = renderCvText(m)
  assert.match(text, /Work authorisation: Hong Kong permanent resident, no sponsorship needed/)
  assert.match(text, /SELF-ASSESSMENT\n-+\nCalm under pressure; I write things down\.\n- Breaks problems down/)
  assert.match(text, /“He ships what he promises\.”\n— Ada Example, Engineering lead, Acme · managed me · Mar 2026 \(https:\/\/example\.org\/rec\)/)
  const zhText = renderCvText(model('zh').model)
  assert.match(zhText, /求职意向：前端工程师、全栈工程师/)
  assert.match(zhText, /「他总是把事情做完。」/)
  const resume = buildJsonResume(sections, { lang: 'en', now: NOW, canonical: 'https://lucian-dev.com/cv.json' }) as { references?: Array<{ name: string; reference: string }> }
  assert.deepEqual(resume.references, [{ name: 'Ada Example, Engineering lead, Acme · managed me · Mar 2026', reference: 'He ships what he promises.' }])
})

test('(b) the PDF draws the header lines, the statement and the permitted quote — and none of the private or hidden values', async () => {
  const fonts = loadPdfFonts()
  for (const lang of ['en', 'zh'] as const) {
    const drawn: string[] = []
    const out = await renderCvPdf(model(lang).model, { fonts, onText: (t) => drawn.push(t) })
    const all = drawn.join('')
    for (const leak of LEAKS) assert.ok(!all.includes(leak), `${lang}: ${leak} drawn`)
    const raw = out.buffer.toString('latin1')
    assert.ok(!raw.includes('zz-private-photo'), `${lang}: photo URL in the file`)
    assert.ok(!raw.includes('/Subtype /Image'), `${lang}: no photo was passed, no image is embedded`)
    if (lang === 'en') {
      assert.ok(all.includes('Work authorisation: '), 'header label')
      assert.ok(all.includes('Hong Kong permanent resident'), 'right-to-work line')
      assert.ok(all.includes('Calm under pressure'), 'statement')
      assert.ok(all.includes('Ada Example'), 'credit')
      assert.ok(all.includes('ships what he promises'), 'quote')
    } else {
      assert.ok(all.includes('求职意向'), '求职意向 label')
      assert.ok(all.includes('香港永久居民'), 'zh right-to-work line')
      assert.ok(all.includes('自我评价'.toUpperCase()), 'zh section title')
    }
    // Quotes are tagged as block quotes; the source link is an annotation.
    assert.match(raw, /\/S \/BlockQuote/)
    assert.match(raw, /example\.org\/rec/)
  }
})

test('(b) a photo becomes a tagged Figure with alternative text, sized inside the passport box', async () => {
  const { pdfPhotoFromBuffer } = await import('../lib/cvExport/photo')
  const sharp = (await import('sharp')).default
  const png = await sharp({ create: { width: 300, height: 400, channels: 3, background: '#4a6fa5' } }).png().toBuffer()
  const photo = await pdfPhotoFromBuffer(png)
  assert.ok(photo)
  assert.equal(photo.jpeg.subarray(0, 2).toString('hex'), 'ffd8', 'JPEG')
  assert.ok(photo.width <= 360 && photo.height <= 360)
  assert.equal(await pdfPhotoFromBuffer(Buffer.from('not an image')), null)
  const size = photoDrawSize(photo)
  assert.ok(size.w <= 70 && size.h <= 92)
  assert.ok(Math.abs(size.w / size.h - 0.75) < 0.01, 'keeps the aspect ratio')

  const out = await renderCvPdf(model('zh').model, { fonts: loadPdfFonts(), photo })
  const raw = out.buffer.toString('latin1')
  assert.match(raw, /\/Subtype \/Image/)
  assert.match(raw, /\/S \/Figure/)
  assert.match(raw, /\/Alt/)
  // Same input, same bytes (the ETag relies on it).
  const again = await renderCvPdf(model('zh').model, { fonts: loadPdfFonts(), photo })
  assert.ok(out.buffer.equals(again.buffer))
})

// ── End to end through the store and the export endpoint's service ─────────

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wave2a-cv-pdf-'))

before(async () => {
  loadPdfFonts(originalCwd)
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true })
  const sharp = (await import('sharp')).default
  fs.writeFileSync(path.join(tmp, 'public', 'uploads', 'zz-private-photo.png'), await sharp({ create: { width: 240, height: 320, channels: 3, background: '#335577' } }).png().toBuffer())
})
after(async () => {
  const { closeDb } = await import('../lib/db')
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('(b) the photo is embedded only in the language whose PDF the owner switched it on for; the store feeds the header lines', async () => {
  const { writeCvData } = await import('../lib/cvdata')
  const { writeHome } = await import('../lib/home')
  assert.equal((await writeCvData(doc())).ok, true)
  const home = { hero: { brand: 'Test' }, availability } as never
  assert.equal((await writeHome(home)).ok, true)
  const { getCvExport, clearCvExportCache } = await import('../lib/cvExport/service')
  const { clearCvPdfPhotoCache } = await import('../lib/cvExport/photo')
  clearCvExportCache()
  clearCvPdfPhotoCache()

  const zh = await getCvExport('zh', 'pdf')
  const en = await getCvExport('en', 'pdf')
  assert.ok(zh.ok && en.ok)
  assert.match(zh.file.body.toString('latin1'), /\/Subtype \/Image/, 'zh: photo switched on')
  assert.doesNotMatch(en.file.body.toString('latin1'), /\/Subtype \/Image/, 'en: photo switched off')

  const text = await getCvExport('zh', 'txt')
  assert.ok(text.ok)
  const body = text.file.body.toString('utf8')
  assert.match(body, /求职意向：前端工程师、全栈工程师 ｜ 意向城市：香港/)
  assert.match(body, /工作身份：香港永久居民/)
  for (const leak of LEAKS) assert.ok(!body.includes(leak), `zh txt: ${leak}`)

  // Switching the photo off for 中文 changes the file (and its ETag).
  const off = doc()
  ;(off.zh[0] as Record<string, unknown>).photoOnPdf = false
  assert.equal((await writeCvData(off)).ok, true)
  const zhOff = await getCvExport('zh', 'pdf')
  assert.ok(zhOff.ok)
  assert.doesNotMatch(zhOff.file.body.toString('latin1'), /\/Subtype \/Image/)
  assert.notEqual(zhOff.file.etag, zh.file.etag)
})
