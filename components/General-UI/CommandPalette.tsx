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
  useColorMode,
  usePrefersReducedMotion,
  useToast,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import { highlightSegments, rankItems } from '../Article/fuzzyMatch'
import { jumpToSection } from '../Article/useActiveHeading'
import { copyText } from '../MDX/clipboard'

/**
 * ⌘K command palette.
 *
 *   - Fuzzy search over pages, actions, posts, case studies and the sections
 *     of the current page (elements with `data-nav-label` + id, and article
 *     headings), ranked best-first with the matched characters highlighted.
 *   - Empty query: recently used items, this page's sections, everything
 *     grouped, and a keyboard-shortcut cheatsheet.
 *   - WAI-ARIA combobox: the input owns a listbox, the active option is
 *     announced via aria-activedescendant, result counts via a live region.
 *   - Honours prefers-reduced-motion (no open/close animation, instant
 *     section jumps).
 *
 * Posts / case studies are fetched once, the first time the palette opens.
 * Recent items live in localStorage (per browser; failures are ignored).
 */

type Group = 'Recent' | 'On this page' | 'Pages' | 'Actions' | 'Writing' | 'Work'
type Kind = 'nav' | 'action' | 'section'

type Item = {
  id: string
  group: Exclude<Group, 'Recent'>
  kind: Kind
  label: string
  hint?: string
  shortcut?: string
  href?: string
  external?: boolean
  run?: () => void | Promise<void>
  keywords?: string
  lang?: string
}

type Row = { item: Item; group: Group; indices: number[] }

type ListEntry = { slug: string; title: string; permalink: string; description?: string | null; tags?: string[]; tech?: string[]; lang?: string }
type DynamicLists = { posts: ListEntry[]; work: ListEntry[] }

type RecentRecord = { id: string; label: string; href?: string; group: Item['group'] }

const HIKO_EMAIL = 'hi@lucian-dev.com'
const RECENT_KEY = 'cmdk:recent:v1'
const RECENT_MAX = 5
const RESULT_LIMIT = 40
const GROUP_ORDER: Group[] = ['Recent', 'On this page', 'Pages', 'Actions', 'Writing', 'Work']
const GROUP_BOOST: Record<Item['group'], number> = { Pages: 6, Actions: 4, 'On this page': 3, Writing: 2, Work: 2 }
const MONO = 'var(--font-geist-mono), monospace'

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

function Highlighted({ text, indices }: { text: string; indices: number[] }) {
  return (
    <>
      {highlightSegments(text, indices).map((seg, i) =>
        seg.match ? (
          <Box as="mark" key={i} bg="transparent" color="var(--accent)" fontWeight={600}>
            {seg.text}
          </Box>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ),
      )}
    </>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <Kbd fontFamily={MONO} fontSize="10px" fontWeight={500} bg="transparent" border="1px solid" borderColor="page.border-strong" color="page.fg-secondary">
      {children}
    </Kbd>
  )
}

export default function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const reduceMotion = usePrefersReducedMotion()
  const { colorMode, toggleColorMode } = useColorMode()
  const baseId = useId()
  const listId = `${baseId}-list`
  const optId = (i: number) => `${baseId}-opt-${i}`

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [dyn, setDyn] = useState<DynamicLists | null>(null)
  const [loading, setLoading] = useState(false)
  const [sections, setSections] = useState<Item[]>([])
  const [recent, setRecent] = useState<RecentRecord[]>([])
  const [restoreFocus, setRestoreFocus] = useState(true)
  const [isMac, setIsMac] = useState(true)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const pending = useRef<(() => void) | null>(null)
  const dynLoaded = useRef(false)

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent))
  }, [])

  // Fresh state every time the palette opens.
  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setActiveIdx(0)
    setRestoreFocus(true)
    setSections(collectSections())
    setRecent(readRecent())
  }, [isOpen])

  // Posts + case studies: fetched once, cached for the session.
  useEffect(() => {
    if (!isOpen || dynLoaded.current) return
    dynLoaded.current = true
    setLoading(true)
    Promise.all([
      fetch('/api/blog/list').then((r) => (r.ok ? r.json() : { items: [] })),
      fetch('/api/work/list').then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([blog, work]) => setDyn({ posts: blog.items || [], work: work.items || [] }))
      .catch(() => {
        dynLoaded.current = false
        setDyn({ posts: [], work: [] })
      })
      .finally(() => setLoading(false))
  }, [isOpen])

  const copyAndToast = useCallback(
    async (text: string, title: string) => {
      const ok = await copyText(text)
      toast(ok ? { status: 'success', title, description: text } : { status: 'error', title: 'Copy failed' })
    },
    [toast],
  )

  const items: Item[] = useMemo(() => {
    const page = (label: string, href: string, shortcut?: string, keywords?: string): Item => ({
      id: `page:${href}`,
      group: 'Pages',
      kind: 'nav',
      label,
      href,
      shortcut,
      keywords,
    })
    const list: Item[] = [
      page('Home', '/', 'G H', 'start landing index'),
      page('About', '/about', 'G A', 'bio profile'),
      page('Work', '/work', 'G W', 'case studies projects portfolio'),
      page('Writing', '/blog', 'G B', 'blog posts essays articles'),
      page('CV', '/cv', 'G C', 'resume curriculum vitae'),
      page('Now', '/now', 'G N', 'status current focus'),
      page('Uses', '/uses', 'G U', 'tools gear setup'),
      page('Contact', '/contact', undefined, 'email message hire'),
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
        href: '/cv?lang=zh',
        keywords: 'chinese zh resume 简历 中文 cv',
      },
      {
        id: 'action:theme',
        group: 'Actions',
        kind: 'action',
        label: 'Toggle theme',
        hint: colorMode === 'dark' ? 'switch to light' : 'switch to dark',
        run: toggleColorMode,
        keywords: 'dark light mode appearance colour color',
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
        keywords: 'subscribe feed atom',
      },
      {
        id: 'action:admin',
        group: 'Actions',
        kind: 'nav',
        label: 'Admin login',
        href: '/admin/login',
        keywords: 'sign in dashboard',
      },
    ]
    for (const p of dyn?.posts || []) {
      list.push({
        id: `post:${p.slug}`,
        group: 'Writing',
        kind: 'nav',
        label: p.title || p.slug,
        href: p.permalink,
        keywords: ['post blog', p.description, ...(p.tags || [])].filter(Boolean).join(' '),
        lang: p.lang && p.lang !== 'en' ? p.lang : undefined,
      })
    }
    for (const w of dyn?.work || []) {
      list.push({
        id: `work:${w.slug}`,
        group: 'Work',
        kind: 'nav',
        label: w.title || w.slug,
        href: w.permalink,
        keywords: ['project case study', w.description, ...(w.tech || [])].filter(Boolean).join(' '),
        lang: w.lang && w.lang !== 'en' ? w.lang : undefined,
      })
    }
    return list
  }, [dyn, colorMode, toggleColorMode, copyAndToast])

  const recentItems: Item[] = useMemo(() => {
    const out: Item[] = []
    for (const r of recent) {
      const live = items.find((i) => i.id === r.id)
      if (live) out.push(live)
      else if (r.href && r.href.startsWith('/') && !r.href.startsWith('//')) {
        out.push({ id: r.id, group: r.group, kind: 'nav', label: r.label, href: r.href })
      }
    }
    return out
  }, [recent, items])

  const rows: Row[] = useMemo(() => {
    const q = query.trim()
    if (!q) {
      const grouped: Row[] = []
      const push = (group: Group, list: Item[]) => list.forEach((item) => grouped.push({ item, group, indices: [] }))
      push('Recent', recentItems)
      push('On this page', sections)
      for (const g of ['Pages', 'Actions', 'Writing', 'Work'] as const) {
        const list = items.filter((i) => i.group === g)
        push(g, g === 'Writing' || g === 'Work' ? list.slice(0, 6) : list)
      }
      return grouped
    }
    const recentIds = new Set(recent.map((r) => r.id))
    return rankItems([...sections, ...items], q, (it) => GROUP_BOOST[it.group] + (recentIds.has(it.id) ? 8 : 0))
      .slice(0, RESULT_LIMIT)
      .map(({ item, indices }) => ({ item, group: item.group, indices }))
  }, [query, items, sections, recentItems, recent])

  useEffect(() => setActiveIdx(0), [query])

  useEffect(() => {
    if (!isOpen) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, isOpen])

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

  // "G then <key>" navigation (the shortcuts listed next to Pages), active
  // anywhere on the site except while typing in a field.
  useEffect(() => {
    const targets: Record<string, string> = {}
    for (const it of items) {
      const m = it.shortcut?.match(/^G ([A-Z])$/)
      if (m && it.href) targets[m[1].toLowerCase()] = it.href
    }
    let armedUntil = 0
    const onKeyDown = (e: KeyboardEvent) => {
      if (isOpen || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      const k = e.key.toLowerCase()
      if (Date.now() < armedUntil && targets[k]) {
        armedUntil = 0
        e.preventDefault()
        if (router.asPath.split(/[?#]/)[0] !== targets[k]) router.push(targets[k])
        return
      }
      armedUntil = k === 'g' && !e.shiftKey ? Date.now() + 1200 : 0
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [items, isOpen, router])

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
  const pageShortcuts = items.filter((i) => i.shortcut)

  const renderRow = (row: Row, idx: number) => {
    const { item } = row
    const active = idx === activeIdx
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
        minH="40px"
        borderRadius="md"
        cursor="pointer"
        bg={active ? 'var(--accent-soft)' : 'transparent'}
        boxShadow={active ? 'inset 2px 0 0 var(--accent)' : 'none'}
        alignItems="center"
        justifyContent="space-between"
        gap={3}
      >
        <Flex alignItems="baseline" gap={2} minW={0}>
          <Text as="span" fontSize="14px" color="page.fg" noOfLines={1} lang={item.lang}>
            <Highlighted text={item.label} indices={row.indices} />
          </Text>
          {(item.hint || row.group === 'Recent') && (
            <Text as="span" fontFamily={MONO} fontSize="11px" color="page.fg-secondary" noOfLines={1}>
              {row.group === 'Recent' ? item.group : item.hint}
            </Text>
          )}
        </Flex>
        <Flex alignItems="center" gap={2} flexShrink={0}>
          {searching && (
            <Text as="span" fontFamily={MONO} fontSize="10px" letterSpacing="0.08em" textTransform="uppercase" color="page.fg-secondary">
              {item.group}
            </Text>
          )}
          {!searching && item.shortcut && <Key>{item.shortcut}</Key>}
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
    ? `${rows.length} result${rows.length === 1 ? '' : 's'}`
    : `${rows.length} command${rows.length === 1 ? '' : 's'}`

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onCloseComplete={onCloseComplete}
      size="xl"
      motionPreset={reduceMotion ? 'none' : 'slideInBottom'}
      isCentered={false}
      initialFocusRef={inputRef}
      returnFocusOnClose={restoreFocus}
    >
      <ModalOverlay backdropFilter="blur(12px)" bg="rgba(0,0,0,0.45)" />
      <ModalContent
        aria-label="Command palette"
        bg="page.bg"
        border="1px solid"
        borderColor="page.border-strong"
        borderRadius="xl"
        mt={['8vh', '15vh']}
        mx={4}
        boxShadow="0 24px 60px rgba(0,0,0,0.35)"
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
            onKeyDown={onKey}
            role="combobox"
            aria-label="Search pages, sections, actions, posts and projects"
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
            flex={1}
          />
          {loading && <Spinner size="xs" color="page.fg-secondary" label="Loading posts and projects" />}
          <Key>ESC</Key>
        </Flex>

        <Box ref={listRef} maxH={['65vh', '60vh']} overflowY="auto" p={2}>
          <Box id={listId} role="listbox" aria-label="Commands">
            {searching ? rows.map((row, i) => renderRow(row, i)) : renderGrouped()}
          </Box>
          {searching && rows.length === 0 && (
            <Flex direction="column" align="center" justify="center" py={10} color="page.fg-secondary" fontFamily={MONO} fontSize="12px" gap={1}>
              <Text>no matches</Text>
              <Text opacity={0.75}>try fewer or different letters</Text>
            </Flex>
          )}
          {!searching && (
            <Box as="section" aria-label="Keyboard shortcuts" mt={2} mx={3} mb={2} pt={4} borderTop="1px solid" borderColor="page.border">
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
                  </dd>
                </div>
                <div>
                  <dt>Move / open</dt>
                  <dd>
                    <Key>↑</Key> <Key>↓</Key> <Key>↵</Key>
                  </dd>
                </div>
                {pageShortcuts.map((it) => (
                  <div key={it.id}>
                    <dt>Go to {it.label}</dt>
                    <dd>
                      <Key>{it.shortcut}</Key>
                    </dd>
                  </div>
                ))}
              </Box>
            </Box>
          )}
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
          <Flex gap={3} alignItems="center" display={{ base: 'none', sm: 'flex' }} aria-hidden>
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
          <Text role="status" aria-live="polite" ml="auto">
            {resultText}
          </Text>
        </Flex>
      </ModalContent>
    </Modal>
  )
}
