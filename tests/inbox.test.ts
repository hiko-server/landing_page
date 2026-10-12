import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// lib/inbox resolves data/ from process.cwd() on every call: run in a temp dir.
const prevCwd = process.cwd()
let tmp = ''
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-test-'))
  process.chdir(tmp)
})
after(() => {
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const msg = (n: number, delivered = false) => ({ name: `N${n}`, email: `n${n}@example.com`, subject: `S${n}`, message: `line 1\nline ${n}`, delivered })

test('empty inbox lists nothing', async () => {
  const { listInbox } = await import('../lib/inbox')
  assert.deepEqual(listInbox(), { messages: [], unread: 0, total: 0 })
})

test('append, list newest first, read state, legacy lines', async () => {
  const { appendInboxMessage, listInbox, markInbox, inboxFile } = await import('../lib/inbox')
  // A line written before this module existed (no `delivered`), plus garbage.
  fs.mkdirSync(path.dirname(inboxFile()), { recursive: true })
  fs.writeFileSync(inboxFile(), JSON.stringify({ at: '2026-07-22T16:53:44.449Z', name: 'Old', email: 'o@x.io', subject: 'Hi', message: 'm' }) + '\nnot json\n')
  const id1 = appendInboxMessage(msg(1))
  const id2 = appendInboxMessage(msg(2, true))
  const l = listInbox()
  assert.equal(l.total, 3)
  assert.equal(l.unread, 3)
  assert.equal(l.messages.at(-1)?.name, 'Old')
  assert.equal(l.messages.at(-1)?.delivered, null)
  assert.equal(l.messages.find((m) => m.id === id2)?.delivered, true)
  assert.equal(markInbox([id1, 'ffffffffffffffff', 'bad'], true), 1)
  assert.equal(listInbox().unread, 2)
  assert.equal(markInbox([id1], false), 1)
  assert.equal(listInbox().messages.find((m) => m.id === id1)?.read, false)
  // ids are stable across reads
  assert.deepEqual(listInbox().messages.map((m) => m.id), l.messages.map((m) => m.id))
})

test('delete removes only the chosen messages and their read state', async () => {
  const { listInbox, markInbox, deleteInbox } = await import('../lib/inbox')
  const [a, b] = listInbox().messages
  markInbox([a.id, b.id], true)
  assert.equal(deleteInbox([a.id]), 1)
  const after = listInbox()
  assert.equal(after.total, 2)
  assert.ok(!after.messages.some((m) => m.id === a.id))
  assert.equal(after.messages.find((m) => m.id === b.id)?.read, true)
  assert.equal(deleteInbox(['0000000000000000']), 0)
})

test('merge adds only missing messages (restore never drops newer ones)', async () => {
  const { listInbox, mergeInboxText, appendInboxMessage, inboxFile } = await import('../lib/inbox')
  const current = fs.readFileSync(inboxFile(), 'utf8')
  const backup = current + JSON.stringify({ at: '2026-01-01T00:00:00.000Z', name: 'B', email: 'b@x.io', subject: 'From backup', message: 'x' }) + '\n'
  appendInboxMessage(msg(3)) // arrived after the backup was taken
  assert.equal(mergeInboxText(backup), 1)
  assert.equal(mergeInboxText(backup), 0)
  const subjects = listInbox().messages.map((m) => m.subject)
  assert.ok(subjects.includes('From backup'))
  assert.ok(subjects.includes('S3'))
})

test('isInboxId only accepts 16 lowercase hex chars', async () => {
  const { isInboxId } = await import('../lib/inbox')
  assert.equal(isInboxId('0123456789abcdef'), true)
  for (const bad of ['0123456789ABCDEF', '0123', '../etc/passwd', 42, null]) assert.equal(isInboxId(bad), false)
})

test('replyHref quotes the message and encodes the address', async () => {
  const { replyHref } = await import('../components/Admin/shell/inboxFormat')
  const href = replyHref({ email: 'a+b@x.io', subject: 'Hello', message: 'one\ntwo', name: 'Ann', at: '2026-10-07T07:32:42.928Z' })
  assert.ok(href.startsWith('mailto:a%2Bb%40x.io?subject=Re%3A%20Hello&body='))
  assert.ok(decodeURIComponent(href.split('body=')[1]).includes('> one\n> two'))
  assert.ok(replyHref({ email: 'x@y.z', subject: 'Re: hi', message: '', name: '', at: '' }).includes('subject=Re%3A%20hi&'))
})
