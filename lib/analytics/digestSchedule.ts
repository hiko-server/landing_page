import { log } from '../log'

/**
 * The weekly analytics digest's timer (H10). `startDigestSchedule()` is
 * called once per server process from instrumentation.ts (never during
 * `next build`): a chained setTimeout that never keeps the process alive
 * checks every hour — first a few minutes after boot — whether last week's
 * digest is due (lib/analytics/digestShared isDigestDue: switched on, Monday
 * from 01:00 UTC, within 48 hours, not sent yet) and sends it
 * (lib/analytics/digest sendDigest, which claims the week in the store).
 * Without SMTP nothing is sent. Nothing here throws.
 */

const HOUR_MS = 3_600_000
const FIRST_CHECK_MIN_MS = 2 * 60_000
const FIRST_CHECK_SPREAD_MS = 5 * 60_000

export type DigestScheduleOptions = {
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (handle: unknown) => void
  random?: () => number
  /** One check (tests); by default sendDigest('scheduled') when SMTP is configured. */
  check?: () => Promise<unknown>
}

async function defaultCheck(): Promise<unknown> {
  const { smtpConfigured } = await import('../mailAlignment')
  if (!smtpConfigured()) return null
  const { sendDigest } = await import('./digest')
  return sendDigest('scheduled')
}

export function startDigestSchedule(opts: DigestScheduleOptions = {}): { stop: () => void } {
  const setT = opts.setTimeoutFn ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearT = opts.clearTimeoutFn ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const check = opts.check ?? defaultCheck
  let timer: unknown = null
  let stopped = false

  const schedule = (ms: number) => {
    if (stopped) return
    timer = setT(() => void tick(), ms)
    const unref = (timer as { unref?: () => void } | null)?.unref
    if (typeof unref === 'function') unref.call(timer)
  }

  const tick = async () => {
    timer = null
    try {
      await check()
    } catch (err) {
      log.warn('analytics digest check failed', { err })
    }
    schedule(HOUR_MS)
  }

  const r = Math.max(0, Math.min(1, (opts.random ?? Math.random)()))
  schedule(FIRST_CHECK_MIN_MS + Math.floor(r * FIRST_CHECK_SPREAD_MS))
  return {
    stop: () => {
      stopped = true
      if (timer !== null) clearT(timer)
      timer = null
    },
  }
}
