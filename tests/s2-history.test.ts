import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COALESCE_MS, historyApply, historyInit, historyRedo, historyUndo } from '../components/Admin/cvStudio/history'
import { entryKey, setValue, type Doc } from '../components/Admin/cvStudio/docOps'

const base = (): Doc => ({ en: [{ sessionName: 'education', educationExperience: [{ schoolName: 'HKMU' }] }], zh: [] })

test('init keys every entry', () => {
  const h = historyInit(base())
  assert.ok(entryKey(h.present.en[0]))
  assert.ok(entryKey(h.present.en[0].educationExperience[0]))
})

test('typing in one field coalesces into a single undo step', () => {
  let h = historyInit(base())
  const at = 1000
  h = historyApply(h, (d) => setValue(d, 'en', [0, 'headerName'], 'E'), 'en:0.headerName', at)
  h = historyApply(h, (d) => setValue(d, 'en', [0, 'headerName'], 'ED'), 'en:0.headerName', at + 100)
  assert.equal(h.past.length, 1)
  h = historyApply(h, (d) => setValue(d, 'en', [0, 'headerName'], 'EDU'), 'en:0.headerName', at + 100 + COALESCE_MS + 1)
  assert.equal(h.past.length, 2)
})

test('no-op edits do not create history', () => {
  const h = historyInit(base())
  assert.equal(historyApply(h, (d) => d, undefined, 1), h)
})

test('undo / redo restore the exact document objects', () => {
  let h = historyInit(base())
  const before = h.present
  h = historyApply(h, (d) => setValue(d, 'en', [0, 'headerName'], 'X'), undefined, 1)
  const after = h.present
  h = historyUndo(h)
  assert.equal(h.present, before)
  h = historyRedo(h)
  // Identity is what lets a toast's Undo know it still refers to the latest step.
  assert.equal(h.present, after)
})

import { MDX_SNAPSHOT_RE, parseSnapshotName } from '../lib/mdx-admin'
import { collapseContext, diffLines, documentText, DIFF_MAX_LINES } from '../components/Admin/shell/textDiff'

test('MDX snapshot names parse right-anchored, so slugs may contain "_"', () => {
  const m = MDX_SNAPSHOT_RE.exec('a_b_2026-10-13_08-05-09-123.mdx')
  assert.ok(m)
  assert.equal(m[1], 'a_b')
  assert.deepEqual(parseSnapshotName('a_b_2026-10-13_08-05-09-123.mdx'), {
    filename: 'a_b_2026-10-13_08-05-09-123.mdx',
    slug: 'a_b',
    date: '2026-10-13T08:05:09.123Z',
  })
  assert.equal(parseSnapshotName('../a_2026-10-13_08-05-09-123.mdx'), null)
  assert.equal(parseSnapshotName('a_2026-10-13_08-05-09-123.json'), null)
  assert.equal(parseSnapshotName('Bad_2026-10-13_08-05-09-123.mdx'), null)
  assert.equal(parseSnapshotName(42), null)
})

test('textDiff: insertions, deletions and unchanged context', () => {
  const d = diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne')
  assert.equal(d.tooLarge, false)
  if (d.tooLarge) return
  assert.deepEqual(
    d.lines.map((l) => `${l.kind === 'same' ? ' ' : l.kind === 'add' ? '+' : '-'}${l.text}`),
    [' a', '-b', '+B', ' c', ' d', '+e'],
  )
  assert.equal(d.added, 2)
  assert.equal(d.removed, 1)
  const del = diffLines('x\ny\nz', 'x\nz')
  assert.ok(!del.tooLarge && del.removed === 1 && del.added === 0)
  const same = diffLines('same\n', 'same')
  assert.ok(!same.tooLarge && same.added === 0 && same.removed === 0)
})

test('textDiff refuses inputs over the line cap', () => {
  const big = Array.from({ length: DIFF_MAX_LINES + 1 }, (_, i) => `line ${i}`).join('\n')
  assert.deepEqual(diffLines(big, 'x'), { tooLarge: true })
  assert.deepEqual(diffLines('x', big), { tooLarge: true })
})

test('collapseContext keeps changed lines with context and counts the rest', () => {
  const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
  const after = before.replace('l10', 'L10')
  const d = diffLines(before, after)
  assert.ok(!d.tooLarge)
  if (d.tooLarge) return
  const rows = collapseContext(d.lines, 2)
  assert.deepEqual(rows[0], { type: 'skip', count: 8 })
  assert.equal(rows.filter((r) => r.type === 'line').length, 6)
  assert.deepEqual(rows[rows.length - 1], { type: 'skip', count: 7 })
})

test('documentText: known fields first, empty values omitted, body after ---', () => {
  assert.equal(
    documentText({ tags: ['a', 'b'], zeta: 1, title: 'T', draft: false, description: '', cover: undefined }, 'Body\n\n'),
    'title: T\ntags: ["a","b"]\nzeta: 1\n---\nBody',
  )
})
