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

// Once GitHub rejects the configured token with a 401, stop sending it for the
// remainder of this process so we don't waste a failing request on every call.
let tokenKnownBad = false

const BASE_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'hiko.dev-site',
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

  if (token && !tokenKnownBad) {
    const res = await fetch(url, { ...init, headers: { ...headers, Authorization: `Bearer ${token}` } })
    if (res.status !== 401) return res
    // Token rejected — don't let one bad credential blank the whole section.
    tokenKnownBad = true
  }

  return fetch(url, { ...init, headers })
}
