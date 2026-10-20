import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { parseInquiryMeta, type InquiryMeta } from './inquiry'
import { contactRetentionDays, isExpired, retentionCutoff } from './retention'

/**
 * Contact inbox — every message sent through the public contact form.
 *
 * Storage (inside the bind-mounted data/ dir, so it survives redeploys):
 *   data/contact-inbox.jsonl         append-only, one JSON message per line
 *   data/contact-inbox.state.json    { read, starred, archived, replied: [id, …],
 *                                      deleted: [id, …], replies: { id: [reply, …] } }
 *
 * (The owner's reply templates are content, not inbox state: they live in
 * the content store — lib/inboxTemplates.ts — so backups and R2 carry them.)
 *
 * A message id is a hash of its stored line, so the ids of messages written
 * before this module existed are stable too. Reading/marking never rewrites
 * the log; deleting rewrites it atomically (tmp + rename) and keeps any line
 * appended concurrently while the rewrite ran.
 *
 * Bounded by design, so a spam flood can neither fill the disk nor run the
 * 1 GB container out of memory:
 *   - at most DAILY_STORE_LIMIT messages are stored per UTC day, site-wide
 *     (not per IP), and nothing is stored once the log reaches
 *     MAX_INBOX_BYTES. Past either cap the contact API still emails new
 *     messages when SMTP works, and only refuses (503) when it can't;
 *   - listing reads only the newest LIST_WINDOW_BYTES of the log (larger
 *     than the cap, so normally the whole of it) and the other operations
 *     stream the file in fixed-size chunks — no call ever loads an
 *     arbitrarily large file into one string.
 *
 * Deleted ids are remembered (the newest MAX_DELETED_IDS) so restoring an
 * older backup, which merges its copy of the log into the live one, does not
 * bring deleted messages back.
 *
 * Retention (CONTACT_RETENTION_DAYS, lib/retention.ts; default 365 days):
 * purgeExpiredInbox() removes older messages (run nightly by
 * lib/inboxRetention.ts), listings never show them in the meantime, and a
 * restore never merges them back.
 *
 * A message may carry `meta`: the structured part of the inquiry (reason,
 * kind, company, link, timeline — lib/inquiry.ts) and `mid`: the Message-ID
 * of the notification e-mail the owner received for it, which a reply from
 * the admin references so mail clients thread them. Older lines have neither.
 *
 * Statuses (read, starred, archived, replied) and the replies sent from the
 * admin live in the state file, keyed by message id, and are forgotten with
 * the message (delete or retention). Replies keep what the owner sent (time,
 * subject, text, its Message-ID) — the owner's own words, kept as long as the
 * message they answer.
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
  starred: boolean
  archived: boolean
  /** Answered: a reply was sent from the admin, or the owner marked it replied. */
  replied: boolean
  /** Replies sent from the admin, oldest first. */
  replies: InboxReply[]
  /** Structured inquiry fields; absent on older messages and when the visitor gave none. */
  meta?: InquiryMeta
  /** Message-ID of the owner's notification e-mail for this message (newer messages only). */
  mid?: string
}

export type InboxReply = {
  at: string
  subject: string
  body: string
  /** Message-ID of the sent reply (threading of later replies). */
  messageId: string | null
  lang: 'en' | 'zh'
  /** A copy went to the owner's public address. */
  copied: boolean
}

export type InboxFlag = 'read' | 'starred' | 'archived' | 'replied'

export type InboxStorage = {
  /** Current size of the log in bytes. */
  bytes: number
  maxBytes: number
  /** Messages stored today (UTC). */
  storedToday: number
  dailyLimit: number
  /** New messages are not being stored right now (and why). */
  paused: InboxPauseReason | null
}

export type InboxListing = {
  messages: InboxMessage[]
  /** Unread messages that are not archived (the Inbox badge). */
  unread: number
  total: number
  archived: number
  starred: number
  /** The log holds older messages beyond what was read for this listing. */
  truncated: boolean
  storage: InboxStorage
  /** Messages older than this many days are deleted automatically (0 = never). */
  retentionDays: number
}

export type InboxPauseReason = 'daily-limit' | 'inbox-full'

export type InboxCapacity = { ok: true } | { ok: false; reason: InboxPauseReason; retryAfterMs: number | null }

export type StoreResult = { stored: true; id: string } | { stored: false; reason: InboxPauseReason; retryAfterMs: number | null }

const ID_RE = /^[a-f0-9]{16}$/
export const MAX_LISTED = 1000
/** Site-wide cap on messages stored per UTC day. */
export const DAILY_STORE_LIMIT = 300
/** No message is stored once the log is this large. */
export const MAX_INBOX_BYTES = 5 * 1024 * 1024
/** How much of the log's tail a listing reads (more than the cap, so normally all of it). */
export const LIST_WINDOW_BYTES = MAX_INBOX_BYTES + 1024 * 1024
/** Deleted ids remembered so a restore can't resurrect them. */
export const MAX_DELETED_IDS = 5000
const MAX_READ_IDS = 20_000
/** Replies kept per message, and the longest reply text stored. */
export const MAX_REPLIES_PER_MESSAGE = 20
export const MAX_REPLY_CHARS = 20_000
const MID_RE = /^<[A-Za-z0-9._%+=-]{1,120}@[A-Za-z0-9.-]{1,120}>$/
const CHUNK_BYTES = 64 * 1024
const DAY_MS = 24 * 60 * 60 * 1000

function dataDir() {
  return path.join(process.cwd(), 'data')
}
export function inboxFile() {
  return path.join(dataDir(), 'contact-inbox.jsonl')
}
function stateFile() {
  return path.join(dataDir(), 'contact-inbox.state.json')
}

/** A Message-ID as this module accepts it ("<local@host>", bounded, no spaces). */
export function isMessageId(v: unknown): v is string {
  return typeof v === 'string' && MID_RE.test(v)
}

export function isInboxId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v)
}

function lineId(line: string): string {
  return crypto.createHash('sha256').update(line).digest('hex').slice(0, 16)
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v : '').slice(0, max)

function isMissing(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'ENOENT'
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (isMissing(err)) return ''
    throw err
  }
}

function fileStat(file: string): fs.Stats | null {
  try {
    return fs.statSync(file)
  } catch (err) {
    if (isMissing(err)) return null
    throw err
  }
}

/**
 * The last `maxBytes` of a file as text, starting at a line boundary.
 * `truncated` = the file holds more before that.
 */
function readTail(file: string, maxBytes: number): { text: string; truncated: boolean; size: number } {
  let fd: number
  try {
    fd = fs.openSync(file, 'r')
  } catch (err) {
    if (isMissing(err)) return { text: '', truncated: false, size: 0 }
    throw err
  }
  try {
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - maxBytes)
    const buf = Buffer.alloc(size - start)
    let got = 0
    while (got < buf.length) {
      const n = fs.readSync(fd, buf, got, buf.length - got, start + got)
      if (n <= 0) break
      got += n
    }
    let from = 0
    if (start > 0) {
      // Started mid-file: skip the partial first line (a newline byte never
      // occurs inside a UTF-8 sequence, so this is also a character boundary).
      const nl = buf.indexOf(10)
      from = nl === -1 ? got : nl + 1
    }
    return { text: buf.toString('utf8', from, got), truncated: start > 0, size }
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * Stream a file's lines in fixed-size chunks (memory stays bounded by the
 * longest line, not the file). Reads the first `limit` bytes (default: the
 * size when opened) and returns how many bytes were consumed.
 */
function scanLines(file: string, onLine: (line: string) => void, limit = Infinity): number {
  let fd: number
  try {
    fd = fs.openSync(file, 'r')
  } catch (err) {
    if (isMissing(err)) return 0
    throw err
  }
  try {
    const size = Math.min(fs.fstatSync(fd).size, limit)
    const chunk = Buffer.alloc(CHUNK_BYTES)
    let pending: Buffer = Buffer.alloc(0)
    let pos = 0
    while (pos < size) {
      const n = fs.readSync(fd, chunk, 0, Math.min(chunk.length, size - pos), pos)
      if (n <= 0) break
      pos += n
      const data = pending.length ? Buffer.concat([pending, chunk.subarray(0, n)]) : chunk.subarray(0, n)
      let start = 0
      for (let nl = data.indexOf(10, start); nl !== -1; nl = data.indexOf(10, start)) {
        onLine(data.toString('utf8', start, nl))
        start = nl + 1
      }
      // Copy: `chunk` is reused by the next read.
      pending = Buffer.from(data.subarray(start))
    }
    if (pending.length) onLine(pending.toString('utf8'))
    return pos
  } finally {
    fs.closeSync(fd)
  }
}

type State = {
  read: Set<string>
  starred: Set<string>
  archived: Set<string>
  replied: Set<string>
  deleted: string[]
  replies: Record<string, InboxReply[]>
}

const idSet = (v: unknown) => new Set(Array.isArray(v) ? v.filter(isInboxId) : [])

function parseReply(raw: unknown): InboxReply | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const at = str(o.at, 40)
  if (!at || Number.isNaN(Date.parse(at))) return null
  return {
    at,
    subject: str(o.subject, 300),
    body: str(o.body, MAX_REPLY_CHARS),
    messageId: isMessageId(o.messageId) ? o.messageId : null,
    lang: o.lang === 'zh' ? 'zh' : 'en',
    copied: o.copied === true,
  }
}

function parseReplies(raw: unknown): Record<string, InboxReply[]> {
  const out: Record<string, InboxReply[]> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!isInboxId(id) || !Array.isArray(list)) continue
    const replies = list.map(parseReply).filter((r): r is InboxReply => r !== null).slice(-MAX_REPLIES_PER_MESSAGE)
    if (replies.length) out[id] = replies
  }
  return out
}

function readState(): State {
  try {
    const raw = JSON.parse(readText(stateFile()) || '{}')
    return {
      read: idSet(raw?.read),
      starred: idSet(raw?.starred),
      archived: idSet(raw?.archived),
      replied: idSet(raw?.replied),
      deleted: Array.isArray(raw?.deleted) ? raw.deleted.filter(isInboxId).slice(-MAX_DELETED_IDS) : [],
      replies: parseReplies(raw?.replies),
    }
  } catch {
    return { read: new Set(), starred: new Set(), archived: new Set(), replied: new Set(), deleted: [], replies: {} }
  }
}

function writeAtomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, file)
}

/**
 * Persist the state. With `liveIds`, flags and replies of messages that no
 * longer exist are forgotten; without, the lists are only capped.
 */
function writeState(state: State, liveIds?: Set<string>) {
  const keep = (set: Set<string>) => {
    let list = Array.from(set)
    if (liveIds) list = list.filter((id) => liveIds.has(id))
    return list.slice(-MAX_READ_IDS)
  }
  const replies: Record<string, InboxReply[]> = {}
  for (const [id, list] of Object.entries(state.replies)) {
    if (liveIds && !liveIds.has(id)) continue
    if (list.length) replies[id] = list.slice(-MAX_REPLIES_PER_MESSAGE)
  }
  const deleted = Array.from(new Set(state.deleted)).slice(-MAX_DELETED_IDS)
  writeAtomic(
    stateFile(),
    JSON.stringify({
      read: keep(state.read),
      starred: keep(state.starred),
      archived: keep(state.archived),
      replied: keep(state.replied),
      deleted,
      replies,
    }) + '\n',
  )
}

type Parsed = { id: string; line: string; msg: Omit<InboxMessage, 'read' | 'starred' | 'archived' | 'replied' | 'replies'> }

function parseLine(raw: string): Parsed | null {
  const line = raw.trim()
  if (!line) return null
  let obj: any
  try {
    obj = JSON.parse(line)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const id = lineId(line)
  const meta = parseInquiryMeta(obj.meta)
  return {
    id,
    line,
    msg: {
      id,
      at: str(obj.at, 40),
      name: str(obj.name, 200),
      email: str(obj.email, 320),
      subject: str(obj.subject, 300),
      message: str(obj.message, 10_000),
      delivered: typeof obj.delivered === 'boolean' ? obj.delivered : null,
      ...(meta ? { meta } : {}),
      ...(isMessageId(obj.mid) ? { mid: obj.mid } : {}),
    },
  }
}

function parseLines(text: string): Parsed[] {
  const out: Parsed[] = []
  for (const raw of text.split('\n')) {
    const p = parseLine(raw)
    if (p) out.push(p)
  }
  return out
}

/** Messages in the listing window (the tail of the log). */
function readWindow(): { parsed: Parsed[]; truncated: boolean; size: number } {
  const tail = readTail(inboxFile(), LIST_WINDOW_BYTES)
  return { parsed: parseLines(tail.text), truncated: tail.truncated, size: tail.size }
}

// ── Storage caps ────────────────────────────────────────────────────────

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const msUntilNextUtcDay = (ms: number) => DAY_MS - (ms % DAY_MS)

function countOnDay(parsed: readonly Parsed[], day: string): number {
  let n = 0
  for (const p of parsed) if (p.msg.at.slice(0, 10) === day) n++
  return n
}

/**
 * Today's stored count, cached against the log's size and mtime so a
 * submission normally costs one stat. Any outside change (delete, restore)
 * invalidates it; a recount reads only the listing window, which holds every
 * message stored today (the daily cap is far below the window size).
 */
let dayCount: { day: string; size: number; mtimeMs: number; count: number } | null = null

function storedOn(day: string, stat: fs.Stats | null): number {
  const size = stat?.size ?? 0
  const mtimeMs = stat?.mtimeMs ?? 0
  if (dayCount && dayCount.day === day && dayCount.size === size && dayCount.mtimeMs === mtimeMs) return dayCount.count
  const count = size ? countOnDay(readWindow().parsed, day) : 0
  dayCount = { day, size, mtimeMs, count }
  return count
}

/** One warning per reason per UTC day. */
const warnedOn: Record<InboxPauseReason, string> = { 'daily-limit': '', 'inbox-full': '' }

function warnOnce(reason: InboxPauseReason, day: string) {
  if (warnedOn[reason] === day) return
  warnedOn[reason] = day
  console.warn(
    reason === 'daily-limit'
      ? `[inbox] ${DAILY_STORE_LIMIT} contact messages stored today — new ones are only emailed (or refused without SMTP) until 00:00 UTC`
      : `[inbox] contact inbox reached ${MAX_INBOX_BYTES} bytes — new messages are only emailed (or refused without SMTP) until old ones are deleted`,
  )
}

function capacityFor(stat: fs.Stats | null, extraBytes: number, now: number): InboxCapacity {
  const day = utcDay(now)
  const size = stat?.size ?? 0
  if (size >= MAX_INBOX_BYTES || size + extraBytes > MAX_INBOX_BYTES) {
    warnOnce('inbox-full', day)
    return { ok: false, reason: 'inbox-full', retryAfterMs: null }
  }
  if (storedOn(day, stat) >= DAILY_STORE_LIMIT) {
    warnOnce('daily-limit', day)
    return { ok: false, reason: 'daily-limit', retryAfterMs: msUntilNextUtcDay(now) }
  }
  return { ok: true }
}

/** Whether a new message could be stored right now. */
export function inboxCapacity(now = Date.now()): InboxCapacity {
  return capacityFor(fileStat(inboxFile()), 0, now)
}

// ── Writes ──────────────────────────────────────────────────────────────

type NewMessage = { name: string; email: string; subject: string; message: string; delivered: boolean; meta?: InquiryMeta; mid?: string }

function messageLine(m: NewMessage, now: number): string {
  const meta = parseInquiryMeta(m.meta)
  return JSON.stringify({
    at: new Date(now).toISOString(),
    name: m.name,
    email: m.email,
    subject: m.subject,
    message: m.message,
    delivered: m.delivered,
    ...(meta ? { meta } : {}),
    ...(isMessageId(m.mid) ? { mid: m.mid } : {}),
  })
}

function appendLine(line: string) {
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.appendFileSync(inboxFile(), line + '\n', 'utf8')
}

/**
 * Append one message unconditionally (no caps — callers handling visitor
 * input use storeInboxMessage). Throws on I/O failure.
 */
export function appendInboxMessage(m: NewMessage): string {
  const line = messageLine(m, Date.now())
  appendLine(line)
  return lineId(line)
}

/**
 * Store a contact message unless the daily cap or the size cap is reached.
 * Throws on I/O failure so the caller can report it.
 */
export function storeInboxMessage(m: NewMessage, now = Date.now()): StoreResult {
  const line = messageLine(m, now)
  const file = inboxFile()
  const capacity = capacityFor(fileStat(file), Buffer.byteLength(line) + 1, now)
  if (!capacity.ok) return { stored: false, reason: capacity.reason, retryAfterMs: capacity.retryAfterMs }
  const day = utcDay(now)
  const before = storedOn(day, fileStat(file))
  appendLine(line)
  const stat = fileStat(file)
  dayCount = { day, size: stat?.size ?? 0, mtimeMs: stat?.mtimeMs ?? 0, count: before + 1 }
  return { stored: true, id: lineId(line) }
}

// ── Reads ───────────────────────────────────────────────────────────────

/**
 * Newest first; at most MAX_LISTED messages, read from the tail of the log.
 * Messages past the retention period are left out even before the nightly
 * purge has removed them.
 */
export function listInbox(now = Date.now(), retentionDays = contactRetentionDays()): InboxListing {
  const { parsed, truncated, size } = readWindow()
  const state = readState()
  const cutoff = retentionCutoff(now, retentionDays)
  const messages: InboxMessage[] = parsed
    .filter((p) => !isExpired(p.msg.at, cutoff))
    .map((p) => {
      const replies = state.replies[p.id] || []
      return {
        ...p.msg,
        read: state.read.has(p.id),
        starred: state.starred.has(p.id),
        archived: state.archived.has(p.id),
        replied: replies.length > 0 || state.replied.has(p.id),
        replies,
      }
    })
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  const day = utcDay(now)
  const storedToday = countOnDay(parsed, day)
  const paused: InboxPauseReason | null =
    size >= MAX_INBOX_BYTES ? 'inbox-full' : storedToday >= DAILY_STORE_LIMIT ? 'daily-limit' : null
  return {
    messages: messages.slice(0, MAX_LISTED),
    unread: messages.filter((m) => !m.read && !m.archived).length,
    total: messages.length,
    archived: messages.filter((m) => m.archived).length,
    starred: messages.filter((m) => m.starred).length,
    truncated,
    storage: { bytes: size, maxBytes: MAX_INBOX_BYTES, storedToday, dailyLimit: DAILY_STORE_LIMIT, paused },
    retentionDays: Math.max(0, retentionDays),
  }
}

export function unreadCount(): number {
  return listInbox().unread
}

const FLAG_SET: Record<InboxFlag, 'read' | 'starred' | 'archived' | 'replied'> = {
  read: 'read',
  starred: 'starred',
  archived: 'archived',
  replied: 'replied',
}

/**
 * Turn a status on or off for messages. Returns how many existing ids
 * changed. (A message with replies sent from the admin keeps counting as
 * replied even when its manual `replied` flag is turned off.)
 */
export function setInboxFlag(ids: readonly string[], flag: InboxFlag, on: boolean): number {
  const wanted = new Set(ids.filter(isInboxId))
  // Only messages a listing can show are markable; that is the window.
  const { parsed, truncated } = readWindow()
  const live = new Set(parsed.map((p) => p.id))
  const state = readState()
  const set = state[FLAG_SET[flag]]
  let n = 0
  for (const id of wanted) {
    if (!live.has(id)) continue
    if (on && !set.has(id)) {
      set.add(id)
      n++
    } else if (!on && set.has(id)) {
      set.delete(id)
      n++
    }
  }
  // Prune stale flags only when the window covers the whole log.
  writeState(state, truncated ? undefined : live)
  return n
}

/** Mark messages read/unread. Returns how many existing ids were affected. */
export function markInbox(ids: readonly string[], read: boolean): number {
  return setInboxFlag(ids, 'read', read)
}

/** One message as a listing shows it, or null when it is not (or no longer) there. */
export function getInboxMessage(id: string, now = Date.now()): InboxMessage | null {
  if (!isInboxId(id)) return null
  return listInbox(now).messages.find((m) => m.id === id) ?? null
}

/**
 * Remember a reply sent from the admin: appended to the message's thread
 * (the newest MAX_REPLIES_PER_MESSAGE are kept), and the message counts as
 * read and replied. False when the message does not exist.
 */
export function addInboxReply(id: string, reply: InboxReply): boolean {
  if (!isInboxId(id)) return false
  const { parsed } = readWindow()
  if (!parsed.some((p) => p.id === id)) return false
  const clean = parseReply(reply)
  if (!clean) return false
  const state = readState()
  state.replies[id] = [...(state.replies[id] || []), clean].slice(-MAX_REPLIES_PER_MESSAGE)
  state.read.add(id)
  writeState(state)
  return true
}

/** Copy bytes [from, end of file) of `src` to the open descriptor `out`. */
function copyRest(src: string, from: number, out: number) {
  const fd = fs.openSync(src, 'r')
  try {
    const chunk = Buffer.alloc(CHUNK_BYTES)
    for (let pos = from; ; ) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, pos)
      if (n <= 0) break
      fs.writeSync(out, chunk, 0, n)
      pos += n
    }
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * Delete messages from the inbox. Returns how many were removed. Their ids
 * are remembered so a backup restore will not bring them back.
 */
export function deleteInbox(ids: readonly string[]): number {
  const wanted = new Set(ids.filter(isInboxId))
  if (!wanted.size) return 0
  return removeLines((id) => wanted.has(id))
}

/**
 * Delete every message older than the retention period (lib/retention.ts).
 * Lines whose timestamp cannot be read are kept. Returns how many were
 * removed; 0 when retention is off. Their ids join the deleted list, and
 * mergeInboxText() refuses expired lines anyway, so no restore revives them.
 */
export function purgeExpiredInbox(now = Date.now(), retentionDays = contactRetentionDays()): number {
  const cutoff = retentionCutoff(now, retentionDays)
  if (cutoff === null) return 0
  return removeLines((_id, line) => {
    const p = parseLine(line)
    return !!p && isExpired(p.msg.at, cutoff)
  })
}

/**
 * Rewrite the log without the lines `drop` selects (streamed, atomic tmp +
 * rename, lines appended meanwhile carried over), forget their read flags
 * and remember their ids as deleted. Returns how many were removed.
 */
function removeLines(drop: (id: string, line: string) => boolean): number {
  const file = inboxFile()
  if (!fileStat(file)) return 0
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  const live = new Set<string>()
  const removedIds = new Set<string>()
  const out = fs.openSync(tmp, 'w')
  let committed = false
  try {
    let batch: string[] = []
    let batchBytes = 0
    const flush = () => {
      if (batch.length) fs.writeSync(out, batch.join(''))
      batch = []
      batchBytes = 0
    }
    const scanned = scanLines(file, (raw) => {
      const line = raw.trim()
      if (!line) return
      const id = lineId(line)
      if (drop(id, line)) {
        removedIds.add(id)
        return
      }
      live.add(id)
      batch.push(line + '\n')
      batchBytes += line.length + 1
      if (batchBytes >= CHUNK_BYTES) flush()
    })
    flush()
    if (removedIds.size) {
      // The log is append-only: carry over anything written since the scan.
      copyRest(file, scanned, out)
      fs.fsyncSync(out)
      committed = true
    }
  } finally {
    fs.closeSync(out)
    if (!committed) fs.rmSync(tmp, { force: true })
  }
  if (!committed) return 0
  fs.renameSync(tmp, file)
  const state = readState()
  state.deleted.push(...Array.from(removedIds))
  writeState(state, live)
  return removedIds.size
}

/**
 * Merge messages from another copy of the log (e.g. a restored backup) into
 * the live inbox without ever dropping a message: only lines not already
 * present — not deleted by the owner and not past the retention period —
 * are appended. Returns how many were added.
 */
export function mergeInboxText(otherText: string, now = Date.now(), retentionDays = contactRetentionDays()): number {
  const file = inboxFile()
  const skip = new Set(readState().deleted)
  const cutoff = retentionCutoff(now, retentionDays)
  scanLines(file, (raw) => {
    const line = raw.trim()
    if (line) skip.add(lineId(line))
  })
  const additions: string[] = []
  for (const p of parseLines(otherText)) {
    if (skip.has(p.id) || isExpired(p.msg.at, cutoff)) continue
    skip.add(p.id)
    additions.push(p.line + '\n')
  }
  if (!additions.length) return 0
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.appendFileSync(file, additions.join(''), 'utf8')
  return additions.length
}
