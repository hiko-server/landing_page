/**
 * Display a frontmatter date ("2024-05-01", "2024-05-01T00:00:00.000Z" or a
 * Date-ish string) as "May 1, 2024" in a timezone-stable way (UTC), so the
 * server render and the browser always agree. Unparseable input is shown
 * as-is; empty input returns ''.
 */
export function formatPostDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const raw = String(value).trim()
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Machine-readable YYYY-MM-DD for <time dateTime>; '' when unparseable. */
export function isoDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const raw = String(value).trim()
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}
