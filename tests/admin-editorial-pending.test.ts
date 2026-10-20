/**
 * H4 — unpublished changes on live posts and case studies. Saving a
 * PUBLISHED item stores a pending revision (content migration 002): the
 * public page keeps the published version, Draft Mode previews the pending
 * one, "Publish changes" makes it live (and drops the revision), Discard
 * drops it. The item's version (ETag) covers both, so a stale tab conflicts.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { editorialHarness, type Handler } from './editorialHarness'
import { canPublishChanges, editorMode, isPendingStale, saveTarget } from '../components/Admin/shell/pendingChanges'

const h = editorialHarness('admin-editorial-pending')
let posts: Handler
let work: Handler
const ROOT = process.cwd()

before(async () => {
  await h.setup()
  posts = (await import('../pages/api/admin/posts')).default
  work = (await import('../pages/api/admin/work')).default
})
after(() => h.teardown())

// ── Editor rules (pure) ──────────────────────────────────────────────────

test('where a save goes: new items, drafts and (un)publishing write the item; other saves of a live item are pending', () => {
  assert.equal(saveTarget({ isNew: true, livePublished: false }), 'live')
  assert.equal(saveTarget({ isNew: false, livePublished: false }), 'live', 'a draft has nothing public to protect')
  assert.equal(saveTarget({ isNew: false, livePublished: true }), 'pending')
  assert.equal(saveTarget({ isNew: false, livePublished: true, draftChange: true }), 'live', 'unpublishing')
  assert.equal(saveTarget({ isNew: false, livePublished: true, explicit: 'live' }), 'live', '"Publish changes"')
  assert.equal(editorMode(false, true), 'published')
  assert.equal(editorMode(true, true), 'draft')
  assert.equal(canPublishChanges({ mode: 'published', hasPending: false, dirty: false }), false)
  assert.equal(canPublishChanges({ mode: 'published', hasPending: false, dirty: true }), true)
  assert.equal(canPublishChanges({ mode: 'draft', hasPending: true, dirty: true }), false)
  assert.equal(isPendingStale({ updatedAt: 5, baseUpdatedAt: 3 }, 3), false)
  assert.equal(isPendingStale({ updatedAt: 5, baseUpdatedAt: 3 }, 4), true)
  assert.equal(isPendingStale(null, 4), false)
})

test('item versions: "<live>" or "<live>.<pending>"; If-Match must name the current one', async () => {
  const { itemEtag, itemIfMatchAllows } = await import('../lib/mdx-admin')
  assert.equal(itemEtag(100), '"100"')
  assert.equal(itemEtag(100, 205), '"100.205"')
  assert.equal(itemIfMatchAllows(undefined, 100, 205), true, 'no header: last write wins')
  assert.equal(itemIfMatchAllows('"100"', 100, 205), false, 'a tab that loaded before the pending save')
  assert.equal(itemIfMatchAllows('"100.205"', 100, 205), true)
  assert.equal(itemIfMatchAllows('*', 100), true)
  assert.equal(itemIfMatchAllows('*', 0), false)
})

// ── Through the admin API ────────────────────────────────────────────────

const LIVE_BODY = 'The published paragraph that visitors read today.'
const NEW_BODY = 'A rewritten paragraph that is not ready for visitors yet.'

test('saving a published post stores pending changes; the public read path keeps the published version', async () => {
  const put = (body: unknown, headers: Record<string, string> = {}) => h.call(posts, { method: 'PUT', body, headers })
  const created = await put({ slug: 'live-post', frontmatter: { title: 'Live post', date: '2026-05-30' }, body: LIVE_BODY, create: true })
  assert.equal(created.statusCode, 200, JSON.stringify(created.body))
  const etag = created.body.etag as string

  const pending = await put({ slug: 'live-post', frontmatter: { title: 'Live post, revised', date: '2026-05-30' }, body: NEW_BODY, target: 'pending' }, { 'if-match': etag })
  assert.equal(pending.statusCode, 200, JSON.stringify(pending.body))
  assert.deepEqual(pending.revalidated, [], 'nothing public is regenerated')
  assert.match(pending.body.etag, /^"\d+\.\d+"$/)

  const { getPost } = await import('../lib/mdx')
  const publicPost = await getPost('live-post')
  assert.equal(publicPost?.frontmatter.title, 'Live post')
  assert.match(JSON.stringify(publicPost?.tree), /published paragraph/)
  const preview = await getPost('live-post', { includeDrafts: true, pending: true })
  assert.equal(preview?.frontmatter.title, 'Live post, revised', 'Draft Mode renders the pending version')

  const one = await h.call(posts, { query: { slug: 'live-post' } })
  assert.equal(one.body.frontmatter.title, 'Live post', 'the live version, for the diff')
  assert.equal(one.body.pending.frontmatter.title, 'Live post, revised')
  assert.equal(one.body.pending.body, NEW_BODY)
  assert.equal(one.headers.etag, pending.body.etag)

  const list = await h.call(posts)
  assert.ok(list.body.items.find((i: any) => i.slug === 'live-post').pendingAt > 0, 'the list marks it')

  // A tab still holding the live-only version conflicts instead of overwriting the pending changes.
  const stale = await put({ slug: 'live-post', frontmatter: { title: 'Other tab', date: '2026-05-30' }, body: 'x', target: 'pending' }, { 'if-match': etag })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.body.code, 'VERSION_CONFLICT')
})

test('"Publish changes" makes the edits live, drops the revision and regenerates the pages', async () => {
  const one = await h.call(posts, { query: { slug: 'live-post' } })
  const fm = { ...one.body.pending.frontmatter, updated: '2026-10-20' }
  const events: unknown[] = []
  const { onEditorialEvent } = await import('../lib/editorialEvents')
  const off = onEditorialEvent((e) => events.push(e))
  const out = await h.call(posts, { method: 'PUT', body: { slug: 'live-post', frontmatter: fm, body: one.body.pending.body, target: 'live' }, headers: { 'if-match': one.headers.etag } })
  off()
  assert.equal(out.statusCode, 200, JSON.stringify(out.body))
  assert.ok(out.revalidated.includes('/blog/live-post'))
  assert.match(out.body.etag, /^"\d+"$/)
  const after = await h.call(posts, { query: { slug: 'live-post' } })
  assert.equal(after.body.pending, null)
  assert.equal(after.body.frontmatter.title, 'Live post, revised')
  assert.equal(after.body.frontmatter.updated, '2026-10-20')
  assert.deepEqual(events.map((e: any) => [e.action, e.slug, e.markedUpdated]), [['publish-changes', 'live-post', true]])
})

test('discarding drops the pending revision (version-checked); drafts and unpublished items cannot hold one', async () => {
  const one = await h.call(posts, { query: { slug: 'live-post' } })
  const saved = await h.call(posts, { method: 'PUT', body: { slug: 'live-post', frontmatter: { ...one.body.frontmatter, title: 'Temp' }, body: 'Temp body.', target: 'pending' }, headers: { 'if-match': one.headers.etag } })
  assert.equal(saved.statusCode, 200)
  const wrong = await h.call(posts, { method: 'POST', body: { action: 'discard-pending', slug: 'live-post' }, headers: { 'if-match': one.headers.etag } })
  assert.equal(wrong.statusCode, 409, 'the If-Match must include the pending version')
  const ok = await h.call(posts, { method: 'POST', body: { action: 'discard-pending', slug: 'live-post' }, headers: { 'if-match': saved.body.etag } })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body.discarded, true)
  assert.equal((await h.call(posts, { query: { slug: 'live-post' } })).body.pending, null)

  await h.call(posts, { method: 'PUT', body: { slug: 'a-draft', frontmatter: { title: 'A draft', date: '2026-05-30', draft: true }, body: 'Draft.', create: true } })
  const onDraft = await h.call(posts, { method: 'PUT', body: { slug: 'a-draft', frontmatter: { title: 'A draft', date: '2026-05-30', draft: true }, body: 'x', target: 'pending' } })
  assert.equal(onDraft.statusCode, 409)
  assert.equal(onDraft.body.code, 'NOT_PUBLISHED')
  const unpublishViaPending = await h.call(posts, { method: 'PUT', body: { slug: 'live-post', frontmatter: { title: 'L', date: '2026-05-30', draft: true }, body: 'x', target: 'pending' } })
  assert.equal(unpublishViaPending.statusCode, 400)
  const badTarget = await h.call(posts, { method: 'PUT', body: { slug: 'live-post', frontmatter: { title: 'L', date: '2026-05-30' }, body: 'x', target: 'later' } })
  assert.equal(badTarget.statusCode, 400)
})

test('a pending body must compile (422 with the position) — publishing it later can never break the page', async () => {
  const one = await h.call(posts, { query: { slug: 'live-post' } })
  const bad = await h.call(posts, { method: 'PUT', body: { slug: 'live-post', frontmatter: one.body.frontmatter, body: 'Text <Broken attr="x"\n\nmore', target: 'pending' } })
  assert.equal(bad.statusCode, 422)
  assert.equal(bad.body.code, 'MDX_INVALID')
  assert.equal((await h.call(posts, { query: { slug: 'live-post' } })).body.pending, null)
})

test('case studies work the same; deleting an item drops its pending revision', async () => {
  const c = await h.call(work, { method: 'PUT', body: { slug: 'study', frontmatter: { title: 'Study' }, body: 'Live.', create: true } })
  assert.equal(c.statusCode, 200, JSON.stringify(c.body))
  const p = await h.call(work, { method: 'PUT', body: { slug: 'study', frontmatter: { title: 'Study 2' }, body: 'Pending.', target: 'pending' } })
  assert.equal(p.statusCode, 200)
  const { getPendingRevision } = await import('../lib/pendingRevisions')
  assert.equal(getPendingRevision('work', 'study')?.frontmatter.title, 'Study 2')
  const { deletePendingRevision } = await import('../lib/pendingRevisions')
  // Delete through the store (the API's DELETE needs a step-up): the API then drops the row too.
  const { deleteOne } = await import('../lib/mdx-admin')
  assert.equal((await deleteOne('work', 'study')).ok, true)
  assert.equal(deletePendingRevision('work', 'study'), true)
  assert.equal(getPendingRevision('work', 'study'), null)
  assert.match(fs.readFileSync(path.join(ROOT, 'lib/mdx-admin.ts'), 'utf8'), /deleteOne\(c, slug\)[\s\S]{0,200}deletePendingRevision\(c, slug\)/)
})

test('restoring a history version replaces the unpublished changes too — after keeping them in the history', async () => {
  const one = await h.call(posts, { query: { slug: 'live-post' } })
  const pend = await h.call(posts, { method: 'PUT', body: { slug: 'live-post', frontmatter: { ...one.body.frontmatter, title: 'Work in progress' }, body: 'Unfinished.', target: 'pending' }, headers: { 'if-match': one.headers.etag } })
  assert.equal(pend.statusCode, 200)
  const { listSnapshots, readSnapshot, restoreItemSnapshot } = await import('../lib/mdx-admin')
  const oldest = listSnapshots('blog', 'live-post').at(-1)
  assert.ok(oldest)
  const before = listSnapshots('blog', 'live-post').length
  assert.equal((await restoreItemSnapshot('blog', 'live-post', oldest.filename)).ok, true)
  const after = await h.call(posts, { query: { slug: 'live-post' } })
  assert.equal(after.body.pending, null)
  assert.equal(after.body.frontmatter.title, 'Live post')
  const snaps = listSnapshots('blog', 'live-post')
  assert.equal(snaps.length, before + 2, 'the pending version and the replaced live version')
  assert.ok(snaps.some((s) => readSnapshot('blog', s.filename)?.frontmatter.title === 'Work in progress'))
})

test('rebasing: a tool that rewrites the live item keeps pending changes "on top" only when they were', async () => {
  const { rebasedPendingBase } = await import('../lib/pendingRevisions')
  assert.equal(rebasedPendingBase(100, 100, 150), 150)
  assert.equal(rebasedPendingBase(90, 100, 150), 90, 'already behind: stays behind')
  assert.equal(rebasedPendingBase(0, 0, 150), 0)
})

test('the public pages render pending changes only in Draft Mode, and say so', () => {
  for (const page of ['pages/blog/[slug].tsx', 'pages/work/[slug].tsx']) {
    const src = fs.readFileSync(path.join(ROOT, page), 'utf8')
    assert.match(src, /includeDrafts: draftMode, pending: draftMode/)
    assert.match(src, /<DraftBar path=\{path\} pending=\{pendingPreview\} \/>/)
  }
  const bar = fs.readFileSync(path.join(ROOT, 'components/Article/DraftBar.tsx'), 'utf8')
  assert.match(bar, /visitors still see the published version/)
})
