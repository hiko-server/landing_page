import { purgeExpiredInbox } from './inbox'
import { contactRetentionDays } from './retention'
import { log } from './log'

/**
 * Nightly expiry of contact messages (CONTACT_RETENTION_DAYS, default 365;
 * 0 turns it off). Same shape as lib/backupSchedule.ts:
 * `startInboxRetention()` is called once per server process from
 * instrumentation.ts and chains setTimeout, so two runs never overlap and the
 * timer never keeps the process alive.
 *
 *   - first run 2–7 minutes after boot (catches up after downtime)
 *   - then every night at RUN_HOUR_UTC (19:00 UTC = 03:00 in Hong Kong)
 *
 * A run streams data/contact-inbox.jsonl and removes messages older than the
 * period (lib/inbox purgeExpiredInbox). It never throws into the caller.
 * Runtime state lives on globalThis (instrumentation and API routes are
 * separate webpack runtimes) so the Inbox panel can show the last run.
 */

export const RUN_HOUR_UTC = 19
const FIRST_RUN_MIN_MS = 2 * 60_000
const FIRST_RUN_SPREAD_MS = 5 * 60_000
const DAY_MS = 86_400_000

export type RetentionRun = { at: number; removed: number; error: string | null }

export type RetentionStatus = {
  /** 0 = automatic expiry is off. */
  days: number
  scheduled: boolean
  nextAt: number | null
  lastRun: RetentionRun | null
}

type Runtime = { started: boolean; nextAt: number | null; lastRun: RetentionRun | null }
type RetentionGlobal = typeof globalThis & { __inboxRetentionRuntime?: Runtime }

function runtime(): Runtime {
  const g = globalThis as RetentionGlobal
  if (!g.__inboxRetentionRuntime) g.__inboxRetentionRuntime = { started: false, nextAt: null, lastRun: null }
  return g.__inboxRetentionRuntime
}

/** Milliseconds from `now` to the next `hourUtc`:00 UTC (always > 0, at most a day). */
export function msUntilNextRun(now: number, hourUtc = RUN_HOUR_UTC): number {
  const d = new Date(now)
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourUtc, 0, 0, 0)
  const next = target > now ? target : target + DAY_MS
  return next - now
}

/** One purge. Never throws; the outcome is logged and kept for the status. */
export function runRetentionPurge(now: number = Date.now(), days: number = contactRetentionDays()): RetentionRun {
  let run: RetentionRun
  try {
    const removed = purgeExpiredInbox(now, days)
    run = { at: now, removed, error: null }
    if (removed) log.info('contact messages expired', { removed, retentionDays: days })
  } catch (err) {
    run = { at: now, removed: 0, error: err instanceof Error ? err.message : String(err) }
    log.error('contact message expiry failed', { err, retentionDays: days })
  }
  runtime().lastRun = run
  return run
}

export type RetentionOptions = {
  days?: number
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (handle: unknown) => void
  random?: () => number
  now?: () => number
}

/** Start the nightly purge for this process; stop() cancels the pending run. */
export function startInboxRetention(opts: RetentionOptions = {}): { stop: () => void } {
  const days = opts.days ?? contactRetentionDays()
  const rt = runtime()
  rt.nextAt = null
  if (days <= 0) {
    rt.started = false
    log.info('contact message expiry is off (CONTACT_RETENTION_DAYS=0)')
    return { stop: () => {} }
  }
  const setT = opts.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearT = opts.clearTimeoutFn ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const random = opts.random ?? Math.random
  const now = opts.now ?? Date.now
  let timer: unknown = null
  let stopped = false

  const schedule = (ms: number) => {
    if (stopped) return
    rt.nextAt = now() + ms
    timer = setT(tick, ms)
    const unref = (timer as { unref?: () => void } | null)?.unref
    if (typeof unref === 'function') unref.call(timer)
  }

  function tick() {
    timer = null
    rt.nextAt = null
    runRetentionPurge(now(), days)
    schedule(msUntilNextRun(now()))
  }

  rt.started = true
  const first = FIRST_RUN_MIN_MS + Math.floor(Math.max(0, Math.min(1, random())) * FIRST_RUN_SPREAD_MS)
  schedule(first)
  log.info('contact message expiry scheduled', { retentionDays: days, firstRunInMs: first })
  return {
    stop: () => {
      stopped = true
      if (timer !== null) clearT(timer)
      timer = null
      rt.started = false
      rt.nextAt = null
    },
  }
}

/** For the Inbox panel. Never throws. */
export function getRetentionStatus(): RetentionStatus {
  const rt = runtime()
  return {
    days: contactRetentionDays(),
    scheduled: rt.started,
    nextAt: rt.started ? rt.nextAt : null,
    lastRun: rt.lastRun,
  }
}
