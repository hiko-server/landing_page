import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Box, Button, Flex, Input, Spinner, Text } from '@chakra-ui/react'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { rankItems } from '../../Article/fuzzyMatch'
import { MONO } from '../shell/ui'
import { CODE_LANGUAGES, filterSlashItems, videoLinkUrl, type SlashItem, type SlashItemId } from './slashItems'

/**
 * The "/" command menu shared by the visual editor (TipTap Suggestion) and
 * the raw-MDX textarea. A WAI-ARIA listbox driven from the editing surface:
 * while choosing a command, focus stays in the editor (↑ ↓ Enter Esc are
 * forwarded through `keyRef`) and the surface gets aria-controls /
 * aria-activedescendant. Commands that need input (code language, video
 * URL, post search) switch the menu to a small form that takes focus.
 *
 * Positioned with Floating UI (bottom-start, offset 6, flip, shift); fades
 * and scales in over 120 ms, instantly under reduced motion.
 */

export type BlockId = Exclude<SlashItemId, 'code' | 'youtube' | 'link'>

export type SlashResult =
  | { kind: 'block'; id: BlockId }
  | { kind: 'code'; language: string }
  /** A YouTube / Vimeo watch URL, inserted as a link alone in its paragraph (it compiles to the player). */
  | { kind: 'video'; url: string; title: string }
  | { kind: 'link'; title: string; href: string }

type Step = 'code' | 'youtube' | 'link'

type LinkTarget = { title: string; href: string; kind: 'Post' | 'Case study'; slug: string }

type Props = {
  open: boolean
  query: string
  /** Viewport rectangle to anchor to (the caret / trigger). */
  anchor: () => DOMRect | null
  /** Changes whenever the anchor moved (re-positions the menu). */
  anchorKey: string | number
  /** The focused editing surface (contenteditable or textarea) for ARIA wiring. */
  controller: HTMLElement | null
  /** The parent forwards key events here while focus is in the editor. */
  keyRef: React.MutableRefObject<((e: KeyboardEvent) => boolean) | null>
  /** A command was chosen: remove the "/query" text (step = a form follows). */
  onBegin: (step: boolean) => void
  onResult: (result: SlashResult) => void
  onClose: (opts: { refocus: boolean }) => void
}

const MENU_CSS = {
  '@keyframes slashIn': {
    from: { opacity: 0, transform: 'scale(0.98)' },
    to: { opacity: 1, transform: 'none' },
  },
  animation: 'slashIn 120ms cubic-bezier(0.22, 1, 0.36, 1)',
  transformOrigin: 'top left',
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
}

/** The active option stays visible when forced colours drop backgrounds. */
const FORCED_SELECTED = { '@media (forced-colors: active)': { outline: '2px solid Highlight', outlineOffset: '-2px' } }

async function loadLinkTargets(signal: AbortSignal): Promise<LinkTarget[]> {
  const get = async (endpoint: string, base: '/blog' | '/work', kind: LinkTarget['kind']) => {
    const res = await fetch(endpoint, { cache: 'no-store', signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { items?: Array<{ slug: string; frontmatter?: Record<string, unknown> }> }
    return (data.items || []).map((it) => ({
      title: String(it.frontmatter?.title || it.slug),
      href: `${base}/${it.slug}`,
      kind,
      slug: it.slug,
    }))
  }
  const [posts, work] = await Promise.all([get('/api/admin/posts', '/blog', 'Post'), get('/api/admin/work', '/work', 'Case study')])
  return [...posts, ...work]
}

export default function SlashMenu({ open, query, anchor, anchorKey, controller, keyRef, onBegin, onResult, onClose }: Props) {
  const uid = useId().replace(/:/g, '')
  const listId = `slash-${uid}`
  const floating = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [step, setStep] = useState<Step | null>(null)
  const [lang, setLang] = useState('')
  const [ytUrl, setYtUrl] = useState('')
  const [ytTitle, setYtTitle] = useState('')
  const [ytError, setYtError] = useState('')
  const [search, setSearch] = useState('')
  const [targets, setTargets] = useState<LinkTarget[] | null>(null)
  const [targetsError, setTargetsError] = useState('')
  const firstInput = useRef<HTMLInputElement>(null)

  const items = useMemo(() => filterSlashItems(query), [query])
  const links = useMemo(() => {
    if (!targets) return []
    const q = search.trim()
    if (!q) return targets.slice(0, 8)
    return rankItems(
      targets.map((t) => ({ ...t, label: t.title, keywords: `${t.slug} ${t.kind}` })),
      q,
    )
      .slice(0, 8)
      .map((r) => targets.find((t) => t.href === r.item.href) as LinkTarget)
  }, [targets, search])

  // Reset whenever the menu closes or the query changes.
  useEffect(() => {
    if (!open) {
      setStep(null)
      setLang('')
      setYtUrl('')
      setYtTitle('')
      setYtError('')
      setSearch('')
    }
  }, [open])
  useEffect(() => setActive(0), [query, step, search])

  // Load posts / case studies for the link step.
  useEffect(() => {
    if (step !== 'link' || targets) return
    const ctrl = new AbortController()
    setTargetsError('')
    loadLinkTargets(ctrl.signal)
      .then(setTargets)
      .catch((e) => {
        if (!ctrl.signal.aborted) setTargetsError(e instanceof Error ? e.message : 'Could not load posts')
      })
    return () => ctrl.abort()
  }, [step, targets])

  // Position next to the anchor.
  const place = useCallback(() => {
    const el = floating.current
    const rect = anchor()
    if (!el || !rect) return
    const reference = { getBoundingClientRect: () => rect }
    void computePosition(reference, el, {
      strategy: 'fixed',
      placement: 'bottom-start',
      middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    })
  }, [anchor])
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place, anchorKey, step, items.length])
  useEffect(() => {
    if (!open) return
    const onMove = () => place()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, place])

  // ARIA wiring on the editing surface while choosing a command.
  const optionId = (i: number) => `${listId}-opt-${i}`
  useEffect(() => {
    if (!controller) return
    if (open && !step) {
      controller.setAttribute('aria-expanded', 'true')
      controller.setAttribute('aria-controls', listId)
      if (items.length) controller.setAttribute('aria-activedescendant', optionId(Math.min(active, items.length - 1)))
      else controller.removeAttribute('aria-activedescendant')
    }
    return () => {
      controller.removeAttribute('aria-expanded')
      controller.removeAttribute('aria-controls')
      controller.removeAttribute('aria-activedescendant')
    }
    // optionId is derived from listId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, open, step, active, items.length, listId])

  // Focus the form when a step opens.
  useEffect(() => {
    if (step) requestAnimationFrame(() => firstInput.current?.focus())
  }, [step])

  const choose = useCallback(
    (item: SlashItem | undefined) => {
      if (!item) return
      if (item.step) {
        onBegin(true)
        setStep(item.step)
        return
      }
      onBegin(false)
      onResult({ kind: 'block', id: item.id as BlockId })
    },
    [onBegin, onResult],
  )

  // Keys forwarded from the editor while the command list is showing.
  useEffect(() => {
    if (!open || step) {
      keyRef.current = null
      return
    }
    keyRef.current = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        setActive((a) => (items.length ? (a + 1) % items.length : 0))
        return true
      }
      if (e.key === 'ArrowUp') {
        setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0))
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (!items.length) return false
        choose(items[Math.min(active, items.length - 1)])
        return true
      }
      if (e.key === 'Escape') {
        onClose({ refocus: true })
        return true
      }
      return false
    }
    return () => {
      keyRef.current = null
    }
  }, [open, step, items, active, choose, onClose, keyRef])

  const submitYoutube = () => {
    const url = videoLinkUrl(ytUrl)
    if (!url) {
      setYtError('That isn’t a YouTube or Vimeo video link.')
      return
    }
    onResult({ kind: 'video', url, title: ytTitle.trim() })
  }

  const formKeys = (e: React.KeyboardEvent, submit: () => void) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose({ refocus: true })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  if (!open || typeof document === 'undefined') return null

  const optionRow = (i: number, selected: boolean, label: React.ReactNode, hint: React.ReactNode, onPick: () => void) => (
    <Flex
      key={i}
      id={optionId(i)}
      role="option"
      aria-selected={selected}
      onMouseDown={(e: React.MouseEvent) => {
        e.preventDefault()
        onPick()
      }}
      onMouseEnter={() => setActive(i)}
      align="baseline"
      justify="space-between"
      gap={3}
      px={2.5}
      py={1.5}
      borderRadius="md"
      cursor="pointer"
      bg={selected ? 'var(--accent-soft)' : 'transparent'}
      color={selected ? 'page.fg' : 'page.fg-secondary'}
      sx={selected ? FORCED_SELECTED : undefined}
    >
      <Text as="span" fontSize="13px" fontWeight={500} color="page.fg" noOfLines={1}>
        {label}
      </Text>
      <Text as="span" fontSize="11px" fontFamily={MONO} color="page.fg-secondary" flexShrink={0}>
        {hint}
      </Text>
    </Flex>
  )

  return createPortal(
    <Box
      ref={floating}
      position="fixed"
      top={0}
      left={0}
      zIndex={1500}
      w="290px"
      maxW="calc(100vw - 16px)"
      bg="page.bg-elevated"
      border="1px solid"
      borderColor="page.border-strong"
      borderRadius="lg"
      boxShadow="0 12px 32px rgba(0,0,0,0.18)"
      p={1.5}
      sx={MENU_CSS}
      onMouseDown={(e: React.MouseEvent) => {
        // Keep focus in the editor when clicking the list (not the forms).
        if (!step) e.preventDefault()
      }}
    >
      {!step ? (
        <Box id={listId} role="listbox" aria-label="Insert block" maxH="300px" overflowY="auto">
          {items.length ? (
            items.map((it, i) => optionRow(i, i === Math.min(active, items.length - 1), it.label, it.hint, () => choose(it)))
          ) : (
            <Text px={2.5} py={2} fontSize="13px" color="page.fg-secondary">
              No block matches “/{query}”.
            </Text>
          )}
        </Box>
      ) : step === 'code' ? (
        <Box as="form" onSubmit={(e: React.FormEvent) => e.preventDefault()} p={1}>
          <Text as="label" htmlFor={`${listId}-lang`} display="block" fontSize="12px" color="page.fg-secondary" mb={1.5}>
            Code block language (optional)
          </Text>
          <Input
            id={`${listId}-lang`}
            ref={firstInput}
            size="sm"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            onKeyDown={(e) => formKeys(e, () => onResult({ kind: 'code', language: lang }))}
            list={`${listId}-langs`}
            placeholder="ts, bash, python…"
            fontFamily={MONO}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id={`${listId}-langs`}>
            {CODE_LANGUAGES.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <Flex justify="flex-end" mt={2} gap={2}>
            <Button size="xs" variant="ghost" onClick={() => onClose({ refocus: true })}>
              Cancel
            </Button>
            <Button size="xs" colorScheme="accent" onClick={() => onResult({ kind: 'code', language: lang })}>
              Insert code block
            </Button>
          </Flex>
        </Box>
      ) : step === 'youtube' ? (
        <Box as="form" onSubmit={(e: React.FormEvent) => e.preventDefault()} p={1}>
          <Text as="label" htmlFor={`${listId}-yt`} display="block" fontSize="12px" color="page.fg-secondary" mb={1.5}>
            YouTube or Vimeo link
          </Text>
          <Input
            id={`${listId}-yt`}
            ref={firstInput}
            size="sm"
            type="url"
            inputMode="url"
            value={ytUrl}
            onChange={(e) => {
              setYtUrl(e.target.value)
              setYtError('')
            }}
            onKeyDown={(e) => formKeys(e, submitYoutube)}
            placeholder="https://youtu.be/… or https://vimeo.com/…"
            aria-invalid={!!ytError}
            aria-describedby={ytError ? `${listId}-yt-err` : undefined}
            autoComplete="off"
          />
          <Text as="label" htmlFor={`${listId}-yt-title`} display="block" fontSize="12px" color="page.fg-secondary" mt={2} mb={1.5}>
            Video title (on the player, read by screen readers)
          </Text>
          <Input
            id={`${listId}-yt-title`}
            size="sm"
            value={ytTitle}
            onChange={(e) => setYtTitle(e.target.value)}
            onKeyDown={(e) => formKeys(e, submitYoutube)}
            placeholder="What the video is about"
            autoComplete="off"
          />
          {ytError ? (
            <Text id={`${listId}-yt-err`} role="alert" fontSize="12px" color="red.400" mt={1.5}>
              {ytError}
            </Text>
          ) : null}
          <Flex justify="flex-end" mt={2} gap={2}>
            <Button size="xs" variant="ghost" onClick={() => onClose({ refocus: true })}>
              Cancel
            </Button>
            <Button size="xs" colorScheme="accent" onClick={submitYoutube}>
              Insert video
            </Button>
          </Flex>
        </Box>
      ) : (
        <Box p={1}>
          <Text as="label" htmlFor={`${listId}-q`} display="block" fontSize="12px" color="page.fg-secondary" mb={1.5}>
            Link to a post or case study
          </Text>
          <Input
            id={`${listId}-q`}
            ref={firstInput}
            size="sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            role="combobox"
            aria-expanded={links.length > 0}
            aria-controls={`${listId}-links`}
            aria-activedescendant={links.length ? `${listId}-link-${Math.min(active, links.length - 1)}` : undefined}
            aria-autocomplete="list"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const n = links.length
                if (n) setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n))
                return
              }
              formKeys(e, () => {
                const pick = links[Math.min(active, links.length - 1)]
                if (pick) onResult({ kind: 'link', title: pick.title, href: pick.href })
              })
            }}
            placeholder="Search by title"
            autoComplete="off"
          />
          <Box id={`${listId}-links`} role="listbox" aria-label="Posts and case studies" mt={1.5} maxH="240px" overflowY="auto">
            {targetsError ? (
              <Text role="alert" fontSize="12px" color="red.400" px={1} py={1.5}>
                Couldn’t load your posts ({targetsError}).
              </Text>
            ) : !targets ? (
              <Flex align="center" gap={2} px={1} py={2} fontSize="12px" color="page.fg-secondary">
                <Spinner size="xs" /> Loading…
              </Flex>
            ) : links.length ? (
              links.map((t, i) => (
                <Flex
                  key={t.href}
                  id={`${listId}-link-${i}`}
                  role="option"
                  aria-selected={i === Math.min(active, links.length - 1)}
                  onMouseDown={(e: React.MouseEvent) => {
                    e.preventDefault()
                    onResult({ kind: 'link', title: t.title, href: t.href })
                  }}
                  onMouseEnter={() => setActive(i)}
                  direction="column"
                  px={2.5}
                  py={1.5}
                  borderRadius="md"
                  cursor="pointer"
                  bg={i === Math.min(active, links.length - 1) ? 'var(--accent-soft)' : 'transparent'}
                  sx={i === Math.min(active, links.length - 1) ? FORCED_SELECTED : undefined}
                >
                  <Text as="span" fontSize="13px" fontWeight={500} color="page.fg" noOfLines={1}>
                    {t.title}
                  </Text>
                  <Text as="span" fontSize="11px" fontFamily={MONO} color="page.fg-secondary" noOfLines={1}>
                    {t.kind} · {t.href}
                  </Text>
                </Flex>
              ))
            ) : (
              <Text fontSize="12px" color="page.fg-secondary" px={1} py={1.5}>
                {targets.length ? 'Nothing matches.' : 'No posts or case studies yet.'}
              </Text>
            )}
          </Box>
        </Box>
      )}
    </Box>,
    document.body,
  )
}
