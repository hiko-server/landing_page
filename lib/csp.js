/**
 * The Content-Security-Policy (enforced) and the Trusted Types policy
 * (report-only), as strings. lib/security/responseHeaders.ts sends them on
 * every response the proxy handles (proxy.ts: every route except the
 * fingerprinted /_next/static assets and /favicon.ico, which are not
 * documents and run no script).
 *
 * Strict scripts, by hash. `script-src` has no 'unsafe-inline' and no
 * scheme or host source: only same-origin script files and the inline
 * scripts whose SHA-256 the caller passes (`scriptHashes`). Those hashes are
 * computed from the very constants the pages render
 * (lib/security/inlineScripts.ts), so a script and its hash cannot drift; a
 * test fails if a page renders an inline script that is not in that list.
 * Next's `__NEXT_DATA__` and the JSON-LD blocks are `type="application/json"`
 * / `application/ld+json` data blocks: never executed, so not subject to
 * script-src. A webpack production build of the Pages Router inlines no
 * other script (a Turbopack build would add an inline chunk bootstrap — the
 * build stays on webpack, package.json `--webpack`). `script-src-attr
 * 'none'`: no inline event handler ever runs. No 'unsafe-eval' in
 * production: articles are compiled to a plain hast tree on the server
 * (lib/mdx.ts) and rendered without evaluating code; only `next dev` adds
 * it, for React Refresh.
 *
 * Why 'self' rather than nonces + 'strict-dynamic': static and ISR pages
 * are one cached HTML file for every visitor, so they cannot carry a
 * per-response nonce, and 'strict-dynamic' would refuse Next's own
 * parser-inserted <script src> tags. 'self' is safe here because nothing
 * same-origin can be turned into a script: there is no JSONP endpoint, and
 * uploads are images only (magic bytes checked), served with
 * `X-Content-Type-Options: nosniff` and their own sandboxing CSP.
 *
 * The CSP is emitted by the proxy only — next.config.js `headers()` cannot
 * load the TypeScript constants the hashes come from, and two CSP headers
 * are enforced as their intersection (a hash-less copy would block the
 * theme script).
 *
 * Necessary loosenings (documented so they are not "fixed" by mistake):
 *  - style-src 'unsafe-inline': Chakra UI renders through Emotion, which
 *    writes each page's styles into inline <style data-emotion> elements on
 *    the server and inserts more at run time; next/font adds inline
 *    @font-face blocks, and React renders `style` attributes. Their content
 *    differs per page and per state, so neither hashes nor nonces (which
 *    static and ISR pages cannot carry, see above) can list them. CSS cannot
 *    run script; the remaining risk (CSS injection) is closed by React
 *    escaping every value.
 *  - img-src https:: a published article still embeds images from another
 *    host (checked against the live content store on 2026-10-20: four
 *    images of one post, on the project's own media host); 'self' data:
 *    blob: alone would break them. The publish checklist offers to import a
 *    remote image into /uploads ("Import & optimize", lib/remoteImage.ts);
 *    once no published content references one, img-src can drop https:.
 *  - frame-src: the click-to-load video players (youtube-nocookie, Vimeo)
 *    and a YouTube iframe an article may embed directly.
 * media-src is 'self' only: no page plays audio or video from anywhere else
 * (the video embeds are the players' iframes, their posters are imported
 * into /uploads by lib/videoPoster), so a remote <video> in an article is
 * refused and shows up in the Errors panel. worker-src is 'self': the site
 * starts no worker.
 * The browser talks to its own origin only: GitHub data comes through the
 * same-origin /api/github/* routes, fonts are self-hosted, and error and
 * CSP reports go to /api/e. (hCaptcha, the Binance ticker and the optional
 * Sentry reporting were removed from the app, and so were their hosts —
 * every allowed origin is attack surface.)
 *
 * Deliberately NOT allowed: static.cloudflareinsights.com. Cloudflare can
 * inject its Web Analytics beacon into proxied HTML; the site promises no
 * third-party analytics scripts, and HTML carries `Cache-Control:
 * no-transform` (lib/htmlNoTransform.ts) so the beacon is not injected.
 *
 * Violations are reported to the site's own error monitor (pages/api/e.ts,
 * lib/errors/ingest.ts) with both `report-to` (Reporting API, through the
 * `Reporting-Endpoints` header) and `report-uri` (browsers without it).
 *
 * CommonJS so plain Node (next.config.js, scripts, tests) can `require()` it;
 * the named exports also import cleanly from TypeScript.
 */

/** Hosts of the click-to-load video players (frame-src, Permissions-Policy). */
const EMBED_ORIGINS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com']

const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
  // + the SHA-256 of every inline script (buildCsp's scriptHashes).
  'script-src': ["'self'"],
  // Inline event-handler attributes (onclick=…) never run, whatever script-src says.
  'script-src-attr': ["'none'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'frame-src': EMBED_ORIGINS,
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'media-src': ["'self'"],
}

/** Same-origin endpoint that records CSP violation reports. */
const CSP_REPORT_URI = '/api/e'
/** Reporting API endpoint name (`report-to`), declared by REPORTING_ENDPOINTS. */
const CSP_REPORT_GROUP = 'csp'
/** `Reporting-Endpoints` header value: the group above → the report endpoint. */
const REPORTING_ENDPOINTS = `${CSP_REPORT_GROUP}="${CSP_REPORT_URI}"`

/**
 * Trusted Types policies the app itself creates: the page's default policy
 * (lib/trustedTypesDefault.ts), Next.js's own ('nextjs') and webpack's chunk
 * loader ('nextjs#bundler', next's `output.trustedTypes`).
 */
const TRUSTED_TYPES_POLICIES = ['default', 'nextjs', 'nextjs#bundler']

const HASH_SOURCE_RE = /^'sha256-[A-Za-z0-9+/]{43}='$/

function reportingDirectives() {
  // Browsers with the Reporting API use report-to and ignore report-uri; the others use report-uri.
  return [`report-to ${CSP_REPORT_GROUP}`, `report-uri ${CSP_REPORT_URI}`]
}

/**
 * The enforced CSP header value.
 *
 *   buildCsp({ env, scriptHashes })  // the policy pages are served with
 *   buildCsp('production')           // same, without inline-script hashes
 *
 * `scriptHashes` are CSP hash sources ("'sha256-…='"); anything else throws.
 * `env` defaults to NODE_ENV; only 'development' adds 'unsafe-eval'
 * (React Refresh). `upgrade-insecure-requests` is a valueless directive.
 */
function buildCsp(options) {
  const opts = typeof options === 'string' || options === undefined ? { env: options } : options
  const env = opts.env === undefined ? process.env.NODE_ENV : opts.env
  const scriptHashes = opts.scriptHashes || []
  for (const h of scriptHashes) {
    if (typeof h !== 'string' || !HASH_SOURCE_RE.test(h)) throw new Error(`Not a CSP sha256 hash source: ${String(h)}`)
  }
  const directives = Object.entries(CSP_DIRECTIVES).map(([key, vals]) => {
    let values = vals
    if (key === 'script-src') {
      values = [...vals, ...new Set(scriptHashes)]
      if (env === 'development') values.push("'unsafe-eval'")
    }
    return `${key} ${values.join(' ')}`
  })
  directives.push('upgrade-insecure-requests')
  directives.push(...reportingDirectives())
  return directives.join('; ')
}

/**
 * The `Content-Security-Policy-Report-Only` header value: Trusted Types,
 * reported but not enforced. A plain string that reaches a DOM-XSS sink
 * (innerHTML, script text, script src, DOMParser …) and that the default
 * policy does not approve (lib/trustedTypesDefault.ts: markup-free HTML,
 * JSON script text, the build's own chunk URLs) is reported, as is any
 * policy other than the app's own, so the sinks left can be found and
 * removed before the policy is ever enforced. Report-only violations change
 * nothing on the page (Chromium logs them at "info" level).
 */
function buildReportOnlyCsp() {
  return [
    "require-trusted-types-for 'script'",
    `trusted-types ${TRUSTED_TYPES_POLICIES.join(' ')}`,
    ...reportingDirectives(),
  ].join('; ')
}

module.exports = {
  buildCsp,
  buildReportOnlyCsp,
  CSP_DIRECTIVES,
  CSP_REPORT_GROUP,
  CSP_REPORT_URI,
  EMBED_ORIGINS,
  REPORTING_ENDPOINTS,
  TRUSTED_TYPES_POLICIES,
}
