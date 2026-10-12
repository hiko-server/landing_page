/**
 * Date helpers for frontmatter values ("2024-05-01", full ISO timestamps,
 * Date-ish strings) and content-store timestamps (epoch ms). Everything is
 * computed in UTC so the server render and the browser always agree.
 */

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  // Epoch milliseconds (content-store updated_at). Small numbers are YAML
  // years (`date: 2024`) and fall through to the string parser.
  if (typeof value === 'number' && value > 1e11) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const raw = String(value).trim()
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Display a frontmatter date as "May 1, 2024". Unparseable input is shown
 * as-is; empty input returns ''.
 */
export function formatPostDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const d = toDate(value)
  if (!d) return String(value).trim()
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Machine-readable YYYY-MM-DD for <time dateTime>; '' when unparseable. */
export function isoDate(value: unknown): string {
  const d = toDate(value)
  return d ? d.toISOString().slice(0, 10) : ''
}

/**
 * The most recent of several dates (frontmatter strings and/or epoch-ms
 * numbers) as a full ISO-8601 timestamp — e.g. a sitemap <lastmod>.
 * Unparseable or empty values are ignored; '' when none is usable.
 */
export function latestDate(values: readonly unknown[]): string {
  let best: Date | null = null
  for (const v of values) {
    const d = toDate(v)
    if (d && (!best || d.getTime() > best.getTime())) best = d
  }
  return best ? best.toISOString() : ''
}
