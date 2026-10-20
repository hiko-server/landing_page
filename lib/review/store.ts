import { getAuthDb } from '../adminAuth/db'
import { getItem } from '../contentStore'
import { getPendingRevision } from '../pendingRevisions'
import { redirectTarget, redirectsTo } from '../redirects'
import { newLinkId, reviewLinkKey, tokenFor, tokenHash, verifyToken, TOKEN_RE, type ReviewScope } from './token'

/**
 * Review links (H5): the owner shares one draft — or a live item's saved,
 * unpublished changes (H4) — with anyone who has the link, read-only, for
 * one hour to thirty days, and can turn a link off at any time. Rows live
 * in auth.db (scripts/db/auth/003-review-links.mjs; never restored from a
 * content backup), tokens are signed and stored only as hashes
 * (lib/review/token). Views are counted (a number and a time — never who).
 * Server-only.
 *
 * A link names an address (collection, slug — signed into its token), not
 * an item: the content store has no item identity. So a link is turned off
 * whenever its address stops belonging to the item it was made for —
 * when the item is deleted (revokeItemLinks over its slug and old slugs),
 * and when an address changes hands (revokeLinksAt: an item created or
 * restored there, another item renamed onto it, an old address dropped) —
 * and never follows an address to whatever arrives there next.
 */

export type ReviewCollection = 'blog' | 'work'
export type ReviewVariant = 'draft' | 'changes'

export const REVIEW_TTL_MIN_HOURS = 1
export const REVIEW_TTL_MAX_HOURS = 30 * 24
/** The lifetimes the admin offers (hours). */
export const REVIEW_TTL_PRESETS_HOURS: readonly number[] = [1, 24, 72, 168, 720]
export const REVIEW_TTL_DEFAULT_HOURS = 168
export const MAX_ACTIVE_PER_ITEM = 20
export const MAX_ACTIVE_TOTAL = 200
/** Expired and revoked links stay listed this long, then go. */
export const KEEP_INACTIVE_MS = 30 * 86_400_000
export const LABEL_MAX = 80

const HOUR_MS = 3_600_000

export type ReviewLink = {
  id: string
  collection: ReviewCollection
  slug: string
  variant: ReviewVariant
  label: string | null
  createdAt: number
  expiresAt: number
  revokedAt: number | null
  viewCount: number
  lastViewedAt: number | null
}

export type ReviewLinkStatus = 'active' | 'expired' | 'revoked'

/** A link as the admin shows it: `path` (/review/<token>) only while it is active. */
export type ReviewLinkView = ReviewLink & { status: ReviewLinkStatus; path: string | null }

type Row = {
  id: string
  collection: string
  slug: string
  variant: string
  label: string | null
  created_at: number
  expires_at: number
  revoked_at: number | null
  view_count: number
  last_viewed_at: number | null
}

const COLUMNS = 'id, collection, slug, variant, label, created_at, expires_at, revoked_at, view_count, last_viewed_at'

function toLink(r: Row): ReviewLink {
  return {
    id: r.id,
    collection: r.collection === 'work' ? 'work' : 'blog',
    slug: r.slug,
    variant: r.variant === 'changes' ? 'changes' : 'draft',
    label: r.label,
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at),
    revokedAt: r.revoked_at === null ? null : Number(r.revoked_at),
    viewCount: Number(r.view_count) || 0,
    lastViewedAt: r.last_viewed_at === null ? null : Number(r.last_viewed_at),
  }
}

export function linkStatus(link: Pick<ReviewLink, 'revokedAt' | 'expiresAt'>, now: number): ReviewLinkStatus {
  if (link.revokedAt !== null) return 'revoked'
  return link.expiresAt <= now ? 'expired' : 'active'
}

const scopeOf = (l: ReviewLink): ReviewScope => ({ id: l.id, collection: l.collection, slug: l.slug, variant: l.variant, expiresAt: l.expiresAt })

/** The address of an active link (null when it is not active or no key is configured). */
export function reviewPath(link: ReviewLink, now: number): string | null {
  if (linkStatus(link, now) !== 'active') return null
  const key = reviewLinkKey()
  return key ? `/review/${tokenFor(scopeOf(link), key)}` : null
}

function view(link: ReviewLink, now: number): ReviewLinkView {
  return { ...link, status: linkStatus(link, now), path: reviewPath(link, now) }
}

/** The owner's note, one line, at most LABEL_MAX characters (null when empty). */
export function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX)
  return s || null
}

/** Lifetime in hours from a request: a whole number within 1 h – 30 days, else null. */
export function cleanTtlHours(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN
  if (!Number.isInteger(n) || n < REVIEW_TTL_MIN_HOURS || n > REVIEW_TTL_MAX_HOURS) return null
  return n
}

// ── What an item can share ────────────────────────────────────────────────

/**
 * What a review link of the item shows right now: its draft, or the saved
 * changes of a live item — or null with the reason when there is nothing
 * unpublished to share.
 */
export function shareableVariant(collection: ReviewCollection, slug: string): { variant: ReviewVariant } | { variant: null; reason: 'not-found' | 'live' } {
  const item = getItem(collection, slug)
  if (!item) return { variant: null, reason: 'not-found' }
  if (item.frontmatter?.draft) return { variant: 'draft' }
  return getPendingRevision(collection, slug) ? { variant: 'changes' } : { variant: null, reason: 'live' }
}

/** The item's slug now: the link's own, or — after a rename — where its redirect leads. */
function currentSlug(collection: ReviewCollection, slug: string): string | null {
  if (getItem(collection, slug)) return slug
  const moved = redirectTarget(collection, slug)
  return moved && getItem(collection, moved) ? moved : null
}

export type ReviewTarget =
  | { kind: 'render'; collection: ReviewCollection; slug: string; variant: ReviewVariant }
  /** It is public now (published, or the changes went live / were dropped): its public page. */
  | { kind: 'public'; path: string }
  /**
   * Deleted, or — for a link to a live item's changes — unpublished again:
   * nothing to show. (A link to a draft follows its item: published, it
   * leads to the public page; unpublished again, it shows the draft.)
   */
  | { kind: 'gone' }

/** Where an active link leads now. */
export function reviewTarget(link: Pick<ReviewLink, 'collection' | 'slug' | 'variant'>): ReviewTarget {
  const slug = currentSlug(link.collection, link.slug)
  const item = slug ? getItem(link.collection, slug) : null
  if (!slug || !item) return { kind: 'gone' }
  const draft = Boolean(item.frontmatter?.draft)
  const publicPath = `/${link.collection}/${slug}`
  if (link.variant === 'draft') return draft ? { kind: 'render', collection: link.collection, slug, variant: 'draft' } : { kind: 'public', path: publicPath }
  if (draft) return { kind: 'gone' }
  return getPendingRevision(link.collection, slug) ? { kind: 'render', collection: link.collection, slug, variant: 'changes' } : { kind: 'public', path: publicPath }
}

// ── Rows ──────────────────────────────────────────────────────────────────

export type CreateInput = { collection: ReviewCollection; slug: string; variant: ReviewVariant; ttlHours: number; label?: unknown }

export type CreateResult =
  | { ok: true; link: ReviewLinkView }
  | { ok: false; status: 409 | 429 | 503; code: 'TOO_MANY' | 'NO_KEY'; error: string }

/** Drop links that expired or were revoked more than KEEP_INACTIVE_MS ago; returns how many went. */
export function pruneReviewLinks(now = Date.now()): number {
  const cutoff = now - KEEP_INACTIVE_MS
  return getAuthDb()
    .prepare('DELETE FROM review_links WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR expires_at < ?')
    .run(cutoff, cutoff).changes
}

export function createReviewLink(input: CreateInput, now = Date.now()): CreateResult {
  const key = reviewLinkKey()
  if (!key) return { ok: false, status: 503, code: 'NO_KEY', error: 'Review links need JWT_SECRET to be set on the server.' }
  const db = getAuthDb()
  pruneReviewLinks(now)
  const active = (where: string, ...params: unknown[]) =>
    (db.prepare(`SELECT count(*) AS n FROM review_links WHERE revoked_at IS NULL AND expires_at > ? ${where}`).get(now, ...params) as { n: number }).n
  if (active('AND collection = ? AND slug = ?', input.collection, input.slug) >= MAX_ACTIVE_PER_ITEM) {
    return { ok: false, status: 409, code: 'TOO_MANY', error: `This item already has ${MAX_ACTIVE_PER_ITEM} active review links — turn some off first.` }
  }
  if (active('') >= MAX_ACTIVE_TOTAL) {
    return { ok: false, status: 409, code: 'TOO_MANY', error: `There are already ${MAX_ACTIVE_TOTAL} active review links — turn some off first.` }
  }
  const link: ReviewLink = {
    id: newLinkId(),
    collection: input.collection,
    slug: input.slug,
    variant: input.variant,
    label: cleanLabel(input.label),
    createdAt: now,
    expiresAt: now + input.ttlHours * HOUR_MS,
    revokedAt: null,
    viewCount: 0,
    lastViewedAt: null,
  }
  const token = tokenFor(scopeOf(link), key)
  db.prepare(
    `INSERT INTO review_links (id, token_hash, collection, slug, variant, label, created_at, expires_at, revoked_at, view_count, last_viewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL)`,
  ).run(link.id, tokenHash(token), link.collection, link.slug, link.variant, link.label, link.createdAt, link.expiresAt)
  return { ok: true, link: view(link, now) }
}

export function getReviewLink(id: string): ReviewLink | null {
  const row = getAuthDb().prepare(`SELECT ${COLUMNS} FROM review_links WHERE id = ?`).get(id) as Row | undefined
  return row ? toLink(row) : null
}

/**
 * Links, newest first: of one item (its old slugs before a rename included,
 * when `aliases` names them) or of every item; inactive ones only with
 * `includeInactive`.
 */
export function listReviewLinks(opts: { collection?: ReviewCollection; slugs?: readonly string[]; includeInactive?: boolean; now?: number } = {}): ReviewLinkView[] {
  const now = opts.now ?? Date.now()
  const where: string[] = []
  const params: unknown[] = []
  if (opts.collection) {
    where.push('collection = ?')
    params.push(opts.collection)
  }
  if (opts.slugs) {
    if (!opts.slugs.length) return []
    where.push(`slug IN (${opts.slugs.map(() => '?').join(', ')})`)
    params.push(...opts.slugs)
  }
  if (!opts.includeInactive) {
    where.push('revoked_at IS NULL AND expires_at > ?')
    params.push(now)
  }
  const rows = getAuthDb()
    .prepare(`SELECT ${COLUMNS} FROM review_links ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 500`)
    .all(...params) as Row[]
  return rows.map((r) => view(toLink(r), now))
}

/** Turn a link off (idempotent). The link as stored afterwards, null when there is no such link. */
export function revokeReviewLink(id: string, now = Date.now()): ReviewLink | null {
  const db = getAuthDb()
  db.prepare('UPDATE review_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, id)
  return getReviewLink(id)
}

/** Turn off every active link of an item (its old slugs included); returns how many. */
export function revokeItemLinks(collection: ReviewCollection, slugs: readonly string[], now = Date.now()): number {
  if (!slugs.length) return 0
  return getAuthDb()
    .prepare(`UPDATE review_links SET revoked_at = ? WHERE revoked_at IS NULL AND collection = ? AND slug IN (${slugs.map(() => '?').join(', ')})`)
    .run(now, collection, ...slugs).changes
}

/** The addresses whose links lead to `slug`: the slug itself and the old slugs that redirect to it. */
export function linkSlugsOf(collection: ReviewCollection, slug: string): string[] {
  return Array.from(new Set([slug, ...redirectsTo(collection, slug)]))
}

/**
 * An address changes hands — an item is created or restored at `slug`, or
 * another item is renamed onto it: every link that would now lead there
 * (made for `slug`, or for an old address redirecting to it) was made for
 * whatever was there before, never for the item arriving. Turn them off.
 * Call it in the write's transaction, before the new item can be read.
 */
export function revokeLinksAt(collection: ReviewCollection, slug: string, now = Date.now()): number {
  return revokeItemLinks(collection, linkSlugsOf(collection, slug), now)
}

export type ResolveResult =
  | { status: 'ok'; link: ReviewLink }
  | { status: 'expired'; link: ReviewLink }
  | { status: 'revoked'; link: ReviewLink }
  /** No such link (or a forged / altered one) — indistinguishable on purpose. */
  | { status: 'unknown' }
  /** The server has no key (JWT_SECRET unset). */
  | { status: 'unavailable' }

/** Look a token up: by its hash, then the signature over the stored scope (constant time). */
export function resolveReviewToken(token: unknown, now = Date.now()): ResolveResult {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { status: 'unknown' }
  const key = reviewLinkKey()
  if (!key) return { status: 'unavailable' }
  const row = getAuthDb().prepare(`SELECT ${COLUMNS} FROM review_links WHERE token_hash = ?`).get(tokenHash(token)) as Row | undefined
  if (!row) return { status: 'unknown' }
  const link = toLink(row)
  if (!verifyToken(token, scopeOf(link), key)) return { status: 'unknown' }
  const status = linkStatus(link, now)
  if (status === 'revoked') return { status: 'revoked', link }
  if (status === 'expired') return { status: 'expired', link }
  return { status: 'ok', link }
}

/** Count one opening of a link. Never throws (a view must render even if this fails). */
export function recordReviewView(id: string, now = Date.now()): void {
  try {
    getAuthDb().prepare('UPDATE review_links SET view_count = view_count + 1, last_viewed_at = ? WHERE id = ?').run(now, id)
  } catch {
    // Bookkeeping only.
  }
}
