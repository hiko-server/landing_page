import { log } from '../log'
import { InternalJobBusyError, triggerInternalJob } from '../internalJobs'
import { readLinkStore } from './linkStore'

/**
 * The daily external-link check (content health center).
 *
 * `startLinkCheckSchedule()` is called once per server process from
 * instrumentation.ts (never during `next build`). Same shape as the restore
 * drill (lib/restoreDrill.ts): chained setTimeout (two runs never overlap,
 * the timer never keeps the process alive), first run 10–20 minutes after
 * boot unless the stored last run (data/content-health/links.json) is more
 * recent than the interval, then every LINK_CHECK_INTERVAL_HOURS (default
 * 24; 0 turns scheduled checks off — "Check links now" still works).
 *
 * The run itself goes through POST /api/internal/content-health on this
 * server (lib/internalJobs.ts): it needs the content store readers and the
 * MDX parser, which the instrumentation bundle must not import. A run that
 * finds a manual check already running counts as done. Nothing here throws.
 */

export const DEFAULT_LINK_CHECK_HOURS = 24
const HOUR_MS = 3_600_000
const FIRST_RUN_MIN_MS = 10 * 60_000
const FIRST_RUN_SPREAD_MS = 10 * 60_000
const FAILED_RETRY_MS = 2 * HOUR_MS

type Runtime = { started: boolean; intervalHours: number; nextAt: number | null }
type ScheduleGlobal = typeof globalThis & { __contentHealthSchedule?: Runtime }

function runtime(): Runtime {
  const g = globalThis as ScheduleGlobal
  if (!g.__contentHealthSchedule)
    g.__contentHealthSchedule = { started: false, intervalHours: 0, nextAt: null }
  return g.__contentHealthSchedule
}

/** LINK_CHECK_INTERVAL_HOURS: unset → 24, 0 → off, otherwise clamped to [6, 168]. */
export function linkCheckIntervalHours(
  raw: string | undefined = process.env.LINK_CHECK_INTERVAL_HOURS
): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_LINK_CHECK_HOURS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_LINK_CHECK_HOURS
  if (n === 0) return 0
  return Math.min(Math.max(n, 6), 168)
}

/** Delay of the first scheduled run after boot (pure; unit-tested). */
export function firstLinkCheckDelay(
  lastFinishedAt: number | null,
  intervalMs: number,
  now: number,
  random: number
): number {
  const boot = FIRST_RUN_MIN_MS + Math.floor(Math.max(0, Math.min(1, random)) * FIRST_RUN_SPREAD_MS)
  if (lastFinishedAt === null) return boot
  return Math.max(boot, lastFinishedAt + intervalMs - now)
}

export function linkScheduleStatus(): {
  enabled: boolean
  intervalHours: number
  nextAt: number | null
} {
  const rt = runtime()
  return {
    enabled: rt.started,
    intervalHours: rt.started ? rt.intervalHours : linkCheckIntervalHours(),
    nextAt: rt.started ? rt.nextAt : null,
  }
}

export type LinkScheduleOptions = {
  intervalHours?: number
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (handle: unknown) => void
  random?: () => number
  now?: () => number
  run?: () => Promise<unknown>
  lastFinishedAt?: () => number | null
}

export function startLinkCheckSchedule(opts: LinkScheduleOptions = {}): { stop: () => void } {
  const intervalHours = opts.intervalHours ?? linkCheckIntervalHours()
  const rt = runtime()
  rt.intervalHours = intervalHours
  rt.nextAt = null
  if (intervalHours <= 0) {
    rt.started = false
    log.info('scheduled link checks are off (LINK_CHECK_INTERVAL_HOURS=0)')
    return { stop: () => {} }
  }
  const setT = opts.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearT =
    opts.clearTimeoutFn ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const now = opts.now ?? Date.now
  const run = opts.run ?? (() => triggerInternalJob('content-health'))
  const intervalMs = intervalHours * HOUR_MS
  let timer: unknown = null
  let stopped = false

  const schedule = (ms: number) => {
    if (stopped) return
    rt.nextAt = now() + ms
    timer = setT(() => void tick(), ms)
    const unref = (timer as { unref?: () => void } | null)?.unref
    if (typeof unref === 'function') unref.call(timer)
  }

  const tick = async () => {
    timer = null
    rt.nextAt = null
    let next = intervalMs
    try {
      await run()
    } catch (err) {
      if (!(err instanceof InternalJobBusyError)) {
        log.warn('scheduled link check failed', { err })
        next = Math.min(intervalMs, FAILED_RETRY_MS)
      }
    }
    schedule(next)
  }

  rt.started = true
  // A run that failed (or never finished) does not postpone the next one.
  let last: number | null = null
  try {
    if (opts.lastFinishedAt) last = opts.lastFinishedAt()
    else {
      const run = readLinkStore().lastRun
      last = run && !run.error ? run.finishedAt : null
    }
  } catch {
    last = null
  }
  const first = firstLinkCheckDelay(last, intervalMs, now(), (opts.random ?? Math.random)())
  schedule(first)
  log.info('link checks scheduled', { intervalHours, firstRunInMs: first })
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
