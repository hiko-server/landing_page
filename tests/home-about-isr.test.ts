/**
 * Stream home-about-isr (A1, A2, A4, G1, FIX-22): the pure parts and the API
 * contracts.
 *
 *   A1  section order (backward-compatible), highlights (write rules, public
 *       view, CV suggestions), the Home editor form model
 *   A2  the compact calendar / path drawing, the language stack, the trimmed
 *       GitHub page props
 *   A4  the "about" page name end to end (admin page API, versions, search
 *       index, page-derived), the /about nav helpers
 *   G1  revalidation windows and the paths every write regenerates
 *   FIX-22  the nonce's Cache-Control, the challenge refresh after a restore
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'

import {
  DEFAULT_SECTION_ORDER,
  RECRUITER_SECTION_ORDER,
  isHighlightHref,
  isSameOrder,
  normalizeHomeWrite,
  publicHome,
  resolveSectionOrder,
  visibleHighlights,
  type HomeData,
} from '../lib/homeShape'
import * as homeSections from '../lib/homeSections'
import { cvHref, splitLeadingNumber, suggestHighlights, fitsHighlightLimits, isExternalHighlight } from '../lib/highlights'
import { formFromHome, hasHighlight, parseSuggestions, serializeHome, validateHomeForm } from '../components/Admin/home/homeForm'
import {
  buildCalendar,
  calendarHighlights,
  calendarPaths,
  compactCalendar,
  expandCalendar,
  formatMonth,
  githubPageData,
  languageStack,
  languageStackProp,
  repoCard,
  type GithubSummary,
} from '../components/Common/githubEvents'
import { BUILD_REVALIDATE_SECONDS, PROFILE_REVALIDATE_SECONDS, isBuildPhase, revalidateAfter } from '../lib/isr'
import { COLLECTION_EXTRA_PATHS, CV_PAGE_PATHS, HOME_PAGE_PATHS, STATIC_CONTENT_PATHS, derivedPurgePaths } from '../lib/revalidate'
import { RESTORE_REFRESH_AFTER_MS, shouldRefreshChallengeOnRestore } from '../components/Common/contactForm'
import { aboutHeading, aboutNavEntries, cvSectionHasEntries, navLabel } from '../components/About/aboutNav'

const root = path.resolve(import.meta.dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const home = (over: Partial<HomeData> = {}): HomeData =>
  ({ hero: { welcome: '', brand: 'B', tagline: 't', avatarUrl: '' }, socials: {}, brands: [], quickAccess: [], ...over }) as HomeData

// ── A1: section order ──────────────────────────────────────────────────────

test('A1: a stored order is completed backward-compatibly (unknown and repeated keys dropped, missing ones at their default place)', () => {
  assert.deepEqual(resolveSectionOrder(undefined), [...DEFAULT_SECTION_ORDER], 'no order → the built-in one')
  assert.deepEqual(resolveSectionOrder('nope'), [...DEFAULT_SECTION_ORDER])
  // An older document that knew only a few sections, plus junk.
  const out = resolveSectionOrder(['experience', 'projects', 'gone', 'projects', 'introduction', 42])
  assert.deepEqual(new Set(out), new Set(DEFAULT_SECTION_ORDER), 'every section exactly once')
  assert.equal(out.length, DEFAULT_SECTION_ORDER.length)
  assert.ok(out.indexOf('experience') < out.indexOf('projects'), 'the owner’s relative order wins')
  // 'writing' follows 'projects' by default, so it is inserted right after it.
  assert.equal(out[out.indexOf('projects') + 1], 'writing')
  // 'open-source' has no default predecessor: it goes first.
  assert.equal(out[0], 'open-source')
  assert.ok(!out.includes('introduction' as never), 'the fixed sections are not sortable')
})

test('A1: the Recruiter-first preset puts projects and experience first and keeps every section', () => {
  assert.deepEqual(RECRUITER_SECTION_ORDER.slice(0, 2), ['projects', 'experience'])
  assert.deepEqual(new Set(RECRUITER_SECTION_ORDER), new Set(DEFAULT_SECTION_ORDER))
  assert.equal(isSameOrder(resolveSectionOrder([...RECRUITER_SECTION_ORDER]), RECRUITER_SECTION_ORDER), true)
  assert.equal(isSameOrder(DEFAULT_SECTION_ORDER, RECRUITER_SECTION_ORDER), false)
})

test('A1: normalizeHomeWrite stores a complete order and rejects a malformed one', () => {
  const contactFirst = ['contact', ...DEFAULT_SECTION_ORDER.filter((k) => k !== 'contact')]
  const ok = normalizeHomeWrite(home({ sectionOrder: [...contactFirst, 'bogus'] as never }))
  assert.equal(ok.ok, true)
  if (ok.ok) assert.deepEqual(ok.home.sectionOrder, contactFirst, 'the owner’s full order is kept, junk dropped')
  const partial = normalizeHomeWrite(home({ sectionOrder: ['contact'] }))
  assert.equal(partial.ok && partial.home.sectionOrder?.length, DEFAULT_SECTION_ORDER.length, 'completed')
  const bad = normalizeHomeWrite(home({ sectionOrder: 'projects' as never }))
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.deepEqual(bad.errors.map((e) => e.path), ['sectionOrder'])
  const none = normalizeHomeWrite(home())
  assert.equal(none.ok && 'sectionOrder' in none.home, false, 'no order stays no order')
})

// ── A1: highlights ─────────────────────────────────────────────────────────

test('A1: a highlight links to a site path or an https URL, never elsewhere', () => {
  for (const good of ['/cv#cv-competitionAwards-0', '/work/swcs', 'https://ieeextreme.org/results']) assert.equal(isHighlightHref(good), true, good)
  for (const bad of ['//evil.example', '/\\evil', 'javascript:alert(1)', 'http://x.example', 'cv#x', '', ' ', '/a b', `/${'x'.repeat(400)}`]) {
    assert.equal(isHighlightHref(bad), false, bad)
  }
})

test('A1: highlights are validated on write: blank tiles dropped, every field required, at most four', () => {
  const r = normalizeHomeWrite(
    home({
      highlights: [
        { value: ' 18th worldwide ', label: ' IEEEXtreme 19.0 ', href: ' /cv#cv-competitionAwards-0 ' },
        { value: '', label: '', href: '' },
      ],
    }),
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.home.highlights, [{ value: '18th worldwide', label: 'IEEEXtreme 19.0', href: '/cv#cv-competitionAwards-0' }])

  const missing = normalizeHomeWrite(home({ highlights: [{ value: 'x', label: '', href: 'ftp://x' }] }))
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.deepEqual(missing.errors.map((e) => e.path).sort(), ['highlights.0.href', 'highlights.0.label'])

  const long = normalizeHomeWrite(home({ highlights: [{ value: 'v'.repeat(61), label: 'l', href: '/cv' }] }))
  assert.equal(long.ok, false)
  const five = Array.from({ length: 5 }, (_, i) => ({ value: `${i}`, label: 'l', href: '/cv' }))
  assert.equal(normalizeHomeWrite(home({ highlights: five })).ok, false)
  const cleared = normalizeHomeWrite(home({ highlights: [] }))
  assert.equal(cleared.ok && 'highlights' in cleared.home, false, 'an empty list is not stored')
})

test('A1: the public view shows only complete highlights, none when the strip is switched off; the contact copy survives a hidden contact band', () => {
  const doc = home({
    highlights: [
      { value: 'A', label: 'a', href: '/cv' },
      { value: 'B', label: '', href: '/cv' },
      { value: 'C', label: 'c', href: 'javascript:x' },
    ],
    contact: { heading: 'Mine', blurb: 'Write any time.' },
    sections: { contact: false },
  })
  assert.deepEqual(publicHome(doc)?.highlights, [{ value: 'A', label: 'a', href: '/cv' }])
  assert.deepEqual(publicHome({ ...doc, sections: { highlights: false } })?.highlights, [])
  assert.deepEqual(publicHome(doc)?.contact, { heading: 'Mine', blurb: 'Write any time.' }, '/contact keeps its copy')
  assert.equal('highlights' in (publicHome(home()) as object), false)
  // A document without a contact block stays serialisable as getStaticProps props (no `contact: undefined`).
  const bare = { ...home() } as Record<string, unknown>
  delete bare.contact
  const view = publicHome(bare as never) as object
  assert.equal('contact' in view, false)
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(view)))
  assert.equal(Object.values(view).includes(undefined), false, 'no undefined top-level value')
  assert.equal(visibleHighlights(Array.from({ length: 6 }, () => ({ value: 'v', label: 'l', href: '/x' }))).length, 4)
})

test('A1: the home page imports the read side only (lib/homeSections), re-exported by lib/homeShape', () => {
  assert.equal(homeSections.resolveSectionOrder, resolveSectionOrder)
  assert.equal(homeSections.visibleHighlights, visibleHighlights)
  for (const f of ['components/LandingPage/Content.tsx', 'components/LandingPage/LandingContent.tsx', 'lib/highlights.ts']) {
    assert.doesNotMatch(read(f), /import \{[^}]*\} from '(\.\.\/)+lib\/homeShape'|import \{[^}]*\} from '\.\/homeShape'/, `${f}: no runtime import of lib/homeShape`)
  }
})

const cvEn = [
  {
    sessionName: 'competitionAwards',
    headerName: 'COMPETITIONS',
    awards: [
      { contestName: 'IEEE Xtreme 19.0 – Global Programming Competition', award: '18th Worldwide / 1st in Hong Kong', organization: 'IEEE' },
      { contestName: 'Hidden Cup', award: 'Gold', isVisible: false },
      { contestName: 'Open Cup', award: '', organization: 'Org', date: '2024-05' },
    ],
  },
  { sessionName: 'patents', headerName: 'Patents', patentExperience: [{ title: 'Co-Inventor, 8 Patent Applications', organization: 'Chenxin', authority: 'CNIPA', status: 'Under Examination' }] },
  {
    sessionName: 'education',
    educationExperience: [{ degree: 'MSc in AI for Science', schoolName: 'CUHK', redacted: ['schoolName'] }, { degree: 'BSc Computer Engineering', schoolName: 'HKMU' }],
  },
]

test('A1: suggestions are verbatim CV strings linked to their /cv entries; hidden entries and fields are never suggested', () => {
  const s = suggestHighlights(cvEn)
  assert.deepEqual(s[0], {
    value: '18th Worldwide / 1st in Hong Kong',
    label: 'IEEE Xtreme 19.0 – Global Programming Competition',
    href: '/cv#cv-competitionAwards-0',
    source: 'CV · Competitions',
  })
  assert.ok(!s.some((x) => x.value === 'Gold'), 'a switched-off entry is not offered')
  // The visible-entry index is the anchor index /cv renders (the hidden one is skipped).
  assert.deepEqual(s[1], { value: 'Open Cup', label: 'Org · 2024-05', href: '/cv#cv-competitionAwards-1', source: 'CV · Competitions' })
  assert.deepEqual(s[2], { value: 'Co-Inventor, 8 Patent Applications', label: 'Chenxin · CNIPA · Under Examination', href: '/cv#cv-patents-0', source: 'CV · Patents' })
  assert.ok(!s.some((x) => x.value === 'MSc in AI for Science'), 'a degree whose school is hidden has no label: not offered')
  assert.deepEqual(s.at(-1), { value: 'BSc Computer Engineering', label: 'HKMU', href: '/cv#cv-education-1', source: 'CV · Education' })
  assert.equal(cvHref('patents', 2), '/cv#cv-patents-2')
  const toAbout = suggestHighlights(cvEn, { hrefFor: (section, i) => `/about#about-${section}-${i}`, max: 1 })
  assert.deepEqual(toAbout.map((x) => x.href), ['/about#about-competitionAwards-0'])
  assert.deepEqual(suggestHighlights(null), [])
  assert.equal(fitsHighlightLimits({ value: 'x'.repeat(61), label: 'l' }), false)
})

test('A1: only a whole number (with a suffix) rolls up; other headlines stay text', () => {
  assert.deepEqual(splitLeadingNumber('18th'), { number: 18, suffix: 'th' })
  assert.deepEqual(splitLeadingNumber('1,641'), { number: 1641, suffix: '' })
  assert.deepEqual(splitLeadingNumber('8 patents'), { number: 8, suffix: ' patents' })
  for (const text of ['18th Worldwide / 1st in Hong Kong', '93.6%', 'Top 1', 'MSc', '']) assert.equal(splitLeadingNumber(text), null, text)
  assert.equal(isExternalHighlight('https://x.example'), true)
  assert.equal(isExternalHighlight('/cv#x'), false)
})

test('A1: the editor form keeps the built-in order out of the document until the owner changes it', () => {
  const plain = formFromHome(home())
  assert.deepEqual(plain.sectionOrder, [...DEFAULT_SECTION_ORDER])
  assert.equal('sectionOrder' in serializeHome(plain), false, 'opening and saving does not pin today’s order')
  const recruiter = { ...plain, sectionOrder: [...RECRUITER_SECTION_ORDER] }
  assert.deepEqual(serializeHome(recruiter).sectionOrder, [...RECRUITER_SECTION_ORDER])
  // A stored order (even the default) round-trips.
  const stored = formFromHome(home({ sectionOrder: [...DEFAULT_SECTION_ORDER] }))
  assert.deepEqual(serializeHome(stored).sectionOrder, [...DEFAULT_SECTION_ORDER])

  const withTiles = formFromHome(home({ highlights: [{ value: 'A', label: 'a', href: '/cv' }] }))
  assert.ok(withTiles.highlights[0]._id)
  withTiles.highlights.push({ _id: 'blank', value: ' ', label: '', href: '' })
  assert.deepEqual(serializeHome(withTiles).highlights, [{ value: 'A', label: 'a', href: '/cv' }], 'ids stripped, blank tiles dropped')
  withTiles.highlights.push({ _id: 'bad', value: 'B', label: 'b', href: 'cv' })
  assert.ok(validateHomeForm(withTiles).some((e) => e.path.endsWith('.href')), 'the editor reports a bad link before saving')

  // A draft saved by an older editor (no sectionOrder / highlights) still serialises.
  const legacy = { ...plain } as Partial<typeof plain>
  delete legacy.sectionOrder
  delete legacy.highlights
  assert.equal('highlights' in serializeHome(legacy as typeof plain), false)

  assert.deepEqual(parseSuggestions([{ value: 'v', label: 'l', href: '/cv', source: 's' }, { value: '', label: 'x', href: '/' }, null]), [
    { value: 'v', label: 'l', href: '/cv', source: 's' },
  ])
  assert.equal(hasHighlight([{ value: 'A ', label: 'a' }], { value: 'a', label: 'A' }), true)
  assert.equal(hasHighlight([], { value: 'a', label: 'b' }), false)
})

// ── A2: the Open Source band ───────────────────────────────────────────────

const days = (start: string, counts: number[]) =>
  counts.map((count, i) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), count }))

test('A2: the compact calendar round-trips to the same weeks and levels', () => {
  const counts = Array.from({ length: 371 }, (_, i) => (i * 7) % 11 === 0 ? 0 : (i * 13) % 9)
  const cal = buildCalendar(days('2025-10-05', counts), 1234)
  const compact = compactCalendar(cal)
  assert.ok(compact)
  assert.equal(compact.total, 1234)
  assert.equal(compact.start, cal.weeks[0].days[0].date)
  assert.deepEqual(expandCalendar(compact), cal.weeks)
  assert.ok(JSON.stringify(compact).length * 8 < JSON.stringify(cal).length, 'much smaller than the day objects')
  assert.equal(compactCalendar(compact), compact, 'already compact')
  assert.equal(compactCalendar({ available: false }), null)
  assert.equal(compactCalendar({ available: true, weeks: [] }), null)
  // A gap inside the range counts as zero.
  const gap = compactCalendar({ available: true, total: 3, weeks: [{ days: [{ date: '2026-01-01', count: 1, level: 4 }, { date: '2026-01-03', count: 2, level: 4 }] }] })
  assert.deepEqual(gap?.counts, [1, 0, 2])
})

test('A2: the calendar is drawn as five paths, one sub-path per day of each level', () => {
  const cal = buildCalendar(days('2026-09-27', [0, 1, 2, 3, 9, 0, 0, 5]))
  const paths = calendarPaths(cal.weeks)
  assert.equal(paths.length, 5)
  const perLevel = paths.map((d) => (d.match(/M/g) || []).length)
  const expected = [0, 1, 2, 3, 4].map((l) => cal.weeks.flatMap((w) => w.days).filter((d) => d.level === l).length)
  assert.deepEqual(perLevel, expected)
  assert.equal(perLevel.reduce((a, b) => a + b, 0), 8)
  // Week 0, Sunday (row 0): x = 1.5, y = 16 + 1.5.
  assert.ok(paths[0].startsWith('M1.5 17.5h7v7h-7z'), paths[0])
})

test('A2: the screen-reader summary adds the busiest month and the longest streak', () => {
  const cal = buildCalendar(days('2026-09-28', [1, 1, 0, 2, 2, 2, 0, 0, 0, 5]))
  assert.deepEqual(calendarHighlights(cal.weeks), { bestMonth: { month: '2026-10', count: 11 }, longestStreak: 3 })
  assert.deepEqual(calendarHighlights([]), { bestMonth: null, longestStreak: 0 })
  assert.equal(formatMonth('2026-10'), 'October 2026')
})

test('A2: one stacked bar of the top five languages plus Other, adding up to 100', () => {
  const breakdown = { HTML: 4140, Rust: 1300, TypeScript: 1190, JavaScript: 1040, Python: 980, CSS: 600, Shell: 500, C: 250 }
  const stack = languageStack({ total: 0, breakdown })
  assert.deepEqual(stack.map((s) => s.name), ['HTML', 'Rust', 'TypeScript', 'JavaScript', 'Python', 'Other'])
  assert.equal(stack.at(-1)?.other, true)
  assert.equal(Math.round(stack.reduce((n, s) => n + s.pct, 0) * 10) / 10, 100)
  assert.deepEqual(languageStack({ total: 0, breakdown: { Go: 10 } }), [{ name: 'Go', pct: 100 }])
  assert.deepEqual(languageStack({ total: 0, breakdown: {} }), [])
  assert.deepEqual(languageStackProp({ total: 0, breakdown, available: true })?.count, 8)
  assert.deepEqual(languageStackProp({ total: 0, breakdown: {}, available: false }), { available: false, slices: [], count: 0 })
  assert.equal(languageStackProp(null), null)
})

test('A2: the GitHub page props are trimmed to what the band renders (no undefined anywhere)', () => {
  const repo = (i: number) => ({
    id: i,
    name: `r${i}`,
    full_name: `me/r${i}`,
    html_url: `https://github.com/me/r${i}`,
    description: null,
    stargazers_count: i,
    forks_count: 0,
    language: 'Rust',
    updated_at: '2026-01-01T00:00:00Z',
    pushed_at: '2026-02-01T00:00:00Z',
    ...(i === 0 ? { featured: true, blurb: 'Pinned' } : {}),
  })
  const summary: GithubSummary = {
    stats: { user: 'me', public_repos: 6, followers: 1, total_stars: 3, languages: 2, contributions: 9, showVanity: false, available: true },
    topRepos: { repos: Array.from({ length: 6 }, (_, i) => repo(i)), available: true, asOf: 5 },
    languages: { total: 10, breakdown: { Rust: 6, Go: 4 }, available: true },
    events: { events: [], available: true },
    contributions: buildCalendar(days('2026-10-01', [1, 2, 3])),
  }
  const props = githubPageData(summary)
  assert.ok(props)
  assert.equal(props.repos?.repos.length, 3)
  assert.deepEqual(props.repos?.repos[0], repoCard(repo(0)))
  assert.equal('full_name' in (props.repos?.repos[0] as object), false)
  assert.equal(props.repos?.repos[0].featured, true)
  assert.equal('featured' in (props.repos?.repos[1] as object), false)
  assert.deepEqual(props.calendar, { available: true, total: 6, start: '2026-10-01', counts: [1, 2, 3] })
  assert.deepEqual(props.languages?.slices.map((s) => s.name), ['Rust', 'Go'])
  assert.equal(JSON.stringify(props), JSON.stringify(JSON.parse(JSON.stringify(props))), 'JSON-serialisable')
  assert.ok(!JSON.stringify(props).includes('"weeks"'))
  // Unknown parts stay null (the widget fetches); known-unavailable stays unavailable.
  const partial = githubPageData({ ...summary, topRepos: null, languages: null, contributions: { available: false } })
  assert.equal(partial?.repos, null)
  assert.equal(partial?.languages, null)
  assert.deepEqual(partial?.calendar, { available: false })
  assert.equal(githubPageData(null), null)
})

// ── G1 ─────────────────────────────────────────────────────────────────────

test('G1: / and /about regenerate hourly at runtime and after a second when prerendered by the build', () => {
  assert.equal(PROFILE_REVALIDATE_SECONDS, 3600)
  assert.equal(BUILD_REVALIDATE_SECONDS, 1)
  assert.equal(isBuildPhase({ NEXT_PHASE: 'phase-production-build' }), true)
  assert.equal(isBuildPhase({}), false)
  assert.equal(revalidateAfter(3600, { NEXT_PHASE: 'phase-production-build' }), 1)
  assert.equal(revalidateAfter(3600, { NEXT_PHASE: 'phase-production-server' }), 3600)
  for (const page of ['pages/index.tsx', 'pages/about/index.tsx']) {
    const src = read(page)
    assert.match(src, /export const getStaticProps: GetStaticProps<Props>/, page)
    assert.doesNotMatch(src, /getServerSideProps/, page)
    assert.match(src, /revalidate: revalidateAfter\(PROFILE_REVALIDATE_SECONDS\)/, page)
  }
  assert.match(read('next.config.js'), /expireTime: 86400/)
})

test('G1: every write that changes / or /about regenerates them', () => {
  for (const p of ['/', '/about', '/now']) {
    assert.ok(HOME_PAGE_PATHS.includes(p), `home → ${p}`)
    assert.ok(CV_PAGE_PATHS.includes(p), `CV → ${p}`)
  }
  assert.deepEqual([...COLLECTION_EXTRA_PATHS.blog], ['/'])
  assert.deepEqual([...COLLECTION_EXTRA_PATHS.work], ['/', '/about'])
  assert.ok(STATIC_CONTENT_PATHS.includes('/' as never) && STATIC_CONTENT_PATHS.includes('/about' as never), 'restores regenerate them')
  assert.deepEqual(derivedPurgePaths(['/about']), ['/api/search-index'])
})

test('G1: a save never joins a render that started before it: one follow-up render, shared, after the running one', async () => {
  const { revalidatePaths } = await import('../lib/revalidate')
  const log: string[] = []
  let active = 0
  let maxActive = 0
  const res = (name: string) =>
    ({
      revalidate: async (p: string) => {
        active++
        maxActive = Math.max(maxActive, active)
        log.push(`${name}:start:${p}`)
        await new Promise((r) => setTimeout(r, 30))
        log.push(`${name}:end:${p}`)
        active--
      },
    }) as never
  const first = revalidatePaths(res('A'), ['/'])
  await new Promise((r) => setTimeout(r, 5))
  // Two more saves while A's render runs: they share ONE render that starts after A's.
  const [failedA, failedB, failedC] = await Promise.all([first, revalidatePaths(res('B'), ['/']), revalidatePaths(res('C'), ['/'])])
  assert.deepEqual([failedA, failedB, failedC], [[], [], []])
  assert.deepEqual(log, ['A:start:/', 'A:end:/', 'B:start:/', 'B:end:/'])
  assert.equal(maxActive, 1, 'never two renders of one path at once')
  // Different paths still render in parallel, and a later save starts fresh.
  log.length = 0
  await Promise.all([revalidatePaths(res('D'), ['/about']), revalidatePaths(res('E'), ['/now'])])
  assert.deepEqual(log.filter((l) => l.includes('start')).length, 2)
  log.length = 0
  await revalidatePaths(res('F'), ['/'])
  assert.deepEqual(log, ['F:start:/', 'F:end:/'])
})

// ── A4: the /about nav ─────────────────────────────────────────────────────

test('A4: the /about nav lists the bio (when written) and the CV sections that have entries', () => {
  const sections = [
    { sessionName: 'education', headerName: 'EDUCATION', educationExperience: [{ degree: 'MSc' }] },
    { sessionName: 'patents', headerName: 'Patents', patentExperience: [] },
    { sessionName: 'extraSkill', headerName: '', points: ['  ', 'English'] },
    { sessionName: 'skill', headerName: '技能', technical: [], languages: [{ name: 'TS' }] },
  ]
  assert.deepEqual(aboutNavEntries(sections, { hasBio: true }), [
    { id: 'about-bio', label: 'Bio' },
    { id: 'about-education', label: 'Education' },
    { id: 'about-extraSkill', label: 'More skills' },
    { id: 'about-skill', label: '技能' },
  ])
  assert.deepEqual(aboutNavEntries(sections, { hasBio: false, lang: 'zh' })[0], { id: 'about-education', label: 'Education', lang: 'zh-Hans' })
  assert.equal(cvSectionHasEntries({ sessionName: 'patents', patentExperience: [{ title: 'x', isVisible: false }] }), false)
  assert.equal(navLabel('WORK / INTERNSHIP EXPERIENCE', 'workExperience'), 'Work / internship experience')
  assert.equal(navLabel('Mixed Case', 'x'), 'Mixed Case')
  assert.equal(aboutHeading({ name: '', nick: 'Lucian' } as never), 'Lucian')
})

// ── FIX-22 ─────────────────────────────────────────────────────────────────

test('FIX-22: after a back/forward restore, only an old visible challenge is replaced', () => {
  const now = 10_000_000
  const old = now - RESTORE_REFRESH_AFTER_MS
  assert.equal(shouldRefreshChallengeOnRestore({ persisted: true, fetchedAt: old, now, sent: false }), true)
  assert.equal(shouldRefreshChallengeOnRestore({ persisted: true, fetchedAt: now - 1000, now, sent: false }), false, 'fresh enough')
  assert.equal(shouldRefreshChallengeOnRestore({ persisted: false, fetchedAt: old, now, sent: false }), false, 'a normal load')
  assert.equal(shouldRefreshChallengeOnRestore({ persisted: true, fetchedAt: old, now, sent: true }), false, 'the message was sent')
  assert.equal(shouldRefreshChallengeOnRestore({ persisted: true, fetchedAt: 0, now, sent: false }), false, 'no challenge yet')
  assert.equal(shouldRefreshChallengeOnRestore({ persisted: true, fetchedAt: 1, now, sent: false }), false, 'one in flight')
  assert.match(read('components/Contact/ContactPro.tsx'), /addEventListener\('pageshow', onShow\)/)
})

// ── API contracts (temp content store) ─────────────────────────────────────

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'CF_ZONE_ID', 'CF_API_TOKEN', 'INDEXNOW_KEY']) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'home-about-isr-secret'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'home-about-isr-'))
type Handler = (req: any, res: any) => unknown
type MockRes = { statusCode: number; headers: Record<string, string>; body: any; revalidated: string[] }
let closeDb: () => void

async function call(handler: Handler, opts: { method?: string; query?: Record<string, any>; body?: any; headers?: Record<string, string>; admin?: boolean } = {}): Promise<MockRes> {
  const token = jwt.sign({ role: 'admin', email: 'owner@example.test' }, 'home-about-isr-secret', { algorithm: 'HS256' })
  const cookies = opts.admin === false ? {} : { cv_admin_token: token }
  const req = {
    method: opts.method || 'GET',
    query: opts.query || {},
    body: opts.body,
    cookies,
    headers: { ...(opts.admin === false ? {} : { cookie: `cv_admin_token=${token}` }), ...(opts.headers || {}) },
    socket: { remoteAddress: '127.0.0.1' },
  }
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined, revalidated: [] }
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(code: number) {
      out.statusCode = code
    },
    status(code: number) {
      out.statusCode = code
      return res
    },
    setHeader(name: string, value: any) {
      out.headers[name.toLowerCase()] = String(value)
      return res
    },
    getHeader(name: string) {
      return out.headers[name.toLowerCase()]
    },
    json(body: any) {
      out.body = JSON.parse(JSON.stringify(body))
      return res
    },
    send(body: any) {
      out.body = body
      return res
    },
    end(payload?: string) {
      if (typeof payload === 'string' && /json/.test(out.headers['content-type'] || '')) out.body = JSON.parse(payload)
      return res
    },
    async revalidate(p: string) {
      out.revalidated.push(p)
    },
  }
  await handler(req, res)
  return out
}

before(() => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
})

after(async () => {
  closeDb?.()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('A4 + G1: the "about" page saves through the page API, regenerates /about and joins the search index only once written', async () => {
  closeDb = (await import('../lib/db')).closeDb
  const page = (await import('../pages/api/admin/page')).default
  const versions = (await import('../pages/api/versions')).default
  const derived = (await import('../pages/api/admin/page-derived')).default
  const { buildSearchIndex } = await import('../lib/searchIndex')

  const empty = await call(page, { query: { name: 'about' } })
  assert.equal(empty.statusCode, 200)
  assert.equal(empty.body.body, '')
  assert.equal(buildSearchIndex().docs.some((d) => d.href.startsWith('/about')), false, 'no bio, no search result')

  const saved = await call(page, { method: 'PUT', body: { name: 'about', frontmatter: { title: 'About' }, body: '## Story\n\nI build systems.\n' }, headers: { 'if-match': empty.headers.etag } })
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body))
  assert.deepEqual(saved.revalidated, ['/about'])
  const doc = buildSearchIndex().docs.find((d) => d.href === '/about#about-bio')
  assert.ok(doc)
  assert.equal(doc.kind, 'page')
  assert.deepEqual(doc.headings, ['Story'])
  assert.match(doc.body || '', /I build systems/)

  const history = await call(versions, { query: { type: 'page', name: 'about' } })
  assert.equal(history.statusCode, 200)
  const bad = await call(versions, { query: { type: 'page', name: 'contact' } })
  assert.equal(bad.statusCode, 400)
  assert.match(bad.body.error, /"about"/)

  // The bio has no automatic version to start from.
  assert.equal((await call(derived, { query: { name: 'about' } })).statusCode, 400)

  const cleared = await call(page, { method: 'PUT', body: { name: 'about', frontmatter: { title: 'About' }, body: '' }, headers: { 'if-match': saved.body.etag } })
  assert.equal(cleared.statusCode, 200)
  assert.equal(buildSearchIndex().docs.some((d) => d.href.startsWith('/about')), false)
})

test('G1: a post save also regenerates /, a case-study save / and /about', async () => {
  const { refreshCollection } = await import('../lib/mdx-admin')
  const { putItem } = await import('../lib/contentStore')
  await putItem('blog', 'hello', { title: 'Hello', date: '2026-10-01' }, 'Body')
  await putItem('work', 'case', { title: 'Case' }, 'Body')
  const run = async (c: 'blog' | 'work', slug: string) => {
    const revalidated: string[] = []
    await refreshCollection({ revalidate: async (p: string) => void revalidated.push(p) } as never, c, slug)
    return revalidated
  }
  const blog = await run('blog', 'hello')
  assert.ok(blog.includes('/blog/hello') && blog.includes('/'))
  assert.ok(!blog.includes('/about'))
  const work = await run('work', 'case')
  assert.ok(work.includes('/work/case') && work.includes('/') && work.includes('/about'))
})

test('A1: the admin cv-derived helper offers verbatim highlight suggestions linked to /cv', async () => {
  const { writeCvData } = await import('../lib/cvdata')
  await writeCvData({ en: cvEn, zh: [] })
  const derived = (await import('../pages/api/admin/cv-derived')).default
  const r = await call(derived as Handler)
  assert.equal(r.statusCode, 200)
  assert.equal(r.body.suggestedHighlights[0].value, '18th Worldwide / 1st in Hong Kong')
  assert.equal(r.body.suggestedHighlights[0].href, '/cv#cv-competitionAwards-0')
  assert.equal((await call(derived as Handler, { admin: false })).statusCode, 401)
})

test('FIX-22: the contact nonce is private and revalidated, never no-store', async () => {
  const nonce = (await import('../pages/api/contact/nonce')).default
  const r = await call(nonce as Handler, { admin: false })
  assert.equal(r.statusCode, 200)
  assert.equal(r.headers['cache-control'], 'private, no-cache, max-age=0')
  assert.ok(typeof r.body.token === 'string' && Number.isInteger(r.body.challenge.a))
})
