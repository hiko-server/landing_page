/**
 * HTML documents carry Cache-Control: no-transform (Cloudflare then never
 * injects its analytics beacon) while each page keeps its own cache policy
 * and non-HTML responses are left alone.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { installHtmlNoTransform, withNoTransform } from '../lib/htmlNoTransform'

test('withNoTransform appends the directive once', () => {
  assert.equal(withNoTransform('s-maxage=60, stale-while-revalidate=31535940'), 's-maxage=60, stale-while-revalidate=31535940, no-transform')
  assert.equal(withNoTransform('private, no-cache, no-store, max-age=0, must-revalidate'), 'private, no-cache, no-store, max-age=0, must-revalidate, no-transform')
  assert.equal(withNoTransform('public, No-Transform'), 'public, No-Transform')
  assert.equal(withNoTransform('no-transform'), 'no-transform')
  assert.equal(withNoTransform(''), 'no-transform')
  assert.equal(withNoTransform('x-no-transformation=1'), 'x-no-transformation=1, no-transform')
})

let server: http.Server
let base = ''

before(async () => {
  installHtmlNoTransform()
  installHtmlNoTransform() // idempotent: no double append
  server = http.createServer((req, res) => {
    switch (req.url) {
      case '/isr':
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=31535940')
        return res.end('<!doctype html><title>x</title>')
      case '/ssr-late-type':
        // Cache-Control first, Content-Type later: decided when headers are written.
        res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate')
        res.setHeader('Content-Type', 'text/html')
        res.write('<!doctype html>')
        return res.end('<p>streamed</p>')
      case '/no-policy':
        res.setHeader('Content-Type', 'text/html')
        return res.end('<p>x</p>')
      case '/write-head':
        res.writeHead(404, 'Not Found', { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        return res.end('<p>missing</p>')
      case '/json':
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'public, s-maxage=600')
        return res.end('{}')
      case '/js':
        res.setHeader('Content-Type', 'application/javascript')
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        return res.end('void 0')
      default:
        res.statusCode = 204
        return res.end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => new Promise<void>((resolve) => server.close(() => resolve())))

const cc = async (path: string) => {
  const r = await fetch(base + path)
  await r.text()
  return { status: r.status, cacheControl: r.headers.get('cache-control') }
}

test('HTML gets no-transform and keeps its own cache policy', async () => {
  assert.deepEqual(await cc('/isr'), { status: 200, cacheControl: 's-maxage=60, stale-while-revalidate=31535940, no-transform' })
  assert.deepEqual(await cc('/ssr-late-type'), { status: 200, cacheControl: 'private, no-cache, no-store, max-age=0, must-revalidate, no-transform' })
  assert.deepEqual(await cc('/no-policy'), { status: 200, cacheControl: 'no-transform' })
  assert.deepEqual(await cc('/write-head'), { status: 404, cacheControl: 'no-store, no-transform' })
})

test('non-HTML responses are untouched (Cloudflare may still compress them)', async () => {
  assert.equal((await cc('/json')).cacheControl, 'public, s-maxage=600')
  assert.equal((await cc('/js')).cacheControl, 'public, max-age=31536000, immutable')
  assert.equal((await cc('/empty')).cacheControl, null)
})
