import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveCurrentlyCoding } from '../lib/currentlyCoding'
import { publicSections } from '../lib/cvVisibility'

const work = (experiences: any[], extra: Record<string, any> = {}) => [{ sessionName: 'workExperience', experiences, ...extra }]

test('an empty or "present" end date marks the current job', () => {
  const cv = work([
    { companyName: 'Old', startDate: '2018-01', endDate: '2019-01' },
    { companyName: 'Now', startDate: '2021-01', endDate: 'Present' },
  ])
  assert.equal(deriveCurrentlyCoding(cv).project, 'Now')
  assert.equal(deriveCurrentlyCoding(work([{ companyName: 'Open', startDate: '2021-01', endDate: '' }])).project, 'Open')
  assert.equal(deriveCurrentlyCoding(work([{ companyName: 'Zh', startDate: '2021-01', endDate: '至今' }])).project, 'Zh')
})

test('a redacted end date (pruned view) is unknown, not "present"', () => {
  const pruned = publicSections(
    work([
      { companyName: 'Hidden End', startDate: '2016-01', endDate: '2017-03', hiddenFields: ['endDate'] },
      { companyName: 'Last Job', startDate: '2019-01', endDate: '2020-02' },
    ]),
    'website',
  )
  assert.equal(pruned[0].experiences[0].endDate, '')
  assert.equal(deriveCurrentlyCoding(pruned).project, 'Last Job')
})

test('the full editor document gives the same answer as the pruned view', () => {
  const full = work([
    { companyName: 'Hidden End', startDate: '2016-01', endDate: '2017-03', hiddenFields: ['endDate'] },
    { companyName: 'Last Job', startDate: '2019-01', endDate: '2020-02' },
  ])
  assert.deepEqual(deriveCurrentlyCoding(full), deriveCurrentlyCoding(publicSections(full, 'website')))
})

test('hidden entries, hidden company names and website-hidden sections are ignored', () => {
  assert.equal(
    deriveCurrentlyCoding(work([{ companyName: 'Secret', startDate: '2015-01', endDate: '', isVisible: false }])).project,
    '',
  )
  const hiddenName = deriveCurrentlyCoding(work([{ companyName: 'Secret', startDate: '2015-01', endDate: '', hiddenFields: ['companyName'] }]))
  assert.equal(hiddenName.project, '')
  assert.equal(hiddenName.note, 'since 2015')
  const offSite = deriveCurrentlyCoding(work([{ companyName: 'Secret', startDate: '2015-01', endDate: '' }], { showOnWebsite: false }))
  assert.deepEqual([offSite.project, offSite.note], ['', ''])
  const listHidden = deriveCurrentlyCoding(work([{ companyName: 'Secret', startDate: '2015-01', endDate: '' }], { hiddenFields: ['experiences'] }))
  assert.deepEqual([listHidden.project, listHidden.note], ['', ''])
})

test('"since" uses the earliest visible start date across work, projects and education', () => {
  const cv = [
    ...work([{ companyName: 'A', startDate: '2021-05', endDate: '' }]),
    { sessionName: 'project', projectExperience: [{ title: 'P', startDate: '2019-02' }, { title: 'Q', startDate: '2012-01', hiddenFields: ['startDate'] }] },
    { sessionName: 'education', educationExperience: [{ schoolName: 'U', startDate: '2017-09' }] },
  ]
  assert.equal(deriveCurrentlyCoding(cv).note, 'since 2017')
  assert.deepEqual(deriveCurrentlyCoding([]), { label: '', project: '', note: '' })
})
