/**
 * Pure, client-safe helpers and payload types for the GitHub widgets
 * (components/GitHub/*) and their server loaders (lib/githubData.ts).
 *
 * No Node or DB imports: the widgets import this module in the browser, the
 * loaders import it on the server, and the unit tests import it directly.
 *
 * The words of the activity lines, times and dates are the page's (`w`,
 * lib/uiStrings/home `github`; English by default): the Chinese home page
 * (/zh, F3) passes its own.
 */

import { GITHUB_EN, type GithubWords } from '../../lib/uiStrings/github-en'

/** {name} → value (lib/uiStrings fillUi, inlined: this module is shared with the server loaders). */
const fill = (template: string, values: Readonly<Record<string, string | number>>) =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole))

// ── Payload types (the JSON the /api/github/* routes and loadGithubSummary return) ──

export type GhEvent = {
  id: string
  type: string
  created_at: string
  repo?: { name: string }
  payload?: {
    action?: string
    number?: number
    ref_type?: string
    size?: number
    issue?: { number?: number }
  }
}

export type GhStats = {
  /** GitHub login; '' (with available: true) when no profile is linked. */
  user: string
  public_repos: number
  followers: number
  total_stars: number
  /** Distinct languages in the analysed repositories; null when the breakdown is unavailable. */
  languages: number | null
  /** Contributions in the last year; null when the calendar is unavailable. */
  contributions: number | null
  /** The owner opted into the follower / star tiles (home.openSource.showVanityStats). */
  showVanity: boolean
  /** false when GitHub could not be reached — the UI shows an error state instead of zeros. */
  available: boolean
}

export type GhRepo = {
  id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  /** Owner-written blurb for a featured repository (home.openSource.featured). */
  blurb?: string
  /** True when the owner featured this repository. */
  featured?: boolean
  stargazers_count: number
  forks_count: number
  language: string | null
  updated_at: string
  pushed_at: string
}

/** `available: false` = GitHub unreachable; `repos: []` with `available: true` = genuinely none. */
export type GhTopRepos = { repos: GhRepo[]; available: boolean; asOf?: number }

/** One row of GET /api/github/top-repos?all=1 (admin featured-repo picker). */
export type GhRepoChoice = {
  name: string
  description: string | null
  language: string | null
  stargazers_count: number
  pushed_at: string
}

export type GhLanguages = { total: number; breakdown: Record<string, number>; available: boolean }

/** `available: false` = GitHub unreachable; `events: []` with `available: true` = genuinely none. */
export type GhEventsPayload = { events: GhEvent[]; available: boolean; asOf?: number }

export type ContributionLevel = 0 | 1 | 2 | 3 | 4
export type ContributionDay = { date: string; count: number; level: ContributionLevel }
export type ContributionWeek = { days: ContributionDay[] }
export type GhContributions = { available: boolean; total?: number; weeks?: ContributionWeek[] }

/**
 * Everything the Open Source / About widgets render, loaded server-side so
 * the numbers are already in the HTML. A part is `null` when it was not
 * ready within the server's time budget: the widget then fetches it itself.
 */
export type GithubSummary = {
  stats: GhStats | null
  topRepos: GhTopRepos | null
  languages: GhLanguages | null
  events: GhEventsPayload | null
  contributions: GhContributions | null
}

// ── Stats ────────────────────────────────────────────────────────────────────

export type StatTileKey = 'repos' | 'contributions' | 'languages' | 'followers' | 'stars'
export type StatTile = { key: StatTileKey; label: string; value: number }

const TILE_LABELS_EN: Record<StatTileKey, string> = {
  repos: 'Public repos',
  contributions: 'Contributions (last year)',
  languages: 'Languages',
  followers: 'Followers',
  stars: 'Total stars',
}

/** The stat tiles worth showing, in order (labels in the page's language). Vanity numbers only when the owner opted in. */
export function statTiles(s: GhStats, labels: Readonly<Record<StatTileKey, string>> = TILE_LABELS_EN): StatTile[] {
  const tile = (key: StatTileKey, value: number): StatTile => ({ key, label: labels[key], value })
  const tiles: StatTile[] = [tile('repos', s.public_repos)]
  if (typeof s.contributions === 'number') tiles.push(tile('contributions', s.contributions))
  if (typeof s.languages === 'number') tiles.push(tile('languages', s.languages))
  if (s.showVanity) {
    tiles.push(tile('followers', s.followers))
    tiles.push(tile('stars', s.total_stars))
  }
  return tiles
}

/**
 * Grid columns of the stats row for `n` tiles: at most 3 per row on phones
 * (2 for exactly 4), at most 4 on tablets — wider rows (e.g. 5 tiles at
 * 768 px) leave tiles too narrow for a label word like "CONTRIBUTIONS" —
 * and all in one row from the desktop breakpoint.
 */
export function statColumns(n: number): { base: string; md: string; lg: string } {
  const count = Math.max(1, Math.floor(n) || 1)
  const cols = (c: number) => `repeat(${c}, minmax(0, 1fr))`
  return {
    base: cols(Math.min(count, count === 4 ? 2 : 3)),
    md: cols(count > 4 ? 3 : count),
    lg: cols(count),
  }
}

// ── Activity feed ────────────────────────────────────────────────────────────

export type EventKind = 'push' | 'pr' | 'issue' | 'create' | 'repo' | 'other'

const REPO_RE = /^[\w.-]+\/[\w.-]+$/

/** https://github.com/<owner>/<repo> for a well-formed repo name, else ''. */
export function repoUrl(name: unknown): string {
  return typeof name === 'string' && REPO_RE.test(name) ? `https://github.com/${name}` : ''
}

/** "owner/repo" → { owner: 'owner/', name: 'repo' }; anything else is all name. */
export function splitRepo(full: string): { owner: string; name: string } {
  const slash = full.indexOf('/')
  return slash > 0 ? { owner: full.slice(0, slash + 1), name: full.slice(slash + 1) } : { owner: '', name: full }
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function eventKind(type: string): EventKind {
  switch (type) {
    case 'PushEvent':
      return 'push'
    case 'PullRequestEvent':
      return 'pr'
    case 'IssuesEvent':
      return 'issue'
    case 'CreateEvent':
      return 'create'
    case 'RepoUpdateEvent':
      return 'repo'
    default:
      return 'other'
  }
}

/** Verb phrase without the repo, e.g. "Pushed 3 commits to", "Opened PR #12 in" ("新建 PR #12："). */
export function eventAction(e: GhEvent, w: GithubWords = GITHUB_EN): string {
  const p = e.payload || {}
  const pick = (action: string | undefined, opened: string, closed: string, updated: string) => (action === 'opened' ? opened : action === 'closed' ? closed : updated)
  switch (e.type) {
    case 'PushEvent': {
      const n = typeof p.size === 'number' && p.size > 0 ? p.size : 0
      return n > 1 ? fill(w.pushedN, { n }) : n === 1 ? w.pushedOne : w.pushed
    }
    case 'PullRequestEvent': {
      const num = typeof p.number === 'number' ? ` #${p.number}` : ''
      return fill(pick(p.action, w.prOpened, w.prClosed, w.prUpdated), { num })
    }
    case 'IssuesEvent': {
      const n = p.issue?.number
      const num = typeof n === 'number' ? ` #${n}` : ''
      return fill(pick(p.action, w.issueOpened, w.issueClosed, w.issueUpdated), { num })
    }
    case 'CreateEvent':
      if (p.ref_type === 'repository') return w.createdRepo
      return fill(w.createdRef, { ref: p.ref_type === 'branch' || p.ref_type === 'tag' ? w.refWords[p.ref_type] : p.ref_type || w.refWords.ref })
    case 'RepoUpdateEvent':
      return w.updated
    case 'WatchEvent':
      return w.starred
    case 'ForkEvent':
      return w.forked
    case 'ReleaseEvent':
      return w.released
    default: {
      const words = String(e.type || '')
        .replace(/Event$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
      // GitHub's own name of the event, where the words have a place for it ("Member in").
      return words ? fill(w.other, { words: cap(words) }) : w.activity
    }
  }
}

/** A UTC date in the page's words ("Oct 12, 2026", "2026年10月12日"). */
function utcDate(t: number, w: GithubWords): string {
  const date = new Date(t)
  return fill(w.date, { month: w.months[date.getUTCMonth()], m: date.getUTCMonth() + 1, d: date.getUTCDate(), y: date.getUTCFullYear() })
}

/**
 * "just now", "5m ago", "3h ago", "2d ago", or a short UTC date beyond 30
 * days ("刚刚", "5 分钟前" … with the Chinese words). Pass the same `now` on
 * the server and during hydration so the text matches (see useRenderNow).
 */
export function relativeTime(iso: string, now: number = Date.now(), w: GithubWords = GITHUB_EN): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return w.justNow
  const m = Math.round(s / 60)
  if (m < 60) return fill(w.minutesAgo, { n: m })
  const h = Math.round(m / 60)
  if (h < 24) return fill(w.hoursAgo, { n: h })
  const d = Math.round(h / 24)
  if (d <= 30) return fill(w.daysAgo, { n: d })
  return utcDate(t, w)
}

/** Timezone-independent absolute timestamp for a `title`: "Oct 12, 2026, 09:05 UTC" ("2026年10月12日 09:05 UTC"). */
export function absoluteTime(iso: string, w: GithubWords = GITHUB_EN): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return fill(w.dateTime, { month: w.months[d.getUTCMonth()], m: d.getUTCMonth() + 1, d: d.getUTCDate(), y: d.getUTCFullYear(), hh, mm })
}

export type EventGroup = {
  /** Stable React key (the newest event's id). */
  key: string
  /** "owner/repo", or '' for an event without a repository. */
  repo: string
  /** Newest first, as the feed delivers them. */
  events: GhEvent[]
}

/** Collapse consecutive events on the same repository into one group. */
export function groupEvents(events: readonly GhEvent[] | null | undefined): EventGroup[] {
  const groups: EventGroup[] = []
  for (const e of Array.isArray(events) ? events : []) {
    const repo = typeof e?.repo?.name === 'string' ? e.repo.name : ''
    const last = groups[groups.length - 1]
    if (last && repo && last.repo === repo) last.events.push(e)
    else groups.push({ key: String(e.id), repo, events: [e] })
  }
  return groups
}

/** "{n} things" from a [one, many] pair of templates. */
const plural = (n: number, [one, many]: readonly [string, string]) => fill(n === 1 ? one : many, { n })

function numbered([label, labels]: readonly [string, string], counted: readonly [string, string], nums: number[], count: number, w: GithubWords): string {
  const unique = Array.from(new Set(nums))
  if (unique.length && unique.length === count) {
    const shown = unique.slice(0, 2).map((n) => `#${n}`)
    const more = unique.length > 2 ? ` +${unique.length - 2}` : ''
    return `${unique.length === 1 ? label : labels} ${shown.join(w.summary.sep)}${more}`
  }
  return plural(count, counted)
}

/** "PR #14, 1 branch, 1 comment" ("PR #14、1 个分支、1 条评论") — what a group of events on one repo amounts to. */
export function summarizeGroup(events: readonly GhEvent[], w: GithubWords = GITHUB_EN): string {
  type Bucket = { count: number; commits: number; sizesKnown: boolean; nums: number[] }
  const order: string[] = []
  const buckets = new Map<string, Bucket>()
  const add = (key: string, e: GhEvent) => {
    let b = buckets.get(key)
    if (!b) {
      b = { count: 0, commits: 0, sizesKnown: true, nums: [] }
      buckets.set(key, b)
      order.push(key)
    }
    b.count += 1
    const p = e.payload || {}
    if (typeof p.size === 'number' && p.size > 0) b.commits += p.size
    else b.sizesKnown = false
    const num = typeof p.number === 'number' ? p.number : p.issue?.number
    if (typeof num === 'number') b.nums.push(num)
  }
  for (const e of events) {
    const p = e.payload || {}
    switch (e.type) {
      case 'CreateEvent':
        add(p.ref_type === 'branch' ? 'branch' : p.ref_type === 'tag' ? 'tag' : p.ref_type === 'repository' ? 'created' : 'ref', e)
        break
      case 'DeleteEvent':
        add('deleted', e)
        break
      default:
        add(e.type, e)
    }
  }
  const s = w.summary
  return order
    .map((key) => {
      const b = buckets.get(key) as Bucket
      switch (key) {
        case 'PushEvent':
          return b.sizesKnown ? plural(b.commits, s.commit) : plural(b.count, s.push)
        case 'PullRequestEvent':
          return numbered(s.pr, s.prCount, b.nums, b.count, w)
        case 'IssuesEvent':
          return numbered(s.issue, s.issueCount, b.nums, b.count, w)
        case 'IssueCommentEvent':
        case 'CommitCommentEvent':
          return plural(b.count, s.comment)
        case 'PullRequestReviewEvent':
          return plural(b.count, s.review)
        case 'PullRequestReviewCommentEvent':
          return plural(b.count, s.reviewComment)
        case 'branch':
          return plural(b.count, s.branch)
        case 'tag':
          return plural(b.count, s.tag)
        case 'ref':
          return plural(b.count, s.ref)
        case 'created':
          return s.created
        case 'deleted':
          return plural(b.count, s.deletion)
        case 'ReleaseEvent':
          return plural(b.count, s.release)
        case 'WatchEvent':
          return s.starred
        case 'ForkEvent':
          return s.forked
        case 'RepoUpdateEvent':
          return s.updated
        default:
          return plural(b.count, s.other)
      }
    })
    .join(s.sep)
}

// ── Featured repositories ────────────────────────────────────────────────────

export type FeaturedRepo = { name: string; blurb?: string }

const REPO_NAME_RE = /^(?:[A-Za-z0-9-]{1,39}\/)?[\w.-]{1,100}$/
const MAX_FEATURED = 12

/** The owner's featured list from the home document, validated and de-duplicated. */
export function featuredList(raw: unknown): FeaturedRepo[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: FeaturedRepo[] = []
  for (const item of raw) {
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    if (!name || !REPO_NAME_RE.test(name) || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    const blurb = typeof item?.blurb === 'string' ? item.blurb.trim() : ''
    out.push(blurb ? { name, blurb } : { name })
    if (out.length >= MAX_FEATURED) break
  }
  return out
}

export type RepoLike = {
  name: string
  full_name?: string
  fork?: boolean
  stargazers_count: number
  pushed_at?: string
  updated_at?: string
}

const recency = (r: RepoLike) => {
  const t = Date.parse(r.pushed_at || r.updated_at || '')
  return Number.isFinite(t) ? t : 0
}

/**
 * Featured repositories first, in the owner's order (with their blurbs), then
 * the owner's own work (no forks, no dot-repos) by stars, then recency, up
 * to `limit`. A featured name matches the repo name or "owner/name".
 */
export function orderRepos<R extends RepoLike>(
  repos: readonly R[],
  featured: readonly FeaturedRepo[] = [],
  limit = 6,
): Array<R & { featured?: true; blurb?: string }> {
  const out: Array<R & { featured?: true; blurb?: string }> = []
  const used = new Set<R>()
  for (const f of featured) {
    if (out.length >= limit) break
    const want = f.name.toLowerCase()
    const hit = repos.find((r) => !used.has(r) && (r.name.toLowerCase() === want || (r.full_name || '').toLowerCase() === want))
    if (!hit) continue
    used.add(hit)
    out.push(f.blurb ? { ...hit, featured: true, blurb: f.blurb } : { ...hit, featured: true })
  }
  const rest = repos
    .filter((r) => !used.has(r) && !r.fork && !r.name.startsWith('.'))
    .sort((a, b) => b.stargazers_count - a.stargazers_count || recency(b) - recency(a))
  for (const r of rest) {
    if (out.length >= limit) break
    out.push({ ...r })
  }
  return out
}

// ── Contribution calendar ────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

const dayStamp = (date: string) => Date.parse(`${date}T00:00:00Z`)

/** 0 = Sunday … 6 = Saturday, for a 'YYYY-MM-DD' date (UTC, so it never shifts). */
export function weekdayOf(date: string): number {
  return new Date(dayStamp(date)).getUTCDay()
}

/** 'Oct 3' (or 'Oct 3, 2026' with the year) for a 'YYYY-MM-DD' date ('10月3日', '2026年10月3日'). */
export function formatDay(date: string, withYear = false, w: GithubWords = GITHUB_EN): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return fill(withYear ? w.dayWithYear : w.day, { month: w.months[m - 1], m, d, y })
}

/**
 * Level 0 for no contributions, else 1–4 by the quartiles of the non-zero
 * counts (the same idea as GitHub's own calendar, computed from the data).
 */
export function levelScale(counts: readonly number[]): (count: number) => ContributionLevel {
  const nonZero = counts.filter((c) => c > 0).sort((a, b) => a - b)
  if (!nonZero.length) return () => 0
  const q = (p: number) => nonZero[Math.floor((nonZero.length - 1) * p)]
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)]
  return (count) => (count <= 0 ? 0 : count <= q1 ? 1 : count <= q2 ? 2 : count <= q3 ? 3 : 4)
}

/**
 * Normalise a list of days from any source into Sunday-first weeks (at most
 * `maxWeeks`, newest last) with quartile levels. `total` is the source's own
 * figure when it reports one, else the sum of the kept days.
 */
export function buildCalendar(
  input: ReadonlyArray<{ date: string; count: number }>,
  sourceTotal?: number,
  maxWeeks = 53,
): { available: true; total: number; weeks: ContributionWeek[] } {
  const byDate = new Map<string, number>()
  for (const d of input) {
    if (typeof d?.date !== 'string' || !DATE_RE.test(d.date) || !Number.isFinite(dayStamp(d.date))) continue
    const count = Number(d.count)
    byDate.set(d.date, Number.isFinite(count) && count > 0 ? Math.floor(count) : 0)
  }
  const dates = Array.from(byDate.keys()).sort()
  const weeks: Array<Array<{ date: string; count: number }>> = []
  let currentWeekStart = Number.NaN
  for (const date of dates) {
    const stamp = dayStamp(date)
    const weekStart = stamp - weekdayOf(date) * DAY_MS
    if (weekStart !== currentWeekStart) {
      weeks.push([])
      currentWeekStart = weekStart
    }
    weeks[weeks.length - 1].push({ date, count: byDate.get(date) as number })
  }
  const kept = weeks.slice(-maxWeeks)
  const level = levelScale(kept.flat().map((d) => d.count))
  const sum = kept.flat().reduce((n, d) => n + d.count, 0)
  return {
    available: true,
    total: typeof sourceTotal === 'number' && Number.isFinite(sourceTotal) && sourceTotal >= 0 ? Math.floor(sourceTotal) : sum,
    weeks: kept.map((days) => ({ days: days.map((d) => ({ date: d.date, count: d.count, level: level(d.count) })) })),
  }
}

/**
 * Month labels over the week columns: a label where the month of a week's
 * first day changes. A label closer than `minGap` columns to the next one
 * (a partial first month) or to the right edge is dropped so labels never
 * overlap or overflow.
 */
export function monthLabels(weeks: readonly ContributionWeek[], minGap = 3, w: GithubWords = GITHUB_EN): Array<{ col: number; label: string }> {
  const raw: Array<{ col: number; label: string }> = []
  let prev = -1
  weeks.forEach((week, col) => {
    const first = week.days[0]?.date
    if (!first) return
    const month = Number(first.slice(5, 7)) - 1
    if (month !== prev) raw.push({ col, label: w.months[month] })
    prev = month
  })
  // The next label (or the right edge, for the last one) must leave room for the text.
  return raw.filter((l, i) => (i === raw.length - 1 ? weeks.length - l.col : raw[i + 1].col - l.col) >= minGap)
}

/** Facts for the graph's screen-reader summary, all derived from the data. */
export function calendarFacts(weeks: readonly ContributionWeek[]): {
  days: number
  activeDays: number
  best: ContributionDay | null
} {
  const all = weeks.flatMap((w) => w.days)
  let best: ContributionDay | null = null
  for (const d of all) if (d.count > 0 && (!best || d.count > best.count)) best = d
  return { days: all.length, activeDays: all.filter((d) => d.count > 0).length, best }
}

// ── Calendar drawing (components/GitHub/ContributionGraph) ───────────────────

export const CALENDAR_ROWS = 7

export type CalendarCell = { key: string; col: number; row: number; day: ContributionDay }

/** Week columns × weekday rows, plus a "col:row" → cell index for pointer lookups. */
export function calendarLayout(weeks: readonly ContributionWeek[]): { cells: CalendarCell[]; byKey: Map<string, CalendarCell> } {
  const cells: CalendarCell[] = []
  const byKey = new Map<string, CalendarCell>()
  weeks.forEach((w, col) => {
    for (const day of w.days) {
      const row = weekdayOf(day.date)
      const cell = { key: `${col}:${row}`, col, row, day }
      cells.push(cell)
      byKey.set(cell.key, cell)
    }
  })
  return { cells, byKey }
}

/** Cell geometry of the drawn calendar (SVG user units). */
export const CALENDAR_CELL = 10
export const CALENDAR_GAP = 3
export const CALENDAR_STEP = CALENDAR_CELL + CALENDAR_GAP
/** Height of the month-label row above the cells. */
export const CALENDAR_LABEL_H = 16

/**
 * One SVG path per contribution level (0–4) instead of one <rect> per day:
 * each cell is a small square sub-path. Drawn with a stroke of the fill
 * colour and round joins (see ContributionGraph), a 7-unit square plus a
 * 1.5-unit stroke paints a 10-unit cell with rounded corners, so the
 * markup stays ~20 characters per day.
 */
export function calendarPaths(weeks: readonly ContributionWeek[]): string[] {
  const out = ['', '', '', '', '']
  const inset = 1.5
  const side = CALENDAR_CELL - inset * 2
  weeks.forEach((w, col) => {
    for (const day of w.days) {
      const x = col * CALENDAR_STEP + inset
      const y = CALENDAR_LABEL_H + weekdayOf(day.date) * CALENDAR_STEP + inset
      const level = day.level >= 0 && day.level <= 4 ? day.level : 0
      out[level] += `M${x} ${y}h${side}v${side}h-${side}z`
    }
  })
  return out
}

/**
 * The calendar as a page ships it in its props: the first day, the total and
 * one count per consecutive day. About 1 KB, against ~18 KB for the day
 * objects; levels are recomputed from the counts (expandCalendar).
 */
export type CompactCalendar = { available: true; total: number; start: string; counts: number[] }

/** What the graph accepts: the compact calendar, the API payload (weeks), or "unavailable". */
export type CalendarInput = CompactCalendar | GhContributions

/** Weeks → CompactCalendar (missing days between the first and last count as 0); null when there is nothing to draw. */
export function compactCalendar(data: CalendarInput | null | undefined): CompactCalendar | null {
  if (!data || data.available === false) return null
  if ('counts' in data) return Array.isArray(data.counts) && data.counts.length && DATE_RE.test(data.start) ? data : null
  const days = (data.weeks || []).flatMap((w) => (Array.isArray(w?.days) ? w.days : []))
  const valid = days.filter((d) => typeof d?.date === 'string' && DATE_RE.test(d.date)).sort((a, b) => (a.date < b.date ? -1 : 1))
  if (!valid.length) return null
  const first = dayStamp(valid[0].date)
  const last = dayStamp(valid[valid.length - 1].date)
  const counts = new Array<number>(Math.round((last - first) / DAY_MS) + 1).fill(0)
  for (const d of valid) {
    const n = Number(d.count)
    counts[Math.round((dayStamp(d.date) - first) / DAY_MS)] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  const total = typeof data.total === 'number' && Number.isFinite(data.total) ? data.total : counts.reduce((a, b) => a + b, 0)
  return { available: true, total, start: valid[0].date, counts }
}

const isoDay = (stamp: number) => new Date(stamp).toISOString().slice(0, 10)

/** CompactCalendar → Sunday-first weeks with quartile levels (the same weeks buildCalendar makes). */
export function expandCalendar(c: CompactCalendar): ContributionWeek[] {
  const start = dayStamp(c.start)
  if (!Number.isFinite(start)) return []
  const days = c.counts.map((count, i) => ({ date: isoDay(start + i * DAY_MS), count }))
  return buildCalendar(days, c.total, Number.MAX_SAFE_INTEGER).weeks
}

/** Further facts for the screen-reader summary: the busiest month and the longest run of active days. */
export function calendarHighlights(weeks: readonly ContributionWeek[]): {
  bestMonth: { month: string; count: number } | null
  longestStreak: number
} {
  const byMonth = new Map<string, number>()
  let longestStreak = 0
  let run = 0
  for (const d of weeks.flatMap((w) => w.days)) {
    const month = d.date.slice(0, 7)
    byMonth.set(month, (byMonth.get(month) || 0) + d.count)
    run = d.count > 0 ? run + 1 : 0
    longestStreak = Math.max(longestStreak, run)
  }
  let bestMonth: { month: string; count: number } | null = null
  for (const [month, count] of Array.from(byMonth)) {
    if (count > 0 && (!bestMonth || count > bestMonth.count)) bestMonth = { month, count }
  }
  return { bestMonth, longestStreak }
}

/** 'October 2026' for '2026-10' ('2026年10月'). */
export function formatMonth(month: string, w: GithubWords = GITHUB_EN): string {
  const [y, m] = month.split('-').map(Number)
  return y && m >= 1 && m <= 12 ? fill(w.monthYear, { month: w.monthsLong[m - 1], m, y }) : month
}

// ── Language share (components/GitHub/LanguageStack) ─────────────────────────

export type LanguageSlice = { name: string; pct: number; other?: true }

/**
 * The top `top` languages by bytes plus one "Other" slice for the rest, as
 * percentages that add up to 100 (rounded to one decimal, the remainder on
 * the largest slice). Empty when there is no code.
 */
export function languageStack(data: Pick<GhLanguages, 'total' | 'breakdown'> | null | undefined, top = 5): LanguageSlice[] {
  const entries = Object.entries(data?.breakdown || {})
    .map(([name, bytes]) => [name, Number(bytes)] as const)
    .filter(([, bytes]) => Number.isFinite(bytes) && bytes > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const total = entries.reduce((n, [, b]) => n + b, 0)
  if (!total) return []
  const head = entries.slice(0, top)
  const rest = entries.slice(top).reduce((n, [, b]) => n + b, 0)
  const round = (bytes: number) => Math.round((bytes / total) * 1000) / 10
  const slices: LanguageSlice[] = head.map(([name, bytes]) => ({ name, pct: round(bytes) }))
  if (rest > 0) slices.push({ name: 'Other', pct: round(rest), other: true })
  const drift = Math.round((100 - slices.reduce((n, s) => n + s.pct, 0)) * 10) / 10
  if (drift && slices.length) slices[0] = { ...slices[0], pct: Math.round((slices[0].pct + drift) * 10) / 10 }
  return slices
}

/** The language slice of the page props: only what LanguageStack draws. */
export type GhLanguageStack = { available: boolean; slices: LanguageSlice[]; count: number }

export function languageStackProp(data: GhLanguages | GhLanguageStack | null | undefined, top = 5): GhLanguageStack | null {
  if (!data) return null
  if ('slices' in data) return data
  if (data.available === false) return { available: false, slices: [], count: 0 }
  return { available: true, slices: languageStack(data, top), count: Object.keys(data.breakdown || {}).length }
}

// ── Page props (what the home page ships in __NEXT_DATA__) ───────────────────

/** The fields a repository card renders. */
export type GhRepoCard = Pick<GhRepo, 'id' | 'name' | 'html_url' | 'description' | 'stargazers_count' | 'forks_count' | 'language' | 'pushed_at'> & {
  blurb?: string
  featured?: boolean
}

export type GhRepoCards = { repos: GhRepoCard[]; available: boolean; asOf?: number }

/**
 * The GitHub data the home page's widgets render, trimmed to the rendered
 * fields: the pinned repositories only (with card fields), the language
 * stack instead of every language's byte count, and the calendar as one
 * count per day. A part is null when it was not ready within the server
 * budget (that widget then fetches the full API payload itself).
 */
export type GithubPageData = {
  stats: GhStats | null
  repos: GhRepoCards | null
  languages: GhLanguageStack | null
  events: GhEventsPayload | null
  calendar: CompactCalendar | { available: false } | null
}

/** Pinned repositories on the home page. */
export const HOME_REPO_LIMIT = 3

export function repoCard(r: GhRepo | GhRepoCard): GhRepoCard {
  const card: GhRepoCard = {
    id: r.id,
    name: r.name,
    html_url: r.html_url,
    description: r.description ?? null,
    stargazers_count: r.stargazers_count,
    forks_count: r.forks_count,
    language: r.language ?? null,
    pushed_at: r.pushed_at || ('updated_at' in r ? r.updated_at : '') || '',
  }
  if (r.blurb) card.blurb = r.blurb
  if (r.featured) card.featured = true
  return card
}

/** GithubSummary → the trimmed page props (JSON-serialisable: no undefined anywhere). */
export function githubPageData(s: GithubSummary | null | undefined, opts: { repos?: number } = {}): GithubPageData | null {
  if (!s) return null
  const limit = opts.repos ?? HOME_REPO_LIMIT
  const calendar = s.contributions ? (s.contributions.available === false ? { available: false as const } : compactCalendar(s.contributions) ?? { available: false as const }) : null
  return {
    stats: s.stats,
    repos: s.topRepos
      ? { repos: s.topRepos.repos.slice(0, limit).map(repoCard), available: s.topRepos.available, ...(typeof s.topRepos.asOf === 'number' ? { asOf: s.topRepos.asOf } : {}) }
      : null,
    languages: languageStackProp(s.languages),
    events: s.events,
    calendar,
  }
}
