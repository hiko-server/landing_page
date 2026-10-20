/**
 * Analytics explore (H10): the period, comparison and filters of an admin
 * Analytics view, and their URL form. Pure — shared by the admin panel, the
 * API routes (/api/admin/analytics, /goals, /analytics/export) and the
 * server queries (lib/analytics/explore, goalsQuery). No Node or DOM APIs.
 *
 * URL form (the dashboard's address and every API request carry the same
 * parameters, so a view can be bookmarked, reloaded and exported as shown):
 *
 *   period=today|yesterday|7d|28d|30d|90d|month|last-month|12m|custom
 *   from=YYYY-MM-DD&to=YYYY-MM-DD      custom only (UTC days, inclusive)
 *   compare=1                          draw the previous period on the chart
 *   f=<dimension>:<is|not>:<value>     repeatable, one per dimension
 *   range=7d|30d|12m                   the panel's earlier form, still read
 *
 * Dimensions and what a filter keeps:
 *   page      page views of that path (row level)
 *   lang      page views in that page language (row level; the page's own
 *             language, never the visitor's)
 *   country, device, browser
 *             page views from visitors in that country / on that device class
 *             / browser family (a visitor's are the same all day)
 *   source    every page view of the visitor-days that arrived from that
 *             referring site at least once ("is not": never that day)
 *
 * Filters need the detailed records — the page views with the daily visitor
 * hash — which are kept EXPLORE_RAW_DAYS days; without filters the whole
 * period comes from the daily totals (kept EXPLORE_ROLLUP_DAYS days).
 */

import { dayMinus, isPlausibleHost, utcDay } from './shared'

/** Days of detailed page views and events (lib/analytics/ingest RAW_HITS_DAYS, events EVENTS_RAW_DAYS; unit-tested to agree). */
export const EXPLORE_RAW_DAYS = 35
/** Days of daily totals (lib/analytics/ingest ROLLUP_DAYS). */
export const EXPLORE_ROLLUP_DAYS = 400

// ── Period ─────────────────────────────────────────────────────────────────

export const PERIOD_PRESETS = ['today', 'yesterday', '7d', '28d', '30d', '90d', 'month', 'last-month', '12m'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]
export type PeriodKind = PeriodPreset | 'custom'
export const DEFAULT_PERIOD: PeriodPreset = '30d'

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '28d': 'Last 28 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  month: 'This month',
  'last-month': 'Last month',
  '12m': 'Last 12 months',
}

/** Inclusive span of UTC days. */
export type DaySpan = { from: string; to: string }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar day "YYYY-MM-DD" (2026-02-30 is not). */
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(t) && utcDay(t) === v
}

/** Days in an inclusive span (1 for a single day; 0 when from > to). */
export function spanDays(span: DaySpan): number {
  if (span.from > span.to) return 0
  return Math.round((Date.parse(`${span.to}T00:00:00Z`) - Date.parse(`${span.from}T00:00:00Z`)) / 86_400_000) + 1
}

/** The span of equal length that ends the day before `span` starts. */
export function previousSpan(span: DaySpan): DaySpan {
  const days = Math.max(1, spanDays(span))
  return { from: dayMinus(span.from, days), to: dayMinus(span.from, 1) }
}

/** The earliest day a period may start: the oldest daily totals. */
export function earliestDay(today: string): string {
  return dayMinus(today, EXPLORE_ROLLUP_DAYS - 1)
}

/** The first day of the detailed records window (inclusive; today is the last). */
export function rawWindowStart(today: string): string {
  return dayMinus(today, EXPLORE_RAW_DAYS - 1)
}

/** The days a period covers on `today` (UTC), clamped to the stored history. */
export function resolvePeriod(q: Pick<ExploreQuery, 'period' | 'from' | 'to'>, today: string): DaySpan {
  const earliest = earliestDay(today)
  switch (q.period) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = dayMinus(today, 1)
      return { from: y, to: y }
    }
    case '7d':
      return { from: dayMinus(today, 6), to: today }
    case '28d':
      return { from: dayMinus(today, 27), to: today }
    case '90d':
      return { from: dayMinus(today, 89), to: today }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'last-month': {
      const first = `${today.slice(0, 7)}-01`
      const end = dayMinus(first, 1)
      return { from: `${end.slice(0, 7)}-01`, to: end }
    }
    case '12m':
      return { from: dayMinus(today, 364), to: today }
    case 'custom': {
      if (isDay(q.from) && isDay(q.to)) {
        let [from, to] = q.from <= q.to ? [q.from, q.to] : [q.to, q.from]
        if (to > today) to = today
        if (from < earliest) from = earliest
        if (from <= to) return { from, to }
      }
      return { from: dayMinus(today, 29), to: today }
    }
    default:
      return { from: dayMinus(today, 29), to: today }
  }
}

export type Bucket = 'day' | 'week' | 'month'

/** Chart resolution for a span: days up to ~3 months, weeks up to ~6½ months, then months. */
export function bucketFor(days: number): Bucket {
  if (days <= 92) return 'day'
  if (days <= 200) return 'week'
  return 'month'
}

/** The bucket a day falls in: the day itself, the Monday of its ISO week, or "YYYY-MM". */
export function bucketKey(day: string, bucket: Bucket): string {
  if (bucket === 'day') return day
  if (bucket === 'month') return day.slice(0, 7)
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return dayMinus(day, (weekday + 6) % 7)
}

/** Shift a span by its own length (−1 = the period before, +1 = the one after). */
export function shiftSpan(span: DaySpan, direction: -1 | 1): DaySpan {
  const days = Math.max(1, spanDays(span))
  return { from: dayMinus(span.from, -direction * days), to: dayMinus(span.to, -direction * days) }
}

// ── Filters ────────────────────────────────────────────────────────────────

export const EXPLORE_DIMENSIONS = ['page', 'source', 'country', 'device', 'browser', 'lang'] as const
export type ExploreDimension = (typeof EXPLORE_DIMENSIONS)[number]
export type FilterOp = 'is' | 'not'
export type ExploreFilter = { dim: ExploreDimension; op: FilterOp; value: string }

export const DIMENSION_LABEL: Record<ExploreDimension, string> = {
  page: 'Page',
  source: 'Referrer',
  country: 'Country',
  device: 'Device',
  browser: 'Browser',
  lang: 'Page language',
}

/** Filters that select visitor-days rather than single page views. */
export const VISITOR_DAY_DIMENSIONS: readonly ExploreDimension[] = ['source']

export const DEVICES = ['desktop', 'mobile', 'tablet'] as const
/** Browser families as lib/analytics/ingest browserOf() names them. */
export const BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Opera', 'Samsung Internet', 'Other'] as const
const LANG_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/

export function isExploreDimension(v: unknown): v is ExploreDimension {
  return typeof v === 'string' && (EXPLORE_DIMENSIONS as readonly string[]).includes(v)
}

/**
 * The stored form of a filter value, or null when it cannot be one: a site
 * path, a plausible host name (lowercased, without "www."), a two-letter
 * country code (uppercased), a device class, a browser family or a language
 * tag (lowercased) — the same shapes the collector stores.
 */
export function normalizeFilterValue(dim: ExploreDimension, raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (!v || v.length > 512 || CONTROL.test(v)) return null
  switch (dim) {
    case 'page':
      return v.startsWith('/') && !v.startsWith('//') ? v : null
    case 'source': {
      const host = v.toLowerCase().replace(/^www\./, '')
      return isPlausibleHost(host) ? host : null
    }
    case 'country': {
      const c = v.toUpperCase()
      return /^[A-Z]{2}$/.test(c) ? c : null
    }
    case 'device': {
      const d = v.toLowerCase()
      return (DEVICES as readonly string[]).includes(d) ? d : null
    }
    case 'browser':
      return BROWSERS.find((b) => b.toLowerCase() === v.toLowerCase()) ?? null
    case 'lang': {
      const l = v.toLowerCase()
      return LANG_RE.test(l) ? l : null
    }
  }
}

/** "page:is:/cv" → a filter, or null. */
export function parseFilter(raw: unknown): ExploreFilter | null {
  if (typeof raw !== 'string' || raw.length > 600) return null
  const a = raw.indexOf(':')
  const b = a < 0 ? -1 : raw.indexOf(':', a + 1)
  if (a < 0 || b < 0) return null
  const dim = raw.slice(0, a)
  const op = raw.slice(a + 1, b)
  if (!isExploreDimension(dim) || (op !== 'is' && op !== 'not')) return null
  const value = normalizeFilterValue(dim, raw.slice(b + 1))
  return value === null ? null : { dim, op, value }
}

export function formatFilterParam(f: ExploreFilter): string {
  return `${f.dim}:${f.op}:${f.value}`
}

/** Add `f`, replacing any filter on the same dimension (one per dimension); kept in dimension order. */
export function withFilter(filters: readonly ExploreFilter[], f: ExploreFilter): ExploreFilter[] {
  const next = filters.filter((x) => x.dim !== f.dim).concat(f)
  return next.sort((x, y) => EXPLORE_DIMENSIONS.indexOf(x.dim) - EXPLORE_DIMENSIONS.indexOf(y.dim))
}

export function withoutFilter(filters: readonly ExploreFilter[], dim: ExploreDimension): ExploreFilter[] {
  return filters.filter((x) => x.dim !== dim)
}

/** The single page an "is" page filter points at (the page detail), or null. */
export function pageOf(filters: readonly ExploreFilter[]): string | null {
  const f = filters.find((x) => x.dim === 'page')
  return f && f.op === 'is' ? f.value : null
}

// ── Query (URL ⇄ object) ───────────────────────────────────────────────────

export type ExploreQuery = {
  period: PeriodKind
  /** Custom period only. */
  from: string | null
  to: string | null
  compare: boolean
  filters: ExploreFilter[]
}

export const DEFAULT_EXPLORE_QUERY: ExploreQuery = { period: DEFAULT_PERIOD, from: null, to: null, compare: false, filters: [] }

/** URL parameters an Analytics view owns (the dashboard drops them on other tabs). */
export const EXPLORE_PARAM_KEYS = ['period', 'from', 'to', 'compare', 'f', 'range'] as const

type RawQuery = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v === undefined ? [] : [v])

/** Read a view from URL / API parameters; anything malformed falls back to the default. */
export function parseExploreQuery(query: RawQuery): ExploreQuery {
  const rawPeriod = first(query.period) ?? first(query.range) ?? ''
  let period: PeriodKind = (PERIOD_PRESETS as readonly string[]).includes(rawPeriod) ? (rawPeriod as PeriodPreset) : DEFAULT_PERIOD
  let from: string | null = null
  let to: string | null = null
  if (rawPeriod === 'custom') {
    const f = first(query.from)
    const t = first(query.to)
    if (isDay(f) && isDay(t)) {
      period = 'custom'
      ;[from, to] = f <= t ? [f, t] : [t, f]
    }
  }
  const compare = first(query.compare) === '1'
  let filters: ExploreFilter[] = []
  for (const raw of all(query.f).slice(0, 20)) {
    const f = parseFilter(raw)
    if (f) filters = withFilter(filters, f)
  }
  return { period, from, to, compare, filters }
}

/** URL / API parameters of a view; defaults are left out unless `full`. */
export function exploreParams(q: ExploreQuery, full = false): Array<[string, string]> {
  const out: Array<[string, string]> = []
  if (full || q.period !== DEFAULT_PERIOD) out.push(['period', q.period])
  if (q.period === 'custom' && q.from && q.to) out.push(['from', q.from], ['to', q.to])
  if (q.compare) out.push(['compare', '1'])
  for (const f of q.filters) out.push(['f', formatFilterParam(f)])
  return out
}

/** "period=7d&f=page%3Ais%3A%2Fcv" (URL-encoded). */
export function exploreSearch(q: ExploreQuery, extra: Array<[string, string]> = []): string {
  return new URLSearchParams([...exploreParams(q, true), ...extra]).toString()
}

export function sameQuery(a: ExploreQuery, b: ExploreQuery): boolean {
  return exploreSearch(a) === exploreSearch(b)
}
