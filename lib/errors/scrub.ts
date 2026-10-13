import crypto from 'crypto'

/**
 * Pure helpers for the first-party error monitor (lib/errors/store.ts):
 * removing anything personal from what a browser or the server reports, and
 * grouping repeats of one problem under a fingerprint.
 *
 * What is removed before anything is stored:
 *   - query strings and fragments of every URL (reset tokens, search terms)
 *   - e-mail addresses, IPv4/IPv6 addresses, long digit runs (phone numbers,
 *     ids), JWTs and long hex / base64 runs (tokens, keys, session ids)
 *   - the site's own origin in stack frames (shorter; nothing else is lost)
 *   - stack frames that belong to browser extensions (the error is not ours)
 * Messages are capped at MAX_MESSAGE characters, stacks at MAX_FRAMES frames
 * and MAX_STACK characters.
 */

export const MAX_MESSAGE = 500
export const MAX_STACK = 4000
export const MAX_FRAMES = 12
export const MAX_PATH = 200

const EXTENSION_SCHEME = /\b(?:chrome|moz|safari(?:-web)?|ms-browser|edge)-extension:\/\//i
const URL_RE = /\b(https?|wss?|blob):\/\/[^\s"'<>()]+/gi
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
const IPV6_RE = /\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi
const LONG_HEX_RE = /\b[0-9a-f]{24,}\b/gi
// Random-looking runs only (upper AND lower case AND a digit): a long
// lower-case slug or a hashed chunk name is not a secret.
const LONG_B64_RE = /\b[A-Za-z0-9_+-]{32,}={0,2}(?![A-Za-z0-9_+=-])/g
const LONG_DIGITS_RE = /\b\d{7,}\b/g

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g

/** Drop the query string and fragment of a URL-ish string (relative paths too). */
export function stripQuery(raw: string): string {
  const cut = raw.search(/[?#]/)
  return cut === -1 ? raw : raw.slice(0, cut)
}

/**
 * A URL without its query and fragment, keeping a stack frame's trailing
 * ":line:col" ("https://x/a.js?v=1:3:9" → "https://x/a.js:3:9").
 */
function stripUrlQuery(u: string): string {
  const m = /^([^?#]*)[?#].*?((?::\d+){1,2})?$/.exec(u)
  return m ? `${m[1]}${m[2] || ''}` : u
}

/** Remove personal or secret-looking substrings from free text. */
export function scrubText(raw: unknown, max = MAX_MESSAGE): string {
  let s = String(raw ?? '')
    .replace(CONTROL_RE, ' ')
    .replace(URL_RE, stripUrlQuery)
    .replace(JWT_RE, '[token]')
    .replace(EMAIL_RE, '[email]')
    .replace(IPV6_RE, '[ip]')
    .replace(IPV4_RE, (ip) => (ip.split('.').every((p) => Number(p) <= 255) ? '[ip]' : ip))
    .replace(LONG_HEX_RE, '[hex]')
    .replace(LONG_B64_RE, (m) =>
      /[0-9]/.test(m) && /[a-z]/.test(m) && /[A-Z]/.test(m) ? '[token]' : m
    )
    .replace(LONG_DIGITS_RE, '[number]')
  s = s.trim()
  if (s.length > max) s = `${s.slice(0, max - 1)}…`
  return s
}

/**
 * Scrub a stack trace: same rules as scrubText per line, the site origin
 * removed, extension frames dropped, at most MAX_FRAMES frames.
 */
export function scrubStack(raw: unknown, siteOrigins: string | readonly string[] = []): string {
  if (typeof raw !== 'string' || !raw.trim()) return ''
  const origins = (typeof siteOrigins === 'string' ? [siteOrigins] : siteOrigins).filter(Boolean)
  const lines = raw.split('\n').map((l) => l.replace(/\s+$/, ''))
  const out: string[] = []
  let frames = 0
  for (const line of lines) {
    if (!line.trim()) continue
    if (EXTENSION_SCHEME.test(line)) continue
    const isFrame = /^\s*at\s|@/.test(line)
    if (isFrame) {
      if (frames >= MAX_FRAMES) continue
      frames++
    }
    // Queries go first (while URLs are still whole), then the site origin;
    // a query left on a relative script path before ":line:col" goes too.
    let cleaned = scrubText(line.replace(/\t/g, '    '), 400)
    for (const origin of origins) cleaned = cleaned.split(origin).join('')
    cleaned = cleaned.replace(/\?[^\s:)#]*(?=:\d+:\d+)/g, '')
    out.push(cleaned)
  }
  const joined = out.join('\n')
  return joined.length > MAX_STACK ? `${joined.slice(0, MAX_STACK - 1)}…` : joined
}

/** True when the report comes from a browser extension, not the site. */
export function isExtensionNoise(...parts: unknown[]): boolean {
  return parts.some((p) => typeof p === 'string' && EXTENSION_SCHEME.test(p))
}

/** A same-site path for display: starts with '/', no query, bounded. Null when unusable. */
export function normalizeErrorPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname
    } catch {
      return null
    }
  }
  s = stripQuery(s)
  if (!s.startsWith('/') || s.startsWith('//')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\s]/.test(s)) return null
  return s.length > MAX_PATH ? s.slice(0, MAX_PATH) : s
}

/**
 * Message normalised for grouping: volatile parts (numbers, hex ids, quoted
 * URLs) collapse, so "Loading chunk 734 failed" and "Loading chunk 912
 * failed" are one problem.
 */
export function groupingMessage(message: string): string {
  return message
    .replace(/\[(?:number|hex|token|email|ip)\]/g, '#')
    .replace(/https?:\/\/[^\s"')]+/g, (u) => u.replace(/[0-9a-f]{8,}/gi, '#'))
    .replace(/\b0x[0-9a-f]+\b/gi, '#')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

/**
 * The first frame of a stack that is worth grouping on, without line and
 * column (they move with every build): the script's path with its content
 * hash removed, plus the function name when the frame names one.
 *   at Foo.bar (/_next/static/chunks/pages/blog/[slug]-1a2b3c4d.js:1:2345)
 *     → "Foo.bar @ /_next/static/chunks/pages/blog/[slug].js"
 */
export function topFrame(stack: string): string {
  for (const line of stack.split('\n')) {
    const v8 = /^\s*at\s+(?:(.+?)\s+\()?(.+?):\d+:\d+\)?\s*$/.exec(line)
    const gecko = /^\s*(.*?)@(.+?):\d+:\d+\s*$/.exec(line)
    const m = v8 || gecko
    if (!m) continue
    const fn = (m[1] || '').replace(/^async\s+/, '').trim()
    const file = stripQuery(m[2].replace(/^\(/, ''))
      .replace(/^webpack-internal:\/\/\/(?:\([^)]*\)\/)?/, '')
      .replace(/[-.]([0-9a-f]{8,20})(?=\.(?:m?js|cjs)$)/i, '')
    if (!file || /^(?:node:|native|<anonymous>)/.test(file)) continue
    if (/node_modules[\\/]next[\\/]dist/.test(file)) continue
    return fn ? `${fn} @ ${file}` : file
  }
  return ''
}

/** 32-hex fingerprint over the grouping parts. */
export function fingerprintOf(parts: readonly (string | null | undefined)[]): string {
  return crypto
    .createHash('sha256')
    .update(parts.map((p) => p || '').join('\n'))
    .digest('hex')
    .slice(0, 32)
}

/** Build sha when it looks like one, else null. */
export function normalizeRelease(raw: unknown): string | null {
  return typeof raw === 'string' && /^[0-9a-f]{7,40}$/i.test(raw.trim())
    ? raw.trim().toLowerCase()
    : null
}
