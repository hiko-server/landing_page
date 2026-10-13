/**
 * Single source of truth for the Content-Security-Policy.
 *
 * Both next.config.js (HTTP `headers()`) and middleware.ts (edge response
 * headers) emit THIS exact string. Previously each defined its own CSP inline
 * and the browser enforced the surprising *intersection* of the two — e.g. one
 * allowed hcaptcha frames while the other's `default-src 'self'` silently
 * blocked them. One shared policy removes that drift class entirely.
 *
 * No 'unsafe-eval' in production: article bodies are compiled to a plain
 * hast tree on the server and rendered with hast-util-to-jsx-runtime
 * (lib/mdx.ts, components/MDX/MDXContent.tsx), so nothing evaluates code
 * in the browser. Development alone adds it back, because React Refresh
 * (Fast Refresh) evaluates updated modules.
 *
 * Necessary loosenings (documented so they aren't "fixed" by mistake):
 *  - 'unsafe-inline': Chakra/emotion SSR styles + Next's inline bootstrap.
 *  - github api: the Open Source section.
 * (hCaptcha, the Binance ticker and the optional Sentry reporting were
 * removed from the app, and so were their hosts — every allowed origin is
 * attack surface.)
 *
 * Deliberately NOT allowed: static.cloudflareinsights.com. Cloudflare can
 * inject its Web Analytics beacon into proxied HTML; the site promises no
 * third-party analytics scripts, and HTML carries `Cache-Control:
 * no-transform` (lib/htmlNoTransform.ts) so the beacon is not injected.
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
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https:'],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'font-src': ["'self'", 'https:', 'data:'],
  'connect-src': ["'self'", 'https://api.github.com'],
  // Video embeds in MDX posts only.
  'frame-src': ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com'],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'media-src': ["'self'", 'https:', 'blob:'],
}

/**
 * Build the CSP header string. `upgrade-insecure-requests` is a valueless
 * directive. `env` defaults to NODE_ENV; only 'development' allows
 * 'unsafe-eval' (React Refresh).
 */
function buildCsp(env = process.env.NODE_ENV) {
  const directives = Object.entries(CSP_DIRECTIVES).map(([key, vals]) => {
    const values = key === 'script-src' && env === 'development' ? [...vals, "'unsafe-eval'"] : vals
    return `${key} ${values.join(' ')}`
  })
  directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

module.exports = { buildCsp, CSP_DIRECTIVES }
