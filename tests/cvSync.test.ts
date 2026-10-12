import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syncLanguage } from '../lib/cvSync'

test('sections are matched by sessionName, not position', () => {
  const en = [
    { sessionName: 'education', headerName: 'EDUCATION', items: [{ name: 'HKMU' }] },
    { sessionName: 'skill', headerName: 'SKILLS', items: [] },
  ]
  const zh = [
    { sessionName: 'skill', headerName: '技能', items: [] },
    { sessionName: 'education', headerName: '教育', items: [{ name: '香港都会大学' }] },
  ]
  const out = syncLanguage(en, zh)
  assert.deepEqual(out.map((s) => s.sessionName), ['education', 'skill'])
  assert.equal(out[0].headerName, '教育')
  assert.equal(out[0].items[0].name, '香港都会大学')
})

test('visibility metadata is copied from EN; missing ZH entries get EN text', () => {
  const en = [
    {
      sessionName: 'education',
      headerName: 'EDUCATION',
      isVisible: false,
      educationExperience: [
        { schoolName: 'HKMU', gpa: '—', hiddenFields: ['gpa'] },
        { schoolName: 'UOW', gpa: '—' },
      ],
    },
  ]
  const zh = [{ sessionName: 'education', headerName: '教育', isVisible: true, educationExperience: [{ schoolName: '香港都会大学', gpa: '—' }] }]
  const out = syncLanguage(en, zh)
  assert.equal(out[0].isVisible, false)
  assert.deepEqual(out[0].educationExperience[0].hiddenFields, ['gpa'])
  assert.equal(out[0].educationExperience[0].schoolName, '香港都会大学')
  assert.equal(out[0].educationExperience[1].schoolName, 'UOW')
})

test('hides set only on the ZH side survive a sync', () => {
  const en = [
    {
      sessionName: 'education',
      headerName: 'EDUCATION',
      educationExperience: [
        { schoolName: 'HKMU', gpa: '—', hiddenFields: ['gpa'] },
        { schoolName: 'UOW', gpa: '—' },
      ],
      points: ['a', 'b'],
    },
    { sessionName: 'certification', headerName: 'CERTS', certifications: [] },
  ]
  const zh = [
    {
      sessionName: 'education',
      headerName: '教育',
      educationExperience: [
        { schoolName: '都会', gpa: '—', hiddenFields: ['schoolName'] },
        { schoolName: '伍伦贡', gpa: '—', isVisible: false },
      ],
      points: ['甲', '乙', '丙'],
      hiddenItems: { points: [1, 2] },
    },
    { sessionName: 'certification', headerName: '证书', certifications: [], isVisible: false, showOnWebsite: false },
  ]
  const [edu, cert] = syncLanguage(en, zh)
  assert.deepEqual(edu.educationExperience[0].hiddenFields, ['gpa', 'schoolName'], 'EN hide added, ZH hide kept')
  assert.equal(edu.educationExperience[1].isVisible, false, 'ZH-only hidden entry kept')
  assert.deepEqual(edu.points, ['甲', '乙'], 'list follows EN length')
  assert.deepEqual(edu.hiddenItems, { points: [1] }, 'hidden bullet kept; index past the synced list dropped')
  assert.equal(cert.isVisible, false)
  assert.equal(cert.showOnWebsite, false)
})

test('an explicit EN switch does not override a ZH "off", and absent metadata stays absent', () => {
  const out = syncLanguage(
    [{ sessionName: 'skill', isVisible: true, showOnWebsite: true, languages: [{ language: 'TS' }] }],
    [{ sessionName: 'skill', isVisible: false, languages: [{ language: 'TS' }] }],
  )
  assert.equal(out[0].isVisible, false)
  assert.equal(out[0].showOnWebsite, true)
  assert.equal('hiddenFields' in out[0], false)
  assert.equal('hiddenItems' in out[0].languages[0], false)
})
