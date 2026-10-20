/**
 * Publications, phase 2: the papers everywhere else they belong.
 *
 *   - the PDF CV (EN / 中文), the plain-text CV and the JSON Resume print the
 *     public papers in citation style (owner emphasised, real status, DOI as
 *     https://doi.org/…), and nothing hidden;
 *   - the home page's "Selected Publications" (owner-ordered section, after
 *     projects by default, absent without a paper), the /about rail's count
 *     and the Home editor's proof-strip suggestions (published papers,
 *     verbatim);
 *   - search documents for every public paper;
 *   - CV Studio readiness rules (incomplete published papers, stale reviews);
 *   - skill evidence from a paper's keywords;
 *   - leak checks over all of it from a real (temporary) content store, and
 *     a CV whose only public content is papers still has its downloads
 *     (review finding CORR-1).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { publicCvDoc, type CvDoc } from '../lib/cvVisibility'
import { buildCvModel, modelStrings, type CvDocModel, type ModelPublication } from '../lib/cvExport/model'
import { renderCvText } from '../lib/cvExport/text'
import { buildJsonResume } from '../lib/cvExport/jsonResume'
import { loadPdfFonts, renderCvPdf } from '../lib/cvExport/pdf'
import { layoutRuns, type Measurer } from '../lib/cvExport/pdfLayout'
import { EXPORT_VERSION } from '../lib/cvExport/service'
import { runReadinessChecks, CHECK_SEVERITY, REVIEW_STALE_MONTHS, type ReadinessFinding } from '../lib/cvReadiness'
import { buildSkillEvidence, EVIDENCE_KIND_LABELS } from '../lib/skillEvidence'
import { suggestHighlights } from '../lib/highlights'
import { DEFAULT_SECTION_ORDER, RECRUITER_SECTION_ORDER, resolveSectionOrder } from '../lib/homeSections'
import { HOME_SECTION_META, normalizeHomeWrite } from '../lib/homeShape'
import {
  HOME_PUBLICATIONS_MAX,
  citationKeys,
  ownerNamesFromSections,
  publicPublications,
  publicationTiles,
  selectPublications,
  type PublicationsSource,
} from '../lib/publications'
import { publicationDocs } from '../lib/publicationsSearch'
import { paperCount } from '../components/About/aboutNav'
import { pdfText, pdfTextRuns, squashSpace } from '../e2e/pdfText'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'NEXT_PHASE']) {
  delete process.env[k]
}

const NOW = '2026-10'
const SECRET = 'ZZ-PHASE2-SECRET-ZZ'
const VENUE_UNDER_REVIEW = 'ZZ-SUBMITTED-TO-ZZ'

const personal = (lang: 'en' | 'zh') =>
  lang === 'en'
    ? { sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li', nickName: 'Lucian', email: 'owner@example.test' }
    : { sessionName: 'personalInformation', firstName: '彦霈', lastName: '李', nickName: 'Lucian', email: 'owner@example.test' }

/** Papers that hide something at every level (entry, field, author, keyword) plus one under review and one without a status. */
function papers(lang: 'en' | 'zh') {
  return [
    {
      title: lang === 'zh' ? '边缘设备上的小模型' : 'Tiny models at the edge',
      authors: ['Jane Doe', `${SECRET} Coauthor`, 'Yanpei Li*'],
      hiddenItems: { authors: [1], keywords: [1] },
      venue: lang === 'zh' ? '边缘计算学报' : 'Journal of Edge Computing',
      venueType: 'journal',
      status: 'published',
      date: '2025-03',
      volume: '12',
      issue: '3',
      pages: '45-67',
      publisher: 'ACM',
      doi: `10.5555/${SECRET}`,
      hiddenFields: ['doi', 'abstract', 'slidesUrl'],
      url: 'https://example.org/paper',
      pdfUrl: '/uploads/paper.pdf',
      codeUrl: 'https://github.com/example/edge',
      slidesUrl: `https://example.org/${SECRET}`,
      abstract: `Abstract with ${SECRET}.`,
      keywords: ['TypeScript', SECRET],
      award: 'Best Paper Award',
    },
    { title: `${SECRET} hidden paper`, status: 'published', isVisible: false, authors: ['Yanpei Li'] },
    { title: 'Under review paper', status: 'under-review', venue: VENUE_UNDER_REVIEW, date: '2026', authors: ['Li, Yanpei', 'A. Smith'], doi: '10.5555/review.1' },
    { title: `${SECRET} no status`, status: '', authors: ['Yanpei Li'] },
    { title: 'A preprint', status: 'preprint', venue: 'arXiv', date: '2026-02', authors: ['李彦霈', 'Wang Wu'], url: 'https://arxiv.org/abs/2602.00001' },
  ]
}

function cvDoc(extra: Record<string, unknown> = {}): CvDoc {
  const section = (lang: 'en' | 'zh') => ({ sessionName: 'publications', headerName: lang === 'zh' ? '论文' : 'Publications', papers: papers(lang), ...extra })
  const skills = { sessionName: 'skill', headerName: 'SKILLS', languages: [], technical: [{ name: 'Languages', description: ['TypeScript', 'Rust'] }] }
  const patents = { sessionName: 'patents', headerName: 'PATENTS', patentExperience: [{ title: 'Sorting device', authority: 'CNIPA', status: 'Granted', date: '2024-05', patents: [] }] }
  return {
    en: [personal('en'), skills, section('en'), patents],
    zh: [personal('zh'), { ...skills, headerName: '技能' }, section('zh'), { ...patents, headerName: '专利' }],
  }
}

function model(doc: CvDoc, lang: 'en' | 'zh', canonical = `https://lucian-dev.com/${lang === 'zh' ? 'cv/zh' : 'cv'}`): CvDocModel {
  const pub = publicCvDoc(doc, 'cv')
  return buildCvModel(pub[lang], { lang, now: NOW, canonical, owner: ownerNamesFromSections(pub.en, pub.zh) })
}

const pubSection = (m: CvDocModel) => m.sections.find((s): s is Extract<CvDocModel['sections'][number], { kind: 'publications' }> => s.kind === 'publications')

// ── The document model ─────────────────────────────────────────────────────

test('model: papers in citation style, sorted, with real statuses, the owner flagged and a hidden co-author as "…"', () => {
  const m = model(cvDoc(), 'en')
  const section = pubSection(m)
  assert.ok(section)
  assert.equal(section.title, 'Publications')
  assert.deepEqual(
    section.items.map((p) => p.title),
    ['Tiny models at the edge', 'Under review paper', 'A preprint'],
    'published → under review → preprint; hidden and status-less papers are gone',
  )
  const [pub, review, preprint] = section.items as [ModelPublication, ModelPublication, ModelPublication]
  assert.deepEqual(pub.authors, [
    { name: 'Jane Doe', self: false, hidden: false },
    { name: '…', self: false, hidden: true },
    { name: 'Yanpei Li*', self: true, hidden: false },
  ])
  assert.equal(pub.venue, 'Journal of Edge Computing')
  assert.equal(pub.details, '12(3), 45–67')
  assert.equal(pub.publisher, 'ACM')
  assert.equal(pub.date, 'Mar 2025')
  assert.equal(pub.status, '', 'published work carries no label')
  assert.equal(pub.award, 'Best Paper Award')
  assert.equal(pub.anchor, 'cv-publications-0')
  // DOI hidden → no DOI link; the same-site PDF becomes absolute; hidden slides are gone.
  assert.deepEqual(
    pub.links.map((l) => [l.key, l.href]),
    [
      ['pdf', 'https://lucian-dev.com/uploads/paper.pdf'],
      ['code', 'https://github.com/example/edge'],
      ['url', 'https://example.org/paper'],
    ],
  )
  assert.equal(review.status, 'Under review')
  assert.equal(review.venue, '', 'a paper under review never names its venue')
  assert.deepEqual(review.authors.map((a) => a.self), [true, false], '"Li, Yanpei" is the owner')
  assert.deepEqual(review.links, [{ key: 'doi', label: 'DOI', href: 'https://doi.org/10.5555/review.1', text: 'https://doi.org/10.5555/review.1' }])
  assert.equal(review.anchor, 'cv-publications-1', 'anchors count visible papers, before sorting')
  assert.equal(preprint.status, 'Preprint')
  assert.equal(preprint.authors[0].self, true, 'the Chinese name form is recognised on the English CV')
  assert.ok(!JSON.stringify(m).includes(SECRET))
  assert.ok(!JSON.stringify(m).includes(VENUE_UNDER_REVIEW))
})

test('model: Chinese labels and dates; same-site links need an origin; no section without a paper; stored order kept', () => {
  const zh = model(cvDoc(), 'zh')
  const section = pubSection(zh)
  assert.ok(section)
  assert.equal(section.title, '论文')
  assert.deepEqual(section.items.map((p) => p.status), ['', '审稿中', '预印本'])
  assert.equal(section.items[0].date, '2025.03')
  assert.deepEqual(section.items[0].links.map((l) => l.label), ['PDF', '代码', '论文页面'])
  assert.equal(section.items[0].authors[2].self, true, 'the English name form is recognised on the Chinese CV')

  const noOrigin = model(cvDoc(), 'en', '')
  assert.ok(!pubSection(noOrigin)?.items[0].links.some((l) => l.key === 'pdf'), 'a site path without an origin is left out')

  // The section sits where the owner put it (after skills, before patents here).
  const en = model(cvDoc(), 'en')
  assert.deepEqual(en.sections.map((s) => s.id), ['skill', 'publications', 'patents'])

  for (const doc of [
    cvDoc({ papers: [] }),
    cvDoc({ isVisible: false }),
    cvDoc({ hiddenFields: ['papers'] }),
    cvDoc({ papers: [{ title: 'No status', status: '' }, { title: '', status: 'published' }] }),
  ]) {
    assert.equal(pubSection(model(doc, 'en')), undefined)
  }
})

// ── PDF ────────────────────────────────────────────────────────────────────

const fakeMeasure: Measurer = {
  has: (cp, font) => (font === 'cjk' ? true : cp < 0x2e80),
  width: (text, _font, size) => Array.from(text).length * size * 0.5,
}

test('pdf layout: an italic run slants its Latin pieces only (Chinese stays upright)', () => {
  const [line] = layoutRuns([{ text: 'Journal 学报 Edge', size: 10, italic: true }], 1000, fakeMeasure)
  assert.deepEqual(
    line.pieces.map((p) => [p.text, p.font, !!p.italic]),
    [
      ['Journal ', 'regular', true],
      ['学报 ', 'cjk', false],
      ['Edge', 'regular', true],
    ],
  )
  const [plain] = layoutRuns([{ text: 'Journal', size: 10 }], 1000, fakeMeasure)
  assert.equal(plain.pieces[0].italic, undefined)
})

let fonts: ReturnType<typeof loadPdfFonts>

for (const lang of ['en', 'zh'] as const) {
  test(`pdf (${lang}): the papers are drawn in citation style — and only model strings, nothing hidden`, async () => {
    fonts ??= loadPdfFonts()
    const m = model(cvDoc(), lang)
    const drawn: string[] = []
    const out = await renderCvPdf(m, { fonts, accent: '#1d4ed8', onText: (t) => drawn.push(t) })
    assert.deepEqual(out.missing, [])
    const all = drawn.join('\n')
    const text = pdfText(out.buffer)
    for (const needle of [
      lang === 'zh' ? '边缘设备上的小模型' : 'Tiny models at the edge',
      'Yanpei Li*',
      lang === 'zh' ? '边缘计算学报' : 'Journal of Edge Computing',
      '12(3), 45–67',
      'Best Paper Award',
      'https://doi.org/10.5555/review.1',
      'lucian-dev.com/uploads/paper.pdf',
      lang === 'zh' ? '审稿中' : 'UNDER REVIEW',
      lang === 'zh' ? '预印本' : 'PREPRINT',
      '…',
    ]) {
      assert.ok(all.includes(needle), `drawn: ${needle}`)
      assert.ok(squashSpace(text).includes(squashSpace(needle)), `extractable text: ${needle}`)
    }
    // The owner's own name is set in the bold face, a co-author's in the regular one.
    const pdf = out.buffer.toString('latin1')
    assert.ok(pdf.includes('/URI (https://doi.org/10.5555/review.1)'), 'the DOI is a link')
    assert.ok(pdf.includes('/URI (https://lucian-dev.com/uploads/paper.pdf)'), 'the PDF link is absolute')
    for (const hidden of [SECRET, VENUE_UNDER_REVIEW]) {
      assert.ok(!all.includes(hidden) && !text.includes(hidden) && !pdf.includes(hidden), `${hidden} never reaches the PDF`)
    }
    // Every drawn string is a model string (or a fixed label / separator).
    const allowed = modelStrings(m).join('\n')
    const fixed = /^(\s|·|\||•|–|,|\.|:|：|E|邮箱|DOI|\d+ \/ \d+|lucian-dev\.com\/cv(\/zh)?)+$/
    for (const piece of drawn.flatMap((d) => d.split(/,\s|\.\s|\s{3,}|\s+[·|]\s+/))) {
      const s = piece.trim().replace(/[:：,]$/, '')
      if (!s || fixed.test(s)) continue
      assert.ok(allowed.includes(s) || allowed.toUpperCase().includes(s), `"${piece}" is not from the model`)
    }
  })
}

test('pdf: the owner is emphasised with the bold face and the venue is slanted', async () => {
  fonts ??= loadPdfFonts()
  const m = model(cvDoc(), 'en')
  const out = await renderCvPdf(m, { fonts })
  const runs = pdfTextRuns(out.buffer)
  const fontOf = (text: string) => runs.find((r) => r.text.includes(text))?.font
  assert.equal(fontOf('Yanpei Li*'), 'Geist-SemiBold', 'the owner')
  assert.equal(fontOf('Jane Doe'), 'Geist-Regular', 'a co-author')
  assert.equal(fontOf('李彦霈'), 'NotoSansSC', 'the Chinese name form (faux bold on the CJK face)')
  // Content streams: a skew matrix (the oblique venue) is present.
  const zlib = await import('node:zlib')
  const buf = out.buffer
  const streams: string[] = []
  let at = 0
  for (;;) {
    const s = buf.indexOf('stream\n', at)
    if (s < 0) break
    const e = buf.indexOf('\nendstream', s)
    try {
      streams.push(zlib.inflateSync(buf.subarray(s + 7, e)).toString('latin1'))
    } catch {
      /* not deflated */
    }
    at = e + 10
  }
  const content = streams.join('\n')
  assert.match(content, /\n1 0 -?0\.19\d* 1 [-\d.]+ 0 cm\n/, 'an oblique (skewed) text matrix for the venue')
})

// ── Plain text and JSON Resume ─────────────────────────────────────────────

test('text: a paper prints as citation lines with its status and the DOI URL', () => {
  const en = renderCvText(model(cvDoc(), 'en'))
  const block = en.slice(en.indexOf('Publications\n'))
  assert.match(
    block,
    /^Publications\n-+\nTiny models at the edge\nJane Doe, …, Yanpei Li\*\nJournal of Edge Computing, 12\(3\), 45–67\. ACM\nMar 2025\nBest Paper Award\nPDF: https:\/\/lucian-dev\.com\/uploads\/paper\.pdf\nCode: https:\/\/github\.com\/example\/edge\nPaper: https:\/\/example\.org\/paper\n\nUnder review paper\nLi, Yanpei, A\. Smith\n2026\nStatus: Under review\nhttps:\/\/doi\.org\/10\.5555\/review\.1\n\nA preprint\n/,
  )
  const zh = renderCvText(model(cvDoc(), 'zh'))
  assert.match(zh, /\n状态：审稿中\n/)
  assert.match(zh, /\n代码：https:\/\/github\.com\/example\/edge\n/)
  for (const t of [en, zh]) {
    assert.ok(!t.includes(SECRET))
    assert.ok(!t.includes(VENUE_UNDER_REVIEW))
  }
})

test('JSON Resume: papers first (name, publisher, releaseDate, url, summary), then patents; unpublished work says so', () => {
  const sections = publicCvDoc(cvDoc(), 'cv').en
  const resume = buildJsonResume(sections, { lang: 'en', now: NOW, canonical: 'https://lucian-dev.com/cv.json' }) as { publications: Array<Record<string, string>> }
  assert.deepEqual(resume.publications, [
    { name: 'Tiny models at the edge', publisher: 'Journal of Edge Computing', releaseDate: '2025-03', url: 'https://example.org/paper' },
    { name: 'Under review paper', publisher: 'Under review', url: 'https://doi.org/10.5555/review.1' },
    { name: 'A preprint', publisher: 'Preprint · arXiv', releaseDate: '2026-02', url: 'https://arxiv.org/abs/2602.00001' },
    { name: 'Sorting device', publisher: 'CNIPA', releaseDate: '2024-05', summary: 'Granted' },
  ])
  const raw = JSON.stringify(resume)
  assert.ok(!raw.includes(SECRET) && !raw.includes(VENUE_UNDER_REVIEW))
  // An abstract becomes the summary; a same-site PDF becomes absolute.
  const open = cvDoc({ papers: [{ title: 'Open', status: 'published', venue: 'J', date: '2024', pdfUrl: '/uploads/open.pdf', abstract: 'What it shows.' }] })
  const out = buildJsonResume(publicCvDoc(open, 'cv').en, { lang: 'en', now: NOW, canonical: 'https://lucian-dev.com/cv.json' }) as { publications: Array<Record<string, string>> }
  assert.deepEqual(out.publications[0], { name: 'Open', publisher: 'J', releaseDate: '2024', url: 'https://lucian-dev.com/uploads/open.pdf', summary: 'What it shows.' })
  assert.ok(EXPORT_VERSION >= 3, 'the export version moved with the new output')
})

// ── Home section, /about count, proof-strip suggestions ───────────────────

const view = (doc: CvDoc = cvDoc()): PublicationsSource => {
  const pub = publicCvDoc(doc, 'website')
  return { lang: 'en', publications: publicPublications(pub.en), owner: ownerNamesFromSections(pub.en, pub.zh) }
}

test('home: "Selected publications" is a sortable section, right after projects by default, and in the recruiter preset', () => {
  const i = DEFAULT_SECTION_ORDER.indexOf('publications')
  assert.equal(DEFAULT_SECTION_ORDER[i - 1], 'projects')
  assert.ok(RECRUITER_SECTION_ORDER.includes('publications'))
  assert.equal(new Set(RECRUITER_SECTION_ORDER).size, DEFAULT_SECTION_ORDER.length)
  assert.ok(HOME_SECTION_META.some((m) => m.key === 'publications' && m.label === 'Selected publications'))
  // A stored order from before the section existed gets it after projects.
  const older = ['contact', 'projects', 'writing', 'experience', 'open-source', 'tech-stack', 'activity', 'certifications', 'photos']
  const resolved = resolveSectionOrder(older)
  assert.equal(resolved[resolved.indexOf('projects') + 1], 'publications')
  const saved = normalizeHomeWrite({ sectionOrder: older } as never)
  assert.ok(saved.ok && saved.home.sectionOrder?.includes('publications'))
})

test('home: the first papers of /publications, with their /publications anchors; null without a paper', () => {
  const v = view()
  const selected = selectPublications(v)
  assert.ok(selected)
  assert.equal(selected.total, 3)
  assert.equal(selected.items.length, 3)
  assert.deepEqual(
    selected.items.map((it) => it.key),
    citationKeys(v.publications),
  )
  const [pub, review] = selected.items
  assert.deepEqual(pub, {
    key: 'doe2025tiny',
    title: 'Tiny models at the edge',
    authors: [
      { name: 'Jane Doe', hidden: false, self: false },
      { name: '', hidden: true, self: false },
      { name: 'Yanpei Li*', hidden: false, self: true },
    ],
    venue: 'Journal of Edge Computing',
    year: '2025',
    status: '',
    award: 'Best Paper Award',
  })
  assert.equal(review.status, 'Under review')
  assert.equal(review.venue, '')
  assert.ok(!JSON.stringify(selected).includes(SECRET))

  const many = view(cvDoc({ papers: Array.from({ length: 5 }, (_, n) => ({ title: `Paper ${n}`, status: 'published', date: `202${n}`, authors: ['Yanpei Li'] })) }))
  const five = selectPublications(many)
  assert.equal(five?.items.length, HOME_PUBLICATIONS_MAX)
  assert.equal(five?.total, 5)
  assert.deepEqual(five?.items.map((it) => it.title), ['Paper 4', 'Paper 3', 'Paper 2'], 'newest first')

  assert.equal(selectPublications(view(cvDoc({ papers: [] }))), null)
  assert.equal(selectPublications(view(cvDoc({ showOnWebsite: false }))), null, 'the website switch hides the home section')
  assert.equal(selectPublications(null), null)
})

test('/about: the rail names the count', () => {
  assert.equal(paperCount(1), '1 paper')
  assert.equal(paperCount(3), '3 papers')
})

test('proof strip: published papers are suggested verbatim (title; venue · year), after patents and before education', () => {
  const tiles = publicationTiles(view())
  assert.deepEqual(tiles, [{ value: 'Tiny models at the edge', label: 'Journal of Edge Computing · 2025', href: '/publications#doe2025tiny', source: 'CV · Publications' }])
  const cvEn = [
    { sessionName: 'competitionAwards', headerName: 'COMPETITIONS', awards: [{ contestName: 'IEEE Xtreme', award: '18th Worldwide' }] },
    { sessionName: 'patents', headerName: 'PATENTS', patentExperience: [{ title: 'Sorting device', authority: 'CNIPA', status: 'Granted' }] },
    { sessionName: 'education', headerName: 'EDUCATION', educationExperience: [{ degree: 'BSc', schoolName: 'HKMU' }] },
  ]
  const out = suggestHighlights(cvEn, { papers: tiles })
  assert.deepEqual(out.map((s) => s.value), ['18th Worldwide', 'Sorting device', 'Tiny models at the edge', 'BSc'])
  assert.equal(suggestHighlights(cvEn, { papers: tiles, max: 2 }).length, 2)
  // A paper with neither venue nor year has no line to show: not offered.
  assert.deepEqual(publicationTiles(view(cvDoc({ papers: [{ title: 'Bare', status: 'published', authors: [] }] }))), [])
  assert.deepEqual(publicationTiles(null), [])
})

// ── Search documents ───────────────────────────────────────────────────────

test('search: one document per public paper, at its /publications anchor — or the CV anchor when the page is off', () => {
  const v = view()
  const docs = publicationDocs(v, publicCvDoc(cvDoc(), 'cv').en)
  assert.deepEqual(
    docs.map((d) => [d.title, d.href, d.description]),
    [
      ['Tiny models at the edge', '/publications#doe2025tiny', 'Journal of Edge Computing · 2025'],
      ['Under review paper', `/publications#${citationKeys(v.publications)[1]}`, 'Under review · 2026'],
      ['A preprint', `/publications#${citationKeys(v.publications)[2]}`, 'Preprint · arXiv · 2026'],
    ],
  )
  assert.ok(docs.every((d) => d.kind === 'publication'))
  assert.equal(docs[0].body, 'Jane Doe, Yanpei Li* Best Paper Award')
  assert.deepEqual(docs[0].tags, ['TypeScript'])
  const raw = JSON.stringify(docs)
  assert.ok(!raw.includes(SECRET) && !raw.includes(VENUE_UNDER_REVIEW))

  // Website switch off: the CV still lists them, at the sheet's anchors.
  const cvOnly = cvDoc({ showOnWebsite: false })
  const fromCv = publicationDocs(view(cvOnly), publicCvDoc(cvOnly, 'cv').en)
  // (The index counts visible papers — the hidden one is gone, the status-less one still counts — like the sheet.)
  assert.deepEqual(fromCv.map((d) => d.href), ['/cv#cv-publications-0', '/cv#cv-publications-1', '/cv#cv-publications-3'])
  // Off both: nothing.
  const off = cvDoc({ showOnWebsite: false, isVisible: false })
  assert.deepEqual(publicationDocs(view(off), publicCvDoc(off, 'cv').en), [])
  // A Chinese title is marked as such.
  const zhOnly = cvDoc({ papers: [{ title: '中文论文标题', status: 'preprint', authors: [] }] })
  assert.equal(publicationDocs(view(zhOnly), [])[0].lang, 'zh-Hans')
})

// ── Readiness ──────────────────────────────────────────────────────────────

const readiness = (paperList: unknown[], extra: Record<string, unknown> = {}): ReadinessFinding[] =>
  runReadinessChecks({ en: [{ sessionName: 'publications', papers: paperList, ...extra }], zh: [] }, { now: NOW }).filter((f) => f.sectionName === 'publications')

test('readiness: a published paper without venue, date or any link is flagged, each at its field', () => {
  const fs1 = readiness([{ title: 'Bare paper', status: 'published', authors: ['Yanpei Li'] }])
  assert.deepEqual(
    fs1.map((f) => [f.check, f.path?.slice(1).join('.')]),
    [
      ['paper-incomplete', 'papers.0.venue'],
      ['paper-incomplete', 'papers.0.date'],
      ['paper-incomplete', 'papers.0.doi'],
    ],
  )
  for (const f of fs1) {
    assert.equal(f.severity, CHECK_SEVERITY['paper-incomplete'])
    assert.equal(f.lang, 'en')
    assert.deepEqual(f.crumbs, ['Publications', 'Bare paper'])
  }
  // Complete: venue, a YYYY date, and a DOI — or a paper page, or a PDF.
  for (const link of [{ doi: 'https://doi.org/10.1145/1' }, { url: 'https://example.org/p' }, { pdfUrl: '/uploads/p.pdf' }]) {
    assert.deepEqual(readiness([{ title: 'Done', status: 'published', venue: 'J', date: '2024', ...link }]), [])
  }
  // An invalid date or DOI does not count; a field the owner hid is a decision, not a gap.
  assert.deepEqual(readiness([{ title: 'Odd', status: 'published', venue: 'J', date: 'spring', doi: 'nope' }]).map((f) => f.path?.at(-1)), ['date', 'doi'])
  assert.deepEqual(readiness([{ title: 'Hid', status: 'published', hiddenFields: ['venue', 'date', 'doi'] }]), [])
  // Only published papers need all three.
  assert.deepEqual(readiness([{ title: 'Pre', status: 'preprint' }, { title: 'Acc', status: 'accepted' }]), [])
})

test(`readiness: "under review" for more than ${REVIEW_STALE_MONTHS} months is flagged`, () => {
  const stale = readiness([{ title: 'Slow review', status: 'under-review', date: '2025-03' }])
  assert.equal(stale.length, 1)
  assert.equal(stale[0].check, 'stale-review')
  assert.deepEqual(stale[0].path?.slice(1), ['papers', 0, 'status'])
  assert.match(stale[0].title, /under review since 2025-03/)
  assert.match(stale[0].detail, /19 months/)
  assert.deepEqual(readiness([{ title: 'Fresh', status: 'under-review', date: '2025-04' }]), [], 'exactly 18 months is still fine')
  assert.deepEqual(readiness([{ title: 'Year only', status: 'under-review', date: '2025' }]), [], 'a bare year counts from its end')
  assert.equal(readiness([{ title: 'Old year', status: 'under-review', date: '2024' }]).length, 1)
  assert.deepEqual(readiness([{ title: 'Undated', status: 'under-review' }]), [])
})

test('readiness: papers are judged wherever they are public, and only papers that render', () => {
  const bare = [{ title: 'Bare', status: 'published' }]
  assert.equal(readiness(bare, { isVisible: false }).length, 3, 'website only: still public')
  assert.equal(readiness(bare, { showOnWebsite: false }).length, 3, 'CV only: still public')
  assert.deepEqual(readiness(bare, { isVisible: false, showOnWebsite: false }), [], 'off everywhere')
  assert.deepEqual(readiness([{ title: 'Hidden', status: 'published', isVisible: false }, { title: 'No status', status: '' }, { title: '', status: 'published' }]), [])
  assert.deepEqual(readiness([{ title: 'Status hidden', status: 'published', hiddenFields: ['status'] }]), [], 'a hidden status hides the paper')
  // Fingerprints follow the content: a fixed venue changes nothing else.
  const a = readiness([{ title: 'Bare', status: 'published', date: '2024' }])
  const b = readiness([{ title: 'Bare', status: 'published', date: '2024', venue: 'J' }])
  assert.deepEqual(b.map((f) => f.id), a.filter((f) => f.path?.at(-1) !== 'venue').map((f) => f.id))
})

// ── Skill evidence ─────────────────────────────────────────────────────────

test('skill evidence: a paper whose keywords (or title / abstract) name a skill links to the paper', () => {
  const sections = publicCvDoc(cvDoc(), 'cv').en
  const evidence = buildSkillEvidence(sections, { lang: 'en' })
  const ts = evidence.find((e) => e.key === 'typescript')
  assert.ok(ts)
  assert.deepEqual(ts.items, [{ kind: 'paper', label: 'Tiny models at the edge', href: '#cv-publications-0' }])
  assert.equal(evidence.find((e) => e.key === 'rust'), undefined, 'no evidence, no row')
  assert.ok(!JSON.stringify(evidence).includes(SECRET), 'a hidden keyword is never matched or shown')
  // Text matches too (word-bounded), and a paper that does not render is never cited.
  const textual = cvDoc({ papers: [{ title: 'TypeScript on microcontrollers', status: 'preprint' }, { title: 'TypeScript without status', status: '' }] })
  const byText = buildSkillEvidence(publicCvDoc(textual, 'cv').en, { lang: 'en' }).find((e) => e.key === 'typescript')
  assert.deepEqual(byText?.items, [{ kind: 'paper', label: 'TypeScript on microcontrollers', href: '#cv-publications-0' }])
  // Short or ambiguous names ("Rust", "Go") match as keywords only, never in prose.
  const prose = cvDoc({ papers: [{ title: 'Rust on microcontrollers', status: 'preprint' }, { title: 'Embedded', status: 'preprint', keywords: ['Rust'] }] })
  const rust = buildSkillEvidence(publicCvDoc(prose, 'cv').en, { lang: 'en' }).find((e) => e.key === 'rust')
  assert.deepEqual(rust?.items, [{ kind: 'paper', label: 'Embedded', href: '#cv-publications-1' }])
  assert.equal(EVIDENCE_KIND_LABELS.en.paper, 'Paper')
  assert.equal(EVIDENCE_KIND_LABELS.zh.paper, '论文')
})

// ── From a real content store ──────────────────────────────────────────────

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publications-phase2-'))
let writeCvData: (doc: CvDoc) => Promise<{ ok: boolean }>
let closeDb: () => void

before(async () => {
  // Fonts load from the app root before the store moves to a scratch folder.
  fonts = loadPdfFonts()
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  writeCvData = (await import('../lib/cvdata')).writeCvData as never
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb?.()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('store: the downloadable CVs, the home section, the /about count and the search index print the public papers and nothing hidden', async () => {
  const { getCvExport, clearCvExportCache } = await import('../lib/cvExport/service')
  const data = await import('../lib/publicationsData')
  const { buildSearchIndex } = await import('../lib/searchIndex')

  // Empty store: nothing anywhere.
  assert.equal(data.readHomePublications(), null)
  assert.equal(data.publicationCount(), 0)
  assert.ok(!buildSearchIndex().docs.some((d) => d.href.startsWith('/publications')))

  assert.equal((await writeCvData(cvDoc())).ok, true)
  clearCvExportCache()
  for (const lang of ['en', 'zh'] as const) {
    for (const format of ['pdf', 'txt', 'json'] as const) {
      const res = await getCvExport(lang, format)
      assert.ok(res.ok, `${lang}.${format}`)
      const body = res.file.body
      const text = format === 'pdf' ? pdfText(body) : body.toString('utf8')
      const title = lang === 'zh' ? '边缘设备上的小模型' : 'Tiny models at the edge'
      assert.ok(squashSpace(text).includes(squashSpace(title)), `${lang}.${format} lists the paper`)
      assert.ok(text.includes('Under review paper'), `${lang}.${format} lists the paper under review`)
      for (const hidden of [SECRET, VENUE_UNDER_REVIEW]) {
        assert.ok(!text.includes(hidden) && !body.toString('latin1').includes(hidden), `${lang}.${format}: ${hidden}`)
      }
    }
  }
  const body = async (lang: 'en' | 'zh', format: 'pdf' | 'txt' | 'json') => {
    const res = await getCvExport(lang, format)
    assert.ok(res.ok)
    return res.file.body
  }
  assert.equal(JSON.parse((await body('en', 'json')).toString('utf8')).publications[0].name, 'Tiny models at the edge')

  const home = data.readHomePublications()
  assert.equal(home?.items.length, 3)
  assert.equal(data.publicationCount(), 3)
  const index = buildSearchIndex()
  const papersIndexed = index.docs.filter((d) => d.href.startsWith('/publications#'))
  assert.deepEqual(papersIndexed.map((d) => d.title), ['Tiny models at the edge', 'Under review paper', 'A preprint'])
  for (const raw of [JSON.stringify(home), JSON.stringify(index)]) {
    assert.ok(!raw.includes(SECRET) && !raw.includes(VENUE_UNDER_REVIEW))
  }

  // Off the website: no home section, no count, the CV anchors in search; the CV files keep the papers.
  await writeCvData(cvDoc({ showOnWebsite: false }))
  assert.equal(data.readHomePublications(), null)
  assert.equal(data.publicationCount(), 0)
  assert.ok(buildSearchIndex().docs.some((d) => d.href === '/cv#cv-publications-0'))
  assert.ok((await body('en', 'txt')).toString('utf8').includes('Tiny models at the edge'))

  // Off the CV: the files drop them, the website keeps them.
  await writeCvData(cvDoc({ isVisible: false }))
  const txt = (await body('en', 'txt')).toString('utf8')
  assert.ok(!txt.includes('Tiny models at the edge'))
  assert.equal(data.publicationCount(), 3)
})

test('store: a CV whose only public content besides the name is papers still serves /cv.pdf, /cv.txt and /cv.json (CORR-1)', async () => {
  const { getCvExport, clearCvExportCache } = await import('../lib/cvExport/service')
  const only = (lang: 'en' | 'zh', list: unknown[]) => [personal(lang), { sessionName: 'publications', headerName: lang === 'zh' ? '论文' : 'Publications', papers: list }]
  const paper = { title: 'The only paper', status: 'accepted', venue: 'Example Conference', date: '2026-06', authors: ['Yanpei Li'] }
  assert.equal((await writeCvData({ en: only('en', [paper]), zh: only('zh', [paper]) })).ok, true)
  clearCvExportCache()
  for (const lang of ['en', 'zh'] as const) {
    for (const format of ['pdf', 'txt', 'json'] as const) {
      const res = await getCvExport(lang, format)
      assert.ok(res.ok, `${lang}.${format} is served`)
      const text = format === 'pdf' ? pdfText(res.file.body) : res.file.body.toString('utf8')
      assert.ok(squashSpace(text).includes('Theonlypaper'), `${lang}.${format} lists the paper`)
    }
  }
  // /cv offers its download menu (a file name means downloads are shown).
  const { loadCvPageProps } = await import('../lib/cvPage')
  const page = (await loadCvPageProps('en')) as { props: { fileBase: string } }
  assert.match(page.props.fileBase, /^Li-Yanpei-CV-\d{4}-\d{2}$/)
  // No paper that renders: nothing to download, as before.
  await writeCvData({ en: only('en', [{ ...paper, status: '' }]), zh: only('zh', []) })
  clearCvExportCache()
  const none = await getCvExport('en', 'pdf')
  assert.equal(none.ok, false)
  assert.equal(((await loadCvPageProps('en')) as { props: { fileBase: string } }).props.fileBase, '')
})
