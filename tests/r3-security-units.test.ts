import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLoginGate } from '../lib/security/loginGate'
import { KNOWN_DEVICE_TTL_S, newDeviceId, signKnownDevice, verifyKnownDevice } from '../lib/security/knownDevice'
import { ipv6Network48 } from '../lib/security/ipNetwork'
import { defaultTrustedProxies, parseDefaultGateway } from '../lib/security/proxyTrust'
import { createReplayGuard } from '../lib/security/replayGuard'
import { parseIp, ipInAny, pickClientIp } from '../lib/security/ip'
import { formatBytes, inboxArrowTarget } from '../components/Admin/shell/inboxFormat'

const tick = () => new Promise<void>((r) => setImmediate(r))

test('login gate: calm checks run concurrently up to the cap, then queue', async () => {
  const gate = createLoginGate(() => 0, { maxConcurrent: 2, maxQueue: 3, maxQueueWaitMs: 30_000 })
  const releases: Array<() => void> = []
  const task = () => new Promise<string>((resolve) => releases.push(() => resolve('done')))
  const a = gate.admit(task)
  const b = gate.admit(task)
  const c = gate.admit(task)
  const d = gate.admit(task)
  assert.ok(a.admitted && b.admitted && c.admitted && d.admitted)
  assert.equal(gate.running(), 2)
  await tick()
  // Past the cap, checks go through the serial queue: one at a time beside the others.
  assert.equal(releases.length, 3, 'only one queued check runs at a time')
  assert.equal(gate.queued(), 1)
  releases[2]()
  await tick()
  await tick()
  assert.equal(releases.length, 4, 'the next queued check starts when the previous one is done')
  releases[0]()
  releases[1]()
  releases[3]()
  if (d.admitted) assert.equal(await d.result, 'done')
})

test('login gate: under pressure checks are serialised and spaced; overflow is refused at once', async () => {
  const slept: number[] = []
  let spacing = 4_000
  const fakeSleep = async (ms: number) => {
    slept.push(ms)
  }
  const gate = createLoginGate(() => spacing, { maxConcurrent: 8, maxQueue: 32, maxQueueWaitMs: 12_000 }, fakeSleep)
  let concurrent = 0
  let peak = 0
  const order: number[] = []
  const task = (n: number) => async () => {
    concurrent++
    peak = Math.max(peak, concurrent)
    await tick()
    order.push(n)
    concurrent--
    return n
  }
  // Waiting room = floor(12 000 / 4 000) = 3, plus the check already running.
  const admitted = [1, 2, 3, 4].map((n) => gate.admit(task(n)))
  assert.ok(admitted.every((a) => a.admitted))
  const overflow = gate.admit(task(5))
  assert.equal(overflow.admitted, false)
  if (!overflow.admitted) assert.ok(overflow.retryAfterMs >= 1_000 && overflow.retryAfterMs <= 12_000)
  const results = await Promise.all(admitted.map((a) => (a.admitted ? a.result : Promise.reject(new Error('refused')))))
  assert.deepEqual(results, [1, 2, 3, 4])
  assert.deepEqual(order, [1, 2, 3, 4])
  assert.equal(peak, 1, 'never more than one queued check at a time')
  assert.ok(slept.length >= 2 && slept.every((ms) => ms > 0 && ms <= spacing), `spaced: ${slept}`)

  // A known device bypasses the queue even while it is full.
  spacing = 4_000
  const blocker = [5, 6, 7].map((n) => gate.admit(task(n)))
  const bypass = gate.admit(async () => 'owner', { bypass: true })
  assert.ok(bypass.admitted)
  if (bypass.admitted) assert.equal(await bypass.result, 'owner')
  await Promise.all(blocker.map((a) => (a.admitted ? a.result : null)))
})

test('login gate: a throwing check rejects only its own caller and the queue keeps going', async () => {
  const gate = createLoginGate(() => 1, undefined, async () => {})
  const bad = gate.admit(() => {
    throw new Error('boom')
  })
  const good = gate.admit(async () => 'ok')
  assert.ok(bad.admitted && good.admitted)
  if (bad.admitted) await assert.rejects(bad.result, /boom/)
  if (good.admitted) assert.equal(await good.result, 'ok')
})

test('known-device tokens: valid, expiring, tamper-proof, secret-bound', () => {
  const secret = 'x'.repeat(40)
  const now = Date.UTC(2026, 9, 13)
  const id = newDeviceId()
  const token = signKnownDevice(secret, id, now)
  assert.deepEqual(verifyKnownDevice(secret, token, now), { id, issuedAt: Math.floor(now / 1000) })
  assert.equal(verifyKnownDevice(secret, token, now + (KNOWN_DEVICE_TTL_S - 1) * 1000)?.id, id)
  assert.equal(verifyKnownDevice(secret, token, now + KNOWN_DEVICE_TTL_S * 1000), null)
  assert.equal(verifyKnownDevice('y'.repeat(40), token, now), null)
  const [v, , iat, mac] = token.split('.')
  assert.equal(verifyKnownDevice(secret, [v, newDeviceId(), iat, mac].join('.'), now), null)
  assert.equal(verifyKnownDevice(secret, [v, id, String(Number(iat) + 1), mac].join('.'), now), null)
  // Issued far in the future (clock games) is refused.
  assert.equal(verifyKnownDevice(secret, signKnownDevice(secret, id, now + 3_600_000), now), null)
  for (const junk of [undefined, '', 'v1', 'v1.a.b.c', 42, 'v2' + token.slice(2), token + 'x']) {
    assert.equal(verifyKnownDevice(secret, junk, now), null, String(junk))
  }
  assert.notEqual(newDeviceId(), newDeviceId())
  assert.throws(() => signKnownDevice(secret, 'bad id'))
})

test('IPv6 /48 network key', () => {
  assert.equal(ipv6Network48('2001:db8:abcd:1234::1'), '2001:db8:abcd::/48')
  assert.equal(ipv6Network48('2001:db8:abcd:ffff:1:2:3:4'), '2001:db8:abcd::/48')
  assert.equal(ipv6Network48('[2001:db8:abcd::9]'), '2001:db8:abcd::/48')
  assert.equal(ipv6Network48('203.0.113.9'), null)
  assert.equal(ipv6Network48('::ffff:203.0.113.9'), null)
  assert.equal(ipv6Network48('junk'), null)
})

test('default gateway from /proc/net/route', () => {
  const table = [
    'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT',
    'eth0\t00000000\t010012AC\t0003\t0\t0\t0\t00000000\t0\t0\t0',
    'eth0\t000012AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
  ].join('\n')
  assert.equal(parseDefaultGateway(table), '172.18.0.1')
  // No default route, a down route, or a non-gateway route → none.
  assert.equal(parseDefaultGateway(table.split('\n').filter((_, i) => i !== 1).join('\n')), null)
  assert.equal(parseDefaultGateway(table.replace('\t0003\t', '\t0002\t')), null)
  assert.equal(parseDefaultGateway(table.replace('\t0003\t', '\t0001\t')), null)
  assert.equal(parseDefaultGateway(''), null)
})

test('implicit proxy trust: loopback and the gateway may vouch, nobody else', () => {
  const trusted = defaultTrustedProxies('172.18.0.1')
  const cf = 'cf-connecting-ip'
  const via = (peer: string) => pickClientIp({ peer, headerName: cf, headerValue: '203.0.113.9', trusted })
  assert.equal(via('172.18.0.1'), '203.0.113.9')
  assert.equal(via('::ffff:172.18.0.1'), '203.0.113.9')
  assert.equal(via('127.0.0.1'), '203.0.113.9')
  assert.equal(via('::1'), '203.0.113.9')
  // A sibling container on the same bridge talks to the container directly.
  assert.equal(via('172.18.0.7'), '172.18.0.7')
  assert.equal(via('10.0.0.5'), '10.0.0.5')
  const loopbackOnly = defaultTrustedProxies(null)
  assert.equal(ipInAny(parseIp('172.18.0.1'), loopbackOnly), false)
  assert.equal(ipInAny(parseIp('127.0.0.53'), loopbackOnly), true)
})

test('replay guard: one use per token until it expires; release undoes a claim', () => {
  const g = createReplayGuard(4)
  const now = 1_000_000
  assert.equal(g.claim('a', now + 1000, now), true)
  assert.equal(g.claim('a', now + 1000, now + 1), false)
  g.release('a')
  assert.equal(g.claim('a', now + 1000, now + 2), true)
  assert.equal(g.claim('a', now + 1000, now + 1000), true, 'expired entries no longer block')
  for (const k of ['b', 'c', 'd', 'e', 'f']) g.claim(k, now + 5000, now + 10)
  assert.ok(g.size() <= 4)
})

test('inbox arrow keys start from the focused message when nothing is open', () => {
  // Nothing open, focus on the first message: ↓ opens the first, not the second.
  assert.equal(inboxArrowTarget(5, -1, 0, 'ArrowDown'), 0)
  assert.equal(inboxArrowTarget(5, -1, 3, 'ArrowUp'), 3)
  assert.equal(inboxArrowTarget(5, -1, -1, 'ArrowDown'), 0)
  // With a message open, move one step, clamped.
  assert.equal(inboxArrowTarget(5, 0, 0, 'ArrowDown'), 1)
  assert.equal(inboxArrowTarget(5, 0, 4, 'ArrowUp'), 0)
  assert.equal(inboxArrowTarget(5, 4, 4, 'ArrowDown'), 4)
  assert.equal(inboxArrowTarget(0, -1, -1, 'ArrowDown'), -1)
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(640 * 1024), '640 KB')
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB')
})
