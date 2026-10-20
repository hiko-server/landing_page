/**
 * H5 — scheduled publishing through the real admin API and the scheduler's
 * pass, on a throw-away content store with a controlled clock:
 *
 *   - POST { action: 'schedule' } sets / clears the schedule (version
 *     checked, recorded in the activity log); editor saves and restores
 *     keep it, publishing or unpublishing by hand ends it;
 *   - runDueSchedules publishes due drafts, exactly the scheduled pending
 *     revision, unpublishes, catches up missed slots, skips whole missed
 *     windows and bodies that no longer render, and is idempotent;
 *   - the internal job route records every action with the scheduler as
 *     the actor and regenerates the pages; outsiders get a 404.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { editorialHarness, type Handler } from './editorialHarness'

const h = editorialHarness('schedule-publish')
let posts: Handler
let work: Handler

before(async () => {
  await h.setup()
  posts = (await import('../pages/api/admin/posts')).default
  work = (await import('../pages/api/admin/work')).default
})
after(async () => {
  const { closeAuditDb } = await import('../lib/audit/db')
  closeAuditDb()
  h.teardown()
})

const HOUR = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

async function create(handler: Handler, slug: string, fm: Record<string, unknown>, body = `Body of ${slug}.`) {
  const out = await h.call(handler, { method: 'PUT', body: { slug, frontmatter: { date: '2026-05-01', ...fm }, body, create: true } })
  assert.equal(out.statusCode, 200, JSON.stringify(out.body))
  return out
}

async function one(handler: Handler, slug: string) {
  return h.call(handler, { query: { slug } })
}

async function schedule(handler: Handler, slug: string, body: Record<string, unknown>, ifMatch?: string) {
  return h.call(handler, { method: 'POST', body: { action: 'schedule', slug, ...body }, headers: ifMatch ? { 'if-match': ifMatch } : {} })
}

/** Deps for runDueSchedules with a fixed clock; records what it was asked to do. */
function deps(now: number, compile?: (body: string) => Promise<{ error: string } | null>) {
  const refreshed: string[] = []
  const recorded: Array<{ action: string; target?: string | null; summary: string; snapshots: number }> = []
  return {
    refreshed,
    recorded,
    run: {
      now: () => now,
      refresh: async (c: string, slug: string) => {
        refreshed.push(`/${c}/${slug}`)
      },
      record: (entry: { action: string; target?: string | null; summary: string }, snapshots: unknown[]) => {
        recorded.push({ ...entry, snapshots: snapshots.length })
      },
      ...(compile ? { compile } : {}),
    },
  }
}

test('a draft is scheduled through the API: version-checked, stored in its frontmatter, shown to the editor, hidden from the public', async () => {
  await create(posts, 'sched-draft', { title: 'Scheduled draft', draft: true })
  const first = await one(posts, 'sched-draft')
  assert.deepEqual(first.body.schedule, { publishAt: null, unpublishAt: null, publishes: null })
  const at = Date.now() + 2 * HOUR
  const stale = await schedule(posts, 'sched-draft', { publishAt: iso(at) }, '"1"')
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.body.code, 'VERSION_CONFLICT')

  const out = await schedule(posts, 'sched-draft', { publishAt: iso(at), unpublishAt: iso(at + 48 * HOUR), setDate: true }, first.headers.etag)
  assert.equal(out.statusCode, 200, JSON.stringify(out.body))
  assert.deepEqual(out.body.schedule, { publishAt: at, unpublishAt: at + 48 * HOUR, publishes: 'draft' })
  assert.notEqual(out.body.etag, first.headers.etag, 'a new version')
  assert.equal(out.body.frontmatter.publishAt, undefined, 'the editor never holds the schedule keys')
  const { zonedDay } = await import('../lib/schedule/time')
  assert.equal(out.body.frontmatter.date, zonedDay(at), 'dated on the publish day (Hong Kong)')

  const { getItem } = await import('../lib/contentStore')
  assert.equal(getItem('blog', 'sched-draft')?.frontmatter.publishAt, iso(at), 'stored with the item')

  // The list marks it; the public readers never see it.
  const list = await h.call(posts)
  assert.deepEqual(list.body.items.find((i: any) => i.slug === 'sched-draft').schedule, { publishAt: at, unpublishAt: at + 48 * HOUR, publishes: 'draft' })
  const { getPost } = await import('../lib/mdx')
  assert.equal(await getPost('sched-draft'), null, 'still a draft')
  const preview = await getPost('sched-draft', { includeDrafts: true })
  assert.equal((preview?.frontmatter as Record<string, unknown>).publishAt, undefined)

  // Bad requests.
  const past = await schedule(posts, 'sched-draft', { publishAt: iso(Date.now() - 60_000) })
  assert.equal(past.statusCode, 400)
  assert.equal(past.body.code, 'IN_THE_PAST')
  const noZone = await schedule(posts, 'sched-draft', { publishAt: '2030-01-01T09:00' })
  assert.equal(noZone.body.code, 'BAD_TIME')
  const window = await schedule(posts, 'sched-draft', { publishAt: iso(at), unpublishAt: iso(at) })
  assert.equal(window.body.code, 'WINDOW')
  assert.equal((await schedule(posts, 'nope', { publishAt: iso(at) })).statusCode, 404)

  // The activity log describes the change (the capture of admin/posts).
  const { listAudit } = await import('../lib/audit/store')
  const entry = listAudit({ q: 'sched-draft' }).entries.find((e) => e.action === 'post.schedule')
  assert.ok(entry, 'recorded')
  assert.match(entry!.summary, /^Scheduled post “sched-draft” to publish \w{3} \d+ \w{3} \d{4}, \d{2}:\d{2} HKT and to unpublish /)
})

test('editor saves keep the schedule; publishing by hand ends it; a restore keeps the current one', async () => {
  const before = await one(posts, 'sched-draft')
  const at = before.body.schedule.publishAt as number
  // The editor sends no schedule (or a forged one): the stored one stays.
  const saved = await h.call(posts, {
    method: 'PUT',
    body: { slug: 'sched-draft', frontmatter: { ...before.body.frontmatter, title: 'Scheduled draft, edited', publishAt: iso(Date.now() + 60_000) }, body: 'Edited body.' },
    headers: { 'if-match': before.headers.etag },
  })
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body))
  const after = await one(posts, 'sched-draft')
  assert.equal(after.body.schedule.publishAt, at)
  assert.equal(after.body.frontmatter.title, 'Scheduled draft, edited')

  // A history restore brings back content, not an old schedule.
  const { listSnapshots, restoreItemSnapshot } = await import('../lib/mdx-admin')
  const snap = listSnapshots('blog', 'sched-draft').at(-1)!
  assert.equal((await restoreItemSnapshot('blog', 'sched-draft', snap.filename)).ok, true)
  assert.equal((await one(posts, 'sched-draft')).body.schedule.publishAt, at)

  // Publishing now ends the publish time; the window's end stays.
  const cur = await one(posts, 'sched-draft')
  const published = await h.call(posts, { method: 'PUT', body: { slug: 'sched-draft', frontmatter: { ...cur.body.frontmatter, draft: false }, body: cur.body.body }, headers: { 'if-match': cur.headers.etag } })
  assert.equal(published.statusCode, 200)
  const live = await one(posts, 'sched-draft')
  assert.deepEqual(live.body.schedule, { publishAt: null, unpublishAt: at + 48 * HOUR, publishes: null })
  // Unpublishing by hand ends everything.
  const back = await h.call(posts, { method: 'PUT', body: { slug: 'sched-draft', frontmatter: { ...live.body.frontmatter, draft: true }, body: live.body.body }, headers: { 'if-match': live.headers.etag } })
  assert.equal(back.statusCode, 200)
  assert.deepEqual((await one(posts, 'sched-draft')).body.schedule, { publishAt: null, unpublishAt: null, publishes: null })
})

test('a scheduled draft goes live when due — not before — once, with its pages regenerated and the action logged', async () => {
  const { runDueSchedules } = await import('../lib/schedule/run')
  await create(posts, 'due-draft', { title: 'Due draft', draft: true })
  const at = Date.now() + 3 * HOUR
  const s = await schedule(posts, 'due-draft', { publishAt: iso(at) })
  assert.equal(s.statusCode, 200, JSON.stringify(s.body))

  const early = deps(at - 1000)
  assert.deepEqual((await runDueSchedules(early.run)).actions, [], 'not yet due')

  const due = deps(at + 500)
  const out = await runDueSchedules(due.run)
  assert.deepEqual(out.actions.map((a) => [a.slug, a.outcome]), [['due-draft', 'published']])
  assert.deepEqual(due.refreshed, ['/blog/due-draft'])
  assert.equal(due.recorded[0].action, 'post.publish')
  assert.equal(due.recorded[0].summary, 'Published post “Due draft” on schedule')
  assert.equal(due.recorded[0].snapshots, 1, 'the draft version was kept in the history')
  const { getPost } = await import('../lib/mdx')
  assert.equal((await getPost('due-draft'))?.frontmatter.title, 'Due draft', 'public now')
  const { getItem } = await import('../lib/contentStore')
  assert.equal(getItem('blog', 'due-draft')?.frontmatter.publishAt, undefined)
  assert.equal(getItem('blog', 'due-draft')?.frontmatter.draft, undefined)

  // Idempotent: a second pass (or one after a restart) does nothing.
  const again = deps(at + 60_000)
  assert.deepEqual((await runDueSchedules(again.run)).actions, [])
  assert.deepEqual(again.recorded, [])
})

test('a missed slot is caught up after a restart, and the log says how late', async () => {
  const { putItem } = await import('../lib/contentStore')
  const { runDueSchedules } = await import('../lib/schedule/run')
  const now = Date.now()
  // Due three hours ago — as if the server was down then.
  await putItem('work', 'missed-slot', { title: 'Missed slot', draft: true, publishAt: iso(now - 3 * HOUR) }, 'Case study body.')
  const d = deps(now)
  const out = await runDueSchedules(d.run)
  assert.deepEqual(out.actions.map((a) => [a.collection, a.slug, a.outcome]), [['work', 'missed-slot', 'published']])
  assert.ok(out.actions[0].lateMs >= 3 * HOUR - 1000)
  assert.match(d.recorded[0].summary, /^Published case study “Missed slot” on schedule — caught up 3 h late \(due /)
})

test('a whole window missed while the site was down is not published; a body that no longer renders is not published', async () => {
  const { putItem, getItem } = await import('../lib/contentStore')
  const { runDueSchedules } = await import('../lib/schedule/run')
  const now = Date.now()
  await putItem('blog', 'missed-window', { title: 'Missed window', date: '2026-05-01', draft: true, publishAt: iso(now - 5 * HOUR), unpublishAt: iso(now - HOUR) }, 'x')
  await putItem('blog', 'broken-body', { title: 'Broken', date: '2026-05-01', draft: true, publishAt: iso(now - 1000) }, 'Text <Broken attr="x"\n')
  const { mdxProblem } = await import('../lib/mdx-admin')
  const d = deps(now, async (body) => {
    const p = await mdxProblem(body)
    return p ? { error: p.error } : null
  })
  const out = await runDueSchedules(d.run)
  const byslug = Object.fromEntries(out.actions.map((a) => [a.slug, a.outcome]))
  assert.equal(byslug['missed-window'], 'missed')
  assert.equal(byslug['broken-body'], 'invalid')
  for (const slug of ['missed-window', 'broken-body']) {
    const item = getItem('blog', slug)
    assert.equal(item?.frontmatter.draft, true, `${slug} stays a draft`)
    assert.equal(item?.frontmatter.publishAt, undefined, `${slug}: its time is cleared, so it is not retried forever`)
  }
  assert.deepEqual(d.refreshed, [])
  assert.ok(d.recorded.some((r) => r.action === 'post.schedule-missed' && /whole window/.test(r.summary)))
  assert.ok(d.recorded.some((r) => r.action === 'post.schedule-failed' && /does not render/.test(r.summary)))
})

test('scheduled changes to a live post publish exactly the stored revision, marked updated, and keep the window end', async () => {
  const { runDueSchedules } = await import('../lib/schedule/run')
  const { getPendingRevision, putPendingRevision } = await import('../lib/pendingRevisions')
  const { getItem } = await import('../lib/contentStore')
  await create(posts, 'live-changes', { title: 'Live changes' }, 'Published words.')
  const live = await one(posts, 'live-changes')
  const pend = await h.call(posts, {
    method: 'PUT',
    body: { slug: 'live-changes', frontmatter: { ...live.body.frontmatter, title: 'Live changes, v2' }, body: 'Revised words.', target: 'pending' },
    headers: { 'if-match': live.headers.etag },
  })
  assert.equal(pend.statusCode, 200)
  const at = Date.now() + HOUR
  const end = at + 10 * 24 * HOUR
  const s = await schedule(posts, 'live-changes', { publishAt: iso(at), unpublishAt: iso(end), markUpdated: true }, pend.body.etag)
  assert.equal(s.statusCode, 200, JSON.stringify(s.body))
  assert.deepEqual(s.body.schedule, { publishAt: at, unpublishAt: end, publishes: 'changes' })
  assert.equal(s.body.pending.baseUpdatedAt, s.body.updatedAt, 'the revision was rebased onto the new live version: not "changed underneath"')
  assert.equal(getItem('blog', 'live-changes')?.frontmatter.unpublishAt, iso(end), 'the unpublish lives on the item')
  assert.equal(getPendingRevision('blog', 'live-changes')?.frontmatter.publishAt, iso(at), 'the publish time lives on the revision')

  // A later pending save keeps the publish time (the schedule follows the revision).
  const cur = await one(posts, 'live-changes')
  const v3 = await h.call(posts, {
    method: 'PUT',
    body: { slug: 'live-changes', frontmatter: { ...cur.body.pending.frontmatter, title: 'Live changes, v3' }, body: 'Revised words, v3.', target: 'pending' },
    headers: { 'if-match': cur.headers.etag },
  })
  assert.equal(v3.statusCode, 200)
  assert.equal(getPendingRevision('blog', 'live-changes')?.frontmatter.publishAt, iso(at))

  // The owner saves again WHILE the pass checks the body: the pass checks
  // and publishes that newer revision — exactly the one stored — never a mix.
  let calls = 0
  const d = deps(at + 1000, async () => {
    calls++
    if (calls === 1) {
      const rev = getPendingRevision('blog', 'live-changes')!
      putPendingRevision('blog', 'live-changes', { ...rev.frontmatter, title: 'Live changes, v4' }, 'Revised words, v4.', rev.baseUpdatedAt)
    }
    return null
  })
  const out = await runDueSchedules(d.run)
  assert.deepEqual(out.actions.map((a) => [a.slug, a.outcome]), [['live-changes', 'published-changes']])
  assert.equal(calls, 2, 'the newer revision was checked too')
  const after = getItem('blog', 'live-changes')!
  assert.equal(after.frontmatter.title, 'Live changes, v4')
  assert.equal(after.body, 'Revised words, v4.')
  assert.equal(after.frontmatter.updated, (await import('../lib/schedule/time')).zonedDay(at), 'marked as updated on the day')
  assert.equal(after.frontmatter.unpublishAt, iso(end), 'the window end carried over')
  assert.equal(after.frontmatter.publishAt, undefined)
  assert.equal(getPendingRevision('blog', 'live-changes'), null, 'the revision is gone')
  assert.match(d.recorded[0].summary, /^Published the scheduled changes to post “Live changes” \(marked as updated\)/)
  assert.equal(d.recorded[0].action, 'post.publish-changes')

  // Then the window ends: back to draft, on time.
  const u = deps(end + 10)
  const gone = await runDueSchedules(u.run)
  assert.deepEqual(gone.actions.map((a) => [a.slug, a.outcome]), [['live-changes', 'unpublished']])
  assert.equal(getItem('blog', 'live-changes')?.frontmatter.draft, true)
  assert.equal(getItem('blog', 'live-changes')?.frontmatter.unpublishAt, undefined)
  const { getPost } = await import('../lib/mdx')
  assert.equal(await getPost('live-changes'), null, 'off the public site')
  assert.equal(u.recorded[0].action, 'post.unpublish')
})

test('a revision that keeps changing is left for the next pass; the publish only drops the version it published', async () => {
  const { runDueSchedules } = await import('../lib/schedule/run')
  const { getPendingRevision, putPendingRevision, deletePendingRevisionVersion } = await import('../lib/pendingRevisions')
  const { putItem, getItem } = await import('../lib/contentStore')
  await putItem('blog', 'restless', { title: 'Restless', date: '2026-05-01' }, 'Live.')
  const base = Math.trunc(getItem('blog', 'restless')!.updated_at)
  putPendingRevision('blog', 'restless', { title: 'Restless v2', date: '2026-05-01', publishAt: iso(Date.now() - 1000) }, 'v2', base)
  const d = deps(Date.now(), async () => {
    const rev = getPendingRevision('blog', 'restless')!
    putPendingRevision('blog', 'restless', rev.frontmatter, `${rev.body}+`, rev.baseUpdatedAt)
    return null
  })
  const out = await runDueSchedules(d.run)
  assert.deepEqual(out.actions, [], 'nothing published while it would not hold still')
  assert.equal(getItem('blog', 'restless')?.body, 'Live.')
  assert.ok(getPendingRevision('blog', 'restless')?.frontmatter.publishAt, 'still scheduled')

  const rev = getPendingRevision('blog', 'restless')!
  assert.equal(deletePendingRevisionVersion('blog', 'restless', rev.updatedAt - 1), false, 'another version stays')
  assert.equal(deletePendingRevisionVersion('blog', 'restless', rev.updatedAt), true)
})

test('changes scheduled for an item that is no longer live are kept as its draft, unscheduled, and logged', async () => {
  const { runDueSchedules } = await import('../lib/schedule/run')
  const { putPendingRevision, getPendingRevision } = await import('../lib/pendingRevisions')
  const { putItem, getItem } = await import('../lib/contentStore')
  const later = Date.now() + 5 * HOUR
  await putItem('work', 'went-draft', { title: 'Went draft', draft: true, publishAt: iso(later) }, 'Draft body.')
  putPendingRevision('work', 'went-draft', { title: 'Went draft v2', publishAt: iso(Date.now() - 5000) }, 'v2', 1)
  const d = deps(Date.now())
  const out = await runDueSchedules(d.run)
  assert.deepEqual(out.actions.map((a) => [a.slug, a.outcome]), [['went-draft', 'not-live']])
  assert.equal(getPendingRevision('work', 'went-draft'), null, 'a draft never holds a pending revision')
  const row = getItem('work', 'went-draft')
  assert.equal(row?.body, 'v2', 'the changes are kept — as the draft')
  assert.equal(row?.frontmatter.title, 'Went draft v2')
  assert.equal(row?.frontmatter.draft, true)
  assert.equal(row?.frontmatter.publishAt, iso(later), "the draft's own schedule stays")
  assert.equal(d.recorded[0].action, 'work.schedule-skipped')
  assert.match(d.recorded[0].summary, /kept as its draft/)
  assert.equal(d.recorded[0].snapshots, 1, 'the draft it replaced is in the history')
})

test('CORR-2: scheduled changes and the unpublish both overdue in one pass — the item still comes down, nothing is lost silently', async () => {
  const { runDueSchedules } = await import('../lib/schedule/run')
  const { scheduledEntries } = await import('../lib/schedule/store')
  const { getPendingRevision } = await import('../lib/pendingRevisions')
  const { getItem } = await import('../lib/contentStore')
  await create(posts, 'both-due', { title: 'Both due' }, 'Live words.')
  const live = await one(posts, 'both-due')
  const pend = await h.call(posts, {
    method: 'PUT',
    body: { slug: 'both-due', frontmatter: { ...live.body.frontmatter, title: 'Both due v2' }, body: 'Changed words.', target: 'pending' },
    headers: { 'if-match': live.headers.etag },
  })
  assert.equal(pend.statusCode, 200)
  const at = Date.now() + HOUR
  const end = at + 2 * 60_000
  const s = await schedule(posts, 'both-due', { publishAt: iso(at), unpublishAt: iso(end) }, pend.body.etag)
  assert.equal(s.statusCode, 200, JSON.stringify(s.body))

  // The server was down across both times: one pass sees both.
  const d = deps(end + 30_000)
  const out = await runDueSchedules(d.run)
  assert.deepEqual(
    out.actions.map((a) => [a.slug, a.kind, a.outcome]),
    [
      ['both-due', 'publish-changes', 'missed'],
      ['both-due', 'unpublish', 'unpublished'],
    ],
  )
  const row = getItem('blog', 'both-due')!
  assert.equal(row.frontmatter.draft, true, 'off the public site, as scheduled')
  assert.equal(row.body, 'Changed words.', 'the changes are kept, as the draft')
  assert.equal(row.frontmatter.unpublishAt, undefined)
  assert.equal(getPendingRevision('blog', 'both-due'), null)
  assert.deepEqual(scheduledEntries().filter((e) => e.slug === 'both-due'), [])
  assert.deepEqual(d.recorded.map((r) => r.action), ['post.schedule-missed', 'post.unpublish'])
  assert.match(d.recorded[0].summary, /Did not publish the scheduled changes to post “Both due” .* unpublish time .* passed too/)
  const { getPost } = await import('../lib/mdx')
  assert.equal(await getPost('both-due'), null)
  assert.deepEqual((await runDueSchedules(deps(end + HOUR).run)).actions, [], 'nothing left to do')
})

test('CORR-2: a live save after the unpublish time keeps it, so the next pass still takes the item down', async () => {
  const { runDueSchedules } = await import('../lib/schedule/run')
  const { getItem, putItem } = await import('../lib/contentStore')
  const end = Date.now() - 5000
  await putItem('blog', 'save-late', { title: 'Save late', date: '2026-05-01', unpublishAt: iso(end) }, 'Live.')
  const cur = await one(posts, 'save-late')
  const saved = await h.call(posts, {
    method: 'PUT',
    body: { slug: 'save-late', frontmatter: { ...cur.body.frontmatter, title: 'Save late (edited)' }, body: 'Live, edited.' },
    headers: { 'if-match': cur.headers.etag },
  })
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body))
  assert.equal(getItem('blog', 'save-late')?.frontmatter.unpublishAt, iso(end), 'the overdue end is not dropped by the save')
  const d = deps(Date.now())
  const out = await runDueSchedules(d.run)
  assert.deepEqual(out.actions.map((a) => [a.slug, a.outcome]), [['save-late', 'unpublished']])
  assert.equal(getItem('blog', 'save-late')?.frontmatter.draft, true)
})

test('CORR-3: a scheduled unpublish folds unpublished changes into the draft, so a later scheduled publish shows what the editor showed', async () => {
  const { runDueSchedules } = await import('../lib/schedule/run')
  const { getPendingRevision } = await import('../lib/pendingRevisions')
  const { getItem } = await import('../lib/contentStore')
  await create(posts, 'fold-in', { title: 'Fold in' }, 'Old public words.')
  const live = await one(posts, 'fold-in')
  const pend = await h.call(posts, {
    method: 'PUT',
    body: { slug: 'fold-in', frontmatter: { ...live.body.frontmatter, title: 'Fold in v2' }, body: 'NEWER-PENDING-MARKER words.', target: 'pending' },
    headers: { 'if-match': live.headers.etag },
  })
  assert.equal(pend.statusCode, 200)
  const end = Date.now() + HOUR
  const s = await schedule(posts, 'fold-in', { unpublishAt: iso(end) }, pend.body.etag)
  assert.equal(s.statusCode, 200, JSON.stringify(s.body))

  const d = deps(end + 1000)
  const out = await runDueSchedules(d.run)
  assert.deepEqual(out.actions.map((a) => [a.slug, a.outcome]), [['fold-in', 'unpublished']])
  assert.match(d.recorded[0].summary, /its unpublished changes are now the draft/)
  assert.equal(d.recorded[0].snapshots, 1, 'the formerly live version is in the history')
  const editor = await one(posts, 'fold-in')
  assert.equal(editor.body.frontmatter.draft, true)
  assert.equal(editor.body.pending, null, 'a draft never holds a pending revision')
  assert.equal(editor.body.body, 'NEWER-PENDING-MARKER words.', 'the draft is what the editor showed')
  assert.equal(getPendingRevision('blog', 'fold-in'), null)

  // Scheduling the draft without editing it publishes exactly that.
  const at = Date.now() + 2 * HOUR
  const again = await schedule(posts, 'fold-in', { publishAt: iso(at) }, editor.headers.etag)
  assert.equal(again.statusCode, 200, JSON.stringify(again.body))
  const p = deps(at + 1000)
  assert.deepEqual((await runDueSchedules(p.run)).actions.map((a) => [a.slug, a.outcome]), [['fold-in', 'published']])
  const after = getItem('blog', 'fold-in')!
  assert.equal(after.frontmatter.draft, undefined)
  assert.equal(after.body, 'NEWER-PENDING-MARKER words.')
  assert.equal(after.frontmatter.title, 'Fold in v2')
})

test('one pass at a time; the internal job answers 404 to outsiders, 409 while busy, and logs as the scheduler', async () => {
  const { runDueSchedules, ScheduleBusyError } = await import('../lib/schedule/run')
  const route = (await import('../pages/api/internal/scheduled-publish')).default as Handler
  const { internalJobToken, INTERNAL_TOKEN_HEADER } = await import('../lib/internalJobs')
  const g = globalThis as { __schedulePublishRunning?: boolean }

  g.__schedulePublishRunning = true
  await assert.rejects(() => runDueSchedules(deps(Date.now()).run), ScheduleBusyError)
  const busy = await h.call(route, { method: 'POST', auth: false, ip: '127.0.0.1', headers: { [INTERNAL_TOKEN_HEADER]: internalJobToken() } })
  assert.equal(busy.statusCode, 409)
  g.__schedulePublishRunning = false

  // Outsiders: wrong peer, wrong token, a signed-in admin — all 404.
  assert.equal((await h.call(route, { method: 'POST', auth: false, ip: '203.0.113.9', headers: { [INTERNAL_TOKEN_HEADER]: internalJobToken() } })).statusCode, 404)
  assert.equal((await h.call(route, { method: 'POST', auth: false, ip: '127.0.0.1', headers: { [INTERNAL_TOKEN_HEADER]: 'x'.repeat(64) } })).statusCode, 404)
  assert.equal((await h.call(route, { method: 'POST', ip: '127.0.0.1' })).statusCode, 404)

  const { putItem } = await import('../lib/contentStore')
  await putItem('blog', 'job-draft', { title: 'Job draft', date: '2026-05-01', draft: true, publishAt: iso(Date.now() - 1000) }, 'Ready.')
  const ran = await h.call(route, { method: 'POST', auth: false, ip: '127.0.0.1', headers: { [INTERNAL_TOKEN_HEADER]: internalJobToken() } })
  assert.equal(ran.statusCode, 200, JSON.stringify(ran.body))
  assert.deepEqual(ran.body.actions.map((a: any) => [a.slug, a.outcome]), [['job-draft', 'published']])
  for (const p of ['/blog', '/blog/job-draft', '/', '/cv', '/cv/zh']) assert.ok(ran.revalidated.includes(p), `${p} regenerated`)
  const { listAudit } = await import('../lib/audit/store')
  const entry = listAudit({ q: 'job-draft' }).entries[0]
  assert.equal(entry.summary, 'Published post “Job draft” on schedule')
  assert.equal(entry.device, 'Scheduler')
  assert.equal(entry.ipPrefix, 'loopback')
  assert.equal(entry.sessionId, null)
  assert.equal(entry.route, 'internal/scheduled-publish')
})

test('nobody outside the server can write a scheduler entry; scheduled-publishing actions describe themselves', async () => {
  const { recordAdminAudit } = await import('../lib/audit/record')
  const res = { getHeader: () => undefined, setHeader: () => undefined }
  const req = { method: 'POST', url: '/api/admin/whatever', headers: {}, cookies: {}, socket: { remoteAddress: '127.0.0.1' } }
  assert.equal(recordAdminAudit(req as any, res as any, { action: 'post.publish', area: 'post', summary: 'Forged' }, { actor: 'scheduler' }), false)
  const { describeAdminWrite } = await import('../lib/audit/describe')
  const T = Date.UTC(2026, 9, 25, 1, 0)
  const d = (body: Record<string, unknown>, existingDraft: boolean | null) => describeAdminWrite('admin/work', { method: 'POST', query: {}, body: { action: 'schedule', slug: 'swcs', ...body } }, { existingDraft })
  assert.equal(d({ publishAt: iso(T) }, true)?.summary, 'Scheduled case study “swcs” to publish Sun 25 Oct 2026, 09:00 HKT')
  assert.equal(d({ publishAt: iso(T) }, false)?.summary, 'Scheduled case study “swcs” its changes to go live Sun 25 Oct 2026, 09:00 HKT')
  assert.equal(d({ unpublishAt: iso(T) }, false)?.summary, 'Scheduled case study “swcs” to unpublish Sun 25 Oct 2026, 09:00 HKT')
  assert.equal(d({ publishAt: null, unpublishAt: null }, true)?.action, 'work.unschedule')
  assert.equal(describeAdminWrite('admin/work', { method: 'POST', query: {}, body: { action: 'rename', slug: 'swcs' } }), null)
})

test('case studies: a live item without changes can only unpublish later; discarding scheduled changes drops their time', async () => {
  await create(work, 'cs-live', { title: 'Live case study' })
  const live = await one(work, 'cs-live')
  const at = Date.now() + 5 * HOUR
  const nothing = await schedule(work, 'cs-live', { publishAt: iso(at) }, live.headers.etag)
  assert.equal(nothing.statusCode, 409)
  assert.equal(nothing.body.code, 'NOTHING_TO_PUBLISH')
  const off = await schedule(work, 'cs-live', { unpublishAt: iso(at) }, live.headers.etag)
  assert.equal(off.statusCode, 200)
  assert.deepEqual(off.body.schedule, { publishAt: null, unpublishAt: at, publishes: null })
  const { getWork } = await import('../lib/mdx')
  assert.equal(((await getWork('cs-live'))?.frontmatter as Record<string, unknown>).unpublishAt, undefined, 'never in public page data')

  const pend = await h.call(work, {
    method: 'PUT',
    body: { slug: 'cs-live', frontmatter: { ...off.body.frontmatter, title: 'Live case study v2' }, body: 'v2', target: 'pending' },
    headers: { 'if-match': off.body.etag },
  })
  const s = await schedule(work, 'cs-live', { publishAt: iso(at - HOUR), unpublishAt: iso(at) }, pend.body.etag)
  assert.equal(s.statusCode, 200, JSON.stringify(s.body))
  const discard = await h.call(work, { method: 'POST', body: { action: 'discard-pending', slug: 'cs-live' }, headers: { 'if-match': s.body.etag } })
  assert.equal(discard.statusCode, 200)
  assert.deepEqual((await one(work, 'cs-live')).body.schedule, { publishAt: null, unpublishAt: at, publishes: null })

  // Clearing everything.
  const cur = await one(work, 'cs-live')
  const cleared = await schedule(work, 'cs-live', { publishAt: null, unpublishAt: null }, cur.headers.etag)
  assert.equal(cleared.statusCode, 200)
  assert.deepEqual(cleared.body.schedule, { publishAt: null, unpublishAt: null, publishes: null })
})

test('what is scheduled, soonest first, for the overview and the scheduler', async () => {
  const { scheduledEntries, nextScheduledAt } = await import('../lib/schedule/store')
  const { putItem } = await import('../lib/contentStore')
  const now = Date.now()
  await putItem('blog', 'list-a', { title: 'List A', date: '2026-05-01', draft: true, publishAt: iso(now + 9 * HOUR) }, 'a')
  await putItem('blog', 'list-b', { title: 'List B', date: '2026-05-01', unpublishAt: iso(now + 8 * HOUR) }, 'b')
  // A row whose JSON is broken never breaks the list.
  const { getDb } = await import('../lib/db')
  getDb().prepare("INSERT INTO collection_items (collection, slug, frontmatter, body, updated_at) VALUES ('blog', 'broken-json', '{\"publishAt\": ', '', 1)").run()
  const mine = scheduledEntries().filter((e) => e.slug.startsWith('list-'))
  assert.deepEqual(mine.map((e) => [e.slug, e.kind]), [['list-b', 'unpublish'], ['list-a', 'publish']])
  assert.ok(typeof nextScheduledAt() === 'number')
  getDb().prepare("DELETE FROM collection_items WHERE slug = 'broken-json'").run()
})
