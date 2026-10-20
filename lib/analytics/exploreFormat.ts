/**
 * Pure display helpers of the Analytics explore view (H10) — shared by the
 * admin panel, the CSV export and the weekly digest (unit-tested).
 */
import { countryName, formatBucket } from './format'
import { formatSpan } from './goalsFormat'
import { OTHER_KEY } from './shared'
import {
  DIMENSION_LABEL,
  PERIOD_LABEL,
  type Bucket,
  type DaySpan,
  type ExploreDimension,
  type ExploreFilter,
  type ExploreQuery,
} from './exploreShared'

let languageNames: Intl.DisplayNames | null | undefined

/** "en" → "English", "zh-hans" → "Chinese (Simplified)" (falls back to the tag). */
export function languageName(tag: string): string {
  if (languageNames === undefined) {
    try {
      languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
    } catch {
      languageNames = null
    }
  }
  try {
    return languageNames?.of(tag) || tag
  } catch {
    return tag
  }
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** How a stored dimension value reads in the panel ("JP" → "Japan (JP)", "mobile" → "Mobile"). */
export function filterValueLabel(dim: ExploreDimension, value: string): string {
  if (value === OTHER_KEY) return 'Other sites'
  switch (dim) {
    case 'country':
      return `${countryName(value)} (${value})`
    case 'device':
      return capitalize(value)
    case 'lang': {
      const name = languageName(value)
      return name === value ? value : `${name} (${value})`
    }
    default:
      return value
  }
}

/** "Page is /cv", "Country is not Japan (JP)". */
export function describeFilter(f: ExploreFilter): string {
  return `${DIMENSION_LABEL[f.dim]} ${f.op === 'is' ? 'is' : 'is not'} ${filterValueLabel(f.dim, f.value)}`
}

export function describeFilters(filters: readonly ExploreFilter[]): string {
  return filters.length ? filters.map(describeFilter).join(' · ') : 'None'
}

/** "Last 30 days", or "Oct 3 – Oct 20" for a custom period. */
export function periodLabel(q: Pick<ExploreQuery, 'period'>, span: DaySpan): string {
  return q.period === 'custom' ? formatSpanWithYear(span) : PERIOD_LABEL[q.period]
}

/** "Oct 3 – Oct 20", with the year when the span is not in the current year or crosses one. */
export function formatSpanWithYear(span: DaySpan, thisYear: string = new Date().toISOString().slice(0, 4)): string {
  const y1 = span.from.slice(0, 4)
  const y2 = span.to.slice(0, 4)
  if (y1 === y2 && y1 === thisYear) return formatSpan(span.from, span.to)
  if (span.from === span.to) return `${formatBucket(span.from)}, ${y1}`
  return y1 === y2 ? `${formatBucket(span.from)} – ${formatBucket(span.to)}, ${y2}` : `${formatBucket(span.from)}, ${y1} – ${formatBucket(span.to)}, ${y2}`
}

/** A chart bucket's name: "Oct 3", "Week of Oct 6", "Oct 2026". */
export function bucketLabel(key: string, bucket: Bucket): string {
  if (bucket === 'week') return `Week of ${formatBucket(key)}`
  return formatBucket(key)
}

/** Axis tick text (shorter than bucketLabel). */
export function bucketTick(key: string, bucket: Bucket): string {
  if (bucket === 'month') {
    const [y, m] = key.split('-')
    return `${formatBucket(`${y}-${m}`).split(' ')[0]} ’${y.slice(2)}`
  }
  return formatBucket(key)
}

/** "someone@example.com" → "s•••@example.com" (the digest card names the recipient without spelling it out). */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@')
  if (at < 1) return '•••'
  return `${address[0]}•••${address.slice(at)}`
}

/** A page path with its title when known: "The AI was the easy part (/blog/swcs)". */
export function pageLabel(path: string, titles: Record<string, string>): string {
  const t = titles[path]
  return t ? `${t} (${path})` : path
}

/**
 * A y scale whose ticks are whole numbers (counts are): 3–5 ticks from 0,
 * evenly spaced by 1, 2, 2.5 or 5 × 10ⁿ, the top at or above `max`.
 */
export function chartScale(max: number): { max: number; ticks: number[] } {
  const m = Number.isFinite(max) ? Math.max(0, max) : 0
  if (m <= 4) return { max: 4, ticks: [0, 2, 4] }
  const rough = m / 4
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  let step = 10 * pow
  for (const k of [1, 2, 2.5, 5, 10]) {
    const s = k * pow
    if (Number.isInteger(s) && s >= rough) {
      step = s
      break
    }
  }
  const top = step * Math.ceil(m / step)
  const ticks: number[] = []
  for (let t = 0; t <= top; t += step) ticks.push(t)
  return { max: top, ticks }
}

const LAST_N: Partial<Record<ExploreQuery['period'], string>> = { '7d': '7 days', '28d': '28 days', '30d': '30 days', '90d': '90 days', '12m': '12 months' }

/** "in the last 7 days", "today", "this month", "from Oct 1 to Oct 21" — the period in a sentence. */
export function periodPhrase(q: Pick<ExploreQuery, 'period'>, span: DaySpan, clipped = false): string {
  const n = LAST_N[q.period]
  if (n && !clipped) return `in the last ${n}`
  if (!clipped) {
    if (q.period === 'today') return 'today'
    if (q.period === 'yesterday') return 'yesterday'
    if (q.period === 'month') return 'this month'
    if (q.period === 'last-month') return 'last month'
  }
  if (span.from === span.to) return `on ${formatSpanWithYear(span)}`
  const [a, b] = formatSpanWithYear(span).split(' – ')
  return b ? `from ${a} to ${b}` : `on ${a}`
}

/** "the previous 7 days", "the day before", "the previous period". */
export function previousPhrase(q: Pick<ExploreQuery, 'period'>): string {
  const n = LAST_N[q.period]
  if (n) return `the previous ${n}`
  return q.period === 'today' || q.period === 'yesterday' ? 'the day before' : 'the previous period'
}
