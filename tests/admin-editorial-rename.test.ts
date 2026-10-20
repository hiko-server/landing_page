/**
 * H6 — renaming a post or case study: the item moves (history and pending
 * changes with it), the old address answers a permanent redirect from
 * getStaticProps (the redirect table of content migration 002 — the edge
 * middleware has no file access), chains collapse to one hop, a live item
 * always wins, internal links are rewritten (bodies, frontmatter, pages,
 * CV, home; never inside code), and the old and new paths are regenerated.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { editorialHarness, type Handler } from './editorialHarness'
import { oldPathPattern, referenceSlug, rewriteBodyLinks, rewriteDocument, rewriteJsonLinks, rewriteText } from '../lib/linkRewrite'
import { renameSlugProblem } from '../components/Admin/shell/publishChecks'

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const h = editorialHarness('admin-editorial-rename')
let posts: Handler
let work: Handler

before(async () => {
  await h.setup()
  posts = (await import('../pages/api/admin/posts')).default
  work = (await import('../pages/api/admin/work')).default
})
after(() => h.teardown())

// ── Pure rules ───────────────────────────────────────────────────────────

test('following redirects: one lookup per hop, loops and over-long chains give up', async () => {
  const { followRedirects, MAX_REDIRECT_HOPS } = await import('../lib/redirects')
  const map: Record<string, string> = { a: 'b', b: 'c', x: 'y', y: 'x' }
  const next = (s: string) => map[s] ?? null
  assert.equal(followRedirects(next, 'a'), 'c')
  assert.equal(followRedirects(next, 'c'), null, 'no row: no redirect')
  assert.equal(followRedirects(next, 'x'), null, 'a hand-edited loop')
  const long = (s: string) => (Number(s) < 50 ? String(Number(s) + 1) : null)
  assert.equal(followRedirects(long, '0'), null, `more than ${MAX_REDIRECT_HOPS} hops`)
})

test('an old path matches only as a whole segment, also as an absolute site URL', () => {
  const hosts = ['lucian-dev.com']
  const re = oldPathPattern('blog', 'old', hosts)
  for (const hit of ['/blog/old', '(/blog/old#part)', '"/blog/old?x=1"', 'https://lucian-dev.com/blog/old', 'https://www.lucian-dev.com/blog/old/']) {
    re.lastIndex = 0
    assert.ok(re.test(hit), hit)
  }
  for (const miss of ['/blog/older', '/x/blog/old', 'https://example.com/blog/old', '/blog/old_v2']) {
    re.lastIndex = 0
    assert.ok(!re.test(miss), miss)
  }
  assert.deepEqual(rewriteText('See /blog/old and https://lucian-dev.com/blog/old.', 'blog', 'old', 'new', hosts), {
    value: 'See /blog/new and https://lucian-dev.com/blog/new.',
    count: 2,
  })
})

test('bodies: Markdown links, JSX attributes and bare paths are rewritten — code is literal', () => {
  const body = [
    'Read [the post](/blog/old) or <Link href="/blog/old#x">this</Link>.',
    'Inline `curl /blog/old` stays.',
    '```bash',
    'curl https://lucian-dev.com/blog/old',
    '```',
    '~~~',
    '/blog/old',
    '~~~',
    'Bare /blog/old/ too.',
  ].join('\n')
  const out = rewriteBodyLinks(body, 'blog', 'old', 'new', ['lucian-dev.com'])
  assert.equal(out.count, 3)
  assert.match(out.value, /\[the post\]\(\/blog\/new\)/)
  assert.match(out.value, /href="\/blog\/new#x"/)
  assert.match(out.value, /`curl \/blog\/old`/)
  assert.match(out.value, /curl https:\/\/lucian-dev\.com\/blog\/old\n```/)
  assert.match(out.value, /~~~\n\/blog\/old\n~~~/)
  assert.match(out.value, /Bare \/blog\/new\/ too\./)
  assert.equal(rewriteBodyLinks('nothing here', 'blog', 'old', 'new').count, 0)
})

test('JSON documents and frontmatter: paths anywhere, and case-study references in the form they were written', () => {
  const cv = { en: [{ projects: [{ caseStudy: '/work/old', link: 'https://lucian-dev.com/work/old' }, { caseStudy: 'old' }, { caseStudy: 'other' }] }] }
  const out = rewriteJsonLinks(cv, 'work', 'old', 'new', ['lucian-dev.com'])
  assert.equal(out.count, 3)
  assert.deepEqual(out.value.en[0].projects, [{ caseStudy: '/work/new', link: 'https://lucian-dev.com/work/new' }, { caseStudy: 'new' }, { caseStudy: 'other' }])
  assert.equal(referenceSlug('/work/old/'), 'old')
  const doc = rewriteDocument({ frontmatter: { title: 'P', project: 'old', links: [{ href: '/work/old' }] }, body: 'See /work/old.' }, 'work', 'old', 'new')
  assert.equal(doc.count, 3)
  assert.equal(doc.value.frontmatter.project, 'new')
  // Unchanged documents come back as the same object (nothing to write).
  const same = { frontmatter: { title: 'P' }, body: 'x' }
  assert.equal(rewriteDocument(same, 'work', 'old', 'new').value, same)
})

test('the editor validates a new slug before asking the server', () => {
  assert.equal(renameSlugProblem('', 'a'), '')
  assert.match(renameSlugProblem('Bad Slug', 'a'), /a–z/)
  assert.match(renameSlugProblem('a', 'a'), /current/)
  assert.match(renameSlugProblem('x'.repeat(65), 'a'), /64/)
  assert.equal(renameSlugProblem('new-slug_2', 'a'), '')
})

// ── Through the admin API ────────────────────────────────────────────────

const put = (handler: Handler, slug: string, frontmatter: Record<string, unknown>, body: string, extra: Record<string, unknown> = {}) =>
  h.call(handler, { method: 'PUT', body: { slug, frontmatter, body, create: true, ...extra } })

test('dry run lists every document that links the old address; refusals are explained', async () => {
  const first = await put(posts, 'edge-sorter', { title: 'Edge sorter', date: '2026-05-30', project: 'swcs' }, 'Hello. See [part two](/blog/part-two).')
  assert.equal(first.statusCode, 200, JSON.stringify(first.body))
  assert.equal((await put(posts, 'part-two', { title: 'Part two', date: '2026-06-01' }, 'Back to [part one](/blog/edge-sorter) and `/blog/edge-sorter` in code.')).statusCode, 200)
  assert.equal((await put(work, 'swcs', { title: 'SWCS', links: [{ label: 'Write-up', href: '/blog/edge-sorter' }] }, 'Read /blog/edge-sorter.')).statusCode, 200)
  const { writePage } = await import('../lib/mdx-admin')
  assert.equal((await writePage('now', { title: 'Now' }, 'Lately: [sorting](https://lucian-dev.com/blog/edge-sorter).')).ok, true)

  const plan = await h.call(posts, { method: 'POST', body: { action: 'rename', slug: 'edge-sorter', to: 'edge-ai-sorter', dryRun: true } })
  assert.equal(plan.statusCode, 200, JSON.stringify(plan.body))
  assert.equal(plan.body.links, 4)
  assert.deepEqual(
    plan.body.rewrites.map((r: any) => `${r.kind}:${r.ref}:${r.links}`).sort(),
    ['blog:part-two:1', 'page:now:1', 'work:swcs:2'],
  )
  assert.equal(plan.body.takesOverRedirectTo, null)
  assert.deepEqual(plan.revalidated, [], 'a dry run writes nothing')

  const taken = await h.call(posts, { method: 'POST', body: { action: 'rename', slug: 'edge-sorter', to: 'part-two', dryRun: true } })
  assert.equal(taken.statusCode, 409)
  assert.equal(taken.body.code, 'SLUG_EXISTS')
  assert.equal((await h.call(posts, { method: 'POST', body: { action: 'rename', slug: 'edge-sorter', to: 'Bad Slug', dryRun: true } })).statusCode, 400)
  assert.equal((await h.call(posts, { method: 'POST', body: { action: 'rename', slug: 'nope', to: 'x', dryRun: true } })).statusCode, 404)
  assert.equal((await h.call(posts, { method: 'POST', body: { action: 'rename', slug: 'edge-sorter', to: 'edge-sorter', dryRun: true } })).body.code, 'SAME_SLUG')
})

test('rename: the item moves with its pending changes and history, links are rewritten, the old address redirects (308)', async () => {
  // A history snapshot and unpublished changes (based on the live version) to carry along.
  const { writeOne, listSnapshots } = await import('../lib/mdx-admin')
  const before = await h.call(posts, { query: { slug: 'edge-sorter' } })
  await writeOne('blog', 'edge-sorter', before.body.frontmatter, before.body.body)
  assert.ok(listSnapshots('blog', 'edge-sorter').length >= 1)
  const one = await h.call(posts, { query: { slug: 'edge-sorter' } })
  const pend = await h.call(posts, { method: 'PUT', body: { slug: 'edge-sorter', frontmatter: { ...one.body.frontmatter, title: 'Edge sorter (revised)' }, body: 'Revised. See /blog/edge-sorter.', target: 'pending' }, headers: { 'if-match': one.headers.etag } })
  assert.equal(pend.statusCode, 200, JSON.stringify(pend.body))
  const current = await h.call(posts, { query: { slug: 'edge-sorter' } })
  assert.equal(current.body.pending.baseUpdatedAt, current.body.updatedAt)

  const events: any[] = []
  const { onEditorialEvent } = await import('../lib/editorialEvents')
  const off = onEditorialEvent((e) => events.push(e))
  const out = await h.call(posts, { method: 'POST', body: { action: 'rename', slug: 'edge-sorter', to: 'edge-ai-sorter' }, headers: { 'if-match': current.headers.etag } })
  off()
  assert.equal(out.statusCode, 200, JSON.stringify(out.body))
  assert.equal(out.body.slug, 'edge-ai-sorter')
  assert.equal(out.body.links, 5, 'the 4 planned + the self-link in its own unpublished changes')
  for (const p of ['/blog/edge-sorter', '/blog/edge-ai-sorter', '/blog', '/blog/part-two', '/work/swcs', '/now', '/']) assert.ok(out.revalidated.includes(p), p)
  assert.deepEqual(events.map((e) => [e.action, e.from, e.to, e.redirect, e.linksRewritten]), [['rename', 'edge-sorter', 'edge-ai-sorter', true, 5]])

  assert.equal((await h.call(posts, { query: { slug: 'edge-sorter' } })).statusCode, 404)
  const moved = await h.call(posts, { query: { slug: 'edge-ai-sorter' } })
  assert.equal(moved.body.frontmatter.title, 'Edge sorter')
  assert.equal(moved.body.pending.frontmatter.title, 'Edge sorter (revised)', 'pending changes moved')
  assert.equal(moved.body.pending.body, 'Revised. See /blog/edge-ai-sorter.', 'and their self-link was rewritten')
  assert.equal(moved.body.pending.baseUpdatedAt, moved.body.updatedAt, 'still based on the live version')
  assert.deepEqual(moved.body.redirectsFrom, ['edge-sorter'])
  assert.equal(listSnapshots('blog', 'edge-sorter').length, 0)
  assert.ok(listSnapshots('blog', 'edge-ai-sorter').length >= 1, 'history moved')

  const partTwo = await h.call(posts, { query: { slug: 'part-two' } })
  assert.equal(partTwo.body.body, 'Back to [part one](/blog/edge-ai-sorter) and `/blog/edge-sorter` in code.')
  const swcs = await h.call(work, { query: { slug: 'swcs' } })
  assert.equal(swcs.body.body, 'Read /blog/edge-ai-sorter.')
  assert.equal(swcs.body.frontmatter.links[0].href, '/blog/edge-ai-sorter')
  const { readPage } = await import('../lib/mdx-admin')
  assert.equal(readPage('now').body, 'Lately: [sorting](https://lucian-dev.com/blog/edge-ai-sorter).')

  const { missingItemProps, redirectTarget } = await import('../lib/redirects')
  assert.equal(redirectTarget('blog', 'edge-sorter'), 'edge-ai-sorter')
  assert.deepEqual(missingItemProps('blog', 'edge-sorter'), { redirect: { destination: '/blog/edge-ai-sorter', permanent: true }, revalidate: 60 })
  assert.deepEqual(missingItemProps('blog', 'never-existed'), { notFound: true, revalidate: 60 })

  // The old slug is tombstoned: a seed file can never bring it back.
  const { getItem } = await import('../lib/contentStore')
  assert.equal(getItem('blog', 'edge-sorter'), null)
})

test('chains collapse to one hop; renaming back makes the old address live again; a live item wins', async () => {
  const at = async (slug: string) => (await h.call(posts, { query: { slug } })).headers.etag
  const rename = async (slug: string, to: string, redirect = true) =>
    h.call(posts, { method: 'POST', body: { action: 'rename', slug, to, redirect }, headers: { 'if-match': await at(slug) }, ip: '127.0.0.42' })
  assert.equal((await rename('edge-ai-sorter', 'sorter')).statusCode, 200)
  const { redirectTarget, redirectsTo, listRedirects } = await import('../lib/redirects')
  assert.equal(redirectTarget('blog', 'edge-sorter'), 'sorter')
  assert.deepEqual(
    listRedirects('blog').map((r) => `${r.from}>${r.to}`).sort(),
    ['edge-ai-sorter>sorter', 'edge-sorter>sorter'],
    'every row points at the current slug — never a chain',
  )

  assert.equal((await rename('sorter', 'edge-sorter')).statusCode, 200)
  assert.equal(redirectTarget('blog', 'edge-sorter'), null, 'the address is live again')
  assert.deepEqual(redirectsTo('blog', 'edge-sorter'), ['edge-ai-sorter', 'sorter'])

  // A draft renamed without keeping its address adds no redirect, but older ones still follow it.
  const draft = await put(posts, 'scratch', { title: 'Scratch', date: '2026-06-02', draft: true }, 'Draft.')
  assert.equal(draft.statusCode, 200)
  assert.equal((await rename('scratch', 'scratch-2', false)).statusCode, 200)
  assert.equal(redirectTarget('blog', 'scratch'), null)

  // Creating a new post at an old address: the live item wins and the redirect row goes.
  const plan = await h.call(posts, { method: 'POST', body: { action: 'rename', slug: 'part-two', to: 'sorter', dryRun: true } })
  assert.equal(plan.body.takesOverRedirectTo, 'edge-sorter', 'the dialog warns before taking over')
  assert.equal((await put(posts, 'sorter', { title: 'New sorter', date: '2026-06-03' }, 'New.')).statusCode, 200)
  assert.equal(redirectTarget('blog', 'sorter'), null)
  assert.deepEqual(redirectsTo('blog', 'edge-sorter'), ['edge-ai-sorter'])
})

test('a redirect can be removed (the old address then answers 404); only the item it leads to can remove it', async () => {
  const wrong = await h.call(posts, { method: 'POST', body: { action: 'remove-redirect', slug: 'part-two', from: 'edge-ai-sorter' } })
  assert.equal(wrong.statusCode, 404)
  const ok = await h.call(posts, { method: 'POST', body: { action: 'remove-redirect', slug: 'edge-sorter', from: 'edge-ai-sorter' } })
  assert.equal(ok.statusCode, 200)
  assert.deepEqual(ok.body.redirectsFrom, [])
  assert.deepEqual(ok.revalidated, ['/blog/edge-ai-sorter'])
  const { missingItemProps } = await import('../lib/redirects')
  assert.deepEqual(missingItemProps('blog', 'edge-ai-sorter'), { notFound: true, revalidate: 60 })
})

test('a redirect to an item that does not render (a draft outside Draft Mode, a deleted item) is a 404', async () => {
  const { applyRename, missingItemProps } = await import('../lib/redirects')
  applyRename('blog', 'gone-old', 'scratch-2', true)
  assert.deepEqual(missingItemProps('blog', 'gone-old'), { notFound: true, revalidate: 60 }, 'scratch-2 is a draft')
  assert.deepEqual(missingItemProps('blog', 'gone-old', true), { redirect: { destination: '/blog/scratch-2', permanent: true }, revalidate: 60 })
})

test('renaming a case study rewrites the posts that name it and CV references', async () => {
  const { writeCvData, readCvData } = await import('../lib/cvdata')
  await writeCvData({ en: [{ type: 'projects', items: [{ name: 'SWCS', caseStudy: 'swcs' }] }] as any, zh: [] as any })
  await put(posts, 'about-swcs', { title: 'About SWCS', date: '2026-06-04', project: 'swcs' }, 'Body.')
  const etag = (await h.call(work, { query: { slug: 'swcs' } })).headers.etag
  const out = await h.call(work, { method: 'POST', body: { action: 'rename', slug: 'swcs', to: 'smart-waste' }, headers: { 'if-match': etag }, ip: '127.0.0.43' })
  assert.equal(out.statusCode, 200, JSON.stringify(out.body))
  assert.equal((await h.call(posts, { query: { slug: 'about-swcs' } })).body.frontmatter.project, 'smart-waste')
  assert.equal(JSON.stringify(readCvData()).includes('"caseStudy":"smart-waste"'), true)
  assert.ok(out.revalidated.includes('/cv') && out.revalidated.includes('/about'))
  const { missingItemProps } = await import('../lib/redirects')
  assert.deepEqual(missingItemProps('work', 'swcs'), { redirect: { destination: '/work/smart-waste', permanent: true }, revalidate: 60 })
})

test('the [slug] pages resolve renames in getStaticProps (self-contained, before anything else is loaded)', () => {
  for (const [page, c] of [
    ['pages/blog/[slug].tsx', 'blog'],
    ['pages/work/[slug].tsx', 'work'],
  ] as const) {
    const src = read(page)
    assert.match(src, new RegExp(`return \\(await import\\('\\.\\./\\.\\./lib/redirects'\\)\\)\\.missingItemProps\\('${c}', slug, draftMode\\)`))
  }
  // Renames never live in the proxy (proxy.ts): the pages own them, so the proxy file stays rename-free.
  assert.doesNotMatch(read('proxy.ts'), /missingItemProps|lib\/redirects/)
})
