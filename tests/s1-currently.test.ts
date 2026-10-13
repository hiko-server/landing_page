import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CODING_LABEL,
  OWN_PROJECT_NOTE_PLACEHOLDER,
  STUDYING_LABEL,
  currentlyCodingPlaceholder,
  deriveCurrentlyCoding,
  mergeCurrentlyCoding,
} from '../lib/currentlyCoding'
import { publicSections } from '../lib/cvVisibility'

// The site's reference month (lib/clock.ts) — what the pages pass.
const NOW = '2026-10'

const work = (experiences: any[], extra: Record<string, any> = {}) => [{ sessionName: 'workExperience', experiences, ...extra }]
const education = (educationExperience: any[], extra: Record<string, any> = {}) => [{ sessionName: 'education', educationExperience, ...extra }]

test('a running role ("Present", "至今" or an end after this month) is the current job', () => {
  const cv = work([
    { companyName: 'Old', jobTitle: 'Dev', startDate: '2018-01', endDate: '2019-01' },
    { companyName: 'Now', jobTitle: 'Engineer', startDate: '2021-01', endDate: 'Present' },
  ])
  assert.deepEqual(deriveCurrentlyCoding(cv, NOW), { label: CODING_LABEL, project: 'Now', note: 'Engineer' })
  assert.equal(deriveCurrentlyCoding(work([{ companyName: 'Zh', startDate: '2021-01', endDate: '至今' }]), NOW).project, 'Zh')
  assert.equal(deriveCurrentlyCoding(work([{ companyName: 'Later', startDate: '2025-01', endDate: '2027-06' }]), NOW).project, 'Later')
  // Several running roles: the earliest-started (the main job) leads.
  const two = work([
    { companyName: 'Side gig', startDate: '2026-03', endDate: 'Present' },
    { companyName: 'Main job', startDate: '2024-05', endDate: 'Present' },
  ])
  assert.equal(deriveCurrentlyCoding(two, NOW).project, 'Main job')
})

test('an ended role is never claimed: no "most recent job" fallback, no "since YYYY" note', () => {
  // The live CV's shape: the last job ended in March 2026.
  const past = work([
    { companyName: 'WeGreen AI', jobTitle: 'CTO & Co-Founder', startDate: '2024-11', endDate: '2026-03' },
    { companyName: 'GoSmart', jobTitle: 'Intern', startDate: '2023-08', endDate: '2024-09' },
  ])
  assert.deepEqual(deriveCurrentlyCoding(past, NOW), { label: '', project: '', note: '' })
  // A role that ends this month is over as far as "currently" goes (the /now rule).
  assert.equal(deriveCurrentlyCoding(work([{ companyName: 'Ending', startDate: '2025-01', endDate: '2026-10' }]), NOW).project, '')
  // A role that has not started yet is not current either.
  assert.equal(deriveCurrentlyCoding(work([{ companyName: 'Future Inc', startDate: '2027-01', endDate: 'Present' }]), NOW).project, '')
  // An empty end date is unknown, not "present" (the CV prints no "Present" for it).
  assert.equal(deriveCurrentlyCoding(work([{ companyName: 'Open', startDate: '2021-01', endDate: '' }]), NOW).project, '')
  for (const chip of [deriveCurrentlyCoding(past, NOW), deriveCurrentlyCoding([...past, ...education([{ schoolName: 'U', startDate: '2026-09', endDate: '2028-12' }])], NOW)]) {
    assert.ok(!/since/i.test(chip.note), `no derived "since" note: ${JSON.stringify(chip)}`)
  }
})

test('with no running role, a current study is shown; nothing current hides the chip', () => {
  const cv = [
    ...work([{ companyName: 'WeGreen AI', jobTitle: 'CTO', startDate: '2024-11', endDate: '2026-03' }]),
    ...education([
      {
        schoolName: 'The Chinese University of Hong Kong',
        degree: 'MSc in Artificial Intelligence for Science',
        major: 'Artificial Intelligence for Science',
        startDate: '2026-09-07',
        endDate: '2028-12-07',
      },
      { schoolName: 'Hong Kong Metropolitan University', degree: 'BSc', startDate: '2024-09-01', endDate: '2026-06-30' },
    ]),
  ]
  assert.deepEqual(deriveCurrentlyCoding(cv, NOW), {
    label: STUDYING_LABEL,
    project: 'The Chinese University of Hong Kong',
    note: 'MSc in Artificial Intelligence for Science',
  })
  // The major is added only when the degree does not already say it.
  assert.equal(deriveCurrentlyCoding(education([{ schoolName: 'U', degree: 'MSc', major: 'Physics', startDate: '2026-09', endDate: 'Present' }]), NOW).note, 'MSc, Physics')
  // A running job outranks the study.
  const both = [...work([{ companyName: 'Acme', startDate: '2025-01', endDate: 'Present' }]), ...cv]
  assert.equal(deriveCurrentlyCoding(both, NOW).project, 'Acme')
  // Before the MSc starts (and after the BSc ended) nothing is current.
  assert.deepEqual(deriveCurrentlyCoding(cv, '2026-08'), { label: '', project: '', note: '' })
  assert.deepEqual(deriveCurrentlyCoding([], NOW), { label: '', project: '', note: '' })
  assert.deepEqual(deriveCurrentlyCoding(null, NOW), { label: '', project: '', note: '' })
})

test('a redacted end date (pruned view) is unknown, not "present"', () => {
  const pruned = publicSections(
    work([
      { companyName: 'Hidden End', startDate: '2016-01', endDate: 'Present', hiddenFields: ['endDate'] },
      { companyName: 'Last Job', startDate: '2019-01', endDate: '2020-02' },
    ]),
    'website',
  )
  assert.equal(pruned[0].experiences[0].endDate, '')
  assert.deepEqual(deriveCurrentlyCoding(pruned, NOW), { label: '', project: '', note: '' })
})

test('the full editor document gives the same answer as the pruned view', () => {
  const docs = [
    work([
      { companyName: 'Hidden End', startDate: '2016-01', endDate: 'Present', hiddenFields: ['endDate'] },
      { companyName: 'Running', jobTitle: 'Secret title', startDate: '2019-01', endDate: 'Present', hiddenFields: ['jobTitle'] },
    ]),
    education([{ schoolName: 'Uni', degree: 'MSc', startDate: '2026-09', endDate: '2028-12', hiddenFields: ['schoolName'] }]),
  ]
  for (const full of docs) assert.deepEqual(deriveCurrentlyCoding(full, NOW), deriveCurrentlyCoding(publicSections(full, 'website'), NOW))
  assert.deepEqual(deriveCurrentlyCoding(docs[0], NOW), { label: CODING_LABEL, project: 'Running', note: '' })
  assert.deepEqual(deriveCurrentlyCoding(docs[1], NOW), { label: STUDYING_LABEL, project: 'MSc', note: '' })
})

test('hidden entries, hidden names and website-hidden sections are ignored', () => {
  const running = { companyName: 'Secret', jobTitle: 'Role', startDate: '2015-01', endDate: 'Present' }
  assert.equal(deriveCurrentlyCoding(work([{ ...running, isVisible: false }]), NOW).project, '')
  // Hidden company: the job title names the role instead; never the hidden name.
  const hiddenName = deriveCurrentlyCoding(work([{ ...running, hiddenFields: ['companyName'] }]), NOW)
  assert.deepEqual(hiddenName, { label: CODING_LABEL, project: 'Role', note: '' })
  const nothingNamed = deriveCurrentlyCoding(work([{ ...running, hiddenFields: ['companyName', 'jobTitle'] }]), NOW)
  assert.deepEqual(nothingNamed, { label: '', project: '', note: '' })
  assert.deepEqual(deriveCurrentlyCoding(work([running], { showOnWebsite: false }), NOW), { label: '', project: '', note: '' })
  assert.deepEqual(deriveCurrentlyCoding(work([running], { hiddenFields: ['experiences'] }), NOW), { label: '', project: '', note: '' })
})

test('mergeCurrentlyCoding: the owner’s project carries only the owner’s lines; blanks fill from the CV chip', () => {
  const derived = { label: STUDYING_LABEL, project: 'CUHK', note: 'MSc' }
  // Owner project: the derived label / note describe something else and are not attached.
  assert.deepEqual(mergeCurrentlyCoding({ label: '', project: 'Carboy', note: '' }, derived), { label: CODING_LABEL, project: 'Carboy', note: '' })
  assert.deepEqual(mergeCurrentlyCoding({ label: 'shipping', project: ' Carboy ', note: 'v2' }, derived), { label: 'shipping', project: 'Carboy', note: 'v2' })
  // No owner project: the derived chip, owner lines replacing derived ones.
  assert.deepEqual(mergeCurrentlyCoding({ label: '', project: '', note: '' }, derived), derived)
  assert.deepEqual(mergeCurrentlyCoding({ label: 'now', project: '', note: '' }, derived), { label: 'now', project: 'CUHK', note: 'MSc' })
  assert.deepEqual(mergeCurrentlyCoding(null, derived), derived)
  // Nothing derived: never a lone derived label — only what the owner typed.
  assert.deepEqual(mergeCurrentlyCoding(null, { label: '', project: '', note: '' }), { label: '', project: '', note: '' })
  assert.deepEqual(mergeCurrentlyCoding({ label: 'open to work' }, deriveCurrentlyCoding([], NOW)), { label: 'open to work', project: '', note: '' })
})

test('COR-3: the Home editor placeholders follow the merge — a typed project never shows the CV label / note as "auto"', () => {
  const derived = { label: STUDYING_LABEL, project: 'CUHK', note: 'MSc' }
  const ph = (manual: Record<string, string> | null) => ({
    label: currentlyCodingPlaceholder('label', manual, derived),
    project: currentlyCodingPlaceholder('project', manual, derived),
    note: currentlyCodingPlaceholder('note', manual, derived),
  })
  // Blank form: every line would come from the CV chip.
  assert.deepEqual(ph(null), { label: `auto: ${STUDYING_LABEL}`, project: 'auto: CUHK', note: 'auto: MSc' })
  assert.deepEqual(ph({ label: 'now', project: '', note: '' }), { label: `auto: ${STUDYING_LABEL}`, project: 'auto: CUHK', note: 'auto: MSc' })
  // A typed project replaces the CV chip: its blank label is "currently coding", its note stays blank.
  assert.deepEqual(ph({ label: '', project: 'Carboy', note: '' }), { label: `auto: ${CODING_LABEL}`, project: 'auto: CUHK', note: OWN_PROJECT_NOTE_PLACEHOLDER })
  // Every placeholder says what mergeCurrentlyCoding really shows for a blank line.
  for (const manual of [null, { label: '', project: '', note: '' }, { label: '', project: 'Carboy', note: '' }]) {
    const shown = mergeCurrentlyCoding(manual, derived)
    const p = ph(manual)
    for (const key of ['label', 'note'] as const) {
      if (p[key]?.startsWith('auto: ')) assert.equal(p[key], `auto: ${shown[key]}`, `${key} with ${JSON.stringify(manual)}`)
      else assert.equal(shown[key], '', `${key} with ${JSON.stringify(manual)}: nothing auto-filled`)
    }
  }
  // Nothing current in the CV: no "auto" lines (generic examples instead).
  const none = { label: '', project: '', note: '' }
  for (const key of ['label', 'project', 'note'] as const) assert.equal(currentlyCodingPlaceholder(key, null, none), null)
  // A derived label without a project never fills (mergeCurrentlyCoding ignores it too).
  assert.equal(currentlyCodingPlaceholder('label', null, { label: CODING_LABEL, project: '', note: 'x' }), null)
})

test('COR-3: the Home editor previews what visitors see through the shared merge', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'components/Admin/HomeEditor.tsx'), 'utf8')
  assert.match(src, /import \{ currentlyCodingPlaceholder, mergeCurrentlyCoding \} from '\.\.\/\.\.\/lib\/currentlyCoding'/)
  assert.match(src, /mergeCurrentlyCoding\(hero\.currentlyCoding, ccAuto\)/)
  assert.match(src, /currentlyCodingPlaceholder\(key, hero\.currentlyCoding, ccAuto\)/)
  assert.match(src, /Visitors see/)
  assert.match(src, /a typed project replaces the CV chip/)
  assert.doesNotMatch(src, /earliest year/)
  assert.doesNotMatch(src, /ccAuto\[key\] \? `auto: /, 'no per-field CV placeholder that ignores the merge')
})
