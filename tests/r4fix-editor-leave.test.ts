/**
 * "Save and leave" for the version-checked editors
 * (components/Admin/shell/useLeaveSaver.ts): when a save is already running,
 * the leave dialog's saver succeeds only if that save stored exactly the
 * edits the editor holds now.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leaveSaveResult } from '../components/Admin/shell/useLeaveSaver'

const snap = (body: string) => JSON.stringify({ fm: { title: 'T' }, body })

test('a running save that stored the current edits lets the page close', () => {
  assert.equal(leaveSaveResult(true, snap('a'), snap('a')), true)
})

test('a failed running save (409 / 422 / 401 / network) keeps the page open', () => {
  assert.equal(leaveSaveResult(false, snap('a'), snap('a')), false)
  assert.equal(leaveSaveResult(false, null, snap('a')), false)
})

test('a running save of older content keeps the page open', () => {
  assert.equal(leaveSaveResult(true, snap('a'), snap('ab')), false)
  assert.equal(leaveSaveResult(true, null, snap('a')), false)
})
