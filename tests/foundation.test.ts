import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitize } from '../lib/log'
import { withApi } from '../lib/apiHandler'

test('log sanitize redacts secrets, expands errors, survives cycles', () => {
  const cyc: any = { a: 1 }
  cyc.self = cyc
  const out = sanitize({ password: 'x', nested: { apiKey: 'k', ok: 'v' }, cookie: 'c', err: new Error('boom'), cyc }) as any
  assert.equal(out.password, '[redacted]')
  assert.equal(out.cookie, '[redacted]')
  assert.equal(out.nested.apiKey, '[redacted]')
  assert.equal(out.nested.ok, 'v')
  assert.equal(out.err.message, 'boom')
  assert.equal(out.cyc.self, '[circular]')
})

function mockRes() {
  const headers: Record<string, string> = {}
  let body: any
  const res: any = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v),
    status(c: number) { res.statusCode = c; return res },
    json(b: any) { body = b; res.headersSent = true; res.writableEnded = true; return res },
    end() { res.writableEnded = true },
  }
  return { res, headers, get body() { return body } }
}

test('withApi echoes a valid request id and passes context', async () => {
  const m = mockRes()
  let seen = ''
  await withApi('t', (_req, res, ctx) => { seen = ctx.requestId; res.status(200).json({ ok: true }) })({ headers: { 'x-request-id': 'abc12345-req' }, method: 'GET' } as any, m.res)
  assert.equal(seen, 'abc12345-req')
  assert.equal(m.headers['x-request-id'], 'abc12345-req')
})

test('withApi replaces an unsafe request id and turns throws into a generic 500', async () => {
  const m = mockRes()
  await withApi('t', () => { throw new Error('db exploded at /secret/path') })({ headers: { 'x-request-id': 'bad id\n' }, method: 'POST' } as any, m.res)
  assert.equal(m.res.statusCode, 500)
  assert.equal(m.body.error, 'Internal server error')
  assert.match(m.body.requestId, /^[0-9a-f-]{36}$/)
  assert.ok(!JSON.stringify(m.body).includes('secret'))
})
