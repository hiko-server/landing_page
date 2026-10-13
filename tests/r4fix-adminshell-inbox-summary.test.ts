import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.JWT_SECRET = 'r4fix-adminshell-inbox-secret-0123456789abcdef'

// lib/inbox and lib/admin resolve data/ from process.cwd(): run in a temp dir.
const prevCwd = process.cwd()
let tmp = ''
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r4fix-inbox-'))
  process.chdir(tmp)
})
after(() => {
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0)
const line = (n: number) =>
  JSON.stringify({ at: new Date(NOW - n * 1000).toISOString(), name: `N${n}`, email: `n${n}@example.com`, subject: `S${n}`, message: `body ${n}`, delivered: false })

beforeEach(async () => {
  const { inboxFile } = await import('../lib/inbox')
  fs.rmSync(path.dirname(inboxFile()), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(inboxFile()), { recursive: true })
  fs.writeFileSync(inboxFile(), [1, 2, 3].map(line).join('\n') + '\n')
})

type MockRes = { statusCode: number; headers: Record<string, string>; body: any }

async function call(method: string, query: Record<string, string | string[]>, opts: { auth?: boolean; body?: unknown } = {}): Promise<MockRes> {
  const { default: handler } = await import('../pages/api/admin/inbox')
  const { signAdminToken, ADMIN_COOKIE } = await import('../lib/auth')
  const token = opts.auth === false ? '' : signAdminToken('admin@example.com')
  const cookies: Record<string, string> = token ? { [ADMIN_COOKIE]: token } : {}
  const req = {
    method,
    query,
    body: opts.body,
    cookies,
    headers: token ? { cookie: `${ADMIN_COOKIE}=${token}` } : {},
    url: '/api/admin/inbox',
  }
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined }
  const res: any = {
    status(code: number) {
      out.statusCode = code
      return res
    },
    setHeader(name: string, value: unknown) {
      out.headers[name.toLowerCase()] = String(value)
      return res
    },
    getHeader: (name: string) => out.headers[name.toLowerCase()],
    json(b: unknown) {
      out.body = b
      return res
    },
  }
  await handler(req as any, res)
  return out
}

test('GET ?summary=1 returns only { unread, total }, uncached', async () => {
  const { markInbox, listInbox } = await import('../lib/inbox')
  markInbox([listInbox().messages[0].id], true)

  const res = await call('GET', { summary: '1' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { unread: 2, total: 3 })
  assert.deepEqual(Object.keys(res.body).sort(), ['total', 'unread'])
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('GET ?summary=1 needs the admin session like every other call', async () => {
  const res = await call('GET', { summary: '1' }, { auth: false })
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { error: 'Unauthorized' })
})

test('GET without summary (or with another value) keeps the full listing', async () => {
  for (const query of [{}, { summary: '0' }, { summary: 'yes' }] as Record<string, string>[]) {
    const res = await call('GET', query)
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['cache-control'], 'no-store')
    assert.deepEqual(Object.keys(res.body).sort(), ['messages', 'retention', 'retentionDays', 'storage', 'total', 'truncated', 'unread'])
    assert.equal(res.body.messages.length, 3)
    assert.equal(res.body.total, 3)
    assert.equal(res.body.unread, 3)
  }
})

test('a repeated summary parameter uses its first value', async () => {
  assert.deepEqual((await call('GET', { summary: ['1', '0'] })).body, { unread: 3, total: 3 })
  assert.ok(Array.isArray((await call('GET', { summary: ['0', '1'] })).body.messages))
})

test('POST responses are unchanged', async () => {
  const { listInbox } = await import('../lib/inbox')
  const id = listInbox().messages[0].id
  const res = await call('POST', {}, { body: { action: 'read', ids: [id] } })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(Object.keys(res.body).sort(), ['affected', 'ok', 'storage', 'total', 'unread'])
  assert.equal(res.body.affected, 1)
  assert.equal(res.body.unread, 2)
})
