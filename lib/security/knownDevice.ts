import crypto from 'crypto'

/**
 * "Known device" token: proof that this browser signed in successfully
 * before. Under a distributed login attack it lets the owner skip the global
 * login queue (lib/security/loginGate.ts); it grants nothing else — the
 * per-(email, client) lockout and the per-IP limits still apply, and it is
 * never a substitute for the password.
 *
 *   v1.<device id>.<issued-at, unix seconds>.<HMAC-SHA256>
 *
 * The device id is 16 random bytes; the MAC (keyed with the JWT secret, with
 * a purpose prefix so it can never collide with any other token) covers the
 * version, id and issue time. Tokens older than KNOWN_DEVICE_TTL_S, from the
 * future, malformed or with a bad MAC are ignored. Rotating JWT_SECRET
 * forgets every device.
 */

export const KNOWN_DEVICE_COOKIE = 'cv_known_device'
/** 180 days — the cookie and the token expire together. */
export const KNOWN_DEVICE_TTL_S = 180 * 24 * 60 * 60

const VERSION = 'v1'
const PURPOSE = 'lucian-dev/known-device'
/** Clock skew tolerated for an issue time slightly in the future. */
const SKEW_S = 300
const ID_RE = /^[A-Za-z0-9_-]{22}$/
const MAC_RE = /^[A-Za-z0-9_-]{43}$/

export type KnownDevice = { id: string; issuedAt: number }

function mac(secret: string, id: string, issuedAt: number): string {
  return crypto.createHmac('sha256', secret).update(`${PURPOSE}|${VERSION}|${id}|${issuedAt}`).digest('base64url')
}

export function newDeviceId(): string {
  return crypto.randomBytes(16).toString('base64url')
}

/** Mint a token for `id` (a fresh device id when omitted). */
export function signKnownDevice(secret: string, id: string = newDeviceId(), nowMs = Date.now()): string {
  if (!ID_RE.test(id)) throw new Error('invalid device id')
  const issuedAt = Math.floor(nowMs / 1000)
  return `${VERSION}.${id}.${issuedAt}.${mac(secret, id, issuedAt)}`
}

/** The device a token proves, or null when it is missing, expired or forged. */
export function verifyKnownDevice(secret: string, token: unknown, nowMs = Date.now()): KnownDevice | null {
  if (typeof token !== 'string' || token.length > 128) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [version, id, iatText, given] = parts
  if (version !== VERSION || !ID_RE.test(id) || !/^\d{1,12}$/.test(iatText) || !MAC_RE.test(given)) return null
  const issuedAt = Number(iatText)
  const now = Math.floor(nowMs / 1000)
  if (issuedAt > now + SKEW_S || now - issuedAt >= KNOWN_DEVICE_TTL_S) return null
  const expected = Buffer.from(mac(secret, id, issuedAt), 'base64url')
  const actual = Buffer.from(given, 'base64url')
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null
  return { id, issuedAt }
}
