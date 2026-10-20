import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  countHidden,
  publicCvDoc,
  publicSections,
  remapHiddenItems,
  revealAll,
  withFieldHidden,
  withItemHidden,
} from '../lib/cvVisibility'

const sample = () => [
  {
    sessionName: 'personalInformation',
    headerName: 'Personal',
    firstName: 'Yanpei',
    phoneNumber: '+852 0000',
    hiddenFields: ['phoneNumber'],
  },
  {
    sessionName: 'education',
    headerName: 'EDUCATION',
    educationExperience: [
      { schoolName: 'HKMU', gpa: '3.71 / 4.0', hiddenFields: ['gpa'] },
      { schoolName: 'Hidden College', gpa: '—', isVisible: false },
    ],
  },
  {
    sessionName: 'extraSkill',
    headerName: 'LANGUAGES',
    points: ['Mandarin', 'English', 'Cantonese'],
    hiddenItems: { points: [1] },
  },
  { sessionName: 'certification', headerName: 'CERTS', isVisible: false, certifications: [] },
  { sessionName: 'patents', headerName: 'PATENTS', showOnWebsite: false, patentExperience: [] },
]

test('hidden fields are blanked (type-preserving) and metadata is stripped', () => {
  const [pi, edu] = publicSections(sample(), 'any')
  assert.equal(pi.phoneNumber, '')
  assert.equal(pi.firstName, 'Yanpei')
  assert.equal('hiddenFields' in pi, false)
  assert.equal(edu.educationExperience[0].gpa, '')
  assert.equal(JSON.stringify(publicSections(sample())).includes('3.71'), false)
})

test('hidden entries and bullets are removed', () => {
  const out = publicSections(sample(), 'any')
  const edu = out.find((s) => s.sessionName === 'education')!
  assert.deepEqual(
    edu.educationExperience.map((e: any) => e.schoolName),
    ['HKMU'],
  )
  const extra = out.find((s) => s.sessionName === 'extraSkill')!
  assert.deepEqual(extra.points, ['Mandarin', 'Cantonese'])
  assert.equal('hiddenItems' in extra, false)
})

test('audiences: cv drops CV-off sections, website drops website-off sections', () => {
  const cv = publicSections(sample(), 'cv').map((s) => s.sessionName)
  const web = publicSections(sample(), 'website').map((s) => s.sessionName)
  const any = publicSections(sample(), 'any').map((s) => s.sessionName)
  assert.equal(cv.includes('certification'), false)
  assert.equal(cv.includes('patents'), true)
  assert.equal(web.includes('patents'), false)
  assert.equal(web.includes('certification'), true)
  assert.equal(any.length, 5)
})

test('section switches survive pruning for downstream renderers', () => {
  const certs = publicSections(sample(), 'any').find((s) => s.sessionName === 'certification')!
  assert.equal(certs.isVisible, false)
})

test('publicCvDoc tolerates garbage input', () => {
  assert.deepEqual(publicCvDoc({ en: 'nope' as any, zh: [null, 1, { sessionName: 'x' }] as any }), {
    en: [],
    zh: [{ sessionName: 'x' }],
  })
})

test('withFieldHidden / withItemHidden toggle and clean up empty metadata', () => {
  const node = withFieldHidden<Record<string, any>>({ a: 1 }, 'gpa', true)
  assert.deepEqual(node.hiddenFields, ['gpa'])
  assert.equal('hiddenFields' in withFieldHidden(node, 'gpa', false), false)
  const n2 = withItemHidden<Record<string, any>>({ points: ['a', 'b'] }, 'points', 1, true)
  assert.deepEqual(n2.hiddenItems, { points: [1] })
  assert.equal('hiddenItems' in withItemHidden(n2, 'points', 1, false), false)
})

test('remapHiddenItems follows moves and drops removed indices', () => {
  const node = { points: ['a', 'b', 'c'], hiddenItems: { points: [0, 2] } }
  // remove index 0 → old 1→0, old 2→1
  assert.deepEqual(remapHiddenItems(node, 'points', [-1, 0, 1]).hiddenItems, { points: [1] })
})

test('countHidden and revealAll', () => {
  const s = sample()
  assert.equal(countHidden(s[1]), 2) // gpa field + hidden entry
  const revealed = revealAll(s[3])
  assert.equal(revealed.isVisible, false, 'section CV switch is kept')
  const edu = revealAll(s[1])
  assert.equal(countHidden(edu), 0)
  assert.equal('isVisible' in edu.educationExperience[1], false)
})
