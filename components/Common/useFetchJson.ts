import { useCallback, useEffect, useState } from 'react'

export type FetchState<T> = {
  /** Parsed body once loaded; null while loading or after a failure. */
  data: T | null
  /** True when the request failed (network error, non-2xx, unparseable body). */
  error: boolean
  loading: boolean
  /** Fetch again (e.g. from a "Try again" button). */
  retry: () => void
}

export type FetchJsonOptions<T> = {
  /**
   * Data the server already rendered (getServerSideProps / getStaticProps).
   * When present the hook does not fetch on mount; `retry()` still does.
   */
  initialData?: T | null
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

const pending = new Map<string, Promise<unknown>>()

/**
 * GET `url` as JSON, sharing one request between every concurrent caller of
 * the same URL (e.g. the header's live status and the activity feed both
 * asking for /api/github/events). The entry is dropped when the request
 * settles, so a later call (a retry) fetches again. Rejects on a non-2xx
 * status or an unparseable body.
 */
export function sharedFetch<T>(url: string, fetcher: Fetcher = (u) => fetch(u)): Promise<T> {
  const inflight = pending.get(url)
  if (inflight) return inflight as Promise<T>
  const request = (async () => {
    try {
      const res = await fetcher(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as T
    } finally {
      pending.delete(url)
    }
  })()
  pending.set(url, request)
  return request
}

/**
 * Minimal client-side JSON loader for the home/about widgets. Concurrent
 * identical URLs share one request (sharedFetch); with `initialData` the
 * server-rendered value is used and nothing is fetched until `retry()`.
 * Ignores responses that arrive after unmount or after a newer request.
 */
export function useFetchJson<T>(url: string, opts: FetchJsonOptions<T> = {}): FetchState<T> {
  const initial = opts.initialData ?? null
  const [data, setData] = useState<T | null>(initial)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // New server data (a client-side navigation to the same page) replaces the old.
  const [seenInitial, setSeenInitial] = useState<T | null>(initial)
  if (initial !== seenInitial) {
    setSeenInitial(initial)
    if (initial !== null) {
      setData(initial)
      setError(false)
    }
  }

  const hasInitial = initial !== null

  useEffect(() => {
    // Server-rendered data: nothing to fetch until the visitor asks to retry.
    if (attempt === 0 && hasInitial) return
    let alive = true
    setError(false)
    setData(null)
    sharedFetch<T>(url)
      .then((d) => {
        if (alive) setData(d)
      })
      .catch(() => {
        if (alive) setError(true)
      })
    return () => {
      alive = false
    }
  }, [url, attempt, hasInitial])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { data, error, loading: !data && !error, retry }
}

/**
 * "Now" for relative times ("3h ago") that render identically on the server
 * and during hydration: the server's `asOf` stamp first, then the real clock
 * once mounted. Avoids hydration text mismatches without hiding the times
 * until JavaScript runs. Client-fetched data only renders after mount, so it
 * always sees the real clock.
 */
export function useRenderNow(asOf?: number): number {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
  }, [])
  return now ?? asOf ?? 0
}
