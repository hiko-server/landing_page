import crypto from 'crypto'

/**
 * Server-verified contact-form sum ("What is 3 + 5?").
 *
 * The nonce endpoint picks the two numbers, sends them to the browser and
 * puts only an HMAC of the expected answer — bound to the nonce's unique id —
 * into the signed token. The answer can therefore not be read back from the
 * token, a token cannot be paired with another token's answer, and the
 * contact API checks the visitor's answer without keeping any state.
 *
 * Pure (the secret is passed in) so it is unit tested.
 */

export type Challenge = { a: number; b: number }

export function newChallenge(): Challenge {
  return { a: crypto.randomInt(1, 10), b: crypto.randomInt(1, 10) }
}

export function challengeHash(secret: string, nonceId: string, answer: number): string {
  return crypto.createHmac('sha256', secret).update(`contact-challenge:${nonceId}:${answer}`).digest('hex').slice(0, 32)
}

/** True when `answer` is the right sum for the nonce that carries `expectedHash`. */
export function verifyChallenge(secret: string, nonceId: unknown, answer: unknown, expectedHash: unknown): boolean {
  if (typeof nonceId !== 'string' || !nonceId || typeof expectedHash !== 'string' || expectedHash.length !== 32) return false
  const n = typeof answer === 'number' ? answer : typeof answer === 'string' && answer.trim() !== '' ? Number(answer) : NaN
  if (!Number.isInteger(n) || n < 0 || n > 100) return false
  const actual = Buffer.from(challengeHash(secret, nonceId, n))
  const expected = Buffer.from(expectedHash)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}
