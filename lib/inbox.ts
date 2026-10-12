import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * Contact inbox — every message sent through the public contact form.
 *
 * Storage (inside the bind-mounted data/ dir, so it survives redeploys):
 *   data/contact-inbox.jsonl        append-only, one JSON message per line
 *   data/contact-inbox.state.json   { read: [id, …] } — which ids were read
 *
 * A message id is a hash of its stored line, so the ids of messages written
 * before this module existed are stable too. Reading/marking never rewrites
 * the log; deleting rewrites it atomically (tmp + rename) and keeps any line
 * appended concurrently by the contact API while the rewrite ran.
 */

export type InboxMessage = {
  id: string
  at: string
  name: string
  email: string
  subject: string
  message: string
  /** true = emailed to the owner, false = email failed/unconfigured, null = unknown (older entries). */
  delivered: boolean | null
  read: boolean
}

export type InboxListing = { messages: InboxMessage[]; unread: number; total: number }

const ID_RE = /^[a-f0-9]{16}$/
export const MAX_LISTED = 1000

function dataDir() {
  return path.join(process.cwd(), 'data')
}
export function inboxFile() {
  return path.join(dataDir(), 'contact-inbox.jsonl')
}
function stateFile() {
  return path.join(dataDir(), 'contact-inbox.state.json')
}

export function isInboxId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v)
}

function lineId(line: string): string {
  return crypto.createHash('sha256').update(line).digest('hex').slice(0, 16)
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v : '').slice(0, max)

function readText(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (err: any) {
    if (err?.code === 'ENOENT') return ''
    throw err
  }
}

function readState(): { read: Set<string> } {
  try {
    const raw = JSON.parse(readText(stateFile()) || '{}')
    return { read: new Set(Array.isArray(raw?.read) ? raw.read.filter(isInboxId) : []) }
  } catch {
    return { read: new Set() }
  }
}

function writeAtomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, file)
}

function writeState(read: Set<string>, liveIds: Set<string>) {
  // Forget ids whose message no longer exists.
  const kept = Array.from(read).filter((id) => liveIds.has(id))
  writeAtomic(stateFile(), JSON.stringify({ read: kept }) + '\n')
}

type Parsed = { id: string; line: string; msg: Omit<InboxMessage, 'read'> }

function parseLines(text: string): Parsed[] {
  const out: Parsed[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let obj: any
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    if (!obj || typeof obj !== 'object') continue
    out.push({
      id: lineId(line),
      line,
      msg: {
        id: lineId(line),
        at: str(obj.at, 40),
        name: str(obj.name, 200),
        email: str(obj.email, 320),
        subject: str(obj.subject, 300),
        message: str(obj.message, 10_000),
        delivered: typeof obj.delivered === 'boolean' ? obj.delivered : null,
      },
    })
  }
  return out
}

/** Append one message. Throws on I/O failure so the caller can report it. */
export function appendInboxMessage(m: {
  name: string
  email: string
  subject: string
  message: string
  delivered: boolean
}): string {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    name: m.name,
    email: m.email,
    subject: m.subject,
    message: m.message,
    delivered: m.delivered,
  })
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.appendFileSync(inboxFile(), line + '\n', 'utf8')
  return lineId(line)
}

/** Newest first; at most MAX_LISTED messages. */
export function listInbox(): InboxListing {
  const parsed = parseLines(readText(inboxFile()))
  const { read } = readState()
  const messages = parsed
    .map((p) => ({ ...p.msg, read: read.has(p.id) }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return {
    messages: messages.slice(0, MAX_LISTED),
    unread: messages.filter((m) => !m.read).length,
    total: messages.length,
  }
}

export function unreadCount(): number {
  return listInbox().unread
}

/** Mark messages read/unread. Returns how many existing ids were affected. */
export function markInbox(ids: readonly string[], read: boolean): number {
  const wanted = new Set(ids.filter(isInboxId))
  const live = new Set(parseLines(readText(inboxFile())).map((p) => p.id))
  const state = readState()
  let n = 0
  for (const id of wanted) {
    if (!live.has(id)) continue
    if (read && !state.read.has(id)) {
      state.read.add(id)
      n++
    } else if (!read && state.read.has(id)) {
      state.read.delete(id)
      n++
    }
  }
  writeState(state.read, live)
  return n
}

/** Permanently delete messages. Returns how many were removed. */
export function deleteInbox(ids: readonly string[]): number {
  const wanted = new Set(ids.filter(isInboxId))
  if (!wanted.size) return 0
  const file = inboxFile()
  const before = readText(file)
  const parsed = parseLines(before)
  const kept = parsed.filter((p) => !wanted.has(p.id))
  const removed = parsed.length - kept.length
  if (!removed) return 0
  let text = kept.map((p) => p.line + '\n').join('')
  // The contact API only ever appends: carry over anything written meanwhile.
  const now = readText(file)
  if (now.length > before.length && now.startsWith(before)) text += now.slice(before.length)
  writeAtomic(file, text)
  const live = new Set(parseLines(text).map((p) => p.id))
  writeState(readState().read, live)
  return removed
}

/**
 * Merge messages from another copy of the log (e.g. a restored backup) into
 * the live inbox without ever dropping a message: only lines not already
 * present are appended. Returns how many were added.
 */
export function mergeInboxText(otherText: string): number {
  const file = inboxFile()
  const existing = new Set(parseLines(readText(file)).map((p) => p.id))
  const additions = parseLines(otherText).filter((p) => !existing.has(p.id))
  if (!additions.length) return 0
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.appendFileSync(file, additions.map((p) => p.line + '\n').join(''), 'utf8')
  return additions.length
}
