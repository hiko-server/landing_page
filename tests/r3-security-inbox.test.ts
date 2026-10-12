import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'

for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL', 'NOTIFY_EMAIL', 'ADMIN_EMAIL']) delete process.env[k]
process.env.JWT_SECRET = 'r3-security-inbox-secret-0123456789abcdef'

// lib/inbox resolves data/ from process.cwd() on every call: run in a temp dir.
const prevCwd = process.cwd()
let tmp = ''
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-inbox-'))
  process.chdir(tmp)
})
after(() => {
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const inbox = () => import('../lib/inbox')
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000

const line = (at: number, n: number, pad = 0) =>
  JSON.stringify({ at: new Date(at).toISOString(), name: `N${n}`, email: `n${n}@example.com`, subject: `S${n}`, message: 'x'.repeat(pad), delivered: false })

const msg = (n: number) => ({ name: `N${n}`, email: `n${n}@example.com`, subject: `S${n}`, message: `hello ${n}`, delivered: false })

async function reset() {
  const { inboxFile } = await inbox()
  fs.rmSync(path.dirname(inboxFile()), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(inboxFile()), { recursive: true })
}

function captureWarnings(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  }
  return { lines, restore: () => (console.warn = original) }
}

beforeEach(reset)

test('daily cap: stores up to the limit per UTC day, site-wide, and warns once', async () => {
  const { storeInboxMessage, inboxCapacity, inboxFile, DAILY_STORE_LIMIT, listInbox } = await inbox()
  const lines: string[] = []
  for (let i = 0; i < DAILY_STORE_LIMIT - 1; i++) lines.push(line(NOW - 1000 - i, i))
  lines.push(line(NOW - DAY, 9999)) // yesterday's message doesn't count
  fs.writeFileSync(inboxFile(), lines.join('\n') + '\n')

  const warn = captureWarnings()
  try {
    assert.equal(storeInboxMessage(msg(1), NOW).stored, true)
    const refused = storeInboxMessage(msg(2), NOW + 1)
    assert.equal(refused.stored, false)
    if (!refused.stored) {
      assert.equal(refused.reason, 'daily-limit')
      assert.equal(refused.retryAfterMs, DAY / 2 - 1)
    }
    assert.deepEqual(inboxCapacity(NOW + 2), { ok: false, reason: 'daily-limit', retryAfterMs: DAY / 2 - 2 })
    assert.equal(warn.lines.filter((l) => l.includes('stored today')).length, 1, 'one warning per day')
    assert.equal(listInbox(NOW).storage.paused, 'daily-limit')
    // A new UTC day opens the inbox again.
    assert.equal(storeInboxMessage(msg(3), NOW + DAY).stored, true)
  } finally {
    warn.restore()
  }
})

test('size cap: nothing is stored once the log reaches the maximum', async () => {
  const { storeInboxMessage, inboxFile, MAX_INBOX_BYTES, listInbox } = await inbox()
  const big = line(NOW - 3 * DAY, 1, 9000)
  const count = Math.ceil(MAX_INBOX_BYTES / (big.length + 1))
  fs.writeFileSync(inboxFile(), (big + '\n').repeat(count))
  const warn = captureWarnings()
  try {
    const r = storeInboxMessage(msg(1), NOW)
    assert.equal(r.stored, false)
    if (!r.stored) {
      assert.equal(r.reason, 'inbox-full')
      assert.equal(r.retryAfterMs, null)
    }
    assert.equal(listInbox(NOW).storage.paused, 'inbox-full')
    assert.equal(warn.lines.filter((l) => l.includes('reached')).length, 1)
  } finally {
    warn.restore()
  }
})

test('listing reads only the tail of an oversized log', async () => {
  const { listInbox, inboxFile, LIST_WINDOW_BYTES, MAX_LISTED } = await inbox()
  const filler = line(NOW - 30 * DAY, 0, 4000)
  const n = Math.ceil((LIST_WINDOW_BYTES * 1.5) / (filler.length + 1))
  const fd = fs.openSync(inboxFile(), 'w')
  for (let i = 0; i < n; i++) fs.writeSync(fd, line(NOW - 30 * DAY + i, i, 4000) + '\n')
  fs.writeSync(fd, line(NOW, 424242) + '\n')
  fs.closeSync(fd)
  const l = listInbox(NOW)
  assert.equal(l.truncated, true)
  assert.ok(l.total < n, `${l.total} < ${n}`)
  assert.ok(l.messages.length <= MAX_LISTED)
  assert.equal(l.messages[0].name, 'N424242', 'newest first')
  assert.ok(l.storage.bytes > LIST_WINDOW_BYTES)
})

test('delete streams the log, keeps everything else and remembers the ids; merge skips them', async () => {
  const { listInbox, deleteInbox, mergeInboxText, markInbox, inboxFile } = await inbox()
  const lines = [line(NOW - 3000, 1), 'not json but kept', line(NOW - 2000, 2), line(NOW - 1000, 3)]
  const original = lines.join('\n') + '\n'
  fs.writeFileSync(inboxFile(), original)
  const before = listInbox(NOW)
  assert.equal(before.total, 3)
  const victim = before.messages.find((m) => m.name === 'N2')
  const keeper = before.messages.find((m) => m.name === 'N3')
  assert.ok(victim && keeper)
  markInbox([victim.id, keeper.id], true)

  assert.equal(deleteInbox([victim.id]), 1)
  const text = fs.readFileSync(inboxFile(), 'utf8')
  assert.ok(text.includes('not json but kept'))
  assert.ok(!text.includes('"N2"'))
  const after1 = listInbox(NOW)
  assert.deepEqual(after1.messages.map((m) => m.name).sort(), ['N1', 'N3'])
  assert.equal(after1.messages.find((m) => m.id === keeper.id)?.read, true)

  const state = JSON.parse(fs.readFileSync(path.join(path.dirname(inboxFile()), 'contact-inbox.state.json'), 'utf8'))
  assert.deepEqual(state.deleted, [victim.id])
  assert.ok(!state.read.includes(victim.id))

  // Restoring the old backup brings back nothing the owner deleted…
  assert.equal(mergeInboxText(original), 0)
  assert.equal(listInbox(NOW).total, 2)
  // …but still merges messages that are genuinely missing.
  assert.equal(mergeInboxText(original + line(NOW - 500, 4) + '\n'), 1)
  assert.equal(listInbox(NOW).total, 3)
  assert.equal(deleteInbox(['0123456789abcdef']), 0)
})

test('the deleted-id memory is bounded', async () => {
  const { deleteInbox, inboxFile, listInbox, MAX_DELETED_IDS } = await inbox()
  const statePath = path.join(path.dirname(inboxFile()), 'contact-inbox.state.json')
  const old = Array.from({ length: MAX_DELETED_IDS }, (_, i) => i.toString(16).padStart(16, '0'))
  fs.writeFileSync(statePath, JSON.stringify({ read: [], deleted: old }))
  fs.writeFileSync(inboxFile(), line(NOW, 1) + '\n')
  const [m] = listInbox(NOW).messages
  assert.equal(deleteInbox([m.id]), 1)
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  assert.equal(state.deleted.length, MAX_DELETED_IDS)
  assert.equal(state.deleted.at(-1), m.id)
  assert.ok(!state.deleted.includes(old[0]))
})

// ── POST /api/contact ───────────────────────────────────────────────────

type MockRes = { statusCode: number; headers: Record<string, string>; body: any }

async function post(body: Record<string, unknown>, ip: string): Promise<MockRes> {
  const { default: handler } = await import('../pages/api/contact')
  const req = { method: 'POST', body, headers: { 'cf-connecting-ip': ip }, socket: { remoteAddress: '127.0.0.1' }, url: '/api/contact' }
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

const nonce = () =>
  jwt.sign({ t: 'contact-nonce', iat: Math.floor(Date.now() / 1000) - 10, jti: Math.random().toString(36).slice(2) }, process.env.JWT_SECRET as string, {
    expiresIn: '30m',
    audience: 'contact-form',
    algorithm: 'HS256',
  })

const form = (n: number, token: string) => ({ name: `V${n}`, email: `v${n}@example.com`, subject: 'Hi', message: 'Hello', nonce: token, mathAnswer: 7, hp: '' })

test('contact: a nonce carries one message; caps without email → friendly 503', async () => {
  const { inboxFile, DAILY_STORE_LIMIT, listInbox } = await inbox()
  const token = nonce()
  const ok = await post(form(1, token), '198.51.100.1')
  assert.equal(ok.statusCode, 200)
  assert.equal(listInbox().total, 1)
  const replay = await post(form(2, token), '198.51.100.2')
  assert.equal(replay.statusCode, 400)
  assert.equal(listInbox().total, 1)

  // Fill today's quota; with no SMTP/recipient nothing can accept the message.
  const today = Date.now()
  const lines: string[] = []
  for (let i = 0; i < DAILY_STORE_LIMIT; i++) lines.push(line(today - i, i))
  fs.appendFileSync(inboxFile(), lines.join('\n') + '\n')
  const warn = captureWarnings()
  let refused: MockRes
  try {
    const t2 = nonce()
    refused = await post(form(3, t2), '198.51.100.3')
    assert.equal(refused.statusCode, 503)
    assert.match(String(refused.body?.error), /try again later/i)
    assert.ok(Number(refused.headers['retry-after']) > 0)
    // The refused attempt did not burn the nonce (the visitor can retry later).
    const again = await post(form(3, t2), '198.51.100.4')
    assert.equal(again.statusCode, 503)
  } finally {
    warn.restore()
  }
})
