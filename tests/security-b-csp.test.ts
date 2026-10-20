/**
 * security-b / I2 — hash-based strict CSP and header hardening:
 *   - script-src: 'self' + the SHA-256 of every inline script, nothing else
 *     (no 'unsafe-inline', no scheme or host source) — this file fails if
 *     either reappears;
 *   - the hashes come from the exported script constants, and no page or
 *     component renders an inline script that is not in that list;
 *   - style / font / connect / media / img sources, reporting, Trusted Types
 *     (report-only), Permissions-Policy, COOP / CORP, and the two emitters
 *     (proxy.ts, next.config.js) agree.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { INLINE_SCRIPTS, INLINE_SCRIPT_HASHES, cspScriptHash } from '../lib/security/inlineScripts'
import { applySecurityHeaders, contentSecurityPolicy } from '../lib/security/responseHeaders'
import { THEME_COLOR_PREPAINT_SCRIPT, THEME_PREPAINT_SCRIPT } from '../lib/themePrepaint'
import { TAG_PREPAINT_SCRIPT } from '../lib/tagFilter'
import { TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT } from '../lib/trustedTypesDefault'

const ROOT = path.join(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const csp = require('../lib/csp.js') as {
  buildCsp: (opts?: string | { env?: string; scriptHashes?: string[] }) => string
  buildReportOnlyCsp: () => string
  CSP_DIRECTIVES: Record<string, string[]>
  CSP_REPORT_URI: string
  EMBED_ORIGINS: string[]
  REPORTING_ENDPOINTS: string
  TRUSTED_TYPES_POLICIES: string[]
}
const headersLib = require('../lib/securityHeaders.js') as {
  PERMISSIONS_POLICY: Record<string, string[]>
  STATIC_SECURITY_HEADERS: { key: string; value: string }[]
  crossOriginResourcePolicy: (p: string) => string
  serializePermissionsPolicy: (p?: Record<string, string[]>) => string
}

/** Directive name → source list of a policy string. */
function directives(policy: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/)
    if (name) {
      assert.ok(!out.has(name), `duplicate directive ${name}`)
      out.set(name, values)
    }
  }
  return out
}

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...sourceFiles(rel))
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(rel)
  }
  return out
}

// ── script-src ─────────────────────────────────────────────────────────────

/** Fails when a script-src list could run script that is not a same-origin file or a listed hash. */
function assertStrictScriptSrc(values: string[] | undefined, label: string) {
  assert.ok(values && values.length, `${label}: script-src present`)
  for (const v of values) {
    assert.ok(v === "'self'" || /^'sha256-[A-Za-z0-9+/]{43}='$/.test(v), `${label}: script-src may only list 'self' and sha256 hashes, found ${v}`)
  }
  assert.ok(!values.includes("'unsafe-inline'"), `${label}: 'unsafe-inline' is back in script-src`)
  assert.ok(!values.some((v) => /^(https?|data|blob|wss?):?$/i.test(v) || v.includes('*') || /^https?:\/\//i.test(v)), `${label}: a scheme or host source is back in script-src`)
}

test("script-src lists 'self' and the inline-script hashes only — no 'unsafe-inline', no https:", () => {
  const served = directives(contentSecurityPolicy())
  assertStrictScriptSrc(served.get('script-src'), 'proxy CSP')
  assert.deepEqual(served.get('script-src'), ["'self'", ...INLINE_SCRIPT_HASHES])
  assert.deepEqual(served.get('script-src-attr'), ["'none'"], 'inline event handlers never run')
  // The building blocks too, in every environment but `next dev`.
  for (const env of ['production', 'test', undefined]) {
    assertStrictScriptSrc(directives(csp.buildCsp(env)).get('script-src'), `buildCsp(${env})`)
    assert.ok(!csp.buildCsp(env).includes("'unsafe-eval'"))
  }
  assertStrictScriptSrc(csp.CSP_DIRECTIVES['script-src'], 'CSP_DIRECTIVES')
  // React Refresh needs eval in development only — still no 'unsafe-inline' there.
  const dev = directives(csp.buildCsp({ env: 'development', scriptHashes: [...INLINE_SCRIPT_HASHES] })).get('script-src') || []
  assert.ok(dev.includes("'unsafe-eval'") && !dev.includes("'unsafe-inline'"))
})

test('buildCsp refuses anything but sha256 hash sources as script hashes', () => {
  for (const bad of ["'unsafe-inline'", 'https:', "'sha256-short='", "'nonce-abc'", 'sha256-AAAA']) {
    assert.throws(() => csp.buildCsp({ env: 'production', scriptHashes: [bad] }), /sha256 hash source/, bad)
  }
  // Duplicates collapse.
  const h = INLINE_SCRIPT_HASHES[0]
  assert.deepEqual(directives(csp.buildCsp({ env: 'production', scriptHashes: [h, h] })).get('script-src'), ["'self'", h])
})

test('the hashes are computed from the exported script constants (they cannot drift)', () => {
  const sha = (s: string) => `'sha256-${crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('base64')}'`
  const sources = [TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT, THEME_PREPAINT_SCRIPT, THEME_COLOR_PREPAINT_SCRIPT, TAG_PREPAINT_SCRIPT]
  assert.deepEqual(
    INLINE_SCRIPTS.map((s) => s.source),
    sources,
  )
  assert.deepEqual(INLINE_SCRIPT_HASHES, sources.map(sha))
  // Non-ASCII text hashes as UTF-8, like the browser does.
  assert.equal(cspScriptHash('"é"'), sha('"é"'))
  for (const s of INLINE_SCRIPTS) {
    assert.ok(s.source.length > 0 && !s.source.includes('</script'), `${s.id}: a non-empty script that cannot close its own element`)
    assert.ok(fs.existsSync(path.join(ROOT, s.renderedBy)), `${s.id}: ${s.renderedBy} exists`)
  }
  assert.equal(new Set(INLINE_SCRIPT_HASHES).size, INLINE_SCRIPT_HASHES.length, 'distinct scripts')
})

test('no page or component renders an inline script that is not in INLINE_SCRIPTS', () => {
  const allowed = new Map<string, string>([
    ['TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT', TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT],
    ['THEME_PREPAINT_SCRIPT', THEME_PREPAINT_SCRIPT],
    ['THEME_COLOR_PREPAINT_SCRIPT', THEME_COLOR_PREPAINT_SCRIPT],
    ['TAG_PREPAINT_SCRIPT', TAG_PREPAINT_SCRIPT],
  ])
  // The allow-list is exactly the hashed list.
  assert.deepEqual([...allowed.values()].sort(), INLINE_SCRIPTS.map((s) => s.source).sort())

  const files = ['pages', 'components', 'layout'].filter((d) => fs.existsSync(path.join(ROOT, d))).flatMap(sourceFiles)
  const used = new Set<string>()
  let scriptElements = 0
  for (const f of files) {
    const code = read(f)
    assert.doesNotMatch(code, /from ['"]next\/script['"]/, `${f}: next/script injects inline bootstrap code; render a hashed script instead`)
    // Every JSX <script …> element (lower-case tag): its attributes up to the closing `>` / `/>`
    // (an arrow `=>` inside an attribute expression does not end the tag). A bare
    // <script>{code}</script> has no __html constant and fails below.
    for (const m of code.matchAll(/<script\b((?:=>|[^>])*?)\/?>/g)) {
      const attrs = m[1]
      scriptElements++
      assert.doesNotMatch(attrs, /\bsrc=/, `${f}: external scripts are bundled, never added by tag`)
      if (/type=["']application\/(ld\+)?json["']/.test(attrs)) continue // data block: never executed
      const html = /dangerouslySetInnerHTML=\{\{\s*__html:\s*([A-Z0-9_]+)\s*\}\}/.exec(attrs)?.[1]
      assert.ok(html && allowed.has(html), `${f}: inline script ${html ?? '(expression)'} is not in lib/security/inlineScripts.ts`)
      used.add(html)
    }
    // Inline event-handler strings would be blocked (script-src-attr 'none').
    assert.doesNotMatch(code, /\son[a-z]+=["'][^"']/, `${f}: inline event-handler attribute`)
  }
  assert.ok(scriptElements >= 5, 'the scan found the known script elements')
  assert.deepEqual([...used].sort(), [...allowed.keys()].sort(), 'every listed script is still rendered somewhere')
})

// ── the other sources ──────────────────────────────────────────────────────

test('styles, fonts, media and connections stay first-party; images keep https: only for remote article images', () => {
  const d = directives(contentSecurityPolicy())
  // Emotion's per-page <style> elements and React style attributes (documented in lib/csp.js).
  assert.deepEqual(d.get('style-src'), ["'self'", "'unsafe-inline'"])
  assert.deepEqual(d.get('font-src'), ["'self'", 'data:'])
  assert.deepEqual(d.get('connect-src'), ["'self'"])
  assert.deepEqual(d.get('media-src'), ["'self'"])
  assert.deepEqual(d.get('worker-src'), ["'self'"])
  assert.deepEqual(d.get('img-src'), ["'self'", 'data:', 'blob:', 'https:'])
  assert.match(read('lib/csp.js'), /img-src https:: a published article still embeds images from another\s+\*\s+host/)
  assert.deepEqual(d.get('default-src'), ["'self'"])
  assert.deepEqual(d.get('object-src'), ["'none'"])
  assert.deepEqual(d.get('base-uri'), ["'self'"])
  assert.deepEqual(d.get('form-action'), ["'self'"])
  assert.deepEqual(d.get('frame-ancestors'), ["'none'"])
  assert.deepEqual(d.get('frame-src'), csp.EMBED_ORIGINS)
  assert.deepEqual(d.get('manifest-src'), ["'self'"])
  assert.ok(d.has('upgrade-insecure-requests'))
  // A scheme-wide source (https:, http:, data:, blob:, *) only where documented: images (remote
  // article images), and data: for the self-hosted fonts' inline subsets.
  const wide = /^(\*|https?:|data:|blob:|wss?:)$/
  for (const [name, values] of d) {
    const found = values.filter((v) => wide.test(v))
    const expected = name === 'img-src' ? ['data:', 'blob:', 'https:'] : name === 'font-src' ? ['data:'] : []
    assert.deepEqual(found, expected, `${name}: scheme-wide sources`)
  }
  // Nothing anywhere names a third-party script, analytics or monitoring host.
  assert.doesNotMatch(contentSecurityPolicy(), /sentry|cloudflareinsights|googletagmanager|google-analytics|hcaptcha/i)
})

test('violations are reported to /api/e through report-to and report-uri; Trusted Types run report-only', () => {
  const d = directives(contentSecurityPolicy())
  assert.deepEqual(d.get('report-to'), ['csp'])
  assert.deepEqual(d.get('report-uri'), ['/api/e'])
  assert.equal(csp.REPORTING_ENDPOINTS, 'csp="/api/e"')
  assert.ok(fs.existsSync(path.join(ROOT, 'pages/api/e.ts')))

  const ro = directives(csp.buildReportOnlyCsp())
  assert.deepEqual(ro.get('require-trusted-types-for'), ["'script'"])
  assert.deepEqual(ro.get('trusted-types'), ['default', 'nextjs', 'nextjs#bundler'])
  assert.deepEqual(ro.get('report-to'), ['csp'])
  assert.deepEqual(ro.get('report-uri'), ['/api/e'])
  assert.deepEqual([...ro.keys()].sort(), ['report-to', 'report-uri', 'require-trusted-types-for', 'trusted-types'])
  // The enforced policy never carries Trusted Types (lib/errors/ingest.ts relies on it).
  assert.ok(!d.has('require-trusted-types-for') && !d.has('trusted-types'))

  // The allowed policy names are the ones Next.js actually creates.
  const nextTt = read('node_modules/next/dist/client/trusted-types.js')
  assert.match(nextTt, /createPolicy\('nextjs'/)
  assert.match(read('node_modules/next/dist/build/webpack-config.js'), /output\.trustedTypes = 'nextjs#bundler'/)
})

// ── Permissions-Policy, COOP, CORP ─────────────────────────────────────────

/** Features this Chromium recognises (an unknown name logs a warning on every page view). */
const CHROMIUM_FEATURES = new Set([
  'accelerometer', 'autoplay', 'bluetooth', 'browsing-topics', 'camera', 'clipboard-read', 'clipboard-write',
  'display-capture', 'encrypted-media', 'fullscreen', 'gamepad', 'geolocation', 'gyroscope', 'hid',
  'identity-credentials-get', 'idle-detection', 'local-fonts', 'magnetometer', 'microphone', 'midi',
  'otp-credentials', 'payment', 'picture-in-picture', 'publickey-credentials-create', 'publickey-credentials-get',
  'screen-wake-lock', 'serial', 'storage-access', 'usb', 'window-management', 'xr-spatial-tracking',
])

test('Permissions-Policy switches off what the site does not use and keeps passkeys, copy and the players working', () => {
  const policy = headersLib.PERMISSIONS_POLICY
  for (const feature of Object.keys(policy)) assert.ok(CHROMIUM_FEATURES.has(feature), `${feature}: not a Chromium feature name`)
  for (const off of ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'serial', 'hid', 'bluetooth', 'midi', 'display-capture', 'browsing-topics']) {
    assert.deepEqual(policy[off], [], `${off} is off`)
  }
  assert.deepEqual(policy['publickey-credentials-get'], ['self'], 'passkey sign-in')
  assert.deepEqual(policy['publickey-credentials-create'], ['self'], 'passkey registration')
  assert.deepEqual(policy['clipboard-write'], ['self'], 'copy buttons')
  // The E2E suites read back what the copy buttons wrote; frames never get the clipboard.
  assert.deepEqual(policy['clipboard-read'], ['self'])
  // Nothing is granted to every origin.
  for (const [feature, allow] of Object.entries(policy)) {
    assert.ok(allow.every((a) => a === 'self' || csp.EMBED_ORIGINS.includes(a)), `${feature}: only this origin and the players`)
  }
  // Every feature the player iframes ask for is granted to exactly the frame-src hosts.
  for (const file of ['components/MDX/VideoEmbed.tsx', 'lib/rehype/stripMdxExpressions.ts']) {
    const allow = /allow[=:]\s*["']([^"']+)["']/.exec(read(file))?.[1]
    assert.ok(allow, `${file}: iframe allow attribute`)
    for (const feature of allow.split(';').map((s) => s.trim()).filter(Boolean)) {
      assert.deepEqual(policy[feature], ['self', ...csp.EMBED_ORIGINS], `${file}: ${feature} for the players`)
    }
  }
  const header = headersLib.serializePermissionsPolicy()
  assert.match(header, /(^|, )camera=\(\)(,|$)/)
  assert.match(header, /(^|, )publickey-credentials-get=\(self\)(,|$)/)
  assert.match(header, /(^|, )fullscreen=\(self "https:\/\/www\.youtube-nocookie\.com" "https:\/\/www\.youtube\.com" "https:\/\/player\.vimeo\.com"\)/)
  assert.doesNotMatch(header, /interest-cohort|\*/)
})

test('COOP is same-origin everywhere; CORP is same-origin except embeddable images and icons', () => {
  const byKey = new Map(headersLib.STATIC_SECURITY_HEADERS.map((h) => [h.key, h.value]))
  assert.equal(byKey.get('Cross-Origin-Opener-Policy'), 'same-origin')
  assert.equal(byKey.get('X-Frame-Options'), 'DENY')
  assert.equal(byKey.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(byKey.get('Referrer-Policy'), 'strict-origin-when-cross-origin')
  assert.equal(byKey.get('Strict-Transport-Security'), 'max-age=63072000; includeSubDomains; preload')
  assert.equal(byKey.get('X-Permitted-Cross-Domain-Policies'), 'none')
  assert.equal(byKey.get('Permissions-Policy'), headersLib.serializePermissionsPolicy())
  assert.ok(!byKey.has('Content-Security-Policy'), 'the CSP is the proxy’s alone')

  const corp = headersLib.crossOriginResourcePolicy
  for (const p of ['/uploads/a.webp', '/images/hero/x.jpg', '/icons/apple-touch-icon.png', '/api/og', '/icon.svg', '/favicon.ico']) {
    assert.equal(corp(p), 'cross-origin', p)
  }
  for (const p of ['/', '/blog/x', '/api/admin/inbox', '/api/cvdata', '/cv.pdf', '/feed.xml', '/_next/static/chunks/a.js', '/api/ogx', '/uploadsx', '/api/uploads/a.webp']) {
    assert.equal(corp(p), 'same-origin', p)
  }
})

test('the proxy sends every header; admin responses are also no-store and noindex', () => {
  const page = applySecurityHeaders({ headers: new Headers() }, { pathname: '/blog/x', adminContext: false })
  assert.equal(page.headers.get('content-security-policy'), contentSecurityPolicy())
  assert.equal(page.headers.get('content-security-policy-report-only'), csp.buildReportOnlyCsp())
  assert.equal(page.headers.get('reporting-endpoints'), 'csp="/api/e"')
  assert.equal(page.headers.get('cross-origin-resource-policy'), 'same-origin')
  for (const { key, value } of headersLib.STATIC_SECURITY_HEADERS) assert.equal(page.headers.get(key), value, key)
  assert.equal(page.headers.get('cache-control'), null)
  assert.equal(page.headers.get('x-robots-tag'), null)

  const upload = applySecurityHeaders({ headers: new Headers() }, { pathname: '/uploads/a.webp', adminContext: false })
  assert.equal(upload.headers.get('cross-origin-resource-policy'), 'cross-origin')

  const admin = applySecurityHeaders({ headers: new Headers() }, { pathname: '/admin', adminContext: true })
  assert.equal(admin.headers.get('cache-control'), 'no-store, max-age=0, must-revalidate')
  assert.equal(admin.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive')
})

test('next.config.js sends the same page-independent headers and no CSP', async () => {
  const config = require('../next.config.js') as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> }
  const rules = await config.headers()
  const all = rules.find((r) => r.source === '/:path*')
  assert.deepEqual(all?.headers, headersLib.STATIC_SECURITY_HEADERS)
  assert.ok(!rules.some((r) => r.headers.some((h) => /content-security-policy/i.test(h.key))), 'no CSP outside the proxy')
  const corpOf = (source: string) => rules.find((r) => r.source === source)?.headers.find((h) => h.key === 'Cross-Origin-Resource-Policy')?.value
  assert.equal(corpOf('/_next/static/:path*'), 'same-origin')
  assert.equal(corpOf('/favicon.ico'), 'cross-origin')
  // …which are exactly the two paths the proxy matcher skips.
  assert.match(read('proxy.ts'), /matcher: \['\/\(\(\?!_next\/static\|favicon\.ico\)\.\*\)'\]/)
})
