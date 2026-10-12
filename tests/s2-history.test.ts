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
