/**
 * search-ask (F4 / J1): the served index is built once per content version
 * — like an ISR page — and every content or CV save refreshes it
 * (lib/revalidate.ts → lib/searchIndexCache), with the time-based fallback.
 * Runs against a throw-away content store in a temp directory.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CF_ZONE_ID', 'CF_API_TOKEN', 'INDEXNOW_KEY']) delete process.env[k]

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'search-ask-index-'))
let search: typeof import('../lib/searchIndex')
let cache: typeof import('../lib/searchIndexCache')
let store: typeof import('../lib/contentStore')
let db: typeof import('../lib/db')

const cv = (title: string) => ({
  en: [{ sessionName: 'workExperience', experiences: [{ jobTitle: title, companyName: 'Example Co', jobDescription: `${title} built example systems.` }] }],
  zh: [],
})

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  db = await import('../lib/db')
  store = await import('../lib/contentStore')
  search = await import('../lib/searchIndex')
  cache = await import('../lib/searchIndexCache')
  await store.putKv('cvdata', cv('First Role'))
})

after(() => {
  db.closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('the payload is reused until a save invalidates it, then rebuilt from the saved content', async () => {
  const first = await search.searchIndexPayload()
  assert.match(first.body, /First Role/)
  assert.ok(first.passages > 0, 'the Ask passages are part of it')
  assert.equal(JSON.parse(first.body).v, 2)

  // A write without a save hook: the built copy is still served (no rebuild per request)…
  await store.putKv('cvdata', cv('Second Role'))
  const again = await search.searchIndexPayload()
  assert.equal(again, first)

  // …until the save refreshes it, as lib/revalidate.ts does on every content / CV save.
  const generation = cache.invalidateSearchIndex()
  const fresh = await search.searchIndexPayload()
  assert.notEqual(fresh, first)
  assert.equal(fresh.generation, generation)
  assert.match(fresh.body, /Second Role/)
  assert.doesNotMatch(fresh.body, /First Role/)
})

test('the time-based fallback rebuilds a stale copy; concurrent requests share one build', async () => {
  const current = await search.searchIndexPayload()
  const built = current.builtAt
  assert.equal(await search.searchIndexPayload(built + search.SEARCH_INDEX_TTL_MS - 1), current)
  const later = await search.searchIndexPayload(built + search.SEARCH_INDEX_TTL_MS + 1)
  assert.notEqual(later, current)
  cache.invalidateSearchIndex()
  const [a, b] = await Promise.all([search.searchIndexPayload(), search.searchIndexPayload()])
  assert.equal(a, b)
})

test('revalidatePaths (every content and CV save) marks the index stale and purges it with the pages', async () => {
  const { revalidatePaths, derivedPurgePaths } = await import('../lib/revalidate')
  const before = cache.searchIndexGeneration()
  const res = { revalidate: async () => undefined } as never
  await revalidatePaths(res, ['/cv', '/cv/zh'])
  assert.equal(cache.searchIndexGeneration(), before + 1)
  for (const p of ['/cv', '/cv/zh', '/about', '/now', '/uses', '/contact', '/publications', '/blog/x', '/work/y']) {
    assert.ok(derivedPurgePaths([p]).includes('/api/search-index'), `${p} purges the search index at the edge`)
  }
})

test('GET /api/search-index serves the built payload as JSON', async () => {
  const handler = (await import('../pages/api/search-index')).default
  const headers: Record<string, string> = {}
  let status = 0
  let sent = ''
  const res = {
    setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = String(v)),
    getHeader: (k: string) => headers[k.toLowerCase()],
    status(code: number) {
      status = code
      return this
    },
    send(body: string) {
      sent = body
      return this
    },
    json(body: unknown) {
      sent = JSON.stringify(body)
      return this
    },
    end() {
      return this
    },
  }
  await handler({ method: 'GET', headers: {}, url: '/api/search-index', query: {} } as never, res as never)
  assert.equal(status, 200)
  assert.match(headers['content-type'], /application\/json/)
  assert.match(headers['cache-control'], /s-maxage=300/)
  const body = JSON.parse(sent)
  assert.ok(Array.isArray(body.docs) && body.ask && Array.isArray(body.ask.passages))
})
