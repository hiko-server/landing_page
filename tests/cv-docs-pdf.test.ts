/**
 * cv-docs E2: the server-rendered PDF CV (lib/cvExport/pdf.ts, pdfLayout.ts).
 * Real selectable text with embedded subset fonts (Geist + Noto Sans SC
 * fallback per character), UAX #14 line breaking, a tagged PDF 1.7 structure
 * with Link elements, metadata, deterministic bytes — and it draws nothing
 * but the document model's strings plus fixed labels.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { publicSections } from '../lib/cvVisibility'
import { withEvidenceLinks } from '../lib/cvLinks'
import { buildCvModel, modelStrings } from '../lib/cvExport/model'
import { fontPieces, layoutRuns, type Measurer } from '../lib/cvExport/pdfLayout'
import { contrastOnWhite, loadPdfFonts, normalizeHex, renderCvPdf } from '../lib/cvExport/pdf'

/** 1 pt per character; Latin "font" lacks CJK, the CJK one has everything. */
const fake: Measurer = {
  has: (cp, font) => font === 'cjk' || cp < 0x2e80,
  width: (text, _font, _size, spacing = 0) => Array.from(text).length * (1 + spacing),
}

test('font fallback per character; bold CJK is faux bold; uncovered characters are dropped and reported', () => {
  const missing: string[] = []
  const pieces = fontPieces({ text: 'Built 机器 OK', size: 10, bold: true }, { has: (cp, f) => (f === 'cjk' ? cp !== 0x1f600 : cp < 0x2e80) }, (c) => missing.push(c))
  // A space stays with the face before it.
  assert.deepEqual(
    pieces.map((p) => [p.text, p.font, p.fauxBold]),
    [
      ['Built ', 'bold', false],
      ['机器 ', 'cjk', true],
      ['OK', 'bold', false],
    ],
  )
  const emoji = fontPieces({ text: 'ok😀', size: 10 }, { has: (cp, f) => (f === 'cjk' ? cp !== 0x1f600 : cp < 0x2e80) }, (c) => missing.push(c))
  assert.deepEqual(emoji.map((p) => p.text), ['ok'])
  assert.deepEqual(missing, ['😀'])
})

test('line breaking: words, CJK between characters (never before "，"), trailing spaces free, long words split', () => {
  const words = layoutRuns([{ text: 'alpha beta gamma delta', size: 10 }], 11, fake)
  assert.deepEqual(words.map((l) => l.pieces.map((p) => p.text).join('')), ['alpha beta', 'gamma delta'])
  assert.ok(words.every((l) => l.width <= 11))
  const zh = layoutRuns([{ text: '使用机器学习，提升效率。', size: 10 }], 6, fake)
  const zhLines = zh.map((l) => l.pieces.map((p) => p.text).join(''))
  assert.equal(zhLines.join(''), '使用机器学习，提升效率。')
  assert.ok(zhLines.every((l) => !l.startsWith('，') && !l.startsWith('。')), zhLines.join('|'))
  const long = layoutRuns([{ text: 'supercalifragilistic', size: 10 }], 8, fake)
  assert.deepEqual(long.map((l) => l.pieces[0].text), ['supercal', 'ifragili', 'stic'])
  const forced = layoutRuns([{ text: 'one\ntwo', size: 10 }], 100, fake)
  assert.equal(forced.length, 2)
  assert.deepEqual(layoutRuns([{ text: '   ', size: 10 }], 100, fake), [])
})

test('keep runs (URLs, skill tags) move to the next line whole instead of breaking inside', () => {
  const runs = [
    { text: 'site.example', size: 10, keep: true },
    { text: ' · ', size: 10 },
    { text: 'github.com/someone/long', size: 10, keep: true },
  ]
  const lines = layoutRuns(runs, 26, fake).map((l) => l.pieces.map((p) => p.text).join(''))
  assert.deepEqual(lines, ['site.example ·', 'github.com/someone/long'])
  const free = layoutRuns(runs.map((r) => ({ ...r, keep: false })), 26, fake).map((l) => l.pieces.map((p) => p.text).join(''))
  assert.notDeepEqual(free, lines, 'without keep the URL may break after "/"')
})

test('accent colour: valid hex only, links fall back to ink when the accent is too light to read', () => {
  assert.equal(normalizeHex('#ABC'), '#aabbcc')
  assert.equal(normalizeHex('blue'), null)
  assert.ok(contrastOnWhite('#000000') > 20)
  assert.ok(contrastOnWhite('#ffff00') < 4.5)
})

const sections = (lang: 'en' | 'zh') =>
  withEvidenceLinks(
    publicSections(
      [
        { sessionName: 'personalInformation', firstName: lang === 'zh' ? '彦霈' : 'Yanpei', lastName: lang === 'zh' ? '李' : 'Li', nickName: 'Lucian', email: 'owner@example.test', personalWebsite: 'example.org', separatorColor: '#0f766e' },
        {
          sessionName: 'workExperience',
          headerName: lang === 'zh' ? '工作经历' : 'EXPERIENCE',
          experiences: Array.from({ length: 9 }, (_, i) => ({
            jobTitle: `${lang === 'zh' ? '工程师' : 'Engineer'} ${i + 1}`,
            companyName: 'Example Ltd',
            startDate: '2020-01',
            endDate: '2021-01',
            jobDescription: lang === 'zh' ? '负责机器学习模型训练与部署，使用 Python 与 Docker。' : 'Trained and shipped machine-learning models with Python and Docker for a long list of clients.',
            features: [
              { description: 'Built the evaluation pipeline and the dashboards the team used every day.', furtherExplanation: ['Cut review time by half'] },
              { description: 'Mentored two interns.', furtherExplanation: [] },
            ],
            relatedSkills: ['Python', 'Docker'],
          })),
        },
        { sessionName: 'project', headerName: 'PROJECTS', projectExperience: [{ title: 'Sorter', description: 'Edge AI.', caseStudy: 'swcs', features: [] }] },
        { sessionName: 'skill', headerName: 'SKILLS', languages: [{ language: 'Python', level: 'Proficient.' }], technical: [{ name: 'Tools', description: ['Docker'] }] },
      ],
      'cv',
    ),
    { works: [{ slug: 'swcs', title: 'SWCS', repo: 'https://github.com/example/swcs' }], socials: { linkedin: 'https://www.linkedin.com/in/example-owner/' } },
  )

const SAVED = Date.UTC(2026, 9, 13, 0, 35, 19)

/** The inflated FlateDecode streams of a PDF (content streams, fonts, …). */
function contentStreams(buf: Buffer): string[] {
  const out: string[] = []
  let at = 0
  for (;;) {
    const start = buf.indexOf('stream\n', at)
    if (start < 0) break
    const end = buf.indexOf('\nendstream', start)
    if (end < 0) break
    try {
      out.push(zlib.inflateSync(buf.subarray(start + 7, end)).toString('latin1'))
    } catch {
      /* not deflated */
    }
    at = end + 10
  }
  return out
}

for (const lang of ['en', 'zh'] as const) {
  test(`the ${lang} PDF: tagged 1.7, embedded fonts, links, metadata, footers, deterministic, model strings only`, async () => {
    const fonts = loadPdfFonts()
    const model = buildCvModel(sections(lang), { lang, now: '2026-10', updatedAt: SAVED, canonical: `https://lucian-dev.com/cv${lang === 'zh' ? '/zh' : ''}` })
    const drawn: string[] = []
    const a = await renderCvPdf(model, { fonts, accent: '#0f766e', updatedAt: SAVED, onText: (t) => drawn.push(t) })
    const b = await renderCvPdf(model, { fonts, accent: '#0f766e', updatedAt: SAVED })
    assert.ok(a.buffer.equals(b.buffer), 'same input → same bytes')
    const pdf = a.buffer.toString('latin1')
    assert.ok(pdf.startsWith('%PDF-1.7'))
    assert.ok(a.pages >= 2, `multi-page (${a.pages})`)
    assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, a.pages)
    // Tagged structure.
    for (const tag of ['/StructTreeRoot', '/Marked true', '/S /Document', '/S /H1', '/S /H2', '/S /H3', '/S /L', '/S /LI', '/S /Lbl', '/S /LBody', '/S /Link', '/S /Sect', '/S /Div']) {
      assert.ok(pdf.includes(tag), `${tag} present`)
    }
    assert.ok(pdf.includes(`/Lang (${lang === 'zh' ? 'zh-CN' : 'en'})`))
    assert.ok(pdf.includes('/DisplayDocTitle true'))
    // Embedded TrueType subsets (Geist, and Noto Sans SC for 中文).
    assert.ok((pdf.match(/\/FontFile2/g) || []).length >= (lang === 'zh' ? 3 : 2))
    // Link annotations attached to the structure (OBJR) with URIs.
    assert.ok(pdf.includes('/Subtype /Link'))
    assert.ok(pdf.includes('/URI (https://lucian-dev.com/work/swcs)'))
    assert.ok(pdf.includes('/URI (https://www.linkedin.com/in/example-owner/)'))
    assert.ok(pdf.includes('/Type /OBJR'))
    // Content streams: rules and footers are artifacts, marked content is balanced.
    const content = contentStreams(a.buffer).join('\n')
    assert.ok(content.includes('/Artifact'), 'artifacts marked')
    assert.equal((content.match(/\bBDC\b|\bBMC\b/g) || []).length, (content.match(/\bEMC\b/g) || []).length, 'BDC/EMC balanced')
    assert.ok((content.match(/\/MCID \d+/g) || []).length > 20, 'text is marked as structure content')
    assert.deepEqual(a.missing, [])
    // Only model strings (plus fixed labels / separators / page numbers) are drawn.
    const allowed = modelStrings(model).join('\n')
    const fixed = /^(\s|·|\||•|–|:|：|M|E|电话|邮箱|Skills|技能|Case study|Code|案例|代码|\d+ \/ \d+|lucian-dev\.com\/cv(\/zh)?)+$/
    // Neighbouring runs of one style are drawn as one piece: split at the renderer's separators.
    for (const t of drawn.flatMap((d) => d.split(/\s+[·|]\s+|\s{3,}/))) {
      const s = t.trim().replace(/[:：]$/, '')
      if (!s || fixed.test(s)) continue
      assert.ok(allowed.includes(s) || allowed.toUpperCase().includes(s), `"${t}" is not from the model`)
    }
    assert.ok(drawn.join('').includes(lang === 'zh' ? '更新于 2026 年 10 月' : 'Updated October 2026'), 'footer carries the update')
  })
}

test('the header rule sets the summary apart only: without a summary the first section rule is the first rule (like the web sheet)', async () => {
  const fonts = loadPdfFonts()
  const model = buildCvModel(sections('en'), { lang: 'en', now: '2026-10', updatedAt: SAVED, canonical: 'https://lucian-dev.com/cv' })
  /** Stroke widths in drawing order (`<w> w … S` inside each Layout artifact: the rules). */
  const ruleWidths = (buf: Buffer) =>
    contentStreams(buf)
      .join('\n')
      .split('/Artifact')
      .slice(1)
      .map((chunk) => /(\d+(?:\.\d+)?) w\b[\s\S]*?\bS\b/.exec(chunk.split('EMC')[0])?.[1])
      .filter((w): w is string => !!w)
  const withSummary = await renderCvPdf({ ...model, summary: 'An example summary of the person.' }, { fonts, updatedAt: SAVED })
  const without = await renderCvPdf({ ...model, summary: '' }, { fonts, updatedAt: SAVED })
  assert.equal(ruleWidths(withSummary.buffer)[0], '1.6', 'the heavy header rule comes first above a summary')
  const plain = ruleWidths(without.buffer)
  assert.ok(plain.length > 0, 'section rules are drawn')
  assert.ok(!plain.includes('1.6'), `no heavy header rule without a summary (${plain.join(', ')})`)
})
