/**
 * Wave 2B review fixes on the post / case-study routes, over a real
 * (temporary) content store:
 *   - CORR-3: a Draft Mode preview of a pending revision computes the
 *     language switch from the PREVIEWED frontmatter (its translationKey),
 *     not from the live item's;
 *   - CORR-4: after a slug rename the Markdown twin of the old address
 *     (/blog/<old>.md, /work/<old>.md → GET /api/md) answers 308 to the twin
 *     at the new address, like the HTML page — not 404.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CF_ZONE_ID', 'CF_API_TOKEN', 'INDEXNOW_KEY']) delete process.env[k]
process.env.LOG_LEVEL = 'error'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf2b-content-'))
let store: typeof import('../lib/contentStore')
let mdx: typeof import('../lib/mdx')
let siblings: typeof import('../lib/articleSiblings')
let pending: typeof import('../lib/pendingRevisions')
let closeDb: () => void

const en = 'An English body about the edge sorter, with enough words to read as English text.'
const zh = '这是一篇关于边缘分类装置的中文文章，正文全部使用中文书写，用来测试语言识别。'

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  store = await import('../lib/contentStore')
  mdx = await import('../lib/mdx')
  siblings = await import('../lib/articleSiblings')
  pending = await import('../lib/pendingRevisions')
  closeDb = (await import('../lib/db')).closeDb
  await store.putItem('blog', 'en-a', { title: 'Building the sorter', date: '2026-05-01', translationKey: 'k1' }, en)
  await store.putItem('blog', 'zh-a', { title: '构建边缘分类装置的经验总结', date: '2026-05-02', translationKey: 'k1' }, zh)
  await store.putItem('blog', 'zh-b', { title: '另一篇关于分类装置的中文文章', date: '2026-05-03', translationKey: 'k2' }, zh)
})

after(() => {
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('CORR-3: previewing a pending translationKey change shows the switch it will have; the live page keeps its own', async () => {
  const live = (await mdx.getPost('en-a'))!
  pending.putPendingRevision('blog', 'en-a', { ...live.frontmatter, translationKey: 'k2' }, en, live.updatedAt ?? 0)
  try {
    const preview = (await mdx.getPost('en-a', { includeDrafts: true, pending: true }))!
    assert.equal(preview.frontmatter.translationKey, 'k2', 'the preview renders the pending frontmatter')
    const s = siblings.articleSiblings('blog', preview, { draftMode: true })
    assert.deepEqual(s.translations.map((t) => t.slug), ['zh-b'], 'the switch of the version being previewed')

    // Visitors still get the live page's switch until the change is published.
    const pub = siblings.articleSiblings('blog', (await mdx.getPost('en-a'))!, { draftMode: false })
    assert.deepEqual(pub.translations.map((t) => t.slug), ['zh-a'])
    // The translation's own preview is unaffected by another item's pending change.
    const other = siblings.articleSiblings('blog', (await mdx.getPost('zh-a', { includeDrafts: true, pending: true }))!, { draftMode: true })
    assert.deepEqual(other.translations.map((t) => t.slug), ['en-a'])

    // Unlinking as a pending change: the preview has no switch.
    pending.putPendingRevision('blog', 'en-a', { ...live.frontmatter, translationKey: undefined }, en, live.updatedAt ?? 0)
    const unlinked = (await mdx.getPost('en-a', { includeDrafts: true, pending: true }))!
    assert.deepEqual(siblings.articleSiblings('blog', unlinked, { draftMode: true }).translations, [])
  } finally {
    pending.deletePendingRevision('blog', 'en-a')
  }
})

type MockRes = { statusCode: number; headers: Record<string, string>; body: string | undefined }

/** GET|HEAD /api/md as the rewrite of /<collection>/<slug>.md calls it. */
async function md(collection: string, slug: string, method = 'GET'): Promise<MockRes> {
  const handler = (await import('../pages/api/md')).default
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined }
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
      out.body = JSON.stringify(b)
      return res
    },
    end(b?: Buffer | string) {
      if (b !== undefined) out.body = Buffer.isBuffer(b) ? b.toString('utf8') : b
      return res
    },
  }
  await handler({ method, query: { collection, slug }, headers: {}, url: '/api/md', socket: {} } as never, res)
  return out
}

test('CORR-4: a renamed post\'s and case study\'s old .md address answers 308 to the twin at the new address, as long as the item renders there', async () => {
  const { renameSlug } = await import('../lib/slugRename')
  const { missingItemProps } = await import('../lib/redirects')
  await store.putItem('blog', 'twin-old', { title: 'A post that moves', date: '2026-06-01' }, en)
  await store.putItem('work', 'case-old', { title: 'A case study that moves' }, en)
  assert.equal((await md('blog', 'twin-old')).statusCode, 200)

  for (const [collection, from, to] of [['blog', 'twin-old', 'twin-new'], ['work', 'case-old', 'case-new']] as const) {
    const out = await renameSlug({ collection, from, to, redirect: true })
    assert.equal(out.ok, true, JSON.stringify(out))
    const old = await md(collection, from)
    assert.equal(old.statusCode, 308, `${collection}: the old twin redirects`)
    assert.equal(old.headers.location, `/${collection}/${to}.md`)
    assert.equal(old.headers['cache-control'], 'public, max-age=0, s-maxage=60', 're-checked every minute, like the page')
    assert.equal(old.headers['x-robots-tag'], 'noindex')
    const head = await md(collection, from, 'HEAD')
    assert.equal(head.statusCode, 308)
    assert.equal(head.body, undefined)
    // The HTML page answers the same way (lib/redirects missingItemProps).
    assert.deepEqual(missingItemProps(collection, from), { redirect: { destination: `/${collection}/${to}`, permanent: true }, revalidate: 60 })
    const now = await md(collection, to)
    assert.equal(now.statusCode, 200)
    assert.ok(now.body?.startsWith('# A '))
  }

  // The item no longer renders at the new address (unpublished): no redirect to it.
  const moved = store.getItem('blog', 'twin-new')!
  await store.putItem('blog', 'twin-new', { ...moved.frontmatter, draft: true }, moved.body)
  assert.equal((await md('blog', 'twin-old')).statusCode, 404)
  assert.ok('notFound' in missingItemProps('blog', 'twin-old'))

  // A rename without keeping the old address: 404.
  await store.putItem('blog', 'twin-plain', { title: 'Renamed without a redirect', date: '2026-06-02' }, en)
  assert.equal((await renameSlug({ collection: 'blog', from: 'twin-plain', to: 'twin-plain-2', redirect: false })).ok, true)
  assert.equal((await md('blog', 'twin-plain')).statusCode, 404)
  assert.equal((await md('blog', 'nothing-here')).statusCode, 404)
})
