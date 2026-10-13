import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { requestIdOf, withApi } from '../lib/apiHandler'

function mockRes() {
  const headers: Record<string, string> = {}
  let body: any
  const res: any = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v),
    status(c: number) {
      res.statusCode = c
      return res
    },
    json(b: any) {
      body = b
      res.headersSent = true
      res.writableEnded = true
      return res
    },
    end() {
      res.writableEnded = true
    },
  }
  return { res, headers, get body() { return body } }
}

const req = (headers: Record<string, string> = {}) => ({ headers, method: 'POST' }) as any

beforeEach(() => {
  delete process.env.SENTRY_DSN
  delete process.env.NEXT_PUBLIC_SENTRY_DSN
})

test('the request id prefers cf-ray, then a sane x-request-id, else a UUID', () => {
  assert.equal(requestIdOf(req({ 'cf-ray': '8a1b2c3d4e5f6789-NRT', 'x-request-id': 'other-id-123' })), '8a1b2c3d4e5f6789-NRT')
  assert.equal(requestIdOf(req({ 'x-request-id': 'abc12345-req' })), 'abc12345-req')
  assert.match(requestIdOf(req({ 'cf-ray': 'bad ray\n' })), /^[0-9a-f-]{36}$/)
})

test('a successful handler gets the id in ctx and the X-Request-Id header', async () => {
  const m = mockRes()
  let seen = ''
  await withApi('t', (_req, res, ctx) => {
    seen = ctx.requestId
    res.status(200).json({ ok: true })
  })(req({ 'cf-ray': '8a1b2c3d4e5f6789-NRT' }), m.res)
  assert.equal(seen, '8a1b2c3d4e5f6789-NRT')
  assert.equal(m.headers['x-request-id'], '8a1b2c3d4e5f6789-NRT')
  assert.equal(m.body.ok, true)
})

test('a throw becomes a generic 500 carrying only the request id', async () => {
  const m = mockRes()
  await withApi('admin/x', () => {
    throw new Error('db exploded at /secret/path')
  })(req(), m.res)
  assert.equal(m.res.statusCode, 500)
  assert.equal(m.body.error, 'Internal server error')
  assert.equal(m.body.requestId, m.headers['x-request-id'])
  assert.equal(JSON.stringify(m.body).includes('secret'), false)
})

test('a leftover Sentry DSN in the environment changes nothing (the integration was removed)', async () => {
  process.env.SENTRY_DSN = 'https://key@o0.ingest.sentry.io/0'
  process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://key@o0.ingest.sentry.io/0'
  const m = mockRes()
  await withApi('admin/y', () => {
    throw new Error('boom')
  })(req({ 'x-request-id': 'req-00000001' }), m.res)
  assert.equal(m.res.statusCode, 500)
  assert.deepEqual(m.body, { error: 'Internal server error', requestId: 'req-00000001' })
})

test('a handler that already answered is ended, not answered twice', async () => {
  const m = mockRes()
  m.res.headersSent = true
  await withApi('t', () => {
    throw new Error('late')
  })(req(), m.res)
  assert.equal(m.body, undefined)
  assert.equal(m.res.writableEnded, true)
})
