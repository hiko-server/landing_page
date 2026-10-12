import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectHidden, humanizeKey } from '../components/Admin/cvStudio/hiddenIndex'
import { countHidden } from '../lib/cvVisibility'
import type { Doc } from '../components/Admin/cvStudio/docOps'

const sample = (): Doc => ({
  en: [
    { sessionName: 'personalInformation', firstName: 'Yanpei', phoneNumber: '+852 0000 0000', hiddenFields: ['phoneNumber'] },
    {
      sessionName: 'education',
      showOnWebsite: false,
      educationExperience: [
        { schoolName: 'HKMU', degree: 'BSc', gpa: '3.6', hiddenFields: ['gpa'] },
        { schoolName: 'Old School', isVisible: false },
      ],
    },
    {
      sessionName: 'workExperience',
      experiences: [
        {
          jobTitle: 'Engineer',
          companyName: 'Co',
          features: [{ description: 'Shipped X', furtherExplanation: ['a', 'b'], hiddenItems: { furtherExplanation: [1] } }],
          relatedSkills: ['TS', 'Go'],
          hiddenItems: { relatedSkills: [0] },
        },
      ],
    },
    { sessionName: 'skill', isVisible: false, languages: [], technical: [{ name: 'Web' }], hiddenFields: ['technical'] },
  ],
  zh: [{ sessionName: 'education', educationExperience: [{ schoolName: '都会', gpa: '3.6', hiddenFields: ['gpa'] }] }],
})

test('lists every hidden section switch, entry, field, list and bullet in both languages', () => {
  const rows = collectHidden(sample())
  const brief = rows.map((r) => `${r.lang}|${r.kind}|${r.label}`)
  assert.deepEqual(brief, [
    'en|field|Phone',
    'en|section-web|Education',
    'en|field|GPA',
    'en|entry|Old School',
    'en|item|Skills #1',
    'en|item|Sub-points #2',
    'en|section-cv|Skills',
    'en|list|Skill groups',
    'zh|field|GPA',
  ])
})

test('rows carry jump paths, previews and readable trails', () => {
  const rows = collectHidden(sample())
  const gpa = rows.find((r) => r.lang === 'en' && r.label === 'GPA')!
  assert.deepEqual(gpa.targetPath, [1, 'educationExperience', 0, 'gpa'])
  assert.deepEqual(gpa.crumbs, ['Education', 'HKMU'])
  assert.equal(gpa.preview, '3.6')
  const sub = rows.find((r) => r.kind === 'item' && r.field === 'furtherExplanation')!
  assert.deepEqual(sub.nodePath, [2, 'experiences', 0, 'features', 0])
  assert.equal(sub.index, 1)
  assert.equal(sub.preview, 'b')
  assert.deepEqual(sub.crumbs, ['Experience', 'Engineer', 'Shipped X'])
  const entry = rows.find((r) => r.kind === 'entry')!
  assert.deepEqual(entry.targetPath, [1, 'educationExperience', 1])
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length)
})

test('content rows agree with countHidden (section switches are extra)', () => {
  const d = sample()
  const rows = collectHidden(d).filter((r) => r.lang === 'en' && r.kind !== 'section-cv' && r.kind !== 'section-web')
  assert.equal(rows.length, countHidden(d.en))
})

test('empty document has nothing hidden', () => {
  assert.deepEqual(collectHidden({ en: [], zh: [] }), [])
  assert.equal(humanizeKey('companyURL'), 'Company URL')
})
