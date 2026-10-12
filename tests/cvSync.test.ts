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
        { schoolName: 'HKMU', gpa: '3.0', hiddenFields: ['gpa'] },
        { schoolName: 'UOW', gpa: '3.3' },
      ],
    },
  ]
  const zh = [{ sessionName: 'education', headerName: '教育', isVisible: true, educationExperience: [{ schoolName: '香港都会大学', gpa: '3.0' }] }]
  const out = syncLanguage(en, zh)
  assert.equal(out[0].isVisible, false)
  assert.deepEqual(out[0].educationExperience[0].hiddenFields, ['gpa'])
  assert.equal(out[0].educationExperience[0].schoolName, '香港都会大学')
  assert.equal(out[0].educationExperience[1].schoolName, 'UOW')
})
