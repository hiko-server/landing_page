/**
 * H5 — review links: signed, expiring (1 h – 30 days), revocable links that
 * show one draft — or a live item's unpublished changes — read-only.
 * Tokens are HMAC-signed over the link's scope and stored only as hashes in
 * auth.db (migration 3: never restored from a content backup). Through the
 * real admin API on a throw-away store, plus what /review/<token> answers
 * (lib/review/page), the response headers and the error scrubbing.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { editorialHarness, type Handler } from './editorialHarness'

const h = editorialHarness('review-links', 'review-links-secret-0123456789abcdef')
let posts: Handler
let links: Handler

before(async () => {
  await h.setup()
  posts = (await import('../pages/api/admin/posts')).default
  links = (await import('../pages/api/admin/review-links')).default
})
after(async () => {
  const { closeAuditDb } = await import('../lib/audit/db')
  closeAuditDb()
  h.teardown()
})

const HOUR = 3_600_000
const tokenOf = (path: string) => path.replace(/^\/review\//, '')

async function draft(slug: string, title = 'A draft for review') {
  const out = await h.call(posts, { method: 'PUT', body: { slug, frontmatter: { title, date: '2026-05-01', draft: true }, body: 'Words to review.', create: true } })
  assert.equal(out.statusCode, 200, JSON.stringify(out.body))
}

let client = 0
/** Each call from its own address, to stay under the per-client write limit. */
async function share(slug: string, ttlHours: unknown = 168, label?: string, collection = 'blog') {
  return h.call(links, { method: 'POST', body: { collection, slug, ttlHours, label }, ip: `127.0.1.${++client % 250}` })
}

test('tokens: signed over the link’s scope with a key of their own; any change breaks them', async () => {
  const { reviewLinkKey, tokenFor, verifyToken, newLinkId, TOKEN_RE, tokenHash } = await import('../lib/review/token')
  const key = reviewLinkKey()!
  assert.ok(key && key.length === 32)
  assert.equal(reviewLinkKey(''), null)
  assert.equal(reviewLinkKey('change-me'), null)
  const { ogSigningKey } = await import('../lib/og/sign')
  assert.notDeepEqual(key, ogSigningKey(), 'not the social-card key')
  const scope = { id: newLinkId(), collection: 'blog' as const, slug: 'x', variant: 'draft' as const, expiresAt: Date.now() + HOUR }
  const token = tokenFor(scope, key)
  assert.match(token, TOKEN_RE)
  assert.ok(verifyToken(token, scope, key))
  for (const changed of [{ slug: 'y' }, { variant: 'changes' as const }, { expiresAt: scope.expiresAt + 1 }, { collection: 'work' as const }]) {
    assert.equal(verifyToken(token, { ...scope, ...changed }, key), false, JSON.stringify(changed))
  }
  assert.equal(verifyToken(token, scope, Buffer.alloc(32, 1)), false, 'another key')
  assert.equal(verifyToken(`${token}x`, scope, key), false)
  assert.equal(tokenHash(token), crypto.createHash('sha256').update(token).digest('hex'))
})

test('a draft is shared: the link is stored hashed, resolves, counts views — and the admin can copy it again', async () => {
  await draft('review-me')
  const out = await share('review-me', 72, '  For   the committee\n')
  assert.equal(out.statusCode, 201, JSON.stringify(out.body))
  const link = out.body.link
  assert.equal(link.variant, 'draft')
  assert.equal(link.status, 'active')
  assert.equal(link.label, 'For the committee')
  assert.equal(link.title, 'A draft for review')
  assert.match(link.path, /^\/review\/[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{32}$/)
  assert.ok(Math.abs(link.expiresAt - (Date.now() + 72 * HOUR)) < 5000)
  const token = tokenOf(link.path)

  // Never stored as such: only its hash.
  const { getAuthDb } = await import('../lib/adminAuth/db')
  const row = getAuthDb().prepare('SELECT * FROM review_links WHERE id = ?').get(link.id) as Record<string, unknown>
  assert.equal(row.token_hash, crypto.createHash('sha256').update(token).digest('hex'))
  assert.ok(!Object.values(row).some((v) => typeof v === 'string' && v.includes(token.split('.')[1])), 'the signature is nowhere in the row')

  const { resolveReviewToken, recordReviewView } = await import('../lib/review/store')
  const ok = resolveReviewToken(token)
  assert.equal(ok.status, 'ok')
  recordReviewView(link.id)
  recordReviewView(link.id)

  const listed = await h.call(links, { query: { collection: 'blog', slug: 'review-me' } })
  assert.equal(listed.statusCode, 200)
  assert.deepEqual(listed.body.shareable, { variant: 'draft' })
  const again = listed.body.links.find((l: any) => l.id === link.id)
  assert.equal(again.path, link.path, 'the same link, derived again')
  assert.equal(again.viewCount, 2)
  assert.ok(again.lastViewedAt > 0)

  const all = await h.call(links)
  assert.ok(all.body.links.some((l: any) => l.id === link.id && l.currentSlug === 'review-me'))

  const { listAudit } = await import('../lib/audit/store')
  const entry = listAudit({ q: 'review-me' }).entries.find((e) => e.action === 'post.review-link')
  assert.ok(entry)
  assert.match(entry!.summary, /^Shared the draft post “review-me” for review until .+ HKT$/)
  assert.doesNotMatch(entry!.summary, /committee/, 'the owner’s note is not logged')
})

test('forged, altered, expired and revoked links do not open; failed look-ups are limited', async () => {
  const { resolveReviewToken } = await import('../lib/review/store')
  const { getAuthDb } = await import('../lib/adminAuth/db')
  await draft('secret-draft', 'Secret draft')
  const made = (await share('secret-draft', 1)).body.link
  const token = tokenOf(made.path)

  assert.equal(resolveReviewToken('nope').status, 'unknown')
  assert.equal(resolveReviewToken(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`).status, 'unknown')
  assert.equal(resolveReviewToken(token, made.expiresAt + 1).status, 'expired')

  // A row pointed at another draft no longer verifies (the signature covers the scope).
  getAuthDb().prepare("UPDATE review_links SET slug = 'review-me' WHERE id = ?").run(made.id)
  assert.equal(resolveReviewToken(token).status, 'unknown')
  getAuthDb().prepare("UPDATE review_links SET slug = 'secret-draft' WHERE id = ?").run(made.id)
  assert.equal(resolveReviewToken(token).status, 'ok')

  const off = await h.call(links, { method: 'DELETE', body: { id: made.id } })
  assert.equal(off.statusCode, 200)
  assert.equal(off.body.link.status, 'revoked')
  assert.equal(off.body.link.path, null, 'an ended link is not offered for copying')
  assert.equal(resolveReviewToken(token).status, 'revoked')
  assert.equal((await h.call(links, { method: 'DELETE', body: { id: made.id } })).statusCode, 200, 'idempotent')

  const { decideReview } = await import('../lib/review/page')
  const revoked = decideReview(token, { allowMiss: () => true })
  assert.equal(revoked.kind, 'unavailable')
  if (revoked.kind === 'unavailable') {
    assert.equal(revoked.status, 410)
    assert.equal(revoked.text.title, 'This review link was turned off')
    assert.doesNotMatch(JSON.stringify(revoked), /Secret draft|secret-draft/, 'says nothing about the draft')
  }
  const zh = decideReview('x'.repeat(10), { allowMiss: () => true, acceptLanguage: 'zh-TW,zh;q=0.9,en;q=0.5' })
  assert.ok(zh.kind === 'unavailable' && zh.status === 404 && zh.text.lang === 'zh-Hant' && zh.text.title === '此審閱連結無效')
  const limited = decideReview('x'.repeat(10), { allowMiss: () => false })
  assert.ok(limited.kind === 'unavailable' && limited.status === 429)

  // Expired: says when, in the reader's language.
  await draft('short-lived')
  const short = (await share('short-lived', 1)).body.link
  const expired = decideReview(tokenOf(short.path), { allowMiss: () => true, now: short.expiresAt + 1, acceptLanguage: 'en-GB' })
  assert.ok(expired.kind === 'unavailable' && expired.status === 410 && /stopped working on .+ HKT\./.test(expired.text.body))
})

test('what a link shows follows the item: its draft, then the public page once published; changes of a live item; gone when deleted', async () => {
  const { decideReview, reviewChromeText } = await import('../lib/review/page')
  await draft('lifecycle', 'Lifecycle')
  const link = (await share('lifecycle')).body.link
  const token = tokenOf(link.path)
  const first = decideReview(token, { allowMiss: () => true })
  assert.deepEqual(first.kind === 'render' && [first.collection, first.slug, first.variant], ['blog', 'lifecycle', 'draft'])
  assert.deepEqual(reviewChromeText(link, 'draft', 'en').word, 'Preview')
  assert.equal(reviewChromeText(link, 'changes', 'zh-Hans').word, '预览')
  assert.match(reviewChromeText(link, 'draft', 'zh-Hans').expires, /^链接将于 \d{4}年\d+月\d+日 \d{2}:\d{2}（香港时间）失效$/)

  // Published: the link leads to the public page.
  const cur = await h.call(posts, { query: { slug: 'lifecycle' } })
  await h.call(posts, { method: 'PUT', body: { slug: 'lifecycle', frontmatter: { ...cur.body.frontmatter, draft: false }, body: cur.body.body }, headers: { 'if-match': cur.headers.etag } })
  assert.deepEqual(decideReview(token, { allowMiss: () => true }), { kind: 'redirect', destination: '/blog/lifecycle' })

  // A live item without changes has nothing to share; with saved changes it shares them.
  const nothing = await share('lifecycle')
  assert.equal(nothing.statusCode, 409)
  assert.equal(nothing.body.code, 'NOTHING_TO_SHARE')
  const live = await h.call(posts, { query: { slug: 'lifecycle' } })
  await h.call(posts, { method: 'PUT', body: { slug: 'lifecycle', frontmatter: { ...live.body.frontmatter, title: 'Lifecycle v2' }, body: 'v2', target: 'pending' }, headers: { 'if-match': live.headers.etag } })
  const changes = (await share('lifecycle')).body.link
  assert.equal(changes.variant, 'changes')
  const c = decideReview(tokenOf(changes.path), { allowMiss: () => true })
  assert.deepEqual(c.kind === 'render' && [c.slug, c.variant], ['lifecycle', 'changes'])

  // Renamed: the link follows the item to its new address.
  const { renameSlug } = await import('../lib/slugRename')
  const moved = await renameSlug({ collection: 'blog', from: 'lifecycle', to: 'life-cycle', redirect: true })
  assert.equal(moved.ok, true)
  const after = decideReview(tokenOf(changes.path), { allowMiss: () => true })
  assert.deepEqual(after.kind === 'render' && [after.slug, after.variant], ['life-cycle', 'changes'])
  const listed = await h.call(links, { query: { collection: 'blog', slug: 'life-cycle' } })
  assert.ok(listed.body.links.some((l: any) => l.id === changes.id), 'listed under the new slug too')

  // Deleted: gone.
  await h.call(posts, { method: 'DELETE', query: { slug: 'life-cycle' } })
  const gone = decideReview(tokenOf(changes.path), { allowMiss: () => true })
  assert.ok(gone.kind === 'unavailable' && gone.status === 410)
})

test('lifetimes 1 h – 30 days only; at most 20 active links per item; turning all off at once; old ones are pruned', async () => {
  await draft('limits')
  for (const bad of [0, 0.5, 721, 'week', null]) {
    const out = await share('limits', bad)
    assert.equal(out.statusCode, 400, String(bad))
    assert.equal(out.body.code, 'BAD_TTL')
  }
  assert.equal((await share('limits', 720)).statusCode, 201)
  assert.equal((await share('limits', 1)).statusCode, 201)
  assert.equal((await share('missing-item')).statusCode, 404)
  assert.equal((await h.call(links, { method: 'POST', body: { collection: 'pages', slug: 'limits', ttlHours: 1 } })).statusCode, 400)
  for (let i = 0; i < 18; i++) assert.equal((await share('limits', 24)).statusCode, 201)
  const tooMany = await share('limits', 24)
  assert.equal(tooMany.statusCode, 409)
  assert.equal(tooMany.body.code, 'TOO_MANY')

  const off = await h.call(links, { method: 'DELETE', body: { collection: 'blog', slug: 'limits', all: true } })
  assert.equal(off.body.revoked, 20)
  assert.equal((await share('limits', 24)).statusCode, 201, 'room again')

  const { pruneReviewLinks, KEEP_INACTIVE_MS, listReviewLinks } = await import('../lib/review/store')
  assert.equal(pruneReviewLinks(Date.now()), 0, 'recently ended links stay listed')
  assert.ok(listReviewLinks({ collection: 'blog', slugs: ['limits'], includeInactive: true }).length >= 21)
  assert.ok(pruneReviewLinks(Date.now() + KEEP_INACTIVE_MS + 31 * 86_400_000) >= 21)
  assert.deepEqual(listReviewLinks({ collection: 'blog', slugs: ['limits'], includeInactive: true }), [], 'everything long ended goes')
})

test('auth.db migration 3 adds review_links on a v2 store, once', async () => {
  const Database = (await import('better-sqlite3')).default
  const { runMigrations, currentVersion } = await import('../scripts/db/migrate.mjs')
  const { AUTH_MIGRATIONS } = await import('../scripts/db/auth/index.mjs')
  const db = new Database(':memory:')
  try {
    runMigrations(db, AUTH_MIGRATIONS.slice(0, 2), { label: 'auth' })
    const report = runMigrations(db, AUTH_MIGRATIONS, { label: 'auth' })
    assert.deepEqual([report.from, report.to], [2, 3])
    assert.equal(currentVersion(db), 3)
    assert.equal(runMigrations(db, AUTH_MIGRATIONS, { label: 'auth' }).applied.length, 0)
    const cols = (db.prepare("SELECT name FROM pragma_table_info('review_links')").all() as Array<{ name: string }>).map((c) => c.name)
    assert.deepEqual(cols, ['id', 'token_hash', 'collection', 'slug', 'variant', 'label', 'created_at', 'expires_at', 'revoked_at', 'view_count', 'last_viewed_at'])
    assert.throws(() => db.prepare("INSERT INTO review_links (id, token_hash, collection, slug, variant, created_at, expires_at) VALUES ('a', 'h', 'pages', 's', 'draft', 1, 2)").run(), /CHECK/)
  } finally {
    db.close()
  }
})

test('review pages: private, uncached, unindexed headers on every answer; tokens never reach the error monitor', async () => {
  const { applySecurityHeaders, isReviewPath } = await import('../lib/security/responseHeaders')
  const res = applySecurityHeaders({ headers: new Headers() }, { pathname: '/review/abc.def', adminContext: false })
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer')
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive')
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store, max-age=0')
  assert.ok(isReviewPath('/_next/data/build-123/review/abc.def.json'))
  const pub = applySecurityHeaders({ headers: new Headers() }, { pathname: '/blog/x', adminContext: false })
  assert.equal(pub.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin')
  assert.equal(pub.headers.get('X-Robots-Tag'), null)

  const { scrubText, normalizeErrorPath } = await import('../lib/errors/scrub')
  const token = 'Ab3dEfGh1jKlMnOpQrStUv.wxYz0123456789abcdefGHIJKLMNOPQR'
  assert.equal(normalizeErrorPath(`https://lucian-dev.com/review/${token}?x=1`), '/review/[token]')
  assert.equal(normalizeErrorPath(`/review/${token}`), '/review/[token]')
  assert.equal(scrubText(`TypeError at https://lucian-dev.com/review/${token} (line 3)`), 'TypeError at https://lucian-dev.com/review/[token] (line 3)')
  const { normalizeTrackedPath } = await import('../lib/analytics/shared')
  assert.equal(normalizeTrackedPath(`/review/${token}`), null, 'analytics never record a review path')
})
