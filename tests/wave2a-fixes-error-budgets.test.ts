/**
 * SECU-1 (wave 2A review) — anonymous browser reports (POST /api/e, sources
 * 'client' and 'csp') can no longer use up the error monitor's room or daily
 * budget, so a flood of fake reports never hides a real server error:
 * a share of the table and a daily budget per source class, a global cap on
 * new browser-reported fingerprints per hour, budgets spent only by stored
 * events, and eviction of browser-reported rows for a new server error.
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.JWT_SECRET = 'wave2a-fixes-errors-secret-0123456789abc'
delete process.env.TRUSTED_PROXY_IPS
delete process.env.TRUST_CLIENT_IP_HEADER

const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w2f-errors-'))
let store: typeof import('../lib/errors/store')
let ingest: typeof import('../lib/errors/ingest')
let server: typeof import('../lib/errors/server')
let scrub: typeof import('../lib/errors/scrub')
let analyticsDb: typeof import('../lib/analytics/db')

before(async () => {
  process.chdir(tmp)
  store = await import('../lib/errors/store')
  ingest = await import('../lib/errors/ingest')
  server = await import('../lib/errors/server')
  scrub = await import('../lib/errors/scrub')
  analyticsDb = await import('../lib/analytics/db')
})
after(() => {
  analyticsDb.closeAnalyticsDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})
beforeEach(() => {
  store.resetErrorStoreState()
  ingest.resetErrorIngestShares()
  analyticsDb.getAnalyticsDb().exec('DELETE FROM errors; DELETE FROM error_daily; DELETE FROM meta')
})

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const HOUR = 3_600_000

/** A unique all-letter word per index: groupingMessage only folds digits, so each is its own fingerprint. */
const word = (i: number) => {
  let s = ''
  let n = i
  do {
    s = String.fromCharCode(97 + (n % 26)) + s
    n = Math.floor(n / 26)
  } while (n > 0)
  return s
}

const event = (
  source: 'client' | 'csp' | 'server',
  key: string
): import('../lib/errors/store').ErrorEventInput => ({
  fingerprint: scrub.fingerprintOf([source, key]),
  source,
  kind: source === 'server' ? 'api' : source === 'csp' ? 'csp' : 'error',
  name: 'Error',
  message: `${source} ${key}`,
  stack: null,
  path: '/x',
  route: null,
  release: 'abcdef0',
  browser: source === 'server' ? null : 'Chrome',
})

/** A browser report through the real ingest path (no Origin, no Sec-Fetch-Site: what a script sends). */
const report = (ip: string, message: string) =>
  ({
    method: 'POST',
    headers: { host: 'lucian-dev.com', 'user-agent': UA, 'cf-connecting-ip': ip },
    body: JSON.stringify({ k: 'error', n: 'TypeError', m: message, p: '/' }),
    socket: { remoteAddress: '127.0.0.1' },
  }) as any

/** Every stored row (listed as of a fixed time, so retention never depends on the test machine's clock). */
const rows = (source?: 'server' | 'reported') => {
  const all = store.listErrors({ status: 'all', limit: 500 }, Date.UTC(2026, 9, 20, 23))
  if (!source) return all
  return all.filter((r) => (source === 'server' ? r.source === 'server' : r.source !== 'server'))
}

test('the reviewed attack: 600 fake reports store 30 an hour (from one address only its daily share, review-fixes-2b SECU-2), and a server error is still recorded', () => {
  const t0 = Date.UTC(2026, 9, 20, 0)
  let alone = 0
  for (let i = 0; i < 600; i++) {
    // 20 a minute (the per-client budget), the clock moving on a minute every 20.
    const now = t0 + Math.floor(i / 20) * 61_000
    alone += ingest.ingestErrorReport(report('203.0.113.7', `cannot read ${word(i)}`), now).recorded
  }
  assert.equal(alone, ingest.CLIENT_NEW_FINGERPRINTS_PER_DAY, 'one address: its daily share of new fingerprints')

  // From 200 networks at once, the store's global cap holds: 30 new an hour.
  store.resetErrorStoreState()
  ingest.resetErrorIngestShares()
  analyticsDb.getAnalyticsDb().exec('DELETE FROM errors; DELETE FROM error_daily; DELETE FROM meta')
  let stored = 0
  for (let i = 0; i < 600; i++) {
    const now = t0 + HOUR + Math.floor(i / 20) * 1000
    stored += ingest.ingestErrorReport(report(`198.18.${i % 200}.7`, `cannot read ${word(i)}`), now).recorded
  }
  assert.equal(
    stored,
    store.ERROR_LIMITS.newReportedPerHour,
    'one hour admits 30 new browser fingerprints'
  )
  assert.equal(rows('reported').length, store.ERROR_LIMITS.newReportedPerHour)
  assert.equal(store.errorTotals(t0 + HOUR + 31 * 60_000).droppedToday, 600 - stored)

  server.captureServerError(new Error('SQLITE_BUSY: database is locked'), {
    kind: 'render',
    path: '/',
  })
  const serverRows = rows('server')
  assert.equal(serverRows.length, 1)
  assert.match(serverRows[0].message, /SQLITE_BUSY/)
})

test('many addresses over many hours fill only the browser share; 200 rows stay reserved for server errors', () => {
  const t0 = Date.UTC(2026, 9, 20, 0)
  const { maxReportedFingerprints, newReportedPerHour, maxFingerprints } = store.ERROR_LIMITS
  const hours = Math.ceil(maxReportedFingerprints / newReportedPerHour) + 2
  let i = 0
  for (let h = 0; h < hours; h++) {
    for (let k = 0; k < newReportedPerHour + 5; k++) {
      const source = i % 4 === 0 ? 'csp' : 'client'
      store.recordError(event(source, word(i++)), t0 + h * HOUR + k * 1000)
    }
  }
  assert.equal(
    rows('reported').length,
    maxReportedFingerprints,
    'browser reports stop at their share'
  )
  const later = t0 + hours * HOUR
  assert.equal(store.recordError(event('client', 'one more'), later), 'capped')

  for (let k = 0; k < maxFingerprints - maxReportedFingerprints; k++)
    assert.equal(store.recordError(event('server', `boom ${word(k)}`), later), 'new')
  assert.equal(rows().length, maxFingerprints)

  // A full table: each new server error replaces a browser-reported row.
  for (let k = 0; k < 25; k++)
    assert.equal(store.recordError(event('server', `late ${word(k)}`), later + 1000), 'new')
  assert.equal(rows().length, maxFingerprints)
  assert.equal(rows('server').length, maxFingerprints - maxReportedFingerprints + 25)
  assert.equal(rows('reported').length, maxReportedFingerprints - 25)
  // The evicted rows' daily counts went with them.
  const orphans = analyticsDb
    .getAnalyticsDb()
    .prepare(
      'SELECT count(*) AS n FROM error_daily WHERE fingerprint NOT IN (SELECT fingerprint FROM errors)'
    )
    .get() as { n: number }
  assert.equal(orphans.n, 0)
})

test('a full table of server errors still refuses a new one (nothing to evict) and counts it as dropped', () => {
  const t = Date.UTC(2026, 9, 20, 9)
  for (let k = 0; k < store.ERROR_LIMITS.maxFingerprints; k++)
    store.recordError(event('server', word(k)), t)
  assert.equal(store.recordError(event('server', 'overflow'), t), 'capped')
  assert.equal(store.recordError(event('client', 'overflow'), t), 'capped')
  assert.equal(store.errorTotals(t).droppedToday, 2)
})

test('eviction order: resolved reports first, then the least recently seen open one; ignored ones last', () => {
  const t = Date.UTC(2026, 9, 20, 10)
  const { maxFingerprints } = store.ERROR_LIMITS
  // Three browser reports with known states, the rest of the table server errors.
  const ignored = event('client', 'ignored one')
  const oldOpen = event('client', 'old open')
  const resolved = event('csp', 'resolved one')
  store.recordError(ignored, t - 5000)
  store.recordError(oldOpen, t - 4000)
  store.recordError(resolved, t - 1000)
  const newerOpen = event('client', 'newer open')
  store.recordError(newerOpen, t - 500)
  store.setErrorStatus([ignored.fingerprint], 'ignored', t)
  store.setErrorStatus([resolved.fingerprint], 'resolved', t)
  for (let k = 0; k < maxFingerprints - 4; k++) store.recordError(event('server', word(k)), t)
  assert.equal(rows().length, maxFingerprints)

  const present = (fp: string) => store.getError(fp, t) !== null
  store.recordError(event('server', 'first newcomer'), t + 1)
  assert.equal(present(resolved.fingerprint), false, 'the resolved report goes first')
  store.recordError(event('server', 'second newcomer'), t + 2)
  assert.equal(present(oldOpen.fingerprint), false, 'then the open report seen longest ago')
  assert.ok(present(newerOpen.fingerprint) && present(ignored.fingerprint))
  store.recordError(event('server', 'third newcomer'), t + 3)
  assert.equal(present(newerOpen.fingerprint), false)
  assert.ok(present(ignored.fingerprint), 'an ignored report is kept while an open one remains')
  store.recordError(event('server', 'fourth newcomer'), t + 4)
  assert.equal(present(ignored.fingerprint), false)
  assert.equal(store.recordError(event('server', 'fifth newcomer'), t + 5), 'capped')
})

test('the hourly cap on new browser fingerprints resets the next hour; repeats are never held back by it', () => {
  const t = Date.UTC(2026, 9, 20, 11)
  const { newReportedPerHour } = store.ERROR_LIMITS
  for (let k = 0; k < newReportedPerHour; k++)
    assert.equal(store.recordError(event('csp', word(k)), t + k), 'new')
  assert.equal(store.recordError(event('client', 'held back'), t + 100), 'capped')
  assert.equal(
    store.recordError(event('csp', word(0)), t + 200),
    'recorded',
    'a repeat still counts'
  )
  assert.equal(store.recordError(event('server', 'not affected'), t + 300), 'new')
  assert.equal(store.recordError(event('client', 'held back'), t + HOUR), 'new', 'a new hour')
})

test('a refused report spends no budget, and browser reports never use up the server budget', () => {
  const t = Date.UTC(2026, 9, 20, 12)
  const known = event('client', 'known')
  assert.equal(store.recordError(known, t), 'new')
  // One browser-reported event left today, and this hour's new fingerprints used up.
  const g = globalThis as typeof globalThis & {
    __errorStore?: { events: number; newReported: number }
  }
  g.__errorStore!.events = store.ERROR_LIMITS.dailyEvents - 1
  g.__errorStore!.newReported = store.ERROR_LIMITS.newReportedPerHour
  assert.equal(store.recordError(event('client', 'refused by the hour cap'), t + 1), 'capped')
  assert.equal(store.recordError(known, t + 2), 'recorded', 'the refusal left the last unit')
  assert.equal(store.recordError(known, t + 3), 'over-daily-limit')
  assert.equal(store.recordError(event('csp', 'also over'), t + 4), 'over-daily-limit')
  // Server errors keep their own budget for the rest of the day.
  assert.equal(store.recordError(event('server', 'still recorded'), t + 5), 'new')
  assert.equal(store.recordError(event('server', 'still recorded'), t + 6), 'recorded')
  // A new UTC day starts both budgets again.
  assert.equal(store.recordError(known, t + 24 * HOUR), 'recorded')
})
