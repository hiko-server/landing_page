/**
 * Single-use tracking for short-lived signed tokens (the contact-form nonce).
 *
 * A token is claimed when a request starts using it and released again if
 * that request ends up not accepting anything, so a visitor whose send fails
 * can retry with the same form, while one accepted nonce can never carry a
 * second message. Entries are kept until the token itself expires.
 *
 * Memory is bounded: when `maxKeys` is reached, expired entries go first,
 * then the oldest ones (which can at worst let that old token be used once
 * more — the signature and expiry checks still apply).
 */

export type ReplayGuard = {
  /** true = first use (now claimed); false = already used or in use. */
  claim(key: string, expiresAtMs: number, now?: number): boolean
  /** Undo a claim whose request accepted nothing. */
  release(key: string): void
  size(): number
}

export function createReplayGuard(maxKeys = 10_000): ReplayGuard {
  const seen = new Map<string, number>()

  const sweep = (now: number) => {
    if (seen.size < maxKeys) return
    seen.forEach((exp, k) => {
      if (exp <= now) seen.delete(k)
    })
    for (const k of Array.from(seen.keys())) {
      if (seen.size < maxKeys * 0.9) break
      seen.delete(k)
    }
  }

  return {
    claim(key, expiresAtMs, now = Date.now()) {
      const exp = seen.get(key)
      if (exp !== undefined && exp > now) return false
      sweep(now)
      seen.delete(key)
      seen.set(key, expiresAtMs)
      return true
    },
    release(key) {
      seen.delete(key)
    },
    size: () => seen.size,
  }
}

/** One guard per name for the whole process (shared by every route bundle). */
export function sharedReplayGuard(name: string, maxKeys = 10_000): ReplayGuard {
  const registry = globalThis as unknown as Record<symbol, ReplayGuard | undefined>
  const key = Symbol.for(`lucian-dev.replayGuard.${name}`)
  let guard = registry[key]
  if (!guard) {
    guard = createReplayGuard(maxKeys)
    registry[key] = guard
  }
  return guard
}
