/**
 * H8 — the content health center (lib/contentHealth, /api/admin/content-health).
 *
 *   - tracking parameters: which are found, how they are stripped
 *   - the MDX body scan (links, images, headings, hard breaks) and the
 *     rewrites behind the safe fixes
 *   - the link checker: verdicts (redirects, 999 / bot walls, 404, failing
 *     streaks), per-host pacing, run planning and the time budget
 *   - every rule of the analysis, positive and negative
 *   - the schedule's timing
 *   - the API through its real handler on a throw-away store: the report,
 *     fixes saved through the editor's save path (snapshot, revalidation),
 *     version conflicts, CV / home fixes, responsive sizes, link checks
 *
 * Fixtures are synthetic (Example Person, example.com); nothing touches the
 * network. The process moves into a temp directory BEFORE any server module
 * is loaded (lib/db, lib/cvdata and lib/home fix their data paths when they
 * are first imported), so the store, snapshots and uploads all live there:
 * only pure modules are imported statically, everything else dynamically.
 */
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import sharp from 'sharp'
import {
  stripTrackingParams,
  trackingParamsIn,
  isTrackingParam,
} from '../lib/contentHealth/tracking'
import { fixBreaks, rewriteUrls, scanBody } from '../lib/contentHealth/mdxScan'
import {
  checkLink,
  createHostGate,
  isPersistentFailure,
  isSafeMove,
  linkKey,
  nextRecord,
  planRun,
  runChecks,
  FAILING_ESCALATE_MS,
  type HopFetcher,
  type HopResponse,
  type LinkRecord,
} from '../lib/contentHealth/linkCheck'
import {
  analyzeContent,
  isMeaninglessAlt,
  type AnalyzeInput,
  type HealthDoc,
  type ImageInfo,
} from '../lib/contentHealth/analyze'
import {
  firstLinkCheckDelay,
  linkCheckIntervalHours,
  startLinkCheckSchedule,
} from '../lib/contentHealth/schedule'
import {
  checkOptions,
  countsLine,
  filterIssues,
  fixSummary,
  groupIssues,
  linkStatusLine,
  shortUrl,
} from '../components/Admin/system/contentHealthFormat'
import type { HealthIssue } from '../lib/contentHealth/types'

for (const k of [
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'CF_API_TOKEN',
  'CF_ZONE_ID',
  'INDEXNOW_KEY',
  'LINK_CHECK_INTERVAL_HOURS',
]) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'admin-ops-health-secret'
process.env.NEXT_PUBLIC_SITE_HOST = process.env.NEXT_PUBLIC_SITE_HOST || 'lucian-dev.com'
const SITE = process.env.NEXT_PUBLIC_SITE_HOST

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-ops-health-'))
fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true })
process.chdir(tmp)

// ── Tracking parameters ────────────────────────────────────────────────────

describe('tracking parameters', () => {
  test('finds campaign tags and click ids anywhere', () => {
    assert.deepEqual(trackingParamsIn('https://example.com/a?utm_source=x&utm_medium=y&id=3'), [
      'utm_source',
      'utm_medium',
    ])
    assert.deepEqual(trackingParamsIn('https://example.com/?fbclid=1&gclid=2&msclkid=3&mc_eid=4'), [
      'fbclid',
      'gclid',
      'msclkid',
      'mc_eid',
    ])
    assert.deepEqual(trackingParamsIn('https://example.com/?_hsenc=a&_hsmi=b&igshid=c'), [
      '_hsenc',
      '_hsmi',
      'igshid',
    ])
    assert.deepEqual(
      trackingParamsIn('https://example.com/?UTM_Campaign=Launch'),
      ['utm_campaign'],
      'case-insensitive'
    )
  })

  test('share tokens only on the sites that issue them', () => {
    assert.deepEqual(trackingParamsIn('https://www.youtube.com/watch?v=abc&si=XyZ'), ['si'])
    assert.deepEqual(
      trackingParamsIn('https://youtu.be/abc?si=XyZ&t=42'),
      ['si'],
      'a YouTube start time stays'
    )
    assert.deepEqual(trackingParamsIn('https://open.spotify.com/track/1?si=abc'), ['si'])
    assert.deepEqual(
      trackingParamsIn('https://www.linkedin.com/posts/x?rcm=ABC&utm_medium=member'),
      ['rcm', 'utm_medium']
    )
    assert.deepEqual(trackingParamsIn('https://x.com/someone/status/1?s=20&t=abc'), ['s', 't'])
    assert.deepEqual(
      trackingParamsIn('https://example.com/?si=1&s=2&t=3'),
      [],
      'si / s / t mean something else elsewhere'
    )
    assert.equal(isTrackingParam('si', 'music.youtube.com'), true)
    assert.equal(isTrackingParam('si', 'notyoutube.com'), false)
  })

  test('never flags parameters that change the page', () => {
    assert.deepEqual(
      trackingParamsIn('https://github.com/example/repo/blob/main/x.ts?ref=feature'),
      []
    )
    assert.deepEqual(trackingParamsIn('https://medium.com/@example/post-1?sk=abc123'), [])
    assert.deepEqual(trackingParamsIn('https://www.amazon.com/dp/B0?tag=example-20'), [])
    assert.deepEqual(trackingParamsIn('https://example.com/search?q=utm_source'), [])
    assert.deepEqual(trackingParamsIn('mailto:someone@example.com?subject=utm_source'), [])
    assert.deepEqual(
      trackingParamsIn('https://example.com/#utm_source=x'),
      [],
      'a fragment is not a query'
    )
  })

  test('stripping keeps everything else exactly as written', () => {
    assert.equal(
      stripTrackingParams('https://example.com/a?utm_source=x&b=%20c&d#frag'),
      'https://example.com/a?b=%20c&d#frag'
    )
    assert.equal(
      stripTrackingParams('https://example.com/a?utm_source=x&utm_medium=y'),
      'https://example.com/a'
    )
    assert.equal(
      stripTrackingParams('https://example.com/a?utm_source=x#top'),
      'https://example.com/a#top'
    )
    assert.equal(
      stripTrackingParams('https://youtu.be/abc?si=XyZ&t=42'),
      'https://youtu.be/abc?t=42'
    )
    assert.equal(
      stripTrackingParams('www.example.com/x?fbclid=1&page=2'),
      'www.example.com/x?page=2',
      'scheme-less GFM autolinks too'
    )
    const clean = 'https://example.com/a?b=1'
    assert.equal(stripTrackingParams(clean), clean)
  })
})

// ── Body scan and rewrites ─────────────────────────────────────────────────

describe('MDX body scan', () => {
  const body = [
    '## Intro',
    '',
    'See [the docs](https://example.com/docs?utm_source=x) and https://example.org/a.',
    'Also www.example.net/page?fbclid=1 and [ref][r].',
    '',
    '```js',
    "fetch('https://example.com/in-code?utm_source=no')",
    '```',
    '',
    'Inline `https://example.com/inline?utm_source=no` stays literal.',
    '',
    '![shot.png](/uploads/shot.png)',
    '',
    '<Figure src="https://cdn.example.com/a.jpg" alt="" />',
    '',
    '<img src="/uploads/b.jpg" />',
    '',
    '<a href="https://example.com/jsx">jsx</a>',
    '',
    'Setext title',
    '------------',
    '',
    '<h4>JSX heading</h4>',
    '',
    '[r]: https://example.com/ref?gclid=1',
  ].join('\n')

  test('links: markdown, GFM autolink literals (https:// and www.), definitions, JSX href — never code', () => {
    const s = scanBody(body)
    assert.ok(s.ok)
    const urls = s.links.map((l) => l.url)
    assert.ok(urls.includes('https://example.com/docs?utm_source=x'))
    assert.ok(urls.includes('https://example.org/a'))
    assert.ok(urls.includes('http://www.example.net/page?fbclid=1'))
    assert.ok(urls.includes('https://example.com/ref?gclid=1'))
    assert.ok(urls.includes('https://example.com/jsx'))
    assert.ok(!urls.some((u) => u.includes('in-code') || u.includes('inline')))
    const www = s.links.find((l) => l.url.startsWith('http://www.example.net'))
    assert.equal(
      www?.raw,
      'www.example.net/page?fbclid=1',
      'the raw spelling is what the source says'
    )
    assert.equal(s.links.find((l) => l.url === 'https://example.com/docs?utm_source=x')?.line, 3)
  })

  test('images and their alt: markdown, JSX alt="" and JSX without alt', () => {
    const s = scanBody(body)
    assert.ok(s.ok)
    const md = s.images.find((i) => i.url === '/uploads/shot.png')
    assert.equal(md?.alt, 'shot.png')
    assert.equal(md?.jsx, false)
    const fig = s.images.find((i) => i.url === 'https://cdn.example.com/a.jpg')
    assert.equal(fig?.alt, '')
    assert.equal(fig?.jsx, true)
    assert.equal(s.images.find((i) => i.url === '/uploads/b.jpg')?.alt, null)
  })

  test('headings: ATX, setext and JSX', () => {
    const s = scanBody(body)
    assert.ok(s.ok)
    assert.deepEqual(
      s.headings.map((h) => [h.depth, h.text]),
      [
        [2, 'Intro'],
        [2, 'Setext title'],
        [4, 'JSX heading'],
      ]
    )
  })

  test('hard breaks: spacer runs, a stray final backslash, invisible two-space breaks', () => {
    const s = scanBody(
      'Text one.\\\n\\\n\\\n![a](/uploads/a.png)\n\nan address\\\nline two\n\nends badly\\\n\nkeep \\\\\n\nfirst  \nsecond\n'
    )
    assert.ok(s.ok)
    assert.equal(s.breakRuns.length, 1, 'a single intentional break is not a run')
    assert.equal(s.breakRuns[0].count, 3)
    assert.equal(s.breakRuns[0].fixable, true)
    assert.equal(s.strayBackslashes.length, 1, 'an escaped "\\\\" is meant')
    assert.equal(s.strayBackslashes[0].line, 9)
    assert.equal(s.invisibleBreaks.length, 1)
    assert.equal(s.invisibleBreaks[0].line, 13)
  })

  test('a break run is not fixed inside a list or before text that would become another block', () => {
    const inList = scanBody('- item\\\n  \\\n  more\n')
    assert.ok(inList.ok)
    assert.equal(inList.breakRuns[0]?.fixable, false)
    const beforeNumber = scanBody('Text\\\n\\\n2. not a list yet\n')
    assert.ok(beforeNumber.ok)
    assert.equal(beforeNumber.breakRuns[0]?.fixable, false)
  })

  test('a body that cannot be parsed reports the error and its line', () => {
    const s = scanBody('# Title\n\n<Callout>\nnever closed')
    assert.equal(s.ok, false)
    if (!s.ok) assert.ok(s.error.length > 0)
  })

  test('rewriteUrls changes the destination and a matching link text, never code or longer URLs', () => {
    const src = [
      '[https://example.com/p?utm_source=a](https://example.com/p?utm_source=a)',
      '[other](https://example.com/p?utm_source=a&x=1)',
      '`https://example.com/p?utm_source=a`',
      'www.example.com/p?utm_source=a',
    ].join('\n\n')
    const out = rewriteUrls(src, (url) =>
      url === 'https://example.com/p?utm_source=a' ||
      url === 'http://www.example.com/p?utm_source=a'
        ? stripTrackingParams
        : null
    )
    assert.equal(out.changed, 3)
    assert.match(out.body, /^\[https:\/\/example\.com\/p\]\(https:\/\/example\.com\/p\)/)
    assert.match(
      out.body,
      /\[other\]\(https:\/\/example\.com\/p\?utm_source=a&x=1\)/,
      'a longer URL is another link'
    )
    assert.match(out.body, /`https:\/\/example\.com\/p\?utm_source=a`/, 'code is literal')
    assert.match(out.body, /\nwww\.example\.com\/p$/)
  })

  test('fixBreaks: paragraphs, the stray backslash, visible breaks that render the same', async () => {
    const src = 'Text one.\\\n\\\n\\\n![a](/uploads/a.png)\n\nends badly\\\n\nfirst  \nsecond\n'
    const para = fixBreaks(src, new Set(['paragraph-breaks']))
    assert.equal(para.changed, 1)
    assert.ok(para.body.startsWith('Text one.\n\n![a](/uploads/a.png)'))
    const stray = fixBreaks(src, new Set(['remove-backslash']))
    assert.match(stray.body, /\nends badly\n\n/)
    const visible = fixBreaks(src, new Set(['visible-breaks']))
    assert.match(visible.body, /first\\\nsecond/)
    const { compileMdx } = await import('../lib/mdx')
    const noSizes = {
      resolveSize: async () => null,
      srcSetFor: () => undefined,
      posterFor: async () => null,
    }
    const a = await compileMdx('first  \nsecond\n', noSizes as any)
    const b = await compileMdx(
      fixBreaks('first  \nsecond\n', new Set(['visible-breaks'])).body,
      noSizes as any
    )
    assert.deepEqual(b.tree, a.tree, 'the page is unchanged')
  })
})

// ── Link checker ───────────────────────────────────────────────────────────

type Route = HopResponse | { error: string }

/** A fake network: URL (+ method) → answer; counts requests. */
function fakeNet(routes: Record<string, Route | { HEAD?: Route; GET?: Route }>) {
  const calls: string[] = []
  const fetchHop: HopFetcher = async (url, method) => {
    calls.push(`${method} ${url}`)
    const r = routes[url]
    const hit = (r && ('HEAD' in r || 'GET' in r) ? (r as any)[method] : r) as Route | undefined
    if (!hit) return { status: 404, location: null, headers: {} }
    if ('error' in hit) throw Object.assign(new Error(hit.error), { code: hit.error })
    return hit
  }
  return { fetchHop, calls }
}

const ok200: HopResponse = { status: 200, location: null, headers: {} }
const redirect = (status: number, location: string): HopResponse => ({
  status,
  location,
  headers: {},
})
const openGate = createHostGate({ concurrency: 8, minGapMs: 0 })

describe('link checker verdicts', () => {
  test('200 is ok; temporary redirects are ok', async () => {
    const net = fakeNet({
      'https://a.example.com/': ok200,
      'https://b.example.com/x': redirect(302, '/y'),
      'https://b.example.com/y': ok200,
    })
    assert.equal((await checkLink('https://a.example.com/', net.fetchHop, openGate)).outcome, 'ok')
    assert.equal((await checkLink('https://b.example.com/x', net.fetchHop, openGate)).outcome, 'ok')
  })

  test('a permanent move on the same site is a safe fix; elsewhere, to the root or to a sign-in it is not', async () => {
    const net = fakeNet({
      'http://example.com/post': redirect(301, 'https://www.example.com/post?utm_source=redirect'),
      'https://www.example.com/post?utm_source=redirect': ok200,
      'https://example.com/old': redirect(308, 'https://other.example.org/new'),
      'https://other.example.org/new': ok200,
      'https://example.com/deep/page': redirect(301, 'https://example.com/'),
      'https://example.com/': ok200,
      'https://example.com/private': redirect(301, 'https://example.com/login?next=x'),
      'https://example.com/login?next=x': ok200,
    })
    const safe = await checkLink('http://example.com/post', net.fetchHop, openGate)
    assert.equal(safe.outcome, 'moved')
    assert.equal(
      safe.finalUrl,
      'https://www.example.com/post',
      'tracking added by the redirect is dropped'
    )
    assert.equal(safe.safeMove, true)
    const other = await checkLink('https://example.com/old', net.fetchHop, openGate)
    assert.equal(other.outcome, 'moved')
    assert.equal(other.safeMove, false)
    assert.equal(
      (await checkLink('https://example.com/deep/page', net.fetchHop, openGate)).safeMove,
      false
    )
    assert.equal(
      (await checkLink('https://example.com/private', net.fetchHop, openGate)).safeMove,
      false
    )
    assert.equal(
      isSafeMove('https://example.com/a', 'http://example.com/a'),
      false,
      'never to http'
    )
  })

  test('404 and 410 are broken', async () => {
    const net = fakeNet({
      'https://example.com/gone': { status: 410, location: null, headers: {} },
    })
    const v404 = await checkLink('https://example.com/missing', net.fetchHop, openGate)
    assert.equal(v404.outcome, 'broken')
    assert.equal(v404.status, 404)
    assert.equal(
      (await checkLink('https://example.com/gone', net.fetchHop, openGate)).outcome,
      'broken'
    )
  })

  test('HEAD refused, GET fine: ok (two requests)', async () => {
    const net = fakeNet({
      'https://example.com/head': {
        HEAD: { status: 405, location: null, headers: {} },
        GET: ok200,
      },
    })
    assert.equal(
      (await checkLink('https://example.com/head', net.fetchHop, openGate)).outcome,
      'ok'
    )
    assert.deepEqual(net.calls, ['HEAD https://example.com/head', 'GET https://example.com/head'])
  })

  test("LinkedIn's 999, 429 and bot walls are unverifiable, never broken — and 999 / 429 are not retried", async () => {
    const net = fakeNet({
      'https://www.linkedin.com/in/example': { status: 999, location: null, headers: {} },
      'https://busy.example.com/': { status: 429, location: null, headers: {} },
      'https://wall.example.com/': { status: 403, location: null, headers: {} },
      'https://cf.example.com/': {
        status: 503,
        location: null,
        headers: { 'cf-mitigated': 'challenge' },
      },
    })
    const li = await checkLink('https://www.linkedin.com/in/example', net.fetchHop, openGate)
    assert.equal(li.outcome, 'unverifiable')
    assert.match(li.reason || '', /999/)
    assert.equal(
      (await checkLink('https://busy.example.com/', net.fetchHop, openGate)).outcome,
      'unverifiable'
    )
    assert.equal(
      net.calls.filter((c) => c.includes('linkedin') || c.includes('busy')).length,
      2,
      'no GET retry'
    )
    assert.equal(
      (await checkLink('https://wall.example.com/', net.fetchHop, openGate)).outcome,
      'unverifiable'
    )
    assert.equal(
      (await checkLink('https://cf.example.com/', net.fetchHop, openGate)).outcome,
      'unverifiable'
    )
  })

  test('5xx, DNS, timeouts and redirect loops are failing; private addresses are blocked', async () => {
    const net = fakeNet({
      'https://down.example.com/': { status: 502, location: null, headers: {} },
      'https://nxdomain.example.com/': { error: 'DNS' },
      'https://slow.example.com/': { error: 'TIMEOUT' },
      'https://loop.example.com/a': redirect(301, '/b'),
      'https://loop.example.com/b': redirect(301, '/a'),
      'https://intranet.example.com/': { error: 'BLOCKED_HOST' },
    })
    assert.equal(
      (await checkLink('https://down.example.com/', net.fetchHop, openGate)).outcome,
      'failing'
    )
    const dns = await checkLink('https://nxdomain.example.com/', net.fetchHop, openGate)
    assert.equal(dns.outcome, 'failing')
    assert.equal(dns.code, 'DNS')
    assert.equal(
      (await checkLink('https://slow.example.com/', net.fetchHop, openGate)).code,
      'TIMEOUT'
    )
    assert.equal(
      (await checkLink('https://loop.example.com/a', net.fetchHop, openGate)).code,
      'REDIRECT_LOOP'
    )
    assert.equal(
      (await checkLink('https://intranet.example.com/', net.fetchHop, openGate)).outcome,
      'blocked'
    )
  })

  test('failure streaks: once is transient, failing on runs ≥ 20 h apart is persistent; success resets', () => {
    const v = {
      outcome: 'failing' as const,
      status: 503,
      code: null,
      reason: 'Server error',
      finalUrl: null,
      safeMove: false,
    }
    const t0 = 1_000_000
    const r1 = nextRecord(undefined, v, 'https://x.example.com/', t0)
    assert.equal(r1.failures, 1)
    assert.equal(isPersistentFailure(r1, t0 + FAILING_ESCALATE_MS), false)
    const r2 = nextRecord(r1, v, 'https://x.example.com/', t0 + FAILING_ESCALATE_MS)
    assert.equal(r2.failures, 2)
    assert.equal(r2.failingSince, t0)
    assert.equal(isPersistentFailure(r2, t0 + FAILING_ESCALATE_MS), true)
    const quick = nextRecord(r1, v, 'https://x.example.com/', t0 + 60_000)
    assert.equal(
      isPersistentFailure(quick, t0 + 60_000),
      false,
      'two failures in a minute are not a day apart'
    )
    const okAgain = nextRecord(
      r2,
      { ...v, outcome: 'ok', status: 200, reason: null },
      'https://x.example.com/',
      t0 + 2 * FAILING_ESCALATE_MS
    )
    assert.equal(okAgain.failures, 0)
    assert.equal(okAgain.failingSince, null)
  })

  test('linkKey drops the fragment and refuses non-web links', () => {
    assert.equal(linkKey('https://example.com/a#b'), 'https://example.com/a')
    assert.equal(linkKey('//example.com/a'), 'https://example.com/a')
    assert.equal(linkKey('mailto:a@example.com'), null)
  })
})

/** A deterministic clock with timers for the pacing gate. */
function fakeClock() {
  let t = 0
  const timers: Array<{ at: number; fn: () => void }> = []
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => {
      const h = { at: t + ms, fn }
      timers.push(h)
      return h
    },
    clearTimer: (h: unknown) => {
      const i = timers.indexOf(h as (typeof timers)[number])
      if (i >= 0) timers.splice(i, 1)
    },
    delay(ms: number) {
      return new Promise<void>((resolve) => timers.push({ at: t + ms, fn: resolve }))
    },
    async drain() {
      for (let guard = 0; guard < 10_000; guard++) {
        for (let k = 0; k < 5; k++) await new Promise((r) => setImmediate(r))
        if (!timers.length) return
        timers.sort((a, b) => a.at - b.at)
        const next = timers.shift() as (typeof timers)[number]
        t = Math.max(t, next.at)
        next.fn()
      }
    },
  }
}

describe('per-host pacing', () => {
  test('one request per host at a time, ≥ minGap of quiet between them, concurrency capped, other hosts not held up', async () => {
    const clock = fakeClock()
    const gate = createHostGate({
      concurrency: 2,
      minGapMs: 2000,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    })
    const log: Array<{ host: string; start: number; end: number }> = []
    let inFlight = 0
    let maxInFlight = 0
    const job = (host: string, ms: number) =>
      gate.run(host, async () => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        const start = clock.now()
        await clock.delay(ms)
        inFlight--
        log.push({ host, start, end: clock.now() })
      })
    const all = Promise.all([
      job('a.example', 300),
      job('a.example', 300),
      job('a.example', 300),
      job('b.example', 100),
      job('c.example', 100),
    ])
    await clock.drain()
    await all
    const a = log.filter((l) => l.host === 'a.example').sort((x, y) => x.start - y.start)
    assert.equal(a.length, 3)
    for (let i = 1; i < a.length; i++)
      assert.ok(a[i].start - a[i - 1].end >= 2000, `gap ${a[i].start - a[i - 1].end}`)
    assert.ok(maxInFlight <= 2)
    const b = log.find((l) => l.host === 'b.example')
    const c = log.find((l) => l.host === 'c.example')
    assert.ok(b && b.start === 0, 'b starts at once')
    assert.ok(c && c.start < 2000, 'c does not wait for a’s pause')
  })

  test('planRun: never-checked first, then the oldest; fresh results skipped; per-host and per-run caps', () => {
    const rec = (url: string, checkedAt: number): LinkRecord => ({
      url,
      checkedAt,
      outcome: 'ok',
      status: 200,
      code: null,
      reason: null,
      finalUrl: null,
      safeMove: false,
      failures: 0,
      failingSince: null,
    })
    const now = 100 * 3_600_000
    const urls = [
      'https://a.example/1',
      'https://a.example/2',
      'https://a.example/3',
      'https://b.example/1',
      'https://c.example/1',
    ]
    const records = {
      'https://a.example/1': rec('https://a.example/1', now - 30 * 3_600_000),
      'https://b.example/1': rec('https://b.example/1', now - 1000),
      'https://c.example/1': rec('https://c.example/1', now - 50 * 3_600_000),
    }
    const plan = planRun(urls, records, now, {
      maxAgeMs: 20 * 3_600_000,
      maxUrls: 10,
      perHostMax: 2,
    })
    assert.deepEqual(plan.due, [
      'https://a.example/2',
      'https://a.example/3',
      'https://c.example/1',
    ])
    assert.equal(plan.skipped, 2)
    assert.equal(planRun(urls, {}, now, { maxAgeMs: 1, maxUrls: 2, perHostMax: 9 }).due.length, 2)
  })

  test('runChecks stops starting requests at the deadline and reports a partial run', async () => {
    let t = 0
    const fetchHop: HopFetcher = async () => {
      t += 1000
      return ok200
    }
    const urls = [
      'https://a.example/',
      'https://b.example/',
      'https://c.example/',
      'https://d.example/',
    ]
    const gate = createHostGate({ concurrency: 1, minGapMs: 0 })
    const out = await runChecks(urls, {}, { fetchHop, gate, now: () => t, deadline: 2500 })
    assert.equal(out.partial, true)
    assert.equal(out.checked, 3)
    assert.equal(Object.keys(out.records).length, 3, 'unchecked URLs keep no (or their old) result')
  })
})

// ── Rules ──────────────────────────────────────────────────────────────────

const NOW = Date.UTC(2026, 9, 20, 12)

function info(over: Partial<ImageInfo> = {}): ImageInfo {
  return {
    kind: 'upload',
    exists: true,
    bytes: 200_000,
    width: 1200,
    height: 800,
    format: 'jpeg',
    animated: false,
    variantEligible: true,
    missingVariants: [],
    upload: 'x.jpg',
    ...over,
  }
}

function doc(over: Partial<HealthDoc> & { slug: string }): HealthDoc {
  const kind = over.kind || 'post'
  const collection = kind === 'work' ? 'work' : 'blog'
  return {
    key: `${collection}/${over.slug}`,
    kind,
    title: `Example ${over.slug}`,
    description: `A synthetic description for ${over.slug} written for the content health tests.`,
    body: '',
    frontmatter: {},
    version: 1,
    editHref: `/admin/${collection}/edit?slug=${over.slug}`,
    publicHref: `/${collection}/${over.slug}`,
    ...over,
  }
}

function input(over: Partial<AnalyzeInput> = {}): AnalyzeInput {
  return {
    siteHost: SITE,
    now: NOW,
    docs: [],
    known: { blog: {}, work: {} },
    cv: null,
    home: null,
    links: {},
    imageInfo: () => info(),
    ...over,
  }
}

const record = (url: string, over: Partial<LinkRecord>): LinkRecord => ({
  url,
  checkedAt: NOW - 3_600_000,
  outcome: 'ok',
  status: 200,
  code: null,
  reason: null,
  finalUrl: null,
  safeMove: false,
  failures: 0,
  failingSince: null,
  ...over,
})

const only = (issues: HealthIssue[], check: string) => issues.filter((i) => i.check === check)

describe('rules', () => {
  test('external link results: broken, failing once / persistently, blocked, moved (safe and not), unverifiable', () => {
    const body = [
      '[a](https://gone.example.com/a)',
      '[b](https://flaky.example.com/b)',
      '[c](https://down.example.com/c)',
      '[d](https://moved.example.com/d#part)',
      '[e](https://away.example.com/e)',
      '[f](https://www.linkedin.com/in/example)',
      '[g](https://fine.example.com/g)',
      '[h](https://lan.example.com/h)',
    ].join('\n\n')
    const links: Record<string, LinkRecord> = {
      'https://gone.example.com/a': record('https://gone.example.com/a', {
        outcome: 'broken',
        status: 404,
        reason: 'Not found (HTTP 404)',
      }),
      'https://flaky.example.com/b': record('https://flaky.example.com/b', {
        outcome: 'failing',
        status: 503,
        failures: 1,
        failingSince: NOW - 3_600_000,
      }),
      'https://down.example.com/c': record('https://down.example.com/c', {
        outcome: 'failing',
        code: 'DNS',
        status: null,
        failures: 3,
        failingSince: NOW - 3 * 86_400_000,
      }),
      'https://moved.example.com/d': record('https://moved.example.com/d', {
        outcome: 'moved',
        finalUrl: 'https://moved.example.com/new-d',
        safeMove: true,
      }),
      'https://away.example.com/e': record('https://away.example.com/e', {
        outcome: 'moved',
        finalUrl: 'https://elsewhere.example.org/',
        safeMove: false,
      }),
      'https://www.linkedin.com/in/example': record('https://www.linkedin.com/in/example', {
        outcome: 'unverifiable',
        status: 999,
      }),
      'https://fine.example.com/g': record('https://fine.example.com/g', {}),
      'https://lan.example.com/h': record('https://lan.example.com/h', {
        outcome: 'blocked',
        status: null,
      }),
    }
    const { issues, external } = analyzeContent(
      input({ docs: [doc({ slug: 'links', body })], links })
    )
    const broken = only(issues, 'broken-link')
    const sev = (host: string) => broken.find((i) => i.url?.includes(host))?.severity
    assert.equal(sev('gone.example.com'), 'error')
    assert.equal(sev('flaky.example.com'), 'warning')
    assert.equal(sev('down.example.com'), 'error')
    assert.equal(sev('lan.example.com'), 'warning')
    assert.equal(sev('linkedin.com'), undefined, 'unverifiable is never reported as broken')
    assert.equal(sev('fine.example.com'), undefined)
    const moved = only(issues, 'redirect')
    assert.equal(moved.length, 2)
    const safe = moved.find((i) => i.url?.includes('moved.example.com'))
    assert.equal(safe?.severity, 'notice')
    assert.deepEqual(safe?.fix, { type: 'use-new-url', to: 'https://moved.example.com/new-d#part' })
    assert.equal(moved.find((i) => i.url?.includes('away.example.com'))?.fix, undefined)
    assert.equal(external.size, 8)
  })

  test('internal links: missing is an error, a draft a warning, a published one fine', () => {
    const body = `[a](/blog/missing) [b](/work/draft-case) [c](/blog/live) [d](https://${SITE}/work/missing-too) [e](/about)`
    const { issues } = analyzeContent(
      input({
        docs: [doc({ slug: 'links', body })],
        known: { blog: { live: { draft: false } }, work: { 'draft-case': { draft: true } } },
      })
    )
    const internal = only(issues, 'internal-link')
    assert.deepEqual(
      internal.map((i) => [i.severity, i.url]).sort(),
      [
        ['error', '/blog/missing'],
        ['error', `https://${SITE}/work/missing-too`],
        ['warning', '/work/draft-case'],
      ].sort()
    )
  })

  test('tracking parameters: a warning with the stripped address as its fix; clean links are not reported', () => {
    const body = '[a](https://example.com/a?utm_source=x&id=1)\n\n[b](https://example.com/b?id=2)'
    const { issues } = analyzeContent(input({ docs: [doc({ slug: 't', body })] }))
    const t = only(issues, 'tracking')
    assert.equal(t.length, 1)
    assert.equal(t[0].severity, 'warning')
    assert.deepEqual(t[0].fix, { type: 'strip-tracking', to: 'https://example.com/a?id=1' })
    assert.match(t[0].detail, /utm_source/)
  })

  test('images: missing, unknown (R2), remote (import), insecure, broken remote, missing sizes, heavy, huge, covers', () => {
    const body = [
      '![A tidy desk](/uploads/missing.jpg)',
      '![A tidy desk](/uploads/r2only.jpg)',
      '![A tidy desk](https://cdn.example.com/remote.jpg)',
      '![A tidy desk](http://cdn.example.com/insecure.jpg)',
      '![A tidy desk](https://cdn.example.com/gone.jpg)',
      '![A tidy desk](/uploads/nosizes.jpg)',
      '![A tidy desk](/uploads/sized.jpg)',
      '![A tidy desk](/uploads/anim.gif)',
      '![A tidy desk](/uploads/huge.jpg)',
    ].join('\n\n')
    const files: Record<string, Partial<ImageInfo>> = {
      '/uploads/missing.jpg': { exists: false },
      '/uploads/r2only.jpg': { exists: null },
      '/uploads/nosizes.jpg': {
        missingVariants: [640, 1280],
        width: 2400,
        bytes: 1_800_000,
        upload: 'nosizes.jpg',
      },
      '/uploads/sized.jpg': { bytes: 3_000_000, width: 2000 },
      '/uploads/anim.gif': {
        format: 'gif',
        animated: true,
        variantEligible: false,
        bytes: 2_500_000,
      },
      '/uploads/huge.jpg': { width: 6000, height: 4000 },
      '/uploads/tiny-cover.webp': { width: 142, height: 65 },
    }
    const links = {
      'https://cdn.example.com/gone.jpg': record('https://cdn.example.com/gone.jpg', {
        outcome: 'broken',
        status: 404,
      }),
    }
    const d = doc({ slug: 'img', body, frontmatter: { cover: '/uploads/tiny-cover.webp' } })
    const { issues } = analyzeContent(
      input({ docs: [d], links, imageInfo: (src) => info(files[src] || {}) })
    )
    const of = (src: string) =>
      issues
        .filter((i) => i.url === src)
        .map((i) => `${i.check}:${i.severity}${i.fix ? `:${i.fix.type}` : ''}`)
    assert.deepEqual(of('/uploads/missing.jpg'), ['image-missing:error'])
    assert.deepEqual(of('/uploads/r2only.jpg'), [])
    assert.deepEqual(of('https://cdn.example.com/remote.jpg'), [
      'remote-image:warning:import-image',
    ])
    assert.deepEqual(of('http://cdn.example.com/insecure.jpg'), ['remote-image:error'])
    assert.deepEqual(of('https://cdn.example.com/gone.jpg'), ['image-missing:error'])
    assert.deepEqual(of('/uploads/nosizes.jpg'), ['image-srcset:warning:generate-variants'])
    assert.deepEqual(
      of('/uploads/sized.jpg'),
      [],
      'variants complete: a heavy original is not what visitors download'
    )
    assert.deepEqual(of('/uploads/anim.gif'), ['image-weight:warning'])
    assert.deepEqual(of('/uploads/huge.jpg'), ['image-dimensions:notice'])
    assert.deepEqual(of('/uploads/tiny-cover.webp'), ['image-dimensions:warning'])
    const midCover = analyzeContent(
      input({
        docs: [doc({ slug: 'c', frontmatter: { cover: '/uploads/mid.jpg' } })],
        imageInfo: () => info({ width: 1280 }),
      })
    )
    assert.deepEqual(
      midCover.issues.map((i) => `${i.check}:${i.severity}`),
      ['image-dimensions:notice']
    )
  })

  test('alt text: missing or a file name is reported; JSX alt="" (decorative) and real words are not', () => {
    const body = [
      '![](/uploads/a.jpg)',
      '![1755661280418.jpg](/uploads/b.jpg)',
      '![IMG_2041](/uploads/c.jpg)',
      '<img src="/uploads/d.jpg" />',
      '<img src="/uploads/e.jpg" alt="" />',
      '![The robot arm sorting a bottle](/uploads/f.jpg)',
    ].join('\n\n')
    const { issues } = analyzeContent(input({ docs: [doc({ slug: 'alt', body })] }))
    assert.deepEqual(
      only(issues, 'image-alt')
        .map((i) => i.url)
        .sort(),
      ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg', '/uploads/d.jpg']
    )
    assert.equal(isMeaninglessAlt('Screenshot 2024-01-02 at 10.00.00'), true)
    assert.equal(isMeaninglessAlt('A screenshot of the dashboard'), false)
  })

  test('headings: a body h1, an empty heading and a skipped level — with the page context', () => {
    const body = '# Big\n\n## Fine\n\n#### Skips\n\n##\n\n### Fine again'
    const { issues } = analyzeContent(input({ docs: [doc({ slug: 'h', body })] }))
    assert.deepEqual(
      only(issues, 'heading').map((i) => [i.severity, i.message]),
      [
        ['warning', '“Big” is a second h1'],
        ['warning', 'Empty heading (h2)'],
        ['notice', 'Heading level jumps from h2 to h4'],
      ]
    )
    const firstH3 = analyzeContent(input({ docs: [doc({ slug: 'p', body: '### Starts low' })] }))
    assert.equal(only(firstH3.issues, 'heading').length, 1, 'a post starts under its h1')
    const glance = analyzeContent(
      input({
        docs: [
          doc({
            slug: 'w',
            kind: 'work',
            body: '### Starts low',
            frontmatter: { summary: 'Cut the sorting time in half.' },
          }),
        ],
      })
    )
    assert.equal(
      only(glance.issues, 'heading').length,
      0,
      'a case study with "At a glance" puts the body under an h2'
    )
    const clean = analyzeContent(
      input({ docs: [doc({ slug: 'ok', body: '## One\n\n### Two\n\n## Three' })] })
    )
    assert.equal(only(clean.issues, 'heading').length, 0)
  })

  test('hard breaks: runs (fixable), a stray backslash (warning), invisible breaks; one deliberate break is fine', () => {
    const body =
      'Won the award.\\\n\\\n\\\n![The team on stage](/uploads/a.jpg)\n\nends badly\\\n\nfirst  \nsecond\n\nan address\\\nline two'
    const { issues } = analyzeContent(input({ docs: [doc({ slug: 'b', body })] }))
    const hb = only(issues, 'hard-break')
      .map((i) => `${i.severity}:${i.fix?.type}`)
      .sort()
    assert.deepEqual(hb, [
      'notice:paragraph-breaks',
      'notice:visible-breaks',
      'warning:remove-backslash',
    ])
    const fine = analyzeContent(
      input({ docs: [doc({ slug: 'f', body: 'an address\\\nline two' })] })
    )
    assert.equal(only(fine.issues, 'hard-break').length, 0)
  })

  test('descriptions: duplicates, equal to the title, missing; pages are not judged', () => {
    const same = 'Exactly the same synthetic description used twice by the content health tests.'
    const docs = [
      doc({ slug: 'one', description: same }),
      doc({ slug: 'two', kind: 'work', description: `${same.toUpperCase()}  ` }),
      doc({ slug: 'three', title: 'Example Three', description: 'Example three.' }),
      doc({ slug: 'four', description: '' }),
      doc({ slug: 'five' }),
      { ...doc({ slug: 'now' }), key: 'page/now', kind: 'page' as const, description: '' },
    ]
    const { issues } = analyzeContent(input({ docs }))
    const d = only(issues, 'description')
      .map((i) => `${i.item}:${i.severity}:${i.message.split(' ')[0]}`)
      .sort()
    assert.deepEqual(d, [
      'blog/four:notice:No',
      'blog/one:warning:Same',
      'blog/three:notice:Description',
      'work/two:warning:Same',
    ])
  })

  test('an unreadable body is one MDX error and nothing else', () => {
    const { issues } = analyzeContent(
      input({ docs: [doc({ slug: 'bad', body: '<Callout>\nnever closed' })] })
    )
    assert.deepEqual(
      issues.map((i) => `${i.check}:${i.severity}`),
      ['mdx:error']
    )
  })

  test('the CV: visible URL fields of both languages, hidden ones skipped, with readable places', () => {
    const cert = (url: string, extra: Record<string, unknown> = {}) => ({
      certificationName: 'Example Cert',
      issuedDate: '2024-01',
      credentialURL: url,
      ...extra,
    })
    const section = (list: unknown[], extra: Record<string, unknown> = {}) => ({
      sessionName: 'certification',
      headerName: 'Certifications',
      certifications: [
        { issuingOrganization: 'Example Org', organizationURL: '', CertificationList: list },
      ],
      ...extra,
    })
    const cv = {
      version: 7,
      doc: {
        en: [
          section([
            cert('https://example.com/c1?utm_source=cv'),
            cert('https://example.com/c2?utm_source=cv', { isVisible: false }),
            cert('https://example.com/c3?utm_source=cv', { hiddenFields: ['credentialURL'] }),
          ]),
          section([cert('https://example.com/c4?utm_source=cv')], {
            isVisible: false,
            showOnWebsite: false,
          }),
        ],
        zh: [section([cert('https://example.com/c5?utm_source=cv')], { headerName: '证书' })],
      },
    }
    const { issues, items } = analyzeContent(input({ cv }))
    const t = only(issues, 'tracking')
    assert.deepEqual(t.map((i) => i.url).sort(), [
      'https://example.com/c1?utm_source=cv',
      'https://example.com/c5?utm_source=cv',
    ])
    assert.equal(
      t.find((i) => i.url?.includes('c1'))?.where,
      'EN · Certifications › Example Org › Example Cert › Credential URL'
    )
    assert.equal(
      t.find((i) => i.url?.includes('c5'))?.where,
      '中文 · 证书 › Example Org › Example Cert › Credential URL'
    )
    assert.equal(items.cv.version, 7)
    assert.equal(items.cv.editHref, '/admin/dashboard?tab=cv')
  })

  test('the home page: socials, brands, photos and highlights — switched-off parts skipped', () => {
    const home = {
      version: 3,
      doc: {
        hero: {
          welcome: '',
          brand: 'Example Person',
          tagline: '',
          avatarUrl: 'https://cdn.example.com/me.jpg',
        },
        socials: { github: 'https://github.com/example?utm_source=home' },
        brands: [
          {
            name: 'Example Org',
            href: 'https://example.org/?fbclid=1',
            image: '/images/brand/x.svg',
          },
        ],
        quickAccess: [],
        photos: [
          {
            url: '/uploads/p1.jpg',
            describe: 'Stage',
            redirectTo: 'https://example.com/p?gclid=1',
            visible: false,
          },
          {
            url: '/uploads/p2.jpg',
            describe: 'Lab',
            redirectTo: 'https://example.com/lab?gclid=2',
          },
        ],
        highlights: [{ value: '1st', label: 'Example award', href: '/work/missing' }],
        sections: { brands: false },
      },
    }
    const { issues } = analyzeContent(
      input({
        home,
        imageInfo: (src) => info({ kind: src.startsWith('/images/') ? 'static' : 'upload' }),
      })
    )
    const t = only(issues, 'tracking')
      .map((i) => i.where)
      .sort()
    assert.deepEqual(t, ['Field notes › Lab › Link', 'Socials › GitHub'])
    assert.equal(only(issues, 'remote-image')[0]?.where, 'Introduction › Portrait')
    assert.equal(only(issues, 'internal-link')[0]?.where, 'Highlights › 1st')
  })

  test('ids are stable across runs and differ per item', () => {
    const body = '[a](https://example.com/a?utm_source=x)'
    const a = analyzeContent(
      input({ docs: [doc({ slug: 'one', body }), doc({ slug: 'two', body })] })
    )
    const b = analyzeContent(
      input({
        docs: [
          doc({ slug: 'one', body: `Some new text first.\n\n${body}` }),
          doc({ slug: 'two', body }),
        ],
      })
    )
    const ids = (r: typeof a) =>
      only(r.issues, 'tracking')
        .map((i) => i.id)
        .sort()
    assert.deepEqual(ids(a), ids(b), 'moving the link down a few lines keeps its id')
    assert.equal(new Set(ids(a)).size, 2)
  })

  test('a moved link used several times keeps each occurrence’s own #fragment when fixed', async () => {
    const { applyToContent } = await import('../lib/contentHealth/apply')
    const body =
      '[a](https://moved.example.com/d#one)\n\n[b](https://moved.example.com/d#two)\n\n[c](https://moved.example.com/d)'
    const links = {
      'https://moved.example.com/d': record('https://moved.example.com/d', {
        outcome: 'moved',
        finalUrl: 'https://moved.example.com/new-d',
        safeMove: true,
      }),
    }
    const { issues } = analyzeContent(input({ docs: [doc({ slug: 'm', body })], links }))
    const moved = issues.find((i) => i.check === 'redirect')
    assert.ok(moved?.apply)
    const state = { body, doc: {} }
    assert.equal(applyToContent(moved.apply, state), true)
    assert.equal(
      state.body,
      '[a](https://moved.example.com/new-d#one)\n\n[b](https://moved.example.com/new-d#two)\n\n[c](https://moved.example.com/new-d)'
    )
  })

  test('applyToContent: field fixes check the stored value first', async () => {
    const { applyToContent } = await import('../lib/contentHealth/apply')
    const state = {
      body: '',
      doc: { link: 'https://example.com/x?utm_source=a' } as Record<string, any>,
    }
    const spec = {
      op: 'strip-tracking' as const,
      item: 'work/x',
      key: 'https://example.com/x?utm_source=a',
      place: { at: 'field' as const, path: ['link'], value: 'https://example.com/x?utm_source=a' },
    }
    assert.equal(applyToContent(spec, state), true)
    assert.equal(state.doc.link, 'https://example.com/x')
    assert.equal(applyToContent(spec, state), false, 'already changed: nothing to do')
  })
})

describe('panel helpers', () => {
  const issues: HealthIssue[] = [
    {
      id: 'tracking-1',
      check: 'tracking',
      severity: 'warning',
      item: 'blog/a',
      where: 'Line 3',
      line: 3,
      message: 'm',
      detail: 'd',
      fix: { type: 'strip-tracking' },
    },
    {
      id: 'heading-1',
      check: 'heading',
      severity: 'notice',
      item: 'blog/a',
      where: 'Line 1',
      line: 1,
      message: 'm',
      detail: 'd',
    },
    {
      id: 'broken-link-1',
      check: 'broken-link',
      severity: 'error',
      item: 'blog/b',
      where: 'Line 9',
      line: 9,
      message: 'm',
      detail: 'd',
    },
    {
      id: 'hard-break-1',
      check: 'hard-break',
      severity: 'notice',
      item: 'blog/b',
      where: 'Line 2',
      line: 2,
      message: 'm',
      detail: 'd',
      fix: { type: 'paragraph-breaks' },
    },
  ]
  const items = {
    'blog/a': {
      key: 'blog/a',
      kind: 'post' as const,
      title: 'Alpha',
      editHref: '/admin/blog/edit?slug=a',
      publicHref: '/blog/a',
      version: 1,
    },
    'blog/b': {
      key: 'blog/b',
      kind: 'post' as const,
      title: 'Beta',
      editHref: '/admin/blog/edit?slug=b',
      publicHref: '/blog/b',
      version: 1,
    },
  }

  test('grouping puts the item with errors first and sorts inside by severity', () => {
    const g = groupIssues(items, issues)
    assert.deepEqual(
      g.map((x) => x.item.key),
      ['blog/b', 'blog/a']
    )
    assert.deepEqual(
      g[1].issues.map((i) => i.severity),
      ['warning', 'notice']
    )
    assert.equal(countsLine(g[0].counts), '1 error · 1 notice')
  })

  test('filters, the bulk summary and the check menu', () => {
    assert.equal(filterIssues(issues, { severity: 'notice', check: '', item: '' }).length, 2)
    assert.equal(
      filterIssues(issues, { severity: null, check: 'tracking', item: 'blog/a' }).length,
      1
    )
    assert.deepEqual(
      fixSummary(issues).map((s) => s.text),
      [
        'Strip tracking parameters from 1 link',
        'Turn empty line breaks into paragraph breaks in 1 item',
      ]
    )
    assert.deepEqual(
      checkOptions({ heading: 2, 'broken-link': 1 }).map((o) => o.check),
      ['broken-link', 'heading']
    )
  })

  test('shortUrl and the link status line', () => {
    assert.equal(shortUrl('https://example.com/a/'), 'example.com/a')
    assert.equal(shortUrl(`https://example.com/${'x'.repeat(200)}`, 40).length, 40)
    const rel = (ms: number) => `@${ms}`
    assert.equal(
      linkStatusLine(
        {
          running: true,
          progress: { done: 3, total: 9 },
          lastRun: null,
          nextAt: null,
          intervalHours: 24,
          total: 9,
          checked: 0,
        },
        rel
      ),
      'Checking 3 of 9…'
    )
    assert.equal(
      linkStatusLine(
        {
          running: false,
          progress: null,
          lastRun: {
            trigger: 'manual',
            startedAt: 1,
            finishedAt: 2,
            checked: 4,
            skipped: 0,
            partial: false,
            error: null,
          },
          nextAt: 5,
          intervalHours: 24,
          total: 6,
          checked: 4,
        },
        rel
      ),
      'Checked @2 · 2 not checked yet · next @5'
    )
  })
})

// ── Schedule ───────────────────────────────────────────────────────────────

describe('schedule', () => {
  test('interval parsing and the first run after boot', () => {
    assert.equal(linkCheckIntervalHours(undefined), 24)
    assert.equal(linkCheckIntervalHours('0'), 0)
    assert.equal(linkCheckIntervalHours('2'), 6)
    assert.equal(linkCheckIntervalHours('999'), 168)
    assert.equal(linkCheckIntervalHours('nope'), 24)
    const day = 86_400_000
    assert.equal(firstLinkCheckDelay(null, day, 0, 0), 10 * 60_000)
    assert.equal(firstLinkCheckDelay(null, day, 0, 1), 20 * 60_000)
    assert.equal(
      firstLinkCheckDelay(1000, day, 1000 + 3_600_000, 0),
      day - 3_600_000,
      'waits out the interval since the last run'
    )
  })

  test('runs, then reschedules a day later; a failure retries sooner; stop() cancels', async () => {
    const timers: Array<{ fn: () => void; ms: number }> = []
    let runs = 0
    let fail = false
    const handle = startLinkCheckSchedule({
      intervalHours: 24,
      setTimeoutFn: (fn, ms) => {
        timers.push({ fn, ms })
        return timers.length
      },
      clearTimeoutFn: () => undefined,
      random: () => 0,
      now: () => 0,
      lastFinishedAt: () => null,
      run: async () => {
        runs++
        if (fail) throw new Error('down')
      },
    })
    assert.equal(timers[0].ms, 10 * 60_000)
    timers[0].fn()
    await new Promise((r) => setImmediate(r))
    assert.equal(runs, 1)
    assert.equal(timers[1].ms, 24 * 3_600_000)
    fail = true
    timers[1].fn()
    await new Promise((r) => setImmediate(r))
    assert.equal(timers[2].ms, 2 * 3_600_000)
    handle.stop()
  })
})

// ── API (real handlers, throw-away store) ──────────────────────────────────

type Handler = (req: any, res: any) => unknown
let api: Handler
let internalApi: Handler
let putItem: (c: string, slug: string, fm: Record<string, any>, body: string) => Promise<unknown>
let closeDb: () => void
let closeAuthDb: () => void
let sessionId = ''

type MockRes = {
  statusCode: number
  headers: Record<string, string>
  body: any
  revalidated: string[]
}

let ip = 0
async function call(
  handler: Handler,
  opts: { method?: string; query?: Record<string, any>; body?: any; auth?: boolean } = {}
): Promise<MockRes> {
  const token = jwt.sign(
    { role: 'admin', email: 'owner@example.test', sid: sessionId },
    'admin-ops-health-secret',
    { algorithm: 'HS256' }
  )
  ip++
  const auth = opts.auth !== false
  const req = {
    method: opts.method || 'GET',
    url: '/api/admin/content-health',
    query: opts.query || {},
    body: opts.body,
    cookies: auth ? { cv_admin_token: token } : {},
    headers: auth ? { cookie: `cv_admin_token=${token}` } : {},
    socket: { remoteAddress: `127.0.1.${(ip % 250) + 1}` },
  }
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined, revalidated: [] }
  let ended = false
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(code: number) {
      out.statusCode = code
    },
    get headersSent() {
      return ended
    },
    get writableEnded() {
      return ended
    },
    status(code: number) {
      out.statusCode = code
      return res
    },
    setHeader(name: string, value: any) {
      out.headers[name.toLowerCase()] = String(value)
      return res
    },
    getHeader(name: string) {
      return out.headers[name.toLowerCase()]
    },
    json(body: any) {
      out.body = JSON.parse(JSON.stringify(body))
      ended = true
      return res
    },
    send(body: any) {
      out.body = body
      ended = true
      return res
    },
    end() {
      ended = true
      return res
    },
    async revalidate(p: string) {
      out.revalidated.push(p)
    },
  }
  await handler(req, res)
  return out
}

const report = async () =>
  (await call(api)).body as import('../lib/contentHealth/types').HealthReport
const issueOf = (
  r: import('../lib/contentHealth/types').HealthReport,
  item: string,
  check: string
) => r.issues.find((i) => i.item === item && i.check === check)

describe('API', () => {
  before(async () => {
    assert.equal(process.cwd(), fs.realpathSync(tmp), 'the store must be the temp one')
    api = (await import('../pages/api/admin/content-health')).default
    internalApi = (await import('../pages/api/internal/content-health')).default
    putItem = (await import('../lib/contentStore')).putItem
    closeDb = (await import('../lib/db')).closeDb
    closeAuthDb = (await import('../lib/adminAuth/db')).closeAuthDb
    const { createSession } = await import('../lib/adminAuth/sessions')
    sessionId = createSession({
      method: 'password',
      ttlMs: 3_600_000,
      device: null,
      ipPrefix: null,
      country: null,
    }).id
    const wide = await sharp({
      create: { width: 1400, height: 700, channels: 3, background: '#3355aa' },
    })
      .jpeg()
      .toBuffer()
    fs.writeFileSync(path.join(tmp, 'public', 'uploads', 'example-wide.jpg'), wide)
    await putItem(
      'blog',
      'health-one',
      {
        title: 'Example health post',
        date: '2026-10-01',
        description:
          'A synthetic post for the content health API tests, with a few fixable problems.',
      },
      [
        '## Links',
        '',
        'Read [the guide](https://example.com/guide?utm_source=newsletter&id=7) and [the draft](/blog/health-draft).',
        '',
        'Won the award.\\',
        '\\',
        '\\',
        '![The example banner](/uploads/example-wide.jpg)',
        '',
        '![example-wide.jpg](/uploads/example-wide.jpg)',
      ].join('\n')
    )
    await putItem(
      'blog',
      'health-draft',
      { title: 'Example draft', date: '2026-10-02', draft: true },
      'Not published.'
    )
  })

  after(() => {
    closeDb()
    closeAuthDb()
  })

  test('admin only', async () => {
    assert.equal((await call(api, { auth: false })).statusCode, 401)
    assert.equal(
      (await call(api, { auth: false, method: 'POST', body: { action: 'check-links' } }))
        .statusCode,
      401
    )
  })

  test('GET: the report covers published items only, with versions and counts; summary and link status', async () => {
    const res = await call(api)
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['cache-control'], 'no-store')
    const r = res.body as import('../lib/contentHealth/types').HealthReport
    assert.ok(r.items['blog/health-one'])
    assert.equal(r.items['blog/health-draft'], undefined, 'drafts are not reported')
    assert.ok(r.items['blog/health-one'].version > 0)
    assert.ok(issueOf(r, 'blog/health-one', 'tracking')?.fix)
    assert.equal(issueOf(r, 'blog/health-one', 'internal-link')?.severity, 'warning')
    assert.equal(issueOf(r, 'blog/health-one', 'image-srcset')?.fix?.type, 'generate-variants')
    assert.ok(issueOf(r, 'blog/health-one', 'image-alt'))
    assert.ok(
      r.issues.every((i: any) => i.apply === undefined),
      'apply specs never leave the server'
    )
    assert.equal(r.counts.error + r.counts.warning + r.counts.notice, r.issues.length)
    const summary = await call(api, { query: { summary: '1' } })
    assert.equal(summary.statusCode, 200)
    assert.equal(typeof summary.body.links.unverifiable, 'number')
    assert.equal(summary.body.issues, undefined)
    const links = await call(api, { query: { links: '1' } })
    assert.equal(links.body.running, false)
  })

  test('POST fix: a stale version is 409 and nothing is written', async () => {
    const r = await report()
    const issue = issueOf(r, 'blog/health-one', 'tracking') as HealthIssue
    const res = await call(api, {
      method: 'POST',
      body: { action: 'fix', fixes: [{ id: issue.id, version: 1 }] },
    })
    assert.equal(res.statusCode, 409)
    assert.equal(res.body.results[0].code, 'VERSION_CONFLICT')
    assert.match(res.body.error, /changed since the report was loaded/)
    assert.ok(issueOf(await report(), 'blog/health-one', 'tracking'), 'still there')
  })

  test('POST fix: strips tracking through the editor save path (snapshot, revalidation)', async () => {
    const r = await report()
    const issue = issueOf(r, 'blog/health-one', 'tracking') as HealthIssue
    const res = await call(api, {
      method: 'POST',
      body: {
        action: 'fix',
        fixes: [{ id: issue.id, version: r.items['blog/health-one'].version }],
      },
    })
    assert.equal(res.statusCode, 200, JSON.stringify(res.body))
    assert.equal(res.body.applied, 1)
    assert.ok(res.revalidated.includes('/blog/health-one'))
    assert.ok(res.body.revalidated.includes('/blog'))
    const { getItem } = await import('../lib/contentStore')
    const body = getItem('blog', 'health-one')?.body || ''
    assert.match(body, /\(https:\/\/example\.com\/guide\?id=7\)/)
    assert.ok(!body.includes('utm_source'))
    const snaps = fs
      .readdirSync(path.join(tmp, 'data', 'blog_snapshots'))
      .filter((f) => f.startsWith('health-one_'))
    assert.equal(snaps.length, 1, 'the version before the fix is in the history')
    assert.equal(issueOf(await report(), 'blog/health-one', 'tracking'), undefined)
    const again = await call(api, {
      method: 'POST',
      body: { action: 'fix', fixes: [{ id: issue.id }] },
    })
    assert.equal(again.statusCode, 409, 'nothing left to fix')
    assert.equal(again.body.results[0].code, 'GONE')
  })

  test('POST fix: hard breaks become a paragraph break; an issue without a fix is refused', async () => {
    const r = await report()
    const breaks = issueOf(r, 'blog/health-one', 'hard-break') as HealthIssue
    const alt = issueOf(r, 'blog/health-one', 'image-alt') as HealthIssue
    const version = r.items['blog/health-one'].version
    const res = await call(api, {
      method: 'POST',
      body: { action: 'fix', fixes: [{ id: breaks.id, version }] },
    })
    assert.equal(res.statusCode, 200, JSON.stringify(res.body))
    const { getItem } = await import('../lib/contentStore')
    assert.match(
      getItem('blog', 'health-one')?.body || '',
      /Won the award\.\n\n!\[The example banner\]/
    )
    const noFix = await call(api, {
      method: 'POST',
      body: { action: 'fix', fixes: [{ id: alt.id }] },
    })
    assert.equal(noFix.statusCode, 422)
    assert.equal(noFix.body.results[0].code, 'NO_FIX')
  })

  test('POST fix: responsive sizes through the media-optimize pipeline', async () => {
    const r = await report()
    const sizes = issueOf(r, 'blog/health-one', 'image-srcset') as HealthIssue
    const res = await call(api, {
      method: 'POST',
      body: { action: 'fix', fixes: [{ id: sizes.id }] },
    })
    assert.equal(res.statusCode, 200, JSON.stringify(res.body))
    for (const w of [640, 1280])
      assert.ok(fs.existsSync(path.join(tmp, 'public', 'uploads', `example-wide.jpg.w${w}.webp`)))
    assert.ok(
      res.revalidated.includes('/blog/health-one'),
      'the page with the image is regenerated'
    )
    assert.equal(issueOf(await report(), 'blog/health-one', 'image-srcset'), undefined)
  })

  test('POST fix: the CV and the home page through their own save paths', async () => {
    const { writeCvData } = await import('../lib/cvdata')
    const { writeHome } = await import('../lib/home')
    await writeCvData({
      en: [
        {
          sessionName: 'certification',
          headerName: 'Certifications',
          certifications: [
            {
              issuingOrganization: 'Example Org',
              organizationURL: '',
              CertificationList: [
                {
                  certificationName: 'Example Cert',
                  issuedDate: '2024-01',
                  credentialURL: 'https://example.com/cert?utm_source=cv&id=1',
                },
              ],
            },
          ],
        },
      ],
      zh: [],
    })
    await writeHome({
      hero: { welcome: '', brand: 'Example Person', tagline: '', avatarUrl: '' },
      socials: { github: 'https://github.com/example?utm_source=home' },
      brands: [],
      quickAccess: [],
    } as any)
    const r = await report()
    const cv = issueOf(r, 'cv', 'tracking') as HealthIssue
    const home = issueOf(r, 'home', 'tracking') as HealthIssue
    assert.equal(cv.where, 'EN · Certifications › Example Org › Example Cert › Credential URL')
    const res = await call(api, {
      method: 'POST',
      body: {
        action: 'fix',
        fixes: [
          { id: cv.id, version: r.items.cv.version },
          { id: home.id, version: r.items.home.version },
        ],
      },
    })
    assert.equal(res.statusCode, 200, JSON.stringify(res.body))
    assert.equal(res.body.applied, 2)
    const { readCvData } = await import('../lib/cvdata')
    const { readHome } = await import('../lib/home')
    assert.equal(
      readCvData().en[0].certifications[0].CertificationList[0].credentialURL,
      'https://example.com/cert?id=1'
    )
    assert.equal(readHome()?.socials.github, 'https://github.com/example')
    assert.ok(res.revalidated.includes('/cv') && res.revalidated.includes('/'))
    assert.ok(fs.readdirSync(path.join(tmp, 'data', 'cv_snapshots')).length >= 1)
    assert.ok(fs.readdirSync(path.join(tmp, 'data', 'home_snapshots')).length >= 1)
  })

  test('import fix: a remote image is stored as an upload and the body points at it (download injected)', async () => {
    await putItem(
      'blog',
      'health-remote',
      {
        title: 'Example remote image',
        date: '2026-10-03',
        description: 'A synthetic post that hot-links an image, for the import fix test.',
      },
      '![A blue square](https://cdn.example.com/blue.png)'
    )
    const { applyFixes } = await import('../lib/contentHealth/apply')
    const { buildReport } = await import('../lib/contentHealth/collect')
    const r = buildReport()
    const remote = issueOf(r, 'blog/health-remote', 'remote-image') as HealthIssue
    assert.equal(remote.fix?.type, 'import-image')
    const res = { revalidate: async () => undefined } as any
    const silent = {
      debug() {},
      info() {},
      warn() {},
      error() {},
      child() {
        return silent
      },
    } as any
    const out = await applyFixes(
      res,
      [{ id: remote.id, version: r.items['blog/health-remote'].version }],
      {
        log: silent,
        generateVariants: async () => ({ done: new Set(), errors: [], busy: false, paths: [] }),
        importImage: async (url) => {
          assert.equal(url, 'https://cdn.example.com/blue.png')
          return '/uploads/blue-imported.png'
        },
      }
    )
    assert.equal(out.applied, 1)
    const { getItem } = await import('../lib/contentStore')
    assert.equal(
      getItem('blog', 'health-remote')?.body,
      '![A blue square](/uploads/blue-imported.png)'
    )
  })

  test('check-links: starts in the background (202), refuses a second run (409), and the internal route is hidden', async () => {
    const { runLinkCheck } = await import('../lib/contentHealth/linkRunner')
    let release: () => void = () => undefined
    const blocked = new Promise<void>((r) => (release = r))
    const running = runLinkCheck('manual', {
      urls: ['https://example.com/slow'],
      minGapMs: 0,
      fetchHop: async () => {
        await blocked
        return { status: 200, location: null, headers: {} }
      },
    })
    const busy = await call(api, { method: 'POST', body: { action: 'check-links' } })
    assert.equal(busy.statusCode, 409)
    assert.equal(busy.body.links.running, true)
    release()
    const done = await running
    assert.equal(done.checked, 1)
    const { readLinkStore } = await import('../lib/contentHealth/linkStore')
    assert.equal(readLinkStore().links['https://example.com/slow']?.outcome, 'ok')
    assert.equal(readLinkStore().lastRun?.trigger, 'manual')
    const hidden = await call(internalApi, { method: 'POST', body: {} })
    assert.equal(hidden.statusCode, 404)
    const bad = await call(api, { method: 'POST', body: { action: 'fix', fixes: 'all' } })
    assert.equal(bad.statusCode, 400)
  })
})

after(() => {
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})
