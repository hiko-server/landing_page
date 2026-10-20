import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SNIPPET_CHARS,
  fuzzyMatch,
  highlightSegments,
  parseSearchIndex,
  rankItems,
  rankSearchDocs,
  snippetAround,
  truncate,
} from '../components/Article/fuzzyMatch'

test('fuzzyMatch prefers exact > prefix > word start > substring > scattered', () => {
  const exact = fuzzyMatch('cv', 'CV')!.score
  const prefix = fuzzyMatch('cv', 'CV in 中文')!.score
  const word = fuzzyMatch('cv', 'Download CV (PDF)')!.score
  const scattered = fuzzyMatch('gh', 'GitHub')!.score
  assert.ok(exact > prefix && prefix > word && word > scattered)
  assert.deepEqual(fuzzyMatch('cv', 'Download CV (PDF)')!.indices, [9, 10])
})

test('fuzzyMatch finds scattered word-start matches and rejects noise', () => {
  assert.deepEqual(fuzzyMatch('gh', 'GitHub')!.indices, [0, 3])
  assert.deepEqual(fuzzyMatch('vsg', 'View source on GitHub')!.indices, [0, 5, 15])
  assert.equal(fuzzyMatch('xyz', 'GitHub'), null)
  assert.equal(fuzzyMatch('ab', 'a.................................b'), null)
  assert.deepEqual(fuzzyMatch('', 'x'), { score: 0, indices: [] })
  // A word-start jump is not taken when it would make the rest unmatchable.
  assert.deepEqual(fuzzyMatch('ab', 'xa-b a')!.indices, [1, 3])
  // CJK characters are word starts on their own.
  assert.ok(fuzzyMatch('中文', 'CV in 中文'))
})

test('rankItems requires every token, ranks best first and highlights label hits', () => {
  const items = [
    { label: 'Writing', keywords: 'blog posts essays' },
    { label: 'Download CV (PDF)', keywords: 'resume pdf print' },
    { label: 'CV', keywords: 'resume curriculum' },
    { label: 'CV in 中文', keywords: 'chinese zh resume' },
  ]
  const cv = rankItems(items, 'cv')
  assert.equal(cv[0].item.label, 'CV')
  assert.equal(cv.length, 3)
  const resumePdf = rankItems(items, 'resume pdf')
  assert.deepEqual(resumePdf.map((r) => r.item.label), ['Download CV (PDF)'])
  assert.deepEqual(rankItems(items, 'blog')[0].indices, [])
  const boosted = rankItems(items, 'cv', (it) => (it.label === 'CV in 中文' ? 100 : 0))
  assert.equal(boosted[0].item.label, 'CV in 中文')
  assert.equal(rankItems(items, '  ').length, items.length)
})

test('highlightSegments groups consecutive matches', () => {
  assert.deepEqual(highlightSegments('GitHub', [0, 3]), [
    { text: 'G', match: true },
    { text: 'it', match: false },
    { text: 'H', match: true },
    { text: 'ub', match: false },
  ])
  assert.deepEqual(highlightSegments('abc', []), [{ text: 'abc', match: false }])
  assert.deepEqual(highlightSegments('', []), [])
})

// ── content search (field-weighted) ─────────────────────────────────────────

const INDEX = parseSearchIndex({
  v: 1,
  availability: { bookingUrl: 'https://cal.com/lucian/intro' },
  docs: [
    {
      kind: 'cv',
      title: 'Software Engineer',
      href: '/cv#cv-workExperience-0',
      description: 'WeGreen · 2023 – 2024',
    },
    {
      kind: 'work',
      title: 'WeGreen carbon dashboard',
      href: '/work/wegreen',
      description: 'Carbon accounting for small factories',
      tags: ['Next.js', 'Carbon'],
      headings: ['Problem', 'Architecture'],
      body: 'We rebuilt the ingestion pipeline so that factory meters report every five minutes.',
    },
    {
      kind: 'post',
      title: 'Edge AI on a Jetson',
      href: '/blog/edge-ai',
      description: 'Running YOLO at 30 fps',
      tags: ['Edge AI', 'YOLO'],
      headings: ['Quantisation', 'Thermal limits'],
      body: 'The board throttles above 70 °C, so the inference loop backs off when the thermal zone reports heat.',
    },
    { kind: 'page', title: 'Uses', href: '/uses', body: 'Keyboard: HHKB. Editor: Neovim with a WeGreen colour theme I keep forgetting.' },
    // Dropped: unknown kind, external href, protocol-relative href, missing title.
    { kind: 'tweet', title: 'x', href: '/x' },
    { kind: 'post', title: 'Elsewhere', href: 'https://example.com/post' },
    { kind: 'post', title: 'Sneaky', href: '//evil.example/post' },
    { kind: 'post', title: '   ', href: '/blog/empty' },
    null,
  ],
})

test('parseSearchIndex keeps only well-formed, same-site docs and an http(s) booking URL', () => {
  assert.deepEqual(
    INDEX.docs.map((d) => d.href),
    ['/cv#cv-workExperience-0', '/work/wegreen', '/blog/edge-ai', '/uses'],
  )
  assert.equal(INDEX.bookingUrl, 'https://cal.com/lucian/intro')
  assert.equal(parseSearchIndex({ docs: [], availability: { bookingUrl: 'javascript:alert(1)' } }).bookingUrl, '')
  assert.equal(parseSearchIndex({ docs: [], availability: { bookingUrl: '/contact' } }).bookingUrl, '')
  assert.deepEqual(parseSearchIndex(null), { docs: [], bookingUrl: '', subject: [], ask: null })
  assert.deepEqual(parseSearchIndex({ docs: 'nope' }).docs, [])
})

test("'wegreen' finds the case study (title) and the CV entry (description), title first", () => {
  const hits = rankSearchDocs(INDEX.docs, 'wegreen')
  const hrefs = hits.map((h) => h.doc.href)
  assert.equal(hrefs[0], '/work/wegreen')
  assert.ok(hrefs.includes('/cv#cv-workExperience-0'))
  const work = hits[0]
  assert.equal(work.field, 'title')
  assert.deepEqual(work.indices, [0, 1, 2, 3, 4, 5, 6])
  const cv = hits.find((h) => h.doc.kind === 'cv')!
  assert.equal(cv.field, 'description')
  assert.equal(cv.value, 'WeGreen · 2023 – 2024')
  assert.ok(work.score > cv.score, 'title ×3 outranks description ×1')
  // A body-only mention ranks below both.
  const uses = hits.find((h) => h.doc.href === '/uses')!
  assert.equal(uses.field, 'body')
  assert.ok(cv.score > uses.score, 'description ×1 outranks body ×0.5')
})

test('field weights: tags beat headings; body hits come with a marked snippet', () => {
  const yolo = rankSearchDocs(INDEX.docs, 'yolo')
  assert.equal(yolo.length, 1)
  assert.equal(yolo[0].field, 'tag')
  assert.equal(yolo[0].value, 'YOLO')

  const thermal = rankSearchDocs(INDEX.docs, 'thermal')
  assert.equal(thermal[0].doc.href, '/blog/edge-ai')
  assert.equal(thermal[0].field, 'heading', 'heading ×1 outranks the body ×0.5 mention')

  const meters = rankSearchDocs(INDEX.docs, 'meters')
  assert.equal(meters.length, 1)
  assert.equal(meters[0].field, 'body')
  const marked = meters[0].snippet!.filter((s) => s.match)
  assert.deepEqual(marked.map((s) => s.text), ['meters'])
  const text = meters[0].snippet!.map((s) => s.text).join('')
  assert.ok(text.length <= 62, `snippet stays about ${SNIPPET_CHARS} chars (+ ellipses): ${text.length}`)
  assert.ok(text.startsWith('…'), 'cut at the start')
  assert.ok(text.endsWith('five minutes.'), 'the window reaches the end of the body: no trailing ellipsis')
})

test('content search: every token must hit some field; short tokens never search the body', () => {
  assert.equal(rankSearchDocs(INDEX.docs, 'wegreen zzzz').length, 0)
  assert.deepEqual(
    rankSearchDocs(INDEX.docs, 'carbon dashboard').map((h) => h.doc.href),
    ['/work/wegreen'],
  )
  // 'fi' (2 chars) appears in the body ("five", "five minutes") but body search needs ≥ 3.
  assert.ok(!rankSearchDocs(INDEX.docs, 'fi').some((h) => h.field === 'body'))
  assert.deepEqual(rankSearchDocs(INDEX.docs, '   '), [])
  // A boost (group priority / recents) is added on top.
  const boosted = rankSearchDocs(INDEX.docs, 'wegreen', (d) => (d.kind === 'cv' ? 1000 : 0))
  assert.equal(boosted[0].doc.kind, 'cv')
})

test('snippetAround / truncate', () => {
  assert.deepEqual(snippetAround('abc', 1, 1, 60), [
    { text: 'a', match: false },
    { text: 'b', match: true },
    { text: 'c', match: false },
  ])
  const long = `${'x'.repeat(100)}needle${'y'.repeat(100)}`
  const seg = snippetAround(long, 100, 6, 60)
  assert.equal(seg[1].text, 'needle')
  assert.ok(seg[0].text.startsWith('…') && seg[2].text.endsWith('…'))
  assert.equal(seg.map((s) => s.text).join('').replace(/…/g, '').length, 60)
  assert.equal(truncate('short'), 'short')
  assert.equal(truncate('a'.repeat(80), 10), `${'a'.repeat(9)}…`)
})
