/**
 * search-ask (J1): "Ask Lucian" — answers quoted from the site's own
 * passages (no LLM). Text fragments, the passage index (CV, bodies,
 * availability, papers), the answer engine (BM25, topics, twins, nothing
 * invented), the view model, the contact handoff and the palette event.
 * Over the synthetic, owner-neutral fixture of tests/searchFixture.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeQuery } from '../lib/search/query'
import { SYNONYM_GROUPS } from '../lib/search/synonyms'
import { directiveOf, encodeTextTerm, textDirectiveTerms, withTextDirective } from '../lib/search/textFragment'
import { flatten, locateQuote } from '../lib/search/quoteLocate'
import { draftWithQuestion, prefillMessage, PREFILL_MAX } from '../lib/contactPrefill'
import { availabilityPassages, bodyPassages, bodyTree, cvPassages, docPassages, finish, fragSpec, sentenceRuns, sentences } from '../lib/askIndex'
import { ask, askSuggestions, createAskEngine, parseAskIndex, passageHref, SUGGESTED_QUESTIONS } from '../lib/ask/engine'
import { answerSignature, askOptions, askStatusText } from '../lib/ask/view'
import { ASK_COPY, askCopyFor } from '../lib/ask/copy'
import { compileMdx } from '../lib/mdx'
import { ALIGNED, CV, PAPER, SUBJECT } from './searchFixture'

const PASSAGES = finish([
  ...cvPassages(CV.en, 'en', ALIGNED),
  ...cvPassages(CV.zh, 'zh', ALIGNED),
  ...bodyPassages(bodyTree('Intro paragraph about the conveyor belt and the sorting arm.\n\n## Lessons\n\nThe model was the easy part; the mechanics were not.', 'en'), {
    url: '/blog/edge-sorting',
    page: 'Notes on edge sorting',
    lang: 'en',
    kind: 'post',
  }),
  ...docPassages(PAPER as never),
])
const ENGINE = createAskEngine(parseAskIndex(JSON.parse(JSON.stringify(PASSAGES))))

test('J1: text directives — whole short quotes, start/end of long ones, syntax encoded', () => {
  assert.equal(encodeTextTerm('a-b, c&d'), 'a%2Db%2C%20c%26d')
  assert.deepEqual(textDirectiveTerms('Short quote.'), ['Short quote.'])
  const long = 'Designed a scalable backend architecture using a document database and containers for data persistence and repeatable deployment across regions.'
  const [start, end] = textDirectiveTerms(long)
  assert.ok(long.startsWith(start) && long.endsWith(end) && start.length >= 24 && end.length >= 16)
  // The start term is lengthened until no other text of the page contains it.
  const other = 'Designed a scalable backend architecture using a cache layer.'
  const [start2] = textDirectiveTerms(long, [other])
  assert.ok(!other.toLowerCase().includes(start2.toLowerCase()), start2)
  assert.equal(directiveOf(['a-b']), 'text=a%2Db')
  assert.equal(withTextDirective('/cv#cv-patents-0', 'text=x'), '/cv#cv-patents-0:~:text=x')
  assert.equal(withTextDirective('/now', 'text=x'), '/now#:~:text=x')
  assert.deepEqual(fragSpec('abc def', ['abc def']), 1)
  assert.deepEqual(fragSpec('abc middle def', ['abc', 'def']), [3, 11])
})

test('J1: a cited quote is found in page text like a text directive finds it', () => {
  const flat = flatten('Header\n  Built   internal DASHBOARDS for the operations team.  Footer')
  const hit = locateQuote(flat, ['Built internal dashboards', 'operations team.'])!
  assert.equal(flat.folded.slice(hit.start, hit.end), 'built internal dashboards for the operations team.')
  assert.equal(locateQuote(flat, ['nowhere']), null)
  assert.equal(locateQuote(flat, ['Built', 'nowhere']), null)
})

test('J1: CV passages — facts lines are marked, verbatim lines carry text directives, twins pair up', () => {
  const rows = PASSAGES.passages.map((p) => ({ ...p, src: PASSAGES.sources[p.s] }))
  const facts = rows.find((r) => r.t.startsWith('Software Engineering Intern · Example Labs'))!
  assert.equal(facts.m, 1)
  assert.equal(facts.f, undefined, 'a facts line is not one rendered block')
  const line = rows.find((r) => r.t === 'Built internal dashboards for the operations team.')!
  assert.equal(line.f, 1)
  assert.equal(line.src.url, '/cv#cv-workExperience-0')
  assert.equal(line.src.topic, 'workExperience')
  const zhLine = rows.find((r) => r.t === '为运营团队开发内部数据看板。')!
  assert.equal(zhLine.src.url, '/cv/zh#cv-workExperience-0')
  assert.equal(`${line.src.align}:${line.a}`, `${zhLine.src.align}:${zhLine.a}`, 'EN / ZH twins share a key')
  assert.ok(!JSON.stringify(PASSAGES).includes('person@example.com'), 'contact details are never quoted')
})

test('J1: body passages follow the rendered headings (ids as compileMdx renders them)', async () => {
  const body = '# Title\n\nAn opening paragraph that is long enough to quote.\n\n## Why it matters\n\nThe reasoning paragraph is long enough to quote too.[^1]\n\n```js\nsecret()\n```\n\n[^1]: A footnote that is never quoted.'
  const drafts = bodyPassages(bodyTree(body, 'en'), { url: '/blog/x', page: 'X', lang: 'en', kind: 'post' })
  const { toc } = await compileMdx(body, { lang: 'en' })
  const ids = toc.map((t) => t.id)
  const under = drafts.find((d) => d.text.startsWith('The reasoning paragraph'))!
  assert.ok(ids.includes(under.url.split('#')[1]), `${under.url} uses a rendered heading id (${ids.join(', ')})`)
  assert.equal(under.text, 'The reasoning paragraph is long enough to quote too.', 'footnote marks are not part of the quote')
  assert.ok(!drafts.some((d) => /secret|never quoted/.test(d.text)), 'code and endnotes are not quoted')
  assert.equal(drafts[0].url, '/blog/x')
})

test('J1: long paragraphs are cut into sentence runs; the availability is quoted only when set', () => {
  const para = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} talks about Next.js 3.5 builds.`).join(' ')
  const runs = sentenceRuns(para, 120)
  assert.ok(runs.length > 1 && runs.every((r) => r.length <= 120))
  assert.equal(runs.join(' '), para, 'nothing is dropped; "Next.js 3.5" does not end a sentence')
  assert.deepEqual(sentences('他说：“好的。”然后离开了！Fine.'), ['他说：“好的。”', '然后离开了！', 'Fine.'])
  assert.deepEqual(sentences('It works (mostly.) Then it stops.'), ['It works (mostly.)', 'Then it stops.'])
  assert.deepEqual(availabilityPassages(null), [])
  const open = availabilityPassages({ status: 'open', roles: ['Backend'], from: '2026-11' })
  assert.ok(open.length >= 2 && open.every((d) => d.url === '/contact#availability' && d.topic === 'availability'))
})

test('J1: parseAskIndex drops malformed rows and off-site sources', () => {
  const parsed = parseAskIndex({
    sources: [{ url: '//evil.example', page: 'x', lang: 'en', kind: 'cv' }, { url: '/cv#cv-x-0', page: 'CV', lang: 'en', kind: 'cv' }],
    passages: [{ t: 'off site', s: 0 }, { t: 'ok', s: 1, f: [5, 1] }, { t: '', s: 1 }, { t: 'fine quote', s: 1, f: 1 }, null, { t: 'x', s: 9 }],
  })
  assert.deepEqual(
    parsed.map((p) => [p.text, p.terms]),
    [
      ['ok', []],
      ['fine quote', ['fine quote']],
    ],
  )
  assert.equal(passageHref(parsed[1]), '/cv#cv-x-0:~:text=fine%20quote')
})

test('J1: "Does he have patents?" / "他有专利吗？" are answered with quotes in the question\'s language', () => {
  const en = ask(ENGINE, 'Does he have patents?', { subject: SUBJECT })
  assert.equal(en.status, 'answered')
  assert.equal(en.groups[0].url, '/cv#cv-patents-0')
  assert.ok(en.groups[0].quotes.some((q) => q.passage.text === 'Folding Hinge Structure (Invention Patent)'))
  assert.ok(en.groups[0].quotes.every((q) => q.href.startsWith('/cv#cv-patents-0')))
  assert.ok(en.groups[0].quotes.some((q) => q.href.includes(':~:text=')), 'quotes link with a text directive')
  assert.ok(en.groups.every((g) => !g.url.startsWith('/cv/zh')), 'the Chinese twins are not repeated')
  const zh = ask(ENGINE, '他有专利吗？', { subject: SUBJECT })
  assert.equal(zh.status, 'answered')
  assert.equal(zh.lang, 'zh')
  assert.equal(zh.groups[0].url, '/cv/zh#cv-patents-0')
  assert.ok(zh.groups[0].quotes.some((q) => q.segments.some((s) => s.match && s.text.includes('专利'))))
})

test('J1: questions find their topic; nothing is invented when nothing matches', () => {
  const study = ask(ENGINE, 'Where did he study?', { subject: SUBJECT })
  assert.equal(study.status, 'answered')
  assert.equal(study.groups[0].url, '/cv#cv-education-0')
  const intern = ask(ENGINE, '他在哪里实习过？', { subject: SUBJECT })
  assert.equal(intern.groups[0].url, '/cv/zh#cv-workExperience-0')
  const langs = ask(ENGINE, 'What languages does he speak?', { subject: SUBJECT })
  assert.ok(langs.groups[0].quotes.some((q) => q.passage.text === 'Cantonese: Native'))
  for (const q of ['Does he know Kubernetes?', '他会弹钢琴吗？', 'Is he open to work?']) {
    const r = ask(ENGINE, q, { subject: SUBJECT })
    assert.equal(r.status, 'none', q)
    assert.deepEqual(r.groups, [])
  }
  assert.equal(ask(ENGINE, 'What does he do?', { subject: SUBJECT }).status, 'vague')
  assert.equal(ask(ENGINE, '他是哪里人', { subject: SUBJECT }).status, 'vague')
  assert.equal(ask(ENGINE, '   ').status, 'empty')
})

test('J1: every quoted text is verbatim from the index (nothing generated)', () => {
  const texts = new Set(PASSAGES.passages.map((p) => p.t))
  for (const q of [...SUGGESTED_QUESTIONS.en, ...SUGGESTED_QUESTIONS.zh, 'dashboards', 'conveyor', 'Go billing']) {
    for (const g of ask(ENGINE, q, { subject: SUBJECT }).groups) {
      for (const quote of g.quotes) {
        assert.ok(texts.has(quote.passage.text), quote.passage.text)
        assert.equal(quote.segments.map((s) => s.text).join(''), quote.passage.text)
      }
    }
  }
})

test('J1: a partial answer names what is missing; suggestions are only questions this site answers', () => {
  const partial = ask(ENGINE, 'internal dashboards operations kubernetes terraform', { subject: SUBJECT })
  assert.equal(partial.status, 'partial')
  assert.ok(partial.missing.includes('kubernetes') && partial.missing.includes('terraform'))
  const suggestions = askSuggestions(ENGINE, { subject: SUBJECT, primary: 'en' })
  assert.ok(suggestions.length > 0)
  for (const s of suggestions) assert.equal(ask(ENGINE, s.question, { subject: SUBJECT }).status, 'answered', s.question)
  assert.ok(suggestions.some((s) => s.lang === 'zh') && suggestions[0].lang === 'en')
  const zhFirst = askSuggestions(ENGINE, { subject: SUBJECT, primary: 'zh' })
  assert.equal(zhFirst[0].lang, 'zh')
  assert.deepEqual(askSuggestions(createAskEngine([]), {}), [], 'no content, no suggestion')
})

test('J1: publication documents become passages once they exist', () => {
  const r = ask(ENGINE, 'Has he published any papers?', { subject: SUBJECT })
  assert.equal(r.status, 'answered')
  assert.equal(r.groups[0].url, '/publications#example2026')
})

test('J1: the view model — options in display order and what the live region says', () => {
  const copy = ASK_COPY.en
  const loading = { ready: false, question: '', result: ask(ENGINE, ''), suggestions: [] }
  assert.deepEqual(askOptions(loading), [])
  assert.equal(askStatusText(loading, copy), copy.status.loading)
  assert.equal(askStatusText({ ...loading, failed: true }, copy), copy.status.unavailable)
  const suggestions = askSuggestions(ENGINE, { subject: SUBJECT })
  const empty = { ready: true, question: '', result: ask(ENGINE, ''), suggestions }
  assert.deepEqual(
    askOptions(empty).map((o) => o.kind),
    suggestions.map(() => 'suggestion'),
  )
  const answered = { ready: true, question: 'patents', result: ask(ENGINE, 'patents', { subject: SUBJECT }), suggestions }
  const opts = askOptions(answered)
  assert.equal(opts[opts.length - 1].kind, 'contact', 'ends with "Ask Lucian directly"')
  assert.equal(opts.filter((o) => o.kind === 'quote').length, answered.result.count)
  assert.match(askStatusText(answered, copy), /quotes? from 1 source/)
  const none = { ready: true, question: 'kubernetes', result: ask(ENGINE, 'kubernetes'), suggestions }
  assert.deepEqual(
    askOptions(none).map((o) => o.kind),
    ['contact', 'search'],
  )
  assert.equal(askStatusText(none, copy), copy.status.none)
  assert.notEqual(answerSignature(answered.result), answerSignature(none.result))
  assert.equal(answerSignature(ask(ENGINE, 'patents', { subject: SUBJECT })), answerSignature(answered.result), 'same answer, same key (no re-reveal)')
  assert.equal(askCopyFor('他有专利吗', 'en'), ASK_COPY.zh)
  assert.equal(askCopyFor('', 'zh-Hans'), ASK_COPY.zh)
  assert.equal(askCopyFor('', undefined), ASK_COPY.en)
})

test('contact handoff: plain text, capped, an existing draft message is kept', () => {
  assert.equal(prefillMessage('  Does he\nhave patents?\u0007 '), 'Does he have patents?')
  assert.equal(Array.from(prefillMessage('问'.repeat(400))).length, PREFILL_MAX)
  assert.deepEqual(draftWithQuestion(null, 'Q?'), { message: 'Q?' })
  assert.deepEqual(draftWithQuestion(JSON.stringify({ name: 'Ann', message: '' }), 'Q?'), { name: 'Ann', message: 'Q?' })
  assert.deepEqual(draftWithQuestion(JSON.stringify({ message: 'Mine' }), 'Q?'), { message: 'Mine' })
  assert.deepEqual(draftWithQuestion('{broken', 'Q?'), { message: 'Q?' })
  assert.equal(draftWithQuestion(null, '   '), null)
})

test('the "Ask Lucian" entry opens the palette in Ask mode (a search keeps its old event)', async () => {
  const { openCommandPalette, OPEN_PALETTE_EVENT, normalizePaletteMode } = await import('../components/Chrome/paletteEvents')
  const seen: unknown[] = []
  const g = globalThis as unknown as { window?: unknown }
  g.window = { dispatchEvent: (e: CustomEvent) => seen.push([e.type, e.detail]) }
  try {
    openCommandPalette('', 'ask')
    openCommandPalette('blog')
  } finally {
    delete g.window
  }
  // The detail always carries the keyboard layer's page / instant (motion, C5); mode only when it is 'ask'.
  assert.deepEqual(seen, [
    [OPEN_PALETTE_EVENT, { query: '', page: null, instant: false, mode: 'ask' }],
    [OPEN_PALETTE_EVENT, { query: 'blog', page: null, instant: false }],
  ])
  assert.equal(normalizePaletteMode('ask'), 'ask')
  assert.equal(normalizePaletteMode('nope'), 'search')
})

test('J1: ambiguous words find their topic when typed but never stand in for another word', () => {
  const index = finish(
    bodyPassages(bodyTree('The classifier labels each item as paper, plastic or metal for the sorting arm.\n\n实现 JWT 身份认证和服务端渲染，并完成部署上线。', 'en'), {
      url: '/blog/sorter',
      page: 'Sorter',
      lang: 'en',
      kind: 'post',
    }),
  )
  const engine = createAskEngine(parseAskIndex(JSON.parse(JSON.stringify(index))))
  // "paper" (waste paper) is not a publication; 身份认证 (authentication) is not a certificate.
  for (const q of ['他发表过论文吗？', 'Has he published any papers?', '他有哪些证书？', 'Which certifications does he hold?']) assert.equal(ask(engine, q).status, 'none', q)
  // Typed, the words themselves are found.
  assert.equal(ask(engine, 'paper plastic').status, 'answered')
  assert.equal(ask(engine, '身份认证').status, 'answered')
  // Filler verbs of a question are dropped, in both languages.
  assert.deepEqual(
    analyzeQuery('他用过深度学习吗？').concepts.map((c) => c.label),
    ['深度学习'],
  )
  assert.deepEqual(
    analyzeQuery('Has he used Docker?').concepts.map((c) => c.label),
    ['Docker'],
  )
  for (const g of SYNONYM_GROUPS) for (const a of g.ambiguous || []) assert.ok(!g.terms.includes(a), `${g.id}: ${a} is either a term or ambiguous`)
})
