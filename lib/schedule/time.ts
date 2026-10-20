/**
 * Instants and wall-clock times for scheduled publishing (H5). Pure and
 * client-safe: the schedule dialog, the editor banner, the admin lists, the
 * activity-log summaries and the server all use these helpers, so a time is
 * read and printed the same way everywhere.
 *
 * A schedule is stored as an absolute instant (ISO 8601 in UTC, e.g.
 * "2026-10-25T01:00:00.000Z" in the frontmatter's `publishAt`). The owner
 * picks a date and a time in a time zone — Hong Kong (the site's zone)
 * or the browser's — and every display shows the
 * instant in Hong Kong time, plus the browser's zone when that differs.
 * Conversions use Intl only (no time-zone database is shipped): a wall time
 * that does not exist in a zone (the hour skipped when clocks go forward) is
 * moved forward by the gap; an ambiguous one (the repeated hour) takes the
 * earlier instant.
 */

/**
 * The site's zone (lib/clock SITE_TIME_ZONE — not imported: lib/clock is a
 * React module and this one also runs in the instrumentation bundle, where
 * React's client APIs are refused; a unit test keeps the two equal).
 */
export const SCHEDULE_TIME_ZONE = 'Asia/Hong_Kong'

/** Full ISO 8601 instant with a zone designator (Z or ±hh:mm / ±hhmm); seconds and milliseconds optional. */
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Epoch ms of a stored schedule value: an ISO instant string with a zone
 * (a Date that YAML parsing produced is accepted too). Anything else —
 * a date without a time, a time without a zone, garbage — is null, so an
 * ambiguous value never schedules anything.
 */
export function parseInstant(value: unknown): number | null {
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isFinite(t) ? t : null
  }
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!INSTANT_RE.test(raw)) return null
  const t = Date.parse(raw)
  return Number.isFinite(t) ? t : null
}

/** The stored form of an instant: ISO 8601 in UTC with milliseconds. */
export function toInstantString(ms: number): string {
  return new Date(ms).toISOString()
}

/** True for a time zone name Intl understands (e.g. "Europe/London"). */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || !zone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** The browser's (or server's) own time zone, falling back to the site's. */
export function localTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimeZone(zone) ? zone : SCHEDULE_TIME_ZONE
  } catch {
    return SCHEDULE_TIME_ZONE
  }
}

const partsCache = new Map<string, Intl.DateTimeFormat>()

function partsFormat(zone: string): Intl.DateTimeFormat {
  let f = partsCache.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsCache.set(zone, f)
  }
  return f
}

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number }

function wallOf(ms: number, zone: string): Wall {
  const parts = partsFormat(zone).formatToParts(new Date(ms))
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { y: n('year'), mo: n('month'), d: n('day'), h: n('hour') % 24, mi: n('minute'), s: n('second') }
}

/** Offset of `zone` from UTC at the instant `ms`, in minutes (Hong Kong: +480). */
export function zoneOffsetMinutes(ms: number, zone: string): number {
  const w = wallOf(ms, zone)
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The wall-clock date ("YYYY-MM-DD") and time ("HH:MM") of an instant in a zone. */
export function zonedParts(ms: number, zone: string = SCHEDULE_TIME_ZONE): { date: string; time: string } {
  const w = wallOf(ms, zone)
  return { date: `${w.y}-${pad(w.mo)}-${pad(w.d)}`, time: `${pad(w.h)}:${pad(w.mi)}` }
}

/** The calendar day ("YYYY-MM-DD") of an instant in a zone — Hong Kong by default. */
export function zonedDay(ms: number, zone: string = SCHEDULE_TIME_ZONE): string {
  return zonedParts(ms, zone).date
}

/**
 * The instant at which the wall clock in `zone` shows `date` ("YYYY-MM-DD")
 * and `time` ("HH:MM"); null for malformed input. Skipped wall times move
 * forward by the gap, repeated ones resolve to the earlier instant.
 */
export function zonedToInstant(date: string, time: string, zone: string = SCHEDULE_TIME_ZONE): number | null {
  const dm = DATE_RE.exec(date)
  const tm = TIME_RE.exec(time)
  if (!dm || !tm || !isValidTimeZone(zone)) return null
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])]
  const [h, mi] = [Number(tm[1]), Number(tm[2])]
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  // The date must exist (no 31 February).
  const check = new Date(guess)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null
  // Two candidate offsets: the zone's offset around the guess (before and after a possible transition).
  const offsets = Array.from(new Set([zoneOffsetMinutes(guess - 86_400_000, zone), zoneOffsetMinutes(guess, zone), zoneOffsetMinutes(guess + 86_400_000, zone)]))
  const matches = offsets
    .map((off) => guess - off * 60_000)
    .filter((t) => {
      const p = zonedParts(t, zone)
      return p.date === date && p.time === time
    })
    .sort((a, b) => a - b)
  if (matches.length) return matches[0]
  // A wall time inside a forward gap: shift by the gap (use the offset in effect before it).
  const before = zoneOffsetMinutes(guess - 86_400_000, zone)
  return guess - before * 60_000
}

// ── Display ──────────────────────────────────────────────────────────────

/** "Sun 25 Oct 2026, 09:00" — the instant's wall time in `zone` (24-hour clock, English). */
export function formatInstant(ms: number, zone: string = SCHEDULE_TIME_ZONE, opts: { year?: boolean; weekday?: boolean } = {}): string {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: opts.weekday === false ? undefined : 'short',
    day: 'numeric',
    month: 'short',
    year: opts.year === false ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return f.format(new Date(ms)).replace(/^(\w{3}),/, '$1')
}

/** "GMT+8", "GMT-4", "GMT+5:30" — the zone's UTC offset at the instant. */
export function offsetLabel(ms: number, zone: string): string {
  const off = zoneOffsetMinutes(ms, zone)
  if (off === 0) return 'GMT'
  const sign = off > 0 ? '+' : '-'
  const abs = Math.abs(off)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `GMT${sign}${h}${m ? `:${pad(m)}` : ''}`
}

/** A place name for a zone id: "Europe/London" → "London", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(zone: string): string {
  if (zone === 'UTC' || zone === 'Etc/UTC') return 'UTC'
  const last = zone.split('/').pop() || zone
  return last.replace(/_/g, ' ')
}

/** Short label of a zone at an instant: "HKT" for Hong Kong, else "London · GMT+1". */
export function zoneLabel(ms: number, zone: string): string {
  if (zone === SCHEDULE_TIME_ZONE) return 'HKT'
  return `${zoneCity(zone)} · ${offsetLabel(ms, zone)}`
}

/** True when two zones show the same wall time at `ms` (then one label is enough). */
export function sameWallTime(ms: number, a: string, b: string): boolean {
  return zoneOffsetMinutes(ms, a) === zoneOffsetMinutes(ms, b)
}

/** "Sun 25 Oct 2026, 09:00 HKT" — what the site's activity log and lists print. */
export function formatSiteTime(ms: number, opts: { year?: boolean; weekday?: boolean } = {}): string {
  return `${formatInstant(ms, SCHEDULE_TIME_ZONE, opts)} HKT`
}

/**
 * "in 3 days", "in 5 h 20 min", "in 4 min", "in under a minute", and the
 * same in the past ("2 h ago"). Coarse on purpose: it sits next to the exact time.
 */
export function relativeInstant(ms: number, now: number): string {
  const diff = ms - now
  const future = diff >= 0
  const abs = Math.abs(diff)
  const min = Math.floor(abs / 60_000)
  let text: string
  if (min < 1) return future ? 'in under a minute' : 'just now'
  if (min < 60) text = `${min} min`
  else if (min < 48 * 60) {
    const h = Math.floor(min / 60)
    const m = min % 60
    text = m && h < 10 ? `${h} h ${m} min` : `${h} h`
  } else {
    const days = Math.round(min / (24 * 60))
    text = `${days} days`
  }
  return future ? `in ${text}` : `${text} ago`
}
