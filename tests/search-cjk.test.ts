/**
 * search-cjk (F4): Chinese and natural-language site search — text analysis
 * (folding, stemming, CJK bigrams, Chinese stop words), query analysis
 * (question words and the owner's names dropped, phrases, synonyms in both
 * languages, topics), golden queries over a synthetic bilingual index (实习,
 * 香港, 专利 …), the 404 suggestions, and the search_empty callback.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bigrams, cjkWords, foldText, looksLikeQuestion, stem, tokenize } from '../lib/search/text'
import { analyzeQuery, findAlt, fieldIndex, requiredMatchesFor, strongConcepts, windowSegments } from '../lib/search/query'
import { SYNONYM_GROUPS } from '../lib/search/synonyms'
import { EMPTY_QUERY_MAX, normalizeEmptyQuery, onEmptyResult } from '../lib/search/emptyResult'
import { parseSearchIndex, rankSearchDocs } from '../components/Article/fuzzyMatch'
import { suggestFromIndex } from '../lib/notFoundSuggest'
import { DOCS, SUBJECT } from './searchFixture'

const titles = (q: string) => rankSearchDocs(DOCS.docs, q, undefined, { subject: SUBJECT }).map((h) => h.doc.title)

test('text: folding keeps offsets; light stemming; CJK bigrams with offsets', () => {
  for (const s of ['Ｐython Résumé', '香港（中文）', 'Next.js']) assert.equal(foldText(s).length, s.length, s)
  assert.equal(foldText('Ｐython Résumé'), 'python resume')
  assert.deepEqual(['patents', 'studies', 'studied', 'awarded', 'running', 'classes', 'is', 'go'].map(stem), ['patent', 'study', 'study', 'award', 'run', 'class', 'is', 'go'])
  assert.deepEqual(bigrams('香港中文大学'), ['香港', '港中', '中文', '文大', '大学'])
  assert.deepEqual(bigrams('奖'), ['奖'])
  const toks = tokenize('在香港实习 at Example')
  assert.deepEqual(
    toks.map((t) => t.term),
    ['在香', '香港', '港实', '实习', 'at', 'example'],
  )
  const hk = toks.find((t) => t.term === '香港')!
  assert.equal('在香港实习 at Example'.slice(hk.start, hk.end), '香港')
  assert.ok(tokenize('C++ and C#').some((t) => t.term === 'c++'))
})

test('text: Chinese question words and particles are dropped from queries', () => {
  assert.deepEqual(cjkWords('他有专利吗'), ['专利'])
  assert.ok(cjkWords('他在哪里实习过').includes('实习'))
  assert.equal(looksLikeQuestion('Does he have patents?'), true)
  assert.equal(looksLikeQuestion('他有专利吗'), true)
  assert.equal(looksLikeQuestion('react hooks'), false)
})

test('query: question words, the owner\'s names and stop words go; synonyms and topics come in', () => {
  const patents = analyzeQuery('Does Example have any patents?', { subject: SUBJECT })
  assert.deepEqual(
    patents.concepts.map((c) => c.label),
    ['patents'],
  )
  assert.ok(patents.concepts[0].alts.some((a) => a.text === '专利'), 'EN → ZH synonym')
  assert.deepEqual(patents.concepts[0].sections, ['patents'])
  assert.equal(patents.question, true)
  const zh = analyzeQuery('示例人有专利吗？', { subject: SUBJECT })
  assert.deepEqual(
    zh.concepts.map((c) => c.label),
    ['专利'],
  )
  assert.ok(zh.concepts[0].alts.some((a) => a.text === 'patent'), 'ZH → EN synonym')
  assert.deepEqual(
    analyzeQuery('hong kong internship').concepts.map((c) => c.label),
    ['hong kong', 'internship'],
    'a known phrase is one concept',
  )
  assert.deepEqual(
    analyzeQuery('Is he open to work?').concepts.map((c) => c.label),
    ['open to work'],
    'a phrase survives its stop word',
  )
  assert.deepEqual(
    analyzeQuery('他会什么编程语言').concepts.map((c) => c.label),
    ['编程语言'],
    'a CJK compound the segmenter split',
  )
  const about = analyzeQuery('about')
  assert.equal(about.fallback, true, 'only stop words: they are kept')
  const weak = analyzeQuery('他是哪里人')
  assert.ok(weak.concepts.every((c) => c.weak), 'a lone unknown character is weak')
  assert.equal(requiredMatchesFor(weak.concepts), weak.concepts.length, 'all weak: required as typed')
  assert.equal(requiredMatchesFor(5), 3)
  assert.equal(strongConcepts(analyzeQuery('哪里人 patents').concepts).length, 1)
})

test('synonyms: groups are generic (no owner facts) and every term resolves', () => {
  const ids = new Set<string>()
  for (const g of SYNONYM_GROUPS) {
    assert.ok(!ids.has(g.id), g.id)
    ids.add(g.id)
    assert.ok(g.terms.length >= 1, g.id)
  }
  for (const id of ['patent', 'intern', 'education', 'award', 'hongkong', 'availability', 'programming-language']) assert.ok(ids.has(id), id)
})

test('query: field matching is whole-word for Latin, substring / most bigrams for CJK', () => {
  const alt = analyzeQuery('ai').concepts[0].alts[0]
  assert.equal(findAlt(alt, fieldIndex('A detailed plan')), null, '"AI" never matches inside "detail"')
  assert.ok(findAlt(alt, fieldIndex('Applied AI at scale')))
  const zh = analyzeQuery('香港中文大学').concepts[0].alts[0]
  assert.ok(findAlt(zh, fieldIndex('就读于香港中文大学')))
  const segs = windowSegments('x'.repeat(100) + 'MATCH' + 'y'.repeat(100), { start: 100, end: 105 }, [{ start: 100, end: 105 }], 40)
  assert.ok(segs.some((s) => s.match && s.text === 'MATCH'))
  assert.ok(segs[0].text.startsWith('…') && segs[segs.length - 1].text.endsWith('…'))
})

test('F4: 实习, 香港 and 专利 find the Chinese CV (and the English twins answer English queries)', () => {
  assert.ok(titles('实习').includes('软件工程实习生'))
  assert.ok(titles('香港').includes('香港示例大学'))
  assert.ok(titles('专利').includes('共同发明人，2 项专利申请'))
  assert.equal(titles('专利')[0], '共同发明人，2 项专利申请')
  assert.equal(titles('patents')[0], 'Co-Inventor, 2 Patent Applications')
  assert.ok(titles('internship').includes('Software Engineering Intern'))
  assert.ok(!titles('patents').includes('共同发明人，2 项专利申请'), 'one of the EN / ZH twins')
})

test('F4: natural-language queries search their meaning', () => {
  assert.equal(titles('Does he have patents?')[0], 'Co-Inventor, 2 Patent Applications')
  assert.equal(titles('他有专利吗？')[0], '共同发明人，2 项专利申请')
  assert.ok(titles('Where did Example study?').includes('Example University of Hong Kong'))
  assert.deepEqual(titles('hong kong internship'), ['Software Engineering Intern'])
  assert.deepEqual(titles('kubernetes'), [])
})

test('F4: hits mark the matched words; docs off this site and publications are handled', () => {
  const [hit] = rankSearchDocs(DOCS.docs, 'dashboards', undefined, { subject: SUBJECT })
  assert.equal(hit.doc.title, 'Software Engineering Intern')
  assert.equal(hit.field, 'body')
  assert.ok(hit.snippet!.some((s) => s.match && /dashboards/i.test(s.text)))
  assert.ok(!DOCS.docs.some((d) => d.href.startsWith('//')), 'off-site hrefs are dropped')
  assert.equal(titles('workshop paper')[0], 'A Study of Example Sorting', 'publication documents are searched')
  const cv = rankSearchDocs(DOCS.docs, 'awards patents', undefined, {})
  assert.ok(cv.every((h) => h.coverage === 1))
})

test('F4: parseSearchIndex keeps the owner\'s names and the raw Ask part', () => {
  const parsed = parseSearchIndex({ docs: [], subject: ['example', 42, 'x'.repeat(80)], ask: { sources: [], passages: [] } })
  assert.deepEqual(parsed.subject, ['example', 'x'.repeat(40)])
  assert.deepEqual(parsed.ask, { sources: [], passages: [] })
  assert.equal(parseSearchIndex({ ask: 'nope' }).ask, null)
})

test('F4: the 404 suggestions mark what matched and add content hits', () => {
  const s = suggestFromIndex('/%E5%AE%9E%E4%B9%A0', DOCS.docs, { subject: SUBJECT })
  assert.ok(s.length > 0)
  const intern = s.find((x) => x.title === '软件工程实习生')!
  assert.ok(intern, 'the internship is suggested for /实习')
  assert.ok(intern.marks && intern.marks.length > 0, 'its title letters are marked')
  const dash = suggestFromIndex('/dashboards', DOCS.docs)
  assert.ok(dash.some((x) => x.href === '/cv#cv-workExperience-0' && x.snippet?.some((seg) => seg.match)))
  assert.deepEqual(suggestFromIndex('/', DOCS.docs), [])
})

test('onEmptyResult: normalised, capped, never personal data', () => {
  assert.equal(normalizeEmptyQuery('  Kubernetes   Experience '), 'kubernetes experience')
  assert.equal(normalizeEmptyQuery('x'.repeat(100)).length, EMPTY_QUERY_MAX)
  assert.equal(normalizeEmptyQuery('me@example.com'), '')
  assert.equal(normalizeEmptyQuery('call +852 5555 0100'), '')
  assert.equal(normalizeEmptyQuery('id A1234567'), '')
  assert.equal(normalizeEmptyQuery(42), '')
  assert.equal(normalizeEmptyQuery('他会弹钢琴吗'), '他会弹钢琴吗')
  // No window on the server: nothing is dispatched.
  assert.equal(onEmptyResult('kubernetes', 'search'), null)
})

test('onEmptyResult dispatches one window event with the normalised query', () => {
  const events: unknown[] = []
  const g = globalThis as unknown as { window?: unknown }
  const target = new EventTarget()
  g.window = target
  target.addEventListener('site:search-empty', (e) => events.push((e as CustomEvent).detail))
  try {
    assert.deepEqual(onEmptyResult(' Rust  Jobs ', 'ask'), { query: 'rust jobs', mode: 'ask' })
    assert.equal(onEmptyResult('me@example.com', 'search'), null)
    assert.deepEqual(events, [{ query: 'rust jobs', mode: 'ask' }])
  } finally {
    delete g.window
  }
})
