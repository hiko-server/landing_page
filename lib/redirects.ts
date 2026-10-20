import { getDb } from './db'
import { getItem } from './contentStore'

/**
 * Permanent redirects for renamed posts and case studies (H6).
 *
 * Table `redirects` (content migration 002, scripts/db/content): one row per
 * old address, `(collection, from_slug) → to_slug`. It travels with
 * content.db in every snapshot and is replaced by a restore together with
 * the items it points at. The edge middleware has no file access, so the
 * lookup happens where the content is read: getStaticProps of
 * pages/blog/[slug] and pages/work/[slug] answers a slug with no item
 * through missingItemProps() — `{ redirect: { permanent: true } }` (308)
 * when a row names the item's new address, else the usual 404.
 *
 * Rules (applyRename, inside the rename's transaction):
 *   - the renamed item's old slug redirects to the new one;
 *   - rows that pointed at the old slug now point at the new one, so a
 *     visitor never takes two hops (/a → /b → /c becomes /a → /c, /b → /c);
 *   - a row FROM the new slug is dropped: that address is live again;
 *   - a live item always wins: a slug with an item never redirects, and
 *     creating an item at an old address drops its row (forgetRedirectFrom).
 *
 * Server-only (SQLite). The hop-following rule is pure (followRedirects).
 */

export type RedirectCollection = 'blog' | 'work'

export type RedirectRow = { collection: RedirectCollection; from: string; to: string; createdAt: number }

/** Upper bound on followed hops (rows are kept collapsed; this only guards a hand-edited loop). */
export const MAX_REDIRECT_HOPS = 8

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/

export const isRedirectSlug = (v: unknown): v is string => typeof v === 'string' && v.length <= 128 && SLUG_RE.test(v)

/**
 * Where `slug` leads after following `next` (one lookup per hop), or null
 * when it has no row, or the rows loop or run longer than MAX_REDIRECT_HOPS.
 */
export function followRedirects(next: (slug: string) => string | null, slug: string): string | null {
  const seen = new Set<string>([slug])
  let cur = slug
  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    const to = next(cur)
    if (!to) return cur === slug ? null : cur
    if (seen.has(to)) return null
    seen.add(to)
    cur = to
  }
  return null
}

type Row = { collection: string; from_slug: string; to_slug: string; created_at: number }

const toRow = (r: Row): RedirectRow => ({
  collection: r.collection === 'work' ? 'work' : 'blog',
  from: r.from_slug,
  to: r.to_slug,
  createdAt: Math.trunc(Number(r.created_at) || 0),
})

/** The row's target for one old slug (no hop following). */
function lookup(collection: RedirectCollection, from: string): string | null {
  const row = getDb().prepare('SELECT to_slug FROM redirects WHERE collection = ? AND from_slug = ?').get(collection, from) as
    | { to_slug: string }
    | undefined
  return row && isRedirectSlug(row.to_slug) ? row.to_slug : null
}

/** Where an old address leads now, or null. Never throws (a broken store means "no redirect"). */
export function redirectTarget(collection: RedirectCollection, slug: string): string | null {
  if (!isRedirectSlug(slug)) return null
  try {
    return followRedirects((s) => lookup(collection, s), slug)
  } catch {
    return null
  }
}

/** Old slugs that lead to `slug`, sorted. */
export function redirectsTo(collection: RedirectCollection, slug: string): string[] {
  const rows = getDb()
    .prepare('SELECT from_slug FROM redirects WHERE collection = ? AND to_slug = ? ORDER BY from_slug')
    .all(collection, slug) as Array<{ from_slug: string }>
  return rows.map((r) => r.from_slug)
}

/** Every redirect (of one collection), oldest first — the content export lists them. */
export function listRedirects(collection?: RedirectCollection): RedirectRow[] {
  const db = getDb()
  const rows = (
    collection
      ? db.prepare('SELECT * FROM redirects WHERE collection = ? ORDER BY created_at, from_slug').all(collection)
      : db.prepare('SELECT * FROM redirects ORDER BY collection, created_at, from_slug').all()
  ) as Row[]
  return rows.map(toRow)
}

/**
 * The redirect rows after renaming `from` → `to` (see the rules above).
 * Runs on the shared connection; call it inside the rename's transaction.
 * `keepOld` false (a draft that was never public) adds no row for `from`,
 * but older addresses still follow the item.
 */
export function applyRename(collection: RedirectCollection, from: string, to: string, keepOld: boolean, now = Date.now()): void {
  const db = getDb()
  // First the row FROM the new address (renaming back: /a → /b, then /b → /a),
  // so the re-pointing below can never produce a row that leads to itself.
  db.prepare('DELETE FROM redirects WHERE collection = ? AND from_slug = ?').run(collection, to)
  db.prepare('UPDATE redirects SET to_slug = ? WHERE collection = ? AND to_slug = ?').run(to, collection, from)
  if (keepOld && from !== to) {
    db.prepare(
      `INSERT INTO redirects (collection, from_slug, to_slug, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(collection, from_slug) DO UPDATE SET to_slug = excluded.to_slug, created_at = excluded.created_at`,
    ).run(collection, from, to, Math.trunc(now))
  }
}

/** Stop `from` redirecting (only when it leads to `to`, if given). True when a row went. */
export function removeRedirect(collection: RedirectCollection, from: string, to?: string): boolean {
  const db = getDb()
  const out = to
    ? db.prepare('DELETE FROM redirects WHERE collection = ? AND from_slug = ? AND to_slug = ?').run(collection, from, to)
    : db.prepare('DELETE FROM redirects WHERE collection = ? AND from_slug = ?').run(collection, from)
  return out.changes > 0
}

/** An item was created at `slug`: its old redirect (if any) is dropped — the live item wins. */
export function forgetRedirectFrom(collection: RedirectCollection, slug: string): boolean {
  return removeRedirect(collection, slug)
}

/** The item renders at /<collection>/<slug>: stored and not a draft (drafts too in Draft Mode) — lib/mdx's rule. */
function rendersAt(collection: RedirectCollection, slug: string, includeDrafts: boolean): boolean {
  const item = getItem(collection, slug)
  return !!item && (includeDrafts || !item.frontmatter?.draft)
}

/**
 * Where a renamed post's / case study's old slug leads now — its current
 * slug, when the item renders there (drafts too in Draft Mode) — or null.
 */
export function liveRedirectTarget(collection: RedirectCollection, slug: string, draftMode = false): string | null {
  const target = redirectTarget(collection, slug)
  return target && rendersAt(collection, target, draftMode) ? target : null
}

/**
 * getStaticProps' answer for a post / case-study slug that has no item: a
 * permanent (308) redirect to the item's current address when the slug was
 * renamed and the item renders there, else 404. Both re-checked every
 * minute (a removed redirect or a restored item takes effect). The
 * Markdown twins (/blog/<old>.md, pages/api/md.ts) follow the same rule.
 */
export function missingItemProps(
  collection: RedirectCollection,
  slug: string,
  draftMode = false,
): { redirect: { destination: string; permanent: true }; revalidate: number } | { notFound: true; revalidate: number } {
  const target = liveRedirectTarget(collection, slug, draftMode)
  if (target) return { redirect: { destination: `/${collection}/${target}`, permanent: true }, revalidate: 60 }
  return { notFound: true, revalidate: 60 }
}
