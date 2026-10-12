/**
 * Process-wide admission gate for credential checks — the part of the login
 * defence that turns the site-wide slowdown into a real throughput limit.
 *
 * A per-request `sleep()` only adds latency: hundreds of concurrent guesses
 * all sleep together, so throughput stays bounded by CPU alone. This gate
 * instead decides *when* a credential check may run at all:
 *
 *   - Calm (spacing 0): up to `maxConcurrent` checks run side by side. Extra
 *     ones go through the serial queue (one at a time beside them), so even
 *     a burst that lands before any failure has been counted can never have
 *     more than `maxConcurrent + 1` scrypt hashes in flight.
 *   - Under pressure (spacing > 0): every check from an unrecognised device
 *     goes through ONE serial queue. A check starts only after the previous
 *     one finished *and* `spacing()` milliseconds have passed — e.g. at the
 *     4 s maximum slowdown the whole internet together gets 15 guesses a
 *     minute, however many addresses it uses.
 *   - The queue is bounded: besides the check it is running, at most
 *     `maxQueue` waiters, and never more than roughly `maxQueueWaitMs` of
 *     waiting ahead of a newcomer. Past that the
 *     request is refused immediately (the route answers a generic 429) rather
 *     than holding a socket open for minutes.
 *   - `bypass` (a signed known-device cookie, see knownDevice.ts) skips the
 *     queue entirely; the per-(email, client) lockout still applies to it.
 *
 * `spacing` is read when each queued check finishes, so the queue drains
 * at full speed again as soon as the pressure is gone.
 */

export type LoginGatePolicy = {
  /** Checks allowed to run concurrently while nothing is queued and the site is calm. */
  maxConcurrent: number
  /** Hard cap on waiting checks (not counting the one the queue is running). */
  maxQueue: number
  /** Refuse a newcomer when the queue ahead of it would take longer than this. */
  maxQueueWaitMs: number
}

export const DEFAULT_LOGIN_GATE_POLICY: LoginGatePolicy = {
  maxConcurrent: 8,
  maxQueue: 32,
  maxQueueWaitMs: 30_000,
}

export type GateAdmission<T> = { admitted: true; result: Promise<T> } | { admitted: false; retryAfterMs: number }

export type LoginGate = {
  /** Run `task` now, queue it, or refuse it (queue full). */
  admit<T>(task: () => Promise<T>, opts?: { bypass?: boolean }): GateAdmission<T>
  /** Checks waiting in the serial queue. */
  queued(): number
  /** Checks currently running outside the queue (calm or bypass). */
  running(): number
}

/** A queued check: runs the task, settles the caller's promise, resolves when done. */
type Waiter = () => Promise<void>

/** Call `task`, turning a synchronous throw into a rejected promise. */
function invoke<T>(task: () => Promise<T>): Promise<T> {
  try {
    return task()
  } catch (err) {
    return Promise.reject(err)
  }
}

export function createLoginGate(
  spacing: () => number,
  policy: LoginGatePolicy = DEFAULT_LOGIN_GATE_POLICY,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): LoginGate {
  const waiters: Waiter[] = []
  let direct = 0
  let draining = false
  /** Earliest time the next queued check may start. */
  let nextAt = 0

  const currentSpacing = () => {
    const s = spacing()
    return Number.isFinite(s) && s > 0 ? s : 0
  }

  /** How many waiters the queue may hold right now. */
  const queueLimit = (s: number) =>
    s > 0 ? Math.max(1, Math.min(policy.maxQueue, Math.floor(policy.maxQueueWaitMs / s))) : policy.maxQueue

  /** Run queued checks strictly one after another, spaced by the current slowdown. */
  const drain = async () => {
    if (draining) return
    draining = true
    try {
      for (let next = waiters.shift(); next; next = waiters.shift()) {
        const wait = nextAt - Date.now()
        if (wait > 0) await sleep(wait)
        await next()
        nextAt = Date.now() + currentSpacing()
      }
    } finally {
      draining = false
    }
  }

  const runDirect = <T>(task: () => Promise<T>): Promise<T> => {
    direct++
    return invoke(task).finally(() => {
      direct--
    })
  }

  return {
    admit<T>(task: () => Promise<T>, opts: { bypass?: boolean } = {}): GateAdmission<T> {
      if (opts.bypass) return { admitted: true, result: runDirect(task) }

      const s = currentSpacing()
      const calm = s === 0 && waiters.length === 0 && !draining && direct < policy.maxConcurrent
      if (calm) return { admitted: true, result: runDirect(task) }

      if (waiters.length >= queueLimit(s)) {
        const ahead = Math.max(1, waiters.length) * Math.max(s, 1_000)
        return { admitted: false, retryAfterMs: Math.min(ahead, policy.maxQueueWaitMs) }
      }

      const result = new Promise<T>((resolve, reject) => {
        waiters.push(() => invoke(task).then(resolve, reject))
      })
      void drain()
      return { admitted: true, result }
    },
    queued: () => waiters.length,
    running: () => direct,
  }
}
