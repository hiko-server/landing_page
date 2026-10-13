import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicSections } from '../lib/cvVisibility'
import { currentRoles, currentlyCodingSignal, hasSignals, latestPost, latestWork, namesCurrentRole, signalsUpdatedOn } from '../lib/nowSignals'
import { deriveCurrentlyCoding, mergeCurrentlyCoding } from '../lib/currentlyCoding'
import { buildStack, shortVersion } from '../lib/stack'

// More stack coverage (installed versions): tests/r6-ops-stack.test.ts

const NOW = new Date('2026-10-12T00:00:00Z')

const cv = publicSections(
  [
    {
      sessionName: 'workExperience',
      experiences: [
        { jobTitle: 'Engineer', companyName: 'Acme', location: 'Hong Kong', startDate: '2025-01', endDate: 'present' },
        { jobTitle: 'Founder', companyName: 'Old Co', startDate: '2022-01', endDate: '2024-01' },
        { jobTitle: 'Secret', companyName: 'Hidden End', startDate: '2023-01', endDate: 'present', hiddenFields: ['endDate'] },
        { jobTitle: 'Off', companyName: 'Switched Off', startDate: '2025-01', endDate: 'present', isVisible: false },
        { jobTitle: 'Next role', companyName: 'Future Inc', startDate: '2099-01', endDate: '2100-01' },
      ],
    },
    {
      sessionName: 'education',
      educationExperience: [
        { degree: 'MSc in AI', major: 'AI', schoolName: 'Uni', schoolLocation: 'HK', startDate: '2026-09-07', endDate: '2099-12-07' },
        { degree: 'BSc', schoolName: 'College', startDate: '2020-09', endDate: '2024-06' },
      ],
    },
  ],
  'website',
)

test('currentRoles lists only running or upcoming entries, respecting visibility', () => {
  const roles = currentRoles(cv, NOW)
  assert.deepEqual(
    roles.map((r) => [r.kind, r.status, r.title, r.org]),
    [
      ['work', 'current', 'Engineer', 'Acme'],
      ['study', 'current', 'MSc in AI', 'Uni'],
      ['work', 'upcoming', 'Next role', 'Future Inc'],
    ],
  )
  assert.equal(roles[0].when, 'Jan 2025 – Present')
  assert.equal(roles[0].location, 'Hong Kong')
  assert.equal(roles[1].when, 'Sep 2026 – Expected Dec 2099')
  assert.equal(roles[2].when, 'Starts Jan 2099')
  assert.deepEqual(currentRoles([], NOW), [])
  assert.deepEqual(currentRoles(null, NOW), [])
})

test('currently-coding on /now is the home chip: owner text wins, the CV only names what is current', () => {
  const roles = currentRoles(cv, NOW)
  // Derived from the CV: Acme is running (the home chip names it, through the shared merge)…
  const homeChip = mergeCurrentlyCoding(null, deriveCurrentlyCoding(cv, NOW))
  assert.deepEqual(homeChip, { label: 'currently coding', project: 'Acme', note: 'Engineer' })
  assert.equal(roles.find((r) => r.status === 'current')?.org, homeChip.project)
  // …but on /now the "Currently" list already shows Acme, so the CV-derived chip is not repeated (COR-5).
  assert.equal(currentlyCodingSignal(cv, null, NOW), null)
  assert.equal(currentlyCodingSignal(cv, { label: 'busy with', project: '', note: '' }, NOW), null, 'owner lines without a project still name the CV entry')
  // An owner project takes only the owner's lines (no derived note attached) and is always kept.
  const manual = currentlyCodingSignal(cv, { label: 'shipping', project: 'Carboy', note: '' }, NOW)
  assert.deepEqual(manual, { label: 'shipping', project: 'Carboy', note: '' })
  assert.deepEqual(currentlyCodingSignal(cv, { label: '', project: 'acme', note: '' }, NOW), { label: 'currently coding', project: 'acme', note: '' }, 'typed by the owner: kept even when it matches a role')
  // Only past jobs, but a current study → the home chip names the study; /now lists it under "Currently" only.
  const studying = publicSections(
    [
      { sessionName: 'workExperience', experiences: [{ jobTitle: 'CTO', companyName: 'Past Co', startDate: '2024-01', endDate: '2026-03' }] },
      { sessionName: 'education', educationExperience: [{ degree: 'MSc in AI', schoolName: 'Uni', startDate: '2026-09-07', endDate: '2028-12-07' }] },
    ],
    'website',
  )
  assert.deepEqual(mergeCurrentlyCoding(null, deriveCurrentlyCoding(studying, NOW)), { label: 'currently studying', project: 'Uni', note: 'MSc in AI' })
  assert.deepEqual(
    currentRoles(studying, NOW).map((r) => [r.kind, r.status, r.org]),
    [['study', 'current', 'Uni']],
  )
  assert.equal(currentlyCodingSignal(studying, null, NOW), null)
  // An entry named only by its title (no organisation) is matched on the title.
  const titleOnly = publicSections([{ sessionName: 'workExperience', experiences: [{ jobTitle: 'Freelance developer', startDate: '2025-01', endDate: 'Present' }] }], 'website')
  assert.equal(deriveCurrentlyCoding(titleOnly, NOW).project, 'Freelance developer')
  assert.equal(currentlyCodingSignal(titleOnly, null, NOW), null)
  // Only past jobs → nothing is claimed as current.
  const past = publicSections(
    [{ sessionName: 'workExperience', experiences: [{ jobTitle: 'CTO', companyName: 'Past Co', startDate: '2024-01', endDate: '2026-03' }] }],
    'website',
  )
  assert.equal(currentlyCodingSignal(past, { label: '', project: '', note: '' }, NOW), null)
  assert.equal(currentlyCodingSignal(past, { label: 'open to work', project: '', note: '' }, NOW), null)
  assert.equal(currentlyCodingSignal([], null, NOW), null)
  // The reference month decides: before the MSc starts there is nothing current.
  assert.equal(currentlyCodingSignal(studying, null, '2026-08'), null)
})

test('namesCurrentRole matches a current entry by organisation or title, case-insensitively; upcoming entries do not count', () => {
  const roles = currentRoles(cv, NOW)
  assert.equal(namesCurrentRole('Acme', roles), true)
  assert.equal(namesCurrentRole(' acme ', roles), true)
  assert.equal(namesCurrentRole('Engineer', roles), true)
  assert.equal(namesCurrentRole('Uni', roles), true)
  assert.equal(namesCurrentRole('Future Inc', roles), false, 'upcoming')
  assert.equal(namesCurrentRole('Carboy', roles), false)
  assert.equal(namesCurrentRole('', roles), false)
})

test('latest post / case study pick the first titled entry and carry their dates', () => {
  const post = latestPost([
    { permalink: '/blog/a', frontmatter: { title: 'A', date: '2026-05-30', description: 'd' } },
    { permalink: '/blog/b', frontmatter: { title: 'B', date: '2026-01-01' } },
  ])
  assert.deepEqual(post, { title: 'A', href: '/blog/a', description: 'd', date: 'May 30, 2026', dateTime: '2026-05-30' })
  const work = latestWork([{ permalink: '/work/w', frontmatter: { title: 'W', period: '2025 – 2026' } }])
  assert.deepEqual(work, { title: 'W', href: '/work/w', description: '', date: '2025 – 2026', dateTime: '' })
  assert.equal(latestPost([]), null)
  assert.equal(latestWork(undefined), null)
  assert.equal(hasSignals({ roles: [], coding: null, post: null, work: null }), false)
  assert.equal(hasSignals({ roles: [], coding: null, post, work: null }), true)
})

test('stack is curated from package.json with major.minor versions', () => {
  assert.equal(shortVersion('^14.2.3'), '14.2')
  assert.equal(shortVersion('latest'), undefined)
  const stack = buildStack(
    {
      dependencies: { next: '^14.2.3', react: '18.3.1', '@aws-sdk/client-s3': '^3.600.0', 'left-pad': '1.0.0' },
      devDependencies: { typescript: '~5.4.5' },
    },
    '22.23.3',
    { installed: { next: '14.2.35', typescript: '5.4.5' } },
  )
  assert.deepEqual(stack.groups[0], {
    label: 'Framework',
    hint: 'Rendering and language',
    items: [
      { name: 'Next.js', version: '14.2' },
      { name: 'React', version: '18.3' },
      { name: 'TypeScript', version: '5.4' },
    ],
  })
  const data = stack.groups.find((g) => g.label === 'Data')
  assert.deepEqual(data?.items, [{ name: 'Cloudflare R2' }])
  assert.equal(stack.groups.at(-1)?.label, 'Infrastructure')
  assert.deepEqual(stack.groups.at(-1)?.items[1], { name: 'Node.js', version: '22.23' })
  assert.ok(!stack.packages.includes('left-pad'))
  // JSON-serialisable for getStaticProps: no undefined values anywhere.
  assert.equal(JSON.stringify(stack).includes('undefined'), false)
  assert.ok(stack.groups.every((g) => g.items.every((i) => Object.values(i).every((v) => v !== undefined))))
})

test('/now "Updated" day is the newest source stamp, in the site time zone', () => {
  // 2026-10-12 17:30 UTC is already 13 Oct in Hong Kong.
  const late = Date.UTC(2026, 9, 12, 17, 30)
  const earlier = Date.UTC(2026, 8, 1, 3, 0)
  assert.equal(signalsUpdatedOn([earlier, late, null, undefined]), '2026-10-13')
  assert.equal(signalsUpdatedOn([earlier, late], 'UTC'), '2026-10-12')
  assert.equal(signalsUpdatedOn([null, undefined, Number.NaN]), '')
  assert.equal(signalsUpdatedOn([]), '')
})

test('the content pipeline is listed truthfully (server-side MDX, not next-mdx-remote)', () => {
  const stack = buildStack(
    { dependencies: { 'next-mdx-remote': '^6.0.0', 'remark-mdx': '3.1.1', 'remark-gfm': '4.0.1', sharp: '0.35.5', shiki: '^4.1.0' } },
    '22.23.3',
    { installed: { shiki: '4.1.2' } },
  )
  const content = stack.groups.find((g) => g.label === 'Content')
  assert.deepEqual(content?.items, [
    { name: 'MDX', version: '3.1' },
    { name: 'GFM', version: '4.0' },
    { name: 'Shiki', version: '4.1' },
    { name: 'sharp', version: '0.35' },
  ])
  // A package that is not a dependency is never listed.
  assert.ok(!buildStack({ dependencies: { next: '15.5.27' } }, '22.0.0').packages.includes('MDX'))
})
