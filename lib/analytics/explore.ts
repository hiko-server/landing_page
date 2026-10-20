import { getAnalyticsDb } from './db'
import { maintainEvents } from './events'
import { listItems } from '../contentStore'
import { log } from '../log'
import {
  LIVE_WINDOW_MS,
  TOP_N,
  kpi,
  merge,
  nameReferrers,
  oldestDay,
  rolledThrough,
  siteByDay,
  split,
  sumTotals,
  topDimension,
  topPages,
  topReferrers,
  vitalAttributionSince,
  vitalsSince,
  type Db,
  type DayTotals,
  type Span,
  type VitalsScope,
} from './query'
import { dayMinus, utcDay, type CountRow, type Kpi, type SeriesPoint, type VitalP75 } from './shared'
import type { VitalAttributionRow } from './attribution'
import {
  EXPLORE_DIMENSIONS,
  bucketFor,
  bucketKey,
  pageOf,
  previousSpan,
  rawWindowStart,
  resolvePeriod,
  spanDays,
  type Bucket,
  type DaySpan,
  type ExploreDimension,
  type ExploreFilter,
  type ExploreQuery,
} from './exploreShared'

/**
 * The admin Analytics explore report (H10, GET /api/admin/analytics): one
 * period, an optional comparison with the period before it and any filters.
 *
 * Two sources, never mixed within one report:
 *   - No filters: the whole period from the daily totals (daily, refs_daily,
 *     dims_daily, langs_daily — 400 days), with the days not rolled up yet
 *     read from the raw page views, as lib/analytics/query always did.
 *   - Filters: the raw page views only — the rows with the daily visitor
 *     hash, kept 35 days — because the daily totals hold one dimension each
 *     and cannot be crossed. The period is clipped to that window, and the
 *     report says so (`window.clipped`); the comparison is offered only when
 *     the period before it is inside the window too.
 *
 * Filter semantics (lib/analytics/exploreShared): page, page language,
 * country, device and browser keep the page views that match; a referrer
 * filter keeps every page view of the visitor-days that arrived from that
 * site (so the pages and goals of "visitors from linkedin.com" are the
 * whole visit, not just the landing page). Unique counts are visitor-days,
 * as everywhere in the admin: the hash changes every UTC day.
 *
 * Nothing here reads or returns a visitor hash outside SQL aggregates.
 */

// ── Report shape ───────────────────────────────────────────────────────────

/** A post or case study published on a day of the period (a mark on the chart). */
export type Annotation = { day: string; path: string; title: string }

export type CountPair = { visitors: number; events: number }

/** Goals measured on one page (the page detail of an "is" page filter). */
export type PageDetail = {
  path: string
  title: string | null
  kind: 'post' | 'case-study' | 'page'
  publishedOn: string | null
  /** /admin/<collection>/edit?slug=… for a post or case study. */
  editHref: string | null
  /** read_through on this page (posts and case studies only). */
  readThrough: (CountPair & { rate: number | null }) | null
  /** email_click events on this page. */
  emailClicks: CountPair
  /** cv_print on /cv or /cv/zh only. */
  cvPrints: CountPair | null
  /**
   * outbound_click events put on this page: the page the visitor had viewed
   * last, at or before the click, on the same day (the event itself stores
   * only the destination host). Raw window only.
   */
  outbound: CountPair & { hosts: Array<{ key: string } & CountPair> }
}

export type ExploreReport = {
  query: ExploreQuery
  /** The period asked for. */
  period: DaySpan & { days: number }
  /** The days the numbers cover: the period, or its part inside the raw window when filtered. */
  window: DaySpan & { days: number; clipped: boolean; empty: boolean }
  mode: 'rollup' | 'raw'
  /** First day of the detailed records (filters reach back to it). */
  rawFrom: string
  /** The period before `window`, and whether its numbers exist (deltas are null otherwise). */
  previous: DaySpan & { available: boolean }
  bucket: Bucket
  kpis: { views: Kpi; visitors: Kpi }
  series: SeriesPoint[]
  /** The previous period bucket by bucket (compare=1 and available), aligned by position. */
  previousSeries: SeriesPoint[] | null
  topPages: CountRow[]
  referrers: CountRow[]
  countries: CountRow[]
  devices: CountRow[]
  browsers: CountRow[]
  languages: CountRow[]
  /** First day with page-language totals (older days of an unfiltered period have none). */
  langsSince: string | null
  /** Titles of the posts and case studies among the listed pages. */
  titles: Record<string, string>
  annotations: Annotation[]
  /** Distinct visitors in the last 5 minutes (matching the filters). */
  live: number
  vitals: { '7d': VitalP75[]; '28d': VitalP75[] }
  attribution: { '7d': VitalAttributionRow[]; '28d': VitalAttributionRow[] }
  /** The filters the Web Vitals honour (page, device); the others cannot apply to them. */
  vitalsScope: ExploreDimension[]
  page: PageDetail | null
  generatedAt: number
}

// ── Filter SQL ─────────────────────────────────────────────────────────────

const COLUMN: Record<ExploreDimension, string> = {
  page: 'path',
  source: 'ref_host',
  country: 'country',
  device: 'device',
  browser: 'browser',
  lang: 'lang',
}

export type FilterSql = { where: string; params: Record<string, string> }

/**
 * WHERE terms for page views aliased `alias` that match every filter
 * (named parameters @f_<dimension>). Values are always bound, never
 * spliced; column names come from the fixed COLUMN map.
 */
export function filterSql(filters: readonly ExploreFilter[], alias: string): FilterSql {
  const parts: string[] = []
  const params: Record<string, string> = {}
  for (const f of filters) {
    const p = `f_${f.dim}`
    params[p] = f.value
    if (f.dim === 'source') {
      const arrived = `EXISTS (SELECT 1 FROM hits src_ WHERE src_.day = ${alias}.day AND src_.visitor = ${alias}.visitor AND src_.ref_host = @${p})`
      parts.push(f.op === 'is' ? arrived : `NOT ${arrived}`)
    } else {
      const col = `${alias}.${COLUMN[f.dim]}`
      parts.push(f.op === 'is' ? `${col} = @${p}` : `(${col} IS NULL OR ${col} <> @${p})`)
    }
  }
  return { where: parts.length ? parts.join(' AND ') : '1', params }
}

/**
 * A term for a row aliased `alias` that has `day` and `visitor` columns
 * (an event): its visitor-day viewed at least one page matching the filters.
 */
export function visitorDaySql(filters: readonly ExploreFilter[], alias: string): FilterSql {
  if (!filters.length) return { where: '1', params: {} }
  const inner = filterSql(filters, 'vd_')
  return {
    where: `EXISTS (SELECT 1 FROM hits vd_ WHERE vd_.day = ${alias}.day AND vd_.visitor = ${alias}.visitor AND ${inner.where})`,
    params: inner.params,
  }
}

// ── Raw-mode queries ───────────────────────────────────────────────────────

type Params = Record<string, string | number>

function rawByDay(db: Db, span: Span, f: FilterSql): DayTotals {
  const out: DayTotals = new Map()
  if (span.from > span.to) return out
  const rows = db
    .prepare(
      `SELECT h.day AS day, count(*) AS views, count(DISTINCT h.visitor) AS visitors
       FROM hits h WHERE h.day BETWEEN @from AND @to AND ${f.where} GROUP BY h.day`,
    )
    .all({ ...f.params, from: span.from, to: span.to } as Params) as Array<{ day: string; views: number; visitors: number }>
  for (const r of rows) out.set(r.day, { views: r.views, visitors: r.visitors })
  return out
}

function rawGrouped(db: Db, span: Span, f: FilterSql, column: string, limit: number): CountRow[] {
  if (span.from > span.to) return []
  const rows = db
    .prepare(
      `SELECT h.${column} AS key, count(*) AS views, count(DISTINCT h.visitor) AS visitors
       FROM hits h WHERE h.day BETWEEN @from AND @to AND h.${column} IS NOT NULL AND ${f.where}
       GROUP BY h.day, h.${column}`,
    )
    .all({ ...f.params, from: span.from, to: span.to } as Params) as Array<{ key: string; views: number; visitors: number }>
  return merge(rows, true).slice(0, limit)
}

/** Referrer hosts of the matching visitor-days (any of their page views that day). */
function rawReferrers(db: Db, span: Span, f: FilterSql, limit: number): CountRow[] {
  if (span.from > span.to) return []
  const rows = db
    .prepare(
      `SELECT r.ref_host AS key, count(*) AS visitors
       FROM (SELECT DISTINCT h.day, h.visitor FROM hits h WHERE h.day BETWEEN @from AND @to AND ${f.where}) v
       JOIN (SELECT DISTINCT day, visitor, ref_host FROM hits WHERE day BETWEEN @from AND @to AND ref_host IS NOT NULL) r
         ON r.day = v.day AND r.visitor = v.visitor
       GROUP BY r.ref_host`,
    )
    .all({ ...f.params, from: span.from, to: span.to } as Params) as Array<{ key: string; visitors: number }>
  return nameReferrers(rows, limit)
}

function rollupLanguages(db: Db, span: Span, rolled: string | null, limit: number): CountRow[] {
  const parts = split(span, rolled)
  const rows: Array<{ key: string; visitors: number; views: number }> = []
  if (parts.rolled) {
    rows.push(
      ...(db
        .prepare('SELECT lang AS key, sum(views) AS views, sum(visitors) AS visitors FROM langs_daily WHERE day BETWEEN ? AND ? GROUP BY lang')
        .all(parts.rolled.from, parts.rolled.to) as typeof rows),
    )
  }
  if (parts.raw) {
    rows.push(
      ...(db
        .prepare(
          `SELECT lang AS key, count(*) AS views, count(DISTINCT visitor) AS visitors
           FROM hits WHERE day BETWEEN ? AND ? AND lang IS NOT NULL GROUP BY day, lang`,
        )
        .all(parts.raw.from, parts.raw.to) as typeof rows),
    )
  }
  return merge(rows, true).slice(0, limit)
}

// ── Series ─────────────────────────────────────────────────────────────────

/** One point per bucket of `span` (empty buckets are zero). */
export function seriesOf(byDay: DayTotals, span: Span, bucket: Bucket): SeriesPoint[] {
  const points = new Map<string, SeriesPoint>()
  if (span.from > span.to) return []
  for (let day = span.from; day <= span.to; day = dayMinus(day, -1)) {
    const key = bucketKey(day, bucket)
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

// ── Content (titles, publish marks) ────────────────────────────────────────

type ContentIndex = { titles: Map<string, string>; published: Array<{ day: string; path: string; title: string; collection: 'blog' | 'work'; slug: string }> }

function contentIndex(): ContentIndex {
  const out: ContentIndex = { titles: new Map(), published: [] }
  for (const collection of ['blog', 'work'] as const) {
    let items: ReturnType<typeof listItems> = []
    try {
      items = listItems(collection)
    } catch (err) {
      log.warn('analytics explore: could not read the content store for titles', { err, collection })
      continue
    }
    for (const item of items) {
      if (item.frontmatter?.draft) continue
      const path = `/${collection}/${item.slug}`
      const title = typeof item.frontmatter?.title === 'string' ? item.frontmatter.title.trim() : ''
      if (title) out.titles.set(path, title)
      const date = item.frontmatter?.date
      const day = typeof date === 'string' ? date.slice(0, 10) : date instanceof Date ? utcDay(date.getTime()) : ''
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) out.published.push({ day, path, title: title || path, collection, slug: item.slug })
    }
  }
  return out
}

// ── Page detail ────────────────────────────────────────────────────────────

const STATIC_PAGE_TITLE: Record<string, string> = {
  '/': 'Home',
  '/about': 'About',
  '/cv': 'CV',
  '/cv/zh': 'CV (Chinese)',
  '/blog': 'Writing',
  '/work': 'Work',
  '/now': 'Now',
  '/uses': 'Uses',
  '/contact': 'Contact',
  '/colophon': 'Colophon',
  '/publications': 'Publications',
}

function eventPair(db: Db, span: Span, filters: readonly ExploreFilter[], name: string, prop: string | null): CountPair {
  const vd = visitorDaySql(filters, 'e')
  const row = db
    .prepare(
      `SELECT count(*) AS events, count(DISTINCT e.day || ':' || e.visitor) AS visitors FROM events e
       WHERE e.day BETWEEN @from AND @to AND e.name = @name ${prop === null ? '' : 'AND e.prop = @prop'} AND ${vd.where}`,
    )
    .get({ ...vd.params, from: span.from, to: span.to, name, ...(prop === null ? {} : { prop }) } as Params) as CountPair
  return { visitors: row.visitors || 0, events: row.events || 0 }
}

function pageDetail(db: Db, span: Span, filters: readonly ExploreFilter[], path: string, pageVisitors: number, content: ContentIndex): PageDetail {
  const article = /^\/(blog|work)\/([^/]+)$/.exec(path)
  const published = article ? content.published.find((p) => p.path === path) : undefined
  const empty: CountPair = { visitors: 0, events: 0 }
  const live = span.from <= span.to
  const readThrough = article ? (live ? eventPair(db, span, filters, 'read_through', path) : empty) : null
  const vd = visitorDaySql(filters, 'e')
  let outbound: PageDetail['outbound'] = { ...empty, hosts: [] }
  if (live) {
    // The page an outbound click came from: the visitor's last page view at
    // or before the click, the same day (idx_hits_day_visitor).
    const from = `FROM events e
       WHERE e.name = 'outbound_click' AND e.day BETWEEN @from AND @to AND ${vd.where}
         AND (SELECT h.path FROM hits h WHERE h.day = e.day AND h.visitor = e.visitor AND h.ts <= e.ts ORDER BY h.ts DESC LIMIT 1) = @page`
    const params = { ...vd.params, from: span.from, to: span.to, page: path } as Params
    const total = db.prepare(`SELECT count(*) AS events, count(DISTINCT e.day || ':' || e.visitor) AS visitors ${from}`).get(params) as CountPair
    const hosts = db
      .prepare(
        `SELECT e.prop AS key, count(*) AS events, count(DISTINCT e.day || ':' || e.visitor) AS visitors ${from}
         GROUP BY e.prop ORDER BY visitors DESC, events DESC, key ASC LIMIT ${TOP_N}`,
      )
      .all(params) as Array<{ key: string } & CountPair>
    outbound = { visitors: total.visitors || 0, events: total.events || 0, hosts }
  }
  const cvLang = path === '/cv' ? 'en' : path === '/cv/zh' ? 'zh' : null
  return {
    path,
    title: content.titles.get(path) ?? STATIC_PAGE_TITLE[path] ?? null,
    kind: article ? (article[1] === 'blog' ? 'post' : 'case-study') : 'page',
    publishedOn: published?.day ?? null,
    editHref: article ? `/admin/${article[1]}/edit?slug=${encodeURIComponent(article[2])}` : null,
    readThrough: readThrough ? { ...readThrough, rate: pageVisitors > 0 ? Math.min(1, readThrough.visitors / pageVisitors) : null } : null,
    emailClicks: live ? eventPair(db, span, filters, 'email_click', path) : empty,
    cvPrints: cvLang ? (live ? eventPair(db, span, filters, 'cv_print', cvLang) : empty) : null,
    outbound,
  }
}

// ── The report ─────────────────────────────────────────────────────────────

function oldestRawDay(db: Db): string | null {
  return (db.prepare('SELECT min(day) AS d FROM hits').get() as { d: string | null }).d
}

function metaValue(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

/** Which Web Vitals samples the filters select (page and device only). */
function vitalsScopeOf(filters: readonly ExploreFilter[]): { scope: VitalsScope; dims: ExploreDimension[] } {
  const scope: VitalsScope = {}
  const dims: ExploreDimension[] = []
  for (const f of filters) {
    if (f.dim === 'page') {
      scope.route = { op: f.op, value: f.value }
      dims.push('page')
    } else if (f.dim === 'device') {
      scope.device = { op: f.op, value: f.value }
      dims.push('device')
    }
  }
  return { scope, dims }
}

export type ExploreOptions = { now?: number; limit?: number }

export function getExploreReport(query: ExploreQuery, opts: ExploreOptions = {}): ExploreReport {
  const now = opts.now ?? Date.now()
  const limit = Math.max(1, Math.min(1000, opts.limit ?? TOP_N))
  const db = getAnalyticsDb()
  const today = utcDay(now)
  const period = resolvePeriod(query, today)
  const filters = query.filters.filter((f) => (EXPLORE_DIMENSIONS as readonly string[]).includes(f.dim))
  const filtered = filters.length > 0
  const rawFrom = rawWindowStart(today)
  const rolled = rolledThrough(db)

  const window: Span = filtered ? { from: period.from > rawFrom ? period.from : rawFrom, to: period.to } : { ...period }
  const empty = window.from > window.to
  const days = spanDays(window)
  const prev = previousSpan(empty ? period : window)
  let available: boolean
  if (filtered) {
    const oldest = oldestRawDay(db)
    available = !empty && prev.from >= rawFrom && oldest !== null && oldest <= prev.from
  } else {
    const oldest = oldestDay(db)
    available = oldest !== null && oldest <= prev.from
  }
  const bucket = bucketFor(Math.max(1, days || spanDays(period)))
  const f = filterSql(filters, 'h')

  const byDay = filtered ? rawByDay(db, window, f) : siteByDay(db, window, rolled)
  const cur = sumTotals(byDay)
  const prevByDay = available ? (filtered ? rawByDay(db, prev, f) : siteByDay(db, prev, rolled)) : new Map()
  const before = sumTotals(prevByDay)

  const content = contentIndex()
  const cards = filtered
    ? {
        topPages: rawGrouped(db, window, f, 'path', limit),
        referrers: rawReferrers(db, window, f, limit),
        countries: rawGrouped(db, window, f, 'country', limit),
        devices: rawGrouped(db, window, f, 'device', limit),
        browsers: rawGrouped(db, window, f, 'browser', limit),
        languages: rawGrouped(db, window, f, 'lang', limit),
      }
    : {
        topPages: topPages(db, window, rolled, limit),
        referrers: topReferrers(db, window, rolled, limit),
        countries: topDimension(db, 'country', window, rolled, limit),
        devices: topDimension(db, 'device', window, rolled, limit),
        browsers: topDimension(db, 'browser', window, rolled, limit),
        languages: rollupLanguages(db, window, rolled, limit),
      }

  const live = (
    db
      .prepare(`SELECT count(DISTINCT h.visitor) AS n FROM hits h WHERE h.ts >= @since AND ${f.where}`)
      .get({ ...f.params, since: now - LIVE_WINDOW_MS } as Params) as { n: number }
  ).n

  const { scope, dims } = vitalsScopeOf(filters)
  const pinned = scope.route?.op === 'is'
  const vitalsFor = (fromDay: string) => {
    const rows = vitalsSince(db, fromDay, scope)
    // With one page chosen, "all pages" is that page: list it once.
    return pinned ? rows.filter((r) => r.route !== '*') : rows
  }

  const titles: Record<string, string> = {}
  for (const row of cards.topPages) {
    const t = content.titles.get(row.key)
    if (t) titles[row.key] = t
  }
  const pagePath = pageOf(filters)
  if (pagePath && content.titles.has(pagePath)) titles[pagePath] = content.titles.get(pagePath)!

  // Goal events buffered in memory belong in the page detail too.
  if (pagePath) maintainEvents(now)

  return {
    query: { ...query, filters },
    period: { ...period, days: spanDays(period) },
    window: { ...window, days, clipped: filtered && period.from < window.from, empty },
    mode: filtered ? 'raw' : 'rollup',
    rawFrom,
    previous: { ...prev, available },
    bucket,
    kpis: {
      views: kpi(cur.views, before.views, available),
      visitors: kpi(cur.visitors, before.visitors, available),
    },
    series: seriesOf(byDay, window, bucket),
    previousSeries: query.compare && available ? seriesOf(prevByDay, prev, bucket) : null,
    ...cards,
    langsSince: metaValue(db, 'langs_since'),
    titles,
    annotations: empty
      ? []
      : content.published
          .filter((p) => p.day >= window.from && p.day <= window.to && p.day <= today)
          .sort((a, b) => a.day.localeCompare(b.day) || a.path.localeCompare(b.path))
          .map(({ day, path, title }) => ({ day, path, title })),
    live,
    vitals: { '7d': vitalsFor(dayMinus(today, 6)), '28d': vitalsFor(dayMinus(today, 27)) },
    attribution: {
      '7d': vitalAttributionSince(db, dayMinus(today, 6), scope),
      '28d': vitalAttributionSince(db, dayMinus(today, 27), scope),
    },
    vitalsScope: dims,
    page: pagePath && filtered ? pageDetail(db, window, filters, pagePath, cur.visitors, content) : null,
    generatedAt: now,
  }
}

/** Values of one dimension to offer in the filter picker (the period's, by visitors). */
export function getDimensionValues(query: ExploreQuery, dim: ExploreDimension, opts: ExploreOptions = {}): CountRow[] {
  const report = getExploreReport({ ...query, compare: false, filters: query.filters.filter((f) => f.dim !== dim) }, { ...opts, limit: 100 })
  const rows: Record<ExploreDimension, CountRow[]> = {
    page: report.topPages,
    source: report.referrers,
    country: report.countries,
    device: report.devices,
    browser: report.browsers,
    lang: report.languages,
  }
  return rows[dim]
}
