import { getAnalyticsDb } from './db'
import {
  OTHER_KEY,
  VITAL_NAMES,
  dayMinus,
  isPlausibleHost,
  rateVital,
  utcDay,
  type AnalyticsRange,
  type AnalyticsReport,
  type CountRow,
  type Kpi,
  type SeriesPoint,
  type VitalName,
  type VitalP75,
} from './shared'

/**
 * The admin Analytics report. Finished days come from the rollup tables
 * (daily / refs_daily / dims_daily); days after `meta.rolled_through` (today,
 * and yesterday until the first hit of the day rolls it up) are aggregated
 * from the raw hits, so the numbers are always current.
 *
 * "Visitors" over a period is the sum of each day's unique visitors: the
 * visitor hash changes every day by design, so the same person on two days
 * counts twice. That is the price of not tracking anyone across days.
 */

const RANGE_DAYS: Record<AnalyticsRange, number> = { '7d': 7, '30d': 30, '12m': 365 }
const TOP_N = 10
/**
 * The report names up to TOP_N referrer hosts that look like real public
 * names; implausible hosts (IP literals, single labels, legacy junk) and the
 * tail beyond TOP_N are summed into one OTHER_KEY row. A one-visitor
 * referrer is still named: on a personal site most real referrers are one
 * reader following one link, and hiding them would empty the report. Planted
 * hosts are bounded at ingest instead (published paths only, per-client and
 * per-network budgets in lib/analytics/limits).
 */
const MIN_REFERRER_VISITORS = 1
const LIVE_WINDOW_MS = 5 * 60_000

type Db = ReturnType<typeof getAnalyticsDb>
type Span = { from: string; to: string }

function rolledThrough(db: Db): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'rolled_through'").get() as { value: string } | undefined
  return row?.value ?? null
}

/** Split [from, to] into the rolled-up part and the part still read from raw hits. */
function split(span: Span, rolled: string | null): { rolled: Span | null; raw: Span | null } {
  if (!rolled || rolled < span.from) return { rolled: null, raw: span }
  if (rolled >= span.to) return { rolled: span, raw: null }
  return { rolled: { from: span.from, to: rolled }, raw: { from: dayMinus(rolled, -1), to: span.to } }
}

type DayTotals = Map<string, { views: number; visitors: number }>

function siteByDay(db: Db, span: Span, rolled: string | null): DayTotals {
  const out: DayTotals = new Map()
  const parts = split(span, rolled)
  if (parts.rolled) {
    const rows = db
      .prepare("SELECT day, views, visitors FROM dims_daily WHERE kind = 'site' AND day BETWEEN ? AND ?")
      .all(parts.rolled.from, parts.rolled.to) as Array<{ day: string; views: number; visitors: number }>
    for (const r of rows) out.set(r.day, { views: r.views, visitors: r.visitors })
  }
  if (parts.raw) {
    const rows = db
      .prepare(
        'SELECT day, count(*) AS views, count(DISTINCT visitor) AS visitors FROM hits WHERE day BETWEEN ? AND ? GROUP BY day',
      )
      .all(parts.raw.from, parts.raw.to) as Array<{ day: string; views: number; visitors: number }>
    for (const r of rows) out.set(r.day, { views: r.views, visitors: r.visitors })
  }
  return out
}

function sumTotals(t: DayTotals): { views: number; visitors: number } {
  let views = 0
  let visitors = 0
  for (const v of t.values()) {
    views += v.views
    visitors += v.visitors
  }
  return { views, visitors }
}

function kpi(value: number, previous: number, comparable: boolean): Kpi {
  return { value, previous, delta: comparable && previous > 0 ? (value - previous) / previous : null }
}

/** Merge per-key counts from the rolled and raw parts, sorted by visitors (then views, then key). */
function merge(rows: Array<{ key: string; visitors: number; views?: number }>, withViews: boolean): CountRow[] {
  const acc = new Map<string, CountRow>()
  for (const r of rows) {
    const cur = acc.get(r.key) || (withViews ? { key: r.key, visitors: 0, views: 0 } : { key: r.key, visitors: 0 })
    cur.visitors += r.visitors
    if (withViews) cur.views = (cur.views || 0) + (r.views || 0)
    acc.set(r.key, cur)
  }
  return Array.from(acc.values()).sort(
    (a, b) => b.visitors - a.visitors || (b.views || 0) - (a.views || 0) || a.key.localeCompare(b.key),
  )
}

const mergeTop = (rows: Array<{ key: string; visitors: number; views?: number }>, withViews: boolean): CountRow[] =>
  merge(rows, withViews).slice(0, TOP_N)

function topPages(db: Db, span: Span, rolled: string | null): CountRow[] {
  const parts = split(span, rolled)
  const rows: Array<{ key: string; visitors: number; views: number }> = []
  if (parts.rolled) {
    rows.push(
      ...(db
        .prepare('SELECT path AS key, sum(views) AS views, sum(visitors) AS visitors FROM daily WHERE day BETWEEN ? AND ? GROUP BY path')
        .all(parts.rolled.from, parts.rolled.to) as typeof rows),
    )
  }
  if (parts.raw) {
    rows.push(
      ...(db
        .prepare(
          `SELECT path AS key, count(*) AS views, count(DISTINCT visitor) AS visitors
           FROM hits WHERE day BETWEEN ? AND ? GROUP BY day, path`,
        )
        .all(parts.raw.from, parts.raw.to) as typeof rows),
    )
  }
  return mergeTop(rows, true)
}

function topReferrers(db: Db, span: Span, rolled: string | null): CountRow[] {
  const parts = split(span, rolled)
  const rows: Array<{ key: string; visitors: number }> = []
  if (parts.rolled) {
    rows.push(
      ...(db
        .prepare('SELECT ref_host AS key, sum(visitors) AS visitors FROM refs_daily WHERE day BETWEEN ? AND ? GROUP BY ref_host')
        .all(parts.rolled.from, parts.rolled.to) as typeof rows),
    )
  }
  if (parts.raw) {
    rows.push(
      ...(db
        .prepare(
          `SELECT ref_host AS key, count(DISTINCT visitor) AS visitors
           FROM hits WHERE day BETWEEN ? AND ? AND ref_host IS NOT NULL GROUP BY day, ref_host`,
        )
        .all(parts.raw.from, parts.raw.to) as typeof rows),
    )
  }
  const named: CountRow[] = []
  let other = 0
  for (const r of merge(rows, false)) {
    if (named.length < TOP_N && r.visitors >= MIN_REFERRER_VISITORS && isPlausibleHost(r.key)) named.push(r)
    else other += r.visitors
  }
  return other > 0 ? [...named, { key: OTHER_KEY, visitors: other }] : named
}

const DIMENSION_COLUMN = { country: 'country', device: 'device', browser: 'browser' } as const
type Dimension = keyof typeof DIMENSION_COLUMN

function topDimension(db: Db, kind: Dimension, span: Span, rolled: string | null): CountRow[] {
  const parts = split(span, rolled)
  const column = DIMENSION_COLUMN[kind]
  const rows: Array<{ key: string; visitors: number; views: number }> = []
  if (parts.rolled) {
    rows.push(
      ...(db
        .prepare(
          `SELECT value AS key, sum(views) AS views, sum(visitors) AS visitors
           FROM dims_daily WHERE kind = ? AND day BETWEEN ? AND ? GROUP BY value`,
        )
        .all(kind, parts.rolled.from, parts.rolled.to) as typeof rows),
    )
  }
  if (parts.raw) {
    rows.push(
      ...(db
        .prepare(
          `SELECT ${column} AS key, count(*) AS views, count(DISTINCT visitor) AS visitors
           FROM hits WHERE day BETWEEN ? AND ? AND ${column} IS NOT NULL GROUP BY day, ${column}`,
        )
        .all(parts.raw.from, parts.raw.to) as typeof rows),
    )
  }
  return mergeTop(rows, true)
}

function buildSeries(byDay: DayTotals, span: Span, bucket: 'day' | 'month'): SeriesPoint[] {
  const points = new Map<string, SeriesPoint>()
  for (let day = span.from; day <= span.to; day = dayMinus(day, -1)) {
    const key = bucket === 'day' ? day : day.slice(0, 7)
    const point = points.get(key) || { key, views: 0, visitors: 0 }
    const t = byDay.get(day)
    if (t) {
      point.views += t.views
      point.visitors += t.visitors
    }
    points.set(key, point)
  }
  return Array.from(points.values())
}

/** Nearest-rank 75th percentile of an ascending list. */
export function p75(sorted: number[]): number {
  if (!sorted.length) return 0
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)]
}

function vitalsSince(db: Db, fromDay: string): VitalP75[] {
  const rows = db
    .prepare('SELECT route, name, value FROM vitals WHERE day >= ? ORDER BY name, route, value')
    .all(fromDay) as Array<{ route: string; name: string; value: number }>
  const groups = new Map<string, { route: string; name: VitalName; values: number[] }>()
  const add = (route: string, name: VitalName, value: number) => {
    const k = `${name}\u0000${route}`
    const g = groups.get(k) || { route, name, values: [] }
    g.values.push(value)
    groups.set(k, g)
  }
  for (const r of rows) {
    if (!(VITAL_NAMES as readonly string[]).includes(r.name)) continue
    add(r.route, r.name as VitalName, r.value)
    add('*', r.name as VitalName, r.value)
  }
  const out: VitalP75[] = []
  for (const g of groups.values()) {
    g.values.sort((a, b) => a - b)
    const value = p75(g.values)
    out.push({ route: g.route, name: g.name, p75: value, samples: g.values.length, rating: rateVital(g.name, value) })
  }
  const order = (n: VitalName) => VITAL_NAMES.indexOf(n)
  return out.sort(
    (a, b) =>
      (a.route === '*' ? -1 : 0) - (b.route === '*' ? -1 : 0) ||
      a.route.localeCompare(b.route) ||
      order(a.name) - order(b.name),
  )
}

function oldestDay(db: Db): string | null {
  const row = db
    .prepare(
      `SELECT min(d) AS d FROM (
         SELECT min(day) AS d FROM dims_daily WHERE kind = 'site'
         UNION ALL SELECT min(day) FROM hits)`,
    )
    .get() as { d: string | null }
  return row.d
}

export function getAnalyticsReport(range: AnalyticsRange, now: number = Date.now()): AnalyticsReport {
  const db = getAnalyticsDb()
  const today = utcDay(now)
  const days = RANGE_DAYS[range]
  const span: Span = { from: dayMinus(today, days - 1), to: today }
  const prev: Span = { from: dayMinus(today, 2 * days - 1), to: dayMinus(today, days) }
  const rolled = rolledThrough(db)
  const bucket = range === '12m' ? 'month' : 'day'

  const current = siteByDay(db, span, rolled)
  const cur = sumTotals(current)
  const before = sumTotals(siteByDay(db, prev, rolled))
  const oldest = oldestDay(db)
  // Compare only when data reaches back to the start of the previous period.
  const comparable = oldest !== null && oldest <= prev.from

  const live = (
    db.prepare('SELECT count(DISTINCT visitor) AS n FROM hits WHERE ts >= ?').get(now - LIVE_WINDOW_MS) as { n: number }
  ).n

  return {
    range,
    from: span.from,
    to: span.to,
    bucket,
    kpis: {
      views: kpi(cur.views, before.views, comparable),
      visitors: kpi(cur.visitors, before.visitors, comparable),
    },
    series: buildSeries(current, span, bucket),
    topPages: topPages(db, span, rolled),
    referrers: topReferrers(db, span, rolled),
    countries: topDimension(db, 'country', span, rolled),
    devices: topDimension(db, 'device', span, rolled),
    browsers: topDimension(db, 'browser', span, rolled),
    live,
    vitals: { '7d': vitalsSince(db, dayMinus(today, 6)), '28d': vitalsSince(db, dayMinus(today, 27)) },
    generatedAt: now,
  }
}
