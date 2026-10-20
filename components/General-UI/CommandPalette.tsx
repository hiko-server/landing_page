import React, { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
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
import { ADMIN_CHORDS, adminShortcutFor } from '../Admin/shell/adminCommands'
import { useRegisteredAdminCommands } from '../Admin/shell/useAdminCommands'
import { useChromeLang } from '../Chrome/chromeLang'
import { useChromeToast } from '../Chrome/useChromeToast'
import { useShortcutsEnabled } from '../Chrome/useShortcutsEnabled'
import { useThemePreference } from '../Chrome/useThemePreference'
import { systemPrefersDark, type ThemePreference } from '../../lib/themePreference'
import { motionTransition } from '../../theme/tokens'
import { COARSE_POINTER_QUERY, HIDE_ON_COARSE_POINTER, isApplePlatform, keyboardSeen } from '../Chrome/platform'
import { setShortcutsEnabled } from '../../lib/keyboardShortcuts'
import { normalizePaletteMode, type PaletteMode } from '../Chrome/paletteEvents'
import AskView from '../Search/AskView'
import ModeToggle from '../Search/ModeToggle'
import { useAsk } from '../Search/useAsk'
import { openCitation } from '../Search/citation'
import { askCopyFor, ASK_COPY } from '../../lib/ask/copy'
import { askStatusText, type AskOption } from '../../lib/ask/view'
import { isExplicitQuestion } from '../../lib/search/text'
import { onEmptyResult } from '../../lib/search/emptyResult'
import { CONTACT_FORM_ID, stashContactQuestion } from '../../lib/contactPrefill'
import {
  LAYER_SHORTCUT_ROWS,
  PAGE_TITLES,
  PREFETCH_DELAY_MS,
  browseItems,
  isPrefetchableHref,
  pageKeyAction,
  searchableItems,
  type PageMember,
  type PalettePage,
} from './paletteModel'
import { listenSearchEmpty } from '../../lib/analytics/searchEmpty'

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
 *   - Nested pages (components/General-UI/paletteModel.ts): Theme ›, CV ›
 *     and Contact › gather their actions; "?" opens Keyboard shortcuts.
 *     Backspace in an empty field or Escape goes back; a search from the top
 *     still finds everything inside them.
 *   - WAI-ARIA combobox: the input owns a listbox, the active option is
 *     announced via aria-activedescendant, result counts via a live region.
 *   - Fast to open: from the keyboard it appears at once (`instant`), from a
 *     click with a quick scale-in (none under reduced motion). The frame and
 *     the field paint first and the rows render right after; ranking runs on
 *     a deferred copy of the query, so typing never waits for it. Touch
 *     screens get a plain scrim (a full-screen blur is costly on phones).
 *   - A highlighted page is prefetched after a short pause, and Enter
 *     navigates at once — the closing dialog fades out on its own in the
 *     route transition (lib/viewTransition.ts liftDismissibleLayers).
 *   - `initialQuery` opens it already searching (the 404 page's search field).
 *   - Two modes: Search (above) and Ask ("Ask Lucian", J1): a question is
 *     answered only with quotes from the site's public pages, each linked to
 *     where it appears (components/Search/AskView, lib/ask). A search phrased
 *     as a question (a question word or mark) offers "Ask" as its first row,
 *     any other search as its last — Enter on a typed title still opens the
 *     title's page; `initialMode`
 *     opens the palette in Ask mode (the entry on /about and /contact). Ask
 *     is a view of the top level: the nested pages and the shortcut sheet
 *     belong to Search; Backspace in an empty question returns to Search.
 *   - A settled query that finds nothing is reported once to
 *     onEmptyResult (lib/search/emptyResult: normalised, no personal data).
 *   - Keyboard hints (shortcut chips, ESC, the cheatsheet) are hidden on
 *     touch-first devices (components/Chrome/platform).
 *
 * The search index is fetched once per visit (full page load), the first time
 * the palette opens. Recent items live in localStorage (per browser; failures
 * ignored).
 */

type Group = 'Recent' | 'On this page' | 'Admin' | 'Pages' | 'Actions' | 'Writing' | 'Work' | 'Content'
type Kind = 'nav' | 'action' | 'section' | 'page'

/**
 * Save a same-site file under the name its Content-Disposition gives
 * (/cv.pdf → "Li-Yanpei-CV-2026-10.pdf") instead of navigating to it.
 */
function downloadFile(href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = ''
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

type Item = PageMember & {
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
  /** Language of the label (and of a result's excerpt) when it is not the palette's English. */
  lang?: string
  /** Language of the row's interface words — hint and badge — when not English (the "Ask: …" row of a Chinese question). */
  uiLang?: string
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
  /** /publications has public papers: list it under Pages. */
  publications?: boolean
  /** False when the palette closes because the visitor left the page (focus then moves to the new page). */
  returnFocusOnClose?: boolean
  /** Opened from the keyboard: appear at once, without the entrance animation. */
  instant?: boolean
  /** The nested page it opens on ("?" opens Keyboard shortcuts); null = the top level. */
  initialPage?: PalettePage | null
  /** The mode it opens in: 'search' (default) or 'ask'. */
  initialMode?: PaletteMode
}

const HIKO_EMAIL = 'hi@lucian-dev.com'
const RECENT_KEY = 'cmdk:recent:v1'
const RECENT_MAX = 5
const RESULT_LIMIT = 40
const BROWSE_LIMIT = 6
const GROUP_ORDER: Group[] = ['Recent', 'On this page', 'Admin', 'Pages', 'Actions', 'Writing', 'Work', 'Content']
const GROUP_BOOST: Record<Item['group'], number> = { Pages: 6, Admin: 5, Actions: 4, 'On this page': 3, Writing: 2, Work: 2, Content: 2 }
const KIND_LABEL: Record<SearchDocLike['kind'], string> = { post: 'Post', work: 'Case study', page: 'Page', cv: 'CV', publication: 'Paper' }
/** The "Ask: …" row of a search, and the browse view's "Ask Lucian a question" action. */
const ASK_ROW_ID = 'ask:question'
const ASK_ACTION_ID = 'action:ask'
/** A query that finds nothing is reported (onEmptyResult) once it has rested this long. */
const EMPTY_SETTLE_MS = 1200
const MONO = 'var(--font-geist-mono), monospace'
const NO_ROWS: { rows: Row[]; total: number } = { rows: [], total: 0 }

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
  const zh = /^zh/i.test(doc.lang || '')
  return {
    // CV skill groups share their section's href: the title keeps ids unique.
    id: doc.kind === 'cv' ? `doc:${doc.href}|${doc.title}` : `doc:${doc.href}`,
    group,
    kind: 'nav',
    label: doc.title,
    href: doc.href,
    hint: group === 'Content' ? undefined : doc.description ? truncate(doc.description) : undefined,
    badge: zh ? `${KIND_LABEL[doc.kind]} · 中文` : KIND_LABEL[doc.kind],
    lang: doc.lang && doc.lang !== 'en' ? doc.lang : undefined,
  }
}

/** "in: …" line for a content hit (nothing extra when only the title matched). */
function docDetail(hit: DocHit<SearchDocLike>): Detail | undefined {
  if (hit.field === 'title') {
    return hit.doc.description ? { prefix: '', segments: [{ text: truncate(hit.doc.description), match: false }] } : undefined
  }
  if (hit.snippet && hit.snippet.length) return { prefix: 'in: ', segments: hit.snippet }
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

export default function CommandPalette({
  isOpen,
  onClose,
  isAdmin = false,
  initialQuery = '',
  publications = false,
  returnFocusOnClose = true,
  instant = false,
  initialPage = null,
  initialMode = 'search',
}: CommandPaletteProps) {
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

  const [query, setQuery] = useState(initialQuery)
  // Ranking follows a deferred copy: the field shows every keystroke at once.
  const deferredQuery = useDeferredValue(query)
  // The nested page on screen (null = the top level).
  const [subpage, setSubpage] = useState<PalettePage | null>(initialPage)
  const [mode, setMode] = useState<PaletteMode>(normalizePaletteMode(initialMode))
  const [activeIdx, setActiveIdx] = useState(0)
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [loading, setLoading] = useState(false)
  const [indexFailed, setIndexFailed] = useState(false)
  const [sections, setSections] = useState<Item[]>([])
  const [recent, setRecent] = useState<RecentRecord[]>([])
  const [restoreFocus, setRestoreFocus] = useState(true)
  const [isMac, setIsMac] = useState(true)
  const [unread, setUnread] = useState<number | null>(null)
  // The rows render once the dialog's first frame is on screen (see below).
  const [listReady, setListReady] = useState(false)
  // A keyboard is likely (fine pointer): the Keyboard shortcuts page is offered.
  const [keyboardLikely, setKeyboardLikely] = useState(true)
  // Admin destinations and the commands of the admin view on screen (H14).
  const viewCommands = useRegisteredAdminCommands()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pending = useRef<(() => void) | null>(null)
  // Read when the palette opens; a prefilled query is selected on focus so typing replaces it.
  const initialQueryRef = useRef(initialQuery)
  initialQueryRef.current = initialQuery
  const initialPageRef = useRef(initialPage)
  initialPageRef.current = initialPage
  const initialModeRef = useRef<PaletteMode>(initialMode)
  initialModeRef.current = normalizePaletteMode(initialMode)
  const selectOnFocus = useRef(false)

  useEffect(() => {
    setIsMac(isApplePlatform(navigator as Navigator & { userAgentData?: { platform?: string } }))
  }, [])

  // Fresh state every time the palette opens.
  useEffect(() => {
    if (!isOpen) return
    // A fine pointer, or a touch screen whose visitor has used a hardware keyboard ("?" opened this).
    setKeyboardLikely(!window.matchMedia(COARSE_POINTER_QUERY).matches || keyboardSeen())
    setQuery(initialQueryRef.current)
    // Ask is a view of the top level: opened in Ask mode, no nested page.
    setMode(initialModeRef.current)
    setSubpage(initialModeRef.current === 'ask' ? null : initialPageRef.current)
    selectOnFocus.current = initialQueryRef.current !== ''
    setActiveIdx(0)
    setRestoreFocus(true)
  }, [isOpen])

  // First frame: the frame, the field and the caret; the rows follow in the
  // next task, after that frame has painted — so the interaction that opened
  // the palette only pays for the shell (INP), never for reading the page's
  // sections (a layout pass) or rendering 40 rows.
  useEffect(() => {
    if (!isOpen) {
      setListReady(false)
      return
    }
    let timer = 0
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        setSections(collectSections())
        setRecent(readRecent())
        setListReady(true)
      }, 0)
    })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [isOpen])

  // Content index: one request per visit (shared by every open).
  useEffect(() => {
    if (!isOpen || index) return
    let alive = true
    setLoading(true)
    setIndexFailed(false)
    loadSearchIndex()
      .then((idx) => {
        if (alive) setIndex(idx)
      })
      .catch(() => {
        // Pages and actions still work; the next open retries.
        if (alive) setIndexFailed(true)
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
      shortcut: adminShortcutFor(href),
      keywords: `admin ${keywords}`,
    })
    // WCAG 2.1.4: single-character shortcuts ("/", "?", "G then …", J / K,
    // [ / ], T, "E") can be turned off; ⌘K / Ctrl+K keeps working either
    // way. At the top level and on the Keyboard shortcuts page.
    const shortcutsToggle: Item = {
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
            ? { status: 'success', title: 'Keyboard shortcuts on', description: '/ opens this palette, ? lists every shortcut.' }
            : { status: 'success', title: 'Keyboard shortcuts off', description: `Single-key shortcuts are off. ${isMac ? '⌘K' : 'Ctrl+K'} still opens this palette.` },
        )
      },
      keywords: 'keyboard shortcuts hotkeys keys single key disable enable turn on off accessibility',
    }
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
        ...ADMIN_CHORDS.filter((c) => !['/admin/dashboard?tab=inbox', '/admin/dashboard?tab=cv', '/admin/dashboard?tab=home', '/admin/dashboard?tab=versions', '/admin/dashboard?tab=storage', '/admin/dashboard?tab=analytics'].includes(c.href)).map((c) =>
          admin(`go-${c.key}`, c.label, c.href, c.keywords),
        ),
        ...viewCommands.map(
          (c): Item => ({ id: `admin:${c.id}`, group: 'Admin', kind: c.run ? 'action' : 'nav', label: c.label, hint: c.hint, shortcut: c.shortcut, href: c.href, run: c.run, keywords: `admin ${c.keywords || ''}` }),
        ),
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
      ...(publications ? [page('Publications', '/publications', 'papers research articles preprints citations bibtex apa doi 论文')] : []),
      page('Now', '/now', 'status current focus'),
      page('Uses', '/uses', 'tools gear setup'),
      page('Contact', '/contact', 'email message hire'),
      page('Colophon', '/colophon', 'about this site fonts stack privacy analytics'),
      // The nested pages' entries (paletteModel.ts), first among the actions.
      {
        id: 'open:theme',
        group: 'Actions',
        kind: 'page',
        opens: 'theme',
        label: PAGE_TITLES.theme,
        hint: preference === 'system' ? 'System' : preference === 'light' ? 'Light' : 'Dark',
        keywords: 'theme appearance mode colour color dark light system',
      },
      {
        id: 'open:cv',
        group: 'Actions',
        kind: 'page',
        opens: 'cv',
        label: PAGE_TITLES.cv,
        hint: 'PDF · 中文',
        keywords: 'resume curriculum vitae pdf download chinese 简历',
      },
      {
        id: 'open:contact',
        group: 'Actions',
        kind: 'page',
        opens: 'contact',
        label: PAGE_TITLES.contact,
        hint: 'email · vCard',
        keywords: 'email mail message hire vcard reach',
      },
      {
        // Switches to Ask mode (runItem); the question is typed there.
        id: ASK_ACTION_ID,
        group: 'Actions',
        kind: 'action',
        label: ASK_COPY.en.askAction,
        hint: ASK_COPY.en.askActionHint,
        keywords: 'ask question answer quote faq 问问 提问 问题',
      },
      // CV ›
      {
        id: 'cv:view',
        group: 'Actions',
        kind: 'nav',
        page: 'cv',
        nestedOnly: true,
        label: 'View the CV',
        hint: 'English',
        href: '/cv',
        keywords: 'resume curriculum vitae open',
      },
      {
        id: 'action:cv-pdf',
        group: 'Actions',
        kind: 'action',
        page: 'cv',
        label: 'Download CV (PDF)',
        hint: 'A4 · English',
        run: () => downloadFile('/cv.pdf'),
        keywords: 'resume pdf print save download file a4',
      },
      {
        id: 'action:cv-pdf-zh',
        group: 'Actions',
        kind: 'action',
        page: 'cv',
        label: 'Download CV in 中文 (PDF)',
        hint: 'A4 · Chinese',
        run: () => downloadFile('/cv/zh.pdf'),
        keywords: 'resume pdf download chinese zh 简历 中文 下载',
      },
      {
        id: 'action:cv-zh',
        group: 'Actions',
        kind: 'nav',
        page: 'cv',
        label: 'CV in 中文',
        hint: 'Chinese version',
        href: '/cv/zh',
        keywords: 'chinese zh resume 简历 中文 cv',
      },
      // Contact ›
      {
        id: 'contact:page',
        group: 'Actions',
        kind: 'nav',
        page: 'contact',
        nestedOnly: true,
        label: 'Contact page',
        hint: 'write a message',
        href: '/contact',
        keywords: 'email message hire form',
      },
      {
        id: 'action:copy-email',
        group: 'Actions',
        kind: 'action',
        page: 'contact',
        label: 'Copy email address',
        hint: HIKO_EMAIL,
        run: () => copyAndToast(HIKO_EMAIL, 'Email copied'),
        keywords: 'contact mail clipboard',
      },
      {
        id: 'action:vcard',
        group: 'Actions',
        kind: 'action',
        page: 'contact',
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
        page: 'contact',
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
          page: 'theme',
          label,
          hint: preference === value ? 'current' : value === 'system' ? `${hint} (${systemPrefersDark() ? 'dark' : 'light'} now)` : hint,
          run: () => choose(value, null),
          keywords: `theme appearance mode colour color toggle switch ${keywords}`,
        }),
      ),
      shortcutsToggle,
      { ...shortcutsToggle, id: 'shortcuts:toggle', page: 'shortcuts', nestedOnly: true },
      // Keyboard shortcuts › (also "?"), where a keyboard is likely.
      ...(keyboardLikely
        ? [
            {
              id: 'open:shortcuts',
              group: 'Actions',
              kind: 'page',
              opens: 'shortcuts',
              label: PAGE_TITLES.shortcuts,
              hint: 'every key',
              keywords: 'keyboard shortcuts hotkeys keys cheatsheet help list',
            } satisfies Item,
          ]
        : []),
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
  }, [isAdmin, publications, editTarget, unread, index, preference, choose, shortcutsOn, keyboardLikely, isMac, toast, copyAndToast, backUpNow, logOut, viewCommands])

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

  /** The browse view (no query) of `view`: grouped at the top level, a flat list on a nested page. */
  const browseRows = useCallback(
    (view: PalettePage | null): Row[] => {
      if (view) return browseItems(items, view).map((item) => ({ item, group: item.group, indices: [] }))
      const top = browseItems(items, null)
      const grouped: Row[] = []
      const push = (group: Group, list: Item[]) => list.forEach((item) => grouped.push({ item, group, indices: [] }))
      push('Recent', recentItems)
      push('On this page', sections)
      for (const g of ['Admin', 'Pages', 'Actions', 'Writing', 'Work'] as const) {
        const list = top.filter((i) => i.group === g)
        push(g, g === 'Writing' || g === 'Work' ? list.slice(0, BROWSE_LIMIT) : list)
      }
      return grouped
    },
    [items, recentItems, sections],
  )

  /** The rows for a query on a page: the browse view, or every match ranked best-first. */
  const computeRows = useCallback(
    (q: string, view: PalettePage | null): { rows: Row[]; total: number } => {
      if (!q) {
        const list = browseRows(view)
        return { rows: list, total: list.length }
      }
      const recentIds = new Set(recent.map((r) => r.id))
      const boost = (id: string, group: Item['group']) => GROUP_BOOST[group] + (recentIds.has(id) ? 8 : 0)
      // Commands and sections (posts / case studies are searched as content
      // below); a nested page searches its own items only.
      const commands = searchableItems(items, view).filter((i) => i.group !== 'Writing' && i.group !== 'Work')
      const ranked: Array<{ row: Row; score: number }> = rankItems(view ? commands : [...sections, ...commands], q, (it) =>
        boost(it.id, it.group),
      ).map(({ item, score, indices }) => ({ row: { item, group: item.group, indices }, score }))
      if (!view) {
        for (const hit of rankSearchDocs(index?.docs || [], q, (doc) => boost(docItem(doc, 'Content').id, 'Content'), { subject: index?.subject })) {
          ranked.push({
            row: { item: docItem(hit.doc, 'Content'), group: 'Content', indices: hit.indices, detail: docDetail(hit) },
            score: hit.score,
          })
        }
      }
      ranked.sort((a, b) => b.score - a.score)
      // The "Ask Lucian a question" action is replaced by the "Ask: …" row below.
      const found = view ? ranked : ranked.filter((r) => r.row.item.id !== ASK_ACTION_ID)
      const out = found.slice(0, RESULT_LIMIT).map((r) => r.row)
      if (!view) {
        // "Ask: …" — first when the query is phrased as a question, otherwise after the results (or alone).
        const copy = askCopyFor(q, 'en')
        const askRow: Row = {
          // The row speaks the question's language: label, hint and badge alike.
          item: { id: ASK_ROW_ID, group: 'Actions', kind: 'action', label: copy.askRow(q), hint: copy.askRowHint, badge: copy.modeAsk, lang: copy.lang === 'en' ? undefined : copy.lang, uiLang: copy.lang === 'en' ? undefined : copy.lang },
          group: 'Actions',
          indices: [],
        }
        if (isExplicitQuestion(q)) out.unshift(askRow)
        else out.push(askRow)
      }
      return { rows: out, total: found.length }
    },
    [browseRows, items, sections, recent, index],
  )

  const q = deferredQuery.trim()
  const searching = q !== ''
  // Search, or Ask (the answer view replaces the rows; the field is shared).
  const asking = mode === 'ask'
  // The rows of the search view; none while a question is typed (Ask ranks passages instead).
  const { rows, total } = useMemo(
    (): { rows: Row[]; total: number } => (asking ? NO_ROWS : listReady ? computeRows(q, subpage) : { rows: [], total: 0 }),
    [asking, listReady, q, subpage, computeRows],
  )

  // ── Ask mode (J1): answers quoted from the site (components/Search) ─────
  const ask = useAsk(index, query, isOpen && asking, { failed: indexFailed })
  // The palette's chrome is English; the answer speaks the question's language.
  const askCopy = askCopyFor(ask.state.question, 'en')
  const askOpts = ask.options
  // The search results without the "Ask: …" row (the counts, the empty state).
  const matchCount = rows.filter((r) => r.item.id !== ASK_ROW_ID).length

  // The highlighted option (always one that exists): a row, or an Ask option.
  const optionCount = asking ? askOpts.length : rows.length
  const active = optionCount ? Math.min(activeIdx, optionCount - 1) : -1
  const activeItem = !asking && active >= 0 ? rows[active].item : undefined

  // A new answer starts from its first option.
  useEffect(() => setActiveIdx(0), [askOpts])

  // Searches and questions that find nothing become the search_empty goal (lib/analytics/searchEmpty).
  useEffect(() => listenSearchEmpty(), [])

  useEffect(() => {
    if (!isOpen || active < 0) return
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, isOpen, asking])

  // A settled query that found nothing is reported once per open (lib/search/emptyResult);
  // closing the palette on one reports it at once — the visitor gave up on it.
  const reported = useRef(new Set<string>())
  const pendingEmpty = useRef<{ text: string; mode: PaletteMode; key: string } | null>(null)
  const reportEmpty = (text: string, emptyMode: PaletteMode, key: string) => {
    if (reported.current.has(key)) return
    reported.current.add(key)
    onEmptyResult(text, emptyMode)
  }
  useEffect(() => {
    if (isOpen) {
      reported.current = new Set()
      return
    }
    const pending = pendingEmpty.current
    pendingEmpty.current = null
    if (pending) reportEmpty(pending.text, pending.mode, pending.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reportEmpty only reads refs
  }, [isOpen])
  const searchEmpty = !asking && !subpage && listReady && searching && !!index && matchCount === 0
  const askEmpty = asking && ask.state.ready && !ask.pending && ask.state.result.status === 'none'
  useEffect(() => {
    if (!isOpen) return // a pending query is left for the close effect above
    if (!(searchEmpty || askEmpty)) {
      pendingEmpty.current = null
      return
    }
    const text = query.trim()
    const key = `${mode}:${text.toLowerCase()}`
    pendingEmpty.current = { text, mode, key }
    const id = window.setTimeout(() => {
      pendingEmpty.current = null
      reportEmpty(text, mode, key)
    }, EMPTY_SETTLE_MS)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reportEmpty only reads refs
  }, [isOpen, searchEmpty, askEmpty, query, mode])

  // A page that stays highlighted a moment is prefetched, so Enter opens it
  // at once; arrowing past rows costs nothing.
  const prefetchHref = activeItem && isPrefetchableHref(activeItem.href, activeItem.external) ? activeItem.href : undefined
  useEffect(() => {
    if (!isOpen || !prefetchHref) return
    const timer = window.setTimeout(() => {
      router.prefetch(prefetchHref).catch(() => undefined)
    }, PREFETCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [isOpen, prefetchHref, router])

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
    if (item.kind === 'section' || item.kind === 'page') return
    const record: RecentRecord = { id: item.id, label: item.label, href: item.href, group: item.group }
    const next = [record, ...readRecent().filter((r) => r.id !== item.id)]
    writeRecent(next)
  }

  const openSubpage = (next: PalettePage) => {
    setSubpage(next)
    setQuery('')
    setActiveIdx(0)
  }

  // Back to the top level, with the entry of the page just left highlighted.
  const leaveSubpage = () => {
    const from = subpage
    if (!from) return
    const entry = browseRows(null).findIndex((r) => r.item.opens === from)
    setSubpage(null)
    setQuery('')
    setActiveIdx(Math.max(0, entry))
    inputRef.current?.focus()
  }

  /** Search ↔ Ask: the typed text stays (a search becomes a question and back); Ask leaves any nested page. */
  const switchMode = (next: PaletteMode) => {
    setMode(next)
    if (next === 'ask') setSubpage(null)
    setActiveIdx(0)
    inputRef.current?.focus()
  }

  const runItem = (item: Item | undefined) => {
    if (!item) return
    if (item.opens) {
      openSubpage(item.opens)
      return
    }
    // "Ask: …" / "Ask Lucian a question": stay open, in Ask mode.
    if (item.id === ASK_ROW_ID || item.id === ASK_ACTION_ID) {
      switchMode('ask')
      return
    }
    remember(item)
    // Navigation and section jumps move focus themselves; actions (and a
    // page opened in a new tab) hand focus back to whatever opened the palette.
    setRestoreFocus(item.kind === 'action' || !!item.external)
    if (item.href && !item.run) {
      // A page opens at once: the closing dialog is lifted out of the route
      // transition's snapshot and fades out on its own (lib/viewTransition.ts
      // liftDismissibleLayers), so nothing waits for its exit animation.
      if (item.external) window.open(item.href, '_blank', 'noopener,noreferrer')
      else void router.push(item.href)
      onClose()
      return
    }
    pending.current = () => {
      if (item.run) void item.run()
    }
    onClose()
  }

  /** Run an Ask option (Enter, or a click — a modified click opens a quote's link natively, in a new tab). */
  const runAsk = (option: AskOption | undefined, e?: React.MouseEvent) => {
    if (!option) return
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return
    e?.preventDefault()
    if (option.kind === 'suggestion') {
      setQuery(option.question)
      inputRef.current?.focus()
      return
    }
    if (option.kind === 'search') {
      switchMode('search')
      return
    }
    setRestoreFocus(false)
    if (option.kind === 'contact') {
      const question = (ask.state.question || query).trim()
      pending.current = () => {
        // Into the contact form's draft (and a mounted form) — never into the URL.
        const handed = stashContactQuestion(question)
        if (router.pathname === '/contact') {
          // A form that took the question brings its message into view and focuses it itself.
          if (handed !== 'form') document.getElementById(CONTACT_FORM_ID)?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
        } else void router.push(`/contact#${CONTACT_FORM_ID}`)
      }
    } else {
      const { href, passage } = option.quote
      pending.current = () => openCitation(href, passage.terms)
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
    if (asking && e.key === 'Backspace' && query === '') {
      // Back to Search from an empty question (as in Raycast); Escape closes.
      e.preventDefault()
      switchMode('search')
    } else if (!asking && pageKeyAction(e.key, query, subpage) === 'back') {
      // Escape / Backspace in an empty field leave the nested page; the
      // dialog stays open (its own Escape handler never sees the key).
      e.preventDefault()
      e.stopPropagation()
      leaveSubpage()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(optionCount ? (active + 1) % optionCount : 0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(optionCount ? (active - 1 + optionCount) % optionCount : 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (asking) {
        // Still typing: answer the question first (Enter again opens a quote).
        if (ask.pending) ask.flush()
        else runAsk(askOpts[active])
        return
      }
      // Typed faster than the deferred ranking (or before the first rows):
      // rank the field's text now, so Enter never opens a stale row.
      const live = query.trim()
      if (live !== q || !listReady) runItem(computeRows(live, subpage).rows[0]?.item)
      else runItem(activeItem)
    }
  }

  const mod = isMac ? '⌘' : 'Ctrl'
  const pageShortcuts = NAV_SHORTCUTS.map((s) => items.find((i) => i.id === `page:${s.url}`)).filter((i): i is Item => !!i)

  const renderRow = (row: Row, idx: number) => {
    const { item, detail } = row
    const selected = idx === active
    const sideHint = row.group === 'Recent' ? item.group : item.hint
    return (
      <Flex
        key={`${row.group}:${item.id}`}
        id={optId(idx)}
        data-idx={idx}
        role="option"
        aria-selected={selected}
        onMouseMove={() => !selected && setActiveIdx(idx)}
        // The field keeps focus (and with it the keys: ↑ ↓ ↵, ⌫ / Esc on a page).
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => runItem(item)}
        px={3}
        py={2}
        minH="44px"
        borderRadius="md"
        cursor="pointer"
        bg={selected ? 'var(--accent-soft)' : 'transparent'}
        boxShadow={selected ? 'inset 2px 0 0 var(--accent)' : 'none'}
        alignItems="center"
        justifyContent="space-between"
        gap={3}
      >
        <Box minW={0} flex={1}>
          <Flex alignItems="baseline" gap={2} minW={0}>
            {/* The label keeps its width; a side hint gives way first. */}
            <Text as="span" fontSize="14px" color="page.fg" noOfLines={1} lang={item.lang} flexShrink={0} maxW="100%">
              <Highlighted text={item.label} indices={row.indices} />
            </Text>
            {!detail && sideHint && (
              <Text as="span" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" noOfLines={1} flexShrink={1} minW={0} lang={row.group === 'Recent' ? undefined : item.uiLang}>
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
          {searching && !subpage && (
            <Text as="span" fontFamily={MONO} fontSize="10px" letterSpacing="0.08em" textTransform="uppercase" color="page.fg-secondary" lang={item.badge ? item.uiLang : undefined}>
              {item.badge || item.group}
            </Text>
          )}
          {!searching && shortcutsOn && item.shortcut && <Key>{item.shortcut}</Key>}
          {item.opens && (
            // A nested page: › like a menu that opens a submenu.
            <Text as="span" aria-hidden color="page.fg-secondary" fontFamily={MONO} fontSize="13px" lineHeight={1}>
              ›
            </Text>
          )}
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

  /** One line of the shortcut sheet. */
  const sheetRow = (label: string, keys: React.ReactNode, key = label) => (
    <div key={key}>
      <dt>{label}</dt>
      <dd>{keys}</dd>
    </div>
  )
  const keysOf = (keys: readonly string[], joiner: 'or' | 'then' | ' ' = ' ') =>
    keys.map((k, i) => (
      <React.Fragment key={k}>
        {i > 0 && (joiner === ' ' ? ' ' : <Text as="span"> {joiner} </Text>)}
        <Key>{k}</Key>
      </React.Fragment>
    ))

  /**
   * The keyboard cheatsheet: compact under the browse view, every key on the
   * Keyboard shortcuts page. Hidden on touch-first devices until a hardware
   * keyboard has been used there (components/Chrome/platform).
   */
  const renderSheet = (full: boolean) => (
    <Box
      as="section"
      aria-label="Keyboard shortcuts"
      mt={2}
      mx={3}
      mb={2}
      pt={full ? 2 : 4}
      borderTop={full ? undefined : '1px solid'}
      borderColor="page.border"
      sx={HIDE_ON_COARSE_POINTER}
    >
      {!full && (
        <Text fontFamily={MONO} fontSize="10px" letterSpacing="0.16em" textTransform="uppercase" color="page.fg-secondary" mb={3}>
          Shortcuts
        </Text>
      )}
      {full && !shortcutsOn && (
        <Text fontSize="12px" color="page.fg-secondary" mb={3}>
          Single-key shortcuts are off; {mod} K still opens this palette. Turn them on above.
        </Text>
      )}
      <Box
        as="dl"
        display="grid"
        gridTemplateColumns={{ base: '1fr', sm: '1fr 1fr' }}
        columnGap={6}
        rowGap={2}
        fontSize="12px"
        color="page.fg-secondary"
        sx={{ '& > div': { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 3 }, '& dd': { m: 0, whiteSpace: 'nowrap' } }}
      >
        {sheetRow(
          'Open / close palette',
          <>
            <Key>{mod}</Key> <Key>K</Key>
            {shortcutsOn && (
              <>
                {' '}
                <Text as="span">or</Text> <Key>/</Key>
              </>
            )}
          </>,
        )}
        {sheetRow('Move / open', keysOf(['↑', '↓', '↵']))}
        {full && sheetRow('Back from a page', keysOf(['⌫', 'Esc'], 'or'))}
        {!full &&
          (shortcutsOn ? (
            <>
              {pageShortcuts.map((it) => sheetRow(`Go to ${it.label}`, <Key>{it.shortcut}</Key>, it.id))}
              {keyboardLikely && sheetRow('Every shortcut', <Key>?</Key>)}
            </>
          ) : (
            sheetRow('Single-key shortcuts', 'off')
          ))}
        {full && (
          <>
            {LAYER_SHORTCUT_ROWS.filter((r) => r.keys[0] !== '/').map((r) => sheetRow(r.label, keysOf(r.keys)))}
            {pageShortcuts.map((it) => sheetRow(`Go to ${it.label}`, keysOf(['G', (it.shortcut || '').slice(2)], 'then'), it.id))}
            {isAdmin && editTarget && sheetRow('Edit this page', <Key>E</Key>)}
          </>
        )}
      </Box>
    </Box>
  )

  const resultText = !listReady
    ? ''
    : asking
      ? askStatusText(ask.state, askCopy)
      : `${subpage ? `${PAGE_TITLES[subpage]}: ` : ''}${
          searching
            ? total > matchCount
              ? `Showing ${matchCount} of ${total} results`
              : `${total} result${total === 1 ? '' : 's'}`
            : `${rows.length} command${rows.length === 1 ? '' : 's'}`
        }`

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
      // On a nested page Escape goes back to the top level, wherever focus is.
      closeOnEsc={!subpage}
      onEsc={subpage ? leaveSubpage : undefined}
    >
      {/* A plain scrim on touch screens: a full-screen blur costs phones a
          frame or more on open (and nothing under reduced transparency). */}
      <ModalOverlay bg="rgba(0,0,0,0.5)" sx={{ '@media (hover: hover) and (pointer: fine)': { backdropFilter: 'blur(12px)' } }} />
      <ModalContent
        aria-label="Command palette"
        lang={chromeLang}
        motionProps={
          // From the keyboard it is simply there; from a click it scales in.
          instant || reduceMotion
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
          {subpage ? (
            // The nested page: a chip that leads back (as do ⌫ and Esc).
            <Box
              as="button"
              type="button"
              onClick={leaveSubpage}
              aria-label={`Back to all commands (leave ${PAGE_TITLES[subpage]})`}
              display="inline-flex"
              alignItems="center"
              gap={1}
              // On a very narrow window the chip gives way before the field's minimum (its title ends in an ellipsis).
              flexShrink={1}
              minW={0}
              minH="26px"
              px={2}
              borderRadius="control"
              border="1px solid"
              borderColor="page.border-strong"
              bg="page.surface"
              color="page.fg"
              fontFamily={MONO}
              fontSize="11px"
              lineHeight={1}
              _hover={{ borderColor: 'accent.text' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
            >
              <Text as="span" aria-hidden color="page.fg-secondary">
                ‹
              </Text>
              <Text as="span" minW={0} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {PAGE_TITLES[subpage]}
              </Text>
            </Box>
          ) : (
            <Text as="span" aria-hidden color={asking ? 'accent.text' : 'page.fg-secondary'} fontFamily={MONO} fontSize="13px" lineHeight={1}>
              {asking ? '?' : '›'}
            </Text>
          )}
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIdx(0)
            }}
            onFocus={(e) => {
              if (!selectOnFocus.current) return
              selectOnFocus.current = false
              e.currentTarget.select()
            }}
            onKeyDown={onKey}
            role="combobox"
            aria-label={asking ? ASK_COPY.en.inputLabel : subpage ? `Search ${PAGE_TITLES[subpage]}` : 'Search pages, sections, actions, posts, case studies and the CV'}
            aria-expanded={optionCount > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optId(active) : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            // On a nested page the chip names the page: a short placeholder.
            placeholder={asking ? ASK_COPY.en.placeholder : subpage ? 'Filter…' : 'Search or jump to…'}
            variant="unstyled"
            fontSize="15px"
            color="page.fg"
            _placeholder={{ color: 'page.fg-secondary' }}
            // The dialog is the focus context and the caret marks the field;
            // a ring inside the header bar would only add noise.
            _focusVisible={{ outline: 'none' }}
            flex={1}
            // Never squeezed to nothing; a clipped placeholder or query ends in an ellipsis.
            minW="72px"
            textOverflow="ellipsis"
          />
          {loading && <Spinner size="xs" color="page.fg-secondary" label="Loading the search index" />}
          {/* Search / Ask belongs to the top level; a nested page has the chip (and ⌫ / Esc) to go back. */}
          {!subpage && <ModeToggle mode={mode} onChange={switchMode} labels={{ group: ASK_COPY.en.modes, search: ASK_COPY.en.modeSearch, ask: ASK_COPY.en.modeAsk }} />}
          <Box display={{ base: 'none', sm: 'inline-flex' }} flexShrink={0}>
            <Key>ESC</Key>
          </Box>
        </Flex>

        <Box
          ref={scrollRef}
          // Long answers scroll: the region is reachable by keyboard too (↑ ↓ in the field scroll it as well).
          role="region"
          aria-label={asking ? ASK_COPY.en.name : 'Results'}
          tabIndex={0}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px' }}
          maxH={['65vh', '60vh']}
          overflowY="auto"
          p={2}
          sx={{
            height: { base: 'min(var(--list-h), 65vh)', sm: 'min(var(--list-h), 60vh)' },
            '&[data-ready]': { transition: 'height var(--duration-fast) var(--ease-standard)' },
          }}
        >
          {/* Measured from the first frame that has rows, so opening never glides. */}
          <Box ref={listReady ? observeContent : undefined}>
            {asking ? (
              listReady ? (
                <AskView
                  state={ask.state}
                  options={askOpts}
                  copy={askCopy}
                  pending={ask.pending}
                  activeIdx={active}
                  optId={optId}
                  listId={listId}
                  onHover={setActiveIdx}
                  onRun={runAsk}
                />
              ) : (
                <Box id={listId} role="listbox" aria-label={ASK_COPY.en.name} />
              )
            ) : (
              <>
                {listReady && searching && matchCount === 0 && (
                  // Above the list: the "Ask: …" row follows at the top level.
                  <Flex direction="column" align="center" justify="center" pt={8} pb={subpage ? 8 : 4} color="page.fg-secondary" fontFamily={MONO} fontSize="12px" gap={1}>
                    <Text>no matches</Text>
                    <Text>{loading && !subpage ? 'still loading posts and projects…' : 'try fewer or different letters'}</Text>
                  </Flex>
                )}
                <Box id={listId} role="listbox" aria-label={subpage ? PAGE_TITLES[subpage] : 'Commands'}>
                  {searching || subpage ? rows.map((row, i) => renderRow(row, i)) : renderGrouped()}
                </Box>
                {listReady && !searching && (subpage === 'shortcuts' ? renderSheet(true) : subpage ? null : renderSheet(false))}
              </>
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
            {(subpage || asking) && (
              <Flex gap={1} alignItems="center">
                <Key>⌫</Key>
                <Text>back</Text>
              </Flex>
            )}
          </Flex>
          {/* While asking, the status speaks the question's language (askStatusText uses its copy). */}
          <Text role="status" aria-live="polite" ml="auto" className="tnum" lang={asking ? askCopy.lang : undefined}>
            {resultText}
          </Text>
        </Flex>
      </ModalContent>
    </Modal>
  )
}
