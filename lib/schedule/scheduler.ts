import { log } from '../log'
import { InternalJobBusyError, triggerInternalJob } from '../internalJobs'
import { nextScheduledAt } from './store'

/**
 * The in-process scheduler of scheduled publishing (H5). Same shape as the
 * backup schedule (lib/backupSchedule): `startPublishScheduler()` is called
 * once per server process from instrumentation.ts (never during
 * `next build`), timers are chained setTimeouts (two passes never overlap)
 * and never keep the process alive, and nothing here throws.
 *
 * Nothing is kept in memory that a restart would lose: the schedule lives in
 * the content store (lib/schedule/fields), so after a restart the first
 * check — BOOT_DELAY_MS after start, once the server answers — finds every
 * slot that came due while it was down and runs it (catch-up).
 *
 *   check   read the soonest scheduled time (one cheap query). Due → run a
 *           pass; otherwise sleep until it is due, at most RESCAN_MS, so
 *           a schedule that arrives without telling the scheduler (a
 *           restore, a storage pull, an R2 boot sync) is seen within that.
 *   pass    POST /api/internal/scheduled-publish on this server
 *           (lib/internalJobs): the pass needs res.revalidate() and the MDX
 *           renderer, which the instrumentation bundle must not import.
 *           A busy pass retries in BUSY_RETRY_MS; a failed one backs off
 *           30 s, 1, 2, 4 … up to 10 minutes (the slot stays due, nothing is lost).
 *   rearm   the admin's schedule changes call rearmPublishScheduler() so a
 *           new time is honoured to the second, not after RESCAN_MS.
 *
 * Runtime state lives on globalThis: instrumentation and the API routes are
 * separate webpack runtimes of one process.
 */

export const BOOT_DELAY_MS = 15_000
export const RESCAN_MS = 10 * 60_000
export const BUSY_RETRY_MS = 15_000
export const FAILURE_RETRY_MIN_MS = 30_000
export const FAILURE_RETRY_MAX_MS = 10 * 60_000
/** Wake a little after the due time so the pass never finds it a few ms early. */
export const DUE_SLACK_MS = 250

export type PublishSchedulerStatus = {
  running: boolean
  /** When the scheduler wakes next (ms), null when idle or stopped. */
  nextCheckAt: number | null
  /** The soonest scheduled time it knows of (ms; may be in the past while a pass is pending). */
  nextDueAt: number | null
  lastPassAt: number | null
  lastPassOk: boolean | null
  lastError: string | null
}

type Runtime = PublishSchedulerStatus & { started: boolean; rearm: (() => void) | null }
type SchedulerGlobal = typeof globalThis & { __publishScheduler?: Runtime }

function runtime(): Runtime {
  const g = globalThis as SchedulerGlobal
  if (!g.__publishScheduler) {
    g.__publishScheduler = {
      started: false,
      running: false,
      nextCheckAt: null,
      nextDueAt: null,
      lastPassAt: null,
      lastPassOk: null,
      lastError: null,
      rearm: null,
    }
  }
  return g.__publishScheduler
}

export type PublishSchedulerOptions = {
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (handle: unknown) => void
  now?: () => number
  /** The soonest scheduled time, or null (default: the content store). */
  nextDueAt?: () => number | null
  /** One publishing pass (default: the internal job on this server). */
  run?: () => Promise<unknown>
  bootDelayMs?: number
}

/** How long to sleep before the next check, given the soonest scheduled time. */
export function delayUntil(nextDue: number | null, now: number): number {
  if (nextDue === null) return RESCAN_MS
  return Math.min(RESCAN_MS, Math.max(0, nextDue - now) + DUE_SLACK_MS)
}

/** Back-off after `failures` failed passes in a row (1 → 30 s … capped at 10 min). */
export function failureDelay(failures: number): number {
  return Math.min(FAILURE_RETRY_MAX_MS, FAILURE_RETRY_MIN_MS * 2 ** Math.max(0, failures - 1))
}

export function startPublishScheduler(opts: PublishSchedulerOptions = {}): { stop: () => void } {
  const rt = runtime()
  const setT = opts.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearT = opts.clearTimeoutFn ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const now = opts.now ?? Date.now
  const readNext = opts.nextDueAt ?? nextScheduledAt
  const run = opts.run ?? (() => triggerInternalJob('scheduled-publish'))
  let timer: unknown = null
  let stopped = false
  let checking = false
  let rearmRequested = false
  let failures = 0

  const schedule = (ms: number) => {
    if (stopped) return
    if (timer !== null) clearT(timer)
    rt.nextCheckAt = now() + ms
    timer = setT(() => void check(), ms)
    // Never keep the process (or a test run) alive just for the next check.
    const unref = (timer as { unref?: () => void } | null)?.unref
    if (typeof unref === 'function') unref.call(timer)
  }

  const soonest = (): number | null => {
    try {
      return readNext()
    } catch (err) {
      log.warn('scheduled publishing: could not read the schedule', { err })
      return null
    }
  }

  const check = async (): Promise<void> => {
    if (stopped) return
    timer = null
    rt.nextCheckAt = null
    checking = true
    rearmRequested = false
    let next: number
    try {
      const due = soonest()
      rt.nextDueAt = due
      if (due !== null && due <= now()) {
        try {
          await run()
          failures = 0
          rt.lastPassOk = true
          rt.lastError = null
          // Look again at once: the pass may have left nothing, or something due later.
          const after = soonest()
          rt.nextDueAt = after
          next = after !== null && after <= now() ? BUSY_RETRY_MS : delayUntil(after, now())
        } catch (err) {
          if (err instanceof InternalJobBusyError) next = BUSY_RETRY_MS
          else {
            failures++
            rt.lastPassOk = false
            rt.lastError = err instanceof Error ? err.message : String(err)
            next = failureDelay(failures)
            log.warn('scheduled publishing: the pass failed; the slot stays due and is retried', { err, retryInMs: next })
          }
        } finally {
          rt.lastPassAt = now()
        }
      } else {
        next = delayUntil(due, now())
      }
    } finally {
      checking = false
    }
    if (rearmRequested && failures === 0) {
      rearmRequested = false
      next = delayUntil(soonest(), now())
    }
    schedule(next)
  }

  const rearm = () => {
    if (stopped) return
    if (checking) {
      rearmRequested = true
      return
    }
    const due = soonest()
    rt.nextDueAt = due
    schedule(delayUntil(due, now()))
  }

  rt.started = true
  rt.running = true
  rt.rearm = rearm
  const first = Math.max(0, opts.bootDelayMs ?? BOOT_DELAY_MS)
  schedule(first)
  log.info('scheduled publishing started', { firstCheckInMs: first })
  return {
    stop: () => {
      stopped = true
      if (timer !== null) clearT(timer)
      timer = null
      rt.started = false
      rt.running = false
      rt.nextCheckAt = null
      rt.rearm = null
    },
  }
}

/**
 * Tell the scheduler that a schedule changed (admin API). A no-op when the
 * scheduler is not running in this process (tests, `next build`).
 */
export function rearmPublishScheduler(): void {
  try {
    runtime().rearm?.()
  } catch (err) {
    log.warn('scheduled publishing: could not re-arm the scheduler', { err })
  }
}

export function publishSchedulerStatus(): PublishSchedulerStatus {
  const rt = runtime()
  return {
    running: rt.running,
    nextCheckAt: rt.running ? rt.nextCheckAt : null,
    nextDueAt: rt.nextDueAt,
    lastPassAt: rt.lastPassAt,
    lastPassOk: rt.lastPassOk,
    lastError: rt.lastError,
  }
}
