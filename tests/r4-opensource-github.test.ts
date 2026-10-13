/**
 * Pure GitHub widget helpers: activity grouping, featured-repo ordering,
 * stat tiles, the contribution calendar, and the deduplicating fetch.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  absoluteTime,
  buildCalendar,
  calendarFacts,
  calendarLayout,
  featuredList,
  formatDay,
  groupEvents,
  levelScale,
  monthLabels,
  orderRepos,
  relativeTime,
  splitRepo,
  statTiles,
  summarizeGroup,
  weekdayOf,
  type GhEvent,
  type GhStats,
} from '../components/Common/githubEvents'
import { sharedFetch } from '../components/Common/useFetchJson'

const ev = (id: string, type: string, repo: string | null, payload: GhEvent['payload'] = {}): GhEvent => ({
  id,
  type,
  created_at: '2026-10-12T10:00:00Z',
  ...(repo ? { repo: { name: repo } } : {}),
  payload,
})

test('groupEvents collapses consecutive events on the same repository only', () => {
  const groups = groupEvents([
    ev('1', 'PushEvent', 'me/a', { size: 2 }),
    ev('2', 'PullRequestEvent', 'me/a', { action: 'opened', number: 14 }),
    ev('3', 'CreateEvent', 'me/a', { ref_type: 'branch' }),
    ev('4', 'PushEvent', 'me/b'),
    ev('5', 'IssueCommentEvent', 'me/a', { issue: { number: 3 } }),
    ev('6', 'WatchEvent', null),
    ev('7', 'WatchEvent', null),
  ])
  assert.deepEqual(
    groups.map((g) => [g.key, g.repo, g.events.map((e) => e.id)]),
    [
      ['1', 'me/a', ['1', '2', '3']],
      ['4', 'me/b', ['4']],
      ['5', 'me/a', ['5']],
      ['6', '', ['6']],
      ['7', '', ['7']],
    ],
  )
  assert.deepEqual(groupEvents(undefined), [])
  assert.deepEqual(groupEvents(null), [])
})

test('summarizeGroup describes what a group amounts to', () => {
  assert.equal(
    summarizeGroup([
      ev('1', 'PullRequestEvent', 'me/a', { action: 'opened', number: 14 }),
      ev('2', 'CreateEvent', 'me/a', { ref_type: 'branch' }),
      ev('3', 'IssueCommentEvent', 'me/a', { issue: { number: 14 } }),
    ]),
    'PR #14, 1 branch, 1 comment',
  )
  // Commit counts when every push reports a size, push counts otherwise.
  assert.equal(summarizeGroup([ev('1', 'PushEvent', 'r', { size: 2 }), ev('2', 'PushEvent', 'r', { size: 3 })]), '5 commits')
  assert.equal(summarizeGroup([ev('1', 'PushEvent', 'r', { size: 2 }), ev('2', 'PushEvent', 'r')]), '2 pushes')
  assert.equal(summarizeGroup([ev('1', 'PushEvent', 'r')]), '1 push')
  // Repeated PR numbers are listed once; three or more are abbreviated.
  assert.equal(
    summarizeGroup([ev('1', 'PullRequestEvent', 'r', { number: 4 }), ev('2', 'PullRequestEvent', 'r', { number: 4 })]),
    '2 PRs',
  )
  assert.equal(
    summarizeGroup([
      ev('1', 'PullRequestEvent', 'r', { number: 4 }),
      ev('2', 'PullRequestEvent', 'r', { number: 5 }),
      ev('3', 'PullRequestEvent', 'r', { number: 6 }),
    ]),
    'PRs #4, #5 +1',
  )
  assert.equal(summarizeGroup([ev('1', 'IssuesEvent', 'r', { issue: { number: 9 } })]), 'issue #9')
  assert.equal(summarizeGroup([ev('1', 'CreateEvent', 'r', { ref_type: 'tag' }), ev('2', 'ReleaseEvent', 'r')]), '1 tag, 1 release')
  assert.equal(summarizeGroup([ev('1', 'GollumEvent', 'r'), ev('2', 'MemberEvent', 'r')]), '1 other event, 1 other event')
})

test('splitRepo, relative and absolute times are timezone-independent', () => {
  assert.deepEqual(splitRepo('HikoPLi/landing_page'), { owner: 'HikoPLi/', name: 'landing_page' })
  assert.deepEqual(splitRepo('solo'), { owner: '', name: 'solo' })
  const now = Date.parse('2026-10-12T12:00:00Z')
  assert.equal(relativeTime('2026-10-12T05:00:00Z', now), '7h ago')
  assert.equal(relativeTime('2025-12-31T23:30:00Z', now), 'Dec 31, 2025')
  assert.equal(absoluteTime('2026-10-12T09:05:00Z'), 'Oct 12, 2026, 09:05 UTC')
  assert.equal(absoluteTime('nope'), '')
})

test('featuredList validates and de-duplicates the owner list', () => {
  assert.deepEqual(
    featuredList([
      { name: ' landing_page ', blurb: ' This site. ' },
      { name: 'LANDING_PAGE' },
      { name: 'HikoPLi/raku' },
      { name: '' },
      { name: 'bad name with spaces' },
      { name: 'x', blurb: 42 },
      'not-an-object',
    ]),
    [{ name: 'landing_page', blurb: 'This site.' }, { name: 'HikoPLi/raku' }, { name: 'x' }],
  )
  assert.deepEqual(featuredList(undefined), [])
  assert.deepEqual(featuredList({ name: 'a' }), [])
})

test('orderRepos puts featured repos first, in the owner order, then fills by stars and recency', () => {
  const repos = [
    { name: 'a', full_name: 'me/a', stargazers_count: 1, pushed_at: '2026-01-01T00:00:00Z' },
    { name: 'b', full_name: 'me/b', stargazers_count: 9, pushed_at: '2025-01-01T00:00:00Z' },
    { name: 'c', full_name: 'me/c', stargazers_count: 1, pushed_at: '2026-06-01T00:00:00Z' },
    { name: 'fork', full_name: 'me/fork', stargazers_count: 99, fork: true, pushed_at: '2026-06-01T00:00:00Z' },
    { name: '.github', full_name: 'me/.github', stargazers_count: 50, pushed_at: '2026-06-01T00:00:00Z' },
    { name: 'd', full_name: 'me/d', stargazers_count: 0, pushed_at: '2024-01-01T00:00:00Z' },
  ]
  const out = orderRepos(repos, [{ name: 'D', blurb: 'Owner words' }, { name: 'missing' }, { name: 'me/a' }], 4)
  assert.deepEqual(
    out.map((r) => r.name),
    ['d', 'a', 'b', 'c'],
  )
  assert.equal(out[0].featured, true)
  assert.equal(out[0].blurb, 'Owner words')
  assert.equal(out[1].featured, true)
  assert.equal(out[1].blurb, undefined)
  assert.equal(out[2].featured, undefined)
  // A featured fork is shown (the owner chose it); unfeatured forks and dot-repos never fill.
  assert.deepEqual(
    orderRepos(repos, [{ name: 'fork' }], 10).map((r) => r.name),
    ['fork', 'b', 'c', 'a', 'd'],
  )
  assert.deepEqual(orderRepos([], [{ name: 'a' }]), [])
})

test('statTiles shows meaningful numbers, vanity ones only on opt-in', () => {
  const base: GhStats = {
    user: 'me',
    public_repos: 12,
    followers: 3,
    total_stars: 40,
    languages: 7,
    contributions: 1622,
    showVanity: false,
    available: true,
  }
  assert.deepEqual(statTiles(base), [
    { label: 'Public repos', value: 12 },
    { label: 'Contributions (last year)', value: 1622 },
    { label: 'Languages', value: 7 },
  ])
  assert.deepEqual(
    statTiles({ ...base, contributions: null, languages: null, showVanity: true }).map((t) => t.label),
    ['Public repos', 'Followers', 'Total stars'],
  )
})

test('levelScale maps counts to quartile levels of the non-zero counts', () => {
  const level = levelScale([0, 1, 2, 3, 4, 5, 6, 7, 8, 0])
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 100].map(level),
    [0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  )
  assert.equal(levelScale([0, 0])(5), 0)
  // All-equal non-zero counts are one level, never invented spread.
  assert.deepEqual([3, 3, 3].map(levelScale([3, 3, 3])), [1, 1, 1])
})

test('buildCalendar groups days into Sunday-first weeks and keeps the newest weeks', () => {
  assert.equal(weekdayOf('2026-10-11'), 0) // a Sunday
  assert.equal(weekdayOf('2026-10-13'), 2)
  const days: Array<{ date: string; count: number }> = []
  // 2025-10-08 (Wednesday) … 2026-10-13 (Tuesday)
  for (let t = Date.parse('2025-10-08T00:00:00Z'); t <= Date.parse('2026-10-13T00:00:00Z'); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10)
    days.push({ date, count: date.endsWith('-01') ? 4 : 0 })
  }
  days.push({ date: 'garbage', count: 9 }, { date: '2026-13-45', count: 9 })
  const cal = buildCalendar(days, 1622)
  assert.equal(cal.available, true)
  assert.equal(cal.total, 1622)
  assert.equal(cal.weeks.length, 53)
  for (const w of cal.weeks) {
    assert.ok(w.days.length >= 1 && w.days.length <= 7)
    assert.ok(w.days.every((d, i) => i === 0 || weekdayOf(d.date) > weekdayOf(w.days[i - 1].date)))
  }
  // Full weeks start on Sunday; the newest (partial) week ends today.
  assert.equal(weekdayOf(cal.weeks[0].days[0].date), 0)
  assert.equal(cal.weeks[52].days[cal.weeks[52].days.length - 1].date, '2026-10-13')
  assert.ok(cal.weeks.flatMap((w) => w.days).every((d) => (d.count > 0 ? d.level > 0 : d.level === 0)))
  // Without a source total the kept days are summed.
  assert.equal(buildCalendar([{ date: '2026-10-12', count: 2 }, { date: '2026-10-13', count: 3 }]).total, 5)
  assert.deepEqual(buildCalendar([]).weeks, [])
})

test('monthLabels marks month changes without overlapping or overflowing', () => {
  const weeks = ['2026-01-25', '2026-02-01', '2026-02-08', '2026-02-15', '2026-02-22', '2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29'].map(
    (date) => ({ days: [{ date, count: 0, level: 0 as const }] }),
  )
  // "Jan" (one column before Feb) is dropped; "Mar" has room before the edge.
  assert.deepEqual(monthLabels(weeks), [
    { col: 1, label: 'Feb' },
    { col: 5, label: 'Mar' },
  ])
  // A month starting in the last two columns gets no label.
  assert.deepEqual(monthLabels(weeks.slice(0, 6)), [{ col: 1, label: 'Feb' }])
})

test('calendarFacts and formatDay feed the screen-reader summary', () => {
  const weeks = [
    {
      days: [
        { date: '2026-10-11', count: 0, level: 0 as const },
        { date: '2026-10-12', count: 5, level: 4 as const },
        { date: '2026-10-13', count: 2, level: 2 as const },
      ],
    },
  ]
  assert.deepEqual(calendarFacts(weeks), { days: 3, activeDays: 2, best: weeks[0].days[1] })
  assert.deepEqual(calendarFacts([]), { days: 0, activeDays: 0, best: null })
  assert.equal(formatDay('2026-10-03'), 'Oct 3')
  assert.equal(formatDay('2026-10-03', true), 'Oct 3, 2026')
})

test('calendar layout: week columns × weekday rows, partial first and last weeks', () => {
  // Week 0 starts on Wednesday (partial), week 1 is full, week 2 ends on Monday (partial).
  // (The graph is drawn as one path per level since A2; this index serves its pointer tooltip.)
  const day = (date: string) => ({ date, count: 0, level: 0 as const })
  const weeks = [
    { days: ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].map(day) },
    { days: ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map(day) },
    { days: ['2026-10-11', '2026-10-12'].map(day) },
  ]
  const { cells, byKey } = calendarLayout(weeks)
  assert.equal(cells.length, 13)
  assert.equal(byKey.get('0:3')?.day.date, '2026-09-30')
  assert.equal(byKey.get('2:1')?.day.date, '2026-10-12')
  assert.equal(byKey.get('0:0'), undefined, 'no Sunday in the partial first week')
})

test('sharedFetch shares one request between concurrent callers and clears on settle', async () => {
  let calls = 0
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  const fetcher = async (url: string) => {
    calls++
    await gate
    return { ok: true, status: 200, json: async () => ({ url, n: calls }) }
  }
  const a = sharedFetch<{ url: string; n: number }>('/api/x', fetcher)
  const b = sharedFetch<{ url: string; n: number }>('/api/x', fetcher)
  const c = sharedFetch<{ url: string; n: number }>('/api/y', fetcher)
  release()
  const [ra, rb, rc] = await Promise.all([a, b, c])
  assert.equal(calls, 2)
  assert.equal(ra, rb)
  assert.equal(rc.url, '/api/y')
  // Settled: the next call (a retry) fetches again.
  await sharedFetch('/api/x', fetcher)
  assert.equal(calls, 3)
})

test('sharedFetch rejects on HTTP errors and still clears the entry', async () => {
  let calls = 0
  const failing = async () => {
    calls++
    return { ok: false, status: 503, json: async () => ({}) }
  }
  await assert.rejects(sharedFetch('/api/fail', failing), /HTTP 503/)
  await assert.rejects(sharedFetch('/api/fail', failing), /HTTP 503/)
  assert.equal(calls, 2)
})
