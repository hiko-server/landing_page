/**
 * H5 — the in-process scheduler (lib/schedule/scheduler) with a controlled
 * clock and timers: the first check after boot catches up what is overdue,
 * it sleeps until the next slot (at most RESCAN_MS), a schedule change
 * re-arms it to the second, failures back off without losing the slot, a
 * busy pass retries soon, and stop() cancels everything.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOOT_DELAY_MS,
  BUSY_RETRY_MS,
  DUE_SLACK_MS,
  RESCAN_MS,
  delayUntil,
  failureDelay,
  publishSchedulerStatus,
  rearmPublishScheduler,
  startPublishScheduler,
} from '../lib/schedule/scheduler'
import { InternalJobBusyError } from '../lib/internalJobs'

type Timer = { at: number; fn: () => void; id: number }

/** A clock and a timer queue the test advances by hand. */
function fakeTime(start: number) {
  let now = start
  let seq = 0
  const timers: Timer[] = []
  return {
    now: () => now,
    setTimeoutFn: (fn: () => void, ms: number) => {
      const t = { at: now + ms, fn, id: ++seq }
      timers.push(t)
      return t
    },
    clearTimeoutFn: (h: unknown) => {
      const i = timers.indexOf(h as Timer)
      if (i >= 0) timers.splice(i, 1)
    },
    pending: () => timers.map((t) => t.at - now).sort((a, b) => a - b),
    /** Move the clock to the next timer and fire it (awaiting what it started). */
    async next() {
      timers.sort((a, b) => a.at - b.at)
      const t = timers.shift()
      if (!t) throw new Error('no timer pending')
      now = Math.max(now, t.at)
      t.fn()
      for (let i = 0; i < 20; i++) await Promise.resolve()
      await new Promise((r) => setImmediate(r))
    },
    advance(ms: number) {
      now += ms
    },
  }
}

test('delays: sleep until the slot (a little after it), never longer than the rescan; failures back off', () => {
  assert.equal(delayUntil(null, 0), RESCAN_MS)
  assert.equal(delayUntil(60_000, 0), 60_000 + DUE_SLACK_MS)
  assert.equal(delayUntil(-5, 0), DUE_SLACK_MS, 'overdue: right away')
  assert.equal(delayUntil(86_400_000, 0), RESCAN_MS)
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(failureDelay), [30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000])
})

test('boot: the first check catches up an overdue slot; then it sleeps until the next one', async () => {
  const t = fakeTime(1_000_000)
  const schedule = [t.now() - 3 * 3_600_000, t.now() + 5 * 60_000] // one missed while down, one ahead
  let runs = 0
  const handle = startPublishScheduler({
    ...t,
    nextDueAt: () => (schedule.length ? schedule[0] : null),
    run: async () => {
      runs++
      // The pass publishes everything due.
      while (schedule.length && schedule[0] <= t.now()) schedule.shift()
    },
  })
  try {
    assert.deepEqual(t.pending(), [BOOT_DELAY_MS], 'waits for the server to answer first')
    assert.equal(publishSchedulerStatus().running, true)
    await t.next()
    assert.equal(runs, 1, 'caught up at boot')
    const wait = t.pending()[0]
    assert.ok(Math.abs(wait - (5 * 60_000 - BOOT_DELAY_MS + DUE_SLACK_MS)) <= 1, `sleeps until the next slot (${wait})`)
    await t.next()
    assert.equal(runs, 2, 'ran on time')
    assert.deepEqual(t.pending(), [RESCAN_MS], 'nothing left: rescans every 10 minutes')
    await t.next()
    assert.equal(runs, 2, 'a rescan with nothing due runs no pass')
    assert.deepEqual(t.pending(), [RESCAN_MS])
  } finally {
    handle.stop()
  }
  assert.deepEqual(t.pending(), [], 'stop cancels the timer')
  assert.equal(publishSchedulerStatus().running, false)
})

test('a schedule change re-arms the sleeping scheduler to the second', async () => {
  const t = fakeTime(5_000_000)
  let next: number | null = null
  let runs = 0
  const handle = startPublishScheduler({ ...t, bootDelayMs: 0, nextDueAt: () => next, run: async () => void runs++ })
  try {
    await t.next()
    assert.deepEqual(t.pending(), [RESCAN_MS])
    next = t.now() + 90_000
    rearmPublishScheduler()
    assert.deepEqual(t.pending(), [90_000 + DUE_SLACK_MS], 'one timer, at the new slot')
    next = t.now() + 30_000
    rearmPublishScheduler()
    assert.deepEqual(t.pending(), [30_000 + DUE_SLACK_MS], 'replaced, never doubled')
    await t.next()
    assert.equal(runs, 1)
  } finally {
    handle.stop()
  }
  rearmPublishScheduler() // after stop: a no-op
  assert.deepEqual(t.pending(), [])
})

test('a failed pass backs off and keeps the slot; a busy one retries soon', async () => {
  const t = fakeTime(9_000_000)
  const due = t.now() - 1
  let mode: 'fail' | 'busy' | 'ok' = 'fail'
  let done = false
  const handle = startPublishScheduler({
    ...t,
    bootDelayMs: 0,
    nextDueAt: () => (done ? null : due),
    run: async () => {
      if (mode === 'fail') throw new Error('ECONNREFUSED')
      if (mode === 'busy') throw new InternalJobBusyError('busy')
      done = true
    },
  })
  try {
    await t.next()
    assert.deepEqual(t.pending(), [30_000])
    assert.equal(publishSchedulerStatus().lastPassOk, false)
    assert.equal(publishSchedulerStatus().lastError, 'ECONNREFUSED')
    await t.next()
    assert.deepEqual(t.pending(), [60_000], 'doubles')
    mode = 'busy'
    await t.next()
    assert.deepEqual(t.pending(), [BUSY_RETRY_MS])
    mode = 'ok'
    await t.next()
    assert.equal(done, true)
    assert.equal(publishSchedulerStatus().lastPassOk, true)
    assert.deepEqual(t.pending(), [RESCAN_MS])
  } finally {
    handle.stop()
  }
})

test('an unreadable schedule never crashes the scheduler', async () => {
  const t = fakeTime(1)
  const handle = startPublishScheduler({
    ...t,
    bootDelayMs: 0,
    nextDueAt: () => {
      throw new Error('database is locked')
    },
    run: async () => assert.fail('nothing to run'),
  })
  try {
    await t.next()
    assert.deepEqual(t.pending(), [RESCAN_MS])
  } finally {
    handle.stop()
  }
})
