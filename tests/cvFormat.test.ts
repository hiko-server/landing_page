import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatCvDate, formatCvRange, formatGraduation, isFuture, majorAddsInfo, displayUrl, hrefOf } from '../lib/cvFormat'
import { formatPostDate, isoDate } from '../lib/postDate'

test('formatCvDate handles every stored shape', () => {
  assert.equal(formatCvDate('2024-09-01'), 'Sep 2024')
  assert.equal(formatCvDate('2024-09', 'zh'), '2024.09')
  assert.equal(formatCvDate('2026'), '2026')
  assert.equal(formatCvDate('now'), 'Present')
  assert.equal(formatCvDate('present', 'zh'), '至今')
  assert.equal(formatCvDate('Summer 2023'), 'Summer 2023')
  assert.equal(formatCvDate(''), '')
  assert.equal(formatCvDate(undefined), '')
})

test('ranges collapse duplicates / missing ends and can show Present', () => {
  assert.equal(formatCvRange('2025-10', '2025-10'), 'Oct 2025')
  assert.equal(formatCvRange('2024-01', ''), 'Jan 2024')
  assert.equal(formatCvRange('2024-01', '2099-01', 'en', { futureEndAsPresent: true }), 'Jan 2024 – Present')
  assert.equal(formatCvRange('2024-01', '2099-01', 'zh'), '2024.01 – 2099.01')
})

test('future detection and graduation label', () => {
  const now = new Date('2026-10-12T00:00:00Z')
  assert.equal(isFuture('2026-10', now), false)
  assert.equal(isFuture('2026-11', now), true)
  assert.equal(isFuture('2027', now), true)
  assert.match(formatGraduation('2099-06', 'zh'), /^预计 2099\.06$/)
})

test('major is shown only when the degree does not already say it', () => {
  assert.equal(majorAddsInfo('Bachelor of Science in Computer Engineering', 'Computer Engineering'), false)
  assert.equal(majorAddsInfo('BSc', 'Computer Engineering'), true)
  assert.equal(majorAddsInfo('BSc', ''), false)
})

test('url helpers', () => {
  assert.equal(displayUrl('https://lucian-dev.com/'), 'lucian-dev.com')
  assert.equal(hrefOf('hiko.dev'), 'https://hiko.dev')
  assert.equal(hrefOf('http://x.y'), 'http://x.y')
})

test('post dates are timezone-stable', () => {
  assert.equal(formatPostDate('2024-05-01'), 'May 1, 2024')
  assert.equal(formatPostDate('2024-05-01T00:00:00.000Z'), 'May 1, 2024')
  assert.equal(isoDate('2024-05-01T00:00:00.000Z'), '2024-05-01')
  assert.equal(formatPostDate('soon'), 'soon')
})
