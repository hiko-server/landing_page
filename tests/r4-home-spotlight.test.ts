import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relativePoint } from '../components/General-UI/useSpotlight'

test('relativePoint measures from the box corner', () => {
  assert.deepEqual(relativePoint({ left: 100, top: 50 }, 130, 95), { x: 30, y: 45 })
})

test('relativePoint rounds sub-pixel positions to whole px', () => {
  assert.deepEqual(relativePoint({ left: 10.2, top: 0.6 }, 20.9, 10.1), { x: 11, y: 10 })
})

test('relativePoint is negative outside the box (the gradient then sits off the card)', () => {
  assert.deepEqual(relativePoint({ left: 200, top: 200 }, 150, 190), { x: -50, y: -10 })
})
