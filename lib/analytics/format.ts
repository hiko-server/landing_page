/**
 * Pure display helpers for the admin Analytics panel (unit-tested).
 */
import { RATING_LABEL, type VitalName, type VitalRating } from './shared'

const integer = new Intl.NumberFormat('en', { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

export function formatCount(n: number): string {
  return integer.format(n)
}

export function formatCompact(n: number): string {
  return n < 10_000 ? integer.format(n) : compact.format(n)
}

/** "+12%", "−8%", "±0%"; null delta → null (nothing to compare with). */
export function formatDelta(delta: number | null): string | null {
  if (delta === null || !Number.isFinite(delta)) return null
  const pct = Math.round(delta * 1000) / 10
  if (pct === 0) return '±0%'
  const abs = Math.abs(pct)
  const text = abs >= 10 ? Math.round(abs).toString() : abs.toString()
  return `${pct > 0 ? '+' : '−'}${text}%`
}

/** p75 as shown in the vitals table: CLS unitless with 2 decimals, timings in ms below 1 s, else seconds. */
export function formatVital(name: VitalName, value: number): string {
  if (name === 'CLS') return value.toFixed(2)
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)} s`
}

export function ratingLabel(rating: VitalRating): string {
  return RATING_LABEL[rating]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-03" → "Oct 3"; "2026-10" → "Oct 2026". */
export function formatBucket(key: string): string {
  const [y, m, d] = key.split('-')
  const month = MONTHS[Number(m) - 1] || m
  return d ? `${month} ${Number(d)}` : `${month} ${y}`
}

/** Upper bound for the chart's y axis: 1, 2, 2.5 or 5 × 10^n at or above `max` (at least 4). */
export function niceMax(max: number): number {
  if (max <= 4) return 4
  const exp = Math.pow(10, Math.floor(Math.log10(max)))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * exp >= max) return step * exp
  }
  return 10 * exp
}

let regionNames: Intl.DisplayNames | null | undefined

/** "JP" → "Japan" (falls back to the code). */
export function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
    } catch {
      regionNames = null
    }
  }
  try {
    return regionNames?.of(code) || code
  } catch {
    return code
  }
}
