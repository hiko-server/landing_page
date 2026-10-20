/**
 * admin-ops — Inbox 2.0 (H11), unified toasts and CORR-3.
 *
 *   - CORR-3: a link that normalizeInquiry accepts always survives the
 *     stored Inbox line (non-ASCII links grow when percent-encoded);
 *   - lib/inbox statuses (star / archive / replied), replies and their
 *     pruning; lib/inboxTemplates in the content store;
 *   - lib/inboxReply (language, subject, templates, quoting, threading) and
 *     lib/mailAlignment (DMARC verdicts, the From address rule);
 *   - POST /api/admin/inbox/reply against a local SMTP server: From the SMTP
 *     account, Reply-To the public address, Message-ID / In-Reply-To /
 *     References, Bcc; 503 without SMTP;
 *   - the Inbox view model and the deferred-delete queue;
 *   - lib/notify (toast timing).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

process.env.JWT_SECRET = 'admin-ops-inbox-secret-0123456789abcdef0123'

const prevCwd = process.cwd()
let tmp = ''
const SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL', 'REPLY_FROM_EMAIL'] as const
const savedEnv: Record<string, string | undefined> = {}
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-ops-inbox-'))
  process.chdir(tmp)
  for (const k of SMTP_VARS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
})
after(async () => {
  const { closeAuditDb } = await import('../lib/audit/db')
  closeAuditDb()
  const { closeDb } = (await import('../lib/db')) as { closeDb?: () => void }
  closeDb?.()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
  for (const k of SMTP_VARS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

// ── CORR-3 ──────────────────────────────────────────────────────────────────

const CJK_LINK = 'https://www.example.com/jobs/' + '前端工程师-香港-全职'.repeat(6) + '?id=123'

test('CORR-3: a non-ASCII job link that is accepted keeps its link in the stored Inbox message', async () => {
  const { normalizeInquiry, parseInquiryMeta, INQUIRY_LIMITS } = await import('../lib/inquiry')
  assert.ok(CJK_LINK.length < INQUIRY_LIMITS.roleUrlMax)
  const r = normalizeInquiry({ intent: 'role', roleUrl: CJK_LINK, reason: 'Hiring' })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.ok(r.meta.roleUrl!.length > INQUIRY_LIMITS.roleUrlMax, 'percent-encoding made it longer than the input cap')
  assert.equal(parseInquiryMeta(r.meta)?.roleUrl, r.meta.roleUrl, 'the parser keeps what the normaliser accepted')

  const { storeInboxMessage, listInbox, inboxFile } = await import('../lib/inbox')
  fs.rmSync(path.dirname(inboxFile()), { recursive: true, force: true })
  const stored = storeInboxMessage({ name: 'Example Person', email: 'person@example.com', subject: 'Role', message: 'Hello', delivered: false, meta: r.meta })
  assert.equal(stored.stored, true)
  assert.equal(listInbox().messages[0].meta?.roleUrl, r.meta.roleUrl)
})

test('CORR-3: links that are too long get a length error, as typed or once encoded; form and API agree', async () => {
  const { normalizeInquiry, checkRoleUrl, ROLE_URL_ERROR, ROLE_URL_TOO_LONG, INQUIRY_LIMITS } = await import('../lib/inquiry')
  const { validateContact } = await import('../components/Common/contactForm')
  const typedTooLong = `https://x.example/${'a'.repeat(INQUIRY_LIMITS.roleUrlMax)}`
  // 240 CJK characters fit the 500-character input but encode to ~2 160.
  const encodedTooLong = `https://x.example/${'职'.repeat(240)}`
  assert.ok(encodedTooLong.length <= INQUIRY_LIMITS.roleUrlMax)
  for (const link of [typedTooLong, encodedTooLong]) {
    assert.deepEqual(checkRoleUrl(link), { ok: false, error: ROLE_URL_TOO_LONG })
    assert.deepEqual(normalizeInquiry({ intent: 'role', roleUrl: link }), { ok: false, field: 'roleUrl', error: ROLE_URL_TOO_LONG })
  }
  assert.deepEqual(checkRoleUrl('http://x.example'), { ok: false, error: ROLE_URL_ERROR })
  const values: Parameters<typeof validateContact>[0] = { name: 'A', email: 'a@example.com', reason: 'Hiring', subject: 'S', message: 'M', company: '', roleUrl: encodedTooLong, timeline: '', mathAnswer: '7' }
  assert.deepEqual(validateContact(values, 7, 'role'), { roleUrl: ROLE_URL_TOO_LONG })
  assert.deepEqual(validateContact({ ...values, roleUrl: CJK_LINK }, 7, 'role'), {})
  // The Inbox shows the stored (encoded) link decoded.
  const { shortUrl } = await import('../components/Admin/shell/inboxFormat')
  assert.equal(shortUrl(new URL('https://jobs.example.com/职位/123?id=1').toString()), 'jobs.example.com/职位/123?id=1')
  assert.equal(shortUrl('https://x.example/%E0%A4%A'), 'x.example/%E0%A4%A', 'broken encoding stays as is')
  // Every accepted link is within what the stored form keeps.
  for (const n of [1, 50, 100, 150, 200]) {
    const r = checkRoleUrl(`https://x.example/${'职'.repeat(n)}`)
    if (r.ok) assert.ok(r.href.length <= INQUIRY_LIMITS.roleUrlStoredMax)
  }
})

// ── lib/inbox statuses and replies ─────────────────────────────────────────

const msg = (n: number, extra: Record<string, unknown> = {}) => ({
  name: `Example ${n}`,
  email: `person${n}@example.com`,
  subject: `Subject ${n}`,
  message: `Message ${n}`,
  delivered: true,
  ...extra,
})

/** A fresh log of `count` messages, returned in the order they were written (Subject 1 first). */
async function freshInbox(count = 3) {
  const { inboxFile, appendInboxMessage, listInbox } = await import('../lib/inbox')
  fs.rmSync(path.dirname(inboxFile()), { recursive: true, force: true })
  for (let i = 1; i <= count; i++) appendInboxMessage(msg(i))
  const bySubject = new Map(listInbox().messages.map((m) => [m.subject, m]))
  return Array.from({ length: count }, (_, i) => bySubject.get(`Subject ${i + 1}`)!)
}

test('H11 inbox: star, archive and replied are stored per message; archived messages leave the unread badge', async () => {
  const { setInboxFlag, listInbox } = await import('../lib/inbox')
  const [a, b, c] = await freshInbox()
  assert.equal(listInbox().unread, 3)
  assert.equal(setInboxFlag([a.id, 'ffffffffffffffff', 'bad'], 'starred', true), 1)
  assert.equal(setInboxFlag([a.id], 'starred', true), 0, 'already starred: nothing changes')
  assert.equal(setInboxFlag([b.id], 'archived', true), 1)
  assert.equal(setInboxFlag([c.id], 'replied', true), 1)
  const l = listInbox()
  const bySubject = Object.fromEntries(l.messages.map((m) => [m.subject, [m.starred, m.archived, m.replied]]))
  assert.deepEqual(bySubject, {
    'Subject 1': [true, false, false],
    'Subject 2': [false, true, false],
    'Subject 3': [false, false, true],
  })
  assert.equal(l.unread, 2, 'the archived message is not counted')
  assert.equal(l.archived, 1)
  assert.equal(l.starred, 1)
  assert.equal(setInboxFlag([b.id], 'archived', false), 1)
  assert.equal(listInbox().unread, 3)
})

test('H11 inbox: a reply is kept with its message (read + replied) and forgotten with it', async () => {
  const { addInboxReply, getInboxMessage, deleteInbox, setInboxFlag, MAX_REPLIES_PER_MESSAGE, isMessageId } = await import('../lib/inbox')
  const [a, b] = await freshInbox(2)
  const reply = { at: '2026-10-20T08:00:00.000Z', subject: 'Re: Subject 2', body: 'Thanks!', messageId: '<reply.1@example.com>', lang: 'en' as const, copied: true }
  assert.equal(addInboxReply('ffffffffffffffff', reply), false)
  assert.equal(addInboxReply(a.id, reply), true)
  let m = getInboxMessage(a.id)!
  assert.equal(m.read, true)
  assert.equal(m.replied, true)
  assert.deepEqual(m.replies, [reply])
  // Turning the manual flag off keeps a message answered from the admin replied.
  setInboxFlag([a.id], 'replied', false)
  assert.equal(getInboxMessage(a.id)!.replied, true)
  // Bounded thread; malformed ids are not kept.
  for (let i = 0; i < MAX_REPLIES_PER_MESSAGE + 3; i++) addInboxReply(a.id, { ...reply, messageId: i % 2 ? 'not an id' : `<r${i}@example.com>` })
  m = getInboxMessage(a.id)!
  assert.equal(m.replies.length, MAX_REPLIES_PER_MESSAGE)
  assert.ok(m.replies.every((r) => r.messageId === null || isMessageId(r.messageId)))
  setInboxFlag([b.id], 'starred', true)
  assert.equal(deleteInbox([a.id]), 1)
  const state = JSON.parse(fs.readFileSync(path.join('data', 'contact-inbox.state.json'), 'utf8'))
  assert.deepEqual(Object.keys(state.replies), [], 'the deleted message’s replies are gone')
  assert.deepEqual(state.starred, [b.id])
  assert.ok(state.deleted.includes(a.id))
})

test('H11 inbox: the notification Message-ID is stored only when well-formed', async () => {
  const { storeInboxMessage, listInbox, inboxFile } = await import('../lib/inbox')
  fs.rmSync(path.dirname(inboxFile()), { recursive: true, force: true })
  storeInboxMessage({ ...msg(1), mid: '<contact.abc@lucian-dev.example>' })
  storeInboxMessage({ ...msg(2), mid: 'Bcc: evil@example.com' })
  const bySubject = new Map(listInbox().messages.map((m) => [m.subject, m]))
  assert.equal(bySubject.get('Subject 1')?.mid, '<contact.abc@lucian-dev.example>')
  assert.equal(bySubject.get('Subject 2')?.mid, undefined)
})

test('H11 templates: saved in the content store per language; blank removes; values are cleaned', async () => {
  const { readReplyTemplates, writeReplyTemplate, cleanTemplates, MAX_TEMPLATE_CHARS } = await import('../lib/inboxTemplates')
  assert.deepEqual(readReplyTemplates(), {})
  const en = await writeReplyTemplate('en', 'Hi {firstName},\r\n\r\nThanks.')
  assert.equal(en.ok, true)
  await writeReplyTemplate('zh', '{name}，您好')
  assert.deepEqual(readReplyTemplates(), { en: 'Hi {firstName},\n\nThanks.', zh: '{name}，您好' })
  await writeReplyTemplate('en', '   ')
  assert.deepEqual(readReplyTemplates(), { zh: '{name}，您好' })
  assert.deepEqual(cleanTemplates({ en: 42, zh: 'x'.repeat(MAX_TEMPLATE_CHARS + 10), other: 'y' }), { zh: 'x'.repeat(MAX_TEMPLATE_CHARS) })
  assert.deepEqual(cleanTemplates(['en']), {})
})

// ── lib/inboxReply ──────────────────────────────────────────────────────────

test('H11 reply drafting: language, subject, templates, quoting', async () => {
  const r = await import('../lib/inboxReply')
  assert.equal(r.detectReplyLang('Hello, we are hiring'), 'en')
  assert.equal(r.detectReplyLang('您好，我们正在招聘前端工程师'), 'zh')
  assert.equal(r.detectReplyLang('您好，我们在招聘 React 前端工程师'), 'zh', 'Chinese with an English word')
  assert.equal(r.detectReplyLang('Hello, this is 李雷 from Example Co about a role'), 'en', 'English with a Chinese name')
  assert.equal(r.detectReplyLang('1234 !!!'), 'en')
  assert.equal(r.replySubject('Role at Example'), 'Re: Role at Example')
  assert.equal(r.replySubject('RE: Role'), 'RE: Role')
  assert.equal(r.replySubject('回复：职位'), '回复：职位')
  assert.equal(r.replySubject('', 'zh'), 'Re: 您的来信')
  assert.equal(r.replySubject('a\r\nBcc: x@example.com'), 'Re: a Bcc: x@example.com', 'no header injection through line breaks')
  assert.equal(r.firstNameOf('Ada  Lovelace'), 'Ada')
  assert.equal(r.firstNameOf('李 雷'), '李雷')
  assert.equal(r.fillTemplate('Hi {firstName} ({name}) re {subject} — {me} {other}', { name: 'Ada Lovelace', subject: 'Role', me: 'Example Owner' }), 'Hi Ada (Ada Lovelace) re Role — Example Owner {other}')
  const m = { name: 'Ada Lovelace', email: 'ada@example.com', at: '2026-10-20T08:05:00.000Z', message: 'Line one\n\nLine two', subject: 'Role' }
  const en = r.draftReply(m, { lang: 'en', me: 'Example Owner', timeZone: 'UTC' })
  assert.match(en, /^Hi Ada,\n\n\n\nBest regards,\nExample Owner\n\nOn 20 Oct 2026, 08:05, Ada Lovelace <ada@example.com> wrote:\n> Line one\n>\n> Line two\n$/)
  const zh = r.draftReply(m, { lang: 'zh', me: '示例', timeZone: 'UTC', template: '{name}，你好！' })
  assert.match(zh, /^Ada Lovelace，你好！\n\n2026年10月20日 08:05，Ada Lovelace <ada@example\.com> 写道：\n> Line one/)
  assert.equal(r.caretAfterGreeting('Hi Ada,\n\nrest'), 9)
})

test('H11 reply threading: In-Reply-To the newest, References the whole chain', async () => {
  const { threadHeaders } = await import('../lib/inboxReply')
  assert.deepEqual(threadHeaders(undefined, []), {})
  assert.deepEqual(threadHeaders('<n@x>', []), { inReplyTo: '<n@x>', references: ['<n@x>'] })
  assert.deepEqual(threadHeaders('<n@x>', [{ messageId: '<r1@x>' }, { messageId: null }, { messageId: '<r2@x>' }]), {
    inReplyTo: '<r2@x>',
    references: ['<n@x>', '<r1@x>', '<r2@x>'],
  })
  assert.deepEqual(threadHeaders(null, [{ messageId: '<r1@x>' }, { messageId: '<r1@x>' }]), { inReplyTo: '<r1@x>', references: ['<r1@x>'] })
})

// ── lib/mailAlignment ───────────────────────────────────────────────────────

test('H11 mail alignment: DMARC policy parsing and verdicts (critic: aligned From)', async () => {
  const a = await import('../lib/mailAlignment')
  assert.equal(a.parseDmarcPolicy('v=DMARC1; p=reject; adkim=s; aspf=s'), 'reject')
  assert.equal(a.parseDmarcPolicy('v=DMARC1;p=quarantine'), 'quarantine')
  assert.equal(a.parseDmarcPolicy('v=DMARC1; rua=mailto:x@example.com'), 'none')
  assert.equal(a.parseDmarcPolicy('v=spf1 -all'), null)
  assert.equal(a.sameOrgDomain('mail.example.com', 'example.com'), true)
  assert.equal(a.sameOrgDomain('example.com', 'example.org'), false)
  assert.equal(a.alignmentVerdict('me@gmail.example', 'me@gmail.example', 'reject').status, 'aligned')
  const rejected = a.alignmentVerdict('hi@site.example', 'me@gmail.example', 'reject')
  assert.equal(rejected.status, 'rejected')
  assert.match(rejected.message, /site\.example publishes DMARC p=reject/)
  assert.match(rejected.message, /refused/)
  assert.equal(a.alignmentVerdict('hi@site.example', 'apikey', 'quarantine').status, 'check', 'SMTP login is not an address (e.g. an API key user)')
  assert.equal(a.alignmentVerdict('hi@site.example', 'me@gmail.example', 'none').status, 'unknown')
  assert.equal(a.alignmentVerdict('hi@site.example', 'me@gmail.example', null).message, '')
})

test('H11 mail alignment: replies are From REPLY_FROM_EMAIL, else the SMTP account, else FROM_EMAIL', async () => {
  const a = await import('../lib/mailAlignment')
  process.env.FROM_EMAIL = 'Site <noreply@site.example>'
  assert.deepEqual(a.replyFrom(), { from: 'noreply@site.example', source: 'FROM_EMAIL' })
  process.env.SMTP_USER = 'account@mail.example'
  assert.deepEqual(a.replyFrom(), { from: 'account@mail.example', source: 'SMTP_USER' })
  process.env.REPLY_FROM_EMAIL = 'replies@mail.example'
  assert.deepEqual(a.replyFrom(), { from: 'replies@mail.example', source: 'REPLY_FROM_EMAIL' })
  process.env.REPLY_FROM_EMAIL = 'not an address'
  assert.equal(a.replyFrom().source, 'SMTP_USER')
  assert.equal(a.notificationFrom(), 'noreply@site.example')
  assert.equal(a.smtpConfigured(), false)
  assert.equal(await a.checkReplyAlignment(), null, 'no SMTP: nothing to check')
  for (const k of SMTP_VARS) delete process.env[k]
})

// ── POST /api/admin/inbox and /api/admin/inbox/reply ───────────────────────

type MockRes = { statusCode: number; headers: Record<string, string>; body: any }

async function callApi(mod: string, url: string, method: string, body?: unknown): Promise<MockRes> {
  const { default: handler } = await import(mod)
  const { signAdminToken, ADMIN_COOKIE } = await import('../lib/auth')
  const token = signAdminToken('admin@example.com')
  const req = { method, query: {}, body, cookies: { [ADMIN_COOKIE]: token }, headers: { cookie: `${ADMIN_COOKIE}=${token}` }, url, socket: { remoteAddress: '127.0.0.1' } }
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined }
  const res: any = {
    statusCode: 200,
    headersSent: false,
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
      return res
    },
    end() {
      return res
    },
  }
  await handler(req as any, res)
  return out
}

test('H11 API: statuses in one call, counts back; template saves go to the content store', async () => {
  const [a, b] = await freshInbox(2)
  let r = await callApi('../pages/api/admin/inbox', '/api/admin/inbox', 'POST', { action: 'star', ids: [a.id, b.id] })
  assert.equal(r.statusCode, 200)
  assert.deepEqual({ affected: r.body.affected, starred: r.body.starred }, { affected: 2, starred: 2 })
  r = await callApi('../pages/api/admin/inbox', '/api/admin/inbox', 'POST', { action: 'archive', ids: [a.id] })
  assert.deepEqual({ unread: r.body.unread, archived: r.body.archived }, { unread: 1, archived: 1 })
  r = await callApi('../pages/api/admin/inbox', '/api/admin/inbox', 'POST', { action: 'flag', ids: [a.id] })
  assert.equal(r.statusCode, 400)
  r = await callApi('../pages/api/admin/inbox', '/api/admin/inbox', 'POST', { action: 'template', lang: 'zh', text: '{name}，您好：\n\n祝好' })
  assert.equal(r.statusCode, 200)
  assert.equal(r.body.templates.zh, '{name}，您好：\n\n祝好')
  r = await callApi('../pages/api/admin/inbox', '/api/admin/inbox', 'POST', { action: 'template', lang: 'fr', text: 'x' })
  assert.equal(r.statusCode, 400)
  const { listAudit } = await import('../lib/audit/store')
  const actions = listAudit({ area: 'inbox' }).entries.map((e) => e.action)
  assert.ok(actions.includes('inbox.star') && actions.includes('inbox.archive') && actions.includes('inbox.template'), actions.join(','))
})

test('H11 reply without SMTP: the composer is told, nothing is sent (503 SMTP_NOT_CONFIGURED)', async () => {
  const [a] = await freshInbox(1)
  const g = await callApi('../pages/api/admin/inbox/reply', '/api/admin/inbox/reply', 'GET')
  assert.equal(g.statusCode, 200)
  assert.equal(g.body.smtp, false)
  assert.equal(g.body.from, null)
  const p = await callApi('../pages/api/admin/inbox/reply', '/api/admin/inbox/reply', 'POST', { id: a.id, subject: 'Re: Subject 1', body: 'Thanks', lang: 'en' })
  assert.equal(p.statusCode, 503)
  assert.equal(p.body.code, 'SMTP_NOT_CONFIGURED')
  const v = await callApi('../pages/api/admin/inbox/reply', '/api/admin/inbox/reply', 'POST', { id: a.id, subject: '', body: 'x' })
  assert.equal(v.statusCode, 400)
  assert.equal(v.body.field, 'subject')
})

/** A minimal SMTP server: records the envelope and the raw message of every delivery. */
async function startSmtp(): Promise<{ port: number; mails: Array<{ from: string; to: string[]; data: string }>; close: () => Promise<void> }> {
  const mails: Array<{ from: string; to: string[]; data: string }> = []
  const server = net.createServer((sock) => {
    sock.setEncoding('utf8')
    let buf = ''
    let inData = false
    let cur = { from: '', to: [] as string[], data: '' }
    sock.write('220 smtp.test ESMTP\r\n')
    sock.on('data', (chunk: string) => {
      buf += chunk
      let i: number
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 2)
        if (inData) {
          if (line === '.') {
            inData = false
            mails.push(cur)
            cur = { from: '', to: [], data: '' }
            sock.write('250 2.0.0 queued\r\n')
          } else cur.data += (line.startsWith('..') ? line.slice(1) : line) + '\r\n'
          continue
        }
        const verb = line.slice(0, 4).toUpperCase()
        if (verb === 'EHLO') sock.write('250-smtp.test\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n')
        else if (verb === 'AUTH') sock.write('235 2.7.0 ok\r\n')
        else if (verb === 'MAIL') {
          cur.from = /<([^>]*)>/.exec(line)?.[1] || ''
          sock.write('250 ok\r\n')
        } else if (verb === 'RCPT') {
          cur.to.push(/<([^>]*)>/.exec(line)?.[1] || '')
          sock.write('250 ok\r\n')
        } else if (verb === 'DATA') {
          inData = true
          sock.write('354 go on\r\n')
        } else if (verb === 'QUIT') {
          sock.end('221 bye\r\n')
        } else sock.write('250 ok\r\n')
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as net.AddressInfo).port
  return { port, mails, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

const header = (raw: string, name: string): string | null => {
  const unfolded = raw.replace(/\r\n[ \t]+/g, ' ')
  const m = new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(unfolded)
  return m ? m[1].trim() : null
}

test('H11 reply with SMTP: From the SMTP account, Reply-To the public address, threaded, Bcc on request, recorded', async () => {
  const smtp = await startSmtp()
  try {
    process.env.SMTP_HOST = '127.0.0.1'
    process.env.SMTP_PORT = String(smtp.port)
    process.env.SMTP_USER = 'account@mail.example'
    process.env.SMTP_PASS = 'test-only'
    process.env.FROM_EMAIL = 'noreply@site.example'
    const { putKv } = await import('../lib/contentStore')
    await putKv('home', { hero: { email: 'owner@site.example' } })

    const { inboxFile, storeInboxMessage, listInbox, getInboxMessage } = await import('../lib/inbox')
    fs.rmSync(path.dirname(inboxFile()), { recursive: true, force: true })
    storeInboxMessage({ ...msg(1), email: 'visitor@example.com', mid: '<contact.n1@site.example>' })
    const id = listInbox().messages[0].id

    const g = await callApi('../pages/api/admin/inbox/reply', '/api/admin/inbox/reply', 'GET')
    assert.equal(g.body.smtp, true)
    assert.equal(g.body.from, 'account@mail.example')
    assert.equal(g.body.fromSource, 'SMTP_USER')
    assert.equal(g.body.replyTo, 'owner@site.example')
    assert.equal(g.body.alignment.status, 'aligned')

    const first = await callApi('../pages/api/admin/inbox/reply', '/api/admin/inbox/reply', 'POST', {
      id,
      subject: 'Re: Subject 1',
      body: 'Hi,\n\nThanks for writing.',
      lang: 'en',
      copy: true,
    })
    assert.equal(first.statusCode, 200, JSON.stringify(first.body))
    assert.equal(first.body.recorded, true)
    assert.equal(smtp.mails.length, 1)
    const sent = smtp.mails[0]
    assert.equal(sent.from, 'account@mail.example', 'envelope sender is the SMTP account')
    assert.deepEqual(sent.to.sort(), ['owner@site.example', 'visitor@example.com'])
    assert.match(header(sent.data, 'From')!, /<?account@mail\.example>?$/)
    assert.equal(header(sent.data, 'Reply-To'), 'owner@site.example')
    assert.equal(header(sent.data, 'To'), 'visitor@example.com')
    assert.equal(header(sent.data, 'Bcc'), null, 'Bcc never appears in the headers')
    assert.equal(header(sent.data, 'In-Reply-To'), '<contact.n1@site.example>')
    assert.equal(header(sent.data, 'References'), '<contact.n1@site.example>')
    const firstId = header(sent.data, 'Message-ID')!
    assert.match(firstId, /^<reply\.[0-9a-f]{24}@mail\.example>$/)

    const m = getInboxMessage(id)!
    assert.equal(m.replied, true)
    assert.equal(m.replies[0].messageId, firstId)
    assert.equal(m.replies[0].copied, true)

    const second = await callApi('../pages/api/admin/inbox/reply', '/api/admin/inbox/reply', 'POST', { id, subject: 'Re: Subject 1', body: 'One more thing.', lang: 'en' })
    assert.equal(second.statusCode, 200)
    const raw2 = smtp.mails[1].data
    assert.deepEqual(smtp.mails[1].to, ['visitor@example.com'], 'no copy unless asked')
    assert.equal(header(raw2, 'In-Reply-To'), firstId)
    assert.equal(header(raw2, 'References'), `<contact.n1@site.example> ${firstId}`)

    const { listAudit } = await import('../lib/audit/store')
    assert.ok(listAudit({ area: 'inbox' }).entries.some((e) => e.action === 'inbox.reply' && !/visitor@/.test(e.summary)))
  } finally {
    for (const k of SMTP_VARS) delete process.env[k]
    await smtp.close()
  }
})

// ── Inbox view model ───────────────────────────────────────────────────────

const view = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  at: '2026-10-20T08:00:00.000Z',
  name: 'Example Person',
  email: `${id}@example.com`,
  subject: 'Hello',
  message: 'Café meeting',
  delivered: true,
  read: false,
  starred: false,
  archived: false,
  replied: false,
  replies: [],
  ...over,
})

test('H11 view: folders, kinds, search words and operators, hidden (pending delete) messages', async () => {
  const v = await import('../components/Admin/inbox/inboxView')
  const list = [
    view('a', { meta: { intent: 'role', company: 'Acme Corp' } }),
    view('b', { archived: true, read: true, meta: { intent: 'freelance' } }),
    view('c', { starred: true, read: true, subject: 'Collab on ＯＳＳ' }),
    view('d', { replied: true, delivered: false, message: 'Rendez-vous' }),
  ] as any[]
  const ids = (o: Parameters<typeof v.visibleMessages>[1]) => v.visibleMessages(list, o).map((m) => m.id)
  assert.deepEqual(ids({ folder: 'inbox', kind: 'all', query: '' }), ['a', 'c', 'd'])
  assert.deepEqual(ids({ folder: 'archived', kind: 'all', query: '' }), ['b'])
  assert.deepEqual(ids({ folder: 'starred', kind: 'all', query: '' }), ['c'])
  assert.deepEqual(ids({ folder: 'all', kind: 'other', query: '' }), ['c', 'd'], 'messages without a kind count as other')
  assert.deepEqual(ids({ folder: 'all', kind: 'all', query: 'cafe' }), ['a', 'b', 'c'], 'accents ignored')
  assert.deepEqual(ids({ folder: 'all', kind: 'all', query: 'oss' }), ['c'], 'full-width letters folded')
  assert.deepEqual(ids({ folder: 'all', kind: 'all', query: 'acme hello' }), ['a'], 'every word must match')
  assert.deepEqual(ids({ folder: 'inbox', kind: 'all', query: 'is:unread' }), ['a', 'd'])
  assert.deepEqual(ids({ folder: 'inbox', kind: 'all', query: 'is:archived' }), ['b'], 'is:archived searches every folder')
  assert.deepEqual(ids({ folder: 'all', kind: 'all', query: 'kind:freelance' }), ['b'])
  assert.deepEqual(ids({ folder: 'all', kind: 'all', query: 'is:not-emailed is:replied' }), ['d'])
  assert.deepEqual(ids({ folder: 'all', kind: 'all', query: 'is:nonsense' }), [], 'unknown operators are searched as words')
  assert.deepEqual(ids({ folder: 'inbox', kind: 'all', query: '', hidden: new Set(['a']) }), ['c', 'd'])
  assert.deepEqual(v.folderCounts(list, new Set(['d'])), {
    inbox: { total: 2, unread: 1 },
    starred: { total: 1, unread: 0 },
    archived: { total: 1, unread: 0 },
    all: { total: 3, unread: 1 },
  })
  assert.deepEqual(v.kindCounts(list, 'all'), { all: 4, role: 1, freelance: 1, collab: 0, other: 2 })
})

test('H11 view: optimistic changes, Undo inverses, what opens next, mailto size', async () => {
  const v = await import('../components/Admin/inbox/inboxView')
  const list = [view('a'), view('b', { replies: [{ at: 'x', subject: 's', body: 'b', messageId: null, lang: 'en', copied: false }], replied: true }), view('c')] as any[]
  assert.equal(v.applyAction(list, ['a'], 'star')[0].starred, true)
  assert.equal(v.applyAction(list, ['a'], 'archive')[0].archived, true)
  assert.equal(v.applyAction(list, ['b'], 'unreplied')[1].replied, true, 'a reply sent from here keeps it replied')
  for (const [k, inv] of Object.entries(v.INVERSE_ACTION)) assert.equal(v.INVERSE_ACTION[inv], k)
  assert.equal(v.nextAfterRemoval(list, new Set(['b']), 'b'), 'c')
  assert.equal(v.nextAfterRemoval(list, new Set(['c']), 'c'), 'b')
  assert.equal(v.nextAfterRemoval(list, new Set(['a', 'b', 'c']), 'a'), null)
  assert.equal(v.nextAfterRemoval(list, new Set(['c']), 'a'), 'a')
  assert.deepEqual([...v.pruneSelection(new Set(['a', 'z']), list)], ['a'])
  const short = v.mailtoHref('a@example.com', 'Re: Hi', 'Thanks!')
  assert.equal(short, 'mailto:a%40example.com?subject=Re%3A%20Hi&body=Thanks!')
  const long = v.mailtoHref('a@example.com', 'Re: Hi', Array.from({ length: 400 }, (_, i) => `Line ${i} 你好`).join('\n'))
  assert.ok(long.length <= v.MAILTO_MAX)
  assert.match(decodeURIComponent(long), /\[…\]$/)
})

test('H11 deferred delete: hide now, Undo before sending, send on close or when the page goes away', async () => {
  const { createDeleteQueue } = await import('../components/Admin/inbox/deleteQueue')
  const q = createDeleteQueue()
  const b1 = q.add(['a', 'b'])!
  assert.deepEqual([...q.hidden()], ['a', 'b'])
  assert.equal(q.add(['a']), null, 'already pending')
  assert.equal(q.lastPending(), b1.key)
  assert.deepEqual(q.undo(b1.key), ['a', 'b'])
  assert.deepEqual([...q.hidden()], [])
  assert.equal(q.take(b1.key), null, 'an undone batch is never sent')

  const b2 = q.add(['c'])!
  const b3 = q.add(['d'])!
  assert.equal(q.lastPending(), b3.key)
  assert.deepEqual(q.take(b2.key), ['c'])
  assert.equal(q.undo(b2.key), null, 'too late once it is being sent')
  assert.deepEqual([...q.hidden()].sort(), ['c', 'd'])
  assert.deepEqual(q.settle(b2.key, true), [])
  assert.deepEqual(q.takeAll(), [[b3.key, ['d']]])
  assert.deepEqual(q.settle(b3.key, false), ['d'], 'a failed delete comes back')
  assert.equal(q.size, 0)
})

// ── lib/notify ──────────────────────────────────────────────────────────────

test('toasts: one timing policy — errors stay, successes and notes long enough to read', async () => {
  const { toastDuration, toastRole, createPausableClock, MIN_TOAST_MS, CUSTOM_TOAST_MS } = await import('../lib/notify')
  assert.equal(toastDuration('error', 2000), null)
  assert.equal(toastDuration('loading', 2000), null)
  assert.equal(toastDuration('success', 2000), MIN_TOAST_MS.success)
  assert.equal(toastDuration('success', 9000), 9000)
  assert.equal(toastDuration('warning', undefined), MIN_TOAST_MS.warning)
  assert.equal(toastDuration('info', null), null, 'null keeps any toast open')
  assert.equal(toastDuration(undefined, undefined), CUSTOM_TOAST_MS)
  assert.equal(toastDuration(undefined, 8000), 8000)
  assert.equal(toastRole('error'), 'alert')
  assert.equal(toastRole('success'), 'status')
  let t = 0
  const clock = createPausableClock(5000, () => t)
  t = 3000
  assert.equal(clock.pause(), 2000)
  assert.equal(clock.paused, true)
  t = 60_000
  assert.equal(clock.resume(), 2000, 'time spent paused does not count')
  t = 61_900
  assert.equal(clock.pause(), 100)
  assert.equal(clock.resume(), 1500, 'never less than a moment after resuming')
})
