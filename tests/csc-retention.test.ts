/**
 * I11 — contact-message retention: CONTACT_RETENTION_DAYS parsing, the
 * nightly purge of data/contact-inbox.jsonl, listings and restores that
 * never show / revive expired messages, the scheduler, snapshot pruning by
 * age — and E12's structured `meta` through the contact API into the Inbox.
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'

for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL', 'NOTIFY_EMAIL', 'ADMIN_EMAIL', 'CONTACT_RETENTION_DAYS']) delete process.env[k]
process.env.JWT_SECRET = 'csc-retention-secret-0123456789abcdef'

const prevCwd = process.cwd()
let tmp = ''
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csc-retention-'))
  process.chdir(tmp)
})
after(() => {
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0)
const line = (at: number, n: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ at: new Date(at).toISOString(), name: `N${n}`, email: `n${n}@example.com`, subject: `S${n}`, message: `m${n}`, delivered: false, ...extra })

beforeEach(async () => {
  const { inboxFile } = await import('../lib/inbox')
  fs.rmSync(path.dirname(inboxFile()), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(inboxFile()), { recursive: true })
})

test('CONTACT_RETENTION_DAYS: default 365, 0 = off, junk = default, capped, floored', async () => {
  const { contactRetentionDays, retentionCutoff, isExpired, retentionPeriodText } = await import('../lib/retention')
  assert.equal(contactRetentionDays(undefined), 365)
  assert.equal(contactRetentionDays(''), 365)
  assert.equal(contactRetentionDays('  '), 365)
  assert.equal(contactRetentionDays('0'), 0)
  assert.equal(contactRetentionDays('90'), 90)
  assert.equal(contactRetentionDays('30.9'), 30)
  assert.equal(contactRetentionDays('-5'), 365)
  assert.equal(contactRetentionDays('abc'), 365)
  assert.equal(contactRetentionDays('999999'), 3650)
  assert.equal(retentionCutoff(NOW, 0), null)
  assert.equal(retentionCutoff(NOW, 10), NOW - 10 * DAY)
  assert.equal(isExpired(new Date(NOW - 11 * DAY).toISOString(), NOW - 10 * DAY), true)
  assert.equal(isExpired(new Date(NOW - 9 * DAY).toISOString(), NOW - 10 * DAY), false)
  assert.equal(isExpired('not a date', NOW), false, 'unreadable timestamps are never treated as expired')
  assert.equal(isExpired(new Date(0).toISOString(), null), false)
  assert.deepEqual([365, 730, 180, 30, 1, 45].map(retentionPeriodText), ['12 months', '2 years', '6 months', '1 month', '1 day', '45 days'])
  assert.equal(retentionPeriodText(0), '')
})

test('structured meta is stored with a message and read back; junk meta is dropped', async () => {
  const { storeInboxMessage, listInbox, inboxFile } = await import('../lib/inbox')
  const r = storeInboxMessage(
    {
      name: 'Ada',
      email: 'ada@example.com',
      subject: 'Role',
      message: 'Hi',
      delivered: false,
      meta: { reason: 'Hiring', intent: 'role', company: 'Acme', roleUrl: 'https://jobs.example.com/1', timeline: 'asap' },
    },
    NOW,
  )
  assert.equal(r.stored, true)
  fs.appendFileSync(inboxFile(), line(NOW - DAY, 2, { meta: { intent: 'evil', roleUrl: 'javascript:alert(1)' } }) + '\n')
  fs.appendFileSync(inboxFile(), line(NOW - 2 * DAY, 3) + '\n')
  const { messages, retentionDays } = listInbox(NOW)
  assert.equal(retentionDays, 365)
  assert.deepEqual(messages[0].meta, { reason: 'Hiring', intent: 'role', company: 'Acme', roleUrl: 'https://jobs.example.com/1', timeline: 'asap' })
  assert.equal(messages[1].meta, undefined, 'invalid meta never reaches the Inbox')
  assert.equal(messages[2].meta, undefined, 'older lines have none')
})

test('the purge removes expired messages, keeps recent and unreadable ones, and remembers the ids', async () => {
  const { purgeExpiredInbox, listInbox, inboxFile, mergeInboxText } = await import('../lib/inbox')
  const oldLine = line(NOW - 400 * DAY, 1)
  const lines = [oldLine, line(NOW - 366 * DAY, 2), line(NOW - 364 * DAY, 3), JSON.stringify({ at: 'garbled', name: 'G', email: 'g@x.y', subject: 's', message: 'm' }), line(NOW, 5)]
  fs.writeFileSync(inboxFile(), lines.join('\n') + '\n')
  // Listings hide expired messages even before the purge has run.
  assert.deepEqual(listInbox(NOW).messages.map((m) => m.name).sort(), ['G', 'N3', 'N5'])
  assert.equal(purgeExpiredInbox(NOW, 365), 2)
  const left = fs.readFileSync(inboxFile(), 'utf8').trim().split('\n')
  assert.equal(left.length, 3)
  assert.ok(!left.includes(oldLine))
  assert.equal(purgeExpiredInbox(NOW, 365), 0, 'idempotent')
  // A restore (merge) never brings an expired or purged message back.
  assert.equal(mergeInboxText(lines.join('\n'), NOW, 365), 0)
  // Retention off: nothing is purged or hidden, and a restore merges old lines.
  fs.writeFileSync(inboxFile(), [line(NOW - 5000 * DAY, 9)].join('\n') + '\n')
  assert.equal(purgeExpiredInbox(NOW, 0), 0)
  assert.equal(listInbox(NOW, 0).total, 1)
  assert.equal(mergeInboxText(line(NOW - 6000 * DAY, 10), NOW, 0), 1)
})

test('the scheduler purges a few minutes after boot, then nightly at 03:00 Hong Kong; 0 turns it off', async () => {
  const { startInboxRetention, msUntilNextRun, getRetentionStatus, RUN_HOUR_UTC } = await import('../lib/inboxRetention')
  const { inboxFile } = await import('../lib/inbox')
  assert.equal(RUN_HOUR_UTC, 19)
  assert.equal(msUntilNextRun(Date.UTC(2026, 9, 13, 18, 0, 0)), 3_600_000)
  assert.equal(msUntilNextRun(Date.UTC(2026, 9, 13, 19, 0, 0)), DAY, 'exactly at the hour: tomorrow')
  assert.equal(msUntilNextRun(Date.UTC(2026, 9, 13, 20, 30, 0)), DAY - 5_400_000)

  fs.writeFileSync(inboxFile(), [line(NOW - 400 * DAY, 1), line(NOW, 2)].join('\n') + '\n')
  const timers: Array<{ fn: () => void; ms: number }> = []
  let now = NOW
  const handle = startInboxRetention({
    days: 365,
    now: () => now,
    random: () => 0,
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    clearTimeoutFn: () => {},
  })
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 2 * 60_000, 'first run 2–7 minutes after boot')
  now += timers[0].ms
  timers[0].fn()
  assert.equal(fs.readFileSync(inboxFile(), 'utf8').trim().split('\n').length, 1)
  const status = getRetentionStatus()
  assert.equal(status.scheduled, true)
  assert.equal(status.lastRun?.removed, 1)
  assert.equal(timers[1].ms, msUntilNextRun(now), 'then the next 19:00 UTC')
  handle.stop()
  assert.equal(getRetentionStatus().scheduled, false)

  const off = startInboxRetention({ days: 0, setTimeoutFn: () => assert.fail('no timer when off') })
  off.stop()
})

test('snapshots older than the retention period are pruned too, except the newest', async () => {
  const { selectBackupVictims } = await import('../lib/backup')
  const t = (daysAgo: number) => NOW - daysAgo * DAY
  const items = [
    { name: 'a', at: t(1) },
    { name: 'b', at: t(100) },
    { name: 'c', at: t(400) },
    { name: 'd', at: t(500) },
  ]
  const names = (xs: Array<{ name: string }>) => xs.map((x) => x.name)
  assert.deepEqual(names(selectBackupVictims(items, 20, (i) => i.at, null)), [], 'retention off: count limit only')
  assert.deepEqual(names(selectBackupVictims(items, 20, (i) => i.at, t(365))), ['c', 'd'])
  assert.deepEqual(names(selectBackupVictims(items, 2, (i) => i.at, null)), ['c', 'd'])
  assert.deepEqual(names(selectBackupVictims(items, 3, (i) => i.at, t(50))), ['b', 'c', 'd'])
  // Everything is old: the newest one survives.
  const stale = [
    { name: 'x', at: t(800) },
    { name: 'y', at: t(900) },
  ]
  assert.deepEqual(names(selectBackupVictims(stale, 20, (i) => i.at, t(365))), ['y'])
  // The snapshot just written (not in the list) counts as the newest.
  assert.deepEqual(names(selectBackupVictims(stale, 20, (i) => i.at, t(365), 'just-written')), ['x', 'y'])
})

// ── Contact API ─────────────────────────────────────────────────────────

type MockRes = { statusCode: number; headers: Record<string, string>; body: any }

async function call(handlerPath: string, method: string, body: Record<string, unknown> | undefined, ip: string): Promise<MockRes> {
  const { default: handler } = await import(handlerPath)
  const req = { method, body, query: {}, headers: { 'cf-connecting-ip': ip }, socket: { remoteAddress: '127.0.0.1' }, url: '/api/contact' }
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined }
  const res: any = {
    status(code: number) {
      out.statusCode = code
      return res
    },
    setHeader(name: string, value: unknown) {
      out.headers[name.toLowerCase()] = String(value)
      return res
    },
    getHeader: (name: string) => out.headers[name.toLowerCase()],
    json(b: unknown) {
      out.body = b
      return res
    },
  }
  await handler(req as any, res)
  return out
}

const nonce = () =>
  jwt.sign({ t: 'contact-nonce', iat: Math.floor(Date.now() / 1000) - 10, jti: Math.random().toString(36).slice(2) }, process.env.JWT_SECRET as string, {
    expiresIn: '30m',
    audience: 'contact-form',
    algorithm: 'HS256',
  })

test('contact API: structured fields land in the Inbox meta; a bad link is refused without burning the nonce', async () => {
  const { listInbox } = await import('../lib/inbox')
  const token = nonce()
  const base = { name: 'Rita', email: 'rita@example.com', subject: 'A role', message: 'Hello', nonce: token, mathAnswer: 7, hp: '' }
  const bad = await call('../pages/api/contact', 'POST', { ...base, reason: 'Hiring', intent: 'role', roleUrl: 'http://jobs.example.com' }, '203.0.113.7')
  assert.equal(bad.statusCode, 400)
  assert.equal(bad.body.field, 'roleUrl')
  assert.equal(listInbox().total, 0)
  // Same nonce, fixed link: accepted.
  const ok = await call(
    '../pages/api/contact',
    'POST',
    { ...base, reason: 'Hiring', intent: 'role', company: 'Acme\r\nBcc: x', roleUrl: 'https://jobs.example.com/9', timeline: 'within-1m', unknown: 'x' },
    '203.0.113.7',
  )
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body))
  const [m] = listInbox().messages
  assert.deepEqual(m.meta, { reason: 'Hiring', intent: 'role', company: 'Acme Bcc: x', roleUrl: 'https://jobs.example.com/9', timeline: 'within-1m' })
  assert.equal(m.message, 'Hello', 'the message itself is stored as typed')
})

test('the nonce endpoint reports the retention period for the form notice', async () => {
  process.env.CONTACT_RETENTION_DAYS = '180'
  try {
    const r = await call('../pages/api/contact/nonce', 'GET', undefined, '203.0.113.8')
    assert.equal(r.statusCode, 200)
    assert.equal(r.body.retentionDays, 180)
    assert.ok(r.body.token && r.body.challenge)
  } finally {
    delete process.env.CONTACT_RETENTION_DAYS
  }
})
