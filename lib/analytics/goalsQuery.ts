import { getAnalyticsDb } from './db'
import { maintainEvents, RAW_EVENTS_DAYS, SEARCH_EVENTS_DAYS } from './events'
import { RAW_HITS_DAYS } from './ingest'
import { dayMinus, isPlausibleHost, utcDay, type AnalyticsRange, type Kpi } from './shared'
import {
  GOAL_TABLE_ORDER,
  type EmptySearchRow,
  type GoalName,
  type GoalPropRow,
  type GoalRow,
  type GoalsFunnel,
  type GoalsReport,
} from './eventsShared'

/**
 * The admin's Goals report (GET /api/admin/goals): goal events per period,
 * a Source → CV → Download conversion and the searches that found nothing.
 *
 * Counting — every unique count is in VISITOR-DAYS: the visitor hash
 * changes every UTC day by design, so a person who returns on a second day
 * counts twice; within one day the hash is the same for page views and
 * goal events, which is what links the steps of a conversion.
 *
 *   Goals       finished days from events_daily / event_props_daily, days
 *               after meta.events_rolled_through from the raw events. A
 *               goal's conversion rate = its visitor-days ÷ the site's
 *               visitor-days in the period (page views, lib/analytics/query
 *               rules). Periods are compared only when goal tracking had
 *               started by the beginning of the previous period
 *               (meta.events_since).
 *   Conversion  raw rows only (hits and events are kept 35 days with their
 *               visitor hash; rollups have none), so the window is the
 *               period clipped to the last 35 days. Per visitor-day:
 *                 1. arrived — any page view (All) or a page view whose
 *                    referrer host is the chosen source; t1 = the first;
 *                 2. viewed the CV — a page view of /cv or /cv/zh at or
 *                    after t1; t2 = the first such view;
 *                 3. downloaded it — a cv_download event at or after t2.
 *               Downloads with no page view that day (a direct link to
 *               /cv.pdf from another site) are reported apart.
 *   Searches    search_empty per normalised text: visitor-days, events, the
 *               last day seen; never more than SEARCH_EVENTS_DAYS back.
 */

const RANGE_DAYS: Record<AnalyticsRange, number> = { '7d': 7, '30d': 30, '12m': 365 }
const TOP_PROPS = 10
const TOP_SOURCES = 8
const TOP_SEARCHES = 50
/** Raw rows usable by the conversion: both hits and events must still be there. */
export const FUNNEL_MAX_DAYS = Math.min(RAW_HITS_DAYS, RAW_EVENTS_DAYS)
const CV_PATHS = ['/cv', '/cv/zh']

type Db = ReturnType<typeof getAnalyticsDb>
type Span = { from: string; to: string }

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

type Totals = { events: number; visitors: number }

/** Events and visitor-days per goal name in `span`. */
function goalTotals(db: Db, span: Span, rolled: string | null): Map<string, Totals> {
  const out = new Map<string, Totals>()
  const add = (rows: Array<{ name: string; events: number; visitors: number }>) => {
    for (const r of rows) {
      const cur = out.get(r.name) || { events: 0, visitors: 0 }
      cur.events += r.events
      cur.visitors += r.visitors
      out.set(r.name, cur)
    }
  }
  const parts = split(span, rolled)
  if (parts.rolled) {
    add(
      db
        .prepare('SELECT name, sum(events) AS events, sum(visitors) AS visitors FROM events_daily WHERE day BETWEEN ? AND ? GROUP BY name')
        .all(parts.rolled.from, parts.rolled.to) as Array<{ name: string; events: number; visitors: number }>,
    )
  }
  if (parts.raw) {
    add(
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

type PropTotals = { name: string; prop: string; events: number; visitors: number; last: string }

/** Events, visitor-days and the last day seen per goal × property in `span` (optionally one goal only). */
function propTotals(db: Db, span: Span, rolled: string | null, only?: GoalName): PropTotals[] {
  const acc = new Map<string, PropTotals>()
  const add = (rows: PropTotals[]) => {
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
  const filter = only ? 'AND name = ?' : ''
  const args = (s: Span) => (only ? [s.from, s.to, only] : [s.from, s.to])
  const parts = split(span, rolled)
  if (parts.rolled) {
    add(
      db
        .prepare(
          `SELECT name, prop, sum(events) AS events, sum(visitors) AS visitors, max(day) AS last
           FROM event_props_daily WHERE day BETWEEN ? AND ? ${filter} GROUP BY name, prop`,
        )
        .all(...args(parts.rolled)) as PropTotals[],
    )
  }
  if (parts.raw) {
    add(
      db
        .prepare(
          `SELECT name, prop, count(*) AS events, count(DISTINCT visitor) AS visitors, day AS last
           FROM events WHERE day BETWEEN ? AND ? ${filter} GROUP BY day, name, prop`,
        )
        .all(...args(parts.raw)) as PropTotals[],
    )
  }
  return Array.from(acc.values()).sort((a, b) => b.visitors - a.visitors || b.events - a.events || a.prop.localeCompare(b.prop))
}

function kpi(value: number, previous: number, comparable: boolean): Kpi {
  return { value, previous, delta: comparable && previous > 0 ? (value - previous) / previous : null }
}

/** Top referrer hosts in the raw window, by visitor-days (the conversion's source picker). */
function funnelSources(db: Db, span: Span): Array<{ key: string; visitors: number }> {
  const rows = db
    .prepare(
      `SELECT ref_host AS key, count(*) AS visitors FROM (
         SELECT DISTINCT day, visitor, ref_host FROM hits WHERE day BETWEEN ? AND ? AND ref_host IS NOT NULL)
       GROUP BY ref_host ORDER BY visitors DESC, key ASC`,
    )
    .all(span.from, span.to) as Array<{ key: string; visitors: number }>
  return rows.filter((r) => isPlausibleHost(r.key)).slice(0, TOP_SOURCES)
}

/** The three conversion steps for `source` (null = every visitor) over raw rows in `span`. */
export function conversionSteps(db: Db, span: Span, source: string | null): { arrived: number; viewedCv: number; downloaded: number; direct: number } {
  const row = db
    .prepare(
      `WITH src AS (
         SELECT day, visitor, min(ts) AS t FROM hits
         WHERE day BETWEEN @from AND @to AND (@source IS NULL OR ref_host = @source)
         GROUP BY day, visitor),
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
              (SELECT count(*) FROM dl) AS downloaded, (SELECT count(*) FROM direct) AS direct`,
    )
    .get({ from: span.from, to: span.to, source }) as { arrived: number; viewedCv: number; downloaded: number; direct: number }
  return row
}

/** Normalise the requested source: a plausible host, or null for every visitor. */
export function parseSource(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const host = raw.trim().toLowerCase()
  return isPlausibleHost(host) ? host : null
}

export function getGoalsReport(range: AnalyticsRange, sourceRaw: unknown = null, now: number = Date.now()): GoalsReport {
  // Buffered events first, and the daily rollup / retention if it is due.
  maintainEvents(now)
  const db = getAnalyticsDb()
  const today = utcDay(now)
  const days = RANGE_DAYS[range]
  const span: Span = { from: dayMinus(today, days - 1), to: today }
  const prev: Span = { from: dayMinus(today, 2 * days - 1), to: dayMinus(today, days) }
  const rolled = metaValue(db, 'events_rolled_through')
  const since = metaValue(db, 'events_since')
  const comparable = since !== null && since <= prev.from

  const siteVisitors = siteVisitorDays(db, span)
  const current = goalTotals(db, span, rolled)
  const before = goalTotals(db, prev, rolled)
  const props = propTotals(db, span, rolled)

  const goals: GoalRow[] = GOAL_TABLE_ORDER.map((name) => {
    const cur = current.get(name) || { events: 0, visitors: 0 }
    const old = before.get(name) || { events: 0, visitors: 0 }
    const top: GoalPropRow[] = props
      .filter((p) => p.name === name && p.prop !== '')
      .slice(0, TOP_PROPS)
      .map((p) => ({ key: p.prop, events: p.events, visitors: p.visitors }))
    return {
      name,
      events: cur.events,
      visitors: kpi(cur.visitors, old.visitors, comparable),
      rate: siteVisitors > 0 ? cur.visitors / siteVisitors : null,
      props: top,
    }
  })

  // Conversion: raw rows only.
  const funnelSpan: Span = { from: span.from > dayMinus(today, FUNNEL_MAX_DAYS - 1) ? span.from : dayMinus(today, FUNNEL_MAX_DAYS - 1), to: today }
  const sources = funnelSources(db, funnelSpan)
  const source = parseSource(sourceRaw)
  const steps = conversionSteps(db, funnelSpan, source)
  const funnel: GoalsFunnel = {
    from: funnelSpan.from,
    to: funnelSpan.to,
    days: Math.round((Date.parse(funnelSpan.to) - Date.parse(funnelSpan.from)) / 86_400_000) + 1,
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
  const searchSpan: Span = { from: span.from > dayMinus(today, SEARCH_EVENTS_DAYS - 1) ? span.from : dayMinus(today, SEARCH_EVENTS_DAYS - 1), to: today }
  const rows: EmptySearchRow[] = propTotals(db, searchSpan, rolled, 'search_empty')
    .slice(0, TOP_SEARCHES)
    .map((p) => ({ query: p.prop, visitors: p.visitors, events: p.events, lastSeen: p.last }))

  return {
    range,
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
      days: Math.round((Date.parse(searchSpan.to) - Date.parse(searchSpan.from)) / 86_400_000) + 1,
      rows,
    },
    generatedAt: now,
  }
}
