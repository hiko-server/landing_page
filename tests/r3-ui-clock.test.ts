import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClockProvider, SITE_TIME_ZONE, isReferenceMonth, monthIndex, referenceMonth, referenceYear, useReferenceMonth } from '../lib/clock'
import { formatCvRange, formatGraduation, isFuture } from '../lib/cvFormat'
import { entryRange, entryStatus, graduation } from '../components/CVViewerPage/fields'
import { currentRoles } from '../lib/nowSignals'

test('the reference month is the Hong Kong month, not the server (UTC) month', () => {
  assert.equal(SITE_TIME_ZONE, 'Asia/Hong_Kong')
  // 31 May 20:00 UTC is already 1 June 04:00 in Hong Kong.
  assert.equal(referenceMonth(new Date('2026-05-31T20:00:00Z')), '2026-06')
  assert.equal(referenceMonth(new Date('2026-05-31T15:59:59Z')), '2026-05')
  // New Year boundary.
  assert.equal(referenceMonth(new Date('2026-12-31T16:00:00Z')), '2027-01')
  assert.equal(referenceMonth(new Date('2026-05-31T20:00:00Z'), 'UTC'), '2026-05')
  assert.equal(referenceYear('2027-01'), '2027')
})

test('reference month validation and arithmetic', () => {
  for (const ok of ['2026-01', '2026-12']) assert.equal(isReferenceMonth(ok), true, ok)
  for (const bad of ['2026-13', '2026-00', '2026-1', '26-01', '', null, 202601]) assert.equal(isReferenceMonth(bad), false, String(bad))
  assert.equal(monthIndex('2026-01') + 11, monthIndex('2026-12'))
  assert.ok(Number.isNaN(monthIndex('nope')))
})

test('isFuture accepts a reference month, and reads a Date in the site time zone', () => {
  assert.equal(isFuture('2026-06-30', '2026-05'), true)
  assert.equal(isFuture('2026-06-30', '2026-06'), false)
  assert.equal(isFuture('2027', '2026-12'), true)
  assert.equal(isFuture('2026', '2026-12'), false)
  // The window the review found: the server's UTC month is still May, Hong
  // Kong (and the visitor) are in June. With the HK reading both agree.
  const serverNow = new Date('2026-05-31T20:00:00Z')
  assert.equal(isFuture('2026-06-30', serverNow), false)
  // An invalid Date or month string falls back to "now" instead of throwing.
  assert.equal(isFuture('2999-01', new Date('invalid')), true)
  assert.equal(isFuture('1999-01', 'garbage'), false)
})

test('"Expected" and "Present" follow the month they are given', () => {
  assert.equal(formatGraduation('2026-06-30', 'en', '2026-05'), 'Expected Jun 2026')
  assert.equal(formatGraduation('2026-06-30', 'en', '2026-06'), 'Jun 2026')
  assert.equal(formatGraduation('2026-06-30', 'zh', '2026-05'), '预计 2026.06')
  assert.equal(formatCvRange('2024-01', '2026-03', 'en', { futureEndAsPresent: true, now: '2026-02' }), 'Jan 2024 – Present')
  assert.equal(formatCvRange('2024-01', '2026-03', 'en', { futureEndAsPresent: true, now: '2026-03' }), 'Jan 2024 – Mar 2026')
  const edu = { startDate: '2026-09-07', endDate: '2028-12-07' }
  assert.equal(graduation(edu, 'en', '2028-11'), 'Expected Dec 2028')
  assert.equal(graduation(edu, 'en', '2028-12'), 'Dec 2028')
  assert.equal(entryRange({ startDate: '2025-01', endDate: '2027-01' }, 'en', { futureEndAsPresent: true, now: '2026-10' }), 'Jan 2025 – Present')
  assert.equal(entryStatus(edu, '2026-08'), 'upcoming')
  assert.equal(entryStatus(edu, '2026-10'), 'current')
  assert.equal(entryStatus(edu, '2029-01'), 'past')
})

test('/now roles use the reference month for status and the graduation line', () => {
  const cv = [
    {
      sessionName: 'education',
      educationExperience: [{ schoolName: 'HKU', degree: 'MSc', startDate: '2026-09', endDate: '2028-12' }],
    },
  ]
  const [role] = currentRoles(cv, '2026-10')
  assert.equal(role.status, 'current')
  assert.equal(role.when, 'Sep 2026 – Expected Dec 2028')
  assert.deepEqual(currentRoles(cv, '2029-01'), [])
})

function Probe() {
  return createElement('span', null, useReferenceMonth())
}

test('renderers read the server month from <ClockProvider>, else compute it', () => {
  assert.equal(renderToStaticMarkup(createElement(ClockProvider, { month: '2026-05' }, createElement(Probe))), '<span>2026-05</span>')
  // Anything that is not 'YYYY-MM' is ignored in favour of the current month.
  const now = referenceMonth()
  assert.equal(renderToStaticMarkup(createElement(ClockProvider, { month: 'soon' }, createElement(Probe))), `<span>${now}</span>`)
  assert.equal(renderToStaticMarkup(createElement(Probe)), `<span>${now}</span>`)
})
