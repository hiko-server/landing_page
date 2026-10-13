/**
 * Pure, client-safe helpers and payload types for the GitHub widgets
 * (components/GitHub/*) and their server loaders (lib/githubData.ts).
 *
 * No Node or DB imports: the widgets import this module in the browser, the
 * loaders import it on the server, and the unit tests import it directly.
 */

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

export type StatTile = { label: string; value: number }

/** The stat tiles worth showing, in order. Vanity numbers only when the owner opted in. */
export function statTiles(s: GhStats): StatTile[] {
  const tiles: StatTile[] = [{ label: 'Public repos', value: s.public_repos }]
  if (typeof s.contributions === 'number') tiles.push({ label: 'Contributions (last year)', value: s.contributions })
  if (typeof s.languages === 'number') tiles.push({ label: 'Languages', value: s.languages })
  if (s.showVanity) {
    tiles.push({ label: 'Followers', value: s.followers })
    tiles.push({ label: 'Total stars', value: s.total_stars })
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

/** Verb phrase without the repo, e.g. "Pushed 3 commits to", "Opened PR #12 in". */
export function eventAction(e: GhEvent): string {
  const p = e.payload || {}
  switch (e.type) {
    case 'PushEvent': {
      const n = typeof p.size === 'number' && p.size > 0 ? p.size : 0
      return n ? `Pushed ${n} commit${n > 1 ? 's' : ''} to` : 'Pushed to'
    }
    case 'PullRequestEvent': {
      const num = typeof p.number === 'number' ? ` #${p.number}` : ''
      const verb = p.action === 'opened' ? 'Opened' : p.action === 'closed' ? 'Closed' : 'Updated'
      return `${verb} PR${num} in`
    }
    case 'IssuesEvent': {
      const n = p.issue?.number
      const num = typeof n === 'number' ? ` #${n}` : ''
      const verb = p.action === 'opened' ? 'Opened' : p.action === 'closed' ? 'Closed' : 'Updated'
      return `${verb} issue${num} in`
    }
    case 'CreateEvent':
      return p.ref_type === 'repository' ? 'Created repository' : `Created ${p.ref_type || 'ref'} in`
    case 'RepoUpdateEvent':
      return 'Updated'
    case 'WatchEvent':
      return 'Starred'
    case 'ForkEvent':
      return 'Forked'
    case 'ReleaseEvent':
      return 'Published a release in'
    default: {
      const words = String(e.type || '')
        .replace(/Event$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
      return words ? `${cap(words)} in` : 'Activity in'
    }
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "just now", "5m ago", "3h ago", "2d ago", or a short UTC date beyond 30
 * days. Pass the same `now` on the server and during hydration so the text
 * matches (see useRenderNow).
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d <= 30) return `${d}d ago`
  const date = new Date(t)
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
}

/** Timezone-independent absolute timestamp for a `title`: "Oct 12, 2026, 09:05 UTC". */
export function absoluteTime(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${hh}:${mm} UTC`
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function numbered(label: string, labels: string, nums: number[], count: number): string {
  const unique = Array.from(new Set(nums))
  if (unique.length && unique.length === count) {
    const shown = unique.slice(0, 2).map((n) => `#${n}`)
    const more = unique.length > 2 ? ` +${unique.length - 2}` : ''
    return `${unique.length === 1 ? label : labels} ${shown.join(', ')}${more}`
  }
  return plural(count, label, labels)
}

/** "PR #14, 1 branch, 1 comment" — what a group of events on one repo amounts to. */
export function summarizeGroup(events: readonly GhEvent[]): string {
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
  return order
    .map((key) => {
      const b = buckets.get(key) as Bucket
      switch (key) {
        case 'PushEvent':
          return b.sizesKnown ? plural(b.commits, 'commit', 'commits') : plural(b.count, 'push', 'pushes')
        case 'PullRequestEvent':
          return numbered('PR', 'PRs', b.nums, b.count)
        case 'IssuesEvent':
          return numbered('issue', 'issues', b.nums, b.count)
        case 'IssueCommentEvent':
        case 'CommitCommentEvent':
          return plural(b.count, 'comment', 'comments')
        case 'PullRequestReviewEvent':
          return plural(b.count, 'review', 'reviews')
        case 'PullRequestReviewCommentEvent':
          return plural(b.count, 'review comment', 'review comments')
        case 'branch':
          return plural(b.count, 'branch', 'branches')
        case 'tag':
          return plural(b.count, 'tag', 'tags')
        case 'ref':
          return plural(b.count, 'ref', 'refs')
        case 'created':
          return 'repository created'
        case 'deleted':
          return plural(b.count, 'deletion', 'deletions')
        case 'ReleaseEvent':
          return plural(b.count, 'release', 'releases')
        case 'WatchEvent':
          return 'starred'
        case 'ForkEvent':
          return 'forked'
        case 'RepoUpdateEvent':
          return 'updated'
        default:
          return plural(b.count, 'other event', 'other events')
      }
    })
    .join(', ')
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

/** 'Oct 3' (or 'Oct 3, 2026' with the year) for a 'YYYY-MM-DD' date. */
export function formatDay(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`
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
export function monthLabels(weeks: readonly ContributionWeek[], minGap = 3): Array<{ col: number; label: string }> {
  const raw: Array<{ col: number; label: string }> = []
  let prev = -1
  weeks.forEach((w, col) => {
    const first = w.days[0]?.date
    if (!first) return
    const month = Number(first.slice(5, 7)) - 1
    if (month !== prev) raw.push({ col, label: MONTHS[month] })
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

// ── Calendar grid (keyboard model of components/GitHub/ContributionGraph) ────

export const CALENDAR_ROWS = 7

export type CalendarCell = { key: string; col: number; row: number; day: ContributionDay }

/** Week columns × weekday rows, plus a "col:row" → cell index for keyboard moves. */
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

/**
 * The cell a navigation key moves to, or null to leave focus where it is:
 * arrows move by week / weekday (skipping days missing from a partial
 * week), Home / End go to the row's first / last day, and with Ctrl/⌘ to
 * the first / last day of the whole calendar.
 */
export function calendarMove(
  from: CalendarCell,
  key: string,
  ctrl: boolean,
  byKey: ReadonlyMap<string, CalendarCell>,
  cols: number,
  cells: readonly CalendarCell[],
): string | null {
  const at = (c: number, r: number) => byKey.get(`${c}:${r}`)
  const scan = (dc: number, dr: number) => {
    let c = from.col + dc
    let r = from.row + dr
    while (c >= 0 && c < cols && r >= 0 && r < CALENDAR_ROWS) {
      const hit = at(c, r)
      if (hit) return hit.key
      c += dc
      r += dr
    }
    return null
  }
  switch (key) {
    case 'ArrowLeft':
      return scan(-1, 0)
    case 'ArrowRight':
      return scan(1, 0)
    case 'ArrowUp':
      return scan(0, -1)
    case 'ArrowDown':
      return scan(0, 1)
    case 'Home':
      if (ctrl) return cells[0]?.key ?? null
      for (let c = 0; c < cols; c++) if (at(c, from.row)) return `${c}:${from.row}`
      return null
    case 'End':
      if (ctrl) return cells[cells.length - 1]?.key ?? null
      for (let c = cols - 1; c >= 0; c--) if (at(c, from.row)) return `${c}:${from.row}`
      return null
    default:
      return null
  }
}
