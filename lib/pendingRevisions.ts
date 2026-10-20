import { getDb } from './db'
import { jsonSafeFrontmatter } from './contentStore'

/**
 * Unpublished changes to live posts and case studies (H4).
 *
 * Saving a published item in the admin stores the edits here instead of in
 * collection_items, so the public pages — which only ever read
 * collection_items (lib/mdx) — keep serving the published version.
 * "Publish changes" writes the editor's state to collection_items through
 * the normal write path (snapshot, R2, revalidation) and deletes the row.
 * Draft Mode previews the pending version (lib/mdx GetOptions.pending).
 *
 * Table `pending_revisions` (content migration 002-editorial). One row per item at
 * most. `baseUpdatedAt` is the live row's version the edits started from:
 * when it no longer matches the live item, the live version changed since
 * (a restore, a rename, a tag merge) and the editor says so.
 *
 * Server-only (SQLite).
 */

export type PendingRevision = {
  collection: 'blog' | 'work'
  slug: string
  frontmatter: Record<string, any>
  body: string
  /** updated_at of the live item when the revision was started. */
  baseUpdatedAt: number
  /** Last save of the revision (ms); strictly increasing per item. */
  updatedAt: number
}

type Row = { collection: string; slug: string; frontmatter: string; body: string; base_updated_at: number; updated_at: number }

function decode(row: Row | undefined): PendingRevision | null {
  if (!row) return null
  let frontmatter: Record<string, any> = {}
  try {
    const parsed = JSON.parse(row.frontmatter)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) frontmatter = parsed
  } catch {
    // A row that does not parse is treated as absent: the live item stays authoritative.
    return null
  }
  return {
    collection: row.collection === 'work' ? 'work' : 'blog',
    slug: row.slug,
    frontmatter,
    body: row.body,
    baseUpdatedAt: Math.trunc(Number(row.base_updated_at) || 0),
    updatedAt: Math.trunc(Number(row.updated_at) || 0),
  }
}

export function getPendingRevision(collection: 'blog' | 'work', slug: string): PendingRevision | null {
  const row = getDb()
    .prepare('SELECT collection, slug, frontmatter, body, base_updated_at, updated_at FROM pending_revisions WHERE collection = ? AND slug = ?')
    .get(collection, slug) as Row | undefined
  return decode(row)
}

/** slug → updatedAt of every pending revision of a collection (for the admin list). */
export function pendingRevisionIndex(collection: 'blog' | 'work'): Map<string, number> {
  const rows = getDb().prepare('SELECT slug, updated_at FROM pending_revisions WHERE collection = ?').all(collection) as Array<{
    slug: string
    updated_at: number
  }>
  return new Map(rows.map((r) => [r.slug, Math.trunc(Number(r.updated_at) || 0)]))
}

/** Every pending revision of a collection (tag tools, export). */
export function listPendingRevisions(collection: 'blog' | 'work'): PendingRevision[] {
  const rows = getDb()
    .prepare('SELECT collection, slug, frontmatter, body, base_updated_at, updated_at FROM pending_revisions WHERE collection = ? ORDER BY slug')
    .all(collection) as Row[]
  return rows.map(decode).filter((r): r is PendingRevision => !!r)
}

/**
 * Store (insert or replace) the pending revision of an item. `updated_at` is
 * strictly increasing per row so it doubles as a version. Returns the stored
 * revision.
 */
export function putPendingRevision(
  collection: 'blog' | 'work',
  slug: string,
  frontmatter: Record<string, any>,
  body: string,
  baseUpdatedAt: number,
  now = Date.now(),
): PendingRevision {
  getDb()
    .prepare(
      `INSERT INTO pending_revisions (collection, slug, frontmatter, body, base_updated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(collection, slug) DO UPDATE SET
         frontmatter = excluded.frontmatter,
         body = excluded.body,
         base_updated_at = excluded.base_updated_at,
         updated_at = MAX(excluded.updated_at, pending_revisions.updated_at + 1)`,
    )
    .run(collection, slug, JSON.stringify(jsonSafeFrontmatter(frontmatter)), body, Math.trunc(baseUpdatedAt) || 0, now)
  return getPendingRevision(collection, slug) as PendingRevision
}

/** Drop the pending revision of an item; true when there was one. */
export function deletePendingRevision(collection: 'blog' | 'work', slug: string): boolean {
  return getDb().prepare('DELETE FROM pending_revisions WHERE collection = ? AND slug = ?').run(collection, slug).changes > 0
}

/**
 * The base a pending revision keeps after its live item was rewritten by a
 * tool (a rename, link rewrite or tag change) from version `liveBefore` to
 * `liveAfter`: the new live version when the revision was based on the old
 * one — the tool changed both alike, so the edits are still "on top of the
 * live version" — else its own base (it was already behind; the editor
 * keeps saying so).
 */
export function rebasedPendingBase(base: number, liveBefore: number, liveAfter: number): number {
  const b = Math.trunc(base) || 0
  return b > 0 && b === Math.trunc(liveBefore) && liveAfter > 0 ? Math.trunc(liveAfter) : b
}

/**
 * Move a pending revision to a new slug (inside the rename's transaction),
 * rebasing it from the live row's old version to its new one.
 */
export function movePendingRevision(collection: 'blog' | 'work', from: string, to: string, liveBefore = 0, liveAfter = 0): void {
  const db = getDb()
  db.prepare('DELETE FROM pending_revisions WHERE collection = ? AND slug = ?').run(collection, to)
  const row = db.prepare('SELECT base_updated_at FROM pending_revisions WHERE collection = ? AND slug = ?').get(collection, from) as
    | { base_updated_at: number }
    | undefined
  if (!row) return
  db.prepare('UPDATE pending_revisions SET slug = ?, base_updated_at = ? WHERE collection = ? AND slug = ?').run(
    to,
    rebasedPendingBase(row.base_updated_at, liveBefore, liveAfter),
    collection,
    from,
  )
}
