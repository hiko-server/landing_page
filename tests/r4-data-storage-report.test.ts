import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatHours, formatSpan, lastRunDetail, parseBackupSchedule, scheduleLine } from '../components/Admin/shell/storageReport'

const HOUR = 3_600_000
const now = Date.parse('2026-10-13T12:00:00Z')

test('the Storage panel schedule line', () => {
  const s = parseBackupSchedule({
    schedule: { scheduled: true, intervalHours: 24, lastRunAt: now - 3 * HOUR, nextAt: now + 21 * HOUR, lastResult: 'created', lastOk: true },
  })
  assert.ok(s)
  assert.equal(scheduleLine(s, now), 'Scheduled: every 24 h · last run 3 h ago · next in 21 h')
  assert.equal(lastRunDetail(s), 'The last run created a snapshot.')

  const fresh = parseBackupSchedule({ schedule: { scheduled: true, intervalHours: 6, nextAt: now + 10 * 60_000 } })!
  assert.equal(scheduleLine(fresh, now), 'Scheduled: every 6 h · no run yet · next in 10 min')

  const off = parseBackupSchedule({ schedule: { scheduled: false, intervalHours: 0 } })!
  assert.equal(scheduleLine(off, now), 'Scheduled backups are off (BACKUP_INTERVAL_HOURS=0)')

  const failed = parseBackupSchedule({ schedule: { scheduled: true, intervalHours: 24, lastResult: 'failed', lastOk: false, lastError: 'disk full' } })!
  assert.equal(lastRunDetail(failed), 'The last run failed: disk full')
  const r2 = parseBackupSchedule({
    schedule: { scheduled: true, intervalHours: 24, lastResult: 'created', lastOk: false, lastError: 'Saved locally, but the R2 push failed: 403' },
  })!
  assert.equal(lastRunDetail(r2), 'Saved locally, but the R2 push failed: 403')
  assert.match(lastRunDetail(parseBackupSchedule({ schedule: { scheduled: true, intervalHours: 24, lastResult: 'unchanged' } })!)!, /no changes/)
})

test('schedule parsing rejects garbage', () => {
  assert.equal(parseBackupSchedule(null), null)
  assert.equal(parseBackupSchedule({}), null)
  const s = parseBackupSchedule({ schedule: { scheduled: true, intervalHours: -1, lastRunAt: 'yesterday', lastResult: 'exploded' } })!
  assert.equal(s.scheduled, false)
  assert.equal(s.lastRunAt, null)
  assert.equal(s.lastResult, null)
})

test('hour and span formatting', () => {
  assert.equal(formatHours(24), '24 h')
  assert.equal(formatHours(0.5), '30 min')
  assert.equal(formatHours(1.5), '1.5 h')
  assert.equal(formatHours(72), '3 d')
  assert.equal(formatSpan(20_000), 'under a minute')
  assert.equal(formatSpan(45 * 60_000), '45 min')
  assert.equal(formatSpan(3 * HOUR), '3 h')
  assert.equal(formatSpan(72 * HOUR), '3 d')
})
