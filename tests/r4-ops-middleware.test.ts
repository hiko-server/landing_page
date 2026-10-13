import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { getPublicHost, hostnameOf, isLocalHostname } from '../lib/env'

// `next` has no package "exports", so Node's ESM resolver cannot find the
// extensionless `next/server` that middleware.ts imports (webpack can). Map
// it to the real file before loading the middleware.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier === 'next/server') return next('next/server.js', context)
        return next(specifier, context)
      }
    `),
  import.meta.url,
)
const { NextRequest } = await import('next/server.js')
const { edgeRedirect, forwardedScheme, isIndexNowKeyPath, isPublicAdminApi, middleware } = await import('../middleware')

const HOST = 'lucian-dev.com'

function req(url: string, headers: Record<string, string> = {}, method = 'GET') {
  const u = new URL(url)
  return new NextRequest(url, { method, headers: { host: u.host, ...headers } })
}

function location(res: Response | null): URL {
  assert.ok(res, 'expected a redirect')
  const loc = res.headers.get('location')
  assert.ok(loc, 'redirect without Location')
  return new URL(loc, 'http://placeholder.invalid')
}

test('http on the public host → 308 to the same URL on https', () => {
  const res = edgeRedirect(req('http://lucian-dev.com/blog/post?x=1', { 'x-forwarded-proto': 'http' }), HOST)
  assert.equal(res?.status, 308)
  assert.equal(res?.headers.get('location'), 'https://lucian-dev.com/blog/post?x=1')
})

test("Cloudflare's cf-visitor wins over x-forwarded-proto", () => {
  const viaVisitor = edgeRedirect(req('http://lucian-dev.com/', { 'cf-visitor': '{"scheme":"http"}', 'x-forwarded-proto': 'https' }), HOST)
  assert.equal(viaVisitor?.status, 308)
  const httpsVisitor = edgeRedirect(req('http://lucian-dev.com/', { 'cf-visitor': '{"scheme":"https"}', 'x-forwarded-proto': 'http' }), HOST)
  assert.equal(httpsVisitor, null)
  assert.equal(forwardedScheme(new Headers({ 'cf-visitor': 'not json', 'x-forwarded-proto': 'HTTP, https' })), 'http')
  assert.equal(forwardedScheme(new Headers()), '')
})

test('no HTTPS redirect for https, other hosts, loopback, /api/health or writes', () => {
  assert.equal(edgeRedirect(req('https://lucian-dev.com/about', { 'x-forwarded-proto': 'https' }), HOST), null)
  assert.equal(edgeRedirect(req('http://localhost:3002/about', { 'x-forwarded-proto': 'http' }), HOST), null)
  assert.equal(edgeRedirect(req('http://127.0.0.1:3000/about', { 'x-forwarded-proto': 'http' }), HOST), null)
  assert.equal(edgeRedirect(req('http://evil.example/about', { 'x-forwarded-proto': 'http' }), HOST), null)
  assert.equal(edgeRedirect(req('http://lucian-dev.com/api/health', { 'x-forwarded-proto': 'http' }), HOST), null)
  assert.equal(edgeRedirect(req('http://lucian-dev.com/api/contact', { 'x-forwarded-proto': 'http' }, 'POST'), HOST), null)
  // Without a configured public host nothing is redirected to https at all.
  assert.equal(edgeRedirect(req('http://lucian-dev.com/about', { 'x-forwarded-proto': 'http' }), null), null)
})

test('HEAD is redirected like GET; the host header port is ignored', () => {
  const res = edgeRedirect(req('http://lucian-dev.com:80/now', { 'x-forwarded-proto': 'http' }, 'HEAD'), HOST)
  assert.equal(res?.headers.get('location'), 'https://lucian-dev.com/now')
})

test('legacy /cv?lang=zh|cn → 308 /cv/zh keeping the other parameters', () => {
  const zh = edgeRedirect(req('https://lucian-dev.com/cv?lang=zh&print=1'), HOST)
  assert.equal(zh?.status, 308)
  const loc = location(zh)
  assert.equal(loc.pathname, '/cv/zh')
  assert.equal(loc.search, '?print=1')

  const cn = location(edgeRedirect(req('https://lucian-dev.com/cv?lang=CN'), HOST))
  assert.equal(cn.pathname + cn.search, '/cv/zh')

  assert.equal(edgeRedirect(req('https://lucian-dev.com/cv?lang=en'), HOST), null)
  assert.equal(edgeRedirect(req('https://lucian-dev.com/cv'), HOST), null)
  assert.equal(edgeRedirect(req('https://lucian-dev.com/cv/zh?lang=zh'), HOST), null)
})

test('middleware() applies the security headers to redirects', async () => {
  const prev = process.env.SITE_URL
  process.env.SITE_URL = 'https://lucian-dev.com'
  try {
    const res = await middleware(req('http://lucian-dev.com/cv?lang=zh&print=1', { 'x-forwarded-proto': 'http' }))
    assert.equal(res.status, 308)
    // https first; the /cv?lang hop follows on the https request.
    assert.equal(res.headers.get('location'), 'https://lucian-dev.com/cv?lang=zh&print=1')
    assert.ok(res.headers.get('content-security-policy'))
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
    assert.equal(res.headers.get('x-robots-tag'), null)

    const next = await middleware(req('https://lucian-dev.com/about', { 'x-forwarded-proto': 'https' }))
    assert.equal(next.headers.get('location'), null)
    assert.ok(next.headers.get('strict-transport-security'))
  } finally {
    if (prev === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = prev
  }
})

test('getPublicHost never returns a loopback name', () => {
  const prev = { SITE_URL: process.env.SITE_URL, HOST: process.env.NEXT_PUBLIC_SITE_HOST }
  try {
    process.env.SITE_URL = 'http://127.0.0.1:3000'
    process.env.NEXT_PUBLIC_SITE_HOST = 'Example.com'
    assert.equal(getPublicHost(), 'example.com')
    process.env.NEXT_PUBLIC_SITE_HOST = 'localhost:3002'
    assert.equal(getPublicHost(), null)
    process.env.SITE_URL = 'https://lucian-dev.com/'
    assert.equal(getPublicHost(), 'lucian-dev.com')
  } finally {
    for (const [k, v] of [['SITE_URL', prev.SITE_URL], ['NEXT_PUBLIC_SITE_HOST', prev.HOST]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
  assert.equal(hostnameOf('lucian-dev.com:443'), 'lucian-dev.com')
  assert.equal(hostnameOf(''), null)
  for (const h of ['localhost', 'app.localhost', '127.0.0.1', '127.1.2.3', '[::1]', '0.0.0.0']) assert.equal(isLocalHostname(h), true, h)
  assert.equal(isLocalHostname('lucian-dev.com'), false)
})

test('leaving Draft Mode works without a session; entering it does not', async () => {
  const q = (s: string) => new URLSearchParams(s)
  assert.equal(isPublicAdminApi('/api/admin/draft', 'GET', q('disable=1&path=/blog/x')), true)
  assert.equal(isPublicAdminApi('/api/admin/draft', 'GET', q('path=/blog/x')), false)
  assert.equal(isPublicAdminApi('/api/admin/draft', 'POST', q('disable=1')), false)
  assert.equal(isPublicAdminApi('/api/admin/draft', 'GET', q('disable=true')), false)
  assert.equal(isPublicAdminApi('/api/admin/logout', 'POST', q('')), true)
  assert.equal(isPublicAdminApi('/api/admin/inbox', 'GET', q('disable=1')), false)

  const prev = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret-for-draft-exit'
  try {
    const exit = await middleware(req('https://lucian-dev.com/api/admin/draft?disable=1&path=/blog/x'))
    assert.notEqual(exit.status, 401)
    const enter = await middleware(req('https://lucian-dev.com/api/admin/draft?path=/blog/x'))
    assert.equal(enter.status, 401)
  } finally {
    if (prev === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = prev
  }
})

test('the IndexNow key file is served at the site root, for the configured key only (FIX-28)', async () => {
  const KEY = 'abcdef0123456789'
  assert.equal(isIndexNowKeyPath(`/${KEY}.txt`, KEY), true)
  for (const p of [`/${KEY}`, `/${KEY}.txt/`, `/api/${KEY}.txt`, '/other0123456789.txt', `/${KEY.toUpperCase()}.txt`, '/robots.txt']) {
    assert.equal(isIndexNowKeyPath(p, KEY), false, p)
  }
  assert.equal(isIndexNowKeyPath('/null.txt', null), false)

  const prev = process.env.INDEXNOW_KEY
  try {
    process.env.INDEXNOW_KEY = KEY
    const res = await middleware(req(`https://lucian-dev.com/${KEY}.txt?x=1`))
    // NextResponse.rewrite: the internal route answers under the root URL.
    const target = new URL(res.headers.get('x-middleware-rewrite') || '', 'http://placeholder.invalid')
    assert.equal(target.pathname + target.search, '/api/indexnow-key')
    assert.ok(res.headers.get('content-security-policy'), 'security headers on the rewrite')
    const other = await middleware(req('https://lucian-dev.com/wrongkey0123456.txt'))
    assert.equal(other.headers.get('x-middleware-rewrite'), null)

    delete process.env.INDEXNOW_KEY
    const off = await middleware(req(`https://lucian-dev.com/${KEY}.txt`))
    assert.equal(off.headers.get('x-middleware-rewrite'), null, 'no key configured: nothing is rewritten')
  } finally {
    if (prev === undefined) delete process.env.INDEXNOW_KEY
    else process.env.INDEXNOW_KEY = prev
  }
})
