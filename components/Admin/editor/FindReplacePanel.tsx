import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Flex, IconButton, Input, Text, Tooltip, usePrefersReducedMotion } from '@chakra-ui/react'
import { useEditorState, type Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { inputProps, MONO, outlineButtonProps, SITE_HEADER_H } from '../shell/ui'
import {
  DEFAULT_FIND_OPTIONS,
  buildMatcher,
  findAll,
  lineOf,
  matchAtOrAfter,
  replaceAll,
  replaceOne,
  type FindOptions,
} from './findReplace'
import { findMatchesInDoc, findState, replaceAllMatches, replaceMatch, setFindCurrent, setFindQuery } from './findPlugin'

/**
 * Find & replace bar of the admin editor (H3), opened with ⌘F / Ctrl+F
 * while the editor has focus (the browser's own find still works anywhere
 * else) or from the writing bar. Works on both surfaces: the visual editor
 * (highlights through ./findPlugin) and the MDX textarea (the current
 * match's line is shown in the bar, and selected when the bar closes).
 *
 * Enter / Shift+Enter: next / previous; Esc closes and returns to the text
 * at the current match. Counts are announced politely.
 */

type Props = {
  mode: 'visual' | 'raw'
  editor: Editor | null
  textarea: React.RefObject<HTMLTextAreaElement>
  value: string
  onRawChange: (next: string) => void
  initialQuery: string
  /** Changes when the bar is asked to open again (re-focus, new selection as the query). */
  openKey: number
  onClose: () => void
}

function ToggleButton({ label, short, pressed, onClick }: { label: string; short: string; pressed: boolean; onClick: () => void }) {
  return (
    <Tooltip label={label} openDelay={300} hasArrow placement="top">
      <Button
        size="xs"
        minW="28px"
        h="28px"
        px={1.5}
        variant="ghost"
        fontFamily={MONO}
        fontSize="11px"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        color={pressed ? 'accent.text' : 'page.fg-secondary'}
        bg={pressed ? 'var(--accent-soft)' : undefined}
        _hover={{ bg: 'page.bg-overlay' }}
      >
        {short}
      </Button>
    </Tooltip>
  )
}

export default function FindReplacePanel({ mode, editor, textarea, value, onRawChange, initialQuery, openKey, onClose }: Props) {
  const ids = useId()
  const reducedMotion = usePrefersReducedMotion()
  const findRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(initialQuery)
  const [replacement, setReplacement] = useState('')
  const [opts, setOpts] = useState<FindOptions>(DEFAULT_FIND_OPTIONS)
  const [rawCurrent, setRawCurrent] = useState(0)
  const [announce, setAnnounce] = useState('')

  // Focus the field in the same commit that shows the bar (the opener uses
  // flushSync), so a key typed right after ⌘F lands here, not in the text.
  useLayoutEffect(() => {
    if (initialQuery) setQuery(initialQuery)
    findRef.current?.focus()
    findRef.current?.select()
  }, [openKey, initialQuery])

  // Where the sticky bar rests: below the sticky admin title bar (or the site header).
  const [stickyTop, setStickyTop] = useState(64)
  useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>('[data-admin-titlebar]')
    const measure = () => {
      const header = Number.parseFloat(SITE_HEADER_H) || 56
      setStickyTop(Math.round((bar ? bar.offsetHeight + header : header) + 8))
    }
    measure()
    const ro = typeof ResizeObserver === 'function' && bar ? new ResizeObserver(measure) : null
    if (bar) ro?.observe(bar)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const { re, error } = useMemo(() => buildMatcher(query, opts), [query, opts])

  // Visual editor: push the query into the plugin.
  useEffect(() => {
    if (mode !== 'visual' || !editor || editor.isDestroyed) return
    const matches = findMatchesInDoc(editor.state.doc, re)
    const start = matchAtOrAfter(matches, editor.state.selection.from)
    editor.view.dispatch(setFindQuery(editor.state, re, opts, Math.max(0, start)))
  }, [mode, editor, re, opts])

  // Clear the highlights when the bar closes or the editor changes.
  useEffect(() => {
    const ed = editor
    return () => {
      if (ed && !ed.isDestroyed) ed.view.dispatch(setFindQuery(ed.state, null, DEFAULT_FIND_OPTIONS))
    }
  }, [editor])

  const visual = useEditorState({
    editor: mode === 'visual' ? editor : null,
    selector: ({ editor: ed }) => {
      if (!ed) return { count: 0, current: -1, from: -1 }
      const s = findState(ed.state)
      return { count: s.matches.length, current: s.current, from: s.matches[s.current]?.from ?? -1 }
    },
    equalityFn: (a, b) => !!a && !!b && a.count === b.count && a.current === b.current && a.from === b.from,
  })

  const rawMatches = useMemo(() => (mode === 'raw' ? findAll(value, re) : []), [mode, value, re])
  useEffect(() => {
    if (mode !== 'raw') return
    setRawCurrent((c) => (rawMatches.length ? Math.min(c, rawMatches.length - 1) : 0))
  }, [mode, rawMatches])

  const count = mode === 'visual' ? visual?.count ?? 0 : rawMatches.length
  const current = mode === 'visual' ? visual?.current ?? -1 : rawMatches.length ? rawCurrent : -1

  // Keep the current visual match on screen (not while the owner is typing in the text).
  useEffect(() => {
    if (mode !== 'visual' || !editor || !visual || visual.from < 0 || editor.view.hasFocus()) return
    const { node } = editor.view.domAtPos(visual.from)
    const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
    el?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [mode, editor, visual, reducedMotion])

  // Keep the current raw match's line in view inside the textarea.
  useEffect(() => {
    if (mode !== 'raw') return
    const ta = textarea.current
    const m = rawMatches[rawCurrent]
    // Never move the caret while the owner is typing in the textarea.
    if (!ta || !m || document.activeElement === ta) return
    const lineHeight = Number.parseFloat(window.getComputedStyle(ta).lineHeight) || 22
    ta.scrollTop = Math.max(0, (lineOf(value, m.from) - 1) * lineHeight - ta.clientHeight / 3)
    ta.setSelectionRange(m.from, m.to)
  }, [mode, rawMatches, rawCurrent, textarea, value])

  useEffect(() => {
    setAnnounce(!query ? '' : error ? `Invalid pattern: ${error}` : count ? `${current + 1} of ${count}` : 'No results')
  }, [query, error, count, current])

  const step = useCallback(
    (delta: number) => {
      if (!count) return
      if (mode === 'visual' && editor) editor.view.dispatch(setFindCurrent(editor.state, current + delta))
      else setRawCurrent((c) => (c + delta + count) % count)
    },
    [count, mode, editor, current],
  )

  const replaceCurrent = () => {
    if (!re || current < 0) return
    if (mode === 'visual' && editor) {
      const tr = replaceMatch(editor.state, current, replacement)
      if (tr) editor.view.dispatch(tr)
    } else {
      const m = rawMatches[current]
      if (m) onRawChange(replaceOne(value, m, re, replacement, opts))
    }
    setAnnounce('Replaced 1')
    if (count <= 1) findRef.current?.focus()
  }

  const replaceEvery = () => {
    if (!re || !count) return
    let n = 0
    if (mode === 'visual' && editor) {
      const out = replaceAllMatches(editor.state, replacement)
      if (out) {
        editor.view.dispatch(out.tr)
        n = out.count
      }
    } else {
      const out = replaceAll(value, re, replacement, opts)
      onRawChange(out.text)
      n = out.count
    }
    setAnnounce(`Replaced ${n}`)
    // The buttons turn disabled with no matches left: keep the keyboard in the bar.
    findRef.current?.focus()
  }

  /** Close and put the caret on the current match. */
  const close = () => {
    if (mode === 'visual' && editor && !editor.isDestroyed) {
      const m = findState(editor.state).matches[current]
      editor.view.dispatch(setFindQuery(editor.state, null, DEFAULT_FIND_OPTIONS))
      const chain = editor.chain().focus()
      if (m) chain.command(({ tr }) => {
        tr.setSelection(TextSelection.create(tr.doc, m.from, m.to))
        return true
      })
      chain.run()
    } else {
      const ta = textarea.current
      const m = rawMatches[rawCurrent]
      if (ta) {
        ta.focus()
        if (m) ta.setSelectionRange(m.from, m.to)
      }
    }
    onClose()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      findRef.current?.focus()
      findRef.current?.select()
    }
  }

  const rawLine = mode === 'raw' && rawMatches[rawCurrent] ? lineOf(value, rawMatches[rawCurrent].from) : null
  const rawContext = useMemo(() => {
    if (mode !== 'raw') return null
    const m = rawMatches[rawCurrent]
    if (!m) return null
    const start = value.lastIndexOf('\n', m.from - 1) + 1
    const endNl = value.indexOf('\n', m.to)
    const end = endNl === -1 ? value.length : endNl
    const before = value.slice(Math.max(start, m.from - 40), m.from)
    const after = value.slice(m.to, Math.min(end, m.to + 40))
    return { before: (m.from - 40 > start ? '…' : '') + before, match: value.slice(m.from, m.to), after: after + (m.to + 40 < end ? '…' : '') }
  }, [mode, rawMatches, rawCurrent, value])

  return (
    <Box
      role="search"
      aria-label="Find and replace"
      onKeyDown={onKey}
      border="1px solid"
      borderColor="page.border-strong"
      borderRadius="lg"
      bg="page.bg-elevated"
      p={2}
      mb={3}
      // Sticky right under the admin title bar (its height varies as its
      // actions wrap), so the field stays in view while matches scroll by.
      position="sticky"
      top={`${stickyTop}px`}
      zIndex={2}
      boxShadow="elevation.sm"
    >
      <Flex gap={2} align="center" flexWrap="wrap">
        <Input
          {...inputProps}
          ref={findRef}
          size="sm"
          flex="1 1 180px"
          minW={0}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              step(e.shiftKey ? -1 : 1)
            }
          }}
          placeholder="Find"
          aria-label="Find"
          aria-describedby={`${ids}-count`}
          aria-invalid={!!error}
          spellCheck={false}
        />
        <Text id={`${ids}-count`} fontFamily={MONO} fontSize="11px" color={error ? 'status.error' : 'page.fg-secondary'} minW="72px" className="tnum" aria-hidden>
          {!query ? '' : error ? 'Invalid' : count ? `${current + 1} of ${count}${count >= 2000 ? '+' : ''}` : 'No results'}
        </Text>
        <Flex gap={0.5}>
          <IconButton size="xs" h="28px" minW="28px" variant="ghost" aria-label="Previous match (Shift+Enter)" icon={<span aria-hidden>↑</span>} onClick={() => step(-1)} isDisabled={!count} />
          <IconButton size="xs" h="28px" minW="28px" variant="ghost" aria-label="Next match (Enter)" icon={<span aria-hidden>↓</span>} onClick={() => step(1)} isDisabled={!count} />
          <ToggleButton label="Match case" short="Aa" pressed={opts.caseSensitive} onClick={() => setOpts((o) => ({ ...o, caseSensitive: !o.caseSensitive }))} />
          <ToggleButton label="Whole word" short="W" pressed={opts.wholeWord} onClick={() => setOpts((o) => ({ ...o, wholeWord: !o.wholeWord }))} />
          <ToggleButton label="Regular expression" short=".*" pressed={opts.regex} onClick={() => setOpts((o) => ({ ...o, regex: !o.regex }))} />
          <IconButton size="xs" h="28px" minW="28px" variant="ghost" aria-label="Close find (Esc)" icon={<span aria-hidden>×</span>} onClick={close} />
        </Flex>
      </Flex>
      <Flex gap={2} align="center" flexWrap="wrap" mt={2}>
        <Input
          {...inputProps}
          size="sm"
          flex="1 1 180px"
          minW={0}
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.metaKey || e.ctrlKey) replaceEvery()
              else replaceCurrent()
            }
          }}
          placeholder={opts.regex ? 'Replace ($1 for a group)' : 'Replace'}
          aria-label="Replace with"
          spellCheck={false}
        />
        <Button size="xs" h="28px" {...outlineButtonProps} onClick={replaceCurrent} isDisabled={!count}>
          Replace
        </Button>
        <Button size="xs" h="28px" {...outlineButtonProps} onClick={replaceEvery} isDisabled={!count}>
          Replace all
        </Button>
      </Flex>
      {rawContext ? (
        <Text mt={2} fontFamily={MONO} fontSize="12px" color="page.fg-secondary" noOfLines={1}>
          Line {rawLine}: {rawContext.before}
          <Box as="mark" bg="var(--accent-soft)" color="page.fg" px={0.5} borderRadius="sm">
            {rawContext.match}
          </Box>
          {rawContext.after}
        </Text>
      ) : null}
      {error ? (
        <Text mt={1.5} fontSize="xs" color="status.error">
          {error}
        </Text>
      ) : null}
      <Box srOnly role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </Box>
    </Box>
  )
}
