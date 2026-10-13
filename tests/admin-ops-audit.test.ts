import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.JWT_SECRET = 'admin-ops-audit-secret-0123456789abcdef0123'

// The stores resolve data/ from process.cwd(): run in a temp dir.
const prevCwd = process.cwd()
let tmp = ''
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-ops-audit-'))
  process.chdir(tmp)
})
after(async () => {
  const { closeAuditDb } = await import('../lib/audit/db')
  closeAuditDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

// ── H13: what a write did, in words ─────────────────────────────────────────

test('H13 describe: posts — create, publish, unpublish, save and delete read as such', async () => {
  const { describeAdminWrite } = await import('../lib/audit/describe')
  const put = (fm: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    method: 'PUT',
    query: {},
    body: { slug: 'swcs', frontmatter: { title: 'SWCS', ...fm }, body: '…', ...extra },
  })
  assert.equal(describeAdminWrite('admin/posts', put({ draft: true }, { create: true }))?.summary, 'Created draft post “SWCS”')
  assert.equal(describeAdminWrite('admin/posts', put({}), { existingDraft: true })?.action, 'post.publish')
  assert.equal(describeAdminWrite('admin/posts', put({}), { existingDraft: true })?.summary, 'Published post “SWCS”')
  assert.equal(describeAdminWrite('admin/posts', put({ draft: true }), { existingDraft: false })?.action, 'post.unpublish')
  assert.equal(describeAdminWrite('admin/work', put({}), { existingDraft: false })?.summary, 'Saved case study “SWCS”')
  assert.equal(describeAdminWrite('admin/work', put({}), { existingDraft: null })?.action, 'work.publish')
  assert.deepEqual(describeAdminWrite('admin/posts', { method: 'DELETE', query: { slug: 'swcs' }, body: undefined }), {
    action: 'post.delete',
    area: 'post',
    target: 'swcs',
    summary: 'Deleted post “swcs”',
  })
  // Reads, unsafe slugs and unknown routes are not writes worth recording.
  assert.equal(describeAdminWrite('admin/posts', { method: 'GET', query: { slug: 'swcs' }, body: undefined }), null)
  assert.equal(describeAdminWrite('admin/posts', { method: 'DELETE', query: { slug: '../etc' }, body: undefined }), null)
  assert.equal(describeAdminWrite('admin/preview', { method: 'POST', query: {}, body: { body: 'x' } }), null)
})

test('H13 describe: pages, CV, home, versions, inbox, storage and security', async () => {
  const { describeAdminWrite, snapshotStamp } = await import('../lib/audit/describe')
  const d = (route: string, method: string, body: unknown, query: Record<string, string> = {}) =>
    describeAdminWrite(route, { method, query, body })?.summary ?? null
  assert.equal(d('admin/page', 'PUT', { name: 'now', body: 'Working on…' }), 'Saved /now')
  assert.equal(d('admin/page', 'PUT', { name: 'uses', body: '' }), 'Cleared /uses (automatic version shown)')
  assert.equal(d('admin/page', 'PUT', { name: 'about', body: ' ' }), 'Removed the About bio')
  assert.equal(d('cvdata', 'PUT', { en: [] }), 'Saved the CV')
  assert.equal(d('cvdata', 'POST', { action: 'restore', filename: 'cv_2026-10-14_08-31-02-123.json' }), 'Restored the CV from 2026-10-14 08:31 UTC')
  assert.equal(d('home', 'PUT', {}), 'Saved the home page')
  assert.equal(d('versions', 'POST', { action: 'restore', filename: 'swcs_2026-10-01_10-00-00-000.mdx' }, { type: 'blog', slug: 'swcs' }), 'Restored post “swcs” from 2026-10-01 10:00 UTC')
  assert.equal(d('versions', 'POST', { action: 'snapshot' }, { type: 'home' }), 'Took a snapshot of the home page')
  assert.equal(d('admin/inbox', 'POST', { action: 'archive', ids: ['a', 'b'] }), 'Archived 2 messages')
  assert.equal(d('admin/inbox', 'POST', { action: 'delete', ids: ['a'] }), 'Deleted 1 message')
  assert.equal(d('admin/inbox', 'POST', { action: 'nope', ids: ['a'] }), null)
  assert.equal(d('admin/import-image', 'POST', { url: 'https://www.example.com/a.png' }), 'Imported an image from example.com')
  assert.equal(d('admin/storage/pull', 'POST', {}), 'Restored the site from the latest R2 backup')
  assert.equal(d('admin/security/passkeys', 'POST', { action: 'options' }), null)
  assert.equal(d('admin/security/passkeys', 'POST', { action: 'register' }), 'Added a passkey')
  assert.equal(d('admin/security/policy', 'PUT', { passkeyRequired: true }), 'Turned on “Require a passkey”')
  assert.equal(d('admin/security/sessions', 'DELETE', { others: true }), 'Signed out every other browser')
  assert.equal(d('admin/errors', 'PATCH', { fingerprints: ['x', 'y', 'z'], status: 'resolved' }), 'Resolved 3 errors')
  assert.equal(d('mongo', 'POST', { action: 'test' }), null)
  assert.equal(snapshotStamp('not-a-snapshot'), 'not-a-snapshot')
})

test('H13 describe: labels never carry message text, addresses or URLs beyond a host', async () => {
  const { describeAdminWrite } = await import('../lib/audit/describe')
  const reply = describeAdminWrite('admin/inbox/reply', {
    method: 'POST',
    query: {},
    body: { id: '0123456789abcdef', to: 'visitor@example.com', body: 'Secret reply text', subject: 'Re: hi' },
  })
  assert.ok(reply)
  assert.ok(!JSON.stringify(reply).includes('visitor@example.com'))
  assert.ok(!JSON.stringify(reply).includes('Secret reply text'))
  const imp = describeAdminWrite('admin/import-image', { method: 'POST', query: {}, body: { url: 'https://cdn.example.com/u/123/secret.png?token=abc' } })
  assert.ok(imp && !JSON.stringify(imp).includes('token') && !JSON.stringify(imp).includes('secret.png'))
})

// ── H13: the store ───────────────────────────────────────────────────────────

const actor = { sessionId: 'S'.repeat(22), device: 'Chrome on macOS', ipPrefix: '203.0.113.x', country: 'HK' }

test('H13 store: record, list newest first with filters and a time cursor, version notes', async () => {
  const { recordAudit, listAudit, versionNotes } = await import('../lib/audit/store')
  const base = Date.UTC(2026, 9, 14, 8, 0, 0)
  const write = (i: number, area: 'post' | 'cv', summary: string, snapshots: Array<{ kind: 'blog' | 'cv'; file: string }> = []) =>
    recordAudit({ action: `${area}.save`, area, target: area === 'post' ? 'swcs' : null, summary, method: 'PUT', route: 'x', status: 200, requestId: null, snapshots, ...actor }, base + i * 1000)
  write(1, 'post', 'Saved post “SWCS”', [{ kind: 'blog', file: 'swcs_2026-10-14_08-00-00-000.mdx' }])
  write(2, 'cv', 'Saved the CV', [{ kind: 'cv', file: 'cv_2026-10-14_08-00-01-000.json' }])
  write(3, 'post', 'Published post “SWCS”')

  const all = listAudit({ limit: 2 })
  assert.deepEqual(all.entries.map((e) => e.summary), ['Published post “SWCS”', 'Saved the CV'])
  assert.equal(all.entries[0].device, 'Chrome on macOS')
  assert.equal(all.nextBefore, base + 2000)
  const rest = listAudit({ limit: 2, before: all.nextBefore })
  assert.deepEqual(rest.entries.map((e) => e.summary), ['Saved post “SWCS”'])
  assert.equal(rest.nextBefore, null)

  assert.deepEqual(listAudit({ area: 'cv' }).entries.map((e) => e.summary), ['Saved the CV'])
  assert.deepEqual(listAudit({ q: 'publish' }).entries.map((e) => e.summary), ['Published post “SWCS”'])
  // LIKE wildcards in the query are literal.
  assert.equal(listAudit({ q: '%' }).entries.length, 0)

  const notes = versionNotes('blog', ['swcs_2026-10-14_08-00-00-000.mdx', 'unknown.mdx'])
  assert.equal(notes.get('swcs_2026-10-14_08-00-00-000.mdx')?.summary, 'Saved post “SWCS”')
  assert.equal(notes.has('unknown.mdx'), false)
  assert.equal(versionNotes('cv', ['cv_2026-10-14_08-00-01-000.json']).get('cv_2026-10-14_08-00-01-000.json')?.device, 'Chrome on macOS')
})

test('H13 store: pruning drops entries past the period and beyond the row cap, with their links', async () => {
  const { recordAudit, pruneAudit, listAudit, versionNotes } = await import('../lib/audit/store')
  const { getAuditDb } = await import('../lib/audit/db')
  getAuditDb().exec('DELETE FROM audit_log; DELETE FROM audit_snapshots;')
  const now = Date.UTC(2026, 9, 14)
  recordAudit({ action: 'cv.save', area: 'cv', target: null, summary: 'old', method: 'PUT', route: 'cvdata', status: 200, requestId: null, snapshots: [{ kind: 'cv', file: 'cv_old.json' }], ...actor }, now - 500 * 86_400_000)
  for (let i = 0; i < 5; i++) {
    recordAudit({ action: 'cv.save', area: 'cv', target: null, summary: `n${i}`, method: 'PUT', route: 'cvdata', status: 200, requestId: null, ...actor }, now - i * 1000)
  }
  const removed = pruneAudit(now, 400, 3)
  assert.equal(removed, 3)
  assert.deepEqual(listAudit({}).entries.map((e) => e.summary), ['n0', 'n1', 'n2'])
  assert.equal(versionNotes('cv', ['cv_old.json']).size, 0)
})

// ── H13: the capture in withApi ─────────────────────────────────────────────

type MockRes = { statusCode: number; headers: Record<string, string>; body: unknown }

function mockRes(): { res: any; out: MockRes } {
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined }
  const res: any = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    status(code: number) {
      out.statusCode = code
      res.statusCode = code
      return res
    },
    setHeader(name: string, value: unknown) {
      out.headers[name.toLowerCase()] = String(value)
      return res
    },
    getHeader: (name: string) => out.headers[name.toLowerCase()],
    json(b: unknown) {
      out.body = b
      res.headersSent = true
      res.writableEnded = true
      return res
    },
  }
  return { res, out }
}

async function adminReq(method: string, body: unknown, query: Record<string, string> = {}, auth = true) {
  const { signAdminToken, ADMIN_COOKIE } = await import('../lib/auth')
  const token = auth ? signAdminToken('owner@example.com') : ''
  return {
    method,
    query,
    body,
    cookies: token ? { [ADMIN_COOKIE]: token } : {},
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', ...(token ? { cookie: `${ADMIN_COOKIE}=${token}` } : {}) },
    socket: { remoteAddress: '127.0.0.1' },
    url: '/api/x',
  }
}

test('H13 capture: a successful admin write is recorded with its browser and the snapshots it took', async () => {
  const { withApi } = await import('../lib/apiHandler')
  const { noteSnapshot } = await import('../lib/audit/context')
  const { listAudit, versionNotes } = await import('../lib/audit/store')
  const { getAuditDb } = await import('../lib/audit/db')
  getAuditDb().exec('DELETE FROM audit_log; DELETE FROM audit_snapshots;')

  const handler = withApi('home', async (_req, res) => {
    await new Promise((r) => setTimeout(r, 5))
    noteSnapshot('home', 'home_2026-10-14_09-00-00-000.json')
    res.status(200).json({ ok: true })
  })
  const { res } = mockRes()
  await handler((await adminReq('PUT', { hero: {} })) as any, res)

  const [entry] = listAudit({}).entries
  assert.equal(entry.summary, 'Saved the home page')
  assert.equal(entry.device, 'Chrome on macOS')
  assert.equal(entry.ipPrefix, 'loopback')
  assert.equal(entry.status, 200)
  assert.equal(versionNotes('home', ['home_2026-10-14_09-00-00-000.json']).get('home_2026-10-14_09-00-00-000.json')?.summary, 'Saved the home page')
})

test('H13 capture: failed writes, reads and requests without a session leave no entry; a broken log never blocks the action', async () => {
  const { withApi } = await import('../lib/apiHandler')
  const { listAudit } = await import('../lib/audit/store')
  const { getAuditDb } = await import('../lib/audit/db')
  getAuditDb().exec('DELETE FROM audit_log; DELETE FROM audit_snapshots;')

  const fail = withApi('home', (_req, res) => res.status(409).json({ code: 'VERSION_CONFLICT' }))
  await fail((await adminReq('PUT', {})) as any, mockRes().res)
  const read = withApi('home', (_req, res) => res.status(200).json({}))
  await read((await adminReq('GET', undefined)) as any, mockRes().res)
  const anon = withApi('home', (_req, res) => res.status(200).json({}))
  await anon((await adminReq('PUT', {}, {}, false)) as any, mockRes().res)
  assert.equal(listAudit({}).entries.length, 0)

  // The store breaks (table gone): the write still answers normally.
  getAuditDb().exec('ALTER TABLE audit_log RENAME TO audit_log_away')
  try {
    const ok = withApi('home', (_req, res) => res.status(200).json({ ok: true }))
    const { res, out } = mockRes()
    await ok((await adminReq('PUT', {})) as any, res)
    assert.equal(out.statusCode, 200)
    assert.deepEqual(out.body, { ok: true })
  } finally {
    getAuditDb().exec('ALTER TABLE audit_log_away RENAME TO audit_log')
  }
})

test('H13 migrations: audit.db has its own ordered, idempotent list', async () => {
  const Database = (await import('better-sqlite3')).default
  const { runMigrations, currentVersion } = await import('../scripts/db/migrate.mjs')
  const { AUDIT_MIGRATIONS } = await import('../scripts/db/audit/index.mjs')
  const db = new Database(':memory:')
  try {
    runMigrations(db, AUDIT_MIGRATIONS, { label: 'audit' })
    assert.equal(currentVersion(db), AUDIT_MIGRATIONS.length)
    assert.equal(runMigrations(db, AUDIT_MIGRATIONS, { label: 'audit' }).applied.length, 0)
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name)
    assert.ok(tables.includes('audit_log') && tables.includes('audit_snapshots'))
  } finally {
    db.close()
  }
})

// ── H13: word-level diff ─────────────────────────────────────────────────────

test('H13 word diff: changed words only, whitespace folded into the change', async () => {
  const { diffWords } = await import('../lib/wordDiff')
  const d = diffWords('The quick brown fox jumps', 'The slow red fox jumps high')
  assert.ok(!d.tooLarge)
  if (d.tooLarge) return
  assert.deepEqual(d.segments, [
    { kind: 'same', text: 'The ' },
    { kind: 'del', text: 'quick brown' },
    { kind: 'add', text: 'slow red' },
    { kind: 'same', text: ' fox jumps' },
    { kind: 'add', text: ' high' },
  ])
  const same = diffWords('identical', 'identical')
  assert.ok(!same.tooLarge && same.changed === 0 && same.similarity === 1)
})

test('H13 word diff: Chinese is compared by words (Intl.Segmenter) and by character without it', async () => {
  const { diffWords, tokenizeWords } = await import('../lib/wordDiff')
  const d = diffWords('我在上海交通大学读书', '我在香港大学读书')
  assert.ok(!d.tooLarge)
  if (d.tooLarge) return
  const joined = (k: string) => d.segments.filter((s) => s.kind === k).map((s) => s.text).join('')
  assert.equal(joined('add'), '香港')
  assert.ok(joined('del').includes('上海'))
  assert.ok(d.segments.some((s) => s.kind === 'same' && s.text.includes('大学')))
  // Fallback tokenizer: one token per Han character, words and spaces kept.
  assert.deepEqual(tokenizeWords('交大 is ok', { useSegmenter: false }), ['交', '大', ' ', 'is', ' ', 'ok'])
  // Tokens always join back to the input.
  for (const s of ['Hello, world — 你好世界！', 'a\n\nb', '']) assert.equal(tokenizeWords(s).join(''), s)
})

test('H13 word diff: large inputs are refused; line pairs get highlights only when similar', async () => {
  const { diffWords, intralineHighlights } = await import('../lib/wordDiff')
  const big = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ')
  assert.deepEqual(diffWords(big, `${big} end`.replace('w5 ', 'x5 '), { maxTokens: 100 }), { tooLarge: true })
  const lines = [
    { kind: 'same' as const, text: 'title: SWCS' },
    { kind: 'del' as const, text: 'Built a CMS in 2023' },
    { kind: 'del' as const, text: 'completely different line' },
    { kind: 'add' as const, text: 'Built a headless CMS in 2024' },
    { kind: 'add' as const, text: 'nothing alike here at all' },
  ]
  const h = intralineHighlights(lines)
  assert.equal(h[0], null)
  assert.deepEqual(h[1], [
    { kind: 'same', text: 'Built a CMS in ' },
    { kind: 'del', text: '2023' },
  ])
  assert.deepEqual(h[3], [
    { kind: 'same', text: 'Built a ' },
    { kind: 'add', text: 'headless ' },
    { kind: 'same', text: 'CMS in ' },
    { kind: 'add', text: '2024' },
  ])
  assert.equal(h[2], null)
  assert.equal(h[4], null)
})

// ── H13: Activity view helpers ───────────────────────────────────────────────

test('H13 activity format: day groups, clock and actor line', async () => {
  const { groupByDay, actorLine, dayLabel } = await import('../components/Admin/system/activityFormat')
  const now = new Date(2026, 9, 14, 15, 0).getTime()
  const items = [
    { ts: new Date(2026, 9, 14, 9, 0).getTime() },
    { ts: new Date(2026, 9, 14, 8, 0).getTime() },
    { ts: new Date(2026, 9, 13, 23, 0).getTime() },
    { ts: new Date(2025, 0, 2, 10, 0).getTime() },
  ]
  assert.deepEqual(groupByDay(items, now).map((g) => [g.label, g.items.length]), [
    ['Today', 2],
    ['Yesterday', 1],
    ['2 Jan 2025', 1],
  ])
  assert.equal(dayLabel(new Date(2026, 9, 6).getTime(), now), 'Tue 6 Oct')
  assert.equal(actorLine({ device: 'Safari on iOS', ipPrefix: '2001:db8:1::/48', country: 'HK' }), 'Safari on iOS · 2001:db8:1::/48 · HK')
  assert.equal(actorLine({ device: null, ipPrefix: 'loopback', country: null }), 'this server')
})
