/**
 * H3 — the writing environment of the post / case-study editors: word and
 * character counts (CJK per character, the public reading time), find &
 * replace (plain, whole word, case, regex with groups; in the MDX text and
 * through the ProseMirror plugin, one undo step), focus mode's current
 * block, typewriter scrolling and the autosave line.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { formatCount, graphemeCount, latinWordCount, statsSummary, textStats } from '../lib/textStats'
import { readingMinutes } from '../lib/toc'
import { buildMatcher, findAll, lineOf, matchAtOrAfter, replaceAll, replaceOne, DEFAULT_FIND_OPTIONS } from '../components/Admin/editor/findReplace'
import { findMatchesInDoc, findReplacePlugin, findState, replaceAllMatches, replaceMatch, setFindCurrent, setFindQuery } from '../components/Admin/editor/findPlugin'
import { focusBlockPlugin, topLevelRange } from '../components/Admin/editor/focusBlock'
import { centerDelta, TYPEWRITER_RATIO, TYPEWRITER_SLACK_PX } from '../components/Admin/editor/typewriter'
import { ago, autosaveStatus } from '../components/Admin/shell/autosaveStatus'
import { adminShortcutGroups } from '../components/Admin/shell/shortcuts'

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ── Counts ───────────────────────────────────────────────────────────────

test('English words, numbers and contractions count once each; markup and link targets do not count', () => {
  assert.equal(textStats('Hello world, it’s 2026.').words, 4)
  const s = textStats('See [the docs](https://example.com/a-very-long-path) and **bold** text.')
  assert.equal(s.words, 6, 'See the docs and bold text')
  assert.equal(textStats('# Title\n\n![alt text](/uploads/a.png)\n\n<Callout>Note this</Callout>').words, 3)
})

test('Chinese, Japanese and Korean count per character, mixed with Latin words', () => {
  const zh = textStats('我们在边缘设备上运行 YOLOv8 模型。')
  assert.equal(zh.cjk, 12)
  assert.equal(zh.words, 13, '12 characters + "YOLOv8"')
  assert.equal(textStats('こんにちは').cjk, 5)
  assert.equal(textStats('안녕하세요 world').words, 6)
  assert.equal(latinWordCount('边缘AI设备'), 1, 'a Latin run between CJK characters is one word')
})

test('characters are user-perceived (graphemes), with and without spaces', () => {
  assert.equal(graphemeCount('👋🏽'), 1)
  assert.equal(graphemeCount('é'), 1)
  const s = textStats('café  naïve\n\nok')
  assert.equal(s.characters, 'café naïve ok'.length)
  assert.equal(s.charactersNoSpaces, 'cafénaïveok'.length)
})

test('the reading time is the public page’s (lib/toc readingMinutes); an empty body reads 0', () => {
  const body = 'word '.repeat(900)
  assert.equal(textStats(body).readingMinutes, readingMinutes(body))
  assert.equal(textStats('').readingMinutes, 0)
  assert.equal(textStats('   \n\n').words, 0)
})

test('summary line and number format', () => {
  assert.equal(formatCount(12345), '12,345')
  assert.equal(statsSummary(textStats('One')), '1 word · 3 characters · 1 min read')
  assert.match(statsSummary(textStats('我们 ok')), /^3 words \(2 CJK\) · /)
  assert.equal(statsSummary(textStats('')), '0 words · 0 characters')
})

// ── Find & replace (text) ────────────────────────────────────────────────

test('plain search is literal and case-insensitive by default; "Match case" narrows it', () => {
  const { re } = buildMatcher('a.b', DEFAULT_FIND_OPTIONS)
  assert.deepEqual(findAll('A.B axb a.b', re), [
    { from: 0, to: 3 },
    { from: 8, to: 11 },
  ])
  const cased = buildMatcher('a.b', { ...DEFAULT_FIND_OPTIONS, caseSensitive: true }).re
  assert.deepEqual(findAll('A.B a.b', cased), [{ from: 4, to: 7 }])
})

test('"Whole word" respects Unicode letters; CJK still matches', () => {
  const ww = { ...DEFAULT_FIND_OPTIONS, wholeWord: true }
  assert.equal(findAll('cat category cat_s cat.', buildMatcher('cat', ww).re).length, 2)
  assert.equal(findAll('cafés café', buildMatcher('café', ww).re).length, 1)
  assert.equal(findAll('边缘设备和边缘计算', buildMatcher('边缘', DEFAULT_FIND_OPTIONS).re).length, 2)
})

test('regex mode: groups in the replacement, invalid patterns reported (never thrown), empty matches skipped', () => {
  const opts = { ...DEFAULT_FIND_OPTIONS, regex: true }
  const { re } = buildMatcher('(\\d{4})-(\\d{2})', opts)
  assert.deepEqual(replaceAll('From 2024-05 to 2026-10.', re, '$2/$1', opts), { text: 'From 05/2024 to 10/2026.', count: 2 })
  const bad = buildMatcher('(unclosed', opts)
  assert.equal(bad.re, null)
  assert.ok(bad.error.length > 0)
  assert.deepEqual(findAll('abc', buildMatcher('x*', opts).re), [])
  assert.deepEqual(buildMatcher('', opts), { re: null, error: '' })
})

test('replace one / all, next match after the caret, line numbers', () => {
  const opts = DEFAULT_FIND_OPTIONS
  const { re } = buildMatcher('ml', opts)
  const text = 'ML here.\nAnd ml there.'
  const matches = findAll(text, re)
  assert.equal(replaceOne(text, matches[1], re as RegExp, 'machine learning', opts), 'ML here.\nAnd machine learning there.')
  // A plain replacement is literal ("$1" stays "$1").
  assert.equal(replaceAll(text, re, '$1', opts).text, '$1 here.\nAnd $1 there.')
  assert.equal(matchAtOrAfter(matches, 5), 1)
  assert.equal(matchAtOrAfter(matches, 999), 0, 'wraps to the first')
  assert.equal(matchAtOrAfter([], 0), -1)
  assert.equal(lineOf(text, matches[1].from), 2)
})

// ── Find & replace (ProseMirror plugin) ──────────────────────────────────

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    heading: { group: 'block', content: 'inline*', toDOM: () => ['h2', 0] },
    image: { group: 'inline', inline: true, atom: true, attrs: { src: { default: '' } }, toDOM: () => ['img'] },
    text: { group: 'inline' },
  },
  marks: { strong: { toDOM: () => ['strong', 0] } },
})

const p = (...parts: Array<string | ReturnType<typeof schema.node>>) =>
  schema.node('paragraph', null, parts.map((x) => (typeof x === 'string' ? schema.text(x) : x)))

function stateOf(doc: ReturnType<typeof schema.node>) {
  return EditorState.create({ doc, plugins: [findReplacePlugin(), focusBlockPlugin()] })
}

test('matches map onto document positions, never across an inline image', () => {
  const doc = schema.node('doc', null, [
    schema.node('heading', null, [schema.text('Edge ML')]),
    p('ml ', schema.node('image', { src: '/uploads/a.png' }), 'ml'),
  ])
  const { re } = buildMatcher('ml', DEFAULT_FIND_OPTIONS)
  const matches = findMatchesInDoc(doc, re)
  assert.equal(matches.length, 3)
  for (const m of matches) assert.equal(doc.textBetween(m.from, m.to).toLowerCase(), 'ml')
  const across = buildMatcher('ml ml', DEFAULT_FIND_OPTIONS).re
  assert.equal(findMatchesInDoc(doc, across).length, 0, 'the image sits between them')
})

test('the plugin keeps matches and the current one; replace one / all are single transactions (one undo step)', () => {
  let state = stateOf(schema.node('doc', null, [p('ML and ml.'), p('More ML.')]))
  const { re } = buildMatcher('ml', DEFAULT_FIND_OPTIONS)
  state = state.apply(setFindQuery(state, re, DEFAULT_FIND_OPTIONS, 1))
  assert.equal(findState(state).matches.length, 3)
  assert.equal(findState(state).current, 1)
  state = state.apply(setFindCurrent(state, 5))
  assert.equal(findState(state).current, 2, 'wraps modulo the match count')

  const one = replaceMatch(state, 0, 'machine learning')
  assert.ok(one)
  state = state.apply(one)
  assert.equal(state.doc.textContent, 'machine learning and ml.More ML.')
  assert.equal(findState(state).matches.length, 2, 'matches follow the edit')

  const all = replaceAllMatches(state, 'AI')
  assert.ok(all)
  assert.equal(all.count, 2)
  state = state.apply(all.tr)
  assert.equal(state.doc.textContent, 'machine learning and AI.More AI.')
  assert.equal(findState(state).matches.length, 0)
  assert.equal(replaceAllMatches(state, 'x'), null)
})

test('regex replacements keep groups inside the visual editor; an empty replacement deletes', () => {
  const opts = { ...DEFAULT_FIND_OPTIONS, regex: true }
  let state = stateOf(schema.node('doc', null, [p('v1.2 and v3.4')]))
  const { re } = buildMatcher('v(\\d)\\.(\\d)', opts)
  state = state.apply(setFindQuery(state, re, opts))
  state = state.apply(replaceAllMatches(state, 'version $1-$2')!.tr)
  assert.equal(state.doc.textContent, 'version 1-2 and version 3-4')
  const del = buildMatcher(' and', DEFAULT_FIND_OPTIONS).re
  state = state.apply(setFindQuery(state, del, DEFAULT_FIND_OPTIONS))
  state = state.apply(replaceMatch(state, 0, '')!)
  assert.equal(state.doc.textContent, 'version 1-2 version 3-4')
})

// ── Focus mode, typewriter ───────────────────────────────────────────────

test('focus mode marks the top-level block that holds the caret', () => {
  const doc = schema.node('doc', null, [p('First paragraph.'), p('Second one.'), p('Third.')])
  let state = stateOf(doc)
  const secondStart = doc.child(0).nodeSize
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, secondStart + 3)))
  assert.deepEqual(topLevelRange(state), { from: secondStart, to: secondStart + doc.child(1).nodeSize })
})

test('typewriter scrolling: the caret line goes to 45 % of the view; small moves are ignored', () => {
  assert.equal(TYPEWRITER_RATIO, 0.45)
  assert.equal(centerDelta(1000, 0, 800), 1000 - 360)
  assert.equal(centerDelta(100, 0, 800), 100 - 360, 'negative: scroll up')
  assert.equal(centerDelta(360 + TYPEWRITER_SLACK_PX - 1, 0, 800), 0)
  assert.equal(centerDelta(700, 200, 400), 700 - (200 + 180))
})

test('the editor binds ⌘F only inside the editor, scrolls instantly, and keeps dimmed text AA', () => {
  const src = read('components/Admin/RichEditor.tsx')
  assert.match(src, /handleKeyDown\(_view, event\)[\s\S]*key\.toLowerCase\(\) === 'f'[\s\S]*openFindRef\.current\(\)/)
  assert.match(src, /color: 'page\.fg-subtle'/, 'focus mode dims to the AA "subtle" text colour, not by opacity')
  assert.match(src, /paddingBottom: '45vh'/)
  const tw = read('components/Admin/editor/typewriter.ts')
  assert.doesNotMatch(tw, /behavior: 'smooth'/)
})

// ── Autosave line ────────────────────────────────────────────────────────

test('the autosave line says where the words are', () => {
  const now = Date.UTC(2026, 9, 20, 12, 0, 0)
  const base = { isNew: false, mode: 'draft' as const, hasPending: false, savedLocallyAt: null, now }
  assert.equal(autosaveStatus({ ...base, state: 'dirty', savedLocallyAt: now - 5_000 }).text, 'Unsaved · autosaved on this device just now')
  assert.equal(autosaveStatus({ ...base, state: 'dirty' }).text, 'Unsaved · autosaving on this device…')
  assert.equal(autosaveStatus({ ...base, state: 'clean', savedAt: now - 180_000 }).text, 'Draft saved 3 min ago')
  assert.deepEqual(autosaveStatus({ ...base, state: 'clean', mode: 'published', hasPending: true, savedAt: now - 60_000 }), {
    text: 'Changes saved 1 min ago · not live yet',
    tone: 'pending',
  })
  assert.equal(autosaveStatus({ ...base, state: 'clean', mode: 'published' }).text, 'Published · everything here is live')
  assert.equal(autosaveStatus({ ...base, state: 'clean', isNew: true }).text, 'Not saved yet')
  assert.equal(ago(now - 2 * 3600_000, now), '2 h ago')
})

test('the shortcuts overlay lists find & replace', () => {
  const editor = adminShortcutGroups(true, 6).find((g) => g.title === 'Post & case study editor')
  assert.ok(editor?.items.some((i) => i.keys.join('') === '⌘F' && /Find/.test(i.label)))
})
