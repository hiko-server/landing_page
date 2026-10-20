/**
 * Pure display helpers for the admin Goals sections (unit-tested).
 */
import { formatBucket } from './format'
import type { GoalsReport } from './eventsShared'

/** A share 0…1 as "42%", "4.2%", "0.4%", "<0.1%"; null → "—". */
export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—'
  if (rate <= 0) return '0%'
  const pct = rate * 100
  if (pct < 0.1) return '<0.1%'
  if (pct < 10) return `${(Math.round(pct * 10) / 10).toString()}%`
  return `${Math.round(pct)}%`
}

/** Share of `part` in `whole` (0…1), or null when there is no whole. */
export function shareOf(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

/** Width of a bar (percent of the track) for `value` against `max`: at least 1 % when non-zero, so a small count stays visible. */
export function barWidth(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0
  return Math.max(1, Math.min(100, (value / max) * 100))
}

/** "Oct 3 – Oct 20" (or one day). */
export function formatSpan(from: string, to: string): string {
  return from === to ? formatBucket(from) : `${formatBucket(from)} – ${formatBucket(to)}`
}

/** Loose shape check of GET /api/admin/goals. */
export function isGoalsReport(v: unknown): v is GoalsReport {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  const funnel = o.funnel as Record<string, unknown> | undefined
  const searches = o.searches as Record<string, unknown> | undefined
  return (
    Array.isArray(o.goals) &&
    typeof o.siteVisitors === 'number' &&
    !!funnel &&
    Array.isArray(funnel.steps) &&
    Array.isArray(funnel.sources) &&
    !!searches &&
    Array.isArray(searches.rows)
  )
}
