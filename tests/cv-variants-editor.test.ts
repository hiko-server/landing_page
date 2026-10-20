/**
 * E4 — the admin side, pure parts: the variants editor's model
 * (components/Admin/cvVariants/model), the audience words and toggles
 * (cvStudio/audience), the Hidden items panel's "limited" rows
 * (cvStudio/hiddenIndex), the variants API client's outcomes and the
 * dashboard's ?view=variants. Synthetic data only.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveEntry, moveSection, sectionRows, setListMode, targetStatus, toggleEntry, toggleSection, variantSummary, type Doc } from '../components/Admin/cvVariants/model'
import { audienceChip, audienceSummary, toggledAudience } from '../components/Admin/cvStudio/audience'
import { collectHidden } from '../components/Admin/cvStudio/hiddenIndex'
import { interpretVariantsSave } from '../components/Admin/cvVariants/api'
import { dashboardQuery, parseDashboardQuery } from '../components/Admin/shell/dashboardTabs'
import type { CvVariant } from '../lib/cvVariants'

const cv: Doc = {
  en: [
    { sessionName: 'personalInformation', firstName: 'Example' },
    {
      sessionName: 'workExperience',
      headerName: 'WORK',
      experiences: [
        { uid: 'a', jobTitle: 'Alpha', companyName: 'A Co' },
        { uid: 'b', jobTitle: 'Beta', companyName: 'B Co', isVisible: false },
        { uid: 'c', jobTitle: 'Gamma', companyName: 'C Co', onlyIn: ['web'] },
        { uid: 'd', jobTitle: 'Delta', companyName: 'D Co' },
      ],
    },
    { sessionName: 'certification', isVisible: false, certifications: [] },
    { sessionName: 'recommendations', onlyIn: ['web'], items: [] },
  ],
  zh: [{ sessionName: 'patents', patentExperience: [] }],
}

const base = (): CvVariant => ({ id: 'vexample01', name: 'Embedded', pageTarget: 1, sections: [{ name: 'workExperience' }], createdAt: 1, updatedAt: 1 })

test('rows: the variant’s sections first in its order, then the CV’s; what private links cannot print is unavailable with the reason', () => {
  const rows = sectionRows(cv, 'en', base())
  assert.deepEqual(rows.map((r) => r.name), ['workExperience', 'personalInformation', 'certification', 'recommendations', 'patents'])
  assert.equal(rows[0].heading, 'WORK')
  assert.equal(rows.find((r) => r.name === 'certification')!.unavailable, 'off-cv')
  assert.equal(rows.find((r) => r.name === 'recommendations')!.unavailable, 'not-private')
  assert.equal(rows.find((r) => r.name === 'patents')!.unavailable, null, 'a section only the other language has is listed too')
  const list = rows[0].lists[0]
  assert.equal(list.mode, 'all')
  assert.deepEqual(list.entries.map((e) => [e.uid, e.unavailable]), [['a', null], ['b', 'hidden'], ['c', 'not-private'], ['d', null]])
})

test('choosing entries starts from what private links may print; toggles and moves keep the visible order', () => {
  let v = base()
  const row = () => sectionRows(cv, 'en', v)[0].lists[0]
  v = setListMode(v, 'workExperience', 'experiences', 'chosen', row())
  assert.deepEqual(v.sections[0].entries, { experiences: ['a', 'd'] })
  v = toggleEntry(v, 'workExperience', 'experiences', 'a', false, row())
  assert.deepEqual(v.sections[0].entries!.experiences, ['d'])
  v = toggleEntry(v, 'workExperience', 'experiences', 'a', true, row())
  assert.deepEqual(v.sections[0].entries!.experiences, ['d', 'a'], 'added back after the chosen ones above it')
  v = moveEntry(v, 'workExperience', 'experiences', 'a', 'd', row())
  assert.deepEqual(v.sections[0].entries!.experiences, ['a', 'd'])
  assert.deepEqual(row().entries.map((e) => e.uid), ['a', 'd', 'b', 'c'], 'chosen first in the variant’s order')
  v = setListMode(v, 'workExperience', 'experiences', 'all')
  assert.deepEqual(v.sections[0], { name: 'workExperience' })
})

test('sections: added where the rows show them, removed, reordered', () => {
  let v = base()
  const order = sectionRows(cv, 'en', v).map((r) => r.name)
  v = toggleSection(v, 'personalInformation', true, ['personalInformation', ...order.filter((n) => n !== 'personalInformation')])
  assert.deepEqual(v.sections.map((s) => s.name), ['personalInformation', 'workExperience'])
  v = moveSection(v, 'personalInformation', 'workExperience')
  assert.deepEqual(v.sections.map((s) => s.name), ['workExperience', 'personalInformation'])
  v = toggleSection(v, 'workExperience', false, order)
  assert.deepEqual(v.sections.map((s) => s.name), ['personalInformation'])
  assert.equal(variantSummary(cv, 'en', base()), '1 section · 2 of 2 entries')
})

test('page target: on target, or how far over', () => {
  assert.deepEqual(targetStatus(1, 0.7, 1), { tone: 'ok', text: '1 page · on target' })
  assert.deepEqual(targetStatus(2, 0.4, 1), { tone: 'over', text: '2 pages · 0.4 pages over' })
  assert.deepEqual(targetStatus(3, 0.5, 1), { tone: 'over', text: '3 pages · 1.5 pages over' })
  assert.deepEqual(targetStatus(2, 1, null), { tone: 'none', text: '2 pages' })
})

test('audience words and toggles', () => {
  assert.equal(audienceSummary(null), 'everywhere')
  assert.equal(audienceSummary(['download', 'private']), 'Downloads + Private links')
  assert.equal(audienceChip(['download', 'private']), 'Files · Links')
  assert.deepEqual(toggledAudience(null, 'web', false), ['download', 'private'])
  assert.equal(toggledAudience(['download', 'private'], 'web', true), null)
})

test('the Hidden items panel lists audiences as “limited” rows that jump to their control', () => {
  const rows = collectHidden({
    en: [
      { sessionName: 'personalInformation', phoneNumber: '+00 0', fieldsOnlyIn: { phoneNumber: ['download'] } },
      { sessionName: 'workExperience', onlyIn: ['private'], experiences: [{ uid: 'x', jobTitle: 'Alpha', onlyIn: ['web'] }] },
    ],
    zh: [],
  })
  const limited = rows.filter((r) => r.kind === 'limited')
  assert.deepEqual(
    limited.map((r) => [r.label, r.preview, r.targetPath.join('.')]),
    [
      ['Phone', 'Only on Downloads', '0.phoneNumber'],
      ['Experience', 'Only on Private links', '1.audience'],
      ['Alpha', 'Only on Public pages', '1.experiences.0'],
    ],
  )
})

test('variants API client: what each answer means', () => {
  assert.deepEqual(interpretVariantsSave(409, null, {}), { kind: 'conflict' })
  assert.deepEqual(interpretVariantsSave(401, null, {}), { kind: 'unauthorized' })
  assert.deepEqual(interpretVariantsSave(422, null, { error: 'Two variants are called “A”.', errors: [{ path: ['variants', 1, 'name'] }] }), {
    kind: 'invalid',
    error: 'Two variants are called “A”.',
    path: ['variants', 1, 'name'],
  })
  assert.deepEqual(interpretVariantsSave(200, '"5"', { variants: [], revoked: 2 }), { kind: 'ok', variants: [], etag: '"5"', revoked: 2 })
  assert.equal(interpretVariantsSave(500, null, { error: 'boom' }).kind, 'error')
})

test('the dashboard opens CV variants at ?tab=cv&view=variants', () => {
  assert.deepEqual(parseDashboardQuery({ tab: 'cv', view: 'variants' }), { tab: 'cv', view: 'variants' })
  assert.deepEqual(parseDashboardQuery({ tab: 'home', view: 'variants' }), { tab: 'home', view: 'studio' })
  assert.deepEqual(dashboardQuery({}, 'cv', 'variants'), { tab: 'cv', view: 'variants' })
  assert.deepEqual(dashboardQuery({ tab: 'cv', view: 'variants' }, 'cv'), { tab: 'cv' })
})
