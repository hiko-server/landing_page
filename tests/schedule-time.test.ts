/**
 * H5 — scheduled publishing: instants, wall-clock times and time zones
 * (lib/schedule/time), and the schedule rules of the frontmatter
 * (lib/schedule/fields). Pure.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCHEDULE_TIME_ZONE,
  formatInstant,
  formatSiteTime,
  offsetLabel,
  parseInstant,
  relativeInstant,
  sameWallTime,
  toInstantString,
  zoneCity,
  zoneLabel,
  zoneOffsetMinutes,
  zonedDay,
  zonedParts,
  zonedToInstant,
} from '../lib/schedule/time'
import { SITE_TIME_ZONE } from '../lib/clock'
import {
  MIN_LEAD_MS,
  carryScheduleOnSave,
  checkSchedule,
  hasScheduleKeys,
  itemSchedule,
  parseScheduleBody,
  publishDay,
  withSchedule,
  withoutSchedule,
} from '../lib/schedule/fields'

const T = Date.UTC(2026, 9, 25, 1, 0) // Sun 25 Oct 2026, 09:00 in Hong Kong

test('instants: only full ISO 8601 times with a zone count; Dates from YAML too', () => {
  assert.equal(SCHEDULE_TIME_ZONE, SITE_TIME_ZONE)
  assert.equal(parseInstant('2026-10-25T01:00:00.000Z'), T)
  assert.equal(parseInstant('2026-10-25T09:00+08:00'), T)
  assert.equal(parseInstant('2026-10-25T09:00:00+0800'), T)
  assert.equal(parseInstant(new Date(T)), T)
  for (const bad of ['2026-10-25', '2026-10-25T09:00', 'tomorrow', '', null, undefined, 42, '2026-13-40T09:00Z']) {
    assert.equal(parseInstant(bad), null, String(bad))
  }
  assert.equal(toInstantString(T), '2026-10-25T01:00:00.000Z')
})

test('wall clock ↔ instant in Hong Kong (no daylight saving) and other zones', () => {
  assert.deepEqual(zonedParts(T), { date: '2026-10-25', time: '09:00' })
  assert.equal(zonedDay(Date.UTC(2026, 9, 24, 16, 30)), '2026-10-25', 'after 16:00 UTC it is the next day in Hong Kong')
  assert.equal(zonedToInstant('2026-10-25', '09:00'), T)
  assert.equal(zoneOffsetMinutes(T, 'Asia/Hong_Kong'), 480)
  assert.equal(zoneOffsetMinutes(T, 'Asia/Kolkata'), 330)
  assert.equal(zonedToInstant('2026-10-25', '09:00', 'Europe/London'), Date.UTC(2026, 9, 25, 9, 0), 'London is on GMT after 25 Oct 2026, 01:00 UTC')
  assert.equal(zonedToInstant('2026-07-01', '09:00', 'Europe/London'), Date.UTC(2026, 6, 1, 8, 0), 'BST')
  // Round trip in several zones.
  for (const zone of ['Asia/Hong_Kong', 'Europe/London', 'America/New_York', 'Australia/Adelaide', 'Asia/Kolkata']) {
    const ms = zonedToInstant('2026-11-03', '18:45', zone)
    assert.ok(ms !== null)
    assert.deepEqual(zonedParts(ms!, zone), { date: '2026-11-03', time: '18:45' }, zone)
  }
  assert.equal(zonedToInstant('2026-02-31', '09:00'), null, 'no 31 February')
  assert.equal(zonedToInstant('2026-10-25', '24:00'), null)
  assert.equal(zonedToInstant('2026-10-25', '09:00', 'Mars/Olympus'), null)
})

test('daylight-saving edges: a skipped wall time moves forward, a repeated one takes the earlier instant', () => {
  // New York springs forward on 8 March 2026: 02:30 does not exist.
  const gap = zonedToInstant('2026-03-08', '02:30', 'America/New_York')
  assert.deepEqual(zonedParts(gap!, 'America/New_York'), { date: '2026-03-08', time: '03:30' })
  // It falls back on 1 November 2026: 01:30 happens twice (EDT, then EST).
  const twice = zonedToInstant('2026-11-01', '01:30', 'America/New_York')
  assert.equal(twice, Date.UTC(2026, 10, 1, 5, 30), 'the EDT one, an hour earlier')
})

test('display: Hong Kong time first, the device zone only when it differs', () => {
  assert.equal(formatInstant(T), 'Sun 25 Oct 2026, 09:00')
  assert.equal(formatInstant(T, SCHEDULE_TIME_ZONE, { year: false }), 'Sun 25 Oct, 09:00')
  assert.equal(formatSiteTime(T), 'Sun 25 Oct 2026, 09:00 HKT')
  assert.equal(offsetLabel(T, 'Asia/Hong_Kong'), 'GMT+8')
  assert.equal(offsetLabel(T, 'Europe/London'), 'GMT')
  assert.equal(offsetLabel(T, 'Asia/Kolkata'), 'GMT+5:30')
  assert.equal(offsetLabel(T, 'America/New_York'), 'GMT-4')
  assert.equal(zoneLabel(T, 'Asia/Hong_Kong'), 'HKT')
  assert.equal(zoneLabel(T, 'America/Argentina/Buenos_Aires'), 'Buenos Aires · GMT-3')
  assert.equal(zoneCity('Etc/UTC'), 'UTC')
  assert.ok(sameWallTime(T, 'Asia/Hong_Kong', 'Asia/Shanghai'))
  assert.ok(!sameWallTime(T, 'Asia/Hong_Kong', 'Europe/London'))
})

test('relative times are coarse and say which way', () => {
  const now = T
  assert.equal(relativeInstant(now + 20_000, now), 'in under a minute')
  assert.equal(relativeInstant(now + 4 * 60_000, now), 'in 4 min')
  assert.equal(relativeInstant(now + (5 * 60 + 20) * 60_000, now), 'in 5 h 20 min')
  assert.equal(relativeInstant(now + 30 * 3_600_000, now), 'in 30 h')
  assert.equal(relativeInstant(now + 3 * 86_400_000, now), 'in 3 days')
  assert.equal(relativeInstant(now - 2 * 3_600_000, now), '2 h ago')
  assert.equal(relativeInstant(now - 10_000, now), 'just now')
})

// ── The schedule in the frontmatter ─────────────────────────────────────

const iso = (ms: number) => new Date(ms).toISOString()

test('effective schedule: a draft publishes itself; a live item publishes its pending changes and may unpublish', () => {
  const draft = { title: 'D', draft: true, publishAt: iso(T), unpublishAt: iso(T + 86_400_000) }
  assert.deepEqual(itemSchedule(draft, null), { publishAt: T, unpublishAt: T + 86_400_000, publishes: 'draft' })
  assert.deepEqual(itemSchedule({ ...draft, unpublishAt: iso(T - 1) }, null), { publishAt: T, unpublishAt: null, publishes: 'draft' }, 'an end before the start is no window')
  assert.deepEqual(itemSchedule({ title: 'D', draft: true, unpublishAt: iso(T) }, null), { publishAt: null, unpublishAt: null, publishes: null }, 'nothing without a start')
  const live = { title: 'L', unpublishAt: iso(T + 3_600_000), publishAt: iso(T) }
  assert.deepEqual(itemSchedule(live, null), { publishAt: null, unpublishAt: T + 3_600_000, publishes: null }, 'a stray publishAt on a live row means nothing')
  assert.deepEqual(itemSchedule(live, { title: 'L2', publishAt: iso(T) }), { publishAt: T, unpublishAt: T + 3_600_000, publishes: 'changes' })
  assert.deepEqual(itemSchedule(null, null), { publishAt: null, unpublishAt: null, publishes: null })
  assert.ok(hasScheduleKeys(draft))
  assert.ok(!hasScheduleKeys(withoutSchedule(draft)))
  assert.deepEqual(withSchedule({ a: 1, publishAt: 'x' }, { unpublishAt: T }), { a: 1, unpublishAt: iso(T) })
  assert.equal(publishDay(Date.UTC(2026, 9, 24, 17)), '2026-10-25', 'the day in Hong Kong')
})

test('saves keep the stored schedule — never the client’s — and end it when it no longer applies', () => {
  const now = T - 86_400_000
  const draftRow = { title: 'D', draft: true, publishAt: iso(T), unpublishAt: iso(T + 7 * 86_400_000) }
  const incoming = { title: 'D edited', draft: true, publishAt: iso(now + 1000), unpublishAt: 'forged' }
  assert.deepEqual(carryScheduleOnSave({ target: 'live', live: draftRow, pending: null, incoming, now }), {
    title: 'D edited',
    draft: true,
    publishAt: iso(T),
    unpublishAt: iso(T + 7 * 86_400_000),
  })
  // Published by hand now: the publish time ends, a future window end stays.
  assert.deepEqual(carryScheduleOnSave({ target: 'live', live: draftRow, pending: null, incoming: { title: 'D' }, now }), { title: 'D', unpublishAt: iso(T + 7 * 86_400_000) })
  // Unpublished by hand: everything ends.
  const liveRow = { title: 'L', unpublishAt: iso(T) }
  assert.deepEqual(carryScheduleOnSave({ target: 'live', live: liveRow, pending: null, incoming: { title: 'L', draft: true }, now }), { title: 'L', draft: true })
  // A live save keeps a future unpublish, drops a past one.
  assert.deepEqual(carryScheduleOnSave({ target: 'live', live: liveRow, pending: null, incoming: { title: 'L' }, now }), { title: 'L', unpublishAt: iso(T) })
  assert.deepEqual(carryScheduleOnSave({ target: 'live', live: liveRow, pending: null, incoming: { title: 'L' }, now: T + 1 }), { title: 'L' })
  // Pending saves keep the changes' publish time.
  assert.deepEqual(carryScheduleOnSave({ target: 'pending', live: liveRow, pending: { title: 'old', publishAt: iso(T) }, incoming: { title: 'new', unpublishAt: iso(T) }, now }), {
    title: 'new',
    publishAt: iso(T),
  })
  assert.deepEqual(carryScheduleOnSave({ target: 'pending', live: liveRow, pending: null, incoming: { title: 'new', publishAt: iso(T) }, now }), { title: 'new' })
  // New items never arrive scheduled.
  assert.deepEqual(carryScheduleOnSave({ target: 'live', live: null, pending: null, incoming: { title: 'N', draft: true, publishAt: iso(T) }, now }), { title: 'N', draft: true })
})

test('schedule requests: times are checked against the item', () => {
  const now = T - 86_400_000
  const bad = parseScheduleBody({ publishAt: 'soon' })
  assert.ok('code' in bad && bad.code === 'BAD_TIME' && bad.status === 400)
  const local = parseScheduleBody({ publishAt: '2026-10-25T09:00' })
  assert.ok('code' in local, 'a time without a zone is refused, never guessed')
  const req = (publishAt: number | null, unpublishAt: number | null, extra: object = {}) => ({ publishAt, unpublishAt, ...extra })
  const draft = { draft: true, hasPending: false }
  const live = { draft: false, hasPending: false }
  const changes = { draft: false, hasPending: true }
  assert.equal(checkSchedule(req(T, null), draft, now), null)
  assert.equal(checkSchedule(req(now + MIN_LEAD_MS - 1, null), draft, now)?.code, 'IN_THE_PAST')
  assert.equal(checkSchedule(req(now + 3 * 365 * 86_400_000, null), draft, now)?.code, 'TOO_FAR')
  assert.equal(checkSchedule(req(T, null), live, now)?.code, 'NOTHING_TO_PUBLISH')
  assert.equal(checkSchedule(req(T, null), changes, now), null)
  assert.equal(checkSchedule(req(null, T), live, now), null, 'a live item may unpublish later')
  assert.equal(checkSchedule(req(null, T), draft, now)?.code, 'NEEDS_PUBLISH')
  assert.equal(checkSchedule(req(T, T), draft, now)?.code, 'WINDOW')
  assert.equal(checkSchedule(req(T, T + 3_600_000), draft, now), null)
  assert.equal(checkSchedule(req(T, null, { setDate: true }), changes, now)?.code, 'BAD_OPTION')
  assert.equal(checkSchedule(req(T, null, { markUpdated: true }), draft, now)?.code, 'BAD_OPTION')
  assert.equal(checkSchedule(req(null, null), live, now), null, 'clearing is always fine')
  assert.deepEqual(parseScheduleBody({ publishAt: iso(T), unpublishAt: null, setDate: true }), { publishAt: T, unpublishAt: null, setDate: true, markUpdated: false })
})
