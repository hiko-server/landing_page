/**
 * Shared GitHub API helpers for the `/api/github/*` routes.
 *
 * Why this exists: every GitHub route used to build its own `Authorization`
 * header inline. When the configured `GITHUB_TOKEN` is revoked or expired,
 * GitHub answers `401 Bad credentials` to EVERY authenticated request — so a
 * single stale token made the whole "Open Source" section (stats, top repos,
 * languages, activity) go blank. That is strictly worse than having no token
 * at all, because unauthenticated access still works (at 60 req/hr).
 *
 * `ghFetch` makes the section resilient: it tries the token once, and the first
 * time GitHub rejects it with a 401 it remembers the token is bad for the rest
 * of the process and transparently retries unauthenticated. A dead token can
 * never blank the section again — it just degrades to the lower rate limit.
 */

import type { NextApiResponse } from 'next'
import { readPublicHome } from './home'

// Once GitHub rejects the configured token with a 401, stop sending it for an
// hour so we don't waste a failing request on every call (a rotated token is
// picked up again without a restart).
let tokenBadUntil = 0
const TOKEN_RETRY_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000

const BASE_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'lucian-dev.com-site',
}

/** Pull the GitHub login from a profile URL like `https://github.com/<user>`. */
export function extractGithubUser(url?: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    return parts[0] || null
  } catch {
    return null
  }
}

type GhInit = RequestInit & { next?: { revalidate?: number } }

/**
 * Fetch the GitHub REST API with graceful auth degradation.
 *
 * - With a usable `GITHUB_TOKEN`: sends `Authorization: Bearer <token>`.
 * - If GitHub returns 401 (revoked/expired token): records that the token is
 *   bad and retries the SAME request unauthenticated, so the caller still gets
 *   real data instead of an error.
 * - With no token configured: goes straight to unauthenticated.
 */
export async function ghFetch(url: string, init: GhInit = {}): Promise<Response> {
  const token = process.env.GITHUB_TOKEN
  const headers = { ...BASE_HEADERS, ...(init.headers as Record<string, string> | undefined) }
  // A hung GitHub connection must never hold an API request (and a server
  // worker) open indefinitely.
  const { next: _next, ...rest } = init
  void _next
  const withTimeout = (): RequestInit => ({ ...rest, signal: rest.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS) })

  if (token && Date.now() >= tokenBadUntil) {
    const res = await fetch(url, { ...withTimeout(), headers: { ...headers, Authorization: `Bearer ${token}` } })
    if (res.status !== 401) return res
    // Token rejected — don't let one bad credential blank the whole section.
    tokenBadUntil = Date.now() + TOKEN_RETRY_MS
  }

  return fetch(url, { ...withTimeout(), headers })
}

// ── Shared response cache ───────────────────────────────────────────────────

/** Thrown by loaders when GitHub answered but not usefully (rate limit, 404…). */
export class GhUnavailable extends Error {}

type Entry<T> = { value: T; expires: number }
const store = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()
const FAILURE_TTL_MS = 60 * 1000

/**
 * Memoise a GitHub-backed value per process:
 *   - fresh values are served for `ttlMs`;
 *   - concurrent cache misses share one in-flight request (no stampede
 *     against the 60 req/hr unauthenticated limit);
 *   - failures are cached for a minute as `fallback` (stale data is preferred
 *     when we have it), so an outage isn't retried on every page view.
 */
export async function cachedGh<T>(key: string, ttlMs: number, fallback: T, loader: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key) as Entry<T> | undefined
  if (hit && hit.expires > now) return hit.value
  const pending = inflight.get(key) as Promise<T> | undefined
  if (pending) return pending

  const p = (async () => {
    try {
      const value = await loader()
      store.set(key, { value, expires: Date.now() + ttlMs })
      return value
    } catch {
      const value = hit ? hit.value : fallback
      store.set(key, { value, expires: Date.now() + FAILURE_TTL_MS })
      return value
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

/** Let browsers / the CDN reuse public GitHub summaries instead of hitting us per view. */
export function setPublicCache(res: NextApiResponse, sMaxAge = 600) {
  res.setHeader('Cache-Control', `public, max-age=60, s-maxage=${sMaxAge}, stale-while-revalidate=3600`)
}

/**
 * Cache header for a GitHub summary: the normal public cache when the data is
 * real, a short one when GitHub was unavailable — so an outage response is
 * not pinned in browsers / the CDN for the full TTL and a retry can recover.
 */
export function setGhCache(res: NextApiResponse, available: boolean, sMaxAge = 600) {
  if (available) setPublicCache(res, sMaxAge)
  else res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30')
}

/** GitHub login from the public home document's socials (server-side). */
export function publicGithubUser(): string | null {
  return extractGithubUser(readPublicHome()?.socials?.github)
}
