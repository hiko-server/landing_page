/**
 * OPS-1 (wave 2A review) — after a deploy, no edge may keep serving the
 * previous build's HTML, which cannot hydrate against the new image:
 *
 *   - scripts/edge-purge.mjs: purge_everything with the app's own
 *     CF_ZONE_ID + CF_API_TOKEN, else the cacheable URLs in batches of 30;
 *   - lib/edgeHtmlTtl.ts (through the HTML header hook): Cloudflare keeps an
 *     HTML page at most 5 minutes, whatever its ISR window;
 *   - scripts/static-archive.mjs: earlier builds' /_next/static files stay
 *     served for a week;
 *   - scripts/deploy.sh: purge after the switch, then check the build id the
 *     origin and the edge serve.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import {
  EXIT,
  PURGE_BATCH_SIZE,
  fallbackUrls,
  main as purgeMain,
  publicHost,
  purgeConfig,
  purgeEdge,
  sitemapPaths,
} from '../scripts/edge-purge.mjs'
import { keepDays, syncStaticArchive } from '../scripts/static-archive.mjs'
import { CACHEABLE_EXACT_PATHS } from '../scripts/cloudflare-config.mjs'
import { EDGE_CACHE_HEADER, EDGE_HTML_MAX_AGE_S, edgeHtmlCacheControl } from '../lib/edgeHtmlTtl'
import { installHtmlNoTransform } from '../lib/htmlNoTransform'
import { PROFILE_REVALIDATE_SECONDS } from '../lib/isr'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w2f-edge-'))
after(() => fs.rmSync(tmp, { recursive: true, force: true }))

// ── scripts/edge-purge.mjs ────────────────────────────────────────────────

const ENV = {
  CF_ZONE_ID: 'zone0123456789abcdef',
  CF_API_TOKEN: 'test-token-not-real',
  SITE_URL: 'https://example.com',
}

type Sent = { url: string; auth: string; body: any }
function fakeCloudflare(answer: (body: any) => { status: number; json: unknown }) {
  const sent: Sent[] = []
  const fetchFn = async (url: string, init: any) => {
    const body = JSON.parse(init.body)
    sent.push({ url, auth: init.headers.Authorization, body })
    const a = answer(body)
    return new Response(JSON.stringify(a.json), { status: a.status })
  }
  return { sent, fetchFn: fetchFn as unknown as typeof fetch }
}

test('edge-purge: the same credentials and host rules as the app', () => {
  assert.deepEqual(purgeConfig(ENV), { zoneId: ENV.CF_ZONE_ID, apiToken: ENV.CF_API_TOKEN })
  assert.equal(purgeConfig({ CF_ZONE_ID: 'z' }), null)
  assert.equal(purgeConfig({ CF_ZONE_ID: ' ', CF_API_TOKEN: 't' }), null)
  assert.equal(publicHost({ SITE_URL: 'https://Example.com/' }), 'example.com')
  assert.equal(
    publicHost({ SITE_URL: 'http://127.0.0.1:3000', NEXT_PUBLIC_SITE_HOST: 'example.org' }),
    'example.org'
  )
  assert.equal(publicHost({ SITE_URL: 'http://localhost:3000' }), null)
  assert.equal(publicHost({}), null)
})

test('edge-purge: one purge_everything request with the bearer token when Cloudflare accepts it', async () => {
  const cf = fakeCloudflare(() => ({ status: 200, json: { success: true, errors: [] } }))
  let sitemapRead = false
  const r = await purgeEdge({
    env: ENV,
    fetchFn: cf.fetchFn,
    sitemap: async () => {
      sitemapRead = true
      return ''
    },
  })
  assert.deepEqual(r, { status: 'purged', method: 'everything', urls: 0, errors: [] })
  assert.equal(cf.sent.length, 1)
  assert.equal(
    cf.sent[0].url,
    `https://api.cloudflare.com/client/v4/zones/${ENV.CF_ZONE_ID}/purge_cache`
  )
  assert.equal(cf.sent[0].auth, `Bearer ${ENV.CF_API_TOKEN}`)
  assert.deepEqual(cf.sent[0].body, { purge_everything: true })
  assert.equal(sitemapRead, false, 'the sitemap is only needed for the fallback')
})

test('edge-purge: when purge_everything is refused, every cacheable page and the sitemap pages by URL, 30 at a time', async () => {
  const cf = fakeCloudflare((body) =>
    body.purge_everything
      ? {
          status: 403,
          json: { success: false, errors: [{ code: 10000, message: 'Authentication error' }] },
        }
      : { status: 200, json: { success: true } }
  )
  const posts = Array.from({ length: 40 }, (_, i) => `https://example.com/blog/post-${i}`)
  const sitemap = [
    '<?xml version="1.0"?><urlset>',
    ...posts.map((u) => `<url><loc>${u}</loc></url>`),
    '<url><loc>https://example.com/work/case-a</loc></url>',
    '<url><loc>https://example.com/about</loc></url>',
    '<url><loc>https://elsewhere.example/blog/x</loc></url>',
    '<url><loc>https://example.com/admin</loc></url>',
    '</urlset>',
  ].join('')
  const r = await purgeEdge({ env: ENV, fetchFn: cf.fetchFn, sitemap: async () => sitemap })
  assert.equal(r.status, 'purged')
  assert.equal(r.method, 'urls')
  assert.match(r.errors[0], /purge_everything refused \(HTTP 403: 10000 Authentication error\)/)
  const files = cf.sent.slice(1).flatMap((s) => s.body.files as string[])
  assert.ok(cf.sent.slice(1).every((s) => s.body.files.length <= PURGE_BATCH_SIZE))
  for (const p of CACHEABLE_EXACT_PATHS) assert.ok(files.includes(`https://example.com${p}`), p)
  for (const u of posts) assert.ok(files.includes(u), u)
  assert.ok(files.includes('https://example.com/work/case-a'))
  assert.ok(!files.some((f) => f.includes('elsewhere') || f.endsWith('/admin')))
  assert.equal(new Set(files).size, files.length, 'no URL twice')
  assert.equal(r.urls, files.length)
})

test('edge-purge: not configured → nothing sent (exit 3); a failure is reported, never thrown', async () => {
  const cf = fakeCloudflare(() => ({ status: 200, json: { success: true } }))
  assert.deepEqual(
    await purgeEdge({ env: { SITE_URL: 'https://example.com' }, fetchFn: cf.fetchFn }),
    {
      status: 'skipped',
      method: null,
      urls: 0,
      errors: [],
    }
  )
  assert.equal((await purgeEdge({ env: ENV, fetchFn: cf.fetchFn, dryRun: true })).status, 'dry-run')
  assert.equal(cf.sent.length, 0)

  const down = (async () => {
    throw new Error('getaddrinfo ENOTFOUND api.cloudflare.com')
  }) as unknown as typeof fetch
  const failed = await purgeEdge({ env: ENV, fetchFn: down, sitemap: async () => '' })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.urls, 0)
  assert.ok(failed.errors.some((e) => /ENOTFOUND/.test(e)))

  const refused = fakeCloudflare(() => ({ status: 403, json: { success: false } }))
  const noHost = await purgeEdge({ env: { ...ENV, SITE_URL: '' }, fetchFn: refused.fetchFn })
  assert.equal(noHost.status, 'failed')
  assert.match(noHost.errors.join(' '), /no public host/)

  const logs: string[] = []
  const prev = console.log
  console.log = (m: string) => logs.push(m)
  try {
    assert.equal(await purgeMain([], { SITE_URL: 'https://example.com' }), EXIT.skipped)
    assert.equal(await purgeMain(['--dry-run'], ENV), EXIT.purged)
  } finally {
    console.log = prev
  }
  assert.ok(logs.some((l) => /not configured/.test(l)))
  assert.ok(!logs.join('\n').includes(ENV.CF_API_TOKEN), 'the token is never printed')
})

test('edge-purge: sitemap paths keep only cacheable pages of the site', () => {
  assert.deepEqual(
    sitemapPaths(
      '<loc>https://example.com/</loc><loc> https://example.com/now </loc><loc>https://example.com/cv.pdf</loc><loc>nope</loc>',
      'example.com'
    ),
    ['/', '/now']
  )
  assert.deepEqual(fallbackUrls('example.com', ['/blog/a', '/']).slice(-1), [
    'https://example.com/blog/a',
  ])
})

// ── lib/edgeHtmlTtl.ts + the HTML header hook ─────────────────────────────

test('edge TTL: HTML longer-lived than 5 minutes at the edge is capped; short-lived and private pages are not', () => {
  const capped = `max-age=${EDGE_HTML_MAX_AGE_S}, stale-if-error=86400`
  assert.equal(edgeHtmlCacheControl('s-maxage=3600, stale-while-revalidate=82800'), capped)
  assert.equal(edgeHtmlCacheControl('s-maxage=31536000'), capped, '/colophon (revalidate: false)')
  assert.equal(edgeHtmlCacheControl('public, max-age=600'), capped)
  assert.equal(edgeHtmlCacheControl('s-maxage=300, stale-while-revalidate=86100'), null, '/contact')
  assert.equal(edgeHtmlCacheControl('s-maxage=60, stale-while-revalidate=86340'), null, '/cv')
  assert.equal(
    edgeHtmlCacheControl('private, no-cache, no-store, max-age=0, must-revalidate'),
    null
  )
  assert.equal(edgeHtmlCacheControl('no-store'), null)
  assert.equal(edgeHtmlCacheControl(''), null)
  assert.equal(edgeHtmlCacheControl(undefined), null)
  // The pages whose ISR window is longer than the cap are the ones it is for.
  assert.ok(PROFILE_REVALIDATE_SECONDS > EDGE_HTML_MAX_AGE_S)
})

let server: http.Server
let base = ''
before(async () => {
  installHtmlNoTransform()
  server = http.createServer((req, res) => {
    const html = () => res.setHeader('Content-Type', 'text/html; charset=utf-8')
    switch (req.url) {
      case '/home':
        html()
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=82800')
        return res.end('<!doctype html>')
      case '/cv':
        html()
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=86340')
        return res.end('<!doctype html>')
      case '/write-head':
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Cache-Control': 's-maxage=31536000',
        })
        return res.end('<!doctype html>')
      case '/json':
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 's-maxage=3600')
        return res.end('{}')
      case '/own':
        html()
        res.setHeader('Cache-Control', 's-maxage=3600')
        res.setHeader(EDGE_CACHE_HEADER, 'max-age=10')
        return res.end('<!doctype html>')
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => new Promise<void>((r) => server.close(() => r())))

test('the HTML header hook sends Cloudflare-CDN-Cache-Control and keeps the origin policy (plus no-transform)', async () => {
  const get = (p: string) => fetch(`${base}${p}`)
  const home = await get('/home')
  assert.equal(
    home.headers.get('cache-control'),
    's-maxage=3600, stale-while-revalidate=82800, no-transform'
  )
  assert.equal(
    home.headers.get('cloudflare-cdn-cache-control'),
    'max-age=300, stale-if-error=86400'
  )
  const viaWriteHead = await get('/write-head')
  assert.equal(
    viaWriteHead.headers.get('cloudflare-cdn-cache-control'),
    'max-age=300, stale-if-error=86400'
  )
  assert.equal(viaWriteHead.headers.get('cache-control'), 's-maxage=31536000, no-transform')
  assert.equal((await get('/cv')).headers.get('cloudflare-cdn-cache-control'), null)
  assert.equal((await get('/json')).headers.get('cloudflare-cdn-cache-control'), null, 'HTML only')
  assert.equal(
    (await get('/own')).headers.get('cloudflare-cdn-cache-control'),
    'max-age=10',
    'never overrides one already set'
  )
})

// ── scripts/static-archive.mjs ────────────────────────────────────────────

function writeBuild(dir: string, id: string, chunks: Record<string, string>) {
  fs.rmSync(dir, { recursive: true, force: true })
  const files: Record<string, string> = {
    [`${id}/_buildManifest.js`]: `self.__BUILD_MANIFEST_${id}=1`,
    [`${id}/_ssgManifest.js`]: `self.__SSG_${id}=1`,
    ...chunks,
  }
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), body)
  }
}
const listed = (dir: string): string[] => {
  const out: string[] = []
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(r)
      else out.push(r)
    }
  }
  walk('')
  return out.sort()
}

test("static archive: a new build also serves the previous build's assets, never replacing its own", () => {
  const staticDir = path.join(tmp, 'app', '.next', 'static')
  const archiveDir = path.join(tmp, 'archive')
  const day = 86_400_000
  const t0 = Date.UTC(2026, 9, 20, 9)

  writeBuild(staticDir, 'buildA', {
    'chunks/framework-aaaa1111.js': 'framework',
    'chunks/pages/index-aaaa2222.js': 'index A',
    'css/aaaa3333.css': 'css A',
  })
  const first = syncStaticArchive({ staticDir, archiveDir, now: t0, days: 7 })
  assert.deepEqual(first, { archived: 5, pruned: 0, restored: 0, restoredBytes: 0 })

  // The next deploy: a new image with its own files (one chunk unchanged).
  writeBuild(staticDir, 'buildB', {
    'chunks/framework-aaaa1111.js': 'framework',
    'chunks/pages/index-bbbb2222.js': 'index B',
    'css/bbbb3333.css': 'css B',
  })
  const second = syncStaticArchive({ staticDir, archiveDir, now: t0 + day, days: 7 })
  assert.equal(second.archived, 4)
  assert.equal(second.restored, 4, "build A's manifests, page chunk and CSS")
  assert.deepEqual(listed(staticDir), [
    'buildA/_buildManifest.js',
    'buildA/_ssgManifest.js',
    'buildB/_buildManifest.js',
    'buildB/_ssgManifest.js',
    'chunks/framework-aaaa1111.js',
    'chunks/pages/index-aaaa2222.js',
    'chunks/pages/index-bbbb2222.js',
    'css/aaaa3333.css',
    'css/bbbb3333.css',
  ])
  assert.equal(
    fs.readFileSync(path.join(staticDir, 'chunks/pages/index-bbbb2222.js'), 'utf8'),
    'index B'
  )

  // A restart of build B a week and more later: build A's own files expire,
  // the shared framework chunk stays (build B still uses it).
  writeBuild(staticDir, 'buildB', {
    'chunks/framework-aaaa1111.js': 'framework',
    'chunks/pages/index-bbbb2222.js': 'index B',
    'css/bbbb3333.css': 'css B',
  })
  const later = syncStaticArchive({ staticDir, archiveDir, now: t0 + 9 * day, days: 7 })
  assert.equal(later.pruned, 4)
  assert.equal(later.restored, 0)
  assert.ok(!fs.existsSync(path.join(archiveDir, 'buildA')), 'empty directories go too')
  assert.ok(fs.existsSync(path.join(archiveDir, 'chunks/framework-aaaa1111.js')))

  // No .next/static (a dev checkout): nothing happens.
  assert.deepEqual(
    syncStaticArchive({ staticDir: path.join(tmp, 'missing'), archiveDir, now: t0 }),
    { archived: 0, pruned: 0, restored: 0, restoredBytes: 0 }
  )
})

test('static archive: STATIC_ARCHIVE_DAYS is whole days 1–90; the CLI never fails the start-up', () => {
  assert.equal(keepDays(undefined), 7)
  assert.equal(keepDays(''), 7)
  assert.equal(keepDays('14'), 14)
  assert.equal(keepDays('0'), 1)
  assert.equal(keepDays('365'), 90)
  assert.equal(keepDays('1.5'), 7)
  // An archive that cannot be created (a file in the way) only logs.
  const blocked = path.join(tmp, 'blocked')
  fs.writeFileSync(blocked, 'not a directory')
  const staticDir = path.join(tmp, 'cli-static')
  writeBuild(staticDir, 'buildC', { 'chunks/c-cccc.js': 'c' })
  const out = execFileSync(
    process.execPath,
    ['scripts/static-archive.mjs', '--static', staticDir, '--archive', path.join(blocked, 'sub')],
    { encoding: 'utf8' }
  )
  assert.match(out, /\[static-archive\] skipped: /)
  const ok = execFileSync(
    process.execPath,
    [
      'scripts/static-archive.mjs',
      '--static',
      staticDir,
      '--archive',
      path.join(tmp, 'cli-archive'),
    ],
    { encoding: 'utf8' }
  )
  assert.match(
    ok,
    /\[static-archive\] kept 0 asset\(s\) of earlier builds \(0 KB\); archived 3 new, expired 0/
  )
})

test('the image creates the archive owned by the app user, mounts it as a volume and runs it before the server', () => {
  const dockerfile = read('Dockerfile')
  assert.match(dockerfile, /mkdir -p \.next \/app\/data \/app\/next-static-archive/)
  assert.match(dockerfile, /chown nextjs:nodejs \.next \/app\/data \/app\/next-static-archive/)
  assert.match(dockerfile, /test -f \/app\/scripts\/static-archive\.mjs/)
  assert.match(dockerfile, /test -f \/app\/scripts\/edge-purge\.mjs/)
  assert.match(dockerfile, /test -f \/app\/\.next\/BUILD_ID/)
  const compose = read('docker-compose.yml')
  assert.match(compose, /- landing-static-archive:\/app\/next-static-archive/)
  assert.match(compose, /^ {2}landing-static-archive:$/m)
  const entry = read('docker-entrypoint.sh')
  const archive = entry.indexOf('node /app/scripts/static-archive.mjs\n')
  assert.ok(
    archive > 0 && archive < entry.indexOf('exec node /app/server.js'),
    'before the server lists .next/static'
  )
  assert.doesNotMatch(entry, /static-archive\.mjs &/, 'not in the background')
})

// ── scripts/deploy.sh ─────────────────────────────────────────────────────

const deploy = () => read('scripts/deploy.sh')
const fn = (sh: string, name: string) => {
  const m = sh.match(
    new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}$|^${name}\\(\\) \\{[^\\n]*\\}$`, 'm')
  )
  assert.ok(m, `${name}() present`)
  return m[0]
}

test('deploy.sh parses (bash -n) and purges after the switch, before the smoke test', () => {
  execFileSync('bash', ['-n', 'scripts/deploy.sh'])
  const sh = deploy()
  const remote = sh.match(/^ {2}cat <<'REMOTE'\n([\s\S]*?)\nREMOTE$/m)?.[1]
  assert.ok(remote)
  const edgeMode = remote.match(/^ {2}edge\)[^\n]*\n([\s\S]*?)\n {4};;$/m)?.[1]
  assert.ok(edgeMode, 'remote edge mode')
  assert.match(edgeMode, /docker exec "\$CONTAINER" cat \/app\/\.next\/BUILD_ID/)
  assert.match(
    edgeMode,
    /docker exec "\$CONTAINER" node \/app\/scripts\/edge-purge\.mjs \|\| rc=\$\?/
  )
  const activate = sh.indexOf('run activate')
  const purge = sh.indexOf('edge_out=$(run edge 2>&1)')
  const smoke = sh.indexOf('log "smoke test via $DEPLOY_SITE_URL"')
  assert.ok(activate > 0 && purge > activate && smoke > purge, 'activate → purge → smoke')
  // The cache-busting / must carry the new build id (else: rollback)…
  assert.match(
    sh,
    /origin_id=\$\(curl [^\n]*"\$DEPLOY_SITE_URL\/\?deploy=\$TS"[^\n]*\| html_build_id/
  )
  assert.match(sh, /\[ "\$origin_id" = "\$BUILD_ID" \] \|\| smoke_failed=/)
  // …and the edge is asked without a query string.
  assert.match(sh, /edge_state=\$\(edge_build_check \/ "\$BUILD_ID"\)/)
  assert.match(fn(sh, 'edge_build_check'), /"\$DEPLOY_SITE_URL\$1"/)
})

test('deploy.sh helpers: build id from HTML, purge status, and the edge check with retries', () => {
  const sh = deploy()
  const helpers = [fn(sh, 'html_build_id'), fn(sh, 'edge_status'), fn(sh, 'edge_build_check')].join(
    '\n'
  )
  const run = (body: string, env: Record<string, string> = {}) =>
    execFileSync('bash', ['-c', `set -euo pipefail\n${helpers}\n${body}`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        EDGE_CHECK_DELAY: '0',
        DEPLOY_SITE_URL: 'https://example.com',
        ...env,
      },
    }).trim()

  const page = (id: string) =>
    `<script src="/_next/static/chunks/main-abc.js"></script><script src="/_next/static/${id}/_buildManifest.js" defer></script>`
  assert.equal(run(`html_build_id <<<'${page('6i0jxoJ-pqI1tio5YB-bT')}'`), '6i0jxoJ-pqI1tio5YB-bT')
  assert.equal(run(`html_build_id <<<'<html>no scripts</html>' || true`), '')
  assert.equal(
    run('edge_status 0; edge_status 3; edge_status 1; edge_status ""'),
    'purged\nunconfigured\nfailed\nfailed'
  )

  // A stub curl: the edge serves the old build twice, then the new one.
  const counter = path.join(tmp, 'curl-count')
  fs.writeFileSync(counter, '0')
  const stub = `curl() {
    local n; n=$(( $(cat '${counter}') + 1 )); echo "$n" > '${counter}'
    case "\${@: -1}" in https://example.com/) ;; *) echo "unexpected url \${@: -1}" >&2; return 7 ;; esac
    if [ "$n" -le 2 ]; then printf '%s' '${page('OLD')}'; else printf '%s' '${page('NEW')}'; fi
  }`
  assert.equal(run(`${stub}\nedge_build_check / NEW`), 'fresh')
  assert.equal(fs.readFileSync(counter, 'utf8').trim(), '3')
  fs.writeFileSync(counter, '0')
  assert.equal(run(`${stub}\nedge_build_check / NEW`, { EDGE_CHECK_TRIES: '2' }), 'stale OLD')
  // An unreachable edge is "stale none", never a crash under set -e.
  assert.equal(
    run(`curl() { return 6; }\nedge_build_check / NEW`, { EDGE_CHECK_TRIES: '2' }),
    'stale none'
  )
})
