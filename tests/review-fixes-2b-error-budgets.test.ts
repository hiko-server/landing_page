/**
 * SECU-2 (wave 2B review) — anonymous browser reports (POST /api/e) could
 * fill the browser-reported share of the error monitor (300 fingerprints,
 * 30 new an hour for every sender together) from ONE address in ten hours,
 * and from then on every genuinely new browser-side problem (a real CSP
 * block, a new client TypeError) was refused for the 90 days the junk rows
 * lived. A flood still cannot delete older rows (no eviction for browser
 * reports — SECU-1's structure stands); instead each sender gets small
 * daily budgets of its own:
 *   - NEW fingerprints: CLIENT_NEW_FINGERPRINTS_PER_DAY per client (IPv4 /
 *     IPv6 /64), NETWORK_NEW_FINGERPRINTS_PER_DAY per network (IPv4 /24,
 *     IPv6 /48); repeats of known problems never use them;
 *   - stored events: CLIENT_EVENTS_PER_DAY / NETWORK_EVENTS_PER_DAY, so one
 *     address cannot use up the 20 000 browser events of the whole day.
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.JWT_SECRET = 'review-fixes-2b-errors-secret-0123456789'
delete process.env.TRUSTED_PROXY_IPS
delete process.env.TRUST_CLIENT_IP_HEADER

const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf2b-errors-'))
let store: typeof import('../lib/errors/store')
let ingest: typeof import('../lib/errors/ingest')
let analyticsDb: typeof import('../lib/analytics/db')

before(async () => {
  process.chdir(tmp)
  store = await import('../lib/errors/store')
  ingest = await import('../lib/errors/ingest')
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

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const MIN = 60_000
const HOUR = 3_600_000

/** A unique all-letter word per index (groupingMessage folds digits, so words keep fingerprints apart). */
const word = (i: number) => {
  let s = ''
  let n = i
  do {
    s = String.fromCharCode(97 + (n % 26)) + s
    n = Math.floor(n / 26)
  } while (n > 0)
  return s
}

const request = (ip: string, body: string, type: string) =>
  ({
    method: 'POST',
    headers: { host: 'lucian-dev.com', 'user-agent': UA, 'cf-connecting-ip': ip, 'content-type': type },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  }) as any

/** An enforced CSP violation (report-uri shape) — what a curl with a Chrome UA can send. */
const cspReport = (ip: string, blocked: string) =>
  request(
    ip,
    JSON.stringify({ 'csp-report': { 'effective-directive': 'script-src-elem', 'blocked-uri': `https://${blocked}.example/x.js`, 'document-uri': 'https://lucian-dev.com/' } }),
    'application/csp-report',
  )
const clientError = (ip: string, message: string) => request(ip, JSON.stringify({ k: 'error', n: 'TypeError', m: message, p: '/' }), 'text/plain')

const reportedRows = () =>
  store.listErrors({ status: 'all', limit: 500 }, Date.UTC(2026, 9, 21, 23)).filter((r) => r.source !== 'server')

test('the reviewed attack: 300 distinct CSP reports from one client leave room for a new client error from another', () => {
  const t0 = Date.UTC(2026, 9, 21, 0)
  let stored = 0
  for (let i = 0; i < 300; i++) {
    // 20 a minute (the per-minute budget), so only the daily budgets can stop them.
    const now = t0 + Math.floor(i / 20) * 61_000
    stored += ingest.ingestErrorReport(cspReport('203.0.113.7', `junk-${word(i)}`), now).recorded
  }
  assert.equal(stored, ingest.CLIENT_NEW_FINGERPRINTS_PER_DAY, 'one client adds at most its daily share of new fingerprints')
  assert.equal(reportedRows().length, ingest.CLIENT_NEW_FINGERPRINTS_PER_DAY)

  const later = t0 + 16 * MIN
  assert.deepEqual(ingest.ingestErrorReport(clientError('198.51.100.20', 'cannot read properties of undefined'), later), { recorded: 1 })
  const real = reportedRows().find((r) => r.source === 'client')
  assert.ok(real, 'the genuine new client error is recorded')
  assert.equal(real.message, 'cannot read properties of undefined')
})

test('and over many hours too: one address never fills the browser share (the next UTC day gives it a new budget, nothing more)', () => {
  const t0 = Date.UTC(2026, 9, 21, 0)
  let stored = 0
  for (let h = 0; h < 30; h++)
    for (let k = 0; k < 30; k++) stored += ingest.ingestErrorReport(cspReport('203.0.113.8', `slow-${word(h * 30 + k)}`), t0 + h * HOUR + k * MIN).recorded
  // 30 hours span two UTC days: two daily budgets.
  assert.equal(stored, 2 * ingest.CLIENT_NEW_FINGERPRINTS_PER_DAY)
  assert.ok(reportedRows().length < store.ERROR_LIMITS.maxReportedFingerprints)
  assert.equal(ingest.ingestErrorReport(cspReport('192.0.2.50', 'a-real-injected-script'), t0 + 31 * HOUR).recorded, 1, 'a real CSP block is still recorded')
})

test('one network shares a budget: addresses rotated through a /24 add at most NETWORK_NEW_FINGERPRINTS_PER_DAY', () => {
  const t0 = Date.UTC(2026, 9, 21, 3)
  let stored = 0
  for (let host = 1; host <= 40; host++)
    for (let k = 0; k < 3; k++) stored += ingest.ingestErrorReport(cspReport(`203.0.113.${host}`, `net-${word(host * 3 + k)}`), t0 + host * 1000 + k).recorded
  assert.equal(stored, ingest.NETWORK_NEW_FINGERPRINTS_PER_DAY)
  // IPv6: the /64s of one /48 are one network.
  ingest.resetErrorIngestShares()
  let v6 = 0
  for (let n = 0; n < 40; n++) v6 += ingest.ingestErrorReport(cspReport(`2001:db8:1:${n.toString(16)}::1`, `six-${word(n)}`), t0 + HOUR + n * 1000).recorded
  assert.equal(v6, ingest.NETWORK_NEW_FINGERPRINTS_PER_DAY)
})

test('repeats of known problems never use the new-fingerprint budget, and a refused new one spends nothing', () => {
  const t0 = Date.UTC(2026, 9, 21, 6)
  const ip = '198.51.100.30'
  for (let i = 0; i < ingest.CLIENT_NEW_FINGERPRINTS_PER_DAY; i++) assert.equal(ingest.ingestErrorReport(clientError(ip, `known ${word(i)}`), t0 + i * MIN).recorded, 1)
  assert.deepEqual(ingest.ingestErrorReport(clientError(ip, 'one too many'), t0 + 10 * MIN), { recorded: 0, dropped: 'capped' })
  // The same visitor hitting a known problem again: still counted.
  assert.deepEqual(ingest.ingestErrorReport(clientError(ip, `known ${word(0)}`), t0 + 11 * MIN), { recorded: 1 })
  const row = reportedRows().find((r) => r.message === `known ${word(0)}`)
  assert.equal(row?.count, 2)
  // The global hourly cap refused it before the client budget was asked: nothing spent.
  const g = globalThis as typeof globalThis & { __errorStore?: { newReported: number; hour: number } }
  const other = '198.51.100.31'
  g.__errorStore!.newReported = store.ERROR_LIMITS.newReportedPerHour
  g.__errorStore!.hour = Math.floor((t0 + 12 * MIN) / HOUR)
  assert.equal(ingest.ingestErrorReport(clientError(other, 'held by the hour'), t0 + 12 * MIN).recorded, 0)
  let later = 0
  for (let i = 0; i < ingest.CLIENT_NEW_FINGERPRINTS_PER_DAY; i++) later += ingest.ingestErrorReport(clientError(other, `next hour ${word(i)}`), t0 + HOUR + i * MIN).recorded
  assert.equal(later, ingest.CLIENT_NEW_FINGERPRINTS_PER_DAY, 'the refusal left the whole daily budget')
})

test('one address cannot use up the day: its stored events stop at CLIENT_EVENTS_PER_DAY, others keep reporting', () => {
  const t0 = Date.UTC(2026, 9, 21, 9)
  const ip = '198.51.100.40'
  let stored = 0
  for (let i = 0; i < ingest.CLIENT_EVENTS_PER_DAY + 200; i++) {
    const now = t0 + Math.floor(i / ingest.CLIENT_EVENTS_PER_MIN) * 61_000
    stored += ingest.ingestErrorReport(clientError(ip, 'the same loop error'), now).recorded
  }
  assert.equal(stored, ingest.CLIENT_EVENTS_PER_DAY)
  assert.ok(ingest.CLIENT_EVENTS_PER_DAY < store.ERROR_LIMITS.dailyEvents)
  assert.equal(ingest.ingestErrorReport(clientError('192.0.2.77', 'the same loop error'), t0 + 2 * HOUR).recorded, 1, 'another visitor still counts')
})
