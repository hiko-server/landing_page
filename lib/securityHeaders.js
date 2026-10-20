/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports -- CommonJS module (next.config.js requires it) */
/**
 * Response security headers that do not depend on the page (the CSP, which
 * carries the inline-script hashes, lives in lib/csp.js).
 *
 * Two emitters send these exact values:
 *   - proxy.ts, on every response it handles (lib/security/responseHeaders.ts
 *     adds the CSP, the Trusted Types report-only policy and the per-path
 *     Cross-Origin-Resource-Policy);
 *   - next.config.js `headers()`, for everything, so the two assets the
 *     proxy skips (/_next/static/*, /favicon.ico) carry them as well.
 * Identical strings from one module, so it never matters which one a
 * response ends up with.
 *
 * CommonJS so next.config.js can `require()` it.
 */

const { EMBED_ORIGINS } = require('./csp')

/**
 * Permissions-Policy: every powerful feature the site does not use is
 * switched off for the page and for every frame it embeds; the few it uses
 * are limited to this origin, plus the video players for playback.
 *   - publickey-credentials-get / -create: passkey sign-in and registration
 *     (admin).
 *   - clipboard-write: the copy buttons (code blocks, citations, recovery
 *     codes). clipboard-read stays at this origin (the browser default,
 *     behind its own permission prompt): the site never reads the
 *     clipboard, but the E2E suites check what the copy buttons wrote by
 *     reading it back, and frames never get it.
 *   - autoplay, encrypted-media, fullscreen, picture-in-picture: the
 *     click-to-load YouTube / Vimeo players start playing right after the
 *     click and can go full screen (their iframes ask for exactly these).
 *   - browsing-topics: no interest-based advertising topics, ever.
 * Only features Chromium recognises are listed — an unknown name costs a
 * console warning on every page view (checked by tests/security-b-csp.test.ts
 * against an allow-list). Features whose default is already 'self' and that
 * the site uses (web-share) are left at their default.
 */
const PERMISSIONS_POLICY = {
  accelerometer: [],
  autoplay: ['self', ...EMBED_ORIGINS],
  bluetooth: [],
  'browsing-topics': [],
  camera: [],
  'clipboard-read': ['self'],
  'clipboard-write': ['self'],
  'display-capture': [],
  'encrypted-media': ['self', ...EMBED_ORIGINS],
  fullscreen: ['self', ...EMBED_ORIGINS],
  gamepad: [],
  geolocation: [],
  gyroscope: [],
  hid: [],
  'identity-credentials-get': [],
  'idle-detection': [],
  'local-fonts': [],
  magnetometer: [],
  microphone: [],
  midi: [],
  'otp-credentials': [],
  payment: [],
  'picture-in-picture': ['self', ...EMBED_ORIGINS],
  'publickey-credentials-create': ['self'],
  'publickey-credentials-get': ['self'],
  'screen-wake-lock': [],
  serial: [],
  'storage-access': [],
  usb: [],
  'window-management': [],
  'xr-spatial-tracking': [],
}

/** Structured-header serialisation: `camera=()`, `fullscreen=(self "https://…")`. */
function serializePermissionsPolicy(policy = PERMISSIONS_POLICY) {
  return Object.entries(policy)
    .map(([feature, allow]) => `${feature}=(${allow.map((a) => (a === 'self' ? 'self' : `"${a}"`)).join(' ')})`)
    .join(', ')
}

/**
 * Headers every response carries.
 *   - Cross-Origin-Opener-Policy: same-origin — a page the site opens, or
 *     that opens it, gets no window handle across origins (the site opens
 *     external links with noopener and uses no pop-up sign-in).
 *   - X-Permitted-Cross-Domain-Policies: none — no Flash / PDF cross-domain
 *     policy files.
 */
const STATIC_SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: serializePermissionsPolicy() },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
]

/**
 * Paths whose responses other sites may embed (no-cors <img> loads): the
 * social-card images, uploaded and brand images, and the app icons — a feed
 * reader, a chat preview or a search result may show them from its own
 * origin. Everything else (pages, JSON, scripts, fonts, documents) is
 * `same-origin`.
 */
const EMBEDDABLE_PREFIXES = ['/uploads/', '/images/', '/icons/']
const EMBEDDABLE_PATHS = new Set(['/api/og', '/icon.svg', '/favicon.ico'])

/** Cross-Origin-Resource-Policy for a request path. */
function crossOriginResourcePolicy(pathname) {
  if (EMBEDDABLE_PATHS.has(pathname) || EMBEDDABLE_PREFIXES.some((p) => pathname.startsWith(p))) return 'cross-origin'
  return 'same-origin'
}

module.exports = {
  EMBEDDABLE_PATHS,
  EMBEDDABLE_PREFIXES,
  PERMISSIONS_POLICY,
  STATIC_SECURITY_HEADERS,
  crossOriginResourcePolicy,
  serializePermissionsPolicy,
}
