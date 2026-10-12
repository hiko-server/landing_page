import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENTRY_KEY,
  alignedTwin,
  docJson,
  ensureEntryKeys,
  entryKey,
  hasContent,
  insertMany,
  listOp,
  listTwin,
  moveSection,
  previewText,
  removeSection,
  sectionMisalignments,
  setValue,
  toggleEntryHidden,
  toggleFieldHidden,
  toggleItemHidden,
  translatePath,
  twinListItem,
  twinListLength,
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

const work = (enFeatures: string[], zhFeatures: string[]): Doc => ({
  en: [{ sessionName: 'workExperience', experiences: [{ jobTitle: 'A', features: enFeatures.map((d) => ({ description: d })) }] }],
  zh: [{ sessionName: 'workExperience', experiences: [{ jobTitle: '甲', features: zhFeatures.map((d) => ({ description: d })) }] }],
})

test('translatePath maps sections by name across different orders', () => {
  assert.deepEqual(translatePath(doc(), 'en', [2, 'educationExperience', 1]), [0, 'educationExperience', 1])
})

test('linked field hide reaches the other language at the same entry', () => {
  const r = toggleFieldHidden(doc(), 'en', [2, 'educationExperience', 0], 'gpa', true)
  assert.equal(r.reached, true)
  assert.deepEqual(r.doc.en[2].educationExperience[0].hiddenFields, ['gpa'])
  assert.deepEqual(r.doc.zh[0].educationExperience[0].hiddenFields, ['gpa'])
  const unlinked = toggleFieldHidden(doc(), 'en', [2, 'educationExperience', 0], 'gpa', false)
  assert.equal(unlinked.reached, false)
  assert.equal(unlinked.doc.zh[0].educationExperience[0].hiddenFields, undefined)
})

test('entry and bullet hide toggles', () => {
  const d = toggleEntryHidden(doc(), 'zh', [0, 'educationExperience', 1], true).doc
  assert.equal(d.zh[0].educationExperience[1].isVisible, false)
  assert.equal(d.en[2].educationExperience[1].isVisible, false)
  const back = toggleEntryHidden(d, 'zh', [0, 'educationExperience', 1], true).doc
  assert.equal('isVisible' in back.en[2].educationExperience[1], false)
  const b = toggleItemHidden(doc(), 'en', [1], 'points', 0, true)
  assert.equal(b.reached, true)
  assert.deepEqual(b.doc.en[1].hiddenItems.points, [0, 1])
  assert.deepEqual(b.doc.zh[2].hiddenItems.points, [0, 1])
})

test('linked toggle stays in the current language when an enclosing list differs in length', () => {
  const d = doc()
  d.zh[0].educationExperience.pop()
  // Entry #0 exists in both, but the degree lists differ — index 0 is not a reliable twin.
  const r = toggleFieldHidden(d, 'en', [2, 'educationExperience', 0], 'gpa', true)
  assert.equal(r.reached, false)
  assert.deepEqual(r.doc.en[2].educationExperience[0].hiddenFields, ['gpa'])
  assert.equal(r.doc.zh[0].educationExperience[0].hiddenFields, undefined)
  assert.equal(alignedTwin(d, 'en', [2, 'educationExperience', 0]), null)
})

test('linked toggle checks every array segment on a nested path', () => {
  const d = work(['x', 'y'], ['x'])
  const r = toggleEntryHidden(d, 'en', [0, 'experiences', 0, 'features', 0], true)
  assert.equal(r.reached, false)
  assert.equal(r.doc.zh[0].experiences[0].features[0].isVisible, undefined)
  const aligned = work(['x', 'y'], ['x', 'y'])
  const ok = toggleEntryHidden(aligned, 'en', [0, 'experiences', 0, 'features', 1], true)
  assert.equal(ok.reached, true)
  assert.equal(ok.doc.zh[0].experiences[0].features[1].isVisible, false)
})

test('linked bullet hide requires the bullet lists to line up', () => {
  const d = doc()
  d.zh[2].points.push('粤语')
  const r = toggleItemHidden(d, 'en', [1], 'points', 0, true)
  assert.equal(r.reached, false)
  assert.deepEqual(r.doc.zh[2].hiddenItems.points, [1])
})

test('linked insert keeps lists aligned and remaps hidden bullet indices', () => {
  const r = listOp(doc(), 'en', [1, 'points'], { type: 'insert', index: 0, item: 'Cantonese', twinItem: '' }, true)
  assert.equal(r.reached, true)
  assert.deepEqual(r.doc.en[1].points, ['Cantonese', 'Mandarin', 'English'])
  assert.deepEqual(r.doc.zh[2].points, ['', '普通话', '英语'])
  assert.deepEqual(r.doc.en[1].hiddenItems.points, [2])
  assert.deepEqual(r.doc.zh[2].hiddenItems.points, [2])
})

test('linked structural edit is skipped when the twin list differs in length', () => {
  const d = doc()
  d.zh[0].educationExperience.pop()
  const r = listOp(d, 'en', [2, 'educationExperience'], { type: 'remove', index: 0 }, true)
  assert.equal(r.reached, false)
  assert.equal(r.doc.en[2].educationExperience.length, 1)
  assert.equal(r.doc.zh[0].educationExperience.length, 1)
})

test('linked structural edit is skipped when an enclosing list differs in length', () => {
  const d: Doc = {
    en: [{ sessionName: 'workExperience', experiences: [{ features: [{ description: 'a' }] }, { features: [] }] }],
    zh: [{ sessionName: 'workExperience', experiences: [{ features: [{ description: '甲' }] }] }],
  }
  assert.equal(listTwin(d, 'en', [0, 'experiences', 0, 'features']), null)
  const r = listOp(d, 'en', [0, 'experiences', 0, 'features'], { type: 'remove', index: 0 }, true)
  assert.equal(r.reached, false)
  assert.equal(r.doc.zh[0].experiences[0].features.length, 1)
})

test('twin item lookup for delete confirmation', () => {
  const d = work(['', 'kept'], ['已填写', ''])
  assert.equal(twinListItem(d, 'en', [0, 'experiences', 0, 'features'], 0) !== undefined, true)
  assert.equal(hasContent(twinListItem(d, 'en', [0, 'experiences', 0, 'features'], 0)), true)
  assert.equal(hasContent(twinListItem(d, 'en', [0, 'experiences', 0, 'features'], 1)), false)
  const mis = work(['a'], ['甲', '乙'])
  assert.equal(twinListItem(mis, 'en', [0, 'experiences', 0, 'features'], 0), undefined)
  assert.equal(twinListLength(mis, 'en', [0, 'experiences', 0, 'features']), 2)
})

test('hasContent ignores visibility metadata and blanks', () => {
  assert.equal(hasContent(''), false)
  assert.equal(hasContent('  '), false)
  assert.equal(hasContent({ description: '', furtherExplanation: [], isVisible: false, hiddenFields: ['x'] }), false)
  assert.equal(hasContent({ description: '', furtherExplanation: ['detail'] }), true)
  assert.equal(previewText({ description: '', furtherExplanation: ['  some   detail '] }), 'some detail')
})

test('move and duplicate', () => {
  const m = listOp(doc(), 'en', [2, 'educationExperience'], { type: 'move', from: 0, to: 1 }, true).doc
  assert.deepEqual(m.en[2].educationExperience.map((e: any) => e.schoolName), ['UOW', 'HKMU'])
  assert.deepEqual(m.zh[0].educationExperience.map((e: any) => e.schoolName), ['伍伦贡', '都会'])
  const dup = listOp(doc(), 'en', [2, 'educationExperience'], { type: 'duplicate', index: 0 }, false).doc
  assert.equal(dup.en[2].educationExperience.length, 3)
  assert.equal(dup.zh[0].educationExperience.length, 2)
})

test('insertMany reports whether every insert was mirrored', () => {
  const ok = insertMany(doc(), 'en', [1, 'points'], 1, ['French', 'German'], false, true)
  assert.equal(ok.reached, true)
  assert.deepEqual(ok.doc.en[1].points, ['Mandarin', 'English', 'French', 'German'])
  assert.deepEqual(ok.doc.zh[2].points, ['普通话', '英语', '', ''])
  const d = doc()
  d.zh[2].points.pop()
  const solo = insertMany(d, 'en', [1, 'points'], 1, ['French'], false, true)
  assert.equal(solo.reached, false)
  assert.deepEqual(solo.doc.zh[2].points, ['普通话'])
})

test('moveSection reorders the other language by name', () => {
  const d = moveSection(doc(), 'en', 2, 0, true)
  assert.deepEqual(d.en.map((s) => s.sessionName), ['education', 'personalInformation', 'extraSkill'])
  assert.deepEqual(d.zh.map((s) => s.sessionName), ['education', 'personalInformation', 'extraSkill'])
})

test('removeSection reports whether the other language had the section', () => {
  const d = doc()
  d.zh = d.zh.filter((s) => s.sessionName !== 'extraSkill')
  assert.equal(removeSection(d, 'en', 'extraSkill', true).reached, false)
  assert.equal(removeSection(doc(), 'en', 'extraSkill', true).reached, true)
})

test('sectionMisalignments finds the outermost differing lists', () => {
  const d = work(['a', 'b'], ['甲'])
  assert.deepEqual(sectionMisalignments(d, 'en', 'workExperience'), [{ path: ['experiences', 0, 'features'], mine: 2, theirs: 1 }])
  assert.deepEqual(sectionMisalignments(work(['a'], ['甲']), 'en', 'workExperience'), [])
})

test('entry keys are stable across edits, unique, and never serialised', () => {
  const keyed = ensureEntryKeys(doc())
  const k0 = entryKey(keyed.en[2].educationExperience[0])
  const k1 = entryKey(keyed.en[2].educationExperience[1])
  assert.ok(k0 && k1 && k0 !== k1)
  assert.equal(entryKey(keyed.en[0]) !== undefined, true)

  // Editing a field keeps the entry's key (spread copies symbol properties).
  const edited = ensureEntryKeys(setValue(keyed, 'en', [2, 'educationExperience', 0, 'gpa'], '3.6'), keyed)
  assert.equal(entryKey(edited.en[2].educationExperience[0]), k0)
  // Untouched subtrees keep their identity.
  assert.equal(edited.zh, keyed.zh)

  // Moving keeps keys attached to the entries.
  const moved = ensureEntryKeys(listOp(keyed, 'en', [2, 'educationExperience'], { type: 'move', from: 0, to: 1 }, false).doc, keyed)
  assert.deepEqual(moved.en[2].educationExperience.map(entryKey), [k1, k0])

  // A duplicate gets a fresh key; the original keeps its own.
  const dup = ensureEntryKeys(listOp(keyed, 'en', [2, 'educationExperience'], { type: 'duplicate', index: 0 }, false).doc, keyed)
  const dupKeys = dup.en[2].educationExperience.map(entryKey)
  assert.equal(dupKeys[0], k0)
  assert.equal(new Set(dupKeys).size, 3)

  // An inserted blank gets a new key without stealing a neighbour's.
  const ins = ensureEntryKeys(
    listOp(keyed, 'en', [2, 'educationExperience'], { type: 'insert', index: 0, item: { schoolName: '' } }, false).doc,
    keyed,
  )
  assert.deepEqual(ins.en[2].educationExperience.slice(1).map(entryKey), [k0, k1])
  assert.equal(new Set(ins.en[2].educationExperience.map(entryKey)).size, 3)

  // A rebuilt object at the same position inherits the key (e.g. reveal-all).
  const rebuilt = ensureEntryKeys(setValue(keyed, 'en', [2, 'educationExperience', 0], { schoolName: 'HKMU' }), keyed)
  assert.equal(entryKey(rebuilt.en[2].educationExperience[0]), k0)

  // Keys are symbols: invisible to JSON and to Object.keys.
  assert.equal(JSON.stringify(keyed), JSON.stringify(doc()))
  assert.equal(docJson(keyed), docJson(doc()))
  assert.equal(Object.keys(keyed.en[2].educationExperience[0]).includes(String(ENTRY_KEY)), false)
})
