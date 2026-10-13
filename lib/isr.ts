/**
 * Revalidation windows of the statically generated (ISR) pages that render
 * owner content plus clock- and GitHub-dependent data.
 *
 * `/` and `/about` are regenerated on demand after every save that changes
 * what they show (lib/revalidate.ts *_PAGE_PATHS) AND at most an hour after
 * the previous render, because some of what they print depends on time, not
 * on a save: "Present" / "Expected" for the site's reference month
 * (lib/clock.ts), relative GitHub times and the GitHub numbers (cached with
 * their own TTLs in lib/githubData.ts).
 *
 * During `next build` the Docker image has no content store, so whatever the
 * build renders is a placeholder: it gets a 1-second window, and the boot
 * warm-up (scripts/warm-isr.mjs) or the first request replaces it with a
 * real render that then carries the full window.
 */

/** Seconds between time-based regenerations of / and /about. */
export const PROFILE_REVALIDATE_SECONDS = 3600

/** Window of a page rendered by `next build` (no content store in the image). */
export const BUILD_REVALIDATE_SECONDS = 1

/** True while `next build` prerenders pages. */
export function isBuildPhase(env: Record<string, string | undefined> = process.env): boolean {
  return env.NEXT_PHASE === 'phase-production-build'
}

/** The revalidate value a page returns: `seconds` at runtime, BUILD_REVALIDATE_SECONDS during the build. */
export function revalidateAfter(seconds: number, env: Record<string, string | undefined> = process.env): number {
  return isBuildPhase(env) ? BUILD_REVALIDATE_SECONDS : seconds
}
