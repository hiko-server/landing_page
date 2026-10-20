import { useEffect, useMemo, useRef, useState } from 'react'
import { ask, askSuggestions, createAskEngine, parseAskIndex, type AskEngine, type AskResult } from '../../lib/ask/engine'
import { askOptions, type AskOption, type AskViewState } from '../../lib/ask/view'
import type { SearchIndex } from '../Article/fuzzyMatch'

/**
 * The Ask view's state for the palette: the passage engine (built from the
 * search index the first time Ask is used, then kept), the answer to the
 * question once typing pauses, and the suggested questions this site
 * answers. Everything runs in the browser over the already loaded index.
 */

/** Typing pause before a question is answered (the answer reveals once, not per keystroke). */
export const ASK_SETTLE_MS = 180

const EMPTY_RESULT: AskResult = { status: 'empty', lang: 'en', groups: [], count: 0, missing: [] }

export type UseAsk = {
  state: AskViewState
  options: AskOption[]
  /** The typed question is ahead of the answer shown (typing). */
  pending: boolean
  /** Answer the typed question now (Enter while typing). */
  flush: () => void
}

export function useAsk(index: SearchIndex | null, question: string, active: boolean, opts: { failed?: boolean } = {}): UseAsk {
  // Built lazily on first use and kept for this index (rebuilding on every mode switch would waste work).
  const engineRef = useRef<{ index: SearchIndex; engine: AskEngine } | null>(null)
  const [engine, setEngine] = useState<AskEngine | null>(null)
  useEffect(() => {
    if (!active || !index) return
    if (engineRef.current?.index !== index) engineRef.current = { index, engine: createAskEngine(parseAskIndex(index.ask)) }
    setEngine(engineRef.current.engine)
  }, [active, index])

  // The page's language decides which suggestions come first (/cv/zh → Chinese).
  const [pageZh, setPageZh] = useState(false)
  useEffect(() => {
    if (active) setPageZh(/^zh/i.test(document.documentElement.lang || ''))
  }, [active])

  // Only Ask mode answers: in search mode the question is empty (nothing to compute).
  const typed = active ? question : ''
  const [settled, setSettled] = useState(typed)
  // Entering Ask mode with a question already typed answers it at once.
  const wasActive = useRef(active)
  useEffect(() => {
    const entering = active && !wasActive.current
    wasActive.current = active
    if (!typed.trim() || entering) {
      setSettled(typed)
      return
    }
    const id = window.setTimeout(() => setSettled(typed), ASK_SETTLE_MS)
    return () => window.clearTimeout(id)
  }, [typed, active])

  const subject = index?.subject
  const result = useMemo(() => (engine && settled.trim() ? ask(engine, settled, { subject }) : EMPTY_RESULT), [engine, settled, subject])
  const suggestions = useMemo(() => (engine ? askSuggestions(engine, { subject, primary: pageZh ? 'zh' : 'en' }) : []), [engine, subject, pageZh])
  const state = useMemo<AskViewState>(
    () => ({ ready: !!engine, failed: !engine && !!opts.failed, question: settled, result, suggestions }),
    [engine, opts.failed, settled, result, suggestions],
  )
  const options = useMemo(() => askOptions(state), [state])
  return { state, options, pending: typed.trim() !== settled.trim(), flush: () => setSettled(typed) }
}
