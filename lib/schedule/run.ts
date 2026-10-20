import { getItemFromDb, putItem, type ItemRecord } from '../contentStore'
import { getPendingRevision, deletePendingRevisionVersion, putPendingRevision, type PendingRevision } from '../pendingRevisions'
import { runInAuditScope, type AuditScope, type SnapshotKind } from '../audit/context'
import type { AdminAuditEntry } from '../audit/record'
import { writeOne } from '../mdx-admin'
import { log } from '../log'
import { PUBLISH_AT, UNPUBLISH_AT, itemSchedule, withSchedule, withoutSchedule } from './fields'
import { dueEntries, type Collection, type ScheduledEntry, type ScheduledKind } from './store'
import { formatSiteTime, parseInstant, relativeInstant } from './time'

/**
 * One pass of scheduled publishing (H5): every action that is due runs, in
 * the order it was due. Called by POST /api/internal/scheduled-publish (the
 * server's own job, lib/schedule/scheduler), which supplies the page
 * regeneration and the activity-log entry. Server-only.
 *
 *   publish          a scheduled draft goes live (draft and publishAt
 *                    removed; a window's unpublishAt stays on the item)
 *   publish-changes  a live item's pending revision (H4) goes live — exactly
 *                    the stored revision: it is re-read after its body was
 *                    checked, then written and dropped in ONE transaction,
 *                    only while it is still that version
 *   unpublish        a live item goes back to draft; like an unpublish by
 *                    hand, its pending revision (if any) becomes the draft's
 *                    content and is dropped in the same transaction — a
 *                    draft never holds one, so the editor, a later scheduled
 *                    publish and a review link all read the same row (the
 *                    formerly live version is in the history)
 *
 * Idempotent: every action re-reads the item and checks that it is still
 * due before it writes, and the write removes the time it acted on, so a
 * second pass (or a pass after a restart) finds nothing to do. Missed slots
 * are caught up: anything due in the past runs on the next pass. A draft
 * whose whole window passed while the site was down is not published (its
 * times are cleared and the log says so); likewise a live item's scheduled
 * changes whose item was due to come down too are not published for a
 * moment — the log says so, and the unpublish (which keeps them as the
 * draft) still runs; a body that no longer renders is
 * not published either (cleared and logged — a page must never break). One
 * pass at a time per process (ScheduleBusyError).
 */

export class ScheduleBusyError extends Error {
  constructor() {
    super('A scheduled-publishing pass is already running')
    this.name = 'ScheduleBusyError'
  }
}

export type RunOutcome = 'published' | 'published-changes' | 'unpublished' | 'missed' | 'not-live' | 'invalid' | 'failed' | 'stale'

export type RunAction = {
  collection: Collection
  slug: string
  title: string
  kind: ScheduledKind
  /** When it was due (ms). */
  at: number
  outcome: RunOutcome
  /** How late it ran (ms; 0 when on time). */
  lateMs: number
  error?: string
}

export type RunDeps = {
  now?: () => number
  /** Regenerate an item's public pages (index, detail, siblings, home, CV; feeds and sitemap through the edge purge). */
  refresh: (collection: Collection, slug: string, previousKeys: unknown[]) => Promise<unknown>
  /** Put the action in the activity log, the scheduler as actor. */
  record: (entry: AdminAuditEntry, snapshots: Array<{ kind: SnapshotKind; file: string }>) => void
  /** Null when the body renders with the public renderer, else why not (lib/mdx-admin mdxProblem). */
  compile?: (body: string) => Promise<{ error: string } | null>
}

/** Later than this counts as "caught up" in the log line. */
export const LATE_NOTE_MS = 2 * 60_000
/** Re-checks of a body that keeps changing while it is compiled, before the pass leaves it to the next one. */
const COMPILE_ATTEMPTS = 3

type RunGlobal = typeof globalThis & { __schedulePublishRunning?: boolean }

const NOUN: Record<Collection, string> = { blog: 'post', work: 'case study' }
const AREA: Record<Collection, 'post' | 'work'> = { blog: 'post', work: 'work' }
const quote = (s: string) => `“${s.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120)}”`
const titleOf = (fm: Record<string, any> | undefined, slug: string) => (typeof fm?.title === 'string' && fm.title.trim() ? fm.title.trim() : slug)

/** " — caught up 3 h late (due Sun 25 Oct, 09:00 HKT)" when it ran late, else ''. */
export function lateNote(at: number, now: number): string {
  if (now - at <= LATE_NOTE_MS) return ''
  return ` — caught up ${relativeInstant(at, now).replace(/ ago$/, '')} late (due ${formatSiteTime(at, { year: false })})`
}

/** True while a pass runs in this process. */
export function scheduleRunInProgress(): boolean {
  return (globalThis as RunGlobal).__schedulePublishRunning === true
}

/** Run every due action once. A single item's failure is logged and reported, never thrown. */
export async function runDueSchedules(deps: RunDeps): Promise<{ actions: RunAction[] }> {
  const g = globalThis as RunGlobal
  if (g.__schedulePublishRunning) throw new ScheduleBusyError()
  g.__schedulePublishRunning = true
  const now = deps.now ?? Date.now
  const actions: RunAction[] = []
  try {
    for (const entry of dueEntries(now())) {
      let action: RunAction
      try {
        action = await runOne(entry, deps, now)
      } catch (err) {
        log.error('scheduled publishing: an action failed', { collection: entry.collection, slug: entry.slug, kind: entry.kind, err })
        action = { ...entry, outcome: 'failed', lateMs: Math.max(0, now() - entry.at), error: err instanceof Error ? err.message : String(err) }
      }
      if (action.outcome !== 'stale') actions.push(action)
    }
  } finally {
    g.__schedulePublishRunning = false
  }
  if (actions.length) log.info('scheduled publishing ran', { actions: actions.map((a) => `${a.collection}/${a.slug}:${a.outcome}`) })
  return { actions }
}

async function compileProblem(deps: RunDeps, body: string): Promise<string | null> {
  if (!deps.compile) return null
  const problem = await deps.compile(body)
  return problem ? problem.error : null
}

/**
 * Check the body of a stored version, then read it again: when it changed
 * while it was compiled, check the newer one. Returns the version as it is
 * now with the result for exactly that body, or `changing` when it would
 * not hold still (the next pass tries again).
 */
async function checkedVersion<T extends { body: string }>(
  read: () => T | null,
  versionOf: (v: T) => number,
  deps: RunDeps,
): Promise<{ value: T | null; invalid: string | null; changing: boolean }> {
  let value = read()
  for (let attempt = 0; value && attempt < COMPILE_ATTEMPTS; attempt++) {
    const invalid = await compileProblem(deps, value.body)
    const again = read()
    if (!again) return { value: null, invalid: null, changing: false }
    if (versionOf(again) === versionOf(value)) return { value: again, invalid, changing: false }
    value = again
  }
  return { value, invalid: null, changing: !!value }
}

async function clearDraftSchedule(c: Collection, slug: string): Promise<void> {
  const row = getItemFromDb(c, slug)
  if (!row) return
  const out = await putItem(c, slug, withoutSchedule(row.frontmatter), row.body, { minUpdatedAt: Math.trunc(row.updated_at) + 1 })
  if (!out.ok) throw new Error(out.error)
}

async function runOne(entry: ScheduledEntry, deps: RunDeps, now: () => number): Promise<RunAction> {
  const { collection: c, slug } = entry
  const area = AREA[c]
  const noun = NOUN[c]
  const base = { collection: c, slug, kind: entry.kind, at: entry.at }
  const stale = (): RunAction => ({ ...base, title: entry.title, outcome: 'stale', lateMs: 0 })

  if (entry.kind === 'publish') {
    const checked = await checkedVersion<ItemRecord>(() => getItemFromDb(c, slug), (r) => Math.trunc(r.updated_at), deps)
    const live = checked.value
    // Nothing is awaited from here to the write: the row written is the row checked.
    const t = now()
    const s = itemSchedule(live?.frontmatter, null)
    if (checked.changing || !live || !live.frontmatter?.draft || s.publishAt === null || s.publishAt > t) return stale()
    const title = titleOf(live.frontmatter, slug)
    const lateMs = Math.max(0, t - s.publishAt)
    if (s.unpublishAt !== null && s.unpublishAt <= t) {
      await clearDraftSchedule(c, slug)
      deps.record(
        {
          action: `${area}.schedule-missed`,
          area,
          target: slug,
          summary: `Did not publish ${noun} ${quote(title)}: its whole window (${formatSiteTime(s.publishAt, { year: false })} – ${formatSiteTime(s.unpublishAt, { year: false })}) passed while the site was not running`,
        },
        [],
      )
      return { ...base, title, outcome: 'missed', lateMs }
    }
    if (checked.invalid) {
      await clearDraftSchedule(c, slug)
      deps.record(
        {
          action: `${area}.schedule-failed`,
          area,
          target: slug,
          summary: `Did not publish ${noun} ${quote(title)} on schedule: the body does not render (${checked.invalid}). Fix it, then publish or schedule again`,
        },
        [],
      )
      return { ...base, title, outcome: 'invalid', lateMs, error: checked.invalid }
    }
    const fm = withSchedule(live.frontmatter, { unpublishAt: s.unpublishAt })
    delete fm.draft
    const scope: AuditScope = { snapshots: [] }
    const out = await runInAuditScope(scope, () => writeOne(c, slug, fm, live.body, { minUpdatedAt: Math.trunc(live.updated_at) + 1 }))
    if (!out.ok) throw new Error(out.error)
    await deps.refresh(c, slug, [live.frontmatter?.translationKey])
    deps.record({ action: `${area}.publish`, area, target: slug, summary: `Published ${noun} ${quote(title)} on schedule${lateNote(s.publishAt, t)}` }, scope.snapshots)
    return { ...base, title, outcome: 'published', lateMs }
  }

  if (entry.kind === 'publish-changes') {
    const checked = await checkedVersion<PendingRevision>(() => getPendingRevision(c, slug), (r) => r.updatedAt, deps)
    const rev = checked.value
    // Nothing is awaited from here to the write: exactly this revision goes live.
    const t = now()
    const at = rev ? parseInstant(rev.frontmatter[PUBLISH_AT]) : null
    if (checked.changing || !rev || at === null || at > t) return stale()
    const live = getItemFromDb(c, slug)
    const title = titleOf(live?.frontmatter ?? rev.frontmatter, slug)
    const lateMs = Math.max(0, t - at)
    if (!live || live.frontmatter?.draft) {
      let snapshots: AuditScope['snapshots'] = []
      if (live) {
        // A draft never holds a pending revision: the changes become the draft (its own schedule stays).
        const own = itemSchedule(live.frontmatter, null)
        const fm = withSchedule({ ...withoutSchedule(rev.frontmatter), draft: true }, { publishAt: own.publishAt, unpublishAt: own.unpublishAt })
        snapshots = await replaceWithRevision(c, slug, live, fm, rev)
      } else {
        putPendingRevision(c, slug, withoutSchedule(rev.frontmatter), rev.body, rev.baseUpdatedAt)
      }
      deps.record(
        {
          action: `${area}.schedule-skipped`,
          area,
          target: slug,
          summary: `Did not publish the scheduled changes to ${noun} ${quote(title)}: it is no longer live (the changes are kept${live ? ' as its draft' : ''})`,
        },
        snapshots,
      )
      return { ...base, title, outcome: 'not-live', lateMs }
    }
    const end = parseInstant(live.frontmatter?.[UNPUBLISH_AT])
    if (end !== null && end <= t) {
      // The changes' time and the item's end both passed before this pass ran (the server was
      // down, or the scheduler was backing off). Like a draft's missed window, the changes do not
      // go live for a moment: their time is cleared and the unpublish — due in this pass, or
      // right after it — takes the item down with them as its draft.
      putPendingRevision(c, slug, withoutSchedule(rev.frontmatter), rev.body, rev.baseUpdatedAt)
      deps.record(
        {
          action: `${area}.schedule-missed`,
          area,
          target: slug,
          summary: `Did not publish the scheduled changes to ${noun} ${quote(title)} (due ${formatSiteTime(at, { year: false })}): its unpublish time (${formatSiteTime(end, { year: false })}) passed too while the site was not running. It is unpublished as scheduled, with the changes as its draft`,
        },
        [],
      )
      return { ...base, title, outcome: 'missed', lateMs }
    }
    if (checked.invalid) {
      putPendingRevision(c, slug, withoutSchedule(rev.frontmatter), rev.body, rev.baseUpdatedAt)
      deps.record(
        {
          action: `${area}.schedule-failed`,
          area,
          target: slug,
          summary: `Did not publish the scheduled changes to ${noun} ${quote(title)}: they do not render (${checked.invalid}). Fix them, then publish or schedule again`,
        },
        [],
      )
      return { ...base, title, outcome: 'invalid', lateMs, error: checked.invalid }
    }
    const fm = withSchedule(rev.frontmatter, { unpublishAt: end })
    delete fm.draft
    const version = rev.updatedAt
    const scope: AuditScope = { snapshots: [] }
    const out = await runInAuditScope(scope, () =>
      writeOne(c, slug, fm, rev.body, {
        minUpdatedAt: Math.trunc(live.updated_at) + 1,
        inTransaction: () => {
          // Rolls the publish back if the revision is no longer the one checked.
          if (!deletePendingRevisionVersion(c, slug, version)) throw new Error('the scheduled revision changed while it was being published')
        },
      }),
    )
    if (!out.ok) throw new Error(out.error)
    const marked = typeof fm.updated === 'string' && !!fm.updated && fm.updated !== live.frontmatter?.updated
    await deps.refresh(c, slug, [live.frontmatter?.translationKey])
    deps.record(
      {
        action: `${area}.publish-changes`,
        area,
        target: slug,
        summary: `Published the scheduled changes to ${noun} ${quote(title)}${marked ? ' (marked as updated)' : ''}${lateNote(at, t)}`,
      },
      scope.snapshots,
    )
    return { ...base, title, outcome: 'published-changes', lateMs }
  }

  // unpublish
  const live = getItemFromDb(c, slug)
  const t = now()
  const end = live ? parseInstant(live.frontmatter?.[UNPUBLISH_AT]) : null
  if (!live || live.frontmatter?.draft || end === null || end > t) return stale()
  const title = titleOf(live.frontmatter, slug)
  // Like an unpublish by hand (the editor saves what it shows as the draft): saved but
  // unpublished changes become the draft's content, so a later publish shows what the editor shows.
  const rev = getPendingRevision(c, slug)
  const snapshots = rev
    ? await replaceWithRevision(c, slug, live, { ...withoutSchedule(rev.frontmatter), draft: true }, rev)
    : await replaceWithRevision(c, slug, live, { ...withoutSchedule(live.frontmatter), draft: true }, null)
  await deps.refresh(c, slug, [live.frontmatter?.translationKey])
  deps.record(
    {
      action: `${area}.unpublish`,
      area,
      target: slug,
      summary: `Unpublished ${noun} ${quote(title)} on schedule${lateNote(end, t)}${rev ? ' (its unpublished changes are now the draft)' : ''}`,
    },
    snapshots,
  )
  return { ...base, title, outcome: 'unpublished', lateMs: Math.max(0, t - end) }
}

/**
 * Write the item's row as `fm` with the revision's body (or its own body
 * when `rev` is null) and drop that revision in the same transaction — only
 * while it is still the version read, else nothing is written (the next
 * pass tries again). writeOne snapshots the row it replaces first.
 */
async function replaceWithRevision(
  c: Collection,
  slug: string,
  row: ItemRecord,
  fm: Record<string, any>,
  rev: PendingRevision | null,
): Promise<AuditScope['snapshots']> {
  const scope: AuditScope = { snapshots: [] }
  const out = await runInAuditScope(scope, () =>
    writeOne(c, slug, fm, rev ? rev.body : row.body, {
      minUpdatedAt: Math.trunc(row.updated_at) + 1,
      inTransaction: () => {
        if (rev && !deletePendingRevisionVersion(c, slug, rev.updatedAt)) throw new Error('the unpublished changes changed while the item was being updated')
      },
    }),
  )
  if (!out.ok) throw new Error(out.error)
  return scope.snapshots
}
