import { getDb } from '../db'
import { getItem, getItemFromDb, putItem, stableStringify } from '../contentStore'
import { getPendingRevision, putPendingRevision, rebasedPendingBase } from '../pendingRevisions'
import {
  PUBLISH_AT,
  UNPUBLISH_AT,
  checkSchedule,
  itemSchedule,
  publishDay,
  withSchedule,
  type ItemSchedule,
  type ScheduleProblem,
  type ScheduleRequest,
} from './fields'
import { parseInstant } from './time'

/**
 * Reading and setting the schedules of posts and case studies (H5).
 * Server-only (SQLite). The schedule lives in the frontmatter of the stored
 * rows (lib/schedule/fields): a draft's own row, a live item's pending
 * revision (publishAt) and a live item's own row (unpublishAt).
 */

export type Collection = 'blog' | 'work'
export const COLLECTIONS: readonly Collection[] = ['blog', 'work']

export type ScheduledKind = 'publish' | 'publish-changes' | 'unpublish'

export type ScheduledEntry = {
  collection: Collection
  slug: string
  title: string
  kind: ScheduledKind
  /** Due time, epoch ms. */
  at: number
}

type Row = { collection: string; slug: string; frontmatter: string }

const parse = (raw: string): Record<string, any> | null => {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

const isCollection = (c: string): c is Collection => c === 'blog' || c === 'work'

const titleOf = (fm: Record<string, any> | null, slug: string) => (typeof fm?.title === 'string' && fm.title.trim() ? fm.title.trim() : slug)

/**
 * Every scheduled action, soonest first — including overdue ones (the
 * scheduler runs them on its next pass). A pending revision whose item is
 * no longer live is listed as 'publish-changes' too: the run drops it
 * (there is nothing live to change).
 */
export function scheduledEntries(): ScheduledEntry[] {
  const db = getDb()
  const out: ScheduledEntry[] = []
  const liveRows = db
    .prepare(
      `SELECT collection, slug, frontmatter FROM collection_items
       WHERE collection IN ('blog', 'work') AND (instr(frontmatter, '"${PUBLISH_AT}"') > 0 OR instr(frontmatter, '"${UNPUBLISH_AT}"') > 0)`,
    )
    .all() as Row[]
  for (const r of liveRows) {
    if (!isCollection(r.collection)) continue
    const fm = parse(r.frontmatter)
    if (!fm) continue
    const s = itemSchedule(fm, null)
    const title = titleOf(fm, r.slug)
    if (s.publishes === 'draft' && s.publishAt !== null) out.push({ collection: r.collection, slug: r.slug, title, kind: 'publish', at: s.publishAt })
    if (!fm.draft && s.unpublishAt !== null) out.push({ collection: r.collection, slug: r.slug, title, kind: 'unpublish', at: s.unpublishAt })
  }
  const pendingRows = db
    .prepare(
      `SELECT p.collection AS collection, p.slug AS slug, p.frontmatter AS frontmatter, c.frontmatter AS live
       FROM pending_revisions p LEFT JOIN collection_items c ON c.collection = p.collection AND c.slug = p.slug
       WHERE instr(p.frontmatter, '"${PUBLISH_AT}"') > 0`,
    )
    .all() as Array<Row & { live: string | null }>
  for (const r of pendingRows) {
    if (!isCollection(r.collection)) continue
    const fm = parse(r.frontmatter)
    const at = fm ? parseInstant(fm[PUBLISH_AT]) : null
    if (at === null) continue
    out.push({ collection: r.collection, slug: r.slug, title: titleOf(r.live ? parse(r.live) : fm, r.slug), kind: 'publish-changes', at })
  }
  return out.sort((a, b) => a.at - b.at || a.slug.localeCompare(b.slug))
}

/** The soonest scheduled time (possibly in the past), or null when nothing is scheduled. */
export function nextScheduledAt(): number | null {
  const all = scheduledEntries()
  return all.length ? all[0].at : null
}

/** Scheduled actions due at `now` (oldest first). */
export function dueEntries(now: number): ScheduledEntry[] {
  return scheduledEntries().filter((e) => e.at <= now)
}

/** slug → effective schedule of every scheduled item of a collection (the admin list). */
export function collectionSchedules(collection: Collection): Map<string, ItemSchedule> {
  const out = new Map<string, ItemSchedule>()
  for (const e of scheduledEntries()) {
    if (e.collection === collection && !out.has(e.slug)) out.set(e.slug, scheduleOf(collection, e.slug))
  }
  return out
}

/** The effective schedule of one item as stored. */
export function scheduleOf(collection: Collection, slug: string): ItemSchedule {
  const live = getItem(collection, slug)
  if (!live) return { publishAt: null, unpublishAt: null, publishes: null }
  return itemSchedule(live.frontmatter, getPendingRevision(collection, slug)?.frontmatter)
}

export type ApplyScheduleResult =
  | { ok: true; schedule: ItemSchedule; r2Warning?: string }
  | ({ ok: false } & ScheduleProblem)
  | { ok: false; status: 404 | 500; code: string; error: string }

/**
 * Set (or clear, with nulls) the schedule of an item. Where each time goes:
 *
 *   draft          publishAt and unpublishAt on its own row (setDate: its
 *                  date — a post's `date`, a case study's `published` — becomes the
 *                  publish day in Hong Kong)
 *   live item      unpublishAt on its own row; publishAt on its pending
 *                  revision (refused without one: nothing to publish)
 *                  (markUpdated, posts: the revision's `updated` becomes the
 *                  publish day)
 *
 * The live row gets a new version only when its frontmatter changes (the R2
 * mirror follows, like any save); a pending revision based on the old
 * version is rebased onto it, so the editor does not report the live item as
 * changed underneath. Checks and writes run without an await in between.
 */
export async function applySchedule(collection: Collection, slug: string, req: ScheduleRequest, now = Date.now()): Promise<ApplyScheduleResult> {
  const live = getItem(collection, slug)
  if (!live) return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Not found' }
  const pending = getPendingRevision(collection, slug)
  const draft = Boolean(live.frontmatter?.draft)
  const problem = checkSchedule(req, { draft, hasPending: !draft && !!pending }, now)
  if (problem) return { ok: false, ...problem }

  let liveFm: Record<string, any>
  let pendingFm: Record<string, any> | null = null
  if (draft) {
    liveFm = withSchedule(live.frontmatter, { publishAt: req.publishAt, unpublishAt: req.unpublishAt })
    if (req.setDate && req.publishAt !== null) liveFm = { ...liveFm, [collection === 'blog' ? 'date' : 'published']: publishDay(req.publishAt) }
  } else {
    liveFm = withSchedule(live.frontmatter, { unpublishAt: req.unpublishAt })
    if (pending) {
      pendingFm = withSchedule(pending.frontmatter, { publishAt: req.publishAt })
      if (req.markUpdated && req.publishAt !== null && collection === 'blog') pendingFm = { ...pendingFm, updated: publishDay(req.publishAt) }
      if (stableStringify(pendingFm) === stableStringify(pending.frontmatter)) pendingFm = null
    }
  }

  const liveChanged = stableStringify(liveFm) !== stableStringify(live.frontmatter)
  let r2Warning: string | undefined
  if (liveChanged) {
    const before = Math.trunc(live.updated_at)
    const out = await putItem(collection, slug, liveFm, live.body, {
      minUpdatedAt: before + 1,
      inTransaction: () => {
        if (!pending) return
        const after = Math.trunc(getItemFromDb(collection, slug)?.updated_at ?? 0)
        putPendingRevision(collection, slug, pendingFm ?? pending.frontmatter, pending.body, rebasedPendingBase(pending.baseUpdatedAt, before, after), now)
      },
    })
    if (!out.ok) return { ok: false, status: 500, code: 'DB', error: out.error }
    if ('r2Warning' in out) r2Warning = out.r2Warning
  } else if (pendingFm && pending) {
    putPendingRevision(collection, slug, pendingFm, pending.body, pending.baseUpdatedAt, now)
  }
  return { ok: true, schedule: scheduleOf(collection, slug), ...(r2Warning ? { r2Warning } : {}) }
}
