/**
 * Server-only GitHub loaders shared by the /api/github/* routes and the
 * pages that render GitHub data into their HTML (`loadGithubSummary`).
 *
 *   - One `repos:<user>` cache entry (GET /users/:u/repos) feeds stats, top
 *     repos, languages, the activity fallback and the admin repo picker, so
 *     the list is fetched once per TTL however many widgets need it.
 *   - Every loader goes through lib/github `cachedGh` (TTL, in-flight
 *     sharing, stale-while-revalidate, stale-on-error) and never rejects:
 *     GitHub being down is data (`available: false`), not an exception.
 *   - The GitHub login comes from the public home document's socials; it is
 *     validated (lib/github isGithubLogin) before it is put into any URL.
 */

import type { HomeData } from './homeShape'
import { GhUnavailable, cachedGh, extractGithubUser, ghFetch, ghGraphql, isGithubLogin } from './github'
import { readPublicHome } from './home'
import { log } from './log'
import { safeFetch } from './security/safeFetch'
import {
  buildCalendar,
  featuredList,
  orderRepos,
  type GhContributions,
  type GhEvent,
  type GhEventsPayload,
  type GhLanguages,
  type GhRepo,
  type GhRepoChoice,
  type GhStats,
  type GhTopRepos,
  type GithubSummary,
} from '../components/Common/githubEvents'

export type {
  ContributionDay,
  ContributionLevel,
  ContributionWeek,
  GhContributions,
  GhEvent,
  GhEventsPayload,
  GhLanguages,
  GhRepo,
  GhRepoChoice,
  GhStats,
  GhTopRepos,
  GithubSummary,
} from '../components/Common/githubEvents'

const MIN = 60 * 1000
const GH_TTL = {
  repos: 10 * MIN,
  stats: 4 * 60 * MIN,
  languages: 6 * 60 * MIN,
  events: 5 * MIN,
  contributions: 60 * MIN,
} as const

const API = 'https://api.github.com'
const TOP_REPOS = 6
const LANGUAGE_REPOS = 30
const LANGUAGE_CONCURRENCY = 8
const MAX_REPO_PAGES = 3
const MAX_EVENTS = 30
/** Default server-side budget for loadGithubSummary (below the pages' 1.5 s race). */
const SUMMARY_BUDGET_MS = 1200

const glog = log.child({ module: 'githubData' })

type RepoRecord = GhRepo & { fork: boolean }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Run a GitHub loader, logging (then rethrowing) its failure so cachedGh can memo it. */
async function logged<T>(what: string, user: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    glog.warn('GitHub data unavailable', { what, user, err })
    throw err
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

export type GithubContext = { home: HomeData | null; user: string | null }

/** The public home document and the GitHub login it links (server-side; throws on a store failure). */
export function githubContext(): GithubContext {
  const home = readPublicHome()
  return { home, user: extractGithubUser(home?.socials?.github) }
}

// ── Repositories (shared) ────────────────────────────────────────────────────

function toRepo(r: Record<string, unknown>): RepoRecord {
  return {
    id: num(r.id),
    name: str(r.name),
    full_name: str(r.full_name),
    html_url: str(r.html_url),
    description: typeof r.description === 'string' ? r.description : null,
    stargazers_count: num(r.stargazers_count),
    forks_count: num(r.forks_count),
    language: typeof r.language === 'string' ? r.language : null,
    updated_at: str(r.updated_at),
    pushed_at: str(r.pushed_at) || str(r.updated_at),
    fork: r.fork === true,
  }
}

async function fetchRepos(user: string): Promise<RepoRecord[]> {
  const out: RepoRecord[] = []
  for (let page = 1; page <= MAX_REPO_PAGES; page++) {
    const res = await ghFetch(`${API}/users/${user}/repos?per_page=100&sort=updated&page=${page}`)
    if (!res.ok) {
      if (page === 1) throw new GhUnavailable(`repos ${res.status}`)
      break
    }
    const list = (await res.json()) as unknown
    if (!Array.isArray(list)) throw new GhUnavailable('repos: unexpected body')
    out.push(...list.filter((r) => r && typeof r === 'object').map((r) => toRepo(r as Record<string, unknown>)))
    if (list.length < 100) break
  }
  return out.filter((r) => r.name && r.full_name)
}

/** Every public repository of `user` (cached, shared); null when GitHub is unavailable. */
function loadRepos(user: string): Promise<RepoRecord[] | null> {
  return cachedGh<RepoRecord[] | null>(`repos:${user}`, GH_TTL.repos, null, () => logged('repos', user, () => fetchRepos(user)))
}

const ownWork = (repos: readonly RepoRecord[]) => repos.filter((r) => !r.fork && !r.name.startsWith('.'))

const publicRepo = ({ fork: _fork, ...repo }: RepoRecord & { featured?: true; blurb?: string }): GhRepo => {
  void _fork
  return repo
}

/** Featured repos first (home.openSource.featured), then by stars / recency, up to 6. */
export async function loadTopRepos(user: string, home: HomeData | null): Promise<GhTopRepos> {
  const repos = await loadRepos(user)
  if (!repos) return { repos: [], available: false }
  const featured = featuredList(home?.openSource?.featured)
  return { repos: orderRepos(repos, featured, TOP_REPOS).map(publicRepo), available: true, asOf: Date.now() }
}

/** All public non-fork repositories, most recently pushed first (admin featured-repo picker). */
export async function loadRepoChoices(user: string): Promise<{ repos: GhRepoChoice[]; available: boolean }> {
  const repos = await loadRepos(user)
  if (!repos) return { repos: [], available: false }
  const choices = ownWork(repos)
    .sort((a, b) => Date.parse(b.pushed_at || '') - Date.parse(a.pushed_at || '') || a.name.localeCompare(b.name))
    .map(({ name, description, language, stargazers_count, pushed_at }) => ({ name, description, language, stargazers_count, pushed_at }))
  return { repos: choices, available: true }
}

// ── Languages ────────────────────────────────────────────────────────────────

async function fetchLanguages(user: string): Promise<GhLanguages> {
  const repos = await loadRepos(user)
  if (!repos) throw new GhUnavailable('languages: repos unavailable')
  const chosen = ownWork(repos)
    .sort((a, b) => b.stargazers_count - a.stargazers_count || Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, LANGUAGE_REPOS)

  const fetchOne = async (fullName: string): Promise<Record<string, number> | null> => {
    try {
      const res = await ghFetch(`${API}/repos/${fullName.split('/').map(encodeURIComponent).join('/')}/languages`)
      return res.ok ? ((await res.json()) as Record<string, number>) : null
    } catch {
      return null // one broken repository must not sink the breakdown
    }
  }

  // Bounded concurrency: a few round-trips instead of 30 sequential calls,
  // while staying polite to the unauthenticated rate limit.
  const breakdown: Record<string, number> = {}
  let total = 0
  for (let i = 0; i < chosen.length; i += LANGUAGE_CONCURRENCY) {
    const batch = await Promise.all(chosen.slice(i, i + LANGUAGE_CONCURRENCY).map((r) => fetchOne(r.full_name)))
    for (const langs of batch) {
      if (!langs || typeof langs !== 'object') continue
      for (const [k, v] of Object.entries(langs)) {
        const n = num(v)
        breakdown[k] = (breakdown[k] || 0) + n
        total += n
      }
    }
  }
  return { total, breakdown, available: true }
}

export function loadLanguages(user: string): Promise<GhLanguages> {
  const unavailable: GhLanguages = { total: 0, breakdown: {}, available: false }
  return cachedGh(`languages:${user}`, GH_TTL.languages, unavailable, () => logged('languages', user, () => fetchLanguages(user)))
}

// ── Events ───────────────────────────────────────────────────────────────────

type RawEvent = {
  id?: unknown
  type?: unknown
  created_at?: unknown
  repo?: { name?: unknown }
  payload?: Record<string, any>
}

/** Ship only what the feed renders (no actor / full payload blobs). */
function slimEvent(e: RawEvent): GhEvent {
  const p = e.payload || {}
  const repo = str(e.repo?.name)
  const number = typeof p.number === 'number' ? p.number : p.pull_request?.number
  const size = Array.isArray(p.commits) ? p.commits.length : p.size
  const issue = p.issue?.number
  const payload: NonNullable<GhEvent['payload']> = {}
  if (typeof p.action === 'string') payload.action = p.action
  if (typeof number === 'number') payload.number = number
  if (typeof p.ref_type === 'string') payload.ref_type = p.ref_type
  if (typeof size === 'number') payload.size = size
  if (typeof issue === 'number') payload.issue = { number: issue }
  return {
    id: String(e.id ?? ''),
    type: str(e.type),
    created_at: str(e.created_at),
    ...(repo ? { repo: { name: repo } } : {}),
    payload,
  }
}

async function fetchEvents(user: string): Promise<GhEventsPayload> {
  const gh = await ghFetch(`${API}/users/${user}/events/public?per_page=${MAX_EVENTS}`)
  const body = gh.ok ? ((await gh.json()) as unknown) : []
  const list = Array.isArray(body) ? (body as RawEvent[]) : []
  if (list.length) return { events: list.slice(0, MAX_EVENTS).map(slimEvent), available: true }

  // GitHub's public events feed only goes back ~90 days. Without public
  // activity in that window, show the most recently pushed repositories so
  // the section still says something true about the account.
  const repos = await loadRepos(user)
  if (!repos) {
    if (!gh.ok) throw new GhUnavailable(`events ${gh.status} / repos unavailable`)
    return { events: [], available: true }
  }
  const events = ownWork(repos)
    .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
    .slice(0, 12)
    .map((r) => ({ id: `repo-${r.full_name}`, type: 'RepoUpdateEvent', created_at: r.pushed_at, repo: { name: r.full_name }, payload: {} }))
  return { events, available: true }
}

export async function loadEvents(user: string): Promise<GhEventsPayload> {
  const unavailable: GhEventsPayload = { events: [], available: false }
  const data = await cachedGh(`events:${user}`, GH_TTL.events, unavailable, () => logged('events', user, () => fetchEvents(user)))
  return data.available ? { ...data, asOf: Date.now() } : data
}

// ── Contribution calendar ────────────────────────────────────────────────────

const CALENDAR_QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`

type CalendarQuery = {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number
        weeks: Array<{ contributionDays: Array<{ date: string; contributionCount: number }> }>
      }
    }
  } | null
}

async function fetchContributions(user: string): Promise<GhContributions> {
  if (process.env.GITHUB_TOKEN) {
    try {
      const data = await ghGraphql<CalendarQuery>(CALENDAR_QUERY, { login: user })
      const cal = data.user?.contributionsCollection?.contributionCalendar
      if (!cal || !Array.isArray(cal.weeks)) throw new GhUnavailable('graphql: no calendar')
      const days = cal.weeks.flatMap((w) => (Array.isArray(w?.contributionDays) ? w.contributionDays : []))
      return buildCalendar(
        days.map((d) => ({ date: d.date, count: d.contributionCount })),
        cal.totalContributions,
      )
    } catch (err) {
      glog.warn('contribution calendar: GraphQL failed, using the public calendar', { user, err })
    }
  }
  // Public calendar (no token needed), fetched server-side so the CSP stays unchanged.
  const res = await safeFetch(`https://github-contributions-api.jogruber.de/v4/${user}?y=last`, {
    headers: { Accept: 'application/json', 'User-Agent': 'lucian-dev.com-site' },
    timeoutMs: 8000,
    maxBytes: 1_000_000,
  })
  if (res.status !== 200) throw new GhUnavailable(`public calendar ${res.status}`)
  const body = JSON.parse(res.body.toString('utf8')) as { total?: { lastYear?: unknown }; contributions?: unknown }
  const days = Array.isArray(body?.contributions) ? (body.contributions as Array<{ date: string; count: number }>) : []
  if (!days.length) throw new GhUnavailable('public calendar: no days')
  const total = typeof body.total?.lastYear === 'number' ? body.total.lastYear : undefined
  return buildCalendar(days, total)
}

export function loadContributions(user: string): Promise<GhContributions> {
  return cachedGh<GhContributions>(`contributions:${user}`, GH_TTL.contributions, { available: false }, () =>
    logged('contributions', user, () => fetchContributions(user)),
  )
}

// ── Stats ────────────────────────────────────────────────────────────────────

type StatsCore = Pick<GhStats, 'user' | 'public_repos' | 'followers' | 'total_stars' | 'available'>

async function fetchStatsCore(user: string): Promise<StatsCore> {
  const [res, repos] = await Promise.all([ghFetch(`${API}/users/${user}`), loadRepos(user)])
  if (!res.ok) throw new GhUnavailable(`user ${res.status}`)
  if (!repos) throw new GhUnavailable('stats: repos unavailable')
  const u = (await res.json()) as Record<string, unknown>
  return {
    user,
    public_repos: num(u.public_repos) || repos.length,
    followers: num(u.followers),
    total_stars: repos.reduce((sum, r) => sum + r.stargazers_count, 0),
    available: true,
  }
}

/**
 * Stats tiles: public repos, contributions (last year) and language count,
 * plus followers / stars only when the owner opted in. The cached core is
 * combined with the current home settings on every call, so toggling
 * `showVanityStats` applies at once.
 */
export async function loadStats(user: string, home: HomeData | null): Promise<GhStats> {
  const unavailable: StatsCore = { user, public_repos: 0, followers: 0, total_stars: 0, available: false }
  const [core, languages, contributions] = await Promise.all([
    cachedGh(`stats:${user}`, GH_TTL.stats, unavailable, () => logged('stats', user, () => fetchStatsCore(user))),
    loadLanguages(user),
    loadContributions(user),
  ])
  return {
    ...core,
    languages: languages.available ? Object.keys(languages.breakdown).length : null,
    contributions: contributions.available && typeof contributions.total === 'number' ? contributions.total : null,
    showVanity: home?.openSource?.showVanityStats === true,
  }
}

// ── No profile linked ────────────────────────────────────────────────────────

/** What every widget gets when the home document links no GitHub profile (nothing is broken). */
export function noProfileSummary(): GithubSummary {
  return {
    stats: { user: '', public_repos: 0, followers: 0, total_stars: 0, languages: null, contributions: null, showVanity: false, available: true },
    topRepos: { repos: [], available: true },
    languages: { total: 0, breakdown: {}, available: true },
    events: { events: [], available: true },
    contributions: { available: false },
  }
}

// ── Summary for server-rendered pages ────────────────────────────────────────

/**
 * Everything the GitHub widgets render, for getServerSideProps /
 * getStaticProps. Each part is raced against `budgetMs`: a part that is not
 * ready in time is `null` and that widget fetches it in the browser (the
 * load keeps running and warms the cache for the next render). `user`
 * defaults to the login linked from the public home document; with no
 * profile linked every widget gets its honest empty state.
 * Never throws: null when the store or the login cannot be read.
 */
export async function loadGithubSummary(user?: string, opts: { budgetMs?: number } = {}): Promise<GithubSummary | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    let ctx: GithubContext
    try {
      ctx = githubContext()
    } catch (err) {
      glog.warn('GitHub summary: home document unreadable', { err })
      if (user === undefined) return null
      ctx = { home: null, user: null }
    }
    const login = user ?? ctx.user
    if (!login) return user === undefined ? noProfileSummary() : null
    if (!isGithubLogin(login)) return null

    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), Math.max(0, opts.budgetMs ?? SUMMARY_BUDGET_MS))
    })
    const within = <T>(p: Promise<T>): Promise<T | null> => Promise.race([p, deadline])

    const [stats, topRepos, languages, events, contributions] = await Promise.all([
      within(loadStats(login, ctx.home)),
      within(loadTopRepos(login, ctx.home)),
      within(loadLanguages(login)),
      within(loadEvents(login)),
      within(loadContributions(login)),
    ])
    return { stats, topRepos, languages, events, contributions }
  } catch (err) {
    glog.warn('GitHub summary failed', { err })
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}
