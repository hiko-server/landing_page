import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { askRowPlacement, resolveEnter, type EnterContext } from '../components/General-UI/paletteModel'

/**
 * patch-2b1: Enter in the ⌘K palette's Search acts on what the visitor sees
 * (or would see) for the text in the field — a typed title opens its page,
 * never Ask, even while the posts and projects are still loading
 * (components/General-UI/paletteModel.ts askRowPlacement / resolveEnter).
 */

type R = { id: string }
const ASK: R = { id: 'ask:question' }
const POST: R = { id: 'doc:/blog/example-post' }
const PAGE: R = { id: 'page:/cv' }
const THEME: R = { id: 'open:theme' }
const isAskRow = (row: R) => row.id === ASK.id

const enter = (ctx: Partial<EnterContext<R>> & Pick<EnterContext<R>, 'query' | 'rows'>) =>
  resolveEnter<R>({ active: null, contentLoading: false, isAskRow, ...ctx })

test('the "Ask: …" row: first for a question at once; after the results for anything else, once the content is in', () => {
  for (const q of ['What does he build?', 'Does he have patents', 'example post?', '他有专利吗', '机器学习？']) {
    assert.equal(askRowPlacement(q, true), 'first', q)
    assert.equal(askRowPlacement(q, false), 'first', q)
  }
  for (const q of ['The AI was the easy part', 'building a tiny model at the edge', 'cv', '机器学习 实习']) {
    assert.equal(askRowPlacement(q, true), 'none', `${q} (loading)`)
    assert.equal(askRowPlacement(q, false), 'last', q)
  }
})

test('Enter on a list that shows the text runs the highlighted row; on a lagging list, the first row for the text', () => {
  assert.deepEqual(enter({ query: 'example', rows: [POST, PAGE, ASK], active: 1 }), { kind: 'run', row: PAGE })
  assert.deepEqual(enter({ query: 'example', rows: [POST, PAGE, ASK], active: null }), { kind: 'run', row: POST })
  // A highlighted Ask row the visitor sees (and chose) is honoured once the content is in.
  assert.deepEqual(enter({ query: 'example', rows: [POST, PAGE, ASK], active: 2 }), { kind: 'run', row: ASK })
})

test('a typed title while the content loads: Enter waits for it, then opens the result — never Ask', () => {
  const query = 'The AI was the easy part'
  // Nothing to act on yet (no Ask row for a non-question while loading).
  assert.deepEqual(enter({ query, rows: [], contentLoading: true }), { kind: 'wait' })
  // Even if an Ask row stood alone at the top, Enter would not take it.
  assert.deepEqual(enter({ query, rows: [ASK], contentLoading: true }), { kind: 'wait' })
  assert.deepEqual(enter({ query, rows: [ASK], active: 0, contentLoading: true }), { kind: 'wait' })
  // Carried out once the content is in: the title's result.
  assert.deepEqual(enter({ query, rows: [POST, ASK], queued: true }), { kind: 'run', row: POST })
})

test('a queued Enter on text that finds nothing stays in Search; the visible "Ask: …" row is the next Enter', () => {
  const query = 'zqxw unknown thing'
  assert.deepEqual(enter({ query, rows: [ASK], queued: true }), { kind: 'none' })
  // The content failed to load: no mode switch either.
  assert.deepEqual(enter({ query, rows: [ASK], queued: true, contentLoading: false }), { kind: 'none' })
  // Seen on its own once the content is in: Enter on it asks.
  assert.deepEqual(enter({ query, rows: [ASK], active: 0 }), { kind: 'run', row: ASK })
  assert.deepEqual(enter({ query, rows: [ASK] }), { kind: 'run', row: ASK })
})

test('a question asks at once, loading or not; a command found while loading runs at once', () => {
  assert.deepEqual(enter({ query: 'What does he build?', rows: [ASK, PAGE], contentLoading: true }), { kind: 'run', row: ASK })
  assert.deepEqual(enter({ query: '他有专利吗', rows: [ASK], contentLoading: true, queued: true }), { kind: 'run', row: ASK })
  assert.deepEqual(enter({ query: 'cv', rows: [PAGE], contentLoading: true }), { kind: 'run', row: PAGE })
  assert.deepEqual(enter({ query: 'the', rows: [THEME], active: 0, contentLoading: true }), { kind: 'run', row: THEME })
})

test('nothing to act on and nothing coming: Enter does nothing', () => {
  assert.deepEqual(enter({ query: 'zqxw', rows: [] }), { kind: 'none' })
  assert.deepEqual(enter({ query: 'zqxw', rows: [], active: -1 }), { kind: 'none' })
  assert.deepEqual(enter({ query: 'zqxw', rows: [], queued: true }), { kind: 'none' })
})

test('the palette routes both Enter paths (current and lagging list) and the queued Enter through resolveEnter', () => {
  const src = readFileSync(path.join(process.cwd(), 'components/General-UI/CommandPalette.tsx'), 'utf8')
  assert.equal((src.match(/resolveEnter\(\{/g) || []).length, 2)
  assert.doesNotMatch(src, /runItem\(computeRows\(/)
  assert.doesNotMatch(src, /isExplicitQuestion\(q\)\) out\.unshift/)
  assert.match(src, /askRowPlacement\(q, !index && !indexFailed\)/)
})
