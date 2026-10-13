import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Same fixture approach as tests/s3-backup.test.ts: lib/db and lib/backup
// resolve data/ from process.cwd() at import time, so run in a throwaway root
// without R2.
const repoRoot = process.cwd()
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-data-schedule-'))
for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'BACKUP_INTERVAL_HOURS']) delete process.env[k]
process.chdir(root)

const dataDir = path.join(root, 'data')
const uploadsDir = path.join(root, 'public', 'uploads')
const backupsDir = path.join(dataDir, 'backups')
fs.mkdirSync(uploadsDir, { recursive: true })
fs.writeFileSync(path.join(uploadsDir, 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

const { getDb, closeDb } = await import('../lib/db')
const backup = await import('../lib/backup')
const schedule = await import('../lib/backupSchedule')

after(() => {
  closeDb()
  process.chdir(repoRoot)
  fs.rmSync(root, { recursive: true, force: true })
})

function seed() {
  const db = getDb()
  db.exec('DELETE FROM pages; DELETE FROM collection_items; DELETE FROM kv;')
  db.prepare('INSERT INTO pages VALUES (?, ?, ?, ?)').run('now', '{"title":"Now"}', 'Building things', 1)
  db.prepare('INSERT INTO collection_items VALUES (?, ?, ?, ?, ?)').run('blog', 'first', '{"title":"First"}', 'Hello', 1)
  db.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('home', '{"hero":{"brand":"A"}}', 1)
}

function resetBackups() {
  fs.rmSync(backupsDir, { recursive: true, force: true })
}

const snapshotFiles = () => (fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).filter((f) => backup.SNAPSHOT_FILE_RE.test(f)) : [])

beforeEach(() => {
  seed()
  resetBackups()
})

test('BACKUP_INTERVAL_HOURS: default 24, 0 disables, invalid falls back, clamped', () => {
  assert.equal(schedule.backupIntervalHours(undefined), 24)
  assert.equal(schedule.backupIntervalHours(''), 24)
  assert.equal(schedule.backupIntervalHours('0'), 0)
  assert.equal(schedule.backupIntervalHours('6'), 6)
  assert.equal(schedule.backupIntervalHours('abc'), 24)
  assert.equal(schedule.backupIntervalHours('-3'), 24)
  assert.equal(schedule.backupIntervalHours('0.01'), 0.25)
  assert.equal(schedule.backupIntervalHours('100000'), schedule.MAX_INTERVAL_HOURS)
})

test('a scheduled tick records reason "scheduled" in the manifest', async () => {
  const outcome = await schedule.runScheduledBackup()
  assert.equal(outcome.result, 'created')
  const snap = await backup.createSnapshot({ reason: 'scheduled' })
  assert.equal(snap.manifest.reason, 'scheduled')
  const manual = await backup.createSnapshot()
  assert.equal(manual.manifest.reason, 'manual')
})

test('unchanged content is skipped; any change (row, upload, inbox) triggers a new snapshot', async () => {
  const first = await schedule.runScheduledBackup()
  assert.equal(first.result, 'created')
  assert.equal(snapshotFiles().length, 1)

  const second = await schedule.runScheduledBackup()
  assert.equal(second.result, 'unchanged')
  assert.equal(snapshotFiles().length, 1)
  assert.equal(schedule.readScheduleRecord().lastResult, 'unchanged')
  assert.ok(schedule.readScheduleRecord().verifiedAt)

  getDb().prepare('UPDATE kv SET value = ?, updated_at = ? WHERE key = ?').run('{"hero":{"brand":"B"}}', 2, 'home')
  assert.equal((await schedule.runScheduledBackup()).result, 'created')
  assert.equal(snapshotFiles().length, 2)

  fs.writeFileSync(path.join(uploadsDir, 'second.png'), Buffer.from([0x89, 0x50]))
  assert.equal((await schedule.runScheduledBackup()).result, 'created')

  fs.writeFileSync(path.join(dataDir, 'contact-inbox.jsonl'), '{"id":"m1"}\n')
  assert.equal((await schedule.runScheduledBackup()).result, 'created')
  assert.equal((await schedule.runScheduledBackup()).result, 'unchanged')
  fs.rmSync(path.join(uploadsDir, 'second.png'))
})

test('a deleted row changes the fingerprint even though max(updated_at) does not', async () => {
  getDb().prepare('INSERT INTO collection_items VALUES (?, ?, ?, ?, ?)').run('work', 'later', '{}', '', 1)
  await schedule.runScheduledBackup()
  getDb().prepare('DELETE FROM collection_items WHERE slug = ?').run('later')
  assert.equal((await schedule.runScheduledBackup()).result, 'created')
})

test('a missing snapshot file is backed up again even when the content is unchanged', async () => {
  await schedule.runScheduledBackup()
  for (const f of snapshotFiles()) fs.rmSync(path.join(backupsDir, f))
  assert.equal((await schedule.runScheduledBackup()).result, 'created')
})

test('a manual backup counts: the next scheduled tick is skipped', async () => {
  const manual = await schedule.createTrackedSnapshot('manual')
  assert.equal(manual.manifest.reason, 'manual')
  assert.equal(schedule.readScheduleRecord().lastReason, 'manual')
  assert.equal((await schedule.runScheduledBackup()).result, 'unchanged')
})

test('an empty store is never snapshotted by the schedule', async () => {
  getDb().exec('DELETE FROM pages; DELETE FROM collection_items; DELETE FROM kv;')
  assert.equal((await schedule.runScheduledBackup()).result, 'empty')
  assert.equal(snapshotFiles().length, 0)
})

test('a running backup postpones the tick instead of failing', async () => {
  const running = backup.createSnapshot()
  const outcome = await schedule.runScheduledBackup()
  assert.equal(outcome.result, 'busy')
  await running
  assert.equal(schedule.readScheduleRecord().lastResult, 'busy')
})

test('interval 0 disables the schedule: no timer is ever set', () => {
  let calls = 0
  const handle = schedule.startBackupSchedule({ intervalHours: 0, setTimeoutFn: () => calls++ })
  assert.equal(calls, 0)
  assert.equal(schedule.getBackupStatus().scheduled, false)
  handle.stop()
})

test('fake timers: first run 5–15 min after boot, chained by the interval, busy retries in 10 min', async () => {
  const timers: Array<{ fn: () => void; ms: number }> = []
  let notify: (() => void) | null = null
  const nextTimer = () => new Promise<void>((resolve) => (notify = resolve))
  const setTimeoutFn = (fn: () => void, ms: number) => {
    timers.push({ fn, ms })
    notify?.()
    notify = null
    return timers.length
  }
  let clock = Date.parse('2026-10-13T00:00:00Z')
  const handle = schedule.startBackupSchedule({ intervalHours: 6, setTimeoutFn, clearTimeoutFn: () => {}, random: () => 0.5, now: () => clock })

  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 10 * 60_000) // 5 min + 0.5 × 10 min
  let status = schedule.getBackupStatus(clock)
  assert.equal(status.scheduled, true)
  assert.equal(status.intervalHours, 6)
  assert.equal(status.nextAt, clock + 10 * 60_000)
  assert.equal(status.lastAt, null)
  assert.equal(status.ageHours, null)

  // Tick 1: creates a snapshot, then waits the interval.
  clock += timers[0].ms
  let waiting = nextTimer()
  timers[0].fn()
  await waiting
  assert.equal(timers[1].ms, 6 * 3_600_000)
  assert.equal(snapshotFiles().length, 1)
  status = schedule.getBackupStatus(clock)
  assert.equal(status.lastOk, true)
  assert.equal(status.lastResult, 'created')
  assert.ok(status.lastAt)

  // Tick 2: the content changed, but a restore/backup is running → retry in 10 minutes.
  clock += timers[1].ms
  getDb().prepare('UPDATE kv SET updated_at = ? WHERE key = ?').run(5, 'home')
  const running = backup.createSnapshot()
  waiting = nextTimer()
  timers[1].fn()
  await waiting
  await running
  assert.equal(timers[2].ms, schedule.BUSY_RETRY_MS)

  // Tick 3: the postponed backup runs, then the interval again.
  clock += timers[2].ms
  waiting = nextTimer()
  timers[2].fn()
  await waiting
  assert.equal(timers[3].ms, 6 * 3_600_000)
  assert.equal(schedule.getBackupStatus(clock).lastResult, 'created')

  // Tick 4: nothing changed since → skipped; the backup is confirmed current.
  clock += timers[3].ms
  waiting = nextTimer()
  timers[3].fn()
  await waiting
  assert.equal(timers[4].ms, 6 * 3_600_000)
  status = schedule.getBackupStatus(clock)
  assert.equal(status.lastResult, 'unchanged')
  assert.equal(status.ageHours, 0)

  handle.stop()
  assert.equal(schedule.getBackupStatus(clock).scheduled, false)
})

test('status age and health warnings', () => {
  const base = {
    lastAt: 1,
    lastOk: true,
    ageHours: 3,
    scheduled: true,
    nextAt: 2,
    intervalHours: 24,
    lastRunAt: 1,
    lastResult: 'created' as const,
    lastError: null,
  }
  assert.deepEqual(schedule.backupHealthWarnings(base, 0), [])
  assert.equal(schedule.backupHealthWarnings({ ...base, ageHours: 49 }, 0).length, 1)
  assert.match(schedule.backupHealthWarnings({ ...base, ageHours: 49 }, 0)[0], /49 h/)
  assert.deepEqual(schedule.backupHealthWarnings({ ...base, ageHours: 49, scheduled: false }, 0), [])
  assert.match(schedule.backupHealthWarnings({ ...base, ageHours: null, lastAt: null }, 0)[0], /No backup/)
  const failed = schedule.backupHealthWarnings({ ...base, lastOk: false, lastError: 'R2 credentials rejected for bucket x' }, 0)
  assert.equal(failed.length, 1)
  assert.equal(failed[0].includes('credentials'), false) // details stay out of the public health JSON
  assert.match(schedule.backupHealthWarnings(base, 3)[0], /3 R2 objects/)
})

test('ageHours counts from the newer of the last snapshot and the last unchanged check', async () => {
  const t0 = Date.now()
  await schedule.runScheduledBackup(() => t0)
  const snapAt = schedule.readScheduleRecord().snapshotAt as number
  assert.equal(schedule.getBackupStatus(snapAt + 5 * 3_600_000).ageHours, 5)
  await schedule.runScheduledBackup(() => snapAt + 4 * 3_600_000)
  assert.equal(schedule.getBackupStatus(snapAt + 5 * 3_600_000).ageHours, 1)
})
