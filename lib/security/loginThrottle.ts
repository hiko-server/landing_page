/**
 * Login brute-force policy — designed so it cannot be turned against the owner.
 *
 *  1. Per (normalised email, client IP bucket) lockout with exponential
 *     backoff: the first `freeFailures - 1` mistakes cost nothing, the
 *     `freeFailures`-th locks that pair for `baseLockMs`, and every further
 *     failure doubles it up to `maxLockMs`. An attacker only ever locks out
 *     *their own* network — the owner, logging in from anywhere else, is
 *     unaffected. Every email (real or not) is tracked the same way, so the
 *     lockout itself never reveals which address is the admin account.
 *  2. Per-IP request limits (applied by the route via lib/rateLimit.ts):
 *     `ipLimit` attempts per `ipWindowMs`, tightened to `ipLimitUnderAttack`
 *     while the site is under a distributed attack.
 *  3. Global *slowdown*, never a global lockout: when the number of failures
 *     across all clients in `globalWindowMs` reaches `slowdownThreshold`,
 *     every login response is delayed (`slowdownStepMs` per threshold
 *     multiple, capped at `maxSlowdownMs`) — success and failure alike, so the
 *     delay leaks nothing. Distributed guessing becomes slow; the owner can
 *     still sign in.
 *
 * State is in memory (single-process server) and bounded. A restart forgets
 * it — acceptable, because nobody outside the host can trigger one, and the
 * per-IP limits rebuild within one window.
 */

export type LoginThrottlePolicy = {
  freeFailures: number
  baseLockMs: number
  maxLockMs: number
  /** A pair with no failure for this long is forgotten (its backoff resets). */
  forgetAfterMs: number
  globalWindowMs: number
  slowdownThreshold: number
  slowdownStepMs: number
  maxSlowdownMs: number
  ipLimit: number
  ipLimitUnderAttack: number
  ipWindowMs: number
  maxTrackedPairs: number
}

export const DEFAULT_LOGIN_POLICY: LoginThrottlePolicy = {
  freeFailures: 5,
  baseLockMs: 30_000,
  maxLockMs: 60 * 60_000,
  forgetAfterMs: 24 * 60 * 60_000,
  globalWindowMs: 15 * 60_000,
  slowdownThreshold: 30,
  slowdownStepMs: 500,
  maxSlowdownMs: 4_000,
  ipLimit: 10,
  ipLimitUnderAttack: 4,
  ipWindowMs: 5 * 60_000,
  maxTrackedPairs: 10_000,
}

export type LockState = { locked: boolean; retryAfterMs: number }
export type Pressure = { recentFailures: number; underAttack: boolean; delayMs: number }

type PairState = { failures: number; lockedUntil: number; lastFailureAt: number }

/** Lock length after `failures` consecutive failures (0 = not locked). */
export function lockDurationMs(failures: number, policy: LoginThrottlePolicy = DEFAULT_LOGIN_POLICY): number {
  if (failures < policy.freeFailures) return 0
  const exp = Math.min(30, failures - policy.freeFailures)
  return Math.min(policy.maxLockMs, policy.baseLockMs * 2 ** exp)
}

/** Response delay for a given number of recent site-wide failures. */
export function slowdownMs(recentFailures: number, policy: LoginThrottlePolicy = DEFAULT_LOGIN_POLICY): number {
  if (recentFailures < policy.slowdownThreshold) return 0
  const steps = Math.floor(recentFailures / policy.slowdownThreshold)
  return Math.min(policy.maxSlowdownMs, steps * policy.slowdownStepMs)
}

/** Key for the per-(email, client) state. */
export function pairKey(normalizedEmail: string, clientBucket: string): string {
  return `${normalizedEmail}\n${clientBucket}`
}

export type LoginThrottle = {
  check(key: string, now?: number): LockState
  fail(key: string, now?: number): LockState
  succeed(key: string): void
  pressure(now?: number): Pressure
  trackedPairs(): number
}

export function createLoginThrottle(policy: LoginThrottlePolicy = DEFAULT_LOGIN_POLICY): LoginThrottle {
  const pairs = new Map<string, PairState>()
  // Timestamps of recent failures, oldest first. Capped: past the cap the
  // slowdown is saturated anyway, so older entries carry no information.
  const failureTimes: number[] = []
  const failureCap = Math.max(
    policy.slowdownThreshold,
    policy.slowdownThreshold * Math.ceil(policy.maxSlowdownMs / Math.max(1, policy.slowdownStepMs)) + 1,
  )

  const live = (key: string, now: number): PairState | undefined => {
    const st = pairs.get(key)
    if (!st) return undefined
    if (st.lockedUntil <= now && now - st.lastFailureAt >= policy.forgetAfterMs) {
      pairs.delete(key)
      return undefined
    }
    return st
  }

  const evict = (now: number) => {
    if (pairs.size < policy.maxTrackedPairs) return
    pairs.forEach((st, k) => {
      if (st.lockedUntil <= now && now - st.lastFailureAt >= policy.forgetAfterMs) pairs.delete(k)
    })
    // Still full: drop unlocked pairs (oldest first) before ever releasing a
    // lock, so flooding junk emails can't flush an active lockout.
    if (pairs.size >= policy.maxTrackedPairs) {
      for (const [k, st] of Array.from(pairs.entries())) {
        if (pairs.size < policy.maxTrackedPairs * 0.9) break
        if (st.lockedUntil <= now) pairs.delete(k)
      }
    }
    if (pairs.size >= policy.maxTrackedPairs) {
      const first = pairs.keys().next()
      if (!first.done) pairs.delete(first.value)
    }
  }

  const lockOf = (st: PairState | undefined, now: number): LockState =>
    st && st.lockedUntil > now ? { locked: true, retryAfterMs: st.lockedUntil - now } : { locked: false, retryAfterMs: 0 }

  return {
    check(key, now = Date.now()) {
      return lockOf(live(key, now), now)
    },

    fail(key, now = Date.now()) {
      failureTimes.push(now)
      if (failureTimes.length > failureCap) failureTimes.splice(0, failureTimes.length - failureCap)

      let st = live(key, now)
      if (!st) {
        evict(now)
        st = { failures: 0, lockedUntil: 0, lastFailureAt: now }
      } else {
        // Re-insert so Map order tracks recency for eviction.
        pairs.delete(key)
      }
      st.failures += 1
      st.lastFailureAt = now
      const lockMs = lockDurationMs(st.failures, policy)
      if (lockMs > 0) st.lockedUntil = Math.max(st.lockedUntil, now + lockMs)
      pairs.set(key, st)
      return lockOf(st, now)
    },

    succeed(key) {
      pairs.delete(key)
    },

    pressure(now = Date.now()) {
      const since = now - policy.globalWindowMs
      while (failureTimes.length && failureTimes[0] <= since) failureTimes.shift()
      const recentFailures = failureTimes.length
      const delayMs = slowdownMs(recentFailures, policy)
      return { recentFailures, underAttack: delayMs > 0, delayMs }
    },

    trackedPairs: () => pairs.size,
  }
}
