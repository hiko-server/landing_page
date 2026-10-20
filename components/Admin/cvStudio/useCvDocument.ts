import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { docJson, type Doc } from './docOps'
import { EMPTY_DOC, historyApply, historyInit, historyRedo, historyUndo, type History } from './history'
import { DRAFT_MAX_AGE_MS, UNKNOWN_BASE, readAdminCv, saveCv, type SaveOutcome } from './cvApi'

/**
 * Document state for the Studio.
 *
 *  - Loads the FULL document (with visibility metadata) from the admin-only
 *    endpoint and refuses anything that is not the admin view, so a pruned
 *    public copy can never end up in the editor or in a draft.
 *  - Undo / redo over BOTH languages (see history.ts). Edits are applied
 *    synchronously, so callers get the resulting document back — used to
 *    tie a toast's Undo button to exactly one history step.
 *  - Optimistic concurrency: saves send If-Match with the ETag the editor
 *    is based on; a 409 surfaces as 'conflict' and nothing is written. A
 *    value the server's registry check rejects surfaces as 'invalid'.
 *  - Local drafts remember the ETag they were based on and are only offered
 *    as a plain restore when that is still the server's version.
 */

export type LoadState = 'loading' | 'ready' | 'error' | 'unauthorized'

export type Draft = {
  at: number
  /** ETag of the server version the draft was based on (null = unknown, legacy draft). */
  etag: string | null
  doc: Doc
  /** True when the server copy changed since the draft's base version. */
  stale: boolean
}

const DRAFT_KEY = 'cv-studio:draft:v3'
const LEGACY_DRAFT_KEY = 'cv-studio:draft:v2'

function normalize(d: any): Doc {
  return { en: Array.isArray(d?.en) ? d.en : [], zh: Array.isArray(d?.zh) ? d.zh : [] }
}

function readStoredDraft(): { at: number; etag: string | null; doc: Doc } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (d && typeof d.at === 'number' && d.doc) return { at: d.at, etag: typeof d.etag === 'string' ? d.etag : null, doc: normalize(d.doc) }
    }
    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY)
    if (legacy) {
      // Written before drafts tracked their base version: always "older version".
      localStorage.removeItem(LEGACY_DRAFT_KEY)
      const d = JSON.parse(legacy)
      if (d && typeof d.at === 'number' && d.doc) return { at: d.at, etag: null, doc: normalize(d.doc) }
    }
  } catch {
    /* storage unavailable or corrupt — drafts are a convenience only */
  }
  return null
}

function writeStoredDraft(doc: Doc, etag: string | null) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), etag, doc: { en: doc.en, zh: doc.zh } }))
  } catch {
    /* quota / private mode */
  }
}

function clearStoredDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
    localStorage.removeItem(LEGACY_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

export function useCvDocument() {
  const [hist, setHist] = useState<History>(() => historyInit())
  const histRef = useRef(hist)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [savedJson, setSavedJson] = useState(() => docJson(EMPTY_DOC))
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  // ETag the editor content is based on (sent as If-Match). Kept in a ref
  // too so a save started right after a load/restore uses the fresh value.
  const [baseEtag, setBaseEtagState] = useState<string | null>(null)
  const baseEtagRef = useRef<string | null>(null)
  const [serverEtag, setServerEtag] = useState<string | null>(null)

  const setBaseEtag = useCallback((v: string | null) => {
    baseEtagRef.current = v
    setBaseEtagState(v)
  }, [])

  const commit = useCallback((h: History) => {
    histRef.current = h
    setHist(h)
  }, [])

  const presentJson = useMemo(() => docJson(hist.present), [hist.present])
  const dirty = loadState === 'ready' && presentJson !== savedJson

  const load = useCallback(async () => {
    setLoadState('loading')
    setLoadError('')
    setDraft(null)
    const r = await readAdminCv()
    if (r.kind === 'unauthorized') {
      setLoadState('unauthorized')
      return
    }
    if (r.kind === 'error') {
      setLoadError(r.error)
      setLoadState('error')
      return
    }
    const doc = normalize(r.doc)
    const json = docJson(doc)
    commit(historyInit(doc))
    setSavedJson(json)
    setBaseEtag(r.etag)
    setServerEtag(r.etag)
    setLoadState('ready')
    const stored = readStoredDraft()
    if (stored) {
      const fresh = Date.now() - stored.at < DRAFT_MAX_AGE_MS
      if (fresh && docJson(stored.doc) !== json) {
        setDraft({ ...stored, stale: stored.etag === null || stored.etag !== r.etag })
      } else {
        clearStoredDraft()
      }
    }
  }, [commit, setBaseEtag])

  useEffect(() => {
    load()
  }, [load])

  // Local draft autosave while dirty (survives a closed tab / crash), with
  // a flush when the page is hidden so the last keystrokes are not lost.
  const pendingDraft = useRef<{ doc: Doc; etag: string | null } | null>(null)
  useEffect(() => {
    if (!dirty) {
      pendingDraft.current = null
      return
    }
    pendingDraft.current = { doc: hist.present, etag: baseEtag }
    const id = window.setTimeout(() => {
      if (pendingDraft.current) writeStoredDraft(pendingDraft.current.doc, pendingDraft.current.etag)
      pendingDraft.current = null
    }, 1500)
    return () => window.clearTimeout(id)
  }, [dirty, hist.present, baseEtag])

  useEffect(() => {
    const flush = () => {
      if (pendingDraft.current) writeStoredDraft(pendingDraft.current.doc, pendingDraft.current.etag)
      pendingDraft.current = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  /** Apply an edit; returns the resulting document (unchanged doc when the edit was a no-op). */
  const apply = useCallback(
    (fn: (d: Doc) => Doc, key?: string): Doc => {
      const next = historyApply(histRef.current, fn, key, Date.now())
      if (next !== histRef.current) commit(next)
      return next.present
    },
    [commit],
  )

  /** The latest document (also between a commit and the next render). */
  const getDoc = useCallback(() => histRef.current.present, [])

  const undo = useCallback(() => {
    const next = historyUndo(histRef.current)
    if (next !== histRef.current) commit(next)
  }, [commit])

  const redo = useCallback(() => {
    const next = historyRedo(histRef.current)
    if (next !== histRef.current) commit(next)
  }, [commit])

  const restoreDraft = useCallback(() => {
    if (!draft) return
    const d = draft.doc
    apply(() => d)
    // A draft based on an older version keeps that base, so saving it hits
    // the If-Match check and asks before overwriting the newer server copy.
    if (draft.stale) setBaseEtag(draft.etag ?? UNKNOWN_BASE)
    setDraft(null)
  }, [draft, apply, setBaseEtag])

  const discardDraft = useCallback(() => {
    setDraft(null)
    clearStoredDraft()
  }, [])

  /**
   * Persist the current document. Without `force` the write is conditional
   * on the base ETag and returns 'conflict' (nothing written) when the
   * server copy changed. `force` resends without If-Match — only after the
   * owner explicitly chose to overwrite.
   */
  const save = useCallback(
    async (force = false): Promise<SaveOutcome> => {
      const doc = histRef.current.present
      const json = docJson(doc)
      setSaving(true)
      try {
        const r = await saveCv(doc, force ? null : baseEtagRef.current)
        if (r.kind === 'conflict') {
          if (r.etag) setServerEtag(r.etag)
          return r
        }
        if (r.kind === 'unauthorized') {
          // Keep the edits safe on this device before asking to sign in.
          writeStoredDraft(doc, baseEtagRef.current)
          return r
        }
        if (r.kind === 'error' || r.kind === 'invalid') return r
        setBaseEtag(r.etag)
        setServerEtag(r.etag)
        setSavedJson(json)
        setSavedAt(Date.now())
        clearStoredDraft()
        return r
      } finally {
        setSaving(false)
      }
    },
    [setBaseEtag],
  )

  /**
   * The server applied a change of its own to the version this editor is
   * based on (e.g. disconnecting ORCID, sent with If-Match) and answered
   * `doc`'s new ETag: adopt it as the saved state, without a reload. Only
   * for an editor with no unsaved changes — history restarts there.
   */
  const adoptSaved = useCallback(
    (doc: Doc, etag: string) => {
      commit(historyInit(doc))
      setSavedJson(docJson(doc))
      setBaseEtag(etag)
      setServerEtag(etag)
      setSavedAt(Date.now())
      clearStoredDraft()
    },
    [commit, setBaseEtag],
  )

  /** ETag the editor content is based on (sent as If-Match). */
  const getBaseEtag = useCallback(() => baseEtagRef.current, [])

  return {
    doc: hist.present,
    getDoc,
    adoptSaved,
    getBaseEtag,
    apply,
    undo,
    redo,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
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
    /** True while editing on top of a version older than the server's (restored stale draft). */
    basedOnOlderVersion: loadState === 'ready' && baseEtag !== serverEtag,
  }
}
