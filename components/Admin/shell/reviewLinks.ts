/**
 * Client side of review links (H5): the shape GET / POST
 * /api/admin/review-links answer, parsed defensively, and the words the
 * admin shows for a link. Pure; unit tested.
 */

export type ReviewLinkRow = {
  id: string
  collection: 'blog' | 'work'
  slug: string
  currentSlug: string
  title: string
  variant: 'draft' | 'changes'
  label: string | null
  createdAt: number
  expiresAt: number
  revokedAt: number | null
  viewCount: number
  lastViewedAt: number | null
  status: 'active' | 'expired' | 'revoked'
  /** /review/<token> while active. */
  path: string | null
}

export type Shareable = { variant: 'draft' | 'changes' } | { variant: null; reason: 'not-found' | 'live' }

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function parseReviewLink(raw: unknown): ReviewLinkRow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!str(o.id) || (o.collection !== 'blog' && o.collection !== 'work')) return null
  const status = o.status === 'active' || o.status === 'expired' || o.status === 'revoked' ? o.status : 'expired'
  const path = typeof o.path === 'string' && o.path.startsWith('/review/') ? o.path : null
  return {
    id: str(o.id),
    collection: o.collection,
    slug: str(o.slug),
    currentSlug: str(o.currentSlug) || str(o.slug),
    title: str(o.title) || str(o.slug),
    variant: o.variant === 'changes' ? 'changes' : 'draft',
    label: typeof o.label === 'string' && o.label ? o.label : null,
    createdAt: num(o.createdAt),
    expiresAt: num(o.expiresAt),
    revokedAt: numOrNull(o.revokedAt),
    viewCount: num(o.viewCount),
    lastViewedAt: numOrNull(o.lastViewedAt),
    status,
    path: status === 'active' ? path : null,
  }
}

export function parseReviewLinks(raw: unknown): ReviewLinkRow[] {
  return Array.isArray(raw) ? raw.map(parseReviewLink).filter((l): l is ReviewLinkRow => !!l) : []
}

export function parseShareable(raw: unknown): Shareable {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  if (o.variant === 'draft' || o.variant === 'changes') return { variant: o.variant }
  return { variant: null, reason: o.reason === 'not-found' ? 'not-found' : 'live' }
}

/** The lifetimes offered (hours → label). */
export const TTL_OPTIONS: ReadonlyArray<{ hours: number; label: string }> = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
  { hours: 720, label: '30 days' },
]
export const TTL_DEFAULT_HOURS = 168

/** "Expires in 6 days", "Expired 2 h ago", "Turned off". */
export function linkStatusLine(l: Pick<ReviewLinkRow, 'status' | 'expiresAt' | 'revokedAt'>, now: number, relative: (ms: number, now: number) => string): string {
  if (l.status === 'revoked') return 'Turned off'
  if (l.status === 'expired' || l.expiresAt <= now) return `Expired ${relative(l.expiresAt, now)}`
  return `Expires ${relative(l.expiresAt, now)}`
}

/** "Not opened yet", "Opened once · 5 min ago", "Opened 4 times · last 2 h ago". */
export function viewsLine(l: Pick<ReviewLinkRow, 'viewCount' | 'lastViewedAt'>, now: number, relative: (ms: number, now: number) => string): string {
  if (!l.viewCount || l.lastViewedAt === null) return 'Not opened yet'
  const when = relative(l.lastViewedAt, now)
  return l.viewCount === 1 ? `Opened once · ${when}` : `Opened ${l.viewCount} times · last ${when}`
}
