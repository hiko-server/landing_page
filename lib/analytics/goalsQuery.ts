import { getAnalyticsDb } from './db'
import { maintainEvents, RAW_EVENTS_DAYS, SEARCH_EVENTS_DAYS } from './events'
import { RAW_HITS_DAYS } from './ingest'
import { filterSql, visitorDaySql, type FilterSql } from './explore'
import { dayMinus, isPlausibleHost, utcDay, type AnalyticsRange, type Kpi } from './shared'
import {
  DEFAULT_EXPLORE_QUERY,
  previousSpan,
  rawWindowStart,
  resolvePeriod,
  spanDays,
  type ExploreQuery,
} from './exploreShared'
import {
  GOAL_TABLE_ORDER,
  NO_REFERRER,
  PATH_GOALS,
  isGoalName,
  type ConversionPath,
  type ConversionPaths,
  type EmptySearchRow,
  type GoalName,
  type GoalPropRow,
  type GoalRow,
  type GoalsFunnel,
  type GoalsReport,
} from './eventsShared'

/**
 * The admin's Goals report (GET /api/admin/goals): goal events per period,
 * a Source → CV → Download conversion, the paths that led to a goal and the
 * searches that found nothing — for any explore view (period, comparison,
 * filters: lib/analytics/exploreShared).
 *
 * Counting — every unique count is in VISITOR-DAYS: the visitor hash
 * changes every UTC day by design, so a person who returns on a second day
 * counts twice; within one day the hash is the same for page views and
 * goal events, which is what links the steps of a conversion.
 *
 *   Goals       Without filters: finished days from events_daily /
 *               event_props_daily, days after meta.events_rolled_through
 *               from the raw events. A goal's conversion rate = its
 *               visitor-days ÷ the site's visitor-days in the period (page
 *               views, lib/analytics/query rules). Periods are compared only
 *               when goal tracking had started by the beginning of the
 *               previous period (meta.events_since).
 *               With filters: raw rows only (the period clipped to the last
 *               35 days, like the page views): the events of the visitor-days
 *               that viewed at least one page matching the filters, ÷ those
 *               visitor-days. A goal reached without any page view that day
 *               (a direct link to /cv.pdf) matches no filter.
 *   Conversion  raw rows only (hits and events are kept 35 days with their
 *               visitor hash; rollups have none), so the window is the
 *               period clipped to the last 35 days. Per visitor-day:
 *                 1. arrived — any page view (All) or a page view whose
 *                    referrer host is the chosen source; t1 = the first;
 *                 2. viewed the CV — a page view of /cv or /cv/zh at or
 *                    after t1; t2 = the first such view;
 *                 3. downloaded it — a cv_download event at or after t2.
 *               Downloads with no page view that day (a direct link to
 *               /cv.pdf from another site) are reported apart. Filters keep
 *               the visitor-days with a matching page view.
 *   Paths       raw rows only, same window: for each visitor-day that
 *               reached the goal, the referrer of its first page view and
 *               the pages it viewed up to the first time it reached the
 *               goal, in order (repeats merged, a long path shortened to its
 *               first and last two pages); the most common paths, counted
 *               in visitor-days. Only aggregates leave this module.
 *   Searches    search_empty per normalised text: visitor-days, events, the
 *               last day seen; never more than SEARCH_EVENTS_DAYS back.
 */

const TOP_PROPS = 10
const TOP_SOURCES = 8
const TOP_SEARCHES = 50
const TOP_PATHS = 10
/** Pages kept at each end of a long conversion path. */
const PATH_EDGE = 2
/** Upper bound of page views read for the paths (a bad day cannot exhaust memory). */
const PATH_ROW_CAP = 200_000
/** Raw rows usable by the conversion: both hits and events must still be there. */
export const FUNNEL_MAX_DAYS = Math.min(RAW_HITS_DAYS, RAW_EVENTS_DAYS)
const CV_PATHS = ['/cv', '/cv/zh']

type Db = ReturnType<typeof getAnalyticsDb>
type Span = { from: string; to: string }
type Params = Record<string, string | number | null>

function metaValue(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

/** Split [from, to] into the rolled-up part and the part still read from raw rows. */
function split(span: Span, rolled: string | null): { rolled: Span | null; raw: Span | null } {
  if (span.from > span.to) return { rolled: null, raw: null }
  if (!rolled || rolled < span.from) return { rolled: null, raw: span }
  if (rolled >= span.to) return { rolled: span, raw: null }
  return { rolled: { from: span.from, to: rolled }, raw: { from: dayMinus(rolled, -1), to: span.to } }
}

const days = (s: Span) => spanDays(s)

/** The site's visitor-days in `span` (the sum of each day's unique page-view visitors). */
export function siteVisitorDays(db: Db, span: Span): number {
  const parts = split(span, metaValue(db, 'rolled_through'))
  let n = 0
  if (parts.rolled) {
    n += (
      db.prepare("SELECT coalesce(sum(visitors), 0) AS n FROM dims_daily WHERE kind = 'site' AND day BETWEEN ? AND ?").get(parts.rolled.from, parts.rolled.to) as {
        n: number
      }
    ).n
  }
  if (parts.raw) {
    n += (
      db
        .prepare('SELECT coalesce(sum(v), 0) AS n FROM (SELECT count(DISTINCT visitor) AS v FROM hits WHERE day BETWEEN ? AND ? GROUP BY day)')
        .get(parts.raw.from, parts.raw.to) as { n: number }
    ).n
  }
  return n
}

/** Visitor-days with a page view matching the filters in `span` (raw rows). */
function matchingVisitorDays(db: Db, span: Span, f: FilterSql): number {
  if (span.from > span.to) return 0
  return (
    db
      .prepare(`SELECT count(*) AS n FROM (SELECT DISTINCT h.day, h.visitor FROM hits h WHERE h.day BETWEEN @from AND @to AND ${f.where})`)
      .get({ ...f.params, from: span.from, to: span.to } as Params) as { n: number }
  ).n
}

type Totals = { events: number; visitors: number }

function addTotals(out: Map<string, Totals>, rows: Array<{ name: string; events: number; visitors: number }>) {
  for (const r of rows) {
    const cur = out.get(r.name) || { events: 0, visitors: 0 }
    cur.events += r.events
    cur.visitors += r.visitors
    out.set(r.name, cur)
  }
}

/** Events and visitor-days per goal name in `span` (all visitors). */
function goalTotals(db: Db, span: Span, rolled: string | null): Map<string, Totals> {
  const out = new Map<string, Totals>()
  const parts = split(span, rolled)
  if (parts.rolled) {
    addTotals(
      out,
      db
        .prepare('SELECT name, sum(events) AS events, sum(visitors) AS visitors FROM events_daily WHERE day BETWEEN ? AND ? GROUP BY name')
        .all(parts.rolled.from, parts.rolled.to) as Array<{ name: string; events: number; visitors: number }>,
    )
  }
  if (parts.raw) {
    addTotals(
      out,
      db
        .prepare(
          `SELECT name, count(*) AS events, count(DISTINCT visitor) AS visitors
           FROM events WHERE day BETWEEN ? AND ? GROUP BY day, name`,
        )
        .all(parts.raw.from, parts.raw.to) as Array<{ name: string; events: number; visitors: number }>,
    )
  }
  return out
}

/** Events and visitor-days per goal name in `span`, of the visitor-days matching the filters (raw rows). */
function rawGoalTotals(db: Db, span: Span, vd: FilterSql): Map<string, Totals> {
  const out = new Map<string, Totals>()
  if (span.from > span.to) return out
  addTotals(
    out,
    db
      .prepare(
        `SELECT e.name AS name, count(*) AS events, count(DISTINCT e.day || ':' || e.visitor) AS visitors
         FROM events e WHERE e.day BETWEEN @from AND @to AND ${vd.where} GROUP BY e.name`,
      )
      .all({ ...vd.params, from: span.from, to: span.to } as Params) as Array<{ name: string; events: number; visitors: number }>,
  )
  return out
}

type PropTotals = { name: string; prop: string; events: number; visitors: number; last: string }

function addProps(acc: Map<string, PropTotals>, rows: PropTotals[]) {
  for (const r of rows) {
    const k = `${r.name}\u0000${r.prop}`
    const cur = acc.get(k)
    if (!cur) acc.set(k, { ...r })
    else {
      cur.events += r.events
      cur.visitors += r.visitors
      if (r.last > cur.last) cur.last = r.last
    }
  }
}

const sortProps = (acc: Map<string, PropTotals>) =>
  Array.from(acc.values()).sort((a, b) => b.visitors - a.visitors || b.events - a.events || a.prop.localeCompare(b.prop))

/** Events, visitor-days and the last day seen per goal × property in `span` (optionally one goal only). */
function propTotals(db: Db, span: Span, rolled: string | null, only?: GoalName): PropTotals[] {
  const acc = new Map<string, PropTotals>()
  const filter = only ? 'AND name = ?' : ''
  const args = (s: Span) => (only ? [s.from, s.to, only] : [s.from, s.to])
  const parts = split(span, rolled)
  if (parts.rolled) {
    addProps(
      acc,
      db
        .prepare(
          `SELECT name, prop, sum(events) AS events, sum(visitors) AS visitors, max(day) AS last
           FROM event_props_daily WHERE day BETWEEN ? AND ? ${filter} GROUP BY name, prop`,
        )
        .all(...args(parts.rolled)) as PropTotals[],
    )
  }
  if (parts.raw) {
    addProps(
      acc,
      db
        .prepare(
          `SELECT name, prop, count(*) AS events, count(DISTINCT visitor) AS visitors, day AS last
           FROM events WHERE day BETWEEN ? AND ? ${filter} GROUP BY day, name, prop`,
        )
        .all(...args(parts.raw)) as PropTotals[],
    )
  }
  return sortProps(acc)
}

/** propTotals over raw rows of the visitor-days matching the filters. */
function rawPropTotals(db: Db, span: Span, vd: FilterSql, only?: GoalName): PropTotals[] {
  if (span.from > span.to) return []
  const acc = new Map<string, PropTotals>()
  addProps(
    acc,
    db
      .prepare(
        `SELECT e.name AS name, e.prop AS prop, count(*) AS events, count(DISTINCT e.visitor) AS visitors, e.day AS last
         FROM events e WHERE e.day BETWEEN @from AND @to ${only ? 'AND e.name = @only' : ''} AND ${vd.where}
         GROUP BY e.day, e.name, e.prop`,
      )
      .all({ ...vd.params, from: span.from, to: span.to, ...(only ? { only } : {}) } as Params) as PropTotals[],
  )
  return sortProps(acc)
}

function kpi(value: number, previous: number, comparable: boolean): Kpi {
  return { value, previous, delta: comparable && previous > 0 ? (value - previous) / previous : null }
}

/** Top referrer hosts in the raw window, by visitor-days (the conversion's source picker); with filters, of the matching visitor-days. */
function funnelSources(db: Db, span: Span, filters: ExploreQuery['filters'] = []): Array<{ key: string; visitors: number }> {
  const f = filterSql(filters, 'm')
  const where = filters.length ? `AND EXISTS (SELECT 1 FROM hits m WHERE m.day = s.day AND m.visitor = s.visitor AND ${f.where})` : ''
  const rows = db
    .prepare(
      `SELECT ref_host AS key, count(*) AS visitors FROM (
         SELECT DISTINCT s.day, s.visitor, s.ref_host FROM hits s WHERE s.day BETWEEN @from AND @to AND s.ref_host IS NOT NULL ${where})
       GROUP BY ref_host ORDER BY visitors DESC, key ASC`,
    )
    .all({ ...f.params, from: span.from, to: span.to } as Params) as Array<{ key: string; visitors: number }>
  return rows.filter((r) => isPlausibleHost(r.key)).slice(0, TOP_SOURCES)
}

/**
 * The three conversion steps for `source` (null = every visitor) over raw
 * rows in `span`; with filters, only the visitor-days that viewed a page
 * matching them.
 */
export function conversionSteps(
  db: Db,
  span: Span,
  source: string | null,
  filters: ExploreQuery['filters'] = [],
): { arrived: number; viewedCv: number; downloaded: number; direct: number } {
  const f = filterSql(filters, 'm')
  const restrict = filters.length ? `AND EXISTS (SELECT 1 FROM hits m WHERE m.day = h0.day AND m.visitor = h0.visitor AND ${f.where})` : ''
  const row = db
    .prepare(
      `WITH src AS (
         SELECT h0.day, h0.visitor, min(h0.ts) AS t FROM hits h0
         WHERE h0.day BETWEEN @from AND @to AND (@source IS NULL OR h0.ref_host = @source) ${restrict}
         GROUP BY h0.day, h0.visitor),
       cvh AS (
         SELECT day, visitor, ts FROM hits WHERE day BETWEEN @from AND @to AND path IN (${CV_PATHS.map((p) => `'${p}'`).join(', ')})),
       cv AS (
         SELECT s.day, s.visitor, min(c.ts) AS t FROM src s
         JOIN cvh c ON c.day = s.day AND c.visitor = s.visitor AND c.ts >= s.t
         GROUP BY s.day, s.visitor),
       dl AS (
         SELECT DISTINCT v.day, v.visitor FROM cv v
         JOIN events e ON e.day = v.day AND e.visitor = v.visitor AND e.name = 'cv_download' AND e.ts >= v.t),
       direct AS (
         SELECT DISTINCT e.day, e.visitor FROM events e
         WHERE e.day BETWEEN @from AND @to AND e.name = 'cv_download'
           AND NOT EXISTS (SELECT 1 FROM hits h WHERE h.day = e.day AND h.visitor = e.visitor))
       SELECT (SELECT count(*) FROM src) AS arrived, (SELECT count(*) FROM cv) AS viewedCv,
              (SELECT count(*) FROM dl) AS downloaded, ${filters.length ? '0' : '(SELECT count(*) FROM direct)'} AS direct`,
    )
    .get({ ...f.params, from: span.from, to: span.to, source } as Params) as { arrived: number; viewedCv: number; downloaded: number; direct: number }
  return row
}

/** Shorten a page sequence to its first and last PATH_EDGE pages around '…'. */
export function shortenPath(pages: string[]): string[] {
  if (pages.length <= PATH_EDGE * 2 + 1) return pages
  return [...pages.slice(0, PATH_EDGE), '…', ...pages.slice(-PATH_EDGE)]
}

/**
 * How visitor-days reached `goal` in `span` (raw rows; with filters, only
 * the visitor-days that viewed a matching page): the first page view's
 * referrer and the pages viewed up to the first time the goal was reached.
 */
export function conversionPaths(db: Db, span: Span, goal: GoalName, filters: ExploreQuery['filters'] = []): ConversionPaths {
  const base: ConversionPaths = { goal, from: span.from, to: span.to, days: days(span), total: 0, paths: [], other: 0, noPageView: 0 }
  if (span.from > span.to) return base
  const vd = visitorDaySql(filters, 'e')
  const params = { ...vd.params, from: span.from, to: span.to, goal } as Params
  const conv = `SELECT e.day, e.visitor, min(e.ts) AS t FROM events e
      WHERE e.name = @goal AND e.day BETWEEN @from AND @to AND ${vd.where} GROUP BY e.day, e.visitor`
  base.total = (db.prepare(`SELECT count(*) AS n FROM (${conv})`).get(params) as { n: number }).n
  if (!base.total) return base
  const rows = db
    .prepare(
      `WITH conv AS (${conv})
       SELECT c.day AS day, c.visitor AS visitor, h.path AS path, h.ref_host AS ref
       FROM conv c JOIN hits h ON h.day = c.day AND h.visitor = c.visitor AND h.ts <= c.t
       ORDER BY c.day, c.visitor, h.ts LIMIT ${PATH_ROW_CAP}`,
    )
    .all(params) as Array<{ day: string; visitor: string; path: string; ref: string | null }>

  const counts = new Map<string, ConversionPath>()
  let withViews = 0
  let i = 0
  while (i < rows.length) {
    const { day, visitor } = rows[i]
    const source = rows[i].ref && isPlausibleHost(rows[i].ref) ? (rows[i].ref as string) : NO_REFERRER
    const pages: string[] = []
    for (; i < rows.length && rows[i].day === day && rows[i].visitor === visitor; i++) {
      if (pages[pages.length - 1] !== rows[i].path) pages.push(rows[i].path)
    }
    withViews++
    const shown = shortenPath(pages)
    const key = `${source}\u0000${shown.join('\u0000')}`
    const cur = counts.get(key)
    if (cur) cur.visitors++
    else counts.set(key, { source, pages: shown, visitors: 1 })
  }
  const sorted = Array.from(counts.values()).sort(
    (a, b) => b.visitors - a.visitors || a.pages.length - b.pages.length || a.source.localeCompare(b.source) || a.pages.join().localeCompare(b.pages.join()),
  )
  base.paths = sorted.slice(0, TOP_PATHS)
  base.other = sorted.slice(TOP_PATHS).reduce((n, p) => n + p.visitors, 0)
  base.noPageView = Math.max(0, base.total - withViews)
  return base
}

/** Normalise the requested source: a plausible host, or null for every visitor. */
export function parseSource(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const host = raw.trim().toLowerCase()
  return isPlausibleHost(host) ? host : null
}

/** The goal of the conversion paths (cv_download unless another path goal is asked for). */
export function parsePathGoal(raw: unknown): GoalName {
  return isGoalName(raw) && PATH_GOALS.includes(raw) ? raw : 'cv_download'
}

export type GoalsOptions = { source?: unknown; goal?: unknown; now?: number; limit?: number }

/** The Goals report of an explore view (see the module comment). */
export function getGoalsExplore(query: ExploreQuery, opts: GoalsOptions = {}): GoalsReport {
  const now = opts.now ?? Date.now()
  const limit = Math.max(1, Math.min(1000, opts.limit ?? TOP_PROPS))
  // Buffered events first, and the daily rollup / retention if it is due.
  maintainEvents(now)
  const db = getAnalyticsDb()
  const today = utcDay(now)
  const period = resolvePeriod(query, today)
  const filters = query.filters
  const filtered = filters.length > 0
  const rawFrom = rawWindowStart(today)
  const rolled = metaValue(db, 'events_rolled_through')
  const since = metaValue(db, 'events_since')

  const span: Span = filtered ? { from: period.from > rawFrom ? period.from : rawFrom, to: period.to } : period
  const prev = previousSpan(span.from > span.to ? period : span)
  const f = filterSql(filters, 'h')
  const vd = visitorDaySql(filters, 'e')
  let comparable = since !== null && since <= prev.from
  if (filtered) {
    const oldest = (db.prepare('SELECT min(day) AS d FROM hits').get() as { d: string | null }).d
    comparable = comparable && span.from <= span.to && prev.from >= rawFrom && oldest !== null && oldest <= prev.from
  }

  const siteVisitors = filtered ? matchingVisitorDays(db, span, f) : siteVisitorDays(db, span)
  const current = filtered ? rawGoalTotals(db, span, vd) : goalTotals(db, span, rolled)
  const before = filtered ? (comparable ? rawGoalTotals(db, prev, vd) : new Map<string, Totals>()) : goalTotals(db, prev, rolled)
  const props = filtered ? rawPropTotals(db, span, vd) : propTotals(db, span, rolled)

  const goals: GoalRow[] = GOAL_TABLE_ORDER.map((name) => {
    const cur = current.get(name) || { events: 0, visitors: 0 }
    const old = before.get(name) || { events: 0, visitors: 0 }
    const top: GoalPropRow[] = props
      .filter((p) => p.name === name && p.prop !== '')
      .slice(0, limit)
      .map((p) => ({ key: p.prop, events: p.events, visitors: p.visitors }))
    return {
      name,
      events: cur.events,
      visitors: kpi(cur.visitors, old.visitors, comparable),
      rate: siteVisitors > 0 ? cur.visitors / siteVisitors : null,
      props: top,
    }
  })

  // Conversion and paths: raw rows only.
  const funnelStart = dayMinus(today, FUNNEL_MAX_DAYS - 1)
  const funnelSpan: Span = { from: span.from > funnelStart ? span.from : funnelStart, to: span.to }
  const funnelLive = funnelSpan.from <= funnelSpan.to
  const sources = funnelLive ? funnelSources(db, funnelSpan, filters) : []
  const source = parseSource(opts.source)
  const steps = funnelLive ? conversionSteps(db, funnelSpan, source, filters) : { arrived: 0, viewedCv: 0, downloaded: 0, direct: 0 }
  const funnel: GoalsFunnel = {
    from: funnelSpan.from,
    to: funnelSpan.to,
    days: Math.max(0, days(funnelSpan)),
    source,
    sources,
    steps: [
      { label: source ? `Arrived from ${source}` : 'Visited the site', visitors: steps.arrived },
      { label: 'Viewed the CV', visitors: steps.viewedCv },
      { label: 'Downloaded the CV', visitors: steps.downloaded },
    ],
    directDownloads: steps.direct,
  }

  // Searches with no results: never older than SEARCH_EVENTS_DAYS.
  const searchStart = dayMinus(today, SEARCH_EVENTS_DAYS - 1)
  const searchSpan: Span = { from: span.from > searchStart ? span.from : searchStart, to: span.to }
  const searchRows = filtered ? rawPropTotals(db, searchSpan, vd, 'search_empty') : propTotals(db, searchSpan, rolled, 'search_empty')
  const rows: EmptySearchRow[] = searchRows
    .slice(0, Math.max(TOP_SEARCHES, limit))
    .map((p) => ({ query: p.prop, visitors: p.visitors, events: p.events, lastSeen: p.last }))

  return {
    range: query.period,
    from: span.from,
    to: span.to,
    siteVisitors,
    since,
    comparable,
    goals,
    funnel,
    searches: {
      from: searchSpan.from,
      to: searchSpan.to,
      days: Math.max(0, days(searchSpan)),
      rows,
    },
    paths: conversionPaths(db, funnelSpan, parsePathGoal(opts.goal), filters),
    mode: filtered ? 'raw' : 'rollup',
    window: { from: span.from, to: span.to, days: Math.max(0, days(span)), clipped: filtered && period.from < span.from },
    generatedAt: now,
  }
}

/** The Goals report of the last 7 days / 30 days / 12 months, all visitors (the panel's earlier API). */
export function getGoalsReport(range: AnalyticsRange, sourceRaw: unknown = null, now: number = Date.now()): GoalsReport {
  return getGoalsExplore({ ...DEFAULT_EXPLORE_QUERY, period: range }, { source: sourceRaw, now })
}
