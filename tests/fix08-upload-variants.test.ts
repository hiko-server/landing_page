/**
 * FIX-08 — article images gain their srcset once WebP variants exist.
 *
 * The public pages compile bodies through compileMdxCached (lib/mdx.ts), a
 * process-lifetime memo. It was keyed by (body, lang) only, so a tree
 * compiled before the media-optimize backfill wrote the variants kept
 * shipping the full-size original with no srcset (/blog/swcs: a 763 KB PNG
 * next to a 25 KB w640 WebP). Now:
 *
 *   - the memo key carries the variant state of the uploads a body
 *     references (lib/uploadVariants variantState), so a new variant gives
 *     a fresh compile with the srcset;
 *   - media-optimize regenerates every published page that references an
 *     image it wrote variants for (lib/revalidate pathsReferencingUploads).
 *
 * Runs in a temp working directory: throw-away SQLite store, R2 disabled.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import jwt from 'jsonwebtoken'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CF_API_TOKEN', 'CF_ZONE_ID', 'INDEXNOW_KEY']) {
  delete process.env[k]
}
process.env.JWT_SECRET = 'fix08-upload-variants-secret'
process.env.LOG_LEVEL = 'error'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fix08-variants-'))
const uploads = path.join(tmp, 'public', 'uploads')

type Handler = (req: any, res: any) => unknown
type MdxModule = typeof import('../lib/mdx')
type VariantsModule = typeof import('../lib/uploadVariants')
type RevalidateModule = typeof import('../lib/revalidate')
type StoreModule = typeof import('../lib/contentStore')

let mdx: MdxModule
let variants: VariantsModule
let revalidate: RevalidateModule
let store: StoreModule
let optimize: Handler
let closeDb: () => void

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  fs.mkdirSync(uploads, { recursive: true })
  mdx = await import('../lib/mdx')
  variants = await import('../lib/uploadVariants')
  revalidate = await import('../lib/revalidate')
  store = await import('../lib/contentStore')
  optimize = (await import('../pages/api/admin/media-optimize')).default
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 120, b: 90 } } })
    .png()
    .toBuffer()

async function writeUpload(name: string, width: number, height: number) {
  fs.writeFileSync(path.join(uploads, name), new Uint8Array(await png(width, height)))
}

async function writeVariant(name: string, width: number) {
  const buf = await sharp(path.join(uploads, name)).resize({ width }).webp({ quality: 72 }).toBuffer()
  fs.writeFileSync(path.join(uploads, `${name}.w${width}.webp`), new Uint8Array(buf))
}

type Node = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[] }

function images(tree: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  const visit = (n: Node) => {
    if (n.type === 'element' && n.tagName === 'img') out.push(n.properties || {})
    for (const c of n.children || []) visit(c)
  }
  visit(tree as Node)
  return out
}

const adminToken = () => jwt.sign({ role: 'admin', email: 'owner@example.test' }, 'fix08-upload-variants-secret', { algorithm: 'HS256' })

type MockRes = { statusCode: number; headers: Record<string, string>; body: any; revalidated: string[] }

async function call(handler: Handler, method = 'POST'): Promise<MockRes> {
  const token = adminToken()
  const req = {
    method,
    url: '/api/admin/media-optimize',
    query: {},
    body: undefined,
    cookies: { cv_admin_token: token },
    headers: { cookie: `cv_admin_token=${token}` },
    socket: { remoteAddress: '127.0.0.9' },
  }
  const out: MockRes = { statusCode: 200, headers: {}, body: undefined, revalidated: [] }
  let ended = false
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(code: number) {
      out.statusCode = code
    },
    get headersSent() {
      return ended
    },
    get writableEnded() {
      return ended
    },
    status(code: number) {
      out.statusCode = code
      return res
    },
    setHeader(name: string, value: any) {
      out.headers[name.toLowerCase()] = String(value)
      return res
    },
    getHeader(name: string) {
      return out.headers[name.toLowerCase()]
    },
    json(body: any) {
      out.body = JSON.parse(JSON.stringify(body))
      ended = true
      return res
    },
    send(body: any) {
      out.body = body
      ended = true
      return res
    },
    end() {
      ended = true
      return res
    },
    async revalidate(p: string) {
      out.revalidated.push(p)
    },
  }
  await handler(req, res)
  return out
}

test('uploadNamesIn: original upload names in markdown, JSX and frontmatter text; variants and bad names skipped', () => {
  const text = [
    '![a](/uploads/a.png "Title")',
    '<Figure src="/uploads/b.jpg" caption="B" />',
    '![variant](/uploads/a.png.w640.webp)',
    '![escape](/uploads/../secret)',
    'again /uploads/a.png',
    '![remote](https://cdn.example.test/x.png)',
    '![encoded](/uploads/My%5FPhoto.png)',
  ].join('\n')
  assert.deepEqual(variants.uploadNamesIn(text), ['a.png', 'b.jpg', 'My_Photo.png'])
  assert.deepEqual(variants.uploadNamesIn(''), [])
  assert.deepEqual(variants.uploadNamesIn(undefined), [])
})

test('variantState changes when a variant of a referenced upload appears', async () => {
  await writeUpload('state.png', 900, 600)
  const body = '![Sorter](/uploads/state.png)'
  const before = variants.variantState(body)
  assert.equal(before, 'state.png:1:')
  await writeVariant('state.png', 640)
  assert.equal(variants.variantState(body), 'state.png:1:state.png.w640.webp')
  // G4 / C8: AVIF variants and the placeholder are part of the state too.
  fs.writeFileSync(path.join(uploads, 'state.png.w16.webp'), new Uint8Array(await sharp(path.join(uploads, 'state.png')).resize({ width: 16 }).webp().toBuffer()))
  assert.equal(variants.variantState(body), 'state.png:1:state.png.w16.webp,state.png.w640.webp')
  assert.equal(variants.variantState('No images here.'), '')
})

test('compileMdxCached: a tree memoised before the backfill gains the srcset once the variant exists', async () => {
  await writeUpload('shot.png', 900, 600)
  const body = '![The sorting station](/uploads/shot.png)\n\nSome text after the figure.'
  const first = await mdx.compileMdxCached(body, 'en')
  const [img] = images(first.tree)
  assert.equal(img.src, '/uploads/shot.png')
  assert.equal(img.srcSet, undefined, 'no variant yet → no srcset')
  // Unchanged state: the memo still serves the same tree.
  assert.equal((await mdx.compileMdxCached(body, 'en')).tree, first.tree)

  await writeVariant('shot.png', 640) // what media-optimize writes

  const second = await mdx.compileMdxCached(body, 'en')
  const [img2] = images(second.tree)
  assert.notEqual(second.tree, first.tree, 'a new variant means a fresh compile')
  assert.equal(img2.srcSet, '/uploads/shot.png.w640.webp 640w, /uploads/shot.png 900w')
  assert.equal(img2.sizes, '(min-width: 768px) 720px, 100vw')
})

test('pathsReferencingUploads: only the pages whose content uses one of the uploads', () => {
  const sources = [
    { path: '/blog/a', text: '![x](/uploads/hero.png)' },
    { path: '/blog/b', text: 'No image.' },
    { path: '/work/c', text: 'body\n/uploads/hero.png' },
    { path: '/work', text: '/uploads/other.jpg' },
    { path: 'not-a-path', text: '/uploads/hero.png' },
  ]
  assert.deepEqual(revalidate.pathsReferencingUploads(['hero.png'], sources), ['/blog/a', '/work/c'])
  assert.deepEqual(revalidate.pathsReferencingUploads(new Set(['other.jpg', 'hero.png']), sources), ['/blog/a', '/work/c', '/work'])
  assert.deepEqual(revalidate.pathsReferencingUploads([], sources), [])
})

test('media-optimize writes the variants and regenerates the published pages that use them', async () => {
  await writeUpload('hero.png', 1400, 800)
  await writeUpload('tiny.png', 300, 200)
  await store.putItem('blog', 'uses-hero', { title: 'Uses hero', date: '2026-10-01' }, 'Intro text for the post.\n\n![The hero shot](/uploads/hero.png)\n')
  await store.putItem('blog', 'other', { title: 'Other', date: '2026-10-02' }, '![Small](/uploads/tiny.png)\n')
  await store.putItem('blog', 'draft-hero', { title: 'Draft', date: '2026-10-03', draft: true }, '![Hero](/uploads/hero.png)\n')
  await store.putItem('work', 'case', { title: 'Case', cover: '/uploads/hero.png' }, 'A case study body.\n')
  await store.putPage('now', { title: 'Now' }, 'Now with a picture: ![Hero](/uploads/hero.png)\n')

  // The public page is rendered (and memoised) before the backfill.
  const stale = await mdx.getPost('uses-hero')
  assert.ok(stale)
  assert.equal(images(stale.tree)[0].srcSet, undefined)

  const run = await call(optimize)
  assert.equal(run.statusCode, 200)
  assert.equal(run.body.remaining, 0)
  assert.deepEqual(run.body.errors, [])
  assert.ok(run.body.processed >= 1)
  // G4: WebP and AVIF at 320 / 480 / 640 / 1280 and the original's 1400; C8: the placeholder.
  for (const w of [320, 480, 640, 1280, 1400]) {
    for (const f of ['webp', 'avif']) assert.ok(fs.existsSync(path.join(uploads, `hero.png.w${w}.${f}`)), `hero.png.w${w}.${f} written`)
  }
  assert.ok(fs.existsSync(path.join(uploads, 'hero.png.w16.webp')), 'the blur placeholder')
  assert.ok(!fs.existsSync(path.join(uploads, 'tiny.png.w320.webp')), 'nothing wider than a 300 px original…')
  assert.ok(fs.existsSync(path.join(uploads, 'tiny.png.w300.avif')), '…but its own width in AVIF and WebP')

  const expected = ['/blog/other', '/blog/uses-hero', '/now', '/work', '/work/case']
  assert.deepEqual([...run.body.revalidated].sort(), expected, 'published pages using the optimised uploads, drafts left alone')
  assert.deepEqual([...run.revalidated].sort(), expected, 'each one regenerated through res.revalidate')

  // The regenerated page carries the srcsets (the same-width WebP replaces the PNG) and the placeholder.
  const fresh = await mdx.getPost('uses-hero')
  assert.ok(fresh)
  const img = images(fresh.tree)[0]
  assert.equal(
    img.srcSet,
    '/uploads/hero.png.w320.webp 320w, /uploads/hero.png.w480.webp 480w, /uploads/hero.png.w640.webp 640w, /uploads/hero.png.w1280.webp 1280w, /uploads/hero.png.w1400.webp 1400w',
  )
  assert.equal(
    img.dataAvifSrcset,
    '/uploads/hero.png.w320.avif 320w, /uploads/hero.png.w480.avif 480w, /uploads/hero.png.w640.avif 640w, /uploads/hero.png.w1280.avif 1280w, /uploads/hero.png.w1400.avif 1400w',
  )
  assert.match(String(img.dataLqip), /^data:image\/webp;base64,/)

  // Nothing new to write → nothing to regenerate.
  const again = await call(optimize)
  assert.equal(again.statusCode, 200)
  assert.equal(again.body.processed, 0)
  assert.deepEqual(again.body.revalidated, [])
  assert.deepEqual(again.revalidated, [])
})
