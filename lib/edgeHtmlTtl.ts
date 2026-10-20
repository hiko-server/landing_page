/**
 * How long Cloudflare may keep an HTML page: never longer than
 * EDGE_HTML_MAX_AGE_S, whatever the origin's ISR window (wave 2A review,
 * OPS-1).
 *
 * ISR pages tell shared caches `s-maxage=<revalidate>`: an hour for / and
 * /about, a year for /colophon (revalidate: false). Every deploy builds new
 * chunk names, so an edge copy of the previous build's HTML points at
 * scripts the new image no longer has. scripts/deploy.sh purges the zone
 * after the switch when CF_ZONE_ID + CF_API_TOKEN are set, and the image
 * keeps earlier builds' assets for a week (scripts/static-archive.mjs) — but
 * a purge can fail and the credentials may be missing, so the edge TTL of
 * HTML is capped as well: `Cloudflare-CDN-Cache-Control` (read by Cloudflare
 * only, never passed on to browsers) overrides `s-maxage` at the edge, while
 * the origin keeps its ISR window (Next regenerates from its own cache, so a
 * refetch every few minutes per edge location costs next to nothing).
 *
 * No stale-while-revalidate at the edge: an expired copy is refetched before
 * it is served, so a deploy is visible within the cap. stale-if-error keeps
 * the last copy serving for a day if the origin is down.
 */

/** Longest time (seconds) Cloudflare keeps an HTML page. */
export const EDGE_HTML_MAX_AGE_S = 300
/** How long the edge may serve its last copy while the origin answers errors. */
export const EDGE_HTML_STALE_IF_ERROR_S = 86_400

export const EDGE_CACHE_HEADER = 'Cloudflare-CDN-Cache-Control'

function directive(cacheControl: string, name: string): string | null {
  for (const part of cacheControl.split(',')) {
    const [key, ...value] = part.trim().split('=')
    if (key.toLowerCase() === name) return value.join('=').trim().replace(/^"|"$/g, '')
  }
  return null
}

/**
 * The Cloudflare-CDN-Cache-Control value for an HTML response whose own
 * Cache-Control is `cacheControl`, or null when the edge may follow the
 * origin (not cacheable by shared caches, or a shared lifetime already
 * within the cap).
 */
export function edgeHtmlCacheControl(cacheControl: string | null | undefined): string | null {
  const cc = (cacheControl || '').trim()
  if (!cc) return null
  if (/(?:^|,)\s*(?:private|no-store|no-cache)\s*(?:,|$)/i.test(cc)) return null
  const shared = directive(cc, 's-maxage') ?? directive(cc, 'max-age')
  if (shared === null || !/^\d+$/.test(shared)) return null
  if (Number(shared) <= EDGE_HTML_MAX_AGE_S) return null
  return `max-age=${EDGE_HTML_MAX_AGE_S}, stale-if-error=${EDGE_HTML_STALE_IF_ERROR_S}`
}
