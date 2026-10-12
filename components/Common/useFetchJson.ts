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

/**
 * Minimal client-side JSON loader for the home/about widgets. Ignores
 * responses that arrive after unmount or after a newer request started.
 */
export function useFetchJson<T>(url: string): FetchState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setError(false)
    setData(null)
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<T>
      })
      .then((d) => {
        if (alive) setData(d)
      })
      .catch(() => {
        if (alive) setError(true)
      })
    return () => {
      alive = false
    }
  }, [url, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { data, error, loading: !data && !error, retry }
}
