import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Box,
  Flex,
  Input,
  Modal,
  ModalContent,
  ModalOverlay,
  Text,
  Kbd,
  Spinner,
  usePrefersReducedMotion,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import {
  highlightSegments,
  parseSearchIndex,
  rankItems,
  rankSearchDocs,
  truncate,
  type DocHit,
  type SearchDocLike,
  type SearchIndex,
  type Segment,
} from '../Article/fuzzyMatch'
import { jumpToSection } from '../Article/useActiveHeading'
import { copyText } from '../MDX/clipboard'
import { NAV_SHORTCUTS, shortcutLabelFor } from '../Chrome/chrome'
import { adminEditTarget } from '../Chrome/adminEditTarget'
import { useChromeLang } from '../Chrome/chromeLang'
import { useChromeToast } from '../Chrome/useChromeToast'
import { useShortcutsEnabled } from '../Chrome/useShortcutsEnabled'
import { useThemePreference } from '../Chrome/useThemePreference'
import { systemPrefersDark, type ThemePreference } from '../../lib/themePreference'
import { motionTransition } from '../../theme/tokens'
import { HIDE_ON_COARSE_POINTER, isApplePlatform } from '../Chrome/platform'
import { setShortcutsEnabled } from '../../lib/keyboardShortcuts'

/**
 * ⌘K command palette (loaded on demand by CommandPaletteLazy).
 *
 *   - Fuzzy search over pages, actions, the sections of the current page
 *     (elements with `data-nav-label` + id, and article headings) and the
 *     site's content index (/api/search-index: posts, case studies, pages and
 *     CV entries — titles, tags, descriptions, headings and body text),
 *     ranked best-first with the matched characters highlighted and, for
 *     content, where the match was found.
 *   - Empty query: recently used items, this page's sections, the owner's
 *     Admin group (signed in only), everything else grouped, and a
 *     keyboard-shortcut cheatsheet.
 *   - WAI-ARIA combobox: the input owns a listbox, the active option is
 *     announced via aria-activedescendant, result counts via a live region.
 *   - Opens instantly (a fast scale-in, none under reduced motion); the list
 *     glides between heights as results change.
 *   - `initialQuery` opens it already searching (the 404 page's search field).
 *   - Keyboard hints (shortcut chips, ESC, the cheatsheet) are hidden on
 *     touch-first devices (components/Chrome/platform).
 *
 * The search index is fetched once per visit (full page load), the first time
 * the palette opens. Recent items live in localStorage (per browser; failures
 * ignored).
 */

type Group = 'Recent' | 'On this page' | 'Admin' | 'Pages' | 'Actions' | 'Writing' | 'Work' | 'Content'
type Kind = 'nav' | 'action' | 'section'

type Item = {
  id: string
  group: Exclude<Group, 'Recent'>
  kind: Kind
  label: string
  hint?: string
  /** Right-hand label while searching (defaults to the group). */
  badge?: string
  shortcut?: string
  href?: string
  external?: boolean
  run?: () => void | Promise<void>
  keywords?: string
  lang?: string
}

type Detail = { prefix: string; segments: Segment[] }

type Row = { item: Item; group: Group; indices: number[]; detail?: Detail }

type RecentRecord = { id: string; label: string; href?: string; group: Item['group'] }

export type CommandPaletteProps = {
  isOpen: boolean
  onClose: () => void
  isAdmin?: boolean
  /** Text the search field opens with ('' = the browse view). */
  initialQuery?: string
  /** False when the palette closes because the visitor left the page (focus then moves to the new page). */
  returnFocusOnClose?: boolean
}

const HIKO_EMAIL = 'hi@lucian-dev.com'
const RECENT_KEY = 'cmdk:recent:v1'
const RECENT_MAX = 5
const RESULT_LIMIT = 40
const BROWSE_LIMIT = 6
const GROUP_ORDER: Group[] = ['Recent', 'On this page', 'Admin', 'Pages', 'Actions', 'Writing', 'Work', 'Content']
const GROUP_BOOST: Record<Item['group'], number> = { Pages: 6, Admin: 5, Actions: 4, 'On this page': 3, Writing: 2, Work: 2, Content: 2 }
const KIND_LABEL: Record<SearchDocLike['kind'], string> = { post: 'Post', work: 'Case study', page: 'Page', cv: 'CV' }
const MONO = 'var(--font-geist-mono), monospace'

/** The theme preference actions, in menu order. */
const THEME_ITEMS: readonly { value: ThemePreference; label: string; hint: string; keywords: string }[] = [
  { value: 'system', label: 'System theme', hint: 'follow your device', keywords: 'system auto automatic device os follow' },
  { value: 'light', label: 'Light theme', hint: 'switch to light', keywords: 'light day bright' },
  { value: 'dark', label: 'Dark theme', hint: 'switch to dark', keywords: 'dark night' },
]

// ── Search index (one request per visit) ────────────────────────────────

let indexRequest: Promise<SearchIndex> | null = null

function loadSearchIndex(): Promise<SearchIndex> {
  if (!indexRequest) {
    indexRequest = fetch('/api/search-index')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(parseSearchIndex)
      .catch((err) => {
        // Let the next open try again.
        indexRequest = null
        throw err
      })
  }
  return indexRequest
}

// ── Recents ─────────────────────────────────────────────────────────────────

function readRecent(): RecentRecord[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list)
      ? list.filter((r): r is RecentRecord => !!r && typeof r.id === 'string' && typeof r.label === 'string').slice(0, RECENT_MAX)
      : []
  } catch {
    return []
  }
}

function writeRecent(list: RecentRecord[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)))
  } catch {
    // Storage disabled / full — recents are a convenience only.
  }
}

// ── Sections of the current page ────────────────────────────────────────────

/** Visible text of a heading without the "#" self-link marker. */
function headingLabel(el: HTMLElement): string {
  return Array.from(el.childNodes)
    .filter((n) => !(n instanceof HTMLElement && n.classList.contains('heading-anchor-icon')))
    .map((n) => n.textContent || '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectSections(): Item[] {
  const seen = new Set<string>()
  const out: Item[] = []
  document
    .querySelectorAll<HTMLElement>('[data-nav-label][id], .article-prose h2[id], .article-prose h3[id]')
    .forEach((el) => {
      if (!el.id || seen.has(el.id) || el.getClientRects().length === 0) return
      const label = el.dataset.navLabel || headingLabel(el)
      if (!label) return
      seen.add(el.id)
      out.push({
        id: `section:${el.id}`,
        group: 'On this page',
        kind: 'section',
        label,
        hint: el.tagName === 'H3' ? 'subsection' : 'section',
        keywords: 'jump section heading',
        run: () => jumpToSection(el.id),
      })
    })
  return out
}

// ── Rendering helpers ───────────────────────────────────────────────────────

/** Matched characters: accent text AND weight, so the match never relies on colour alone. */
function Mark({ children }: { children: React.ReactNode }) {
  return (
    <Box as="mark" bg="transparent" color="accent.text" fontWeight={600}>
      {children}
    </Box>
  )
}

function Highlighted({ text, indices }: { text: string; indices: number[] }) {
  return (
    <>
      {highlightSegments(text, indices).map((seg, i) =>
        seg.match ? <Mark key={i}>{seg.text}</Mark> : <React.Fragment key={i}>{seg.text}</React.Fragment>,
      )}
    </>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <Kbd
      fontFamily={MONO}
      fontSize="10px"
      fontWeight={500}
      bg="transparent"
      border="1px solid"
      borderColor="page.border-strong"
      color="page.fg-secondary"
      sx={HIDE_ON_COARSE_POINTER}
    >
      {children}
    </Kbd>
  )
}

function docItem(doc: SearchDocLike, group: Item['group']): Item {
  return {
    id: `doc:${doc.href}`,
    group,
    kind: 'nav',
    label: doc.title,
    href: doc.href,
    hint: group === 'Content' ? undefined : doc.description ? truncate(doc.description) : undefined,
    badge: KIND_LABEL[doc.kind],
    lang: doc.lang && doc.lang !== 'en' ? doc.lang : undefined,
  }
}

/** "in: …" line for a content hit (nothing extra when only the title matched). */
function docDetail(hit: DocHit<SearchDocLike>): Detail | undefined {
  if (hit.field === 'title') {
    return hit.doc.description ? { prefix: '', segments: [{ text: truncate(hit.doc.description), match: false }] } : undefined
  }
  if (hit.field === 'body' && hit.snippet) return { prefix: 'in: ', segments: hit.snippet }
  return { prefix: 'in: ', segments: [{ text: truncate(hit.value), match: false }] }
}

// ── Component ───────────────────────────────────────────────────────────────

/** Unread count of an inbox response (`{unread}`, summary or full listing); null when absent or malformed. */
function unreadOf(body: unknown): number | null {
  const n = body && typeof body === 'object' ? (body as { unread?: unknown }).unread : undefined
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null
}

/**
 * Unread contact messages for the Inbox item: GET /api/admin/inbox?summary=1
 * ({unread, total}, no message bodies). A server without the summary mode
 * (it rejects the parameter with 400/404, or answers without a count) falls
 * back to the full listing, which carries `unread` too. A signed-out answer
 * (401/403), a server error or any network failure resolves to null and the
 * item simply shows no count.
 */
async function fetchUnreadCount(signal: AbortSignal): Promise<number | null> {
  const get = (url: string) => fetch(url, { cache: 'no-store', credentials: 'same-origin', signal })
  const summary = await get('/api/admin/inbox?summary=1')
  if (!summary.ok && summary.status !== 400 && summary.status !== 404) return null
  const fromSummary = summary.ok ? unreadOf(await summary.json().catch(() => null)) : null
  if (fromSummary !== null || signal.aborted) return fromSummary
  const full = await get('/api/admin/inbox')
  return full.ok ? unreadOf(await full.json().catch(() => null)) : null
}

export default function CommandPalette({ isOpen, onClose, isAdmin = false, initialQuery = '', returnFocusOnClose = true }: CommandPaletteProps) {
  const router = useRouter()
  const toast = useChromeToast()
  // The palette's own text is English; results in another language carry their own lang.
  const chromeLang = useChromeLang()
  const reduceMotion = usePrefersReducedMotion()
  const { preference, choose } = useThemePreference()
  const shortcutsOn = useShortcutsEnabled()
  const baseId = useId()
  const listId = `${baseId}-list`
  const optId = (i: number) => `${baseId}-opt-${i}`

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [loading, setLoading] = useState(false)
  const [sections, setSections] = useState<Item[]>([])
  const [recent, setRecent] = useState<RecentRecord[]>([])
  const [restoreFocus, setRestoreFocus] = useState(true)
  const [isMac, setIsMac] = useState(true)
  const [unread, setUnread] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pending = useRef<(() => void) | null>(null)
  // Read when the palette opens; a prefilled query is selected on focus so typing replaces it.
  const initialQueryRef = useRef(initialQuery)
  initialQueryRef.current = initialQuery
  const selectOnFocus = useRef(false)

  useEffect(() => {
    setIsMac(isApplePlatform(navigator as Navigator & { userAgentData?: { platform?: string } }))
  }, [])

  // Fresh state every time the palette opens.
  useEffect(() => {
    if (!isOpen) return
    setQuery(initialQueryRef.current)
    selectOnFocus.current = initialQueryRef.current !== ''
    setActiveIdx(0)
    setRestoreFocus(true)
    setSections(collectSections())
    setRecent(readRecent())
  }, [isOpen])

  // Content index: one request per visit (shared by every open).
  useEffect(() => {
    if (!isOpen || index) return
    let alive = true
    setLoading(true)
    loadSearchIndex()
      .then((idx) => {
        if (alive) setIndex(idx)
      })
      .catch(() => {
        // Pages and actions still work; the next open retries.
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [isOpen, index])

  // Owner: unread contact messages on the Inbox item (fresh on each open).
  useEffect(() => {
    if (!isOpen || !isAdmin) return
    const ctrl = new AbortController()
    fetchUnreadCount(ctrl.signal)
      .then((n) => {
        if (!ctrl.signal.aborted && n !== null) setUnread(n)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [isOpen, isAdmin])

  const copyAndToast = useCallback(
    async (text: string, title: string) => {
      const ok = await copyText(text)
      toast(ok ? { status: 'success', title, description: text } : { status: 'error', title: 'Copy failed' })
    },
    [toast],
  )

  const backUpNow = useCallback(async () => {
    toast({ status: 'loading', title: 'Backing up…', id: 'cmdk-backup', duration: null })
    try {
      const res = await fetch('/api/admin/storage/backup', { method: 'POST', credentials: 'same-origin' })
      const body = (await res.json().catch(() => ({}))) as { error?: string; r2?: { pushed?: boolean; error?: string } }
      toast.close('cmdk-backup')
      if (res.status === 409) toast({ status: 'warning', title: 'A backup is already running' })
      else if (!res.ok) toast({ status: 'error', title: 'Backup failed', description: body.error || `HTTP ${res.status}`, duration: 6000 })
      else if (body.r2?.error) toast({ status: 'warning', title: 'Backup saved locally', description: `R2 upload failed: ${body.r2.error}`, duration: 6000 })
      else toast({ status: 'success', title: 'Backup complete', description: body.r2?.pushed ? 'Saved locally and to R2' : 'Saved locally' })
    } catch {
      toast.close('cmdk-backup')
      toast({ status: 'error', title: 'Backup failed', description: 'Network error' })
    }
  }, [toast])

  const logOut = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      window.location.reload()
    } catch {
      toast({ status: 'error', title: 'Logout failed' })
    }
  }, [toast])

  const slug = router.query.slug
  const editTarget = useMemo(() => adminEditTarget(router.pathname, slug), [router.pathname, slug])

  const items: Item[] = useMemo(() => {
    const page = (label: string, href: string, keywords?: string): Item => ({
      id: `page:${href}`,
      group: 'Pages',
      kind: 'nav',
      label,
      href,
      shortcut: shortcutLabelFor(href),
      keywords,
    })
    const admin = (id: string, label: string, href: string, keywords: string, hint?: string): Item => ({
      id: `admin:${id}`,
      group: 'Admin',
      kind: 'nav',
      label,
      href,
      hint,
      keywords: `admin ${keywords}`,
    })
    const list: Item[] = []

    if (isAdmin) {
      if (editTarget) list.push(admin('edit-current', editTarget.label, editTarget.href, 'edit this page', 'this page'))
      list.push(
        admin('inbox', 'Inbox', '/admin/dashboard?tab=inbox', 'messages contact mail', unread ? `${unread} unread` : undefined),
        admin('cv', 'CV Studio', '/admin/dashboard?tab=cv', 'resume edit cv'),
        admin('home', 'Home editor', '/admin/dashboard?tab=home', 'landing edit home'),
        admin('versions', 'Versions', '/admin/dashboard?tab=versions', 'history snapshots restore undo'),
        admin('storage', 'Storage', '/admin/dashboard?tab=storage', 'backup r2 restore database'),
        admin('analytics', 'Analytics', '/admin/dashboard?tab=analytics', 'visitors views stats web vitals'),
        admin('new-post', 'New post', '/admin/blog/edit', 'write blog article create'),
        admin('new-work', 'New case study', '/admin/work/edit', 'project portfolio create'),
        admin('now', 'Edit /now', '/admin/now', 'now page status'),
        admin('uses', 'Edit /uses', '/admin/uses', 'uses page tools'),
        {
          id: 'admin:backup',
          group: 'Admin',
          kind: 'action',
          label: 'Back up now',
          hint: 'snapshot to disk + R2',
          run: backUpNow,
          keywords: 'admin backup snapshot save storage',
        },
        {
          id: 'admin:logout',
          group: 'Admin',
          kind: 'action',
          label: 'Log out',
          hint: 'this browser',
          run: logOut,
          keywords: 'admin sign out logout',
        },
      )
    }

    list.push(
      page('Home', '/', 'start landing index'),
      page('About', '/about', 'bio profile'),
      page('Work', '/work', 'case studies projects portfolio'),
      page('Writing', '/blog', 'blog posts essays articles'),
      page('CV', '/cv', 'resume curriculum vitae'),
      page('Now', '/now', 'status current focus'),
      page('Uses', '/uses', 'tools gear setup'),
      page('Contact', '/contact', 'email message hire'),
      page('Colophon', '/colophon', 'about this site fonts stack privacy analytics'),
      {
        id: 'action:cv-pdf',
        group: 'Actions',
        kind: 'nav',
        label: 'Download CV (PDF)',
        hint: 'print / save as PDF',
        href: '/cv?print=1',
        keywords: 'resume pdf print save download',
      },
      {
        id: 'action:cv-zh',
        group: 'Actions',
        kind: 'nav',
        label: 'CV in 中文',
        hint: 'Chinese version',
        href: '/cv/zh',
        keywords: 'chinese zh resume 简历 中文 cv',
      },
      {
        id: 'action:vcard',
        group: 'Actions',
        kind: 'action',
        label: 'Download vCard',
        hint: 'add to contacts',
        run: () => window.location.assign('/api/vcard'),
        keywords: 'contact card vcf address book save',
      },
    )
    if (index?.bookingUrl) {
      list.push({
        id: 'action:book',
        group: 'Actions',
        kind: 'nav',
        label: 'Book a call',
        hint: 'opens the booking page',
        href: index.bookingUrl,
        external: true,
        keywords: 'meeting schedule calendar call chat hire',
      })
    }
    list.push(
      // System / Light / Dark (lib/themePreference.ts); the current one says so.
      ...THEME_ITEMS.map(
        ({ value, label, hint, keywords }): Item => ({
          id: `action:theme-${value}`,
          group: 'Actions',
          kind: 'action',
          label,
          hint: preference === value ? 'current' : value === 'system' ? `${hint} (${systemPrefersDark() ? 'dark' : 'light'} now)` : hint,
          run: () => choose(value, null),
          keywords: `theme appearance mode colour color toggle switch ${keywords}`,
        }),
      ),
      {
        // WCAG 2.1.4: single-character shortcuts ("/", "G then …", "E", "?")
        // can be turned off; ⌘K / Ctrl+K keeps working either way.
        id: 'action:shortcuts',
        group: 'Actions',
        kind: 'action',
        label: `Keyboard shortcuts: ${shortcutsOn ? 'on' : 'off'}`,
        hint: shortcutsOn ? 'turn off single-key shortcuts' : 'turn on single-key shortcuts',
        run: () => {
          const next = !shortcutsOn
          setShortcutsEnabled(next)
          toast(
            next
              ? { status: 'success', title: 'Keyboard shortcuts on', description: '/ opens this palette; G then a letter jumps to a page.' }
              : { status: 'success', title: 'Keyboard shortcuts off', description: `Single-key shortcuts are off. ${isMac ? '⌘K' : 'Ctrl+K'} still opens this palette.` },
          )
        },
        keywords: 'keyboard shortcuts hotkeys keys single key disable enable turn on off accessibility',
      },
      {
        id: 'action:copy-link',
        group: 'Actions',
        kind: 'action',
        label: 'Copy page link',
        hint: 'share this page',
        run: () => copyAndToast(window.location.href, 'Link copied'),
        keywords: 'url share permalink clipboard',
      },
      {
        id: 'action:copy-email',
        group: 'Actions',
        kind: 'action',
        label: 'Copy email address',
        hint: HIKO_EMAIL,
        run: () => copyAndToast(HIKO_EMAIL, 'Email copied'),
        keywords: 'contact mail clipboard',
      },
      {
        id: 'action:source',
        group: 'Actions',
        kind: 'nav',
        label: 'View source on GitHub',
        href: 'https://github.com/hiko-server/landing_page',
        external: true,
        keywords: 'repo source code',
      },
      {
        id: 'action:rss',
        group: 'Actions',
        kind: 'nav',
        label: 'RSS feed',
        href: '/feed.xml',
        external: true,
        keywords: 'subscribe feed atom json',
      },
    )
    if (!isAdmin) {
      list.push({
        id: 'action:admin',
        group: 'Actions',
        kind: 'nav',
        label: 'Admin login',
        href: '/admin/login',
        keywords: 'sign in dashboard',
      })
    }
    for (const doc of index?.docs || []) {
      if (doc.kind === 'post') list.push(docItem(doc, 'Writing'))
      else if (doc.kind === 'work') list.push(docItem(doc, 'Work'))
    }
    return list
  }, [isAdmin, editTarget, unread, index, preference, choose, shortcutsOn, isMac, toast, copyAndToast, backUpNow, logOut])

  const recentItems: Item[] = useMemo(() => {
    const out: Item[] = []
    for (const r of recent) {
      const live = items.find((i) => i.id === r.id)
      if (live) out.push(live)
      else if (r.href && r.href.startsWith('/') && !r.href.startsWith('//') && !r.id.startsWith('admin:')) {
        out.push({ id: r.id, group: r.group, kind: 'nav', label: r.label, href: r.href })
      }
    }
    return out
  }, [recent, items])

  const { rows, total } = useMemo((): { rows: Row[]; total: number } => {
    const q = query.trim()
    if (!q) {
      const grouped: Row[] = []
      const push = (group: Group, list: Item[]) => list.forEach((item) => grouped.push({ item, group, indices: [] }))
      push('Recent', recentItems)
      push('On this page', sections)
      for (const g of ['Admin', 'Pages', 'Actions', 'Writing', 'Work'] as const) {
        const list = items.filter((i) => i.group === g)
        push(g, g === 'Writing' || g === 'Work' ? list.slice(0, BROWSE_LIMIT) : list)
      }
      return { rows: grouped, total: grouped.length }
    }
    const recentIds = new Set(recent.map((r) => r.id))
    const boost = (id: string, group: Item['group']) => GROUP_BOOST[group] + (recentIds.has(id) ? 8 : 0)
    // Commands and sections (posts / case studies are searched as content below).
    const commands = items.filter((i) => i.group !== 'Writing' && i.group !== 'Work')
    const ranked: Array<{ row: Row; score: number }> = rankItems([...sections, ...commands], q, (it) => boost(it.id, it.group)).map(
      ({ item, score, indices }) => ({ row: { item, group: item.group, indices }, score }),
    )
    for (const hit of rankSearchDocs(index?.docs || [], q, (doc) => boost(`doc:${doc.href}`, 'Content'))) {
      ranked.push({
        row: { item: docItem(hit.doc, 'Content'), group: 'Content', indices: hit.indices, detail: docDetail(hit) },
        score: hit.score,
      })
    }
    ranked.sort((a, b) => b.score - a.score)
    return { rows: ranked.slice(0, RESULT_LIMIT).map((r) => r.row), total: ranked.length }
  }, [query, items, sections, recentItems, recent, index])

  useEffect(() => setActiveIdx(0), [query])

  useEffect(() => {
    if (!isOpen) return
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, isOpen])

  // Height glide: the scroll area's height follows its content (capped by
  // max-height), transitioning only after the first measurement so opening
  // is instant. Observed while the dialog is mounted.
  const observerRef = useRef<{ ro: ResizeObserver; frame: { id: number } } | null>(null)
  const observeContent = useCallback(
    (node: HTMLDivElement | null) => {
      const prev = observerRef.current
      if (prev) {
        prev.ro.disconnect()
        cancelAnimationFrame(prev.frame.id)
        observerRef.current = null
      }
      const container = node?.parentElement
      if (!node || !container || typeof ResizeObserver === 'undefined') return
      const frame = { id: 0 }
      let measured = false
      const ro = new ResizeObserver(() => {
        cancelAnimationFrame(frame.id)
        frame.id = requestAnimationFrame(() => {
          const cs = getComputedStyle(container)
          const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
          container.style.setProperty('--list-h', `${Math.ceil(node.getBoundingClientRect().height + pad)}px`)
          if (!measured) {
            measured = true
            // Enable the transition from the next change on.
            frame.id = requestAnimationFrame(() => {
              if (!reduceMotion) container.dataset.ready = ''
            })
          }
        })
      })
      ro.observe(node)
      observerRef.current = { ro, frame }
    },
    [reduceMotion],
  )

  const remember = (item: Item) => {
    if (item.kind === 'section') return
    const record: RecentRecord = { id: item.id, label: item.label, href: item.href, group: item.group }
    const next = [record, ...readRecent().filter((r) => r.id !== item.id)]
    writeRecent(next)
  }

  const runItem = (item: Item | undefined) => {
    if (!item) return
    remember(item)
    // Navigation and section jumps move focus themselves; actions hand focus
    // back to whatever opened the palette.
    setRestoreFocus(item.kind === 'action')
    pending.current = () => {
      if (item.run) void item.run()
      else if (item.href) {
        if (item.external) window.open(item.href, '_blank', 'noopener,noreferrer')
        else router.push(item.href)
      }
    }
    onClose()
  }

  // Run the chosen item once the dialog (and its focus trap) is gone.
  const onCloseComplete = () => {
    const run = pending.current
    pending.current = null
    run?.()
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (rows.length ? (i + 1) % rows.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runItem(rows[activeIdx]?.item)
    }
  }

  const mod = isMac ? '⌘' : 'Ctrl'
  const searching = query.trim() !== ''
  const pageShortcuts = NAV_SHORTCUTS.map((s) => items.find((i) => i.id === `page:${s.url}`)).filter((i): i is Item => !!i)

  const renderRow = (row: Row, idx: number) => {
    const { item, detail } = row
    const active = idx === activeIdx
    const sideHint = row.group === 'Recent' ? item.group : item.hint
    return (
      <Flex
        key={`${row.group}:${item.id}`}
        id={optId(idx)}
        data-idx={idx}
        role="option"
        aria-selected={active}
        onMouseMove={() => !active && setActiveIdx(idx)}
        onClick={() => runItem(item)}
        px={3}
        py={2}
        minH="44px"
        borderRadius="md"
        cursor="pointer"
        bg={active ? 'var(--accent-soft)' : 'transparent'}
        boxShadow={active ? 'inset 2px 0 0 var(--accent)' : 'none'}
        alignItems="center"
        justifyContent="space-between"
        gap={3}
      >
        <Box minW={0} flex={1}>
          <Flex alignItems="baseline" gap={2} minW={0}>
            <Text as="span" fontSize="14px" color="page.fg" noOfLines={1} lang={item.lang}>
              <Highlighted text={item.label} indices={row.indices} />
            </Text>
            {!detail && sideHint && (
              <Text as="span" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" noOfLines={1} flexShrink={1} minW={0}>
                {sideHint}
              </Text>
            )}
          </Flex>
          {detail && (
            <Text fontSize="12px" color="page.fg-secondary" noOfLines={1} mt={0.5} lang={item.lang}>
              {detail.prefix && (
                <Text as="span" fontFamily={MONO} fontSize="11px">
                  {detail.prefix}
                </Text>
              )}
              {detail.segments.map((seg, i) => (seg.match ? <Mark key={i}>{seg.text}</Mark> : <React.Fragment key={i}>{seg.text}</React.Fragment>))}
            </Text>
          )}
        </Box>
        <Flex alignItems="center" gap={2} flexShrink={0}>
          {searching && (
            <Text as="span" fontFamily={MONO} fontSize="10px" letterSpacing="0.08em" textTransform="uppercase" color="page.fg-secondary">
              {item.badge || item.group}
            </Text>
          )}
          {!searching && shortcutsOn && item.shortcut && <Key>{item.shortcut}</Key>}
          {item.external && (
            <Text as="span" aria-hidden color="page.fg-secondary" fontSize="12px">
              ↗
            </Text>
          )}
        </Flex>
      </Flex>
    )
  }

  const renderGrouped = () => {
    let idx = 0
    return GROUP_ORDER.map((group) => {
      const groupRows = rows.filter((r) => r.group === group)
      if (!groupRows.length) return null
      const headingId = `${baseId}-group-${group.replace(/\s+/g, '-').toLowerCase()}`
      return (
        <Box key={group} role="group" aria-labelledby={headingId} mb={2}>
          <Text
            id={headingId}
            px={3}
            pt={3}
            pb={1.5}
            fontFamily={MONO}
            fontSize="10px"
            letterSpacing="0.16em"
            textTransform="uppercase"
            color="page.fg-secondary"
          >
            {group}
          </Text>
          {groupRows.map((row) => renderRow(row, idx++))}
        </Box>
      )
    })
  }

  const resultText = searching
    ? total > rows.length
      ? `Showing ${rows.length} of ${total} results`
      : `${total} result${total === 1 ? '' : 's'}`
    : `${rows.length} command${rows.length === 1 ? '' : 's'}`

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onCloseComplete={onCloseComplete}
      size="xl"
      motionPreset="none"
      isCentered={false}
      initialFocusRef={inputRef}
      returnFocusOnClose={restoreFocus && returnFocusOnClose}
    >
      <ModalOverlay backdropFilter="blur(12px)" bg="rgba(0,0,0,0.45)" />
      <ModalContent
        aria-label="Command palette"
        lang={chromeLang}
        motionProps={
          reduceMotion
            ? undefined
            : {
                initial: { opacity: 0, scale: 0.98, y: -4 },
                animate: { opacity: 1, scale: 1, y: 0 },
                exit: { opacity: 0, scale: 0.98 },
                transition: motionTransition('fast'),
              }
        }
        transformOrigin="top center"
        bg="page.bg"
        border="1px solid"
        borderColor="page.border-strong"
        borderRadius="xl"
        mt={['8vh', '15vh']}
        mx={4}
        boxShadow="elevation.lg"
        overflow="hidden"
      >
        <Flex borderBottom="1px solid" borderColor="page.border" px={4} h="56px" alignItems="center" gap={3}>
          <Text as="span" aria-hidden color="page.fg-secondary" fontFamily={MONO} fontSize="13px" lineHeight={1}>
            ›
          </Text>
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={(e) => {
              if (!selectOnFocus.current) return
              selectOnFocus.current = false
              e.currentTarget.select()
            }}
            onKeyDown={onKey}
            role="combobox"
            aria-label="Search pages, sections, actions, posts, case studies and the CV"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={rows.length ? optId(activeIdx) : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search or jump to…"
            variant="unstyled"
            fontSize="15px"
            color="page.fg"
            _placeholder={{ color: 'page.fg-secondary' }}
            // The dialog is the focus context and the caret marks the field;
            // a ring inside the header bar would only add noise.
            _focusVisible={{ outline: 'none' }}
            flex={1}
          />
          {loading && <Spinner size="xs" color="page.fg-secondary" label="Loading the search index" />}
          <Key>ESC</Key>
        </Flex>

        <Box
          ref={scrollRef}
          maxH={['65vh', '60vh']}
          overflowY="auto"
          p={2}
          sx={{
            height: { base: 'min(var(--list-h), 65vh)', sm: 'min(var(--list-h), 60vh)' },
            '&[data-ready]': { transition: 'height var(--duration-fast) var(--ease-standard)' },
          }}
        >
          <Box ref={observeContent}>
            <Box id={listId} role="listbox" aria-label="Commands">
              {searching ? rows.map((row, i) => renderRow(row, i)) : renderGrouped()}
            </Box>
            {searching && rows.length === 0 && (
              <Flex direction="column" align="center" justify="center" py={10} color="page.fg-secondary" fontFamily={MONO} fontSize="12px" gap={1}>
                <Text>no matches</Text>
                <Text>{loading ? 'still loading posts and projects…' : 'try fewer or different letters'}</Text>
              </Flex>
            )}
            {!searching && (
              <Box
                as="section"
                aria-label="Keyboard shortcuts"
                mt={2}
                mx={3}
                mb={2}
                pt={4}
                borderTop="1px solid"
                borderColor="page.border"
                sx={HIDE_ON_COARSE_POINTER}
              >
                <Text fontFamily={MONO} fontSize="10px" letterSpacing="0.16em" textTransform="uppercase" color="page.fg-secondary" mb={3}>
                  Shortcuts
                </Text>
                <Box
                  as="dl"
                  display="grid"
                  gridTemplateColumns={{ base: '1fr', sm: '1fr 1fr' }}
                  columnGap={6}
                  rowGap={2}
                  fontSize="12px"
                  color="page.fg-secondary"
                  sx={{ '& > div': { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 3 }, '& dd': { m: 0 } }}
                >
                  <div>
                    <dt>Open / close palette</dt>
                    <dd>
                      <Key>{mod}</Key> <Key>K</Key>
                      {shortcutsOn && (
                        <>
                          {' '}
                          <Text as="span">or</Text> <Key>/</Key>
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Move / open</dt>
                    <dd>
                      <Key>↑</Key> <Key>↓</Key> <Key>↵</Key>
                    </dd>
                  </div>
                  {shortcutsOn ? (
                    pageShortcuts.map((it) => (
                      <div key={it.id}>
                        <dt>Go to {it.label}</dt>
                        <dd>
                          <Key>{it.shortcut}</Key>
                        </dd>
                      </div>
                    ))
                  ) : (
                    <div>
                      <dt>Single-key shortcuts</dt>
                      <dd>off</dd>
                    </div>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        <Flex
          borderTop="1px solid"
          borderColor="page.border"
          px={3}
          h="36px"
          alignItems="center"
          justifyContent="space-between"
          fontFamily={MONO}
          fontSize="10px"
          color="page.fg-secondary"
        >
          <Flex gap={3} alignItems="center" display={{ base: 'none', sm: 'flex' }} aria-hidden sx={HIDE_ON_COARSE_POINTER}>
            <Flex gap={1} alignItems="center">
              <Key>↑</Key>
              <Key>↓</Key>
              <Text>navigate</Text>
            </Flex>
            <Flex gap={1} alignItems="center">
              <Key>↵</Key>
              <Text>open</Text>
            </Flex>
          </Flex>
          <Text role="status" aria-live="polite" ml="auto" className="tnum">
            {resultText}
          </Text>
        </Flex>
      </ModalContent>
    </Modal>
  )
}
