import crypto from 'node:crypto'

/**
 * Share-link tokens (E4) — SERVER-ONLY.
 *
 *   token = <secret: 32 chars> <tag: 11 chars>      43 characters of base64url
 *
 *   secret  24 random bytes (192 bits): the bearer secret of the link.
 *   tag     HMAC-SHA256 of the secret under a key derived from JWT_SECRET
 *           (HKDF, purpose "cv-share-link-v1"), truncated to 64 bits — the
 *           URL is signed, so a guessed or mangled token is refused before
 *           the store is read, and rotating JWT_SECRET ends every link.
 *
 * The store keeps SHA-256(token) only (lib/cvShare/store): a copy of
 * auth.db cannot be turned back into working links. Tags are compared in
 * constant time. Without JWT_SECRET no link can be made or opened.
 */

export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const SECRET_LEN = 32
const TAG_BYTES = 8

let cached: { secret: string; key: Buffer } | null = null

/** The tag key, or null when JWT_SECRET is not configured. */
export function shareKey(secret: string | undefined = process.env.JWT_SECRET): Buffer | null {
  if (!secret || secret === 'change-me') return null
  if (cached?.secret === secret) return cached.key
  const key = Buffer.from(crypto.hkdfSync('sha256', secret, 'lucian-dev/cv-share', 'cv-share-link-v1', 32))
  cached = { secret, key }
  return key
}

function tagOf(secretPart: string, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(`cv-share:${secretPart}`).digest().subarray(0, TAG_BYTES).toString('base64url')
}

/** SHA-256 (hex) of a token: what the store keeps and looks up. */
export function shareTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

/** A new token and its hash. */
export function mintShareToken(key: Buffer): { token: string; hash: string } {
  const secretPart = crypto.randomBytes(24).toString('base64url')
  const token = `${secretPart}${tagOf(secretPart, key)}`
  return { token, hash: shareTokenHash(token) }
}

/** True when `token` has the right shape and its tag verifies under `key`. */
export function verifyShareToken(token: unknown, key: Buffer | null): token is string {
  if (!key || typeof token !== 'string' || !SHARE_TOKEN_RE.test(token)) return false
  const expected = Buffer.from(tagOf(token.slice(0, SECRET_LEN), key))
  const given = Buffer.from(token.slice(SECRET_LEN))
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}
