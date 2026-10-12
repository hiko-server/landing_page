import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { Doc } from './docOps'

/**
 * Document state for the Studio: undo / redo over BOTH languages, with
 * typing coalesced into one history step per field (so ⌘Z undoes a word, not
 * a keystroke), accurate dirty tracking against the last saved version
 * (undo back to it and the "unsaved" badge clears), and a server round-trip
 * with an overwrite guard when the CV changed elsewhere since it was loaded.
 */

const HISTORY_LIMIT = 200
const COALESCE_MS = 1200

type State = {
  past: Doc[]
  present: Doc
  future: Doc[]
  lastKey: string | null
  lastAt: number
}

type Action =
  | { type: 'load'; doc: Doc }
  | { type: 'apply'; fn: (d: Doc) => Doc; key?: string; at: number }
  | { type: 'undo' }
  | { type: 'redo' }

const EMPTY: Doc = { en: [], zh: [] }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { past: [], present: action.doc, future: [], lastKey: null, lastAt: 0 }
    case 'apply': {
      const next = action.fn(state.present)
      if (next === state.present) return state
      const coalesce = !!action.key && action.key === state.lastKey && action.at - state.lastAt < COALESCE_MS
      const past = coalesce ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT)
      return { past, present: next, future: [], lastKey: action.key || null, lastAt: action.at }
    }
    case 'undo': {
      if (!state.past.length) return state
      const prev = state.past[state.past.length - 1]
      return { past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future], lastKey: null, lastAt: 0 }
    }
    case 'redo': {
      if (!state.future.length) return state
      const [next, ...rest] = state.future
      return { past: [...state.past, state.present], present: next, future: rest, lastKey: null, lastAt: 0 }
    }
  }
}

export type LoadState = 'loading' | 'ready' | 'error' | 'unauthorized'

const DRAFT_KEY = 'cv-studio:draft:v2'

export type Draft = { at: number; doc: Doc }

function normalize(d: any): Doc {
  return { en: Array.isArray(d?.en) ? d.en : [], zh: Array.isArray(d?.zh) ? d.zh : [] }
}

export function useCvDocument() {
  const [state, dispatch] = useReducer(reducer, { past: [], present: EMPTY, future: [], lastKey: null, lastAt: 0 })
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [savedJson, setSavedJson] = useState(JSON.stringify(EMPTY))
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)

  const presentJson = useMemo(() => JSON.stringify(state.present), [state.present])
  const dirty = loadState === 'ready' && presentJson !== savedJson

  const load = useCallback(async () => {
    setLoadState('loading')
    setLoadError('')
    try {
      const res = await fetch('/api/cvdata', { credentials: 'same-origin', cache: 'no-store' })
      if (res.status === 401) {
        setLoadState('unauthorized')
        return
      }
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const doc = normalize(await res.json())
      const json = JSON.stringify(doc)
      dispatch({ type: 'load', doc })
      setSavedJson(json)
      setLoadState('ready')
      try {
        const raw = localStorage.getItem(DRAFT_KEY)
        if (raw) {
          const d = JSON.parse(raw) as Draft
          const fresh = d?.at && Date.now() - d.at < 1000 * 60 * 60 * 24 * 14
          if (fresh && d.doc && JSON.stringify(normalize(d.doc)) !== json) setDraft({ at: d.at, doc: normalize(d.doc) })
          else localStorage.removeItem(DRAFT_KEY)
        }
      } catch {
        /* storage unavailable — drafts are a convenience only */
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load CV data')
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Local draft autosave while dirty (survives a closed tab / crash).
  useEffect(() => {
    if (!dirty) return
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), doc: state.present }))
      } catch {
        /* quota / private mode */
      }
    }, 1500)
    return () => window.clearTimeout(id)
  }, [dirty, state.present])

  const apply = useCallback((fn: (d: Doc) => Doc, key?: string) => {
    dispatch({ type: 'apply', fn, key, at: Date.now() })
  }, [])

  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  const restoreDraft = useCallback(() => {
    if (!draft) return
    const d = draft.doc
    dispatch({ type: 'apply', fn: () => d, at: Date.now() })
    setDraft(null)
  }, [draft])

  const discardDraft = useCallback(() => {
    setDraft(null)
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  /**
   * Persist the current document. Returns 'conflict' (without saving) when
   * the server copy changed since it was loaded, unless `force` is set.
   */
  const save = useCallback(
    async (force = false): Promise<{ ok: true; warning?: string } | { ok: false; error: string } | 'conflict'> => {
      const doc = state.present
      const json = JSON.stringify(doc)
      setSaving(true)
      try {
        if (!force) {
          const cur = await fetch('/api/cvdata', { credentials: 'same-origin', cache: 'no-store' })
          if (cur.status === 401) return { ok: false, error: 'Session expired — sign in again.' }
          if (cur.ok) {
            const serverJson = JSON.stringify(normalize(await cur.json()))
            if (serverJson !== savedJson && serverJson !== json) return 'conflict'
          }
        }
        const res = await fetch('/api/cvdata', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ en: doc.en, zh: doc.zh }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, error: body?.error || `Save failed (${res.status})` }
        setSavedJson(json)
        setSavedAt(Date.now())
        try {
          localStorage.removeItem(DRAFT_KEY)
        } catch {
          /* ignore */
        }
        return { ok: true, warning: body?.r2Warning || body?.warning }
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Network error' }
      } finally {
        setSaving(false)
      }
    },
    [state.present, savedJson],
  )

  return {
    doc: state.present,
    apply,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    dirty,
    saving,
    savedAt,
    save,
    load,
    loadState,
    loadError,
    draft,
    restoreDraft,
    discardDraft,
  }
}
