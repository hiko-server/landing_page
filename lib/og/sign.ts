import crypto from 'crypto'
import { ogImageUrl, type OgImageOptions } from '../schema'
import { parseOgParams, type OgParams } from '../security/ogParams'

/**
 * HMAC signatures for content-built social cards (CRIT-og-signing).
 *
 * A card URL built from a post or case study (/api/og?kind=blog&title=…)
 * gets `sig`: HMAC-SHA256 over the CANONICAL parameters — the values
 * parseOgParams() reads back, in a fixed order — truncated to 128 bits,
 * base64url. Signing the parsed values (not the raw query) means harmless
 * re-encodings still verify, while any change to what the card would show
 * (title, subtitle, date, minutes, tags, cover, language, size, cache-buster)
 * breaks it. The endpoint compares in constant time and renders the generic
 * default card for a missing or wrong signature.
 *
 * Key: HKDF-SHA256 of JWT_SECRET with a purpose label, so the card key is
 * never the session key. Signatures are computed in the page loaders
 * (getStaticProps — server only) and passed down as props; the browser never
 * sees the key. Without JWT_SECRET (a Docker build has no .env) URLs stay
 * unsigned and show the default card until the page regenerates at runtime
 * (scripts/warm-isr.mjs does that at boot).
 */

const SIG_BYTES = 16
const SIG_RE = /^[A-Za-z0-9_-]{22}$/

let cached: { secret: string; key: Buffer } | null = null

/** The card-signing key, or null when JWT_SECRET is not configured. */
export function ogSigningKey(secret: string | undefined = process.env.JWT_SECRET): Buffer | null {
  if (!secret || secret === 'change-me') return null
  if (cached?.secret === secret) return cached.key
  const key = Buffer.from(
    crypto.hkdfSync('sha256', secret, 'lucian-dev/og', 'og-card-signature-v1', 32)
  )
  cached = { secret, key }
  return key
}

/** The parameters a card shows, in a fixed order (version-tagged). */
export function canonicalOgString(p: OgParams): string {
  return JSON.stringify([
    'v1',
    p.kind,
    p.title,
    p.subtitle,
    p.date,
    p.mins,
    p.tags,
    p.cover,
    p.lang,
    p.size,
    p.v,
  ])
}

export function signOgParams(p: OgParams, key: Buffer): string {
  return crypto
    .createHmac('sha256', key)
    .update(canonicalOgString(p))
    .digest()
    .subarray(0, SIG_BYTES)
    .toString('base64url')
}

/** Does `params` carry a valid signature for what it would render? (constant-time) */
export function verifyOgSignature(
  params: URLSearchParams,
  key: Buffer | null = ogSigningKey()
): boolean {
  if (!key) return false
  const given = params.get('sig') || ''
  if (!SIG_RE.test(given)) return false
  const expected = Buffer.from(signOgParams(parseOgParams(params), key), 'base64url')
  const actual = Buffer.from(given, 'base64url')
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

/**
 * Absolute, signed /api/og URL for a content card (server only: call it in
 * getStaticProps / getServerSideProps and pass the result as a prop).
 */
export function signedOgImageUrl(o: OgImageOptions, key: Buffer | null = ogSigningKey()): string {
  const url = new URL(ogImageUrl(o))
  if (key) url.searchParams.set('sig', signOgParams(parseOgParams(url.searchParams), key))
  return url.toString()
}
