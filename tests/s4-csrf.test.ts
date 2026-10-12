import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkCsrf,
  isCsrfProtectedPath,
  isFormLikeContentType,
  isUnsafeMethod,
  normalizeHost,
  originHost,
  siteHostsFrom,
  type CsrfRequest,
} from '../lib/security/csrf'

const base: CsrfRequest = {
  method: 'POST',
  secFetchSite: null,
  origin: null,
  host: 'lucian-dev.com',
  forwardedHost: null,
  siteHosts: ['lucian-dev.com'],
}

test('protected paths cover admin, auth and the JSON write endpoints only', () => {
  for (const p of ['/api/admin/upload-image', '/api/admin/logout', '/api/admin/storage/pull', '/api/auth/email-login', '/api/cvdata', '/api/cvdata/', '/api/home', '/api/versions', '/api/mongo']) {
    assert.equal(isCsrfProtectedPath(p), true, p)
  }
  for (const p of ['/api/contact', '/api/og', '/api/cvdatax', '/api/homepage', '/api/administrator', '/admin/login', '/api/uploads/a.png']) {
    assert.equal(isCsrfProtectedPath(p), false, p)
  }
})

test('only unsafe methods are checked', () => {
  assert.deepEqual(['GET', 'HEAD', 'OPTIONS'].map(isUnsafeMethod), [false, false, false])
  assert.deepEqual(['POST', 'put', 'PATCH', 'DELETE'].map(isUnsafeMethod), [true, true, true, true])
  assert.deepEqual(checkCsrf({ ...base, method: 'GET', secFetchSite: 'cross-site', origin: 'https://evil.example' }), { ok: true })
})

test('same-origin and user-initiated fetch metadata pass', () => {
  assert.equal(checkCsrf({ ...base, secFetchSite: 'same-origin', origin: 'https://lucian-dev.com' }).ok, true)
  assert.equal(checkCsrf({ ...base, secFetchSite: 'none' }).ok, true)
})

test('real deployments pass: Cloudflare tunnel and local prod server', () => {
  // Browser without Sec-Fetch-* (older Safari) behind cloudflared.
  assert.equal(checkCsrf({ ...base, origin: 'https://lucian-dev.com' }).ok, true)
  // Local `next start` on :3100.
  assert.equal(checkCsrf({ ...base, host: 'localhost:3100', siteHosts: [], origin: 'http://localhost:3100' }).ok, true)
  // Host rewritten by a proxy, original host forwarded.
  assert.equal(checkCsrf({ ...base, host: '127.0.0.1:3002', siteHosts: [], forwardedHost: 'lucian-dev.com', origin: 'https://lucian-dev.com' }).ok, true)
  // Host header unhelpful, configured SITE_URL matches.
  assert.equal(checkCsrf({ ...base, host: '127.0.0.1:3002', origin: 'https://lucian-dev.com' }).ok, true)
})

test('cross-site requests are refused', () => {
  assert.deepEqual(checkCsrf({ ...base, secFetchSite: 'cross-site', origin: 'https://evil.example' }), { ok: false, reason: 'bad-origin' })
  assert.deepEqual(checkCsrf({ ...base, secFetchSite: 'same-site', origin: 'https://www.lucian-dev.com' }), { ok: false, reason: 'bad-origin' })
  assert.deepEqual(checkCsrf({ ...base, secFetchSite: 'cross-site' }), { ok: false, reason: 'cross-site' })
  assert.deepEqual(checkCsrf({ ...base, origin: 'null' }), { ok: false, reason: 'bad-origin' })
  assert.deepEqual(checkCsrf({ ...base, origin: 'https://lucian-dev.com.evil.example' }), { ok: false, reason: 'bad-origin' })
  assert.deepEqual(checkCsrf({ ...base, origin: 'chrome-extension://abc' }), { ok: false, reason: 'bad-origin' })
  assert.deepEqual(checkCsrf({ ...base, origin: 'http://lucian-dev.com:8080' }), { ok: false, reason: 'bad-origin' })
})

test('non-browser clients (no Origin, no Sec-Fetch-Site) are allowed', () => {
  assert.deepEqual(checkCsrf(base), { ok: true })
})

test('host normalisation ignores case, default ports and the root dot', () => {
  assert.equal(normalizeHost('Lucian-Dev.com:443'), 'lucian-dev.com')
  assert.equal(normalizeHost('lucian-dev.com.'), 'lucian-dev.com')
  assert.equal(normalizeHost('localhost:3100'), 'localhost:3100')
  assert.equal(normalizeHost('a.com, b.com'), 'a.com')
  assert.equal(originHost('https://lucian-dev.com'), 'lucian-dev.com')
  assert.equal(originHost('HTTP://LOCALHOST:3100'), 'localhost:3100')
  assert.equal(originHost('not a url'), '')
})

test('site hosts accept URLs and bare hosts', () => {
  assert.deepEqual(siteHostsFrom('https://lucian-dev.com', 'lucian-dev.com', '', undefined), ['lucian-dev.com'])
  assert.deepEqual(siteHostsFrom('http://localhost:3100/x', 'example.org/path'), ['localhost:3100', 'example.org'])
})

test('form-like content types are detected', () => {
  for (const ct of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain;charset=UTF-8', 'Text/Plain']) {
    assert.equal(isFormLikeContentType(ct), true, ct)
  }
  for (const ct of ['application/json', 'application/json; charset=utf-8', 'application/octet-stream', '', null, undefined]) {
    assert.equal(isFormLikeContentType(ct), false, String(ct))
  }
})
