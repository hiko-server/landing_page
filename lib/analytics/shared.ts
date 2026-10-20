import type { VitalAttributionRow } from './attribution'

/**
 * Pure analytics rules shared by the browser beacon (lib/analytics/client),
 * the ingest endpoint (lib/analytics/ingest), the report (lib/analytics/query)
 * and the admin panel. No Node or DOM APIs here.
 */

/** Core Web Vitals we record (FID is retired in favour of INP). */
export const VITAL_NAMES = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const
export type VitalName = (typeof VITAL_NAMES)[number]
export type VitalRating = 'good' | 'needs-improvement' | 'poor'

/** web.dev thresholds: value ≤ good → good, ≤ poor → needs improvement, else poor. CLS is unitless, the rest ms. */
export const VITAL_THRESHOLDS: Record<VitalName, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
}

export const RATING_LABEL: Record<VitalRating, string> = {
  good: 'Good',
  'needs-improvement': 'Needs improvement',
  poor: 'Poor',
}

export function isVitalName(name: unknown): name is VitalName {
  return typeof name === 'string' && (VITAL_NAMES as readonly string[]).includes(name)
}

export function rateVital(name: VitalName, value: number): VitalRating {
  const t = VITAL_THRESHOLDS[name]
  return value <= t.good ? 'good' : value <= t.poor ? 'needs-improvement' : 'poor'
}

/** Plausible range of a real measurement: CLS 0–10, timings 0–60 000 ms. */
export function isVitalValueInRange(name: VitalName, value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return false
  return name === 'CLS' ? value <= 10 : value <= 60_000
}

/** Navigation types reported by the Navigation Timing API (web-vitals' navigationType). */
export const NAV_TYPES = ['navigate', 'reload', 'back-forward', 'back-forward-cache', 'prerender', 'restore'] as const
export type NavType = (typeof NAV_TYPES)[number]

export function normalizeNavType(raw: unknown): NavType | null {
  if (typeof raw !== 'string') return null
  const v = raw.replace(/_/g, '-')
  return (NAV_TYPES as readonly string[]).includes(v) ? (v as NavType) : null
}

const SLUG_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,120}$/

/**
 * Map a reported location to the public page it counts for, or null when
 * the path is not one we measure. The query string and hash are dropped
 * (`/cv?lang=zh` / `?lang=cn` → `/cv/zh`), a trailing slash is ignored.
 *
 * Measured: /, /about, /cv, /cv/zh, /blog, /blog/<slug>, /work, /work/<slug>,
 * /now, /uses, /contact, /colophon, /publications.
 */
export function normalizeTrackedPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.length > 512) return null
  const hashless = raw.split('#')[0]
  const q = hashless.indexOf('?')
  let pathname = q === -1 ? hashless : hashless.slice(0, q)
  const query = q === -1 ? '' : hashless.slice(q + 1)
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '')
  if (pathname === '') pathname = '/'

  if (pathname === '/cv') {
    const lang = new URLSearchParams(query).get('lang')
    return lang === 'zh' || lang === 'cn' ? '/cv/zh' : '/cv'
  }
  if (['/', '/about', '/cv/zh', '/blog', '/work', '/now', '/uses', '/contact', '/colophon', '/publications'].includes(pathname)) {
    return pathname
  }
  const m = /^\/(blog|work)\/([^/]+)$/.exec(pathname)
  if (m && SLUG_SEGMENT.test(m[2])) return `/${m[1]}/${m[2]}`
  return null
}

const HOST_LABEL = '[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?'
const PLAUSIBLE_HOST = new RegExp(`^(?:${HOST_LABEL}\\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$`)

/**
 * A lowercased host that looks like a real public name: dot-separated LDH
 * labels (1–63 chars) ending in an alphabetic or punycode TLD, ≤ 253 chars.
 * IP literals, single-label names (localhost) and anything with odd
 * characters are not referrers worth naming.
 */
export function isPlausibleHost(host: unknown): host is string {
  return typeof host === 'string' && host.length <= 253 && PLAUSIBLE_HOST.test(host)
}

/** Report row that sums every referrer not listed by name. */
export const OTHER_KEY = '(other)'

/** UTC day "YYYY-MM-DD". */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** UTC day `n` days before `day` (negative n = after). */
export function dayMinus(day: string, n: number): string {
  return utcDay(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000)
}

export const ANALYTICS_RANGES = ['7d', '30d', '12m'] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]

export function parseRange(raw: unknown): AnalyticsRange {
  return typeof raw === 'string' && (ANALYTICS_RANGES as readonly string[]).includes(raw) ? (raw as AnalyticsRange) : '30d'
}

// ── Report shape (GET /api/admin/analytics) ───────────────────────────────

export type Kpi = {
  value: number
  previous: number
  /** Relative change vs the previous period (0.25 = +25 %); null when the previous period has no data. */
  delta: number | null
}

export type SeriesPoint = {
  /** "YYYY-MM-DD" for 7d / 30d, "YYYY-MM" for 12m. */
  key: string
  views: number
  visitors: number
}

export type CountRow = { key: string; visitors: number; views?: number }

export type VitalP75 = {
  /** A measured path, or '*' for all pages together. */
  route: string
  name: VitalName
  p75: number
  samples: number
  rating: VitalRating
}

export type AnalyticsReport = {
  range: AnalyticsRange
  from: string
  to: string
  bucket: 'day' | 'month'
  kpis: { views: Kpi; visitors: Kpi }
  series: SeriesPoint[]
  topPages: CountRow[]
  /** Top referrer hosts; a last OTHER_KEY row sums the hosts not named (see lib/analytics/query). */
  referrers: CountRow[]
  countries: CountRow[]
  devices: CountRow[]
  browsers: CountRow[]
  /** Distinct visitors seen in the last 5 minutes. */
  live: number
  vitals: { '7d': VitalP75[]; '28d': VitalP75[] }
  /** Where LCP / INP / CLS come from, per page and element (lib/analytics/attribution). */
  attribution: { '7d': VitalAttributionRow[]; '28d': VitalAttributionRow[] }
  generatedAt: number
}
