import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicSections } from '../lib/cvVisibility'
import {
  bullets,
  certificateValidity,
  entries,
  entryRange,
  entryStatus,
  field,
  graduation,
  joinParts,
  labelled,
  list,
} from '../components/CVViewerPage/fields'

/** Prune one entry the way the public CV does and return it (with its `redacted` marker). */
function pruned<T extends Record<string, any>>(entry: T, sessionName = 'certification', key = 'items'): any {
  const [section] = publicSections([{ sessionName, [key]: [entry] }], 'cv')
  return section[key][0]
}

test('field() treats hidden values as empty on pruned and editor documents', () => {
  const editor = { gpa: '3.9', hiddenFields: ['gpa'], degree: ' BSc ' }
  assert.equal(field(editor, 'gpa'), '')
  assert.equal(field(editor, 'degree'), 'BSc')
  const pub = pruned(editor, 'education', 'educationExperience')
  assert.deepEqual(pub.redacted, ['gpa'])
  assert.equal(field(pub, 'gpa'), '')
  assert.equal(field(null, 'x'), '')
  assert.equal(field({ x: 3 }, 'x'), '')
})

test('a hidden expiry never prints "No Expiry" in either language', () => {
  const editor = { issuedDate: '2024-12', expirationDate: '2027-12', hiddenFields: ['expirationDate'] }
  const pub = pruned(editor)
  for (const node of [editor, pub]) {
    assert.equal(certificateValidity(node, 'en'), 'Dec 2024')
    assert.equal(certificateValidity(node, 'zh'), '2024.12')
  }
  // Genuinely empty expiry still reads as "No Expiry".
  assert.equal(certificateValidity({ issuedDate: '2024-12', expirationDate: '' }, 'en'), 'Dec 2024 – No Expiry')
  assert.equal(certificateValidity({ issuedDate: '2024-12', expirationDate: '' }, 'zh'), '2024.12 – 长期有效')
  assert.equal(certificateValidity({ issuedDate: '2024-12', expirationDate: '2027-12' }, 'en'), 'Dec 2024 – Dec 2027')
  // Hidden issue date: no lone "No Expiry", expiry gets a label.
  assert.equal(certificateValidity({ issuedDate: '2024-12', expirationDate: '', hiddenFields: ['issuedDate'] }, 'en'), '')
  assert.equal(certificateValidity({ issuedDate: '', expirationDate: '2027-12' }, 'en'), 'Expires Dec 2027')
  assert.equal(certificateValidity({ issuedDate: '', expirationDate: '2027-12' }, 'zh'), '有效期至 2027.12')
})

test('a hidden end date never shows "Present"', () => {
  const job = { startDate: '2024-11', endDate: 'present', hiddenFields: ['endDate'] }
  const pub = pruned(job, 'workExperience', 'experiences')
  for (const node of [job, pub]) {
    assert.equal(entryRange(node, 'en'), 'Nov 2024')
    assert.equal(entryRange(node, 'zh'), '2024.11')
    assert.equal(entryRange(node, 'en', { futureEndAsPresent: true }), 'Nov 2024')
  }
  const project = { startDate: '2024-01', endDate: '2099-01', hiddenFields: ['endDate'] }
  assert.equal(entryRange(project, 'en', { futureEndAsPresent: true }), 'Jan 2024')
  // Visible future end still reads as Present for running projects.
  assert.equal(entryRange({ startDate: '2024-01', endDate: '2099-01' }, 'en', { futureEndAsPresent: true }), 'Jan 2024 – Present')
  // Hidden start: the end alone.
  assert.equal(entryRange({ startDate: '2024-01', endDate: '2025-02', hiddenFields: ['startDate'] }, 'en'), 'Feb 2025')
  assert.equal(graduation({ endDate: '2099-06', hiddenFields: ['endDate'] }, 'en'), '')
  assert.equal(graduation({ endDate: '2099-06' }, 'zh'), '预计 2099.06')
})

test('labels and separators disappear with their value', () => {
  assert.equal(labelled('GPA', '', 'en'), '')
  assert.equal(labelled('GPA', '3.9', 'en'), 'GPA: 3.9')
  assert.equal(labelled('电话', '123', 'zh'), '电话：123')
  assert.equal(joinParts(['', 'Hong Kong', undefined, null, false, '  '], ' · '), 'Hong Kong')
  assert.equal(joinParts(['A', 'B'], ' | '), 'A | B')
})

test('lists drop switched-off entries, hidden bullets and hidden fields', () => {
  assert.deepEqual(entries([{ a: 1 }, { a: 2, isVisible: false }, 'x', null] as any[]), [{ a: 1 }])
  const node = { points: ['one', ' ', 'two', 'three'], hiddenItems: { points: [2] } }
  assert.deepEqual(bullets(node, 'points'), ['one', 'three'])
  assert.deepEqual(bullets({ points: ['a'], hiddenFields: ['points'] }, 'points'), [])
  assert.deepEqual(list({ technical: [{ name: 'x' }], hiddenFields: ['technical'] }, 'technical'), [])
  assert.deepEqual(list({ technical: [{ name: 'x' }, { name: 'y', isVisible: false }] }, 'technical'), [{ name: 'x' }])
})

test('entry status: hidden or missing end is unknown, never current', () => {
  const now = new Date('2026-10-12T00:00:00Z')
  assert.equal(entryStatus({ startDate: '2024-11', endDate: 'present' }, now), 'current')
  assert.equal(entryStatus({ startDate: '2026-09-07', endDate: '2028-12-07' }, now), 'current')
  assert.equal(entryStatus({ startDate: '2027-01', endDate: '2029-01' }, now), 'upcoming')
  assert.equal(entryStatus({ startDate: '2024-11', endDate: '2026-03' }, now), 'past')
  assert.equal(entryStatus({ startDate: '2024-11', endDate: '' }, now), 'unknown')
  assert.equal(entryStatus({ startDate: '2024-11', endDate: 'present', hiddenFields: ['endDate'] }, now), 'unknown')
  assert.equal(entryStatus(pruned({ startDate: '2024-11', endDate: 'present', hiddenFields: ['endDate'] }), now), 'unknown')
})
