/**
 * Single source of truth for the Content-Security-Policy.
 *
 * Both next.config.js (HTTP `headers()`) and middleware.ts (edge response
 * headers) emit THIS exact string. Previously each defined its own CSP inline
 * and the browser enforced the surprising *intersection* of the two — e.g. one
 * allowed hcaptcha frames while the other's `default-src 'self'` silently
 * blocked them. One shared policy removes that drift class entirely.
 *
 * Necessary loosenings (documented so they aren't "fixed" by mistake):
 *  - 'unsafe-eval': next-mdx-remote compiles MDX to JS and runs it via
 *    `new Function()` during hydration (/now, /uses, /blog/*, /work/*).
 *    Without it those pages throw EvalError and fail to hydrate.
 *  - 'unsafe-inline': Chakra/emotion SSR styles + Next's inline bootstrap.
 *  - github api: the Open Source section. sentry: error reporting (inert
 *    until a DSN is set).
 * (hCaptcha and the Binance ticker were removed from the app, and so were
 * their hosts — every allowed origin is attack surface.)
 *
 * CommonJS so next.config.js can `require()` it; named export also imports
 * cleanly from the (edge-runtime) middleware under esModuleInterop.
 */

const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  'script-src': ["'self'", "'unsafe-eval'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https:'],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'font-src': ["'self'", 'https:', 'data:'],
  'connect-src': ["'self'", 'https://api.github.com', 'https://*.sentry.io', 'https://*.ingest.sentry.io'],
  // Video embeds in MDX posts only.
  'frame-src': ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com'],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'media-src': ["'self'", 'https:', 'blob:'],
}

/** Build the CSP header string. `upgrade-insecure-requests` is a valueless directive. */
function buildCsp() {
  const directives = Object.entries(CSP_DIRECTIVES).map(([key, vals]) => `${key} ${vals.join(' ')}`)
  directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

module.exports = { buildCsp, CSP_DIRECTIVES }
