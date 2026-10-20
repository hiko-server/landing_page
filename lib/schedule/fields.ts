import { parseInstant, toInstantString, zonedDay } from './time'

/**
 * The schedule of a post or case study (H5), kept in its frontmatter:
 *
 *   publishAt    ISO instant. On a DRAFT (the stored item, draft: true): the
 *                draft goes live then. On the PENDING REVISION of a live item
 *                (H4, lib/pendingRevisions): exactly that revision is
 *                published then. Meaningless on a live item's own row.
 *   unpublishAt  ISO instant, on the item's own row. A live item goes back
 *                to draft then; on a draft it ends the window that starts at
 *                its publishAt.
 *
 * Kept in the frontmatter so a schedule lives in content.db with the item —
 * it survives restarts, travels with backups, the R2 mirror, renames and the
 * .zip export — but it is server-owned metadata, not content:
 *
 *   - only POST { action: 'schedule' } (lib/mdx-admin) sets it;
 *   - an editor save or a history restore never takes it from what the
 *     client or the snapshot sends: carryScheduleOnSave() keeps the stored
 *     one (or drops it when the save makes it meaningless — publishing now,
 *     unpublishing by hand);
 *   - the public readers never see it (lib/mdx cleanFrontmatter strips it).
 *
 * Pure and client-safe.
 */

export const PUBLISH_AT = 'publishAt'
export const UNPUBLISH_AT = 'unpublishAt'
export const SCHEDULE_KEYS: readonly string[] = [PUBLISH_AT, UNPUBLISH_AT]

/** How far ahead a schedule may be set (beyond it, publish later by hand). */
export const MAX_SCHEDULE_AHEAD_MS = 2 * 365 * 86_400_000
/** A publish time this close to now (or past) is refused: publish now instead. */
export const MIN_LEAD_MS = 5_000
/** An unpublish must come at least this long after the publish it ends. */
export const MIN_WINDOW_MS = 60_000

export type Frontmatter = Record<string, any>

export type ItemSchedule = {
  /** When the draft (or the pending changes) goes live, epoch ms; null when not scheduled. */
  publishAt: number | null
  /** When the item goes back to draft, epoch ms; null when not scheduled. */
  unpublishAt: number | null
  /** What publishAt publishes: the draft itself, or the live item's pending changes. */
  publishes: 'draft' | 'changes' | null
}

export const NO_SCHEDULE: ItemSchedule = { publishAt: null, unpublishAt: null, publishes: null }

const isRecord = (v: unknown): v is Frontmatter => !!v && typeof v === 'object' && !Array.isArray(v)

/** The frontmatter without its schedule keys (a new object). */
export function withoutSchedule<T extends Frontmatter>(fm: T): T {
  if (!isRecord(fm)) return fm
  const out: Frontmatter = { ...fm }
  for (const k of SCHEDULE_KEYS) delete out[k]
  return out as T
}

/** True when the frontmatter carries either schedule key. */
export function hasScheduleKeys(fm: unknown): boolean {
  return isRecord(fm) && SCHEDULE_KEYS.some((k) => fm[k] !== undefined && fm[k] !== null && fm[k] !== '')
}

/** `fm` with the given schedule set (null / undefined removes a key). */
export function withSchedule<T extends Frontmatter>(fm: T, schedule: { publishAt?: number | null; unpublishAt?: number | null }): T {
  const out: Frontmatter = withoutSchedule(fm)
  if (typeof schedule.publishAt === 'number') out[PUBLISH_AT] = toInstantString(schedule.publishAt)
  if (typeof schedule.unpublishAt === 'number') out[UNPUBLISH_AT] = toInstantString(schedule.unpublishAt)
  return out as T
}

/**
 * The effective schedule of an item from its stored rows: the live row's
 * frontmatter and its pending revision's (null when there is none).
 */
export function itemSchedule(live: Frontmatter | null | undefined, pending: Frontmatter | null | undefined): ItemSchedule {
  if (!isRecord(live)) return { ...NO_SCHEDULE }
  const draft = Boolean(live.draft)
  if (draft) {
    const publishAt = parseInstant(live[PUBLISH_AT])
    if (publishAt === null) return { ...NO_SCHEDULE }
    const end = parseInstant(live[UNPUBLISH_AT])
    return { publishAt, unpublishAt: end !== null && end > publishAt ? end : null, publishes: 'draft' }
  }
  const changesAt = isRecord(pending) ? parseInstant(pending[PUBLISH_AT]) : null
  return {
    publishAt: changesAt,
    unpublishAt: parseInstant(live[UNPUBLISH_AT]),
    publishes: changesAt !== null ? 'changes' : null,
  }
}

export type SaveRows = {
  /** 'pending': the save stores a pending revision; 'live': it writes the item. */
  target: 'live' | 'pending'
  /** The stored item before the save (null for a new one). */
  live: Frontmatter | null
  /** Its pending revision before the save (null when none). */
  pending: Frontmatter | null
  /** The frontmatter the client sent. */
  incoming: Frontmatter
  now: number
}

/**
 * The frontmatter an editor save (or a history restore) stores, with the
 * schedule taken from the stored rows, never from the client:
 *
 *   pending save                → the pending revision keeps its publishAt
 *   new item                    → no schedule
 *   draft stays a draft         → keeps publishAt / unpublishAt
 *   published by hand now       → publishAt ends (it is live); a future
 *                                 unpublishAt stays (the window's end)
 *   unpublished by hand         → both end
 *   live item saved live        → a future unpublishAt stays
 */
export function carryScheduleOnSave({ target, live, pending, incoming, now }: SaveRows): Frontmatter {
  const base = withoutSchedule(incoming)
  if (target === 'pending') {
    const at = isRecord(pending) ? parseInstant(pending[PUBLISH_AT]) : null
    return at !== null ? withSchedule(base, { publishAt: at }) : base
  }
  if (!isRecord(live)) return base
  const wasDraft = Boolean(live.draft)
  const isDraft = Boolean(incoming.draft)
  const end = parseInstant(live[UNPUBLISH_AT])
  if (isDraft) {
    if (!wasDraft) return base
    const start = parseInstant(live[PUBLISH_AT])
    return withSchedule(base, { publishAt: start, unpublishAt: start !== null ? end : null })
  }
  return withSchedule(base, { unpublishAt: end !== null && end > now ? end : null })
}

// ── Changing a schedule (POST { action: 'schedule' }) ─────────────────────

export type ScheduleRequest = {
  publishAt: number | null
  unpublishAt: number | null
  /** Draft only: also set the item's date to the publish day (Hong Kong). */
  setDate?: boolean
  /** Pending changes of a post only: mark it updated on the publish day. */
  markUpdated?: boolean
}

export type ScheduleProblem = { status: 400 | 409; code: string; error: string }

/** Read and validate the request body's times (ISO instants or null). */
export function parseScheduleBody(body: Record<string, unknown>): ScheduleRequest | ScheduleProblem {
  const read = (key: string): number | null | 'bad' => {
    const v = body[key]
    if (v === null || v === undefined || v === '') return null
    const t = parseInstant(v)
    return t === null ? 'bad' : t
  }
  const publishAt = read(PUBLISH_AT)
  const unpublishAt = read(UNPUBLISH_AT)
  if (publishAt === 'bad' || unpublishAt === 'bad') {
    return { status: 400, code: 'BAD_TIME', error: 'Times must be ISO 8601 instants with a time zone (e.g. 2026-10-25T01:00:00Z)' }
  }
  return { publishAt, unpublishAt, setDate: body.setDate === true, markUpdated: body.markUpdated === true }
}

/**
 * Is this schedule possible for the item as stored? `draft`: the item is a
 * draft; `hasPending`: a live item with saved, unpublished changes.
 */
export function checkSchedule(req: ScheduleRequest, state: { draft: boolean; hasPending: boolean }, now: number): ScheduleProblem | null {
  const { publishAt, unpublishAt } = req
  const tooFar = (t: number) => t - now > MAX_SCHEDULE_AHEAD_MS
  if (publishAt !== null) {
    if (publishAt - now < MIN_LEAD_MS) return { status: 400, code: 'IN_THE_PAST', error: 'That time has passed — pick a later one, or publish now.' }
    if (tooFar(publishAt)) return { status: 400, code: 'TOO_FAR', error: 'Schedules can be at most two years ahead.' }
    if (!state.draft && !state.hasPending) {
      return { status: 409, code: 'NOTHING_TO_PUBLISH', error: 'This item is live and has no saved changes — there is nothing to publish later.' }
    }
  }
  if (unpublishAt !== null) {
    if (unpublishAt - now < MIN_LEAD_MS) return { status: 400, code: 'IN_THE_PAST', error: 'The unpublish time has passed — pick a later one, or unpublish now.' }
    if (tooFar(unpublishAt)) return { status: 400, code: 'TOO_FAR', error: 'Schedules can be at most two years ahead.' }
    if (state.draft && publishAt === null) {
      return { status: 400, code: 'NEEDS_PUBLISH', error: 'A draft can only be unpublished after it is published — set a publish time first.' }
    }
    if (publishAt !== null && unpublishAt - publishAt < MIN_WINDOW_MS) {
      return { status: 400, code: 'WINDOW', error: 'The unpublish time must come after the publish time.' }
    }
  }
  if (req.setDate && (publishAt === null || !state.draft)) {
    return { status: 400, code: 'BAD_OPTION', error: 'Only a scheduled draft can take the publish day as its date.' }
  }
  if (req.markUpdated && (publishAt === null || state.draft)) {
    return { status: 400, code: 'BAD_OPTION', error: 'Only scheduled changes to a live post can be marked as updated.' }
  }
  return null
}

/** The Hong Kong calendar day a scheduled instant falls on (the item's date when it goes live). */
export function publishDay(ms: number): string {
  return zonedDay(ms)
}
