/**
 * Contact-message retention (CONTACT_RETENTION_DAYS) — pure helpers.
 *
 *   unset / blank   → DEFAULT_RETENTION_DAYS (365)
 *   0               → no automatic expiry (messages stay until deleted)
 *   1 … 3650        → that many days (decimals are floored)
 *   anything else   → the default
 *
 * Client-safe: nothing reads the environment at import time, so the form
 * can import the wording helpers; the server passes the parsed value.
 */

export const DEFAULT_RETENTION_DAYS = 365
export const MAX_RETENTION_DAYS = 3650
const DAY_MS = 86_400_000

/** Parse CONTACT_RETENTION_DAYS (server only when called without an argument). */
export function contactRetentionDays(raw: string | undefined = process.env.CONTACT_RETENTION_DAYS): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_RETENTION_DAYS
  const n = Number(raw.trim())
  if (!Number.isFinite(n) || n < 0) return DEFAULT_RETENTION_DAYS
  return Math.min(Math.floor(n), MAX_RETENTION_DAYS)
}

/** Messages received before this instant are expired; null when retention is off. */
export function retentionCutoff(now: number, days: number): number | null {
  if (!Number.isFinite(days) || days <= 0) return null
  return now - days * DAY_MS
}

/** True when an ISO timestamp lies before the cutoff. Unparseable timestamps never count as expired. */
export function isExpired(at: string, cutoff: number | null): boolean {
  if (cutoff === null) return false
  const t = Date.parse(at)
  return Number.isFinite(t) && t < cutoff
}

/**
 * "12 months", "6 months", "2 years", "90 days", "1 day" — the period as a
 * person would say it (whole months / years when the day count is one).
 */
export function retentionPeriodText(days: number): string {
  const d = Math.floor(days)
  if (d <= 0) return ''
  if (d % 365 === 0) {
    const years = d / 365
    return years === 1 ? '12 months' : `${years} years`
  }
  if (d % 30 === 0 && d < 365) {
    const months = d / 30
    return months === 1 ? '1 month' : `${months} months`
  }
  return d === 1 ? '1 day' : `${d} days`
}
