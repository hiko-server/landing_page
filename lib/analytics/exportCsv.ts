/**
 * CSV export of an Analytics explore view (H10, GET
 * /api/admin/analytics/export). Pure: builds RFC 4180 tables from the
 * reports (lib/analytics/explore, goalsQuery); the route adds the zip.
 *
 *   - UTF-8 with a byte-order mark (spreadsheet apps then read titles in
 *     Chinese correctly), CRLF line ends, every text cell quoted when needed.
 *   - A text cell that a spreadsheet would run as a formula (starting with
 *     = + - @, a tab or a carriage return) is prefixed with an apostrophe.
 *   - Aggregates only, as on screen: no visitor hash ever reaches a report.
 *     The texts of searches that found nothing are NOT exported — /colophon
 *     promises they are deleted after 35 days, and a file on someone's disk
 *     would outlive that; their count is.
 */
import { GOAL_LABEL, GOAL_PROP_LABEL, NO_REFERRER, propLabel, type GoalsReport } from './eventsShared'
import type { ExploreReport } from './explore'
import { countryName } from './format'
import { describeFilters, languageName, periodLabel } from './exploreFormat'
import { OTHER_KEY } from './shared'

export type Cell = string | number | null | undefined

const FORMULA_START = /^[=+\-@\t\r]/

/** One CSV field. */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  let s = String(v)
  if (FORMULA_START.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s
}

/** A whole table: BOM, header, rows, CRLF. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly Cell[]>): string {
  const lines = [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))]
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export const EXPORT_TABLES = [
  'summary',
  'visitors',
  'pages',
  'referrers',
  'countries',
  'devices',
  'browsers',
  'languages',
  'goals',
  'goal-details',
  'conversion',
  'paths',
] as const
export type ExportTable = (typeof EXPORT_TABLES)[number]

export const EXPORT_TABLE_LABEL: Record<ExportTable, string> = {
  summary: 'Summary',
  visitors: 'Visitors over time',
  pages: 'Pages',
  referrers: 'Referrers',
  countries: 'Countries',
  devices: 'Devices',
  browsers: 'Browsers',
  languages: 'Page languages',
  goals: 'Goals',
  'goal-details': 'Goal details',
  conversion: 'Conversion',
  paths: 'Paths to a goal',
}

export function isExportTable(v: unknown): v is ExportTable {
  return typeof v === 'string' && (EXPORT_TABLES as readonly string[]).includes(v)
}

const rate = (r: number | null) => (r === null ? null : Math.round(r * 10_000) / 10_000)

/** "analytics_2026-09-22_2026-10-21[_filtered]" (no extension). */
export function exportBaseName(report: Pick<ExploreReport, 'window' | 'mode'>): string {
  return `analytics_${report.window.from}_${report.window.to}${report.mode === 'raw' ? '_filtered' : ''}`
}

/** Every table of the view, as CSV text, by name. */
export function buildExportTables(report: ExploreReport, goals: GoalsReport, now: Date = new Date()): Record<ExportTable, string> {
  const t = report.titles
  const prevOk = report.previous.available
  const summary: Cell[][] = [
    ['period', periodLabel(report.query, report.period)],
    ['period_from', report.period.from],
    ['period_to', report.period.to],
    ['covered_from', report.window.empty ? null : report.window.from],
    ['covered_to', report.window.empty ? null : report.window.to],
    ['data', report.mode === 'raw' ? 'detailed page views (kept 35 days; filters need them)' : 'daily totals'],
    ['filters', describeFilters(report.query.filters)],
    ['compared_from', prevOk ? report.previous.from : null],
    ['compared_to', prevOk ? report.previous.to : null],
    ['views', report.kpis.views.value],
    ['views_previous', prevOk ? report.kpis.views.previous : null],
    ['visitor_days', report.kpis.visitors.value],
    ['visitor_days_previous', prevOk ? report.kpis.visitors.previous : null],
    ['searches_with_no_results', goals.searches.rows.reduce((n, r) => n + r.events, 0)],
    ['generated_at', now.toISOString()],
    ['note', 'Unique counts are visitor-days: the visitor hash changes every UTC day. Days are UTC.'],
    ['note', 'The texts of searches with no results are not exported: they are kept 35 days only.'],
  ]
  const prevSeries = report.previousSeries
  const visitors: Cell[][] = report.series.map((p, i) => {
    const row: Cell[] = [p.key, p.views, p.visitors]
    if (prevSeries) {
      const q = prevSeries[i]
      row.push(q?.key ?? null, q?.views ?? null, q?.visitors ?? null)
    }
    return row
  })
  const counts = (rows: ExploreReport['topPages'], label: (k: string) => Cell[]) => rows.map((r) => [...label(r.key), r.visitors, r.views ?? null])

  const goalRows: Cell[][] = goals.goals.map((g) => [
    g.name,
    GOAL_LABEL[g.name],
    g.visitors.value,
    g.events,
    rate(g.rate),
    goals.comparable ? g.visitors.previous : null,
  ])
  const detailRows: Cell[][] = goals.goals.flatMap((g) =>
    g.props.map((p) => [g.name, GOAL_PROP_LABEL[g.name] || 'Detail', p.key, propLabel(g.name, p.key), p.visitors, p.events]),
  )
  const funnel = goals.funnel
  const conversion: Cell[][] = funnel.steps.map((s, i) => [i + 1, s.label, s.visitors, funnel.source ?? 'all visitors', funnel.from, funnel.to])
  if (funnel.directDownloads > 0) conversion.push([null, 'Downloaded a CV file without viewing a page that day', funnel.directDownloads, null, funnel.from, funnel.to])
  const paths = goals.paths
  const pathRows: Cell[][] = paths
    ? [
        ...paths.paths.map((p) => [paths.goal, p.source === NO_REFERRER ? 'no referrer' : p.source, p.pages.join(' > '), p.visitors]),
        ...(paths.other ? [[paths.goal, 'other paths', null, paths.other]] : []),
        ...(paths.noPageView ? [[paths.goal, 'no page view before it that day', null, paths.noPageView]] : []),
      ]
    : []

  return {
    summary: toCsv(['key', 'value'], summary),
    visitors: toCsv(
      [report.bucket, 'views', 'visitor_days', ...(prevSeries ? [`previous_${report.bucket}`, 'previous_views', 'previous_visitor_days'] : [])],
      visitors,
    ),
    pages: toCsv(['page', 'title', 'visitor_days', 'views'], counts(report.topPages, (k) => [k, t[k] ?? null])),
    referrers: toCsv(
      ['referrer', 'visitor_days'],
      report.referrers.map((r) => [r.key === OTHER_KEY ? 'other sites' : r.key, r.visitors]),
    ),
    countries: toCsv(['country_code', 'country', 'visitor_days', 'views'], counts(report.countries, (k) => [k, countryName(k)])),
    devices: toCsv(['device', 'visitor_days', 'views'], counts(report.devices, (k) => [k])),
    browsers: toCsv(['browser', 'visitor_days', 'views'], counts(report.browsers, (k) => [k])),
    languages: toCsv(['page_language', 'language', 'visitor_days', 'views'], counts(report.languages, (k) => [k, languageName(k)])),
    goals: toCsv(['goal', 'label', 'visitor_days', 'events', 'conversion_rate', 'previous_visitor_days'], goalRows),
    'goal-details': toCsv(['goal', 'detail', 'value', 'label', 'visitor_days', 'events'], detailRows),
    conversion: toCsv(['step', 'label', 'visitor_days', 'source', 'from', 'to'], conversion),
    paths: toCsv(['goal', 'source', 'pages', 'visitor_days'], pathRows),
  }
}
