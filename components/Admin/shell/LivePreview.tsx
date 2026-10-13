import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Button, Flex, Text, useBreakpointValue, usePrefersReducedMotion } from '@chakra-ui/react'
import ArticleBody from '../../Article/ArticleBody'
import ErrorBoundary from '../../Common/ErrorBoundary'
import { PanelFallback } from '../../Common/PanelFallback'
import SegmentedTabs, { tabPanelProps } from './SegmentedTabs'
import { readJsonObject } from './http'
import { Eyebrow, MONO, SITE_HEADER_H, useIsMac } from './ui'

/**
 * Live preview of an MDX body rendered by the real article renderer
 * (POST /api/admin/preview → <ArticleBody tree toc />), next to the editor.
 *
 *   - From xl: a 50/50 split with a draggable 1px divider (pointer or
 *     keyboard: role="separator", ← → ±5 %; the split is remembered on this
 *     device). ⌘⇧P / Ctrl+Shift+P hides or shows the preview.
 *   - Below xl: Write | Preview tabs, toggled with ⌘⇧P too.
 *   - Compiles 500 ms after typing stops (the previous request is aborted).
 *     When the latest body does not compile, the last good render stays and
 *     an error chip shows the position; the editor's heading under the caret
 *     scrolls the preview to the same heading.
 */

type Tree = React.ComponentProps<typeof ArticleBody>['tree']
type Toc = React.ComponentProps<typeof ArticleBody>['toc']

export type PreviewProblem = { line: number | null; column: number | null; reason: string }

type PreviewState = {
  result: { tree: Tree; toc: Toc } | null
  problem: PreviewProblem | null
  pending: boolean
  /** Seconds until previews resume after a 429, else 0. */
  pausedFor: number
}

const DEBOUNCE_MS = 500
const SPLIT_KEY = 'admin:preview-split'
const OPEN_KEY = 'admin:preview-open'
const SPLIT_MIN = 25
const SPLIT_MAX = 75

function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(window.localStorage.getItem(key))
    return Number.isFinite(v) && v >= SPLIT_MIN && v <= SPLIT_MAX ? v : fallback
  } catch {
    return fallback
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage blocked: the preference just isn't remembered */
  }
}

export function problemText(p: PreviewProblem): string {
  const where = p.line !== null ? `Line ${p.line}${p.column !== null ? `:${p.column}` : ''}: ` : ''
  return `${where}${p.reason}`
}

/** Debounced compile of `body` while `enabled`. */
export function useLivePreview(body: string, enabled: boolean): PreviewState {
  const [state, setState] = useState<PreviewState>({ result: null, problem: null, pending: false, pausedFor: 0 })
  const compiled = useRef<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    if (!enabled || body === compiled.current) return
    const timer = setTimeout(async () => {
      abort.current?.abort()
      const ctrl = new AbortController()
      abort.current = ctrl
      setState((s) => ({ ...s, pending: true }))
      try {
        const res = await fetch('/api/admin/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
          signal: ctrl.signal,
        })
        const data = await readJsonObject(res)
        if (ctrl.signal.aborted) return
        if (res.status === 429) {
          const wait = Math.min(120, Math.max(5, Number(res.headers.get('retry-after')) || 30))
          setState((s) => ({ ...s, pending: false, pausedFor: wait }))
          setTimeout(() => setRetryTick((t) => t + 1), wait * 1000)
          return
        }
        compiled.current = body
        if (res.ok && data.tree) {
          setState({ result: { tree: data.tree as Tree, toc: (Array.isArray(data.toc) ? data.toc : []) as Toc }, problem: null, pending: false, pausedFor: 0 })
        } else {
          const problem: PreviewProblem =
            res.status === 422
              ? {
                  line: typeof data.line === 'number' ? data.line : null,
                  column: typeof data.column === 'number' ? data.column : null,
                  reason: typeof data.reason === 'string' ? data.reason : 'This body does not compile',
                }
              : {
                  line: null,
                  column: null,
                  reason: res.status === 401 ? 'Session expired — sign in again to refresh the preview' : `Preview failed (HTTP ${res.status})`,
                }
          if (res.status !== 422) compiled.current = null
          setState((s) => ({ ...s, problem, pending: false, pausedFor: 0 }))
        }
      } catch {
        if (ctrl.signal.aborted) return
        compiled.current = null
        setState((s) => ({ ...s, pending: false, problem: { line: null, column: null, reason: 'Network error — preview not refreshed' } }))
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [body, enabled, retryTick])

  useEffect(() => () => abort.current?.abort(), [])
  return state
}

function PreviewPane({
  state,
  showToc,
  headingIndex,
  scrollable,
}: {
  state: PreviewState
  showToc: boolean
  headingIndex: number
  scrollable: boolean
}) {
  const pane = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  // Follow the editor: scroll to the heading under the caret.
  useEffect(() => {
    const el = pane.current
    if (!el || !scrollable || !state.result) return
    const headings = el.querySelectorAll<HTMLElement>('#article-body h1, #article-body h2, #article-body h3, #article-body h4, #article-body h5, #article-body h6')
    const target = headingIndex >= 0 ? headings[Math.min(headingIndex, headings.length - 1)] : null
    const top = target ? el.scrollTop + target.getBoundingClientRect().top - el.getBoundingClientRect().top - 12 : 0
    el.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [headingIndex, scrollable, state.result, reducedMotion])

  const status = state.pausedFor
    ? `Paused for ${state.pausedFor}s (too many updates)`
    : state.pending
      ? 'Updating…'
      : state.problem
        ? 'Not compiling'
        : state.result
          ? 'Up to date'
          : ''

  return (
    <Box
      ref={pane}
      position={scrollable ? 'sticky' : 'relative'}
      top={scrollable ? `calc(${SITE_HEADER_H} + 64px)` : undefined}
      maxH={scrollable ? `calc(100vh - ${SITE_HEADER_H} - 80px)` : undefined}
      overflowY={scrollable ? 'auto' : 'visible'}
      border="1px solid"
      borderColor="page.border"
      borderRadius="lg"
      bg="page.bg"
      aria-label="Live preview"
      role="region"
      tabIndex={scrollable ? 0 : undefined}
    >
      <Flex
        position="sticky"
        top={0}
        zIndex={2}
        align="center"
        justify="space-between"
        gap={2}
        px={4}
        py={2}
        bg="page.bg-elevated"
        borderBottom="1px solid"
        borderColor="page.border"
      >
        <Eyebrow>Preview · real renderer</Eyebrow>
        <Text fontFamily={MONO} fontSize="10px" color="page.fg-secondary" role="status" aria-live="polite">
          {status}
        </Text>
      </Flex>
      {state.problem ? (
        <Box
          position="sticky"
          top="37px"
          zIndex={2}
          mx={3}
          mt={3}
          px={3}
          py={2}
          borderRadius="md"
          border="1px solid"
          borderColor="red.400"
          bg="page.bg-elevated"
          fontSize="12px"
          fontFamily={MONO}
          color="page.fg"
          role="alert"
        >
          {problemText(state.problem)}
          {state.result ? (
            <Text as="span" display="block" color="page.fg-secondary" mt={0.5} fontFamily="inherit">
              Showing the last version that compiled.
            </Text>
          ) : null}
        </Box>
      ) : null}
      <Box px={{ base: 4, md: 6 }} py={6} opacity={state.problem && state.result ? 0.55 : 1} transition="opacity 150ms">
        {state.result ? (
          <ErrorBoundary
            name="admin/live-preview"
            fallback={(p) => <PanelFallback {...p} title="The preview hit an error." />}
            resetKeys={[state.result.tree]}
          >
            <Box maxW="var(--container-prose)" mx="auto">
              <ArticleBody tree={state.result.tree} toc={showToc ? state.result.toc : []} />
            </Box>
          </ErrorBoundary>
        ) : !state.problem ? (
          <Text fontSize="sm" color="page.fg-secondary">
            {state.pending ? 'Rendering…' : 'Start writing to see the rendered article.'}
          </Text>
        ) : null}
      </Box>
    </Box>
  )
}

type Mode = 'write' | 'preview'

export default function LivePreview({
  body,
  editor,
  headingIndex,
  idPrefix,
}: {
  body: string
  /** The editor (RichEditor) shown on the "write" side. */
  editor: React.ReactNode
  /** Heading under the editor's caret (RichEditor onHeadingIndex). */
  headingIndex: number
  idPrefix: string
}) {
  const isXl = useBreakpointValue({ base: false, xl: true }, { ssr: false }) ?? false
  const isMac = useIsMac()
  const reducedMotion = usePrefersReducedMotion()
  const [mode, setMode] = useState<Mode>('write')
  const [open, setOpen] = useState(true)
  const [split, setSplit] = useState(50)
  const grid = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    setSplit(readNumber(SPLIT_KEY, 50))
    try {
      setOpen(window.localStorage.getItem(OPEN_KEY) !== '0')
    } catch {
      setOpen(true)
    }
  }, [])

  const previewVisible = isXl ? open : mode === 'preview'
  const state = useLivePreview(body, previewVisible)

  const toggle = useCallback(() => {
    if (isXl) {
      setOpen((o) => {
        store(OPEN_KEY, o ? '0' : '1')
        return !o
      })
    } else setMode((m) => (m === 'write' ? 'preview' : 'write'))
  }, [isXl])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        toggle()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toggle])

  const setSplitClamped = (v: number) => {
    const next = Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, v)))
    setSplit(next)
    store(SPLIT_KEY, String(next))
  }

  const shortcut = isMac ? '⌘⇧P' : 'Ctrl+Shift+P'
  const ariaShortcut = isMac ? 'Meta+Shift+P' : 'Control+Shift+P'

  // One stable tree for every layout, so switching view never remounts the editor.
  const showEditor = isXl || mode === 'write'
  const split2 = isXl && open
  return (
    <Box>
      <Flex justify={isXl ? 'flex-end' : 'space-between'} align="center" mb={isXl ? 2 : 3} gap={2} flexWrap="wrap">
        {isXl ? (
          <Button
            size="xs"
            variant="ghost"
            color="page.fg-secondary"
            onClick={toggle}
            aria-pressed={open}
            aria-keyshortcuts={ariaShortcut}
            title={`${open ? 'Hide' : 'Show'} preview (${shortcut})`}
          >
            {open ? 'Hide preview' : 'Show preview'}
            <Box as="span" fontFamily={MONO} fontSize="10px" color="page.muted" ml={2} aria-hidden>
              {shortcut}
            </Box>
          </Button>
        ) : (
          <SegmentedTabs<Mode>
            items={[
              { key: 'write', label: 'Write', shortcut, ariaShortcut },
              { key: 'preview', label: 'Preview', shortcut, ariaShortcut },
            ]}
            value={mode}
            onSelect={setMode}
            label="Editor view"
            idPrefix={idPrefix}
            size="sm"
          />
        )}
      </Flex>
      <Box
        ref={grid}
        display="grid"
        gridTemplateColumns={split2 ? `minmax(0, ${split}fr) 13px minmax(0, ${100 - split}fr)` : 'minmax(0, 1fr)'}
        alignItems="start"
        {...(isXl ? {} : tabPanelProps(idPrefix, mode))}
      >
        <Box minW={0} display={showEditor ? 'block' : 'none'}>
          {editor}
        </Box>
        {split2 ? (
          <Box
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize editor and preview"
            aria-valuenow={split}
            aria-valuemin={SPLIT_MIN}
            aria-valuemax={SPLIT_MAX}
            aria-valuetext={`Editor ${split}%, preview ${100 - split}%`}
            tabIndex={0}
            alignSelf="stretch"
            cursor="col-resize"
            position="relative"
            sx={{ touchAction: 'none', '@media (forced-colors: active)': { '&::before': { background: 'CanvasText' } } }}
            _before={{
              content: '""',
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '6px',
              width: '1px',
              bg: 'page.border',
              transition: reducedMotion ? 'none' : 'background-color 120ms',
            }}
            _hover={{ _before: { bg: 'accent.500' } }}
            _focusVisible={{ outline: 'none', _before: { bg: 'accent.500', width: '2px' } }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'ArrowLeft') setSplitClamped(split - 5)
              else if (e.key === 'ArrowRight') setSplitClamped(split + 5)
              else if (e.key === 'Home') setSplitClamped(SPLIT_MIN)
              else if (e.key === 'End') setSplitClamped(SPLIT_MAX)
              else return
              e.preventDefault()
            }}
            onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
              dragging.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e: React.PointerEvent<HTMLDivElement>) => {
              if (!dragging.current || !grid.current) return
              const rect = grid.current.getBoundingClientRect()
              setSplitClamped(((e.clientX - rect.left) / rect.width) * 100)
            }}
            onPointerUp={(e: React.PointerEvent<HTMLDivElement>) => {
              dragging.current = false
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
            }}
          />
        ) : null}
        {previewVisible ? (
          <Box minW={0}>
            <PreviewPane state={state} showToc={!isXl} headingIndex={headingIndex} scrollable={isXl} />
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}
