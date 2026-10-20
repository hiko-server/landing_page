/**
 * security-b / I2 — the self-hosted CSP report endpoint (/api/e) for the
 * strict CSP and the Trusted Types report-only policy:
 *   - every body shape browsers send (bodies captured from Chromium and
 *     WebKit against this policy): report-uri, the Reporting API array,
 *     WebKit's single report object, WebKit's report-uri without
 *     `disposition`;
 *   - Trusted Types reports keep the sink name, never the sample text;
 *   - one group per problem across deploys (chunk hashes removed);
 *   - report-only groups are sampled (REPORT_ONLY_PER_GROUP_PER_DAY) before
 *     the per-client budget, so they never crowd out real errors;
 *   - they land in the admin Errors panel with their own kind label.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  cspEvent,
  parseCspReports,
  stableScriptUrl,
  trustedTypesSink,
  takeReportOnlySample,
  resetReportOnlySamples,
  REPORT_ONLY_PER_GROUP_PER_DAY,
  CLIENT_EVENTS_PER_MIN,
  MAX_CSP_REPORTS,
  MAX_REPORTS_BODY,
} from '../lib/errors/ingest'
import { kindLabel } from '../components/Admin/system/systemFormat'

process.env.JWT_SECRET = 'security-b-reports-secret-0123456789abcd'
delete process.env.TRUSTED_PROXY_IPS
delete process.env.TRUST_CLIENT_IP_HEADER

const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'security-b-reports-'))
let store: typeof import('../lib/errors/store')
let analyticsDb: typeof import('../lib/analytics/db')
let ingest: typeof import('../lib/errors/ingest')

before(async () => {
  process.chdir(tmp)
  store = await import('../lib/errors/store')
  analyticsDb = await import('../lib/analytics/db')
  ingest = await import('../lib/errors/ingest')
})
after(() => {
  analyticsDb.closeAnalyticsDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const DOC = 'https://lucian-dev.com/blog/carboy?utm_source=x'
const CHUNK = 'https://lucian-dev.com/_next/static/chunks/main-d3d3956a96cec5ec.js'

// Chromium, report-uri (application/csp-report).
const chromiumTt = {
  'csp-report': {
    'document-uri': DOC,
    referrer: '',
    'violated-directive': 'require-trusted-types-for',
    'effective-directive': 'require-trusted-types-for',
    'original-policy': "require-trusted-types-for 'script'; trusted-types nextjs nextjs#bundler; report-uri /api/e",
    disposition: 'report',
    'blocked-uri': 'trusted-types-sink',
    'line-number': 2,
    'column-number': 46,
    'source-file': CHUNK,
    'status-code': 200,
    'script-sample': 'Element innerHTML|<span>owner@example.com</span>',
  },
}
// WebKit, report-uri: same shape, no `disposition`.
const webkitTt = {
  type: 'csp-violation',
  url: DOC,
  'csp-report': {
    'document-uri': DOC,
    'violated-directive': 'require-trusted-types-for',
    'effective-directive': 'require-trusted-types-for',
    'original-policy': "require-trusted-types-for 'script'",
    'blocked-uri': 'trusted-types-sink',
    'status-code': 200,
  },
}
// WebKit, report-to: ONE Reporting API report (not an array), sent as application/csp-report.
const webkitReportTo = {
  type: 'csp-violation',
  url: DOC,
  body: {
    documentURL: DOC,
    disposition: 'enforce',
    referrer: '',
    effectiveDirective: 'script-src-elem',
    blockedURL: 'inline',
    originalPolicy: "script-src 'self'",
    statusCode: 200,
    sample: '',
  },
}
// Chromium, report-to (application/reports+json): an array, report-only and enforced mixed.
const chromiumReportTo = [
  {
    type: 'csp-violation',
    age: 10,
    url: DOC,
    user_agent: UA,
    body: {
      documentURL: DOC,
      disposition: 'report',
      effectiveDirective: 'require-trusted-types-for',
      blockedURL: 'trusted-types-sink',
      sourceFile: CHUNK,
      sample: 'HTMLScriptElement src|https://evil.example/x.js',
    },
  },
  {
    type: 'csp-violation',
    age: 12,
    url: DOC,
    user_agent: UA,
    body: {
      documentURL: DOC,
      disposition: 'report',
      effectiveDirective: 'trusted-types',
      blockedURL: 'trusted-types-policy',
      sourceFile: CHUNK,
      sample: 'dompurify',
    },
  },
  {
    type: 'csp-violation',
    url: DOC,
    body: { documentURL: DOC, disposition: 'enforce', effectiveDirective: 'img-src', blockedURL: 'http://insecure.example/a.png?id=1' },
  },
  // A report-only violation of anything else: not ours to record.
  { type: 'csp-violation', url: DOC, body: { documentURL: DOC, disposition: 'report', effectiveDirective: 'style-src-elem', blockedURL: 'inline' } },
]

test('parseCspReports reads every browser shape; Trusted Types reports are report-only and keep only the sink', () => {
  const [c] = parseCspReports(JSON.stringify(chromiumTt))
  assert.deepEqual(c, {
    directive: 'require-trusted-types-for',
    blocked: 'trusted-types-sink',
    source: CHUNK,
    path: '/blog/carboy',
    disposition: 'report',
    sink: 'Element innerHTML',
  })
  assert.ok(!JSON.stringify(c).includes('owner@example.com'), 'the sample text is never kept')

  const [w] = parseCspReports(JSON.stringify(webkitTt))
  assert.equal(w.disposition, 'report', 'WebKit omits disposition: the directive decides')
  assert.equal(w.sink, undefined)

  const [one] = parseCspReports(JSON.stringify(webkitReportTo))
  assert.deepEqual([one.directive, one.blocked, one.disposition, one.path], ['script-src-elem', 'inline', 'enforce', '/blog/carboy'])

  const many = parseCspReports(chromiumReportTo)
  assert.deepEqual(
    many.map((v) => [v.directive, v.disposition, v.sink ?? null, v.blocked]),
    [
      // Enforced violations first, then the report-only ones in their order.
      ['img-src', 'enforce', null, 'http://insecure.example/a.png'],
      ['require-trusted-types-for', 'report', 'HTMLScriptElement src', 'trusted-types-sink'],
      ['trusted-types', 'report', 'dompurify', 'trusted-types-policy'],
    ],
  )
})

test('a Reporting API batch: up to MAX_CSP_REPORTS reports, enforced violations first, 64 KB at most', () => {
  const tt = (i: number) => ({
    type: 'csp-violation',
    url: DOC,
    user_agent: UA,
    body: { documentURL: DOC, disposition: 'report', effectiveDirective: 'require-trusted-types-for', blockedURL: 'trusted-types-sink', sourceFile: CHUNK, lineNumber: i, sample: 'Element innerHTML|<b>' },
  })
  const enforced = {
    type: 'csp-violation',
    url: DOC,
    user_agent: UA,
    body: { documentURL: DOC, disposition: 'enforce', effectiveDirective: 'script-src-elem', blockedURL: 'inline', originalPolicy: "default-src 'self'; ".repeat(40) },
  }
  // A minute of a busy admin page: many report-only reports, the enforced one last.
  const batch = [...Array.from({ length: 30 }, (_, i) => tt(i)), enforced]
  const body = JSON.stringify(batch)
  assert.ok(body.length > 8192 && body.length < MAX_REPORTS_BODY, `a realistic batch (${body.length} bytes) exceeds the client-error limit`)
  const parsed = parseCspReports(body)
  assert.equal(parsed.length, MAX_CSP_REPORTS)
  assert.equal(parsed[0].disposition, 'enforce', 'the enforced violation at the end of the batch leads')
  assert.equal(parsed[0].directive, 'script-src-elem')
  assert.ok(parsed.slice(1).every((v) => v.disposition === 'report'))
  // Report order is kept within each disposition.
  const mixed = parseCspReports(JSON.stringify([tt(1), tt(2), enforced, tt(3)]))
  assert.deepEqual(mixed.map((v) => v.disposition), ['enforce', 'report', 'report', 'report'])
  assert.deepEqual(mixed.slice(1).map((v) => v.source), [CHUNK, CHUNK, CHUNK], 'report order kept')
  // Too large: nothing.
  const huge = JSON.stringify([...Array.from({ length: 200 }, (_, i) => tt(i))])
  assert.ok(huge.length > MAX_REPORTS_BODY)
  assert.deepEqual(parseCspReports(huge), [])
  // The API route accepts the batch size (Next's body parser would answer 413 above it).
  assert.match(fs.readFileSync(path.join(prevCwd, 'pages/api/e.ts'), 'utf8'), /sizeLimit: '64kb'/)
  assert.equal(MAX_REPORTS_BODY, 64 * 1024)
})

test('trustedTypesSink accepts sink and policy names only', () => {
  assert.equal(trustedTypesSink('require-trusted-types-for', 'Element innerHTML|<b>x</b>'), 'Element innerHTML')
  assert.equal(trustedTypesSink('require-trusted-types-for', 'Element setAttribute|on'), 'Element setAttribute')
  assert.equal(trustedTypesSink('require-trusted-types-for', 'HTMLIFrameElement srcdoc|<p>'), 'HTMLIFrameElement srcdoc')
  assert.equal(trustedTypesSink('require-trusted-types-for', '<img src=x onerror=alert(1)>'), null)
  assert.equal(trustedTypesSink('require-trusted-types-for', ''), null)
  assert.equal(trustedTypesSink('trusted-types', 'nextjs#bundler'), 'nextjs#bundler')
  assert.equal(trustedTypesSink('trusted-types', 'a policy with spaces'), null)
  assert.equal(trustedTypesSink('trusted-types', 'x'.repeat(41)), null)
})

test('one group per problem across deploys: build ids and chunk hashes leave the fingerprint', () => {
  assert.equal(stableScriptUrl(CHUNK), 'https://lucian-dev.com/_next/static/chunks/main.js')
  assert.equal(stableScriptUrl('/_next/static/chunks/pages/blog/[slug]-f77fcdd467b25d9d.js'), '/_next/static/chunks/pages/blog/[slug].js')
  assert.equal(stableScriptUrl('/_next/static/dT1bnbMka1sCw1-lmjcAE/_buildManifest.js'), '/_next/static/_buildManifest.js')
  assert.equal(stableScriptUrl('https://lucian-dev.com/blog/carboy'), 'https://lucian-dev.com/blog/carboy')

  const [before] = parseCspReports(JSON.stringify(chromiumTt))
  const after = { ...before, source: CHUNK.replace('d3d3956a96cec5ec', '0123456789abcdef') }
  const a = cspEvent(before, UA, null)
  const b = cspEvent(after, UA, null)
  assert.equal(a.fingerprint, b.fingerprint)
  assert.equal(a.kind, 'trusted-types')
  assert.equal(a.source, 'csp')
  assert.equal(a.name, 'TrustedTypesViolation')
  assert.equal(a.message, 'Trusted Types (report-only): Element innerHTML got a plain string')
  assert.equal(a.stack, 'https://lucian-dev.com/_next/static/chunks/main.js')
  const other = cspEvent({ ...before, sink: 'Element outerHTML' }, UA, null)
  assert.notEqual(other.fingerprint, a.fingerprint, 'another sink is another group')

  const [policy] = parseCspReports([chromiumReportTo[1]])
  assert.equal(cspEvent(policy, UA, null).message, 'Trusted Types (report-only): policy "dompurify" is not allowed')
  const [enforced] = parseCspReports(JSON.stringify(webkitReportTo))
  const e = cspEvent(enforced, UA, null)
  assert.equal(e.kind, 'csp')
  assert.equal(e.message, 'Refused script-src-elem: inline')
  assert.notEqual(e.fingerprint, a.fingerprint)
})

test('report-only groups are sampled: REPORT_ONLY_PER_GROUP_PER_DAY a day, then the next day starts again', () => {
  resetReportOnlySamples()
  const day = Date.UTC(2026, 9, 14, 3)
  let taken = 0
  for (let i = 0; i < REPORT_ONLY_PER_GROUP_PER_DAY + 10; i++) if (takeReportOnlySample('fp-a', day + i)) taken++
  assert.equal(taken, REPORT_ONLY_PER_GROUP_PER_DAY)
  assert.equal(takeReportOnlySample('fp-b', day), true, 'other groups are counted apart')
  assert.equal(takeReportOnlySample('fp-a', day + 86_400_000), true, 'a new UTC day')
  // A bounded number of groups a day.
  resetReportOnlySamples()
  let groups = 0
  for (let i = 0; i < 260; i++) if (takeReportOnlySample(`g${i}`, day)) groups++
  assert.equal(groups, 200)
  resetReportOnlySamples()
})

function post(body: unknown, opts: { ip?: string; type?: string } = {}) {
  return {
    method: 'POST',
    headers: {
      host: 'lucian-dev.com',
      'user-agent': UA,
      'content-type': opts.type ?? 'application/csp-report',
      'sec-fetch-site': 'same-origin',
      origin: 'null',
      'cf-connecting-ip': opts.ip ?? '198.51.100.7',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    socket: { remoteAddress: '127.0.0.1' },
  } as any
}

test('the endpoint records Trusted Types reports in the Errors panel, sampled before the client budget', () => {
  store.resetErrorStoreState()
  resetReportOnlySamples()
  analyticsDb.getAnalyticsDb().exec('DELETE FROM errors; DELETE FROM error_daily')
  const now = Date.UTC(2026, 9, 14, 6)

  // Reporting API batch: two report-only groups + one enforced violation.
  assert.deepEqual(ingest.ingestErrorReport(post(chromiumReportTo, { type: 'application/reports+json' }), now), { recorded: 3 })
  // WebKit's single-object upload.
  assert.deepEqual(ingest.ingestErrorReport(post(webkitReportTo), now), { recorded: 1 })

  // A busy page view after page view: the same sink, from many visitors.
  let recorded = 0
  let sampled = 0
  for (let i = 0; i < REPORT_ONLY_PER_GROUP_PER_DAY + 15; i++) {
    const out = ingest.ingestErrorReport(post(chromiumTt, { ip: `203.0.113.${(i % 200) + 1}` }), now + i)
    recorded += out.recorded
    if (out.dropped === 'sampled') sampled++
  }
  assert.equal(recorded, REPORT_ONLY_PER_GROUP_PER_DAY)
  assert.equal(sampled, 15)

  // Sampled-out reports did not use up a client's budget: one client sends many, then a real error still lands.
  const ip = '192.0.2.99'
  for (let i = 0; i < CLIENT_EVENTS_PER_MIN + 5; i++) {
    assert.equal(ingest.ingestErrorReport(post(chromiumTt, { ip }), now + 1000 + i).dropped, 'sampled')
  }
  const real = ingest.ingestErrorReport(post(JSON.stringify({ k: 'error', n: 'TypeError', m: 'x is undefined', p: '/blog' }), { ip, type: 'text/plain' }), now + 2000)
  assert.deepEqual(real, { recorded: 1 })

  const rows = store.listErrors({ status: 'all' }, now + 3000)
  const tt = rows.filter((r) => r.kind === 'trusted-types')
  assert.equal(tt.length, 3, 'three report-only groups (innerHTML, script src, policy)')
  const innerHtml = tt.find((r) => r.message.includes('Element innerHTML'))
  assert.equal(innerHtml?.count, REPORT_ONLY_PER_GROUP_PER_DAY)
  assert.equal(innerHtml?.path, '/blog/carboy')
  assert.equal(innerHtml?.source, 'csp')
  assert.deepEqual(innerHtml?.browsers, { Chrome: REPORT_ONLY_PER_GROUP_PER_DAY })
  assert.ok(!JSON.stringify(rows).includes('owner@example.com'), 'no sample text stored')
  assert.ok(!JSON.stringify(rows).includes('evil.example'), 'no sample URL stored')
  assert.equal(rows.filter((r) => r.kind === 'csp').length, 2, 'enforced violations keep their own groups')

  // The panel names the kind.
  assert.equal(kindLabel('trusted-types'), 'Trusted Types (report-only)')
  assert.equal(kindLabel('csp'), 'policy violation')
  assert.equal(kindLabel('proxy'), 'proxy (request gate)')
})

test('reports still honour Do Not Track / GPC and refuse cross-site posts', () => {
  resetReportOnlySamples()
  const dnt = post(chromiumTt)
  dnt.headers.dnt = '1'
  assert.equal(ingest.ingestErrorReport(dnt).dropped, 'dnt')
  const cross = post(chromiumTt)
  cross.headers['sec-fetch-site'] = 'cross-site'
  assert.equal(ingest.ingestErrorReport(cross).dropped, 'cross-site')
})
