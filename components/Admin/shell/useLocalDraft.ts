import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Local draft recovery for admin editors: while an editor holds unsaved
 * edits, they are copied to localStorage (1 s debounce, flushed when the tab
 * is hidden or closed), so a crash, an expired session or a closed tab never
 * loses work. When the editor opens again, the draft found for its key is
 * offered back ("Restore unsaved draft from 14:32?").
 *
 *   const d = useLocalDraft({ key: 'mdx:blog:my-post', value, baseEtag, dirty })
 *   d.draft   → { at, etag, value } found when the key was opened, or null
 *   d.stale   → the draft was based on a different server version than the
 *               one loaded now (someone saved in between)
 *   d.restore() → the draft's value (and hides the offer), d.discard() →
 *               forget it, d.clear() → forget after a successful save,
 *               d.flush() → write the current edits immediately
 *
 * Keys: 'mdx:blog:<slug|new>', 'mdx:work:<slug|new>', 'page:now',
 * 'page:uses', 'home'. Storage key: `draft:v1:<key>`. Every storage access is
 * wrapped: private windows and blocked storage simply mean no drafts.
 *
 * The stored copy is removed when the editor goes from dirty back to clean
 * (a save, or the edits undone) and on discard / clear.
 */

export type LocalDraft<T> = { at: number; etag: string | null; value: T }

export type UseLocalDraftOptions<T> = {
  key: string
  value: T
  /** Version (ETag) of the server copy the edits started from; null when new. */
  baseEtag: string | null
  dirty: boolean
  /**
   * Read the stored draft only once this is true (e.g. after the server copy
   * loaded, so `stale` and the offer refer to it). Default true.
   */
  enabled?: boolean
  /** A stored draft equal to the loaded value is not offered. */
  equals?: (a: T, b: T) => boolean
}

export type UseLocalDraftResult<T> = {
  draft: LocalDraft<T> | null
  stale: boolean
  restore: () => T | null
  discard: () => void
  clear: () => void
  /** Write the current edits now (e.g. before reloading the server copy). */
  flush: () => void
}

export const DRAFT_PREFIX = 'draft:v1:'
export const DRAFT_DEBOUNCE_MS = 1000

/** True when the draft was saved against a different server version than `etag`. */
export function isDraftStale(draft: { etag: string | null } | null | undefined, etag: string | null | undefined): boolean {
  if (!draft) return false
  return (draft.etag ?? null) !== (etag ?? null)
}

/** Parse a stored draft; null for anything malformed. */
export function parseStoredDraft<T>(raw: string | null): LocalDraft<T> | null {
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as Partial<LocalDraft<T>>
    if (!d || typeof d !== 'object' || typeof d.at !== 'number' || !('value' in d)) return null
    return { at: d.at, etag: typeof d.etag === 'string' ? d.etag : null, value: d.value as T }
  } catch {
    return null
  }
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readDraft<T>(key: string): LocalDraft<T> | null {
  try {
    return parseStoredDraft<T>(storage()?.getItem(DRAFT_PREFIX + key) ?? null)
  } catch {
    return null
  }
}

export function writeDraft<T>(key: string, draft: LocalDraft<T>): void {
  try {
    storage()?.setItem(DRAFT_PREFIX + key, JSON.stringify(draft))
  } catch {
    /* quota exceeded or storage blocked: drafts are best effort */
  }
}

export function removeDraft(key: string): void {
  try {
    storage()?.removeItem(DRAFT_PREFIX + key)
  } catch {
    /* storage blocked */
  }
}

export function useLocalDraft<T>({
  key,
  value,
  baseEtag,
  dirty,
  enabled = true,
  equals,
}: UseLocalDraftOptions<T>): UseLocalDraftResult<T> {
  const [draft, setDraft] = useState<LocalDraft<T> | null>(null)
  const latest = useRef({ key, value, baseEtag, dirty, enabled })
  latest.current = { key, value, baseEtag, dirty, enabled }
  const equalsRef = useRef(equals)
  equalsRef.current = equals
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readFor = useRef<string | null>(null)

  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const flush = useCallback(() => {
    cancelPending()
    const cur = latest.current
    if (!cur.enabled || !cur.dirty) return
    writeDraft(cur.key, { at: Date.now(), etag: cur.baseEtag, value: cur.value })
  }, [cancelPending])

  // Offer the draft stored for this key (once per key, after `enabled`).
  useEffect(() => {
    if (!enabled) {
      readFor.current = null
      return
    }
    if (readFor.current === key) return
    readFor.current = key
    const found = readDraft<T>(key)
    const same = found && equalsRef.current ? equalsRef.current(found.value, latest.current.value) : false
    setDraft(found && !same ? found : null)
  }, [key, enabled])

  // Debounced copy while dirty.
  useEffect(() => {
    if (!enabled || !dirty) return
    cancelPending()
    timer.current = setTimeout(flush, DRAFT_DEBOUNCE_MS)
    return cancelPending
  }, [value, baseEtag, dirty, enabled, flush, cancelPending])

  // Dirty → clean (saved or undone): the stored copy is obsolete.
  const wasDirty = useRef(false)
  useEffect(() => {
    if (wasDirty.current && !dirty && enabled) {
      cancelPending()
      removeDraft(key)
    }
    wasDirty.current = dirty
  }, [dirty, enabled, key, cancelPending])

  // Never lose the last second of typing when the tab goes away.
  useEffect(() => {
    const onHide = () => flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('beforeunload', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('beforeunload', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])

  const restore = useCallback((): T | null => {
    const d = draft
    setDraft(null)
    return d ? d.value : null
  }, [draft])

  const discard = useCallback(() => {
    cancelPending()
    removeDraft(latest.current.key)
    setDraft(null)
  }, [cancelPending])

  const clear = useCallback(() => {
    cancelPending()
    removeDraft(latest.current.key)
    setDraft(null)
  }, [cancelPending])

  return { draft, stale: isDraftStale(draft, baseEtag), restore, discard, clear, flush }
}
