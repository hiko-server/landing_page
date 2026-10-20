import crypto from 'crypto'

/**
 * Review-link tokens (H5). A token is `<id>.<signature>`:
 *
 *   id         128 random bits, base64url (22 characters) — the row's key
 *   signature  HMAC-SHA256 over the row's scope — id, collection, slug,
 *              variant ('draft' | 'changes') and expiry — truncated to 192
 *              bits, base64url (32 characters)
 *
 * The key is derived (HKDF-SHA256) from JWT_SECRET with a purpose label of
 * its own, so it is never the session key or the social-card key. auth.db
 * stores only the SHA-256 of the whole token; a lookup finds the row by that
 * hash, then recomputes the signature from the row and compares in constant
 * time — a row edited to point at another item no longer verifies. Because
 * the signature is derived, the admin can show (and copy) an active link
 * again without the token ever being stored. Rotating JWT_SECRET ends every
 * review link. Server-only.
 */

export const TOKEN_ID_BYTES = 16
export const TOKEN_SIG_BYTES = 24
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{32}$/

export type ReviewScope = {
  id: string
  collection: 'blog' | 'work'
  slug: string
  variant: 'draft' | 'changes'
  expiresAt: number
}

let cached: { secret: string; key: Buffer } | null = null

/** The review-link key, or null when JWT_SECRET is not configured (review links are then unavailable). */
export function reviewLinkKey(secret: string | undefined = process.env.JWT_SECRET): Buffer | null {
  if (!secret || secret === 'change-me') return null
  if (cached?.secret === secret) return cached.key
  const key = Buffer.from(crypto.hkdfSync('sha256', secret, 'lucian-dev/review-link', 'review-link-signature-v1', 32))
  cached = { secret, key }
  return key
}

/** A fresh random link id. */
export function newLinkId(): string {
  return crypto.randomBytes(TOKEN_ID_BYTES).toString('base64url')
}

function canonical(s: ReviewScope): string {
  return JSON.stringify(['review-link', 'v1', s.id, s.collection, s.slug, s.variant, Math.trunc(s.expiresAt)])
}

export function signScope(scope: ReviewScope, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(canonical(scope)).digest().subarray(0, TOKEN_SIG_BYTES).toString('base64url')
}

/** The token of a link (deterministic for its scope and the key). */
export function tokenFor(scope: ReviewScope, key: Buffer): string {
  return `${scope.id}.${signScope(scope, key)}`
}

/** SHA-256 (hex) of a token: what auth.db stores and looks up. */
export function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Does `token` carry a valid signature for `scope`? (constant time) */
export function verifyToken(token: string, scope: ReviewScope, key: Buffer): boolean {
  if (!TOKEN_RE.test(token)) return false
  const [id, sig] = token.split('.')
  if (id !== scope.id) return false
  const expected = Buffer.from(signScope(scope, key), 'base64url')
  const given = Buffer.from(sig, 'base64url')
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}
