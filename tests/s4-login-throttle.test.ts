import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLoginThrottle, DEFAULT_LOGIN_POLICY, lockDurationMs, pairKey, slowdownMs, type LoginThrottlePolicy } from '../lib/security/loginThrottle'

const P = DEFAULT_LOGIN_POLICY

test('backoff: free attempts, then exponential lock, capped', () => {
  assert.equal(lockDurationMs(P.freeFailures - 1), 0)
  assert.equal(lockDurationMs(P.freeFailures), P.baseLockMs)
  assert.equal(lockDurationMs(P.freeFailures + 1), P.baseLockMs * 2)
  assert.equal(lockDurationMs(P.freeFailures + 3), P.baseLockMs * 8)
  assert.equal(lockDurationMs(P.freeFailures + 100), P.maxLockMs)
})

test('a pair locks after the free attempts and success clears it', () => {
  const t = createLoginThrottle()
  const key = pairKey('owner@example.com', '203.0.113.9')
  let now = 1_000_000
  for (let i = 1; i < P.freeFailures; i++) assert.equal(t.fail(key, now++).locked, false)
  const locked = t.fail(key, now)
  assert.equal(locked.locked, true)
  assert.equal(locked.retryAfterMs, P.baseLockMs)
  assert.equal(t.check(key, now + P.baseLockMs - 1).locked, true)
  assert.equal(t.check(key, now + P.baseLockMs).locked, false)
  // Next failure after the lock doubles it.
  assert.equal(t.fail(key, now + P.baseLockMs).retryAfterMs, P.baseLockMs * 2)
  t.succeed(key)
  assert.equal(t.check(key, now + P.baseLockMs).locked, false)
})

test('an attacker cannot lock the owner out from another network', () => {
  const t = createLoginThrottle()
  const now = 5_000_000
  for (let ip = 0; ip < 50; ip++) {
    for (let i = 0; i < 20; i++) t.fail(pairKey('owner@example.com', `198.51.100.${ip}`), now + i)
  }
  assert.equal(t.check(pairKey('owner@example.com', '203.0.113.9'), now + 100).locked, false)
})

test('unknown and real emails are throttled identically', () => {
  const t = createLoginThrottle()
  const now = 7_000_000
  const a: boolean[] = []
  const b: boolean[] = []
  for (let i = 0; i < P.freeFailures + 2; i++) {
    a.push(t.fail(pairKey('owner@example.com', '1.2.3.4'), now + i).locked)
    b.push(t.fail(pairKey('nobody@example.com', '1.2.3.5'), now + i).locked)
  }
  assert.deepEqual(a, b)
})

test('global pressure slows down instead of locking out', () => {
  assert.equal(slowdownMs(P.slowdownThreshold - 1), 0)
  assert.equal(slowdownMs(P.slowdownThreshold), P.slowdownStepMs)
  assert.equal(slowdownMs(P.slowdownThreshold * 1000), P.maxSlowdownMs)

  const t = createLoginThrottle()
  const now = 9_000_000
  for (let i = 0; i < P.slowdownThreshold * 3; i++) t.fail(pairKey(`x${i}@example.com`, `10.0.${i >> 8}.${i & 255}`), now)
  const p = t.pressure(now + 1)
  assert.equal(p.underAttack, true)
  assert.equal(p.delayMs, P.slowdownStepMs * 3)
  // Fresh client is still allowed to try.
  assert.equal(t.check(pairKey('owner@example.com', '203.0.113.9'), now + 1).locked, false)
  // Pressure decays after the window.
  assert.deepEqual(t.pressure(now + P.globalWindowMs + 1), { recentFailures: 0, underAttack: false, delayMs: 0 })
})

test('state is bounded and junk pairs never flush an active lock', () => {
  const policy: LoginThrottlePolicy = { ...P, maxTrackedPairs: 50 }
  const t = createLoginThrottle(policy)
  const now = 11_000_000
  const victim = pairKey('owner@example.com', '6.6.6.6')
  for (let i = 0; i < policy.freeFailures; i++) t.fail(victim, now)
  assert.equal(t.check(victim, now).locked, true)
  for (let i = 0; i < 500; i++) t.fail(pairKey(`junk${i}@example.com`, '6.6.6.6'), now)
  assert.ok(t.trackedPairs() <= policy.maxTrackedPairs)
  assert.equal(t.check(victim, now).locked, true)
})

test('old failures are forgotten', () => {
  const t = createLoginThrottle()
  const key = pairKey('a@b.c', '1.1.1.1')
  for (let i = 0; i < P.freeFailures - 1; i++) t.fail(key, 0)
  assert.equal(t.fail(key, P.forgetAfterMs + 1).locked, false)
})
