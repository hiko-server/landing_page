/**
 * Stale 404s: Next keeps the last 200 copy of an ISR page on disk when a
 * regeneration answers notFound, so a restart would serve a deleted or
 * unpublished post / case study (or /publications without a paper) again.
 * lib/isrCache removes those copies; lib/isrPages knows which pages can
 * vanish; lib/revalidate runs it after every content write and
 * instrumentation.ts at server start.
 *
 * Unit tests over planted Next-style cache trees, then the real admin
 * routes against a throw-away content store (temp working directory).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { forgetPersistedPages, forgetVanishedPages, pageFileStem, persistedPages, type VanishingRoute } from '../lib/isrCache'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CF_API_TOKEN', 'CF_ZONE_ID', 'INDEXNOW_KEY']) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'isr-stale-404-secret'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isr-stale-404-'))

/** Write files (with their directories) under `root`; returns their absolute paths. */
function plant(root: string, rels: string[]): string[] {
  return rels.map((rel) => {
    const file = path.join(root, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'x')
    return file
  })
}

const exists = (files: string[]) => files.filter((f) => fs.existsSync(f))

/** A Next 16 build output: build prerenders in pages/, ISR copies under route-cache/PAGES/<owner>/$. */
function cacheTree(root: string) {
  const blogOwner = 'route-cache/PAGES/3f1c0a/$'
  const workOwner = 'route-cache/PAGES/9b2e7d/$'
  const pubOwner = 'route-cache/PAGES/51aa04/$'
  const indexOwner = 'route-cache/PAGES/00ff00/$'
  return {
    gonePost: plant(root, ['pages/blog/gone.html', 'pages/blog/gone.json', `${blogOwner}/blog/gone.html`, `${blogOwner}/blog/gone.json`, `${blogOwner}/blog/gone.meta`]),
    livePost: plant(root, ['pages/blog/live.html', 'pages/blog/live.json', `${blogOwner}/blog/live.html`, `${blogOwner}/blog/live.meta`]),
    goneWork: plant(root, [`${workOwner}/work/old-name.html`, `${workOwner}/work/old-name.json`, `${workOwner}/work/old-name.meta`]),
    publications: plant(root, ['pages/publications.html', 'pages/publications.json', `${pubOwner}/publications.html`, `${pubOwner}/publications.meta`]),
    untouched: plant(root, [
      // compiled routes and their traces — never page copies
      'pages/blog/[slug].js',
      'pages/blog/[slug].js.nft.json',
      'pages/publications.js',
      'pages/publications.js.nft.json',
      // static pages and collection indexes always exist
      'pages/blog.html',
      'pages/index.html',
      `${indexOwner}/index.html`,
      `${blogOwner}/blog.html`,
      'pages/api/blog/gone.json',
    ]),
  }
}

const routes = (opts: { posts: string[]; works: string[]; publications: boolean }): VanishingRoute[] => [
  { name: 'blog', prefixes: ['/blog'], match: (p) => /^\/blog\/[\w-]+$/.test(p), exists: (p) => opts.posts.includes(p.slice('/blog/'.length)) },
  { name: 'work', prefixes: ['/work'], match: (p) => /^\/work\/[\w-]+$/.test(p), exists: (p) => opts.works.includes(p.slice('/work/'.length)) },
  { name: 'publications', match: (p) => p === '/publications', exists: () => opts.publications },
]

test('page paths map to cache file stems; anything unsafe is refused', () => {
  assert.equal(pageFileStem('/'), 'index')
  assert.equal(pageFileStem('/publications'), 'publications')
  assert.equal(pageFileStem('/blog/my_post-2'), 'blog/my_post-2')
  for (const bad of ['', 'blog/x', '/blog/../../etc/passwd', '/blog/x/', '/blog/%2e%2e', '/blog/a.b', '//x']) {
    assert.equal(pageFileStem(bad), null, bad)
  }
  assert.deepEqual(forgetPersistedPages(['/../outside'], path.join(tmp, 'nothing')), [])
})

test('only the copies of pages that are gone are removed, from the build prerenders and the route cache', () => {
  const root = fs.mkdtempSync(path.join(tmp, 'server-'))
  const t = cacheTree(root)
  const found = persistedPages((p, prefix) => (prefix ? p === '/blog' || p === '/work' : /^\/(blog|work)\/|^\/publications$/.test(p)), root)
  assert.deepEqual([...found.keys()].sort(), ['/blog/gone', '/blog/live', '/publications', '/work/old-name'])
  assert.equal(found.get('/blog/gone')?.length, 5, 'both roots')

  const result = forgetVanishedPages(routes({ posts: ['live'], works: ['new-name'], publications: false }), root)
  assert.deepEqual(result.paths.sort(), ['/blog/gone', '/publications', '/work/old-name'])
  assert.deepEqual(exists([...t.gonePost, ...t.goneWork, ...t.publications]), [])
  assert.deepEqual(exists([...t.livePost, ...t.untouched]).length, t.livePost.length + t.untouched.length)
  assert.equal(result.files.length, t.gonePost.length + t.goneWork.length + t.publications.length)

  // Idempotent; and with everything present nothing is touched.
  assert.deepEqual(forgetVanishedPages(routes({ posts: ['live'], works: [], publications: false }), root), { paths: [], files: [] })
})

test('a page whose content check fails keeps its copy (only a definite "gone" removes)', () => {
  const root = fs.mkdtempSync(path.join(tmp, 'server-'))
  const t = cacheTree(root)
  const failing: VanishingRoute[] = routes({ posts: [], works: [], publications: false }).map((r) =>
    r.name === 'blog' ? { ...r, exists: () => { throw new Error('store unavailable') } } : r,
  )
  const result = forgetVanishedPages(failing, root)
  assert.deepEqual(result.paths.sort(), ['/publications', '/work/old-name'])
  assert.equal(exists([...t.gonePost, ...t.livePost]).length, t.gonePost.length + t.livePost.length)
})

test('no build output, no route cache: nothing to do', () => {
  assert.deepEqual(forgetVanishedPages(routes({ posts: [], works: [], publications: false }), path.join(tmp, 'missing')), { paths: [], files: [] })
  assert.deepEqual(forgetPersistedPages(['/blog/x'], path.join(tmp, 'missing')), [])
})

// ── Through the real admin routes and content store ───────────────────────

type Handler = (req: any, res: any) => unknown
let posts: Handler, work: Handler
let closeDb: () => void
let closeAuthDb: () => void
let sessionId = ''

async function call(handler: Handler, opts: { method?: string; query?: Record<string, any>; body?: any } = {}) {
  const token = jwt.sign({ role: 'admin', email: 'owner@example.test', sid: sessionId }, 'isr-stale-404-secret', { algorithm: 'HS256' })
  const out = { statusCode: 200, body: undefined as any, revalidated: [] as string[], headers: {} as Record<string, string> }
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(c: number) {
      out.statusCode = c
    },
    status(c: number) {
      out.statusCode = c
      return res
    },
    setHeader(k: string, v: unknown) {
      out.headers[k.toLowerCase()] = String(v)
      return res
    },
    getHeader: (k: string) => out.headers[k.toLowerCase()],
    json(b: unknown) {
      out.body = JSON.parse(JSON.stringify(b))
      return res
    },
    send(b: unknown) {
      out.body = b
      return res
    },
    end(payload?: string) {
      if (typeof payload === 'string' && /json/.test(out.headers['content-type'] || '')) out.body = JSON.parse(payload)
      return res
    },
    async revalidate(p: string) {
      out.revalidated.push(p)
    },
  }
  await handler(
    {
      method: opts.method || 'GET',
      url: '/api/test',
      query: opts.query || {},
      body: opts.body,
      cookies: { cv_admin_token: token },
      headers: { cookie: `cv_admin_token=${token}` },
      socket: { remoteAddress: '127.0.0.9' },
    },
    res,
  )
  return out
}

/** Plant persisted copies (both roots) of a page under ./.next/server; returns the files. */
const persist = (pathname: string) => {
  const stem = pathname.slice(1)
  return plant(path.join(process.cwd(), '.next', 'server'), [`pages/${stem}.html`, `pages/${stem}.json`, `route-cache/PAGES/abc123/$/${stem}.html`, `route-cache/PAGES/abc123/$/${stem}.meta`])
}

const item = (slug: string, title: string, extra: Record<string, unknown> = {}) => ({ slug, frontmatter: { title, date: '2026-10-01', ...extra }, body: 'Hello.' })

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  posts = (await import('../pages/api/admin/posts')).default
  work = (await import('../pages/api/admin/work')).default
  closeDb = (await import('../lib/db')).closeDb
  closeAuthDb = (await import('../lib/adminAuth/db')).closeAuthDb
  const { createSession } = await import('../lib/adminAuth/sessions')
  sessionId = createSession({ method: 'password', ttlMs: 3_600_000, device: null, ipPrefix: null, country: null }).id
})

after(() => {
  closeDb()
  closeAuthDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('deleting a post removes its persisted copies; the other posts keep theirs', async () => {
  for (const slug of ['keep-me', 'delete-me']) {
    const r = await call(posts, { method: 'PUT', body: { ...item(slug, slug), create: true } })
    assert.equal(r.statusCode, 200, JSON.stringify(r.body))
  }
  const keep = persist('/blog/keep-me')
  const gone = persist('/blog/delete-me')
  const del = await call(posts, { method: 'DELETE', query: { slug: 'delete-me' } })
  assert.equal(del.statusCode, 200, JSON.stringify(del.body))
  assert.ok(del.revalidated.includes('/blog/delete-me'), 'the page itself is regenerated (memory → 404)')
  assert.deepEqual(exists(gone), [], 'no copy left for a restart to serve')
  assert.equal(exists(keep).length, keep.length)
})

test('unpublishing a post (draft) removes its copies; publishing it again needs nothing on disk', async () => {
  const files = persist('/blog/keep-me')
  const draft = await call(posts, { method: 'PUT', body: item('keep-me', 'keep-me', { draft: true }) })
  assert.equal(draft.statusCode, 200, JSON.stringify(draft.body))
  assert.deepEqual(exists(files), [])
  const again = await call(posts, { method: 'PUT', body: item('keep-me', 'keep-me', { draft: false }) })
  assert.equal(again.statusCode, 200)
  const { listPosts } = await import('../lib/mdx')
  assert.deepEqual(listPosts().map((p) => p.slug), ['keep-me'])
})

test('renaming a case study (new slug, old one deleted) removes the old path’s copies', async () => {
  assert.equal((await call(work, { method: 'PUT', body: { ...item('old-name', 'Project'), create: true } })).statusCode, 200)
  const old = persist('/work/old-name')
  assert.equal((await call(work, { method: 'PUT', body: { ...item('new-name', 'Project'), create: true } })).statusCode, 200)
  const fresh = persist('/work/new-name')
  assert.equal(exists(old).length, old.length, 'still published under the old slug')
  assert.equal((await call(work, { method: 'DELETE', query: { slug: 'old-name' } })).statusCode, 200)
  assert.deepEqual(exists(old), [])
  assert.equal(exists(fresh).length, fresh.length)
})

test('server start: every ISR page whose content is gone loses its copies (instrumentation.ts)', async () => {
  const { forgetVanishedContentPages } = await import('../lib/isrPages')
  // As if these were left by an earlier process: a post deleted while the copy stayed, no papers in the CV.
  const stalePost = persist('/blog/removed-while-down')
  const staleWork = persist('/work/never-existed')
  const pubs = persist('/publications')
  const live = persist('/blog/keep-me')
  const result = forgetVanishedContentPages()
  assert.deepEqual(result.paths.sort(), ['/blog/removed-while-down', '/publications', '/work/never-existed'])
  assert.deepEqual(exists([...stalePost, ...staleWork, ...pubs]), [])
  assert.equal(exists(live).length, live.length)

  const instrumentation = fs.readFileSync(path.join(originalCwd, 'instrumentation.ts'), 'utf8')
  assert.match(instrumentation, /import\('\.\/lib\/isrPages'\)/)
  assert.match(instrumentation, /forgetVanishedContentPages\(\)/)
  // Every revalidation round (all content writes, restores and pulls) runs it too.
  const revalidate = fs.readFileSync(path.join(originalCwd, 'lib/revalidate.ts'), 'utf8')
  assert.match(revalidate, /await forgetVanishedPages\(\)/)
})

test('the vanishing routes answer like their getStaticProps', async () => {
  const { vanishingRoutes } = await import('../lib/isrPages')
  const [blog, workRoute, pubs] = vanishingRoutes()
  assert.equal(blog.match('/blog/keep-me'), true)
  assert.equal(blog.match('/blog'), false)
  assert.equal(blog.match('/blog/a/b'), false)
  assert.equal(blog.exists('/blog/keep-me'), true)
  assert.equal(blog.exists('/blog/delete-me'), false)
  assert.equal(workRoute.exists('/work/new-name'), true)
  assert.equal(workRoute.exists('/work/old-name'), false)
  assert.equal(pubs.match('/publications'), true)
  assert.equal(pubs.exists('/publications'), false, 'no CV, no papers')
  // The page loaders' own answers agree (lib/mdx's published lists, drafts included in the store).
  const { getPost, getWork, listPosts, listWork } = await import('../lib/mdx')
  assert.ok(await getPost('keep-me'))
  assert.equal(await getPost('delete-me'), null)
  assert.equal(await getWork('old-name'), null)
  assert.equal((await call(posts, { method: 'PUT', body: { ...item('a-draft', 'Draft', { draft: true }), create: true } })).statusCode, 200)
  assert.equal(blog.exists('/blog/a-draft'), false)
  const { publishedSlugs } = await import('../lib/isrPages')
  assert.deepEqual([...publishedSlugs('blog')].sort(), listPosts().map((p) => p.slug).sort())
  assert.deepEqual([...publishedSlugs('work')].sort(), listWork().map((w) => w.slug).sort())
  // /publications follows the CV: a public paper makes it exist (its copies are kept).
  const { writeCvData } = await import('../lib/cvdata')
  await writeCvData({
    en: [
      { sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li' },
      { sessionName: 'publications', headerName: 'Publications', papers: [{ title: 'A paper', status: 'preprint', authors: ['Yanpei Li'] }] },
    ],
    zh: [],
  } as any)
  assert.equal(vanishingRoutes()[2].exists('/publications'), true)
  const kept = persist('/publications')
  const { forgetVanishedContentPages } = await import('../lib/isrPages')
  assert.deepEqual(forgetVanishedContentPages().paths, [])
  assert.equal(exists(kept).length, kept.length)
})
