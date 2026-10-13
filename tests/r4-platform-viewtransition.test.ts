import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HistoryIndex,
  resolveDirection,
  revealGeometry,
  setPendingDirection,
  startViewTransitionSafely,
  takePendingDirection,
} from '../lib/viewTransition'

// ── direction resolver ──────────────────────────────────────────────────────

test('resolveDirection: an explicit pending direction always wins', () => {
  assert.equal(resolveDirection('next', false, 3, null), 'next')
  assert.equal(resolveDirection('prev', true, 3, 5), 'prev')
  assert.equal(resolveDirection('next', true, 5, 3), 'next')
})

test('resolveDirection: a push is forward; Back / Forward compare history indices', () => {
  assert.equal(resolveDirection(null, false, 3, null), 'forward')
  assert.equal(resolveDirection(null, false, null, null), 'forward')
  assert.equal(resolveDirection(null, true, 5, 3), 'back')
  assert.equal(resolveDirection(null, true, 3, 5), 'forward')
})

test('resolveDirection: a popstate with an unknown or equal index gets no type (plain cross-fade)', () => {
  assert.equal(resolveDirection(null, true, 5, null), null)
  assert.equal(resolveDirection(null, true, null, 2), null)
  assert.equal(resolveDirection(null, true, undefined, undefined), null)
  assert.equal(resolveDirection(null, true, 4, 4), null)
})

test('pending direction is taken once and goes stale', () => {
  setPendingDirection('next', 1_000)
  assert.equal(takePendingDirection(1_500), 'next')
  assert.equal(takePendingDirection(1_600), null, 'consumed')
  setPendingDirection('prev', 1_000)
  assert.equal(takePendingDirection(1_000 + 10_001), null, 'a click that never navigated must not leak')
  setPendingDirection('prev', 1_000)
  setPendingDirection(null)
  assert.equal(takePendingDirection(1_001), null)
})

// ── startViewTransitionSafely with types ────────────────────────────────────

const swallowable = () => ({ ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() })

test('types use the Level 2 object form when the browser accepts it', () => {
  const calls: unknown[] = []
  const doc = {
    startViewTransition(this: unknown, arg: unknown) {
      assert.equal(this, doc)
      calls.push(arg)
      return swallowable()
    },
  }
  const update = () => undefined
  assert.equal(startViewTransitionSafely(doc, update, ['back']), true)
  assert.deepEqual(calls, [{ update, types: ['back'] }])
})

test('a Level 1 browser (TypeError on the object form) falls back to the callback form', () => {
  const calls: unknown[] = []
  const doc = {
    startViewTransition(arg: unknown) {
      if (typeof arg !== 'function') throw new TypeError("parameter 1 is not of type 'Function'")
      calls.push(arg)
      return swallowable()
    },
  }
  const update = () => undefined
  assert.equal(startViewTransitionSafely(doc, update, ['forward']), true)
  assert.deepEqual(calls, [update])
})

test('other errors are not retried, and no types means the callback form', async () => {
  let attempts = 0
  const failing = {
    startViewTransition() {
      attempts += 1
      throw new Error('InvalidStateError')
    },
  }
  assert.equal(startViewTransitionSafely(failing, () => undefined, ['next']), false)
  assert.equal(attempts, 1)

  const seen: unknown[] = []
  const level2 = {
    startViewTransition(arg: unknown) {
      seen.push(arg)
      const skipped = () => Promise.reject(new Error('AbortError'))
      return { ready: skipped(), finished: skipped(), updateCallbackDone: skipped() }
    },
  }
  const update = () => undefined
  assert.equal(startViewTransitionSafely(level2, update), true)
  assert.equal(startViewTransitionSafely(level2, update, []), true)
  assert.deepEqual(seen, [update, update])
  // Skip rejections are swallowed (an unhandled one would fail the run).
  await new Promise((r) => setTimeout(r, 5))
})

// ── history order ───────────────────────────────────────────────────────────

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v
    },
  }
}

test('HistoryIndex assigns increasing indices to new entries and remembers known ones', () => {
  const storage = memoryStorage()
  const order = new HistoryIndex(storage)
  assert.equal(order.currentIndex, null)
  order.enter('a')
  order.enter('b')
  order.enter('c')
  assert.equal(order.current, 'c')
  assert.deepEqual([order.indexOf('a'), order.indexOf('b'), order.indexOf('c')], [1, 2, 3])
  // Back to b: known, keeps its index.
  order.enter('b')
  assert.equal(order.currentIndex, 2)
  // A new push after going back is above everything still on the stack.
  order.enter('d')
  assert.equal(order.indexOf('d'), 4)
  assert.equal(resolveDirection(null, true, order.indexOf('d'), order.indexOf('b')), 'back')
  assert.equal(order.indexOf('nope'), null)
  assert.equal(order.indexOf(42), null)
  order.enter(undefined)
  order.enter('')
  assert.equal(order.current, 'd', 'non-keys are ignored')
})

test('HistoryIndex survives a reload through storage and tolerates bad storage', () => {
  const storage = memoryStorage()
  const first = new HistoryIndex(storage)
  first.enter('a')
  first.enter('b')
  const reloaded = new HistoryIndex(storage)
  assert.equal(reloaded.indexOf('a'), 1)
  assert.equal(reloaded.indexOf('b'), 2)
  reloaded.enter('c')
  assert.equal(reloaded.indexOf('c'), 3)

  const corrupt = new HistoryIndex(memoryStorage({ 'vt:history-index:v1': '{not json' }))
  corrupt.enter('x')
  assert.equal(corrupt.indexOf('x'), 1)

  const wrongShape = new HistoryIndex(memoryStorage({ 'vt:history-index:v1': JSON.stringify({ map: { a: 'one', b: 7 }, max: 'x' }) }))
  assert.equal(wrongShape.indexOf('a'), null)
  assert.equal(wrongShape.indexOf('b'), 7)
  wrongShape.enter('c')
  assert.equal(wrongShape.indexOf('c'), 8, 'continues above the highest stored index')

  const throwing = new HistoryIndex({
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  })
  throwing.enter('k')
  assert.equal(throwing.indexOf('k'), 1)
  const none = new HistoryIndex(null)
  none.enter('k')
  assert.equal(none.currentIndex, 1)
})

test('HistoryIndex keeps at most 200 entries, dropping the oldest', () => {
  const storage = memoryStorage()
  const order = new HistoryIndex(storage)
  for (let i = 0; i < 205; i++) order.enter(`k${i}`)
  assert.equal(order.indexOf('k0'), null)
  assert.equal(order.indexOf('k4'), null)
  assert.equal(order.indexOf('k5'), 6)
  assert.equal(order.indexOf('k204'), 205)
  const stored = JSON.parse(storage.data['vt:history-index:v1'])
  assert.equal(Object.keys(stored.map).length, 200)
  assert.equal(stored.max, 205)
})

// ── theme reveal geometry ───────────────────────────────────────────────────

test('revealGeometry centres on the button and covers the farthest viewport corner', () => {
  const vp = { width: 1000, height: 800 }
  const g = revealGeometry({ left: 900, top: 10, width: 40, height: 40 }, vp)
  assert.deepEqual([g.x, g.y], [920, 30])
  assert.equal(g.r, Math.hypot(920, 770))
  const centre = revealGeometry(null, vp)
  assert.deepEqual([centre.x, centre.y], [500, 400])
  assert.equal(centre.r, Math.hypot(500, 400))
})
