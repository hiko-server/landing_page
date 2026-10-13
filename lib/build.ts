/**
 * The deployed build: which commit the running image was built from.
 *
 * NEXT_PUBLIC_BUILD_SHA is a build argument (Dockerfile; scripts/deploy.sh
 * sets it to the deployed commit, CI to the tested one), so Next inlines it
 * into the bundle and the server render and the browser always agree. A
 * local build without it shows no commit at all rather than a placeholder.
 * Client-safe (no server imports): the footer and /colophon both use it.
 */

/** The site's public source repository. */
export const REPO_URL = 'https://github.com/hiko-server/landing_page'

const SHA_RE = /^[0-9a-f]{7,40}$/i

/** A git commit id (7–40 hex digits, lower-cased), or null for anything else. */
export function normalizeBuildSha(raw: unknown): string | null {
  const sha = typeof raw === 'string' ? raw.trim() : ''
  return SHA_RE.test(sha) ? sha.toLowerCase() : null
}

/** Short id and repository link of a build commit, or null without one. */
export function buildCommit(raw: unknown): { sha: string; short: string; href: string } | null {
  const sha = normalizeBuildSha(raw)
  return sha ? { sha, short: sha.slice(0, 7), href: `${REPO_URL}/commit/${sha}` } : null
}

/** The commit this bundle was built from (inlined at build time). */
export const BUILD_COMMIT = buildCommit(process.env.NEXT_PUBLIC_BUILD_SHA)
