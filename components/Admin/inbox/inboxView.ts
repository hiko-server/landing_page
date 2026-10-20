import type { InquiryIntent, InquiryMeta } from '../../../lib/inquiry'

/**
 * The admin Inbox's view model (pure — unit tested; components/Admin/
 * InboxPanel renders it): folders, the kind filter, search, optimistic
 * status changes and what to open after a message leaves the list.
 *
 * Folders follow a mail client: Inbox (everything not archived), Starred,
 * Archived, All. Search matches every word (accents and case ignored) in the
 * sender, address, subject, message, company, reason and link, and knows a
 * few operators: is:unread / is:read / is:starred / is:replied /
 * is:unreplied / is:archived / is:not-emailed, and kind:role / freelance /
 * collab / other.
 */

export type InboxReplyView = {
  at: string
  subject: string
  body: string
  messageId: string | null
  lang: 'en' | 'zh'
  copied: boolean
}

export type InboxMessage = {
  id: string
  at: string
  name: string
  email: string
  subject: string
  message: string
  delivered: boolean | null
  read: boolean
  starred: boolean
  archived: boolean
  replied: boolean
  replies: InboxReplyView[]
  /** Structured inquiry (reason, kind, company, link, timeline); older messages have none. */
  meta?: InquiryMeta
  /** Message-ID of the owner's notification e-mail (newer messages only). */
  mid?: string
}

export const INBOX_FOLDERS = ['inbox', 'starred', 'archived', 'all'] as const
export type InboxFolder = (typeof INBOX_FOLDERS)[number]

export const FOLDER_LABEL: Record<InboxFolder, string> = {
  inbox: 'Inbox',
  starred: 'Starred',
  archived: 'Archived',
  all: 'All',
}

export type KindFilter = 'all' | InquiryIntent

/** Status changes the API accepts (POST /api/admin/inbox). */
export type InboxAction = 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'unarchive' | 'replied' | 'unreplied'

const STATUS_OPS = ['unread', 'read', 'starred', 'replied', 'unreplied', 'archived', 'not-emailed', 'emailed'] as const
type StatusOp = (typeof STATUS_OPS)[number]
const KINDS: readonly InquiryIntent[] = ['role', 'freelance', 'collab', 'other']

export type InboxQuery = { words: string[]; is: StatusOp[]; kind: InquiryIntent | null }

/** Lowercase, accents removed, width-normalised (ｆｕｌｌ → full), whitespace collapsed. */
export function foldText(s: string): string {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Words and operators of a search box value (unknown operators are searched as words). */
export function parseInboxQuery(raw: string): InboxQuery {
  const out: InboxQuery = { words: [], is: [], kind: null }
  for (const token of foldText(raw).split(' ')) {
    if (!token) continue
    const m = /^(is|kind):(.+)$/.exec(token)
    if (m && m[1] === 'is' && (STATUS_OPS as readonly string[]).includes(m[2])) {
      out.is.push(m[2] as StatusOp)
      continue
    }
    if (m && m[1] === 'kind' && (KINDS as readonly string[]).includes(m[2])) {
      out.kind = m[2] as InquiryIntent
      continue
    }
    out.words.push(token)
  }
  return out
}

/** The kind of a message: its structured intent, 'other' for older messages without one. */
export function kindOf(m: Pick<InboxMessage, 'meta'>): InquiryIntent {
  return m.meta?.intent ?? 'other'
}

function haystack(m: InboxMessage): string {
  const meta = m.meta || {}
  return foldText([m.name, m.email, m.subject, m.message, meta.company, meta.reason, meta.roleUrl].filter(Boolean).join(' \n '))
}

function statusMatches(m: InboxMessage, op: StatusOp): boolean {
  switch (op) {
    case 'unread':
      return !m.read
    case 'read':
      return m.read
    case 'starred':
      return m.starred
    case 'replied':
      return m.replied
    case 'unreplied':
      return !m.replied
    case 'archived':
      return m.archived
    case 'not-emailed':
      return m.delivered === false
    case 'emailed':
      return m.delivered === true
  }
}

export function matchesQuery(m: InboxMessage, q: InboxQuery): boolean {
  if (q.kind && kindOf(m) !== q.kind) return false
  if (!q.is.every((op) => statusMatches(m, op))) return false
  if (!q.words.length) return true
  const text = haystack(m)
  return q.words.every((w) => text.includes(w))
}

export function inFolder(m: InboxMessage, folder: InboxFolder): boolean {
  if (folder === 'all') return true
  if (folder === 'archived') return m.archived
  if (folder === 'starred') return m.starred
  return !m.archived
}

export type ViewOptions = { folder: InboxFolder; kind: KindFilter; query: string; hidden?: ReadonlySet<string> }

/** The messages the list shows, newest first (the input order is kept). */
export function visibleMessages(messages: readonly InboxMessage[], opts: ViewOptions): InboxMessage[] {
  const q = parseInboxQuery(opts.query)
  // A search that names a status (is:archived) looks through every folder.
  const folder: InboxFolder = q.is.includes('archived') ? 'all' : opts.folder
  return messages.filter(
    (m) => !opts.hidden?.has(m.id) && inFolder(m, folder) && (opts.kind === 'all' || kindOf(m) === opts.kind) && matchesQuery(m, q),
  )
}

export type FolderCount = { total: number; unread: number }

export function folderCounts(messages: readonly InboxMessage[], hidden?: ReadonlySet<string>): Record<InboxFolder, FolderCount> {
  const out = Object.fromEntries(INBOX_FOLDERS.map((f) => [f, { total: 0, unread: 0 }])) as Record<InboxFolder, FolderCount>
  for (const m of messages) {
    if (hidden?.has(m.id)) continue
    for (const f of INBOX_FOLDERS) {
      if (!inFolder(m, f)) continue
      out[f].total++
      if (!m.read) out[f].unread++
    }
  }
  return out
}

/** Messages per kind inside a folder (the kind filter's counts). */
export function kindCounts(messages: readonly InboxMessage[], folder: InboxFolder, hidden?: ReadonlySet<string>): Record<KindFilter, number> {
  const out: Record<KindFilter, number> = { all: 0, role: 0, freelance: 0, collab: 0, other: 0 }
  for (const m of messages) {
    if (hidden?.has(m.id) || !inFolder(m, folder)) continue
    out.all++
    out[kindOf(m)]++
  }
  return out
}

/** The optimistic local result of a status change (the server answers the same). */
export function applyAction(messages: readonly InboxMessage[], ids: readonly string[], action: InboxAction): InboxMessage[] {
  const set = new Set(ids)
  return messages.map((m) => {
    if (!set.has(m.id)) return m
    switch (action) {
      case 'read':
        return { ...m, read: true }
      case 'unread':
        return { ...m, read: false }
      case 'star':
        return { ...m, starred: true }
      case 'unstar':
        return { ...m, starred: false }
      case 'archive':
        return { ...m, archived: true }
      case 'unarchive':
        return { ...m, archived: false }
      case 'replied':
        return { ...m, replied: true }
      case 'unreplied':
        // A reply sent from the admin keeps the message answered.
        return { ...m, replied: m.replies.length > 0 }
    }
  })
}

/** The opposite change (Undo). */
export const INVERSE_ACTION: Record<InboxAction, InboxAction> = {
  read: 'unread',
  unread: 'read',
  star: 'unstar',
  unstar: 'star',
  archive: 'unarchive',
  unarchive: 'archive',
  replied: 'unreplied',
  unreplied: 'replied',
}

/**
 * Which message to open after `removed` leave the visible list: the next one
 * below the open message, else the one above, else none. Unchanged when the
 * open message stays.
 */
export function nextAfterRemoval(list: readonly InboxMessage[], removed: ReadonlySet<string>, openId: string | null): string | null {
  if (!openId || !removed.has(openId)) return openId
  const at = list.findIndex((m) => m.id === openId)
  if (at === -1) return null
  for (let i = at + 1; i < list.length; i++) if (!removed.has(list[i].id)) return list[i].id
  for (let i = at - 1; i >= 0; i--) if (!removed.has(list[i].id)) return list[i].id
  return null
}

/** Keep only selected ids that are still visible. */
export function pruneSelection(selected: ReadonlySet<string>, list: readonly InboxMessage[]): Set<string> {
  const visible = new Set(list.map((m) => m.id))
  return new Set(Array.from(selected).filter((id) => visible.has(id)))
}

/** Longest mailto: the composer hands to a mail app (some clients refuse longer URLs). */
export const MAILTO_MAX = 1900

/**
 * mailto: for answering from the owner's own mail app (no SMTP on the
 * server). The body is shortened at a line break when the URL would be too
 * long, with a note that the rest was cut.
 */
export function mailtoHref(to: string, subject: string, body: string): string {
  const head = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=`
  let text = body
  let href = head + encodeURIComponent(text)
  if (href.length <= MAILTO_MAX) return href
  const note = '\n\n[…]'
  while (text.length && href.length > MAILTO_MAX) {
    const cut = text.lastIndexOf('\n', Math.max(0, Math.floor(text.length * 0.85)))
    text = text.slice(0, cut > 0 ? cut : Math.floor(text.length * 0.85))
    href = head + encodeURIComponent(text + note)
  }
  return href
}
