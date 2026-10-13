import { useEffect, useState } from 'react'
import { parseLogoMetrics, type LogoMetrics } from '../../../lib/logoSize'

/**
 * Measurements of the Home editor's brand logos for the live preview
 * (GET /api/admin/logo-metrics — the same measurement the save stores).
 * One request per distinct image URL per editor session; `undefined` while
 * a URL is being measured, `null` when it cannot be (missing, blank, not an
 * image).
 */

export type LogoMeasurement = { metrics: LogoMetrics | null; reason?: string }

const cache = new Map<string, Promise<LogoMeasurement>>()

function measure(src: string): Promise<LogoMeasurement> {
  let pending = cache.get(src)
  if (!pending) {
    pending = fetch(`/api/admin/logo-metrics?src=${encodeURIComponent(src)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { metrics?: unknown; reason?: string; error?: string }
        if (!res.ok) {
          // Not cached: a transient failure (rate limit, session) is retried next time.
          cache.delete(src)
          return { metrics: null, reason: body.error || `HTTP ${res.status}` }
        }
        return { metrics: parseLogoMetrics(body.metrics), reason: body.reason }
      })
      .catch(() => {
        cache.delete(src)
        return { metrics: null, reason: 'Network error' }
      })
    cache.set(src, pending)
  }
  return pending
}

export function useLogoMetrics(sources: readonly string[]): Map<string, LogoMeasurement | undefined> {
  const [results, setResults] = useState<Map<string, LogoMeasurement>>(() => new Map())
  const key = Array.from(new Set(sources.filter(Boolean))).sort().join('\n')

  useEffect(() => {
    let alive = true
    for (const src of key ? key.split('\n') : []) {
      measure(src).then((m) => {
        if (alive) setResults((prev) => (prev.get(src) === m ? prev : new Map(prev).set(src, m)))
      })
    }
    return () => {
      alive = false
    }
  }, [key])

  return results
}
