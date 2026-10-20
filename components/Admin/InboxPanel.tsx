import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Grid,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  useBreakpointValue,
  useClipboard,
  useToast,
  VisuallyHidden,
} from '@chakra-ui/react'
import { SearchIcon } from '@chakra-ui/icons'
import {
  FaArchive,
  FaArrowLeft,
  FaCheck,
  FaCopy,
  FaEnvelope,
  FaEnvelopeOpen,
  FaInbox,
  FaRedo,
  FaRegStar,
  FaReply,
  FaStar,
  FaTrashAlt,
} from 'react-icons/fa'
import { Eyebrow, MONO, Panel, SessionExpiredNotice, inputProps, outlineButtonProps, primaryButtonProps, useIsMac } from './shell/ui'
import { readJsonObject } from './shell/http'
import { NETWORK_ERROR } from './shell/authMessages'
import { formatBytes, formatWhen, relative } from './shell/inboxFormat'
import SegmentedTabs, { tabPanelProps } from './shell/SegmentedTabs'
import { useListKeyboard } from './shell/useListKeyboard'
import { isTextEntryTarget } from './shell/listKeys'
import { useAdminCommands } from './shell/useAdminCommands'
import InquiryDetails, { IntentBadge } from './inbox/InquiryDetails'
import UndoToast from './inbox/UndoToast'
import { useDeferredDelete, UNDO_MS } from './inbox/useDeferredDelete'
import type { ComposerDraft, ReplyIdentity } from './inbox/ReplyComposer'
import {
  FOLDER_LABEL,
  INBOX_FOLDERS,
  INVERSE_ACTION,
  applyAction,
  folderCounts,
  kindCounts,
  nextAfterRemoval,
  pruneSelection,
  visibleMessages,
  type InboxAction,
  type InboxFolder,
  type InboxMessage,
  type KindFilter,
} from './inbox/inboxView'
import { INTENT_LABEL } from '../../lib/inquiry'
import { detectReplyLang } from '../../lib/inboxReply'
import { retentionPeriodText } from '../../lib/retention'
import { getShortcutsEnabled, isImeComposing } from '../../lib/keyboardShortcuts'

export type { InboxMessage } from './inbox/inboxView'

/**
 * Admin Inbox — every message sent through the public contact form
 * (GET/POST /api/admin/inbox; replies: /api/admin/inbox/reply).
 *
 *   - folders (Inbox / Starred / Archived / All), the inquiry kind from the
 *     structured fields, search (every word; is:unread, kind:role, …);
 *   - star, archive, read / unread, replied — one message or a selection;
 *   - reply by e-mail from here (threaded, EN / 中文 templates), or — without
 *     SMTP on the server — the same draft through the owner's mail app;
 *   - delete takes effect at once with Undo (the request goes out when the
 *     Undo toast closes or the page is left);
 *   - keyboard: j / k (↑ ↓) move, Enter / o open, x select, s star, e archive,
 *     r reply, u unread, # delete, ⌘Z undo — single keys follow the admin's
 *     shortcut switch.
 *
 * Messages are stored even when e-mail delivery is not configured; the
 * server pauses storing only at its site-wide caps (messages per day, total
 * size), which this panel explains when reached.
 */

const ReplyComposer = dynamic(() => import('./inbox/ReplyComposer'), {
  ssr: false,
  loading: () => <Skeleton h="260px" borderRadius="lg" startColor="page.bg-elevated" endColor="page.bg-overlay" />,
})
const TemplatesDialog = dynamic(() => import('./inbox/TemplatesDialog'), { ssr: false })

type LoadState = 'loading' | 'ready' | 'error' | 'session'

type Storage = {
  bytes: number
  maxBytes: number
  storedToday: number
  dailyLimit: number
  paused: 'daily-limit' | 'inbox-full' | null
}

/** Show the storage note from this fill level on, before the cap is hit. */
const STORAGE_WARN_RATIO = 0.8
const RETURN_PATH = '/admin/dashboard?tab=inbox'
const REFRESH_MS = 60_000
/** A message previewed by moving through the list counts as read after this long. */
const PREVIEW_READ_MS = 1200
const LIST_ACTION_KEYS = ['s', 'e', 'r', 'u', '#', 'Delete', 'Backspace'] as const
const NO_TEMPLATES: ReplyIdentity['templates'] = {}

function parseStorage(raw: unknown): Storage | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    bytes: num(s.bytes),
    maxBytes: num(s.maxBytes),
    storedToday: num(s.storedToday),
    dailyLimit: num(s.dailyLimit),
    paused: s.paused === 'daily-limit' || s.paused === 'inbox-full' ? s.paused : null,
  }
}

/** Server rows with every field the view reads (older servers / partial rows). */
function normalizeMessages(raw: unknown): InboxMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m): m is Record<string, any> => !!m && typeof m === 'object' && typeof m.id === 'string')
    .map((m) => ({
      ...(m as InboxMessage),
      starred: m.starred === true,
      archived: m.archived === true,
      replied: m.replied === true,
      replies: Array.isArray(m.replies) ? m.replies : [],
    }))
}

const ACTION_TOAST: Partial<Record<InboxAction, (n: number) => string>> = {
  archive: (n) => (n === 1 ? 'Archived' : `${n} messages archived`),
  unarchive: (n) => (n === 1 ? 'Moved to the inbox' : `${n} messages moved to the inbox`),
}

export default function InboxPanel({ onUnreadChange }: { onUnreadChange?: (unread: number) => void }) {
  const toast = useToast()
  const isMac = useIsMac()
  const wide = useBreakpointValue({ base: false, md: true }, { ssr: false }) ?? false
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [storage, setStorage] = useState<Storage | null>(null)
  const [truncated, setTruncated] = useState(false)
  /** CONTACT_RETENTION_DAYS as the server applies it (0 = no automatic expiry); null until loaded. */
  const [retentionDays, setRetentionDays] = useState<number | null>(null)
  const [folder, setFolder] = useState<InboxFolder>('inbox')
  const [kind, setKind] = useState<KindFilter>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [composerFor, setComposerFor] = useState<string | null>(null)
  const [identity, setIdentity] = useState<ReplyIdentity | null>(null)
  const [identityError, setIdentityError] = useState('')
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [draftIds, setDraftIds] = useState<ReadonlySet<string>>(() => new Set())
  const [now, setNow] = useState(() => Date.now())
  const drafts = useRef(new Map<string, ComposerDraft>())
  const lastArchive = useRef<{ ids: string[]; at: number; toast: ReturnType<typeof toast> } | null>(null)
  const lastArchiveAction = useRef<InboxAction>('unarchive')
  const detailRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const undoKeys = isMac ? '⌘Z' : 'Ctrl+Z'

  // ── Loading ──────────────────────────────────────────────────────────────

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState((s) => (s === 'ready' ? s : 'loading'))
    try {
      const res = await fetch('/api/admin/inbox', { cache: 'no-store', credentials: 'same-origin' })
      if (res.status === 401 || res.status === 403) {
        setState('session')
        return
      }
      const body = await readJsonObject(res)
      if (!res.ok || !Array.isArray(body.messages)) throw new Error(body.error || `HTTP ${res.status}`)
      setMessages(normalizeMessages(body.messages))
      setStorage(parseStorage(body.storage))
      setTruncated(body.truncated === true)
      setRetentionDays(typeof body.retentionDays === 'number' && body.retentionDays >= 0 ? body.retentionDays : null)
      setNow(Date.now())
      setState('ready')
    } catch (e) {
      if (quiet) return
      setError(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : NETWORK_ERROR)
      setState('error')
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const loadIdentity = useCallback(async () => {
    setIdentityError('')
    try {
      const res = await fetch('/api/admin/inbox/reply', { cache: 'no-store', credentials: 'same-origin' })
      if (res.status === 401 || res.status === 403) {
        setState('session')
        return
      }
      const body = await readJsonObject(res)
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setIdentity({
        smtp: body.smtp === true,
        smtpHost: typeof body.smtpHost === 'string' ? body.smtpHost : null,
        from: typeof body.from === 'string' ? body.from : null,
        fromSource: body.fromSource ?? null,
        replyTo: typeof body.replyTo === 'string' ? body.replyTo : null,
        ownerName: { en: String(body.ownerName?.en || ''), zh: String(body.ownerName?.zh || '') },
        alignment: body.alignment && typeof body.alignment === 'object' ? body.alignment : null,
        templates: body.templates && typeof body.templates === 'object' ? body.templates : {},
      })
    } catch (e) {
      setIdentityError(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : NETWORK_ERROR)
    }
  }, [])

  // ── Server writes ────────────────────────────────────────────────────────

  const post = useCallback(async (payload: Record<string, unknown>, keepalive = false) => {
    const res = await fetch('/api/admin/inbox', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive,
    })
    if (res.status === 401 || res.status === 403) {
      setState('session')
      throw new Error('session')
    }
    const body = await readJsonObject(res)
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
    const nextStorage = parseStorage(body.storage)
    if (nextStorage) setStorage(nextStorage)
    return body
  }, [])

  /** Change a status optimistically; on failure the previous state comes back with an error toast. */
  const act = useCallback(
    async (action: InboxAction, ids: string[], { quiet = false }: { quiet?: boolean } = {}) => {
      if (!ids.length) return false
      const before = messagesRef.current
      setMessages((list) => applyAction(list, ids, action))
      try {
        await post({ action, ids })
        return true
      } catch (e) {
        setMessages((list) => {
          const reverted = new Map(before.filter((m) => ids.includes(m.id)).map((m) => [m.id, m]))
          return list.map((m) => reverted.get(m.id) ?? m)
        })
        if (!(e instanceof Error && e.message === 'session') && !quiet) {
          toast({
            status: 'error',
            title: 'Inbox update failed',
            description: e instanceof Error && e.message !== 'Failed to fetch' ? e.message : NETWORK_ERROR,
            position: 'bottom-right',
          })
        }
        return false
      }
    },
    [post, toast],
  )

  const deferred = useDeferredDelete({
    undoKeys,
    commit: async (ids, keepalive) => {
      try {
        await post({ action: 'delete', ids }, keepalive)
        return true
      } catch {
        return false
      }
    },
    onDeleted: (ids) => {
      const gone = new Set(ids)
      setMessages((list) => list.filter((m) => !gone.has(m.id)))
      ids.forEach((id) => drafts.current.delete(id))
    },
    onRestored: (ids) => {
      // Undo puts you back where you were: the restored message opens when nothing else is.
      setOpenId((current) => current ?? ids[0] ?? null)
    },
    onFailed: (ids) => {
      if (!ids.length) return
      toast({
        status: 'error',
        title: ids.length === 1 ? 'The message was not deleted' : `${ids.length} messages were not deleted`,
        description: 'It is back in the list. Check the connection and try again.',
        position: 'bottom-right',
      })
    },
  })

  // ── Derived view ─────────────────────────────────────────────────────────

  const view = useMemo(() => visibleMessages(messages, { folder, kind, query, hidden: deferred.hidden }), [messages, folder, kind, query, deferred.hidden])
  const counts = useMemo(() => folderCounts(messages, deferred.hidden), [messages, deferred.hidden])
  const kinds = useMemo(() => kindCounts(messages, folder, deferred.hidden), [messages, folder, deferred.hidden])
  const open = useMemo(() => (openId && !deferred.hidden.has(openId) ? messages.find((m) => m.id === openId) || null : null), [messages, openId, deferred.hidden])
  const undelivered = useMemo(() => messages.filter((m) => m.delivered === false && !deferred.hidden.has(m.id)).length, [messages, deferred.hidden])
  const selectedVisible = useMemo(() => view.filter((m) => selected.has(m.id)), [view, selected])

  useEffect(() => {
    onUnreadChange?.(counts.inbox.unread)
  }, [counts.inbox.unread, onUnreadChange])

  // Selection only ever holds visible messages.
  useEffect(() => {
    setSelected((s) => {
      const next = pruneSelection(s, view)
      return next.size === s.size ? s : next
    })
  }, [view])

  const { onCopy, hasCopied, setValue } = useClipboard('')
  useEffect(() => setValue(open?.email || ''), [open, setValue])

  // ── Opening and moving ───────────────────────────────────────────────────

  const previewTimer = useRef<number | null>(null)
  const clearPreviewTimer = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current)
    previewTimer.current = null
  }
  useEffect(() => clearPreviewTimer, [])

  /** Open a message. `preview`: moved onto it in the list — it counts as read after a moment. */
  const openMessage = useCallback(
    (m: InboxMessage, how: 'explicit' | 'preview' = 'explicit') => {
      clearPreviewTimer()
      setOpenId(m.id)
      if (m.read) return
      if (how === 'explicit') void act('read', [m.id], { quiet: true })
      else
        previewTimer.current = window.setTimeout(() => {
          previewTimer.current = null
          void act('read', [m.id], { quiet: true })
        }, PREVIEW_READ_MS)
    },
    [act],
  )

  const kb = useListKeyboard({
    count: view.length,
    global: true,
    actions: LIST_ACTION_KEYS,
    onSelect: (i) => {
      const id = view[i]?.id
      if (id) toggleSelected(id)
    },
    onOpen: (i) => {
      const m = view[i]
      if (!m) return
      openMessage(m)
      if (!wide) requestAnimationFrame(() => detailRef.current?.querySelector<HTMLElement>('[data-detail-heading]')?.focus())
    },
    onActiveChange: (i) => {
      const m = view[i]
      // Desktop: the reading pane follows the list (like a mail client).
      if (m && wide) openMessage(m, 'preview')
    },
    onAction: (key, i) => {
      const m = view[i]
      if (m) runKey(key, [m.id], m)
    },
  })

  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /**
   * Messages are leaving the list (archive, delete): open the next one (the
   * one above at the end) and keep keyboard focus in the list when it was
   * there, so j / k / e / # can go on.
   */
  const stepAway = (ids: string[]) => {
    const removed = new Set(ids)
    const remaining = view.filter((m) => !removed.has(m.id))
    const listHadFocus = !!document.activeElement?.closest('[data-testid="inbox-list"]')
    const nextId = nextAfterRemoval(view, removed, openId)
    setComposerFor((c) => (c && removed.has(c) ? null : c))
    // The rows re-render without the removed ones before the next frame.
    const focusRow = (idx: number) =>
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="inbox-list"] [data-list-item="${idx}"]`)?.focus())
    if (nextId === openId) {
      const keep = Math.max(0, Math.min(kb.active, remaining.length - 1))
      if (remaining.length) kb.setActive(keep)
      if (listHadFocus && remaining.length) focusRow(keep)
      return
    }
    const idx = nextId ? remaining.findIndex((m) => m.id === nextId) : -1
    if (idx < 0) {
      setOpenId(null)
      return
    }
    kb.setActive(idx)
    openMessage(remaining[idx], 'preview')
    if (listHadFocus) focusRow(idx)
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  const archive = async (ids: string[]) => {
    const target = messagesRef.current.filter((m) => ids.includes(m.id))
    const unarchive = target.every((m) => m.archived)
    const action: InboxAction = unarchive ? 'unarchive' : 'archive'
    if (folder !== 'all') stepAway(ids)
    setSelected(new Set())
    const ok = await act(action, ids)
    if (!ok) return
    const title = ACTION_TOAST[action]?.(ids.length) || 'Done'
    if (lastArchive.current) toast.close(lastArchive.current.toast)
    const id = toast({
      position: 'bottom-right',
      duration: UNDO_MS,
      render: ({ onClose }) => (
        <UndoToast
          title={title}
          undoKeys={undoKeys}
          onClose={onClose}
          onUndo={() => {
            onClose()
            lastArchive.current = null
            void act(INVERSE_ACTION[action], ids)
            setOpenId((current) => current ?? ids[0] ?? null)
          }}
        />
      ),
    })
    lastArchive.current = { ids, at: Date.now(), toast: id }
    // Remember the inverse for ⌘Z.
    lastArchiveAction.current = INVERSE_ACTION[action]
  }

  const remove = (ids: string[]) => {
    stepAway(ids)
    setSelected(new Set())
    deferred.remove(ids)
  }

  const toggleStar = (ids: string[]) => {
    const list = messagesRef.current.filter((m) => ids.includes(m.id))
    void act(list.every((m) => m.starred) ? 'unstar' : 'star', ids)
  }

  const toggleRead = (ids: string[]) => {
    const list = messagesRef.current.filter((m) => ids.includes(m.id))
    clearPreviewTimer()
    void act(list.every((m) => m.read) ? 'unread' : 'read', ids)
  }

  const toggleReplied = (m: InboxMessage) => {
    if (m.replied && m.replies.length) {
      toast({ status: 'info', title: 'Replied from here', description: 'A message you answered from the Inbox stays marked as replied.', position: 'bottom-right' })
      return
    }
    void act(m.replied ? 'unreplied' : 'replied', [m.id])
  }

  const startReply = (m: InboxMessage) => {
    setOpenId(m.id)
    setComposerFor(m.id)
    if (!identity) void loadIdentity()
    requestAnimationFrame(() => detailRef.current?.querySelector('[data-testid="reply-composer"]')?.scrollIntoView?.({ block: 'nearest' }))
  }

  /** A single-key action on messages (list row, open message or selection). */
  function runKey(key: string, ids: string[], m: InboxMessage | null) {
    switch (key) {
      case 's':
        toggleStar(ids)
        break
      case 'e':
        void archive(ids)
        break
      case 'u':
        toggleRead(ids)
        break
      case 'r':
        if (m) startReply(m)
        break
      case '#':
      case 'Delete':
      case 'Backspace':
        remove(ids)
        break
    }
  }

  // Keys on the open message (focus in the reading pane), and ⌘Z anywhere outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isImeComposing(e) || isTextEntryTarget(e.target)) return
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
        if (deferred.undoLast()) {
          e.preventDefault()
          return
        }
        const last = lastArchive.current
        if (last && Date.now() - last.at < UNDO_MS) {
          e.preventDefault()
          toast.close(last.toast)
          lastArchive.current = null
          void act(lastArchiveAction.current, last.ids)
        }
        return
      }
      const detail = detailRef.current
      if (!open || !detail || !detail.contains(e.target as Node)) return
      if (e.metaKey || e.ctrlKey || e.altKey || !getShortcutsEnabled()) return
      if ((e.target as HTMLElement).closest('[data-testid="reply-composer"]')) return
      const key = e.key
      if (key === 'j' || key === 'k') {
        const at = view.findIndex((x) => x.id === open.id)
        const next = view[at + (key === 'j' ? 1 : -1)]
        if (next) {
          e.preventDefault()
          openMessage(next)
          kb.setActive(view.indexOf(next))
        }
        return
      }
      if ((LIST_ACTION_KEYS as readonly string[]).includes(key)) {
        e.preventDefault()
        runKey(key, [open.id], open)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // The ⌘K palette offers the Inbox's actions while it is on screen (H14).
  const who = open ? open.name || open.email : ''
  useAdminCommands(
    'inbox',
    [
      { id: 'search', label: 'Search messages', keywords: 'find filter inbox', run: () => searchRef.current?.focus() },
      { id: 'unread', label: 'Show unread messages', keywords: 'filter is:unread inbox', run: () => {
        setFolder('inbox')
        setQuery('is:unread')
      } },
      ...INBOX_FOLDERS.filter((f) => f !== folder).map((f) => ({ id: `folder-${f}`, label: `Inbox folder: ${FOLDER_LABEL[f]}`, keywords: 'inbox folder show', run: () => {
        setFolder(f)
        setSelected(new Set())
      } })),
      { id: 'templates', label: 'Edit reply templates', keywords: 'inbox reply template english chinese', run: () => {
        if (!identity) void loadIdentity()
        setTemplatesOpen(true)
      } },
      ...(open
        ? [
            { id: 'reply', label: `Reply to ${who}`, shortcut: 'R', keywords: 'inbox answer email respond', run: () => startReply(open) },
            { id: 'archive', label: open.archived ? `Move ${who}’s message to the inbox` : `Archive ${who}’s message`, shortcut: 'E', keywords: 'inbox archive done', run: () => void archive([open.id]) },
            { id: 'star', label: open.starred ? `Unstar ${who}’s message` : `Star ${who}’s message`, shortcut: 'S', keywords: 'inbox star flag important', run: () => toggleStar([open.id]) },
            { id: 'read', label: open.read ? `Mark ${who}’s message unread` : `Mark ${who}’s message read`, shortcut: 'U', keywords: 'inbox read unread', run: () => toggleRead([open.id]) },
            { id: 'replied', label: open.replied ? `${who}’s message is replied` : `Mark ${who}’s message as replied`, keywords: 'inbox replied answered done', run: () => toggleReplied(open) },
            { id: 'delete', label: `Delete ${who}’s message`, shortcut: '#', keywords: 'inbox delete remove trash', run: () => remove([open.id]) },
          ]
        : []),
      ...(selectedVisible.length
        ? [
            { id: 'bulk-archive', label: `Archive ${selectedVisible.length} selected`, keywords: 'inbox bulk selection', run: () => void archive(selectedVisible.map((m) => m.id)) },
            { id: 'bulk-read', label: `Mark ${selectedVisible.length} selected read / unread`, keywords: 'inbox bulk selection', run: () => toggleRead(selectedVisible.map((m) => m.id)) },
            { id: 'bulk-delete', label: `Delete ${selectedVisible.length} selected`, keywords: 'inbox bulk selection', run: () => remove(selectedVisible.map((m) => m.id)) },
          ]
        : []),
    ],
    `${folder}|${open?.id ?? ''}|${open?.read}|${open?.starred}|${open?.archived}|${open?.replied}|${selectedVisible.length}`,
  )

  // ── Rendering ────────────────────────────────────────────────────────────

  const storageNote = (() => {
    if (!storage) return null
    if (storage.paused === 'inbox-full') {
      return {
        status: 'warning' as const,
        text: `The inbox is full (${formatBytes(storage.bytes)} of ${formatBytes(storage.maxBytes)}). New messages are only emailed to you — or refused when email isn’t configured — until you delete some here.`,
      }
    }
    if (storage.paused === 'daily-limit') {
      return {
        status: 'warning' as const,
        text: `${storage.storedToday} messages arrived today, the daily maximum the inbox stores. Until midnight (UTC) new messages are only emailed to you — or refused when email isn’t configured.`,
      }
    }
    if (storage.maxBytes > 0 && storage.bytes >= storage.maxBytes * STORAGE_WARN_RATIO) {
      return {
        status: 'info' as const,
        text: `The inbox is ${Math.round((storage.bytes / storage.maxBytes) * 100)}% full (${formatBytes(storage.bytes)} of ${formatBytes(storage.maxBytes)}). Delete messages you no longer need so new ones can still be stored.`,
      }
    }
    return null
  })()

  const onDraftChange = useCallback(
    (id: string) => (draft: ComposerDraft | null) => {
      const had = drafts.current.has(id)
      if (draft) drafts.current.set(id, draft)
      else drafts.current.delete(id)
      if (had !== !!draft)
        setDraftIds((s) => {
          const next = new Set(s)
          if (draft) next.add(id)
          else next.delete(id)
          return next
        })
    },
    [],
  )

  // Unsent replies survive switching messages, not leaving the page: warn first.
  useEffect(() => {
    if (!draftIds.size) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [draftIds])

  if (state === 'session') return <SessionExpiredNotice returnPath={RETURN_PATH} />

  const allSelected = view.length > 0 && selectedVisible.length === view.length
  const someSelected = selectedVisible.length > 0 && !allSelected
  const bulkIds = selectedVisible.map((m) => m.id)
  const filtering = !!query.trim() || kind !== 'all'
  const tabItems = INBOX_FOLDERS.map((f) => ({
    key: f,
    label: f === 'inbox' && counts.inbox.unread ? `${FOLDER_LABEL[f]} · ${counts.inbox.unread}` : f === 'all' ? FOLDER_LABEL[f] : `${FOLDER_LABEL[f]}${counts[f].total ? ` · ${counts[f].total}` : ''}`,
  }))

  return (
    <Stack spacing={4}>
      <Flex align="center" justify="space-between" gap={3} wrap="wrap">
        <Box>
          <Eyebrow accent>[inbox]</Eyebrow>
          <Text fontSize="lg" fontWeight={600} mt={1}>
            Messages
            {state === 'ready' ? (
              <Text as="span" ml={2} fontFamily={MONO} fontSize="12px" color="page.fg-secondary" fontWeight={400}>
                {counts.all.total} total · {counts.inbox.unread} unread
              </Text>
            ) : null}
          </Text>
          {state === 'ready' && retentionDays !== null ? (
            <Text mt={1} fontSize="12px" color="page.fg-secondary" data-retention="">
              {retentionDays > 0
                ? `Messages are deleted automatically after ${retentionPeriodText(retentionDays)} (CONTACT_RETENTION_DAYS), as the contact form says.`
                : 'Automatic deletion is off (CONTACT_RETENTION_DAYS=0): messages stay until you delete them.'}
            </Text>
          ) : null}
        </Box>
        <HStack spacing={2}>
          <Button size="sm" variant="ghost" color="page.fg-secondary" onClick={() => {
            if (!identity) void loadIdentity()
            setTemplatesOpen(true)
          }}>
            Reply templates
          </Button>
          <Button size="sm" leftIcon={<FaRedo aria-hidden />} {...outlineButtonProps} onClick={() => void load()} isLoading={state === 'loading'}>
            Refresh
          </Button>
        </HStack>
      </Flex>

      {undelivered > 0 ? (
        <Alert status="info" variant="left-accent" borderRadius="md" bg="page.bg-elevated" fontSize="sm">
          <AlertIcon />
          <AlertDescription>
            {undelivered === 1 ? 'One message was' : `${undelivered} messages were`} not emailed to you because email delivery (SMTP) is not configured or
            failed. They are safe here — answer them from this page.
          </AlertDescription>
        </Alert>
      ) : null}

      {state === 'ready' && storageNote ? (
        <Alert status={storageNote.status} variant="left-accent" borderRadius="md" bg="page.bg-elevated" fontSize="sm">
          <AlertIcon />
          <AlertDescription>{storageNote.text}</AlertDescription>
        </Alert>
      ) : null}

      {state === 'ready' && truncated ? (
        <Text fontSize="sm" color="page.fg-secondary">
          Showing the newest messages only — older ones are still kept in data/contact-inbox.jsonl on the server.
        </Text>
      ) : null}

      {state === 'error' ? (
        <Alert status="error" variant="left-accent" borderRadius="md" bg="page.bg-elevated" gap={3} flexWrap="wrap">
          <AlertIcon />
          <AlertDescription flex={1} fontSize="sm">
            Couldn’t load the inbox ({error}).
          </AlertDescription>
          <Button size="sm" {...outlineButtonProps} onClick={() => void load()}>
            Retry
          </Button>
        </Alert>
      ) : null}

      {state === 'loading' ? (
        <Stack spacing={2}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h="68px" borderRadius="lg" startColor="page.bg-elevated" endColor="page.bg-overlay" />
          ))}
        </Stack>
      ) : null}

      {state === 'ready' && counts.all.total === 0 ? (
        <Panel textAlign="center" py={14}>
          <Box as={FaInbox} mx="auto" boxSize="28px" color="page.fg-secondary" aria-hidden />
          <Text mt={4} fontWeight={600}>
            No messages yet
          </Text>
          <Text mt={1} fontSize="sm" color="page.fg-secondary" maxW="420px" mx="auto">
            Everything sent through the contact form lands here — even when email delivery isn’t configured.
          </Text>
        </Panel>
      ) : null}

      {state === 'ready' && counts.all.total > 0 ? (
        <>
          {/* On phones an open message takes the screen; its "All messages" button brings the list back. */}
          <Flex gap={2} align="center" wrap="wrap" display={{ base: open ? 'none' : 'flex', md: 'flex' }}>
            <SegmentedTabs items={tabItems} value={folder} onSelect={(f) => {
              setFolder(f)
              setSelected(new Set())
            }} label="Inbox folders" idPrefix="inbox-folder" size="sm" />
            <InputGroup size="sm" flex="1 1 220px" maxW={{ base: '100%', lg: '360px' }}>
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="page.fg-secondary" boxSize={3} />
              </InputLeftElement>
              <Input
                ref={searchRef}
                {...inputProps}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && query) {
                    e.preventDefault()
                    setQuery('')
                  } else if (e.key === 'ArrowDown' && view.length) {
                    e.preventDefault()
                    kb.focusItem(0)
                  }
                }}
                placeholder="Search messages"
                title="Every word must match. Also: is:unread, is:starred, is:replied, is:unreplied, is:archived, is:not-emailed, kind:role, kind:freelance, kind:collab, kind:other"
                aria-label="Search messages"
                maxLength={120}
              />
            </InputGroup>
            <Select size="sm" {...inputProps} w={{ base: '100%', sm: '200px' }} value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} aria-label="Kind of inquiry">
              <option value="all">Every kind ({kinds.all})</option>
              {(['role', 'freelance', 'collab', 'other'] as const).map((k) => (
                <option key={k} value={k}>
                  {INTENT_LABEL[k]} ({kinds[k]})
                </option>
              ))}
            </Select>
          </Flex>

          <Grid templateColumns={{ base: '1fr', md: 'minmax(270px, 360px) minmax(0, 1fr)' }} gap={4} alignItems="start">
            {/* List — on phones it gives way to the open message. */}
            <Box display={{ base: open ? 'none' : 'block', md: 'block' }} minW={0} {...tabPanelProps('inbox-folder', folder)}>
              <Flex
                align="center"
                gap={2}
                px={3}
                minH="40px"
                border="1px solid"
                borderColor="page.border"
                borderBottom="none"
                borderTopRadius="xl"
                bg={selectedVisible.length ? 'page.bg-overlay' : 'page.bg-elevated'}
                flexWrap="wrap"
              >
                <Checkbox
                  size="sm"
                  colorScheme="purple"
                  isChecked={allSelected}
                  isIndeterminate={someSelected}
                  isDisabled={!view.length}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(view.map((m) => m.id)))}
                  aria-label={allSelected ? 'Select none' : 'Select every message shown'}
                />
                {selectedVisible.length ? (
                  <>
                    <Text fontSize="xs" fontWeight={600} className="tnum" mr="auto">
                      {selectedVisible.length} selected
                    </Text>
                    <BulkButton label="Mark read / unread" icon={<FaEnvelopeOpen />} onClick={() => toggleRead(bulkIds)} />
                    <BulkButton label="Star / unstar" icon={<FaStar />} onClick={() => toggleStar(bulkIds)} />
                    <BulkButton
                      label={selectedVisible.every((m) => m.archived) ? 'Move to the inbox' : 'Archive'}
                      icon={selectedVisible.every((m) => m.archived) ? <FaInbox /> : <FaArchive />}
                      onClick={() => void archive(bulkIds)}
                    />
                    <BulkButton label="Delete" icon={<FaTrashAlt />} onClick={() => remove(bulkIds)} danger />
                  </>
                ) : (
                  <Text fontSize="xs" color="page.fg-secondary" className="tnum">
                    {view.length === 1 ? '1 message' : `${view.length} messages`}
                    {filtering ? ' match' : ''}
                  </Text>
                )}
              </Flex>
              <Box
                {...kb.listProps}
                role="list"
                aria-label={`Messages — ${FOLDER_LABEL[folder]}`}
                border="1px solid"
                borderColor="page.border"
                borderBottomRadius="xl"
                overflow="hidden"
                maxH={{ md: 'calc(var(--admin-workspace-h, 80vh) - 150px)' }}
                overflowY="auto"
                data-testid="inbox-list"
              >
                {view.length === 0 ? (
                  <Box px={4} py={10} textAlign="center">
                    <Text fontSize="sm" fontWeight={600}>
                      {filtering ? 'Nothing matches' : folder === 'archived' ? 'Nothing archived' : folder === 'starred' ? 'No starred messages' : 'Inbox zero'}
                    </Text>
                    <Text fontSize="xs" color="page.fg-secondary" mt={1} maxW="36ch" mx="auto">
                      {filtering
                        ? 'Try other words, another kind or folder — or is:unread, is:starred, is:replied, kind:role.'
                        : folder === 'inbox'
                          ? 'Every message is archived. New ones arrive here.'
                          : 'Messages you star or archive show up here.'}
                    </Text>
                    {filtering ? (
                      <Button size="xs" mt={3} {...outlineButtonProps} onClick={() => {
                        setQuery('')
                        setKind('all')
                      }}>
                        Clear the filters
                      </Button>
                    ) : null}
                  </Box>
                ) : (
                  view.map((m, i) => (
                    <MessageRow
                      key={m.id}
                      m={m}
                      first={i === 0}
                      active={m.id === openId}
                      selected={selected.has(m.id)}
                      hasDraft={draftIds.has(m.id)}
                      rowTabbable={i === (kb.active === -1 ? 0 : kb.active)}
                      itemProps={kb.itemProps(i)}
                      now={now}
                      onOpen={() => {
                        kb.setActive(i)
                        openMessage(m)
                        if (!wide) requestAnimationFrame(() => detailRef.current?.querySelector<HTMLElement>('[data-detail-heading]')?.focus())
                      }}
                      onToggleSelect={() => toggleSelected(m.id)}
                      onToggleStar={() => toggleStar([m.id])}
                    />
                  ))
                )}
              </Box>
            </Box>

            {/* Reading pane */}
            <Box
              ref={detailRef}
              border="1px solid"
              borderColor="page.border"
              borderRadius="xl"
              bg="page.bg"
              p={{ base: 4, md: 5 }}
              display={{ base: open ? 'block' : 'none', md: 'block' }}
              minH={{ md: '360px' }}
              minW={0}
              data-testid="inbox-detail"
            >
              {open ? (
                <Stack spacing={4}>
                  <Button
                    display={{ base: 'inline-flex', md: 'none' }}
                    alignSelf="flex-start"
                    size="sm"
                    variant="ghost"
                    leftIcon={<FaArrowLeft aria-hidden />}
                    onClick={() => setOpenId(null)}
                  >
                    All messages
                  </Button>
                  <Box>
                    <Text as="h3" data-detail-heading="" tabIndex={-1} fontSize="xl" fontWeight={600} lineHeight="1.25" wordBreak="break-word" _focusVisible={{ outline: 'none' }}>
                      {open.subject || '(no subject)'}
                    </Text>
                    <Flex mt={2} gap={2} wrap="wrap" align="center" fontSize="sm">
                      <Text fontWeight={600}>{open.name || 'Anonymous'}</Text>
                      <Text color="page.fg-secondary" wordBreak="break-all">
                        &lt;{open.email}&gt;
                      </Text>
                      <Tooltip label={hasCopied ? 'Copied' : 'Copy address'} hasArrow>
                        <IconButton size="xs" variant="ghost" onClick={onCopy} aria-label="Copy email address" icon={<FaCopy />} minW="24px" h="24px" />
                      </Tooltip>
                    </Flex>
                    <Flex mt={1} gap={2} wrap="wrap" fontFamily={MONO} fontSize="11px" color="page.fg-secondary">
                      <Text>{formatWhen(open.at)}</Text>
                      <Text aria-hidden>·</Text>
                      <Text>{open.delivered === true ? 'emailed to you' : open.delivered === false ? 'not emailed' : 'email status unknown'}</Text>
                      {open.replied ? (
                        <>
                          <Text aria-hidden>·</Text>
                          <Text color="status.open">
                            {open.replies.length ? `replied ${relative(open.replies[open.replies.length - 1].at, Date.now())}` : 'marked as replied'}
                          </Text>
                        </>
                      ) : null}
                      {open.archived ? (
                        <>
                          <Text aria-hidden>·</Text>
                          <Text>archived</Text>
                        </>
                      ) : null}
                    </Flex>
                  </Box>

                  <Flex gap={2} wrap="wrap" role="toolbar" aria-label="Message actions">
                    <Button size="sm" leftIcon={<FaReply aria-hidden />} {...primaryButtonProps} onClick={() => startReply(open)} aria-keyshortcuts="R">
                      {draftIds.has(open.id) ? 'Continue reply' : 'Reply'}
                    </Button>
                    <DetailButton label={open.starred ? 'Unstar' : 'Star'} icon={open.starred ? <FaStar /> : <FaRegStar />} keys="S" onClick={() => toggleStar([open.id])} pressed={open.starred} />
                    <DetailButton label={open.archived ? 'Move to inbox' : 'Archive'} icon={open.archived ? <FaInbox /> : <FaArchive />} keys="E" onClick={() => void archive([open.id])} />
                    <DetailButton label={open.read ? 'Mark unread' : 'Mark read'} icon={open.read ? <FaEnvelope /> : <FaEnvelopeOpen />} keys="U" onClick={() => toggleRead([open.id])} />
                    <DetailButton
                      label={open.replied ? 'Replied' : 'Mark replied'}
                      icon={<FaCheck />}
                      onClick={() => toggleReplied(open)}
                      pressed={open.replied}
                    />
                    <DetailButton label="Delete" icon={<FaTrashAlt />} keys="#" onClick={() => remove([open.id])} danger />
                  </Flex>

                  <InquiryDetails meta={open.meta} />
                  <Box borderTop="1px solid" borderColor="page.border" pt={4} whiteSpace="pre-wrap" wordBreak="break-word" fontSize="15px" lineHeight="1.7" lang={detectReplyLang(open.message) === 'zh' ? 'zh-CN' : undefined}>
                    {open.message}
                  </Box>

                  {open.replies.length ? (
                    <Box as="section" aria-label="Your replies" borderTop="1px solid" borderColor="page.border" pt={4}>
                      <Text fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary" mb={2}>
                        Your replies
                      </Text>
                      <Stack spacing={2}>
                        {open.replies.map((r) => (
                          <SentReply key={`${r.at}-${r.messageId || ''}`} reply={r} />
                        ))}
                      </Stack>
                    </Box>
                  ) : null}

                  {composerFor === open.id ? (
                    <ReplyComposer
                      key={open.id}
                      message={open}
                      identity={identity}
                      identityError={identityError}
                      initial={drafts.current.get(open.id) ?? null}
                      onDraftChange={onDraftChange(open.id)}
                      onSent={(updated) => {
                        setComposerFor(null)
                        if (updated) setMessages((list) => list.map((x) => (x.id === updated.id ? normalizeMessages([updated])[0] : x)))
                        else void load(true)
                      }}
                      onMarkReplied={() => void act('replied', [open.id])}
                      onClose={() => setComposerFor(null)}
                      onEditTemplates={() => setTemplatesOpen(true)}
                      onSessionExpired={() => setState('session')}
                      onRetryIdentity={() => void loadIdentity()}
                    />
                  ) : null}
                </Stack>
              ) : (
                <Flex h="100%" minH="300px" align="center" justify="center" direction="column" color="page.fg-secondary" textAlign="center" px={4}>
                  <Box as={FaEnvelopeOpen} boxSize="22px" aria-hidden />
                  <Text mt={3} fontSize="sm">
                    Select a message to read it.
                  </Text>
                  <Text mt={1} fontFamily={MONO} fontSize="10px">
                    j / k move · Enter opens · ? shows every key
                  </Text>
                </Flex>
              )}
            </Box>
          </Grid>
        </>
      ) : null}

      {templatesOpen ? (
        <TemplatesDialog
          isOpen={templatesOpen}
          onClose={() => setTemplatesOpen(false)}
          templates={identity?.templates ?? NO_TEMPLATES}
          initialLang={open ? detectReplyLang(`${open.subject}\n${open.message}`) : 'en'}
          onSaved={(templates) => setIdentity((id) => (id ? { ...id, templates } : id))}
          onSessionExpired={() => setState('session')}
        />
      ) : null}
      <VisuallyHidden aria-live="polite">{selectedVisible.length ? `${selectedVisible.length} selected` : ''}</VisuallyHidden>
    </Stack>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function BulkButton({ label, icon, onClick, danger = false }: { label: string; icon: React.ReactElement; onClick: () => void; danger?: boolean }) {
  return (
    <Tooltip label={label} hasArrow openDelay={300}>
      <IconButton
        size="xs"
        variant="ghost"
        icon={icon}
        aria-label={label}
        onClick={onClick}
        minW="28px"
        h="28px"
        color={danger ? 'red.600' : 'page.fg-secondary'}
        _dark={danger ? { color: 'red.300' } : undefined}
        _hover={{ bg: 'page.bg', color: danger ? undefined : 'page.fg' }}
      />
    </Tooltip>
  )
}

function DetailButton({
  label,
  icon,
  onClick,
  keys,
  pressed,
  danger = false,
}: {
  label: string
  icon: React.ReactElement
  onClick: () => void
  keys?: string
  pressed?: boolean
  danger?: boolean
}) {
  return (
    <Tooltip label={keys ? `${label} (${keys})` : label} hasArrow openDelay={400}>
      <Button
        size="sm"
        {...(danger ? { variant: 'ghost', color: 'red.600', _dark: { color: 'red.300' }, _hover: { bg: 'page.bg-overlay' } } : outlineButtonProps)}
        leftIcon={React.cloneElement(icon, { 'aria-hidden': true })}
        onClick={onClick}
        aria-pressed={pressed}
        aria-keyshortcuts={keys === '#' ? 'Shift+3' : keys}
        iconSpacing={{ base: 0, lg: 2 }}
        px={{ base: 2.5, lg: 3 }}
        aria-label={label}
      >
        <Box as="span" display={{ base: 'none', lg: 'inline' }}>
          {label}
        </Box>
      </Button>
    </Tooltip>
  )
}

function SentReply({ reply }: { reply: InboxMessage['replies'][number] }) {
  const [expanded, setExpanded] = useState(false)
  // Show the answer, not the quoted original under it.
  const answer = reply.body.split(/\n(?=On .+ wrote:\n>|.+写道：\n>)/)[0].trim()
  const long = answer.split('\n').length > 6 || answer.length > 420
  return (
    <Box border="1px solid" borderColor="page.border" borderRadius="md" px={3} py={2.5} bg="page.bg">
      <Flex justify="space-between" gap={2} flexWrap="wrap" fontSize="xs" color="page.fg-secondary">
        <Text>
          <Text as="span" color="page.fg" fontWeight={600}>
            You
          </Text>{' '}
          · {formatWhen(reply.at)} · {reply.lang === 'zh' ? '中文' : 'English'}
          {reply.copied ? ' · bcc to you' : ''}
        </Text>
        <Text noOfLines={1} maxW="100%">
          {reply.subject}
        </Text>
      </Flex>
      <Text mt={1.5} fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word" noOfLines={expanded ? undefined : 6} lang={reply.lang === 'zh' ? 'zh-CN' : undefined}>
        {answer}
      </Text>
      {long ? (
        <Button size="xs" variant="link" color="accent.text" mt={1} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? 'Show less' : 'Show all'}
        </Button>
      ) : null}
    </Box>
  )
}

type RowProps = {
  m: InboxMessage
  first: boolean
  active: boolean
  selected: boolean
  hasDraft: boolean
  rowTabbable: boolean
  itemProps: ReturnType<ReturnType<typeof useListKeyboard>['itemProps']>
  now: number
  onOpen: () => void
  onToggleSelect: () => void
  onToggleStar: () => void
}

function MessageRow({ m, first, active, selected, hasDraft, rowTabbable, itemProps, now, onOpen, onToggleSelect, onToggleStar }: RowProps) {
  return (
    <Flex
      role="listitem"
      align="stretch"
      borderTop={first ? undefined : '1px solid'}
      borderColor="page.border"
      bg={active ? 'page.bg-overlay' : selected ? 'page.bg-elevated' : 'transparent'}
      _hover={{ bg: active ? 'page.bg-overlay' : 'page.bg-elevated' }}
      position="relative"
      data-message-id={m.id}
      data-unread={m.read ? undefined : ''}
    >
      {active ? <Box position="absolute" left={0} top={0} bottom={0} w="2px" bg="accent.500" aria-hidden /> : null}
      <Flex align="flex-start" pt={3.5} pl={3}>
        <Checkbox
          size="sm"
          colorScheme="purple"
          isChecked={selected}
          onChange={onToggleSelect}
          tabIndex={rowTabbable ? 0 : -1}
          aria-label={`Select the message from ${m.name || m.email}`}
        />
      </Flex>
      <Box
        as="button"
        type="button"
        {...itemProps}
        data-id={m.id}
        flex={1}
        minW={0}
        textAlign="left"
        pl={2.5}
        pr={1}
        py={3}
        _focusVisible={{ outline: '2px solid', outlineColor: 'accent.500', outlineOffset: '-2px' }}
        aria-current={active ? 'true' : undefined}
        onClick={onOpen}
      >
        <Flex align="center" gap={2}>
          <Box boxSize="7px" borderRadius="full" flexShrink={0} bg={m.read ? 'transparent' : 'accent.500'} aria-hidden />
          <Text flex={1} minW={0} noOfLines={1} fontSize="sm" fontWeight={m.read ? 500 : 700}>
            {m.name || m.email}
          </Text>
          <Text fontFamily={MONO} fontSize="10px" color="page.fg-secondary" flexShrink={0} className="tnum">
            {relative(m.at, now)}
          </Text>
        </Flex>
        <Text mt={1} pl="15px" noOfLines={1} fontSize="13px" fontWeight={m.read ? 400 : 600}>
          {m.subject || '(no subject)'}
        </Text>
        <Flex pl="15px" mt={0.5} gap={1.5} align="center">
          <Text flex={1} minW={0} noOfLines={1} fontSize="12px" color="page.fg-secondary">
            {hasDraft ? (
              <Text as="span" color="status.limited" fontWeight={600}>
                Draft ·{' '}
              </Text>
            ) : null}
            {m.message}
          </Text>
          <IntentBadge meta={m.meta} />
          {m.replied ? (
            <Badge variant="subtle" colorScheme="green" fontSize="9px" flexShrink={0} textTransform="none">
              replied
            </Badge>
          ) : null}
          {m.delivered === false ? (
            <Badge variant="outline" colorScheme="orange" fontSize="9px" flexShrink={0} textTransform="none">
              not emailed
            </Badge>
          ) : null}
        </Flex>
        <VisuallyHidden>
          {[!m.read ? 'Unread' : '', m.starred ? 'Starred' : '', m.replied ? 'Replied' : '', m.archived ? 'Archived' : ''].filter(Boolean).join(', ')}
        </VisuallyHidden>
      </Box>
      <Flex align="flex-start" pt={2} pr={2}>
        <IconButton
          size="xs"
          variant="ghost"
          tabIndex={rowTabbable ? 0 : -1}
          aria-label={m.starred ? `Unstar the message from ${m.name || m.email}` : `Star the message from ${m.name || m.email}`}
          aria-pressed={m.starred}
          icon={m.starred ? <FaStar /> : <FaRegStar />}
          onClick={onToggleStar}
          minW="28px"
          h="28px"
          color={m.starred ? 'status.limited' : 'page.fg-subtle'}
          _hover={{ color: m.starred ? 'status.limited' : 'page.fg', bg: 'transparent' }}
        />
      </Flex>
    </Flex>
  )
}
