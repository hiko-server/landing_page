import type { ItemSchedule } from '../../../lib/schedule/fields'
import { MIN_LEAD_MS } from '../../../lib/schedule/fields'
import { SCHEDULE_TIME_ZONE, formatInstant, relativeInstant, sameWallTime, zoneLabel, zonedParts, zonedToInstant } from '../../../lib/schedule/time'

/**
 * Pure helpers of the schedule UI (H5): the editor's dialog and banner, the
 * list badges and the Publishing page. Unit tested; client-safe.
 */

export type ItemScheduleView = ItemSchedule

/** What the editor sends with POST { action: 'schedule' } (ISO instants or null). */
export type ScheduleChange = {
  publishAt: string | null
  unpublishAt: string | null
  setDate?: boolean
  markUpdated?: boolean
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** The schedule from an API answer (null when absent or malformed). */
export function parseItemSchedule(raw: unknown): ItemScheduleView | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const publishes = o.publishes === 'draft' || o.publishes === 'changes' ? o.publishes : null
  const publishAt = num(o.publishAt)
  return { publishAt, unpublishAt: num(o.unpublishAt), publishes: publishAt === null ? null : publishes }
}

/** True when anything is scheduled. */
export function isScheduled(s: ItemScheduleView | null | undefined): s is ItemScheduleView {
  return !!s && (s.publishAt !== null || s.unpublishAt !== null)
}

/**
 * "Sun 25 Oct 2026, 09:00 HKT" plus, when the browser is elsewhere,
 * " · 02:00 London · GMT+1" — the Hong Kong time first, always.
 */
export function bothZones(ms: number, browserZone: string): { site: string; local: string | null } {
  const site = `${formatInstant(ms, SCHEDULE_TIME_ZONE)} HKT`
  if (sameWallTime(ms, SCHEDULE_TIME_ZONE, browserZone)) return { site, local: null }
  const sameDay = zonedParts(ms, SCHEDULE_TIME_ZONE).date === zonedParts(ms, browserZone).date
  const local = sameDay ? zonedParts(ms, browserZone).time : formatInstant(ms, browserZone, { year: false })
  return { site, local: `${local} ${zoneLabel(ms, browserZone)}` }
}

/** One line for a badge or a list: "Publishes Sun 25 Oct, 09:00 HKT". */
export function scheduleSummary(s: ItemScheduleView, now: number): string | null {
  if (s.publishAt !== null) {
    const verb = s.publishes === 'changes' ? 'Changes go live' : 'Publishes'
    return `${verb} ${formatInstant(s.publishAt, SCHEDULE_TIME_ZONE, { year: false })} HKT${s.publishAt <= now ? ' (due now)' : ''}`
  }
  if (s.unpublishAt !== null) return `Unpublishes ${formatInstant(s.unpublishAt, SCHEDULE_TIME_ZONE, { year: false })} HKT`
  return null
}

export { relativeInstant }

export type SchedulePreset = { id: string; label: string; at: number }

/**
 * Quick picks in the chosen zone, like a mail client's "schedule send":
 * later today (the next full hour two hours on), tomorrow at 09:00, the
 * coming Monday at 09:00. Presets in the past or too close are left out.
 */
export function schedulePresets(now: number, zone: string): SchedulePreset[] {
  const out: SchedulePreset[] = []
  const today = zonedParts(now, zone)
  const add = (id: string, label: string, at: number | null) => {
    if (at !== null && at - now >= 15 * 60_000 && !out.some((p) => p.at === at)) out.push({ id, label, at })
  }
  // Later today: two hours on, rounded up to the hour, if still before 21:00.
  const [h] = today.time.split(':').map(Number)
  const later = h + 3
  if (later <= 21) add('later', 'Later today', zonedToInstant(today.date, `${String(later).padStart(2, '0')}:00`, zone))
  const dayAfter = (date: string, days: number) => {
    const [y, m, d] = date.split('-').map(Number)
    const t = new Date(Date.UTC(y, m - 1, d + days))
    return t.toISOString().slice(0, 10)
  }
  add('tomorrow', 'Tomorrow morning', zonedToInstant(dayAfter(today.date, 1), '09:00', zone))
  const [y, m, d] = today.date.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 Sunday … 6 Saturday
  const toMonday = ((8 - weekday) % 7) || 7
  add('monday', 'Monday morning', zonedToInstant(dayAfter(today.date, toMonday), '09:00', zone))
  return out
}

/** The date / time inputs' values for an instant in a zone. */
export function inputsFor(ms: number, zone: string): { date: string; time: string } {
  return zonedParts(ms, zone)
}

/** Validation message for a picked publish time (null when fine). */
export function publishTimeProblem(at: number | null, now: number): string | null {
  if (at === null) return 'Pick a date and a time.'
  if (at - now < MIN_LEAD_MS) return 'That time has passed — pick a later one, or publish now.'
  return null
}
