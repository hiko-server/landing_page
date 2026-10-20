import { log } from '../log'
import { msUntilNextRun } from '../inboxRetention'
import { TRASH_DAYS, purgeExpiredTrash } from './trashStore'

/**
 * The media library's nightly trash purge (H7): uploads deleted more than
 * TRASH_DAYS (30) days ago are removed for good. Same shape as the other
 * nightly jobs (lib/inboxRetention): `startMediaTrashPurge()` is called once
 * per server process from instrumentation.ts and chains setTimeout — first
 * 3–8 minutes after boot (catching up after downtime), then every night at
 * 19:30 UTC — so two runs never overlap and the timer never keeps the
 * process alive. A run never throws into the caller.
 */

export const RUN_HOUR_UTC = 19
/** Half an hour after the contact-message expiry, so the two never start together. */
const RUN_OFFSET_MS = 30 * 60_000
const FIRST_RUN_MIN_MS = 3 * 60_000
const FIRST_RUN_SPREAD_MS = 5 * 60_000

export type TrashPurgeRun = { at: number; removed: number; error: string | null }

type Runtime = { started: boolean; nextAt: number | null; lastRun: TrashPurgeRun | null }
type PurgeGlobal = typeof globalThis & { __mediaTrashRuntime?: Runtime }

function runtime(): Runtime {
  const g = globalThis as PurgeGlobal
  if (!g.__mediaTrashRuntime) g.__mediaTrashRuntime = { started: false, nextAt: null, lastRun: null }
  return g.__mediaTrashRuntime
}

/** One purge. Never throws; the outcome is logged and kept for the status. */
export function runTrashPurge(now: number = Date.now()): TrashPurgeRun {
  let run: TrashPurgeRun
  try {
    const removed = purgeExpiredTrash(now, TRASH_DAYS)
    run = { at: now, removed: removed.length, error: null }
    if (removed.length) log.info('media trash emptied', { removed: removed.length, days: TRASH_DAYS })
  } catch (err) {
    run = { at: now, removed: 0, error: err instanceof Error ? err.message : String(err) }
    log.error('media trash purge failed', { err })
  }
  runtime().lastRun = run
  return run
}

export type TrashPurgeOptions = {
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (handle: unknown) => void
  random?: () => number
  now?: () => number
}

/** Start the nightly purge for this process; stop() cancels the pending run. */
export function startMediaTrashPurge(opts: TrashPurgeOptions = {}): { stop: () => void } {
  const rt = runtime()
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
    runTrashPurge(now())
    schedule(msUntilNextRun(now() - RUN_OFFSET_MS, RUN_HOUR_UTC))
  }

  rt.started = true
  schedule(FIRST_RUN_MIN_MS + Math.floor(Math.max(0, Math.min(1, random())) * FIRST_RUN_SPREAD_MS))
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

export function trashPurgeStatus(): { scheduled: boolean; nextAt: number | null; lastRun: TrashPurgeRun | null } {
  const rt = runtime()
  return { scheduled: rt.started, nextAt: rt.started ? rt.nextAt : null, lastRun: rt.lastRun }
}
