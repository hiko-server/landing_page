/**
 * H16 — tag management (rename / unify / merge post tags and case-study
 * tech across every item, unpublished changes included, a history snapshot
 * per item) and the content export (.zip of MDX + frontmatter, CV / home
 * JSON, redirects and the list of images; built in-house, no dependency).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import matter from 'gray-matter'
import { editorialHarness, type Handler } from './editorialHarness'
import { retagList, tagChangeLabel, tagInventory, tagNameProblem, tagsOf, TAG_NAME_MAX } from '../lib/tagAdmin'
import { buildZip, crc32, dosDateTime, isSafeZipName } from '../lib/zip'
import { exportFilename, imageList, imageRefsInBody, imageRefsInValue, imageUrlOf, mdxFile } from '../lib/contentExport'

const ORIGINAL_ROOT = process.cwd()

// ── Tags (pure) ──────────────────────────────────────────────────────────

test('the inventory groups spellings by slug, counts items once, most used first', () => {
  const inv = tagInventory([
    { slug: 'a', title: 'A', tags: ['Edge AI', 'IoT', 'edge-ai'] },
    { slug: 'b', title: 'B', tags: ['edge ai'], draft: true },
    { slug: 'c', title: 'C', tags: ['Edge AI'], pendingTags: ['Edge AI', 'Robotics'] },
    { slug: 'd', title: 'D', tags: [], pendingTags: ['IoT'] },
  ])
  assert.deepEqual(
    inv.map((t) => [t.slug, t.label, t.count]),
    [
      ['edge-ai', 'Edge AI', 3],
      ['iot', 'IoT', 2],
      ['robotics', 'Robotics', 1],
    ],
  )
  assert.deepEqual(inv[0].spellings, ['Edge AI', 'edge ai', 'edge-ai'])
  assert.deepEqual(
    inv[1].items.map((i) => [i.slug, i.pendingOnly]),
    [
      ['a', false],
      ['d', true],
    ],
  )
  assert.equal(inv[0].items.find((i) => i.slug === 'b')?.draft, true)
})

test('retagging replaces every spelling in place, removes duplicates and leaves other lists untouched', () => {
  const from = new Set(['ml', 'machine-learning'])
  assert.deepEqual(retagList(['Python', 'ML', 'Vision', 'machine learning'], from, 'Machine learning'), {
    list: ['Python', 'Machine learning', 'Vision'],
    changed: true,
  })
  const untouched = [' Python ', 'Vision']
  assert.deepEqual(retagList(untouched, from, 'X'), { list: untouched, changed: false })
  assert.deepEqual(retagList(['Edge AI'], new Set(['edge-ai']), 'Edge AI'), { list: ['Edge AI'], changed: false })
  assert.deepEqual(retagList(['edge ai', 'IoT'], new Set(['edge-ai']), 'Edge AI').list, ['Edge AI', 'IoT'])
  // Renaming into an existing tag merges with it.
  assert.deepEqual(retagList(['CV', 'Computer vision'], new Set(['cv']), 'Computer Vision').list, ['Computer Vision'])
})

test('tag names: no commas, a letter or digit, at most 40 characters', () => {
  assert.equal(tagNameProblem('Edge AI'), '')
  assert.match(tagNameProblem(''), /Enter/)
  assert.match(tagNameProblem('a, b'), /comma/)
  assert.match(tagNameProblem('a，b'), /comma/)
  assert.match(tagNameProblem('---'), /letter or digit/)
  assert.match(tagNameProblem('x'.repeat(TAG_NAME_MAX + 1)), /40/)
  assert.equal(tagNameProblem('计算机视觉'), '')
  assert.deepEqual(tagsOf(['a', 2, ' b ', '']), ['a', 'b'])
  assert.equal(tagChangeLabel(['ML'], 'Machine learning'), 'Rename “ML” to “Machine learning”')
  assert.equal(tagChangeLabel(['ML', 'AI'], 'AI'), 'Merge “ML”, “AI” into “AI”')
})

// ── Zip (pure) ───────────────────────────────────────────────────────────

/** A tiny reader for the archive: central directory → entries (inflated, CRC-checked). */
function readZip(buf: Buffer): Array<{ name: string; data: Buffer; method: number; flags: number }> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.ok(eocd >= 0, 'end of central directory')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = []
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50)
    const method = buf.readUInt16LE(p + 10)
    const flags = buf.readUInt16LE(p + 8)
    const crc = buf.readUInt32LE(p + 16)
    const csize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nlen = buf.readUInt16LE(p + 28)
    const elen = buf.readUInt16LE(p + 30)
    const clen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8')
    assert.equal(buf.readUInt32LE(local), 0x04034b50)
    const lnlen = buf.readUInt16LE(local + 26)
    const lelen = buf.readUInt16LE(local + 28)
    const raw = buf.subarray(local + 30 + lnlen + lelen, local + 30 + lnlen + lelen + csize)
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw)
    assert.equal(data.length, size, `${name} size`)
    assert.equal(crc32(data), crc, `${name} crc`)
    out.push({ name, data, method, flags })
    p += 46 + nlen + elen + clen
  }
  return out
}

test('the zip writer: deflate or store, UTF-8 names, valid CRCs and directory', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926, 'the CRC-32 check value')
  const zip = buildZip([
    { name: 'README.txt', data: 'hello '.repeat(200) },
    { name: 'blog/计算机视觉.mdx', data: '---\ntitle: 中文\n---\n正文\n' },
    { name: 'tiny.bin', data: Buffer.from([1, 2, 3]) },
  ])
  const entries = readZip(zip)
  assert.deepEqual(entries.map((e) => e.name), ['README.txt', 'blog/计算机视觉.mdx', 'tiny.bin'])
  assert.equal(entries[0].method, 8, 'compressible text is deflated')
  assert.equal(entries[2].method, 0, 'stored when deflate does not help')
  assert.ok(entries.every((e) => e.flags & 0x0800), 'UTF-8 flag')
  assert.equal(entries[1].data.toString('utf8'), '---\ntitle: 中文\n---\n正文\n')
  assert.throws(() => buildZip([{ name: '../evil', data: 'x' }]), /unsafe/)
  assert.throws(() => buildZip([{ name: 'a', data: '1' }, { name: 'a', data: '2' }]), /duplicate/)
  for (const bad of ['/abs', 'a//b', 'a/./b', 'a\\b', '']) assert.equal(isSafeZipName(bad), false, bad)
  const { date, time } = dosDateTime(new Date(2026, 9, 20, 13, 45, 31))
  assert.equal(date, ((2026 - 1980) << 9) | (10 << 5) | 20)
  assert.equal(time, (13 << 11) | (45 << 5) | 15)
})

// ── Export helpers (pure) ────────────────────────────────────────────────

test('image references: Markdown, JSX / HTML attributes, uploads anywhere; never data: URIs or variants', () => {
  const body = [
    '![Cover](/uploads/cover.png)',
    '<Figure src="https://cdn.example.com/a.jpg" />',
    '<video poster="/uploads/poster.jpg" />',
    '![inline](data:image/png;base64,AAAA)',
    'Plain mention of /uploads/diagram.webp in text.',
    '<img src="/uploads/cover.png.w640.webp" />',
  ].join('\n')
  assert.deepEqual(imageRefsInBody(body).sort(), ['/uploads/cover.png', '/uploads/diagram.webp', '/uploads/poster.jpg', 'https://cdn.example.com/a.jpg'].sort())
  assert.deepEqual(imageRefsInValue({ cover: '/uploads/c.jpg', photos: [{ src: 'https://example.com/p.webp?w=2' }], name: 'Example Person' }).sort(), [
    '/uploads/c.jpg',
    'https://example.com/p.webp?w=2',
  ])
  assert.equal(imageUrlOf('/uploads/../etc/passwd'), '')
  assert.equal(exportFilename('lucian-dev.com', new Date('2026-10-20T10:00:00Z')), 'lucian-dev.com-content-2026-10-20.zip')
})

test('images.json lists each image once with the files that use it, then the uploads nothing uses', () => {
  const list = imageList(
    [
      { file: 'blog/a.mdx', urls: ['/uploads/a.png', 'https://example.com/x.jpg'] },
      { file: 'work/b.mdx', urls: ['/uploads/a.png', '/uploads/missing.png'] },
    ],
    new Map([
      ['a.png', 1200],
      ['orphan.jpg', 99],
    ]),
  )
  assert.deepEqual(list, [
    { url: '/uploads/a.png', kind: 'upload', bytes: 1200, usedIn: ['blog/a.mdx', 'work/b.mdx'] },
    { url: '/uploads/missing.png', kind: 'upload', missing: true, usedIn: ['work/b.mdx'] },
    { url: 'https://example.com/x.jpg', kind: 'external', usedIn: ['blog/a.mdx'] },
    { url: '/uploads/orphan.jpg', kind: 'upload', bytes: 99, usedIn: [] },
  ])
  const file = mdxFile({ title: 'T', tags: ['a'] }, 'Body')
  assert.deepEqual(matter(file).data, { title: 'T', tags: ['a'] })
  assert.equal(matter(file).content.trim(), 'Body')
})

// ── Through the admin API ────────────────────────────────────────────────

const h = editorialHarness('admin-editorial-tags-export')
let posts: Handler
let work: Handler
let tags: Handler
let exporter: Handler

before(async () => {
  await h.setup()
  posts = (await import('../pages/api/admin/posts')).default
  work = (await import('../pages/api/admin/work')).default
  tags = (await import('../pages/api/admin/tags')).default
  exporter = (await import('../pages/api/admin/export')).default
})
after(() => h.teardown())

const create = (handler: Handler, slug: string, frontmatter: Record<string, unknown>, body = 'Body text.') =>
  h.call(handler, { method: 'PUT', body: { slug, frontmatter, body, create: true } })

test('GET lists post tags and case-study tech with counts and items', async () => {
  assert.equal((await create(posts, 'one', { title: 'One', date: '2026-05-01', tags: ['ML', 'Edge AI'] })).statusCode, 200)
  assert.equal((await create(posts, 'two', { title: 'Two', date: '2026-05-02', tags: ['machine learning', 'edge ai'] })).statusCode, 200)
  assert.equal((await create(posts, 'three', { title: 'Three', date: '2026-05-03', tags: ['Notes'], draft: true })).statusCode, 200)
  assert.equal((await create(work, 'proj', { title: 'Proj', tech: ['PyTorch', 'pytorch', 'Jetson'] })).statusCode, 200)
  const out = await h.call(tags)
  assert.equal(out.statusCode, 200)
  assert.equal(out.headers['cache-control'], 'no-store')
  assert.deepEqual(
    out.body.blog.map((t: any) => `${t.label}:${t.count}`),
    ['Edge AI:2', 'machine learning:1', 'ML:1', 'Notes:1'],
  )
  assert.deepEqual(out.body.work.map((t: any) => `${t.slug}:${t.spellings.length}`), ['jetson:1', 'pytorch:2'])
  assert.equal((await h.call(tags, { auth: false })).statusCode, 401)
})

test('merge: a dry run lists the changes, then every item is rewritten (snapshot first) and pending changes follow', async () => {
  // "two" is live with unpublished changes that still use "machine learning".
  const two = await h.call(posts, { query: { slug: 'two' } })
  const pend = await h.call(posts, { method: 'PUT', body: { slug: 'two', frontmatter: { ...two.body.frontmatter, title: 'Two (revised)' }, body: 'Revised.', target: 'pending' }, headers: { 'if-match': two.headers.etag } })
  assert.equal(pend.statusCode, 200)

  const plan = await h.call(tags, { method: 'POST', body: { collection: 'blog', from: ['ml', 'machine-learning'], to: 'Machine learning', dryRun: true } })
  assert.equal(plan.statusCode, 200, JSON.stringify(plan.body))
  assert.deepEqual(plan.body.items.map((i: any) => `${i.slug}:${i.before.join('|')}>${i.after.join('|')}`), [
    'one:ML|Edge AI>Machine learning|Edge AI',
    'two:machine learning|edge ai>Machine learning|edge ai',
  ])
  assert.equal(plan.body.mergesInto, null)
  assert.deepEqual(plan.revalidated, [])

  const events: any[] = []
  const { onEditorialEvent } = await import('../lib/editorialEvents')
  const off = onEditorialEvent((e) => events.push(e))
  const out = await h.call(tags, { method: 'POST', body: { collection: 'blog', from: ['ml', 'machine-learning'], to: 'Machine learning' } })
  off()
  assert.equal(out.statusCode, 200, JSON.stringify(out.body))
  assert.equal(out.body.items.length, 2)
  for (const p of ['/blog', '/blog/one', '/blog/two', '/work', '/work/proj', '/', '/cv']) assert.ok(out.revalidated.includes(p), p)
  assert.deepEqual(events.map((e) => [e.action, e.collection, e.from, e.to, e.items]), [['tag-merge', 'blog', ['ml', 'machine-learning'], 'Machine learning', 2]])

  const one = await h.call(posts, { query: { slug: 'one' } })
  assert.deepEqual(one.body.frontmatter.tags, ['Machine learning', 'Edge AI'])
  const twoAfter = await h.call(posts, { query: { slug: 'two' } })
  assert.deepEqual(twoAfter.body.frontmatter.tags, ['Machine learning', 'edge ai'])
  assert.deepEqual(twoAfter.body.pending.frontmatter.tags, ['Machine learning', 'edge ai'], 'unpublished changes follow')
  assert.equal(twoAfter.body.pending.frontmatter.title, 'Two (revised)')
  assert.equal(twoAfter.body.pending.baseUpdatedAt, twoAfter.body.updatedAt, 'and still count as based on the live version')
  const { listSnapshots } = await import('../lib/mdx-admin')
  assert.ok(listSnapshots('blog', 'one').length >= 1, 'a history snapshot per item')
})

test('unify spellings and rename into an existing tag (a merge); invalid requests are refused', async () => {
  const unify = await h.call(tags, { method: 'POST', body: { collection: 'blog', from: ['edge-ai'], to: 'Edge AI' } })
  assert.equal(unify.statusCode, 200)
  assert.deepEqual(unify.body.items.map((i: any) => i.slug), ['two'])
  assert.deepEqual((await h.call(posts, { query: { slug: 'two' } })).body.frontmatter.tags, ['Machine learning', 'Edge AI'])

  const into = await h.call(tags, { method: 'POST', body: { collection: 'work', from: ['jetson'], to: 'PyTorch', dryRun: true } })
  assert.equal(into.body.mergesInto, 'pytorch')

  for (const body of [
    { collection: 'blog', from: [], to: 'X' },
    { collection: 'blog', from: ['Not A Slug'], to: 'X' },
    { collection: 'blog', from: ['ml'], to: 'a, b' },
    { collection: 'cv', from: ['ml'], to: 'X' },
  ]) {
    assert.equal((await h.call(tags, { method: 'POST', body })).statusCode, 400, JSON.stringify(body))
  }
  assert.equal((await h.call(tags, { method: 'DELETE' })).statusCode, 405)
})

test('the export: a zip of every item, pending changes, pages, CV, home, redirects and images', async () => {
  const { writePage } = await import('../lib/mdx-admin')
  await writePage('now', { title: 'Now' }, 'Working on ![a diagram](/uploads/now.png).')
  const { applyRename } = await import('../lib/redirects')
  applyRename('blog', 'old-one', 'one', true)
  const out = await h.call(exporter)
  assert.equal(out.statusCode, 200)
  assert.equal(out.headers['content-type'], 'application/zip')
  assert.equal(out.headers['cache-control'], 'no-store')
  assert.match(out.headers['content-disposition'], /^attachment; filename="lucian-dev\.com-content-\d{4}-\d{2}-\d{2}\.zip"$/)
  const entries = readZip(out.body as Buffer)
  const names = entries.map((e) => e.name)
  for (const n of ['README.txt', 'manifest.json', 'blog/one.mdx', 'blog/two.mdx', 'blog/three.mdx', 'work/proj.mdx', 'unpublished-changes/blog/two.mdx', 'pages/now.mdx', 'cv.json', 'redirects.json', 'images.json']) {
    assert.ok(names.includes(n), n)
  }
  const file = (n: string) => entries.find((e) => e.name === n)!.data.toString('utf8')
  assert.equal(matter(file('blog/three.mdx')).data.draft, true, 'drafts are exported with their flag')
  assert.equal(matter(file('unpublished-changes/blog/two.mdx')).data.title, 'Two (revised)')
  const manifest = JSON.parse(file('manifest.json'))
  assert.deepEqual(manifest.counts, { posts: 3, caseStudies: 1, unpublishedChanges: 1, pages: 1, redirects: 1, images: 1 })
  assert.deepEqual(manifest.files.sort(), [...names].sort())
  assert.deepEqual(JSON.parse(file('redirects.json')).map((r: any) => `${r.from}>${r.to}`), ['/blog/old-one>/blog/one'])
  assert.deepEqual(JSON.parse(file('images.json')), [{ url: '/uploads/now.png', kind: 'upload', missing: true, usedIn: ['pages/now.mdx'] }])
  assert.equal((await h.call(exporter, { auth: false })).statusCode, 401)
  assert.equal((await h.call(exporter, { method: 'POST' })).statusCode, 405)
})

test('the admin pages: Tags & export is linked from the admin home and the collection lists', () => {
  const read = (rel: string) => fs.readFileSync(path.join(ORIGINAL_ROOT, rel), 'utf8')
  assert.match(read('pages/admin/index.tsx'), /href: '\/admin\/tags'/)
  assert.match(read('components/Admin/shell/CollectionIndex.tsx'), /'\/admin\/tags\?c=work' : '\/admin\/tags'/)
  assert.match(read('components/Admin/tags/ContentExportCard.tsx'), /fetch\('\/api\/admin\/export'/)
})
