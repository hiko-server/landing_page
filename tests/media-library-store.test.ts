/**
 * H7 — the media library against a real store: the listing (files, variants,
 * usage), the usage index rebuilt whenever content changes, the default
 * texts, safe delete into the 30-day trash (R2 deletes, the file server's
 * tombstone), restore and purge, "Replace file" (references rewritten with
 * history snapshots, the old address redirecting, chains collapsed) and the
 * admin API (auth, refusals, the activity log).
 *
 * Runs in a temp working directory: throw-away SQLite store, R2 disabled
 * (R2 calls go to an injected fake), synthetic images only.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import sharp from 'sharp'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CF_API_TOKEN', 'CF_ZONE_ID', 'INDEXNOW_KEY']) delete process.env[k]
process.env.JWT_SECRET = 'media-library-store-secret-0123456789abcdef'
process.env.LOG_LEVEL = 'error'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'media-library-'))
const uploads = path.join(tmp, 'public', 'uploads')

type Lib = typeof import('../lib/media/library')
type List = typeof import('../lib/media/list')
type Trash = typeof import('../lib/media/trash')
type Replace = typeof import('../lib/media/replace')
type MetaStore = typeof import('../lib/media/metaStore')
type Serve = typeof import('../lib/media/serve')
type Store = typeof import('../lib/contentStore')
type Images = typeof import('../lib/imageVariants')

let lib: Lib
let list: List
let trash: Trash
let replace: Replace
let metaStore: MetaStore
let serve: Serve
let store: Store
let images: Images
let closeDb: () => void
let closeAuditDb: () => void

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  fs.mkdirSync(uploads, { recursive: true })
  lib = await import('../lib/media/library')
  list = await import('../lib/media/list')
  trash = await import('../lib/media/trash')
  replace = await import('../lib/media/replace')
  metaStore = await import('../lib/media/metaStore')
  serve = await import('../lib/media/serve')
  store = await import('../lib/contentStore')
  images = await import('../lib/imageVariants')
  closeDb = (await import('../lib/db')).closeDb
  closeAuditDb = (await import('../lib/audit/db')).closeAuditDb
})

after(() => {
  closeDb()
  closeAuditDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const gradient = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 90, b: 160 } } })
    .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><rect x="0" y="0" width="${Math.round(w / 2)}" height="${h}" fill="#e0a030"/></svg>`), top: 0, left: 0 }])

async function upload(name: string, w = 900, h = 600, kind: 'png' | 'jpeg' = 'png') {
  const buf = kind === 'png' ? await gradient(w, h).png().toBuffer() : await gradient(w, h).jpeg({ quality: 80 }).toBuffer()
  return images.storeUpload(buf, kind === 'png' ? 'image/png' : 'image/jpeg', name, { mirror: async () => null })
}

/** An R2 fake: listing answers with what `objects` holds; `failDeletes` refuses those keys. */
function fakeR2(objects: Set<string>, failDeletes = new Set<string>()) {
  const calls: string[] = []
  return {
    calls,
    ops: {
      configured: () => true,
      list: async (prefix: string) => Array.from(objects).filter((k) => k.startsWith(prefix)),
      del: async (key: string) => {
        calls.push(`del ${key}`)
        if (failDeletes.has(key)) throw new Error('403')
        objects.delete(key)
      },
      put: async (key: string) => {
        calls.push(`put ${key}`)
        objects.add(key)
      },
    },
  }
}

const noPurge = async () => undefined

test('H7 migration 3 creates the media tables; the boot sync names variants like the app', async () => {
  const { getDb } = await import('../lib/db')
  const tables = (getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name)
  for (const t of ['media_assets', 'media_usage', 'media_trash', 'media_redirects', 'media_index_state']) assert.ok(tables.includes(t), t)
  const helpers = await import('../scripts/content-helpers.mjs')
  const { VARIANT_NAME_RE } = await import('../lib/uploadVariants')
  assert.equal(helpers.UPLOAD_VARIANT_RE.source, VARIANT_NAME_RE.source)
  assert.equal(helpers.UPLOAD_VARIANT_RE.flags, VARIANT_NAME_RE.flags)
  assert.equal(helpers.uploadOriginalOf('a.png.w640.avif'), 'a.png')
  assert.equal(helpers.uploadOriginalOf('a.png'), 'a.png')
})

test('H7 listing: originals with their facts, variants and blur placeholder; usage from every document', async () => {
  const a = await upload('field-notes.png', 900, 600)
  const b = await upload('portrait.jpg', 600, 900, 'jpeg')
  await store.putItem('blog', 'edge-ml', { title: 'Edge ML', cover: a.url, coverAlt: 'Two colours' }, `Text\n\n![](${b.url})\n`)
  const lib1 = list.listLibrary()
  const itemA = lib1.items.find((i) => i.name === a.name)
  const itemB = lib1.items.find((i) => i.name === b.name)
  assert.ok(itemA && itemB)
  assert.equal(itemA.width, 900)
  assert.equal(itemA.height, 600)
  assert.equal(itemA.format, 'png')
  assert.equal(itemA.local, true)
  assert.equal(itemA.r2, null, 'R2 is not configured')
  assert.ok(itemA.variants.eligible)
  assert.deepEqual(itemA.variants.missing, [])
  assert.ok(itemA.variants.placeholder)
  assert.deepEqual(
    itemA.variants.present.map((v) => `${v.width}.${v.format}`),
    ['320.avif', '320.webp', '480.avif', '480.webp', '640.avif', '640.webp', '900.avif', '900.webp'],
  )
  assert.match(itemA.thumb, /\.w480\.webp$/)
  assert.match(itemA.placeholder || '', /^data:image\/webp;base64,/)
  assert.match(itemA.srcSet || '', /w320\.webp 320w/)
  assert.equal(itemA.usage[0].label, 'Cover')
  assert.equal(itemA.usage[0].alt, 'ok')
  assert.equal(itemB.usage[0].label, 'Body · line 3')
  assert.equal(itemB.usage[0].alt, 'missing')
  assert.equal(lib1.trashDays, 30)
})

test('H7 usage index: rebuilt after any content write, whichever path wrote it', async () => {
  const c = await upload('index-check.png', 400, 300)
  assert.deepEqual(lib.usageOf(c.name), [])
  await store.putPage('now', {}, `Now: ![desk](${c.url})`)
  assert.equal(lib.usageOf(c.name)[0].doc, 'page/now')
  // A kv write (the home document) counts too.
  await store.putKv('home', { hero: { avatarUrl: c.url } })
  assert.deepEqual(lib.usageOf(c.name).map((u) => u.doc).sort(), ['home', 'page/now'])
  await store.putPage('now', {}, 'Now: nothing')
  await store.putKv('home', { hero: {} })
  assert.deepEqual(lib.usageOf(c.name), [])
  assert.equal(lib.rebuildUsage(), false, 'unchanged content keeps the index')
})

test('H7 default texts: saved per upload, partial updates, stale forms get 409, empty removes', async () => {
  const name = 'texts.png'
  const first = await metaStore.saveMediaMeta(name, { alt: '  A blue and orange card ', caption: 'Card' }, 0, 1000)
  assert.ok(first.ok && first.meta)
  assert.equal(first.meta.alt, 'A blue and orange card')
  const v1 = first.meta.updatedAt
  const second = await metaStore.saveMediaMeta(name, { altZh: '蓝橙色卡片' }, v1, 1000)
  assert.ok(second.ok && second.meta)
  assert.equal(second.meta.alt, 'A blue and orange card', 'fields left out keep their value')
  assert.ok(second.meta.updatedAt > v1, 'versions only move forward')
  const stale = await metaStore.saveMediaMeta(name, { alt: 'Other' }, v1)
  assert.ok(!stale.ok && stale.status === 409)
  assert.equal((stale as { current: { altZh: string } }).current.altZh, '蓝橙色卡片')
  const stored = store.getKv<{ items: Record<string, unknown> }>('media-library')
  assert.ok(stored?.items[name], 'kept in the kv row mirrored to R2')
  const cleared = await metaStore.saveMediaMeta(name, { alt: '', altZh: '', caption: '' })
  assert.ok(cleared.ok && cleared.meta === null)
  assert.equal(metaStore.readMediaMeta().doc.items[name], undefined)
})

test('H7 delete: refused while used; then into the trash with its texts, R2 copies deleted, never served', async () => {
  const d = await upload('to-delete.png', 700, 500)
  await metaStore.saveMediaMeta(d.name, { alt: 'Throwaway card' })
  await store.putItem('work', 'draft-case', { title: 'Draft case', draft: true }, `![x](${d.url})`)
  const objects = new Set([`uploads/${d.name}`, `uploads/${d.name}.w320.webp`, `uploads/${d.name}-w320.webp`])
  const r2 = fakeR2(objects, new Set([`uploads/${d.name}.w320.webp`]))

  const refused = await trash.moveToTrash(d.name, { r2: r2.ops, purge: noPurge })
  assert.ok(!refused.ok && refused.code === 'IN_USE')
  assert.equal(refused.usage?.[0].docTitle, 'Draft case', 'drafts count')
  assert.ok(fs.existsSync(path.join(uploads, d.name)))

  await store.removeItem('work', 'draft-case')
  const purged: string[][] = []
  const out = await trash.moveToTrash(d.name, { r2: r2.ops, purge: async (p) => void purged.push(p), now: Date.UTC(2026, 9, 1) })
  assert.ok(out.ok)
  assert.match(out.r2Warning || '', /next sync retries/)
  assert.ok(!fs.existsSync(path.join(uploads, d.name)))
  assert.deepEqual(trash.localFilesOf(d.name), [])
  const inTrash = fs.readdirSync(path.join(tmp, 'data', 'media-trash', d.name))
  assert.ok(inTrash.includes(d.name) && inTrash.some((f) => f.endsWith('.avif')), 'original and variants moved')
  assert.deepEqual(r2.calls.sort(), [`del uploads/${d.name}`, `del uploads/${d.name}.w320.webp`].sort(), 'only its own objects, not a look-alike name')
  assert.ok(objects.has(`uploads/${d.name}-w320.webp`))
  const { getDb } = await import('../lib/db')
  const pending = getDb().prepare('SELECT key, op FROM r2_pending').all()
  assert.deepEqual(pending, [{ key: `uploads/${d.name}.w320.webp`, op: 'delete' }])
  assert.ok(purged[0].includes(`/uploads/${encodeURIComponent(d.name)}`), 'edge cache purged')

  assert.deepEqual(serve.uploadMissPolicy(d.name), { gone: true })
  assert.deepEqual(serve.uploadMissPolicy(`${d.name}.w640.webp`), { gone: true })
  assert.equal(metaStore.readMediaMeta().doc.items[d.name], undefined, 'the texts went with it')
  const listed = list.listLibrary(Date.UTC(2026, 9, 2))
  assert.ok(!listed.items.some((i) => i.name === d.name))
  const t = listed.trash.find((x) => x.name === d.name)
  assert.ok(t)
  assert.equal(t.meta?.alt, 'Throwaway card')
  assert.equal(t.purgeAt, Date.UTC(2026, 9, 31))
  assert.ok(t.r2Pending)
  assert.match(t.preview || '', /^\/api\/admin\/media\/preview\?name=/)
  assert.match(trash.trashPreviewFile(d.name) || '', /\.w480\.webp$/)
  const again = await trash.moveToTrash(d.name, { r2: r2.ops, purge: noPurge })
  assert.ok(!again.ok && again.code === 'TRASHED')
})

test('H7 restore: files, texts and R2 copies come back; purge removes for good after 30 days', async () => {
  const name = 'to-delete.png'
  const objects = new Set<string>()
  const r2 = fakeR2(objects)
  const restored = await trash.restoreFromTrash(name, { r2: r2.ops })
  assert.ok(restored.ok)
  assert.ok(fs.existsSync(path.join(uploads, name)))
  assert.ok(objects.has(`uploads/${name}`) && objects.has(`uploads/${name}.w320.avif`))
  assert.equal(metaStore.readMediaMeta().doc.items[name]?.alt, 'Throwaway card')
  assert.equal(serve.uploadMissPolicy(name), null)
  assert.ok(!fs.existsSync(path.join(tmp, 'data', 'media-trash', name)))
  assert.ok(!(await trash.restoreFromTrash(name, { r2: r2.ops })).ok)

  await trash.moveToTrash(name, { r2: r2.ops, purge: noPurge, now: Date.UTC(2026, 8, 1) })
  assert.deepEqual(trash.purgeExpiredTrash(Date.UTC(2026, 8, 20)), [], 'not yet')
  assert.deepEqual(trash.purgeExpiredTrash(Date.UTC(2026, 9, 2)), [name])
  assert.ok(!fs.existsSync(path.join(tmp, 'data', 'media-trash', name)))
  assert.equal(list.listLibrary().trash.find((x) => x.name === name), undefined)
})

test('H7 replace: a new file, every reference moved (snapshots first), the old address redirects, chains collapse', async () => {
  const old = await upload('team.jpg', 1000, 700, 'jpeg')
  await metaStore.saveMediaMeta(old.name, { alt: 'The team', caption: 'Team day' })
  await store.putItem('blog', 'team-post', { title: 'Team post', cover: old.url }, `![The team](${old.url})\n\n<img srcset="/uploads/${old.name}.w640.webp 640w" />\n`)
  const { putPendingRevision, getPendingRevision } = await import('../lib/pendingRevisions')
  const live = store.getItem('blog', 'team-post')
  putPendingRevision('blog', 'team-post', { title: 'Team post v2' }, `Pending ![t](${old.url})`, Math.trunc(live?.updated_at ?? 0))
  await store.putKv('home', { hero: { avatarUrl: old.url } })
  await store.putKv('cvdata', { en: [{ sessionName: 'personalInformation', photo: old.url, photoOnPdf: true }], zh: [] })

  const newBuf = await gradient(1200, 800).png().toBuffer()
  const out = await replace.replaceUpload(
    { name: old.name, raw: newBuf, mime: 'image/png', filename: '1790000000000-team-new.png' },
    { r2: fakeR2(new Set()).ops, purge: noPurge },
  )
  assert.ok(out.ok, JSON.stringify(out))
  const to = out.upload.name
  assert.notEqual(to, old.name)
  assert.equal(to, '1790000000000-team-new.png')
  assert.deepEqual(out.rewrites.map((r) => `${r.kind}:${r.ref}:${r.references}`).sort(), ['cv:cv:1', 'home:home:1', 'post:team-post:4'])
  assert.ok(out.paths.includes('/blog/team-post') && out.paths.includes('/') && out.paths.includes('/cv'))

  const post = store.getItem('blog', 'team-post')
  assert.equal(post?.frontmatter.cover, `/uploads/${to}`)
  assert.ok(post?.body.includes(`![The team](/uploads/${to})`))
  assert.ok(post?.body.includes(`/uploads/${to}.w640.webp 640w`), 'the variant reference follows to the same width')
  assert.equal(getPendingRevision('blog', 'team-post')?.body, `Pending ![t](/uploads/${to})`)
  assert.equal((store.getKv('home') as { hero: { avatarUrl: string } }).hero.avatarUrl, `/uploads/${to}`)
  assert.equal((store.getKv('cvdata') as { en: Array<{ photo: string }> }).en[0].photo, `/uploads/${to}`)
  assert.ok(fs.readdirSync(path.join(tmp, 'data')).some((d) => /snapshots/.test(d)), 'history snapshots were taken')

  assert.equal(metaStore.readMediaMeta().doc.items[to]?.alt, 'The team', 'the texts follow')
  assert.deepEqual(serve.uploadMissPolicy(old.name), { redirect: `/uploads/${to}` })
  assert.deepEqual(serve.uploadMissPolicy(`${old.name}.w640.webp`), { redirect: `/uploads/${to}.w640.webp` })
  assert.deepEqual(serve.uploadMissPolicy(`${old.name}.w1920.webp`), { redirect: `/uploads/${to}` }, 'no such variant: the original')
  const t = list.listLibrary().trash.find((x) => x.name === old.name)
  assert.equal(t?.reason, 'replaced')
  assert.equal(t?.replacedBy, to)
  assert.deepEqual(lib.usageOf(old.name, { fresh: true }), [])
  assert.equal(list.listLibrary().items.find((i) => i.name === to)?.replaces[0], old.name)

  // Replacing the replacement: the first address skips straight to the newest file.
  const third = await replace.replaceUpload(
    { name: to, raw: await gradient(1100, 800).png().toBuffer(), mime: 'image/png', filename: '1790000000001-team-3.png' },
    { r2: fakeR2(new Set()).ops, purge: noPurge },
  )
  assert.ok(third.ok)
  assert.deepEqual(serve.uploadMissPolicy(old.name), { redirect: `/uploads/${third.upload.name}` })
  assert.deepEqual(serve.uploadMissPolicy(to), { redirect: `/uploads/${third.upload.name}` })

  // Restoring the first file brings its own address back.
  const back = await trash.restoreFromTrash(old.name, { r2: fakeR2(new Set()).ops })
  assert.ok(back.ok)
  assert.equal(serve.uploadMissPolicy(old.name), null)

  const missing = await replace.replaceUpload({ name: 'nope.png', raw: newBuf, mime: 'image/png', filename: 'x.png' }, { purge: noPurge })
  assert.ok(!missing.ok && missing.status === 404)
  const bad = await replace.replaceUpload({ name: 'a.png.w640.webp', raw: newBuf, mime: 'image/png', filename: 'x.png' }, { purge: noPurge })
  assert.ok(!bad.ok && bad.status === 400)
})

test('H7 fill in alt: English and Chinese documents get their own default; snapshots first; pending changes too', async () => {
  const img = await upload('alt-fill.png', 500, 400)
  const { applyDefaultAlt } = await import('../lib/media/applyAltServer')
  const none = await applyDefaultAlt(img.name)
  assert.ok(!none.ok && none.status === 400, 'needs a default first')
  await metaStore.saveMediaMeta(img.name, { alt: 'An orange and blue card', altZh: '橙蓝卡片' })
  await store.putItem('blog', 'alt-en', { title: 'Alt in English', cover: img.url }, `Some text here.\n\n![](${img.url})\n`)
  await store.putItem('blog', 'alt-zh', { title: '中文文章的标题足够长', lang: 'zh-Hans' }, `这是一段中文。\n\n![IMG_9.png](${img.url})\n`)
  await store.putItem('work', 'alt-ja', { title: 'Japanese', lang: 'ja' }, `![](${img.url})`)
  const { putPendingRevision, getPendingRevision } = await import('../lib/pendingRevisions')
  const live = store.getItem('blog', 'alt-en')
  putPendingRevision('blog', 'alt-en', { title: 'Alt in English v2' }, `Pending ![](${img.url})`, Math.trunc(live?.updated_at ?? 0))
  const out = await applyDefaultAlt(img.name)
  assert.ok(out.ok)
  assert.equal(out.places, 4, 'cover + body + pending body (en), body (zh)')
  assert.deepEqual(out.rewrites.map((r) => r.ref).sort(), ['alt-en', 'alt-zh'])
  const en = store.getItem('blog', 'alt-en')
  assert.equal(en?.frontmatter.coverAlt, 'An orange and blue card')
  assert.ok(en?.body.includes(`![An orange and blue card](${img.url})`))
  assert.equal(getPendingRevision('blog', 'alt-en')?.body, `Pending ![An orange and blue card](${img.url})`)
  assert.ok(store.getItem('blog', 'alt-zh')?.body.includes(`![橙蓝卡片](${img.url})`))
  assert.equal(store.getItem('work', 'alt-ja')?.body, `![](${img.url})`, 'no default in its language')
  assert.ok(out.paths.includes('/blog/alt-en'))
  assert.ok(lib.usageOf(img.name).filter((u) => u.doc.startsWith('blog/')).every((u) => u.alt === 'ok'))
})

test('H7 a new upload never takes the name of one in the trash; the content export carries the texts', async () => {
  const first = await upload('same-name.png', 300, 200)
  await metaStore.saveMediaMeta(first.name, { alt: 'Exported alt' })
  const { buildContentExport } = await import('../lib/contentExport')
  const zip = (await buildContentExport()).zip
  assert.ok(zip.includes(Buffer.from('image-texts.json')))
  const out = await trash.moveToTrash(first.name, { r2: fakeR2(new Set()).ops, purge: noPurge })
  assert.ok(out.ok)
  const second = await upload('same-name.png', 300, 200)
  assert.notEqual(second.name, first.name, 'gets a hash suffix instead')
  assert.ok((await trash.restoreFromTrash(first.name, { r2: fakeR2(new Set()).ops })).ok)
})

// ── The admin API ───────────────────────────────────────────────────────────

type Out = { statusCode: number; body: any; headers: Record<string, string> }

function mockRes(out: Out) {
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(c: number) {
      out.statusCode = c
    },
    headersSent: false,
    writableEnded: false,
    status(c: number) {
      out.statusCode = c
      return res
    },
    setHeader(n: string, v: unknown) {
      out.headers[n.toLowerCase()] = String(v)
      return res
    },
    getHeader: (n: string) => out.headers[n.toLowerCase()],
    json(b: unknown) {
      out.body = JSON.parse(JSON.stringify(b))
      return res
    },
    send(b: unknown) {
      out.body = b
      return res
    },
    end() {
      return res
    },
    revalidate: async () => undefined,
  }
  return res
}

async function call(route: string, method: string, body?: unknown, admin = true, query: Record<string, string> = {}): Promise<Out> {
  const handler = (await import(route)).default as (req: unknown, res: unknown) => Promise<unknown>
  const token = jwt.sign({ role: 'admin', email: 'owner@example.com' }, process.env.JWT_SECRET as string, { algorithm: 'HS256' })
  const out: Out = { statusCode: 200, body: undefined, headers: {} }
  await handler(
    {
      method,
      url: route.replace('../pages', ''),
      query,
      body,
      cookies: admin ? { cv_admin_token: token } : {},
      headers: admin ? { cookie: `cv_admin_token=${token}` } : {},
      socket: { remoteAddress: '127.0.0.1' },
    },
    mockRes(out),
  )
  return out
}

test('H7 API: admin only; the listing; texts and deletes answer clearly and land in the activity log', async () => {
  const anon = await call('../pages/api/admin/media/index', 'GET', undefined, false)
  assert.equal(anon.statusCode, 401)
  const libRes = await call('../pages/api/admin/media/index', 'GET')
  assert.equal(libRes.statusCode, 200)
  assert.equal(libRes.headers['cache-control'], 'no-store')
  assert.ok(Array.isArray(libRes.body.items) && libRes.body.items.length > 0)

  const target = (libRes.body.items as Array<{ name: string; usage: unknown[]; meta: unknown }>).find((i) => i.usage.length === 0 && !i.meta)
  assert.ok(target)
  const meta = await call('../pages/api/admin/media/index', 'POST', { action: 'meta', name: target.name, alt: 'Synthetic card', expectedUpdatedAt: 0 })
  assert.equal(meta.statusCode, 200)
  assert.equal(meta.body.meta.alt, 'Synthetic card')
  const stale = await call('../pages/api/admin/media/index', 'POST', { action: 'meta', name: target.name, alt: 'X', expectedUpdatedAt: 0 })
  assert.equal(stale.statusCode, 409)
  assert.equal(stale.body.code, 'CONFLICT')
  assert.equal((await call('../pages/api/admin/media/index', 'POST', { action: 'meta', name: '../x', alt: 'x' })).statusCode, 400)
  assert.equal((await call('../pages/api/admin/media/index', 'POST', { action: 'meta', name: target.name, alt: 5 })).statusCode, 400)
  assert.equal((await call('../pages/api/admin/media/index', 'POST', { action: 'meta', name: 'not-there.png', alt: 'x' })).statusCode, 404)

  const used = (libRes.body.items as Array<{ name: string; usage: unknown[] }>).find((i) => i.usage.length > 0)
  assert.ok(used)
  const del = await call('../pages/api/admin/media/index', 'POST', { action: 'delete', names: [used.name, target.name] })
  assert.equal(del.statusCode, 200)
  assert.deepEqual(del.body.done, [target.name])
  assert.equal(del.body.failed[0].code, 'IN_USE')
  assert.ok(del.body.failed[0].usage.length > 0)
  assert.ok(del.body.library.trash.some((t: { name: string }) => t.name === target.name))

  const preview = await call('../pages/api/admin/media/preview', 'GET', undefined, true, { name: target.name })
  assert.equal(preview.statusCode, 200)
  assert.match(preview.headers['content-type'], /^image\//)
  assert.equal(preview.headers['cache-control'], 'private, no-store')
  assert.equal((await call('../pages/api/admin/media/preview', 'GET', undefined, false, { name: target.name })).statusCode, 401)
  assert.equal((await call('../pages/api/admin/media/preview', 'GET', undefined, true, { name: used.name })).statusCode, 404)

  const purge = await call('../pages/api/admin/media/index', 'POST', { action: 'purge', names: [target.name] })
  assert.deepEqual(purge.body.done, [target.name])
  assert.equal((await call('../pages/api/admin/media/index', 'POST', { action: 'delete', names: [] })).statusCode, 400)
  assert.equal((await call('../pages/api/admin/media/index', 'POST', { action: 'delete', names: ['a.png.w640.webp'] })).statusCode, 400)
  assert.equal((await call('../pages/api/admin/media/index', 'POST', { action: 'nope' })).statusCode, 400)
  assert.equal((await call('../pages/api/admin/media/index', 'POST', { action: 'r2-scan' })).statusCode, 502, 'no R2 here')

  const { listAudit } = await import('../lib/audit/store')
  const summaries = listAudit({ area: 'media' }).entries.map((e) => e.summary)
  assert.ok(summaries.includes(`Updated the default alt text and caption of image “${target.name}”`))
  assert.ok(summaries.includes(`Moved image “${target.name}” to the trash`))
  assert.ok(summaries.includes(`Deleted image “${target.name}” for good`))
})

test('H7 API: replace checks the body like an upload and reports what changed', async () => {
  const src = await upload('api-replace.png', 640, 480)
  await store.putPage('uses', {}, `Desk: ![desk](${src.url})`)
  const png = await gradient(800, 600).png().toBuffer()
  const bad = await call('../pages/api/admin/media/replace', 'POST', { name: src.name, filename: 'x.png', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' })
  assert.equal(bad.statusCode, 415)
  const out = await call('../pages/api/admin/media/replace', 'POST', { name: src.name, filename: '1790000000002-desk.png', dataUrl: `data:image/png;base64,${png.toString('base64')}` })
  assert.equal(out.statusCode, 200, JSON.stringify(out.body))
  assert.equal(out.body.from, src.name)
  assert.equal(out.body.name, '1790000000002-desk.png')
  assert.deepEqual(out.body.rewrites, [{ kind: 'page', ref: 'uses', title: '/uses', references: 1 }])
  assert.deepEqual(out.body.revalidated, ['/uses'])
  assert.equal(store.getPage('uses')?.body, 'Desk: ![desk](/uploads/1790000000002-desk.png)')
  const { listAudit } = await import('../lib/audit/store')
  const entry = listAudit({ area: 'media' }).entries.find((e) => e.action === 'media.replace')
  assert.equal(entry?.summary, `Replaced image “${src.name}” with “1790000000002-desk.png” (1 reference updated)`)
  assert.equal((await call('../pages/api/admin/media/replace', 'POST', { name: src.name }, false)).statusCode, 401)
})
