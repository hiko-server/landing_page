import { useCallback, useRef } from 'react'

/**
 * "Save and leave" support for the version-checked editors (PageEditor,
 * useMdxItemEditor).
 *
 * Their save() resolves true only once the server stored the content, and
 * false on a version conflict (409), a compile error (422), an expired
 * session (401), any other HTTP error or a network failure — and also when a
 * save is already running (one request at a time). The leave dialog would
 * then report a failure for a save that may well succeed a moment later, so
 * the saver it gets waits for the running save instead, and succeeds only
 * when that save stored exactly what the editor holds now:
 *
 *   const { track, leave } = useLeaveSaver(snapshot)
 *   // inside save(): return track(snapshotBeingSaved, sendRequest())
 *   useDirtyRegistration(key, dirty, () => leave(() => save()))
 */

/**
 * Result of "Save and leave" when it had to wait for a running save: that
 * save succeeded and stored the current edits.
 */
export function leaveSaveResult(ok: boolean, storedSnapshot: string | null, currentSnapshot: string): boolean {
  return ok && storedSnapshot !== null && storedSnapshot === currentSnapshot
}

export function useLeaveSaver(snapshot: string) {
  const current = useRef(snapshot)
  current.current = snapshot
  const inflight = useRef<Promise<boolean> | null>(null)
  const stored = useRef<string | null>(null)

  /** Register a running save; `savedSnapshot` is what it stores when it resolves true. */
  const track = useCallback((savedSnapshot: string, run: Promise<boolean>): Promise<boolean> => {
    const tracked = run.then((ok) => {
      if (ok) stored.current = savedSnapshot
      return ok
    })
    inflight.current = tracked
    const done = () => {
      if (inflight.current === tracked) inflight.current = null
    }
    tracked.then(done, done)
    return tracked
  }, [])

  /** The saver for useDirtyRegistration: waits for a running save, otherwise saves. */
  const leave = useCallback(async (save: () => Promise<boolean>): Promise<boolean> => {
    const pending = inflight.current
    if (!pending) return save()
    let ok = false
    try {
      ok = await pending
    } catch {
      ok = false
    }
    return leaveSaveResult(ok, stored.current, current.current)
  }, [])

  return { track, leave }
}
