/**
 * H5 — the pure helpers behind the schedule and review-link UI
 * (components/Admin/shell/itemSchedule, reviewLinks): both time zones,
 * quick picks, one-line summaries and the words for a link's life.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bothZones, inputsFor, isScheduled, parseItemSchedule, publishTimeProblem, scheduleSummary, schedulePresets } from '../components/Admin/shell/itemSchedule'
import { linkStatusLine, parseReviewLink, parseReviewLinks, parseShareable, TTL_OPTIONS, viewsLine } from '../components/Admin/shell/reviewLinks'
import { relativeInstant, zonedParts } from '../lib/schedule/time'

const T = Date.UTC(2026, 9, 25, 1, 0) // Sun 25 Oct 2026, 09:00 HKT

test('times read in Hong Kong first, with this device’s time only when it differs', () => {
  assert.deepEqual(bothZones(T, 'Asia/Hong_Kong'), { site: 'Sun 25 Oct 2026, 09:00 HKT', local: null })
  assert.deepEqual(bothZones(T, 'Asia/Singapore'), { site: 'Sun 25 Oct 2026, 09:00 HKT', local: null }, 'same wall time: one line')
  assert.deepEqual(bothZones(T, 'Europe/London'), { site: 'Sun 25 Oct 2026, 09:00 HKT', local: '01:00 London · GMT' })
  assert.deepEqual(bothZones(T, 'America/Los_Angeles'), { site: 'Sun 25 Oct 2026, 09:00 HKT', local: 'Sat 24 Oct, 18:00 Los Angeles · GMT-7' }, 'another day: the date too')
  assert.deepEqual(inputsFor(T, 'Europe/London'), { date: '2026-10-25', time: '01:00' })
})

test('schedules from the API are parsed defensively and summarised in one line', () => {
  assert.equal(parseItemSchedule(null), null)
  assert.deepEqual(parseItemSchedule({ publishAt: T, unpublishAt: 'x', publishes: 'draft' }), { publishAt: T, unpublishAt: null, publishes: 'draft' })
  assert.deepEqual(parseItemSchedule({ publishAt: null, publishes: 'draft' }), { publishAt: null, unpublishAt: null, publishes: null })
  assert.equal(isScheduled({ publishAt: null, unpublishAt: null, publishes: null }), false)
  assert.equal(scheduleSummary({ publishAt: T, unpublishAt: null, publishes: 'draft' }, T - 1), 'Publishes Sun 25 Oct, 09:00 HKT')
  assert.equal(scheduleSummary({ publishAt: T, unpublishAt: null, publishes: 'changes' }, T + 1), 'Changes go live Sun 25 Oct, 09:00 HKT (due now)')
  assert.equal(scheduleSummary({ publishAt: null, unpublishAt: T, publishes: null }, T - 1), 'Unpublishes Sun 25 Oct, 09:00 HKT')
  assert.equal(publishTimeProblem(null, T), 'Pick a date and a time.')
  assert.match(publishTimeProblem(T, T) || '', /passed/)
  assert.equal(publishTimeProblem(T + 60_000, T), null)
})

test('quick picks: later today, tomorrow morning, Monday morning — in the chosen zone, never in the past', () => {
  // Wednesday 21 Oct 2026, 10:20 in Hong Kong.
  const now = Date.UTC(2026, 9, 21, 2, 20)
  const picks = schedulePresets(now, 'Asia/Hong_Kong')
  assert.deepEqual(
    picks.map((p) => [p.id, zonedParts(p.at, 'Asia/Hong_Kong').date, zonedParts(p.at, 'Asia/Hong_Kong').time]),
    [
      ['later', '2026-10-21', '13:00'],
      ['tomorrow', '2026-10-22', '09:00'],
      ['monday', '2026-10-26', '09:00'],
    ],
  )
  // Late in the evening there is no "later today"; on a Sunday, Monday is tomorrow (one pick, not two).
  const sundayNight = Date.UTC(2026, 9, 25, 14, 30) // Sun 22:30 HKT
  const late = schedulePresets(sundayNight, 'Asia/Hong_Kong')
  assert.deepEqual(late.map((p) => p.id), ['tomorrow'])
  // In another zone the picks are that zone's 09:00.
  const london = schedulePresets(now, 'Europe/London')
  assert.equal(zonedParts(london.find((p) => p.id === 'tomorrow')!.at, 'Europe/London').time, '09:00')
})

test('review links: parsed defensively; the words for their life and views', () => {
  const now = T
  const raw = { id: 'abc', collection: 'blog', slug: 's', currentSlug: 's2', title: 'T', variant: 'changes', label: '', createdAt: now - 1000, expiresAt: now + 3 * 86_400_000, revokedAt: null, viewCount: 0, lastViewedAt: null, status: 'active', path: '/review/x.y' }
  const link = parseReviewLink(raw)!
  assert.equal(link.currentSlug, 's2')
  assert.equal(link.label, null)
  assert.equal(link.path, '/review/x.y')
  assert.equal(parseReviewLink({ ...raw, status: 'revoked' })!.path, null, 'an ended link is never offered')
  assert.equal(parseReviewLink({ ...raw, path: 'https://evil.example/' })!.path, null)
  assert.equal(parseReviewLink({ ...raw, collection: 'pages' }), null)
  assert.equal(parseReviewLinks([raw, null, 5]).length, 1)
  assert.deepEqual(parseShareable({ variant: 'draft' }), { variant: 'draft' })
  assert.deepEqual(parseShareable({}), { variant: null, reason: 'live' })
  assert.equal(linkStatusLine(link, now, relativeInstant), 'Expires in 3 days')
  assert.equal(linkStatusLine({ ...link, status: 'expired', expiresAt: now - 2 * 3_600_000 }, now, relativeInstant), 'Expired 2 h ago')
  assert.equal(linkStatusLine({ ...link, status: 'revoked' }, now, relativeInstant), 'Turned off')
  assert.equal(viewsLine(link, now, relativeInstant), 'Not opened yet')
  assert.equal(viewsLine({ viewCount: 1, lastViewedAt: now - 5 * 60_000 }, now, relativeInstant), 'Opened once · 5 min ago')
  assert.equal(viewsLine({ viewCount: 4, lastViewedAt: now - 3_600_000 }, now, relativeInstant), 'Opened 4 times · last 1 h ago')
  assert.deepEqual(TTL_OPTIONS.map((o) => o.hours), [1, 24, 72, 168, 720], '1 hour to 30 days')
})
