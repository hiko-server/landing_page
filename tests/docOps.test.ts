import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  listOp,
  moveSection,
  toggleEntryHidden,
  toggleFieldHidden,
  toggleItemHidden,
  translatePath,
  type Doc,
} from '../components/Admin/cvStudio/docOps'

const doc = (): Doc => ({
  en: [
    { sessionName: 'personalInformation', firstName: 'Yanpei' },
    { sessionName: 'extraSkill', points: ['Mandarin', 'English'], hiddenItems: { points: [1] } },
    { sessionName: 'education', educationExperience: [{ schoolName: 'HKMU' }, { schoolName: 'UOW' }] },
  ],
  zh: [
    { sessionName: 'education', educationExperience: [{ schoolName: '都会' }, { schoolName: '伍伦贡' }] },
    { sessionName: 'personalInformation', firstName: '彦霈' },
    { sessionName: 'extraSkill', points: ['普通话', '英语'], hiddenItems: { points: [1] } },
  ],
})

test('translatePath maps sections by name across different orders', () => {
  assert.deepEqual(translatePath(doc(), 'en', [2, 'educationExperience', 1]), [0, 'educationExperience', 1])
})

test('linked field hide reaches the other language at the same entry', () => {
  const d = toggleFieldHidden(doc(), 'en', [2, 'educationExperience', 0], 'gpa', true)
  assert.deepEqual(d.en[2].educationExperience[0].hiddenFields, ['gpa'])
  assert.deepEqual(d.zh[0].educationExperience[0].hiddenFields, ['gpa'])
  const unlinked = toggleFieldHidden(doc(), 'en', [2, 'educationExperience', 0], 'gpa', false)
  assert.equal(unlinked.zh[0].educationExperience[0].hiddenFields, undefined)
})

test('entry and bullet hide toggles', () => {
  const d = toggleEntryHidden(doc(), 'zh', [0, 'educationExperience', 1], true)
  assert.equal(d.zh[0].educationExperience[1].isVisible, false)
  assert.equal(d.en[2].educationExperience[1].isVisible, false)
  const back = toggleEntryHidden(d, 'zh', [0, 'educationExperience', 1], true)
  assert.equal('isVisible' in back.en[2].educationExperience[1], false)
  const b = toggleItemHidden(doc(), 'en', [1], 'points', 0, true)
  assert.deepEqual(b.en[1].hiddenItems.points, [0, 1])
})

test('linked insert keeps lists aligned and remaps hidden bullet indices', () => {
  const r = listOp(doc(), 'en', [1, 'points'], { type: 'insert', index: 0, item: 'Cantonese', twinItem: '' }, true)
  assert.equal(r.linkedApplied, true)
  assert.deepEqual(r.doc.en[1].points, ['Cantonese', 'Mandarin', 'English'])
  assert.deepEqual(r.doc.zh[2].points, ['', '普通话', '英语'])
  assert.deepEqual(r.doc.en[1].hiddenItems.points, [2])
  assert.deepEqual(r.doc.zh[2].hiddenItems.points, [2])
})

test('linked structural edit is skipped when the twin list differs in length', () => {
  const d = doc()
  d.zh[0].educationExperience.pop()
  const r = listOp(d, 'en', [2, 'educationExperience'], { type: 'remove', index: 0 }, true)
  assert.equal(r.linkedApplied, false)
  assert.equal(r.doc.en[2].educationExperience.length, 1)
  assert.equal(r.doc.zh[0].educationExperience.length, 1)
})

test('move and duplicate', () => {
  const m = listOp(doc(), 'en', [2, 'educationExperience'], { type: 'move', from: 0, to: 1 }, true).doc
  assert.deepEqual(m.en[2].educationExperience.map((e: any) => e.schoolName), ['UOW', 'HKMU'])
  assert.deepEqual(m.zh[0].educationExperience.map((e: any) => e.schoolName), ['伍伦贡', '都会'])
  const dup = listOp(doc(), 'en', [2, 'educationExperience'], { type: 'duplicate', index: 0 }, false).doc
  assert.equal(dup.en[2].educationExperience.length, 3)
  assert.equal(dup.zh[0].educationExperience.length, 2)
})

test('moveSection reorders the other language by name', () => {
  const d = moveSection(doc(), 'en', 2, 0, true)
  assert.deepEqual(d.en.map((s) => s.sessionName), ['education', 'personalInformation', 'extraSkill'])
  assert.deepEqual(d.zh.map((s) => s.sessionName), ['education', 'personalInformation', 'extraSkill'])
})
