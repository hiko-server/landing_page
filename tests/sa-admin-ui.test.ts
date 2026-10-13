/**
 * The pure parts of the admin Security and System pages
 * (components/Admin/security/*, components/Admin/system/*), the system
 * snapshot behind them (lib/systemHealth.ts) and the recent-log ring
 * (lib/logBuffer.ts).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  absoluteTime,
  eventLabel,
  isWarningEvent,
  methodLabel,
  passkeySyncLabel,
  recoveryCodesText,
  relativeTime,
  whereLabel,
} from '../components/Admin/security/securityFormat'
import {
  cancelledStepUpResponse,
  markStepUpCancelled,
  parseRecentStatus,
  parseStepUpChallenge,
  wasStepUpCancelled,
} from '../components/Admin/security/stepUpClient'
import {
  describeWebAuthnError,
  isCeremonyCancelled,
} from '../components/Admin/security/webauthnClient'
import {
  browserTally,
  checkTone,
  formatBytes,
  formatDuration,
  formatUptime,
  kindLabel,
  seriesTotal,
  sourceLabel,
  sparkHeights,
} from '../components/Admin/system/systemFormat'
import {
  clearLogEntries,
  logEntryTotal,
  pushLogEntry,
  recentLogEntries,
  LOG_RING_SIZE,
} from '../lib/logBuffer'

const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-admin-ui-'))
before(() => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
})
after(async () => {
  const { closeDb } = await import('../lib/db')
  const { closeAnalyticsDb } = await import('../lib/analytics/db')
  const { closeAuthDb } = await import('../lib/adminAuth/db')
  closeDb()
  closeAnalyticsDb()
  closeAuthDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('security labels', () => {
  assert.equal(methodLabel('passkey'), 'Passkey')
  assert.equal(methodLabel('recovery'), 'Password + recovery code')
  assert.equal(methodLabel(null), '—')
  assert.equal(eventLabel('signin-failed'), 'Failed sign-in')
  assert.equal(eventLabel('something-new'), 'something-new')
  assert.equal(isWarningEvent('step-up-failed'), true)
  assert.equal(isWarningEvent('signin'), false)
  assert.equal(
    passkeySyncLabel({ backedUp: false, deviceType: 'singleDevice' }),
    'This device only'
  )
  assert.equal(passkeySyncLabel({ backedUp: true, deviceType: 'singleDevice' }), 'Synced')
  const hongKong = new Intl.DisplayNames(['en'], { type: 'region' }).of('HK')
  assert.equal(whereLabel('HK', '203.0.113.x'), `${hongKong} · 203.0.113.x`)
  assert.equal(whereLabel(null, null), 'Unknown network')
  const now = Date.UTC(2026, 9, 13, 12)
  assert.equal(relativeTime(now - 10_000, now), 'just now')
  assert.equal(relativeTime(now - 3 * 60_000, now), '3 min. ago')
  assert.equal(relativeTime(now + 7 * 60_000, now), 'in 7 min.')
  assert.match(relativeTime(now - 90 * 86_400_000, now), /2026/)
  assert.match(absoluteTime(now), /13 Oct 2026/)
  const text = recoveryCodesText(['AAAA-BBBB-CCCC-DDDD'], 'lucian-dev.com', now)
  assert.match(text, /^Recovery codes for the admin of lucian-dev\.com\nCreated 2026-10-13\./)
  assert.match(text, /\nAAAA-BBBB-CCCC-DDDD\n/)
})

test('step-up challenge parsing and the cancelled marker', () => {
  assert.equal(parseStepUpChallenge(401, { code: 'STEP_UP_REQUIRED' }), null)
  assert.equal(parseStepUpChallenge(403, { code: 'CSRF' }), null)
  assert.deepEqual(
    parseStepUpChallenge(403, {
      code: 'STEP_UP_REQUIRED',
      methods: ['passkey', 'password', 'telepathy'],
      recoveryRequired: true,
      windowMinutes: 5,
    }),
    {
      methods: ['passkey', 'password'],
      recoveryRequired: true,
      windowMinutes: 5,
    }
  )
  assert.deepEqual(parseStepUpChallenge(403, { code: 'STEP_UP_REQUIRED' }), {
    methods: ['password'],
    recoveryRequired: false,
    windowMinutes: 10,
  })
  const res = new Response(null, { status: 403 })
  assert.equal(wasStepUpCancelled(res), false)
  assert.equal(markStepUpCancelled(res), res)
  assert.equal(wasStepUpCancelled(res), true)
  const cancelled = cancelledStepUpResponse()
  assert.equal(cancelled.status, 403)
  assert.equal(wasStepUpCancelled(cancelled), true)
  assert.deepEqual(parseRecentStatus({ recent: false, methods: ['password'], recoveryRequired: true, windowMinutes: 1 }), {
    recent: false,
    challenge: { methods: ['password'], recoveryRequired: true, windowMinutes: 1 },
  })
  assert.equal(parseRecentStatus({ nope: 1 }), null)
})

test('WebAuthn error wording', () => {
  assert.match(
    describeWebAuthnError({ code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' }),
    /already has a passkey/
  )
  assert.match(describeWebAuthnError({ name: 'NotAllowedError' }), /closed or timed out/)
  assert.match(describeWebAuthnError({ code: 'ERROR_INVALID_RP_ID' }), /don’t work on this address/)
  assert.match(describeWebAuthnError(new Error('weird')), /failed: weird/)
  assert.equal(isCeremonyCancelled({ name: 'AbortError' }), true)
  assert.equal(isCeremonyCancelled({ code: 'ERROR_CEREMONY_ABORTED' }), true)
  assert.equal(isCeremonyCancelled(new Error('x')), false)
})

test('system formatting', () => {
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(2048), '2 KB')
  assert.equal(formatBytes(5 * 1024 ** 2 + 1), '5.0 MB')
  assert.equal(formatBytes(3.5 * 1024 ** 3), '3.5 GB')
  assert.equal(formatBytes(null), '—')
  assert.equal(formatUptime(30), '30 s')
  assert.equal(formatUptime(42 * 60), '42 min')
  assert.equal(formatUptime(5 * 3600 + 12 * 60), '5 h 12 min')
  assert.equal(formatUptime(3 * 86400 + 4 * 3600), '3 d 4 h')
  assert.equal(formatDuration(340), '340 ms')
  assert.equal(formatDuration(1234), '1.2 s')
  assert.equal(sourceLabel('client'), 'Browser')
  assert.equal(kindLabel('unhandledrejection'), 'unhandled rejection')
  assert.equal(seriesTotal([1, 2, 3]), 6)
  assert.deepEqual(sparkHeights([0, 2, 4]), [0, 0.5, 1])
  assert.deepEqual(sparkHeights([0, 0]), [0, 0])
  assert.equal(browserTally({ Safari: 1, Chrome: 5 }), 'Chrome 5 · Safari 1')
  assert.equal(checkTone('pass'), 'green')
  assert.equal(checkTone('warn'), 'orange')
  assert.equal(checkTone('failed'), 'red')
  assert.equal(checkTone('skipped'), 'gray')
})

test('the recent-log ring keeps the newest warn / error entries, redacted and bounded', () => {
  clearLogEntries()
  pushLogEntry('info', 'ignored', {})
  pushLogEntry('warn', 'first', { password: 'p', big: 'x'.repeat(5000) })
  for (let i = 0; i < LOG_RING_SIZE + 5; i++) pushLogEntry('error', `e${i}`, {})
  const entries = recentLogEntries(3)
  assert.deepEqual(
    entries.map((e) => e.msg),
    [`e${LOG_RING_SIZE + 4}`, `e${LOG_RING_SIZE + 3}`, `e${LOG_RING_SIZE + 2}`]
  )
  assert.equal(recentLogEntries(1000).length, LOG_RING_SIZE)
  assert.equal(logEntryTotal(), LOG_RING_SIZE + 6)
  assert.equal(
    recentLogEntries(1000, 'warn').length,
    0,
    'the warn entry was pushed out of the ring'
  )
  clearLogEntries()
  pushLogEntry('warn', 'w', { password: 'secret-value', note: 'y'.repeat(5000) })
  const [w] = recentLogEntries(1)
  assert.doesNotMatch(w.fields || '', /secret-value/)
  assert.ok((w.fields || '').length <= 1200)
})

test('the system snapshot reports every store, disk and warning without throwing', async () => {
  const { diskInfo, diskWarnings, systemSnapshot } = await import('../lib/systemHealth')
  const snap = systemSnapshot()
  assert.deepEqual(
    snap.databases.map((d) => [d.name, d.schema?.state]),
    [
      ['content', 'current'],
      ['analytics', 'current'],
      ['auth', 'current'],
      ['audit', 'current'],
    ]
  )
  assert.ok(snap.databases.every((d) => (d.bytes ?? 0) > 0))
  assert.equal(snap.backup.localCount, 0)
  assert.ok(snap.release.uptimeS >= 0)
  assert.ok(Array.isArray(snap.warnings))
  assert.equal(snap.errors?.open, 0)
  assert.equal(snap.restoreDrill.latest, null)
  assert.equal(snap.r2.configured, false)
  const disk = diskInfo(tmp)
  assert.ok(disk && disk.totalBytes > 0 && disk.freeBytes >= 0)
  assert.deepEqual(
    diskWarnings({
      path: '/',
      freeBytes: 500 * 1024 ** 2,
      totalBytes: 100 * 1024 ** 3,
      usedPct: 99.5,
    }).length,
    1
  )
  assert.deepEqual(
    diskWarnings({
      path: '/',
      freeBytes: 50 * 1024 ** 3,
      totalBytes: 100 * 1024 ** 3,
      usedPct: 50,
    }),
    []
  )
  assert.equal(diskInfo('/definitely/not/here'), null)
})
