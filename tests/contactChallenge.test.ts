import { test } from 'node:test'
import assert from 'node:assert/strict'
import { challengeHash, newChallenge, verifyChallenge } from '../lib/security/contactChallenge'

const SECRET = 'test-secret-0123456789abcdef0123456789'

test('newChallenge picks two single-digit addends', () => {
  for (let i = 0; i < 200; i++) {
    const { a, b } = newChallenge()
    assert.ok(Number.isInteger(a) && a >= 1 && a <= 9)
    assert.ok(Number.isInteger(b) && b >= 1 && b <= 9)
  }
})

test('the right answer verifies; wrong, foreign or malformed ones do not', () => {
  const h = challengeHash(SECRET, 'jti-1', 12)
  assert.equal(verifyChallenge(SECRET, 'jti-1', 12, h), true)
  assert.equal(verifyChallenge(SECRET, 'jti-1', '12', h), true)
  assert.equal(verifyChallenge(SECRET, 'jti-1', 11, h), false)
  // Bound to the nonce id and the secret.
  assert.equal(verifyChallenge(SECRET, 'jti-2', 12, h), false)
  assert.equal(verifyChallenge('other-secret-0123456789abcdef01234', 'jti-1', 12, h), false)
  for (const bad of [12.5, -1, 1e9, '', ' ', 'twelve', null, undefined, {}]) {
    assert.equal(verifyChallenge(SECRET, 'jti-1', bad, h), false, String(bad))
  }
  assert.equal(verifyChallenge(SECRET, '', 12, h), false)
  assert.equal(verifyChallenge(SECRET, 'jti-1', 12, 'short'), false)
  assert.equal(verifyChallenge(SECRET, 'jti-1', 12, undefined), false)
})

test('the hash does not reveal the answer', () => {
  const h = challengeHash(SECRET, 'jti-9', 7)
  assert.equal(h.length, 32)
  assert.ok(!h.includes('7') || /^[a-f0-9]{32}$/.test(h))
  // Without the secret every candidate sum looks equally (in)valid.
  const guesses = Array.from({ length: 17 }, (_, i) => i + 2).filter((n) => challengeHash('guess', 'jti-9', n) === h)
  assert.deepEqual(guesses, [])
})
