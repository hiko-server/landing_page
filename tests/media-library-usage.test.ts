import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanUsage, uploadRefsIn, originalOfRef, altState, weakerAlt, homeFieldLabel, type UsageSources } from '../lib/media/usage'
import { rewriteUploadText, rewriteUploadJson, rewriteUploadDocument } from '../lib/media/rewrite'
import { cleanLine, cleanMeta, readMetaDoc, metaFor, ALT_MAX } from '../lib/media/meta'
import { parseImageUpload } from '../lib/media/uploadBody'
import { altForLang, fillBodyAlt, fillCoverAlt, jsxAltAttribute, markdownAlt } from '../lib/media/applyAlt'
import { scanBody } from '../lib/contentHealth/mdxScan'
import {
  EMPTY_FILTER,
  daysLeft,
  filterFromQuery,
  filterItems,
  filterToQuery,
  flagCounts,
  formatBytes,
  imageMarkdown,
  matchesQuery,
  orientationOf,
  sortItems,
  tileLabel,
  usedInCount,
} from '../lib/media/view'
import type { MediaItem, MediaUsage } from '../lib/media/types'

/**
 * H7 — the media library's pure parts: where content refers to uploads,
 * rewriting references for "Replace file", the default texts, the upload
 * body check and the admin view's search / filters / sorting.
 */

const empty: UsageSources = { items: [], pending: [], pages: [], home: null, cv: null, other: [] }

test('H7 usage: references anywhere in a text, variants count for their original, with lines', () => {
  const text = [
    'Intro',
    '![A field](/uploads/field.jpg)',
    '<img src="/uploads/field.jpg.w640.webp" alt="x" />',
    'See https://lucian-dev.com/uploads/plan.png. Or `/uploads/code.png` in code.',
    '/uploads/field.jpg-w640.webp is another file; /uploads/../etc is nothing',
  ].join('\n')
  assert.deepEqual(
    uploadRefsIn(text).map((r) => `${r.name}@${r.line}`),
    ['field.jpg@2', 'field.jpg@3', 'plan.png@4', 'code.png@4', 'field.jpg-w640.webp@5'],
  )
  assert.equal(originalOfRef('photo.jpg.w1920.avif'), 'photo.jpg')
  assert.equal(originalOfRef('photo.jpg.'), 'photo.jpg')
  assert.equal(originalOfRef('%E0%A4%A'), null)
  assert.deepEqual(uploadRefsIn(42), [])
})

test('H7 usage: alt states — missing, file-name / camera alts, decorative JSX, the weakest wins', () => {
  assert.equal(altState(''), 'missing')
  assert.equal(altState(null, true), 'missing')
  assert.equal(altState('', true), 'decorative')
  assert.equal(altState('IMG_2041.jpg'), 'meaningless')
  assert.equal(altState('DSC 1234'), 'meaningless')
  assert.equal(altState('The team at the Hong Kong office'), 'ok')
  assert.equal(weakerAlt('ok', 'missing'), 'missing')
  assert.equal(weakerAlt('meaningless', 'decorative'), 'meaningless')
  assert.equal(weakerAlt(null, 'ok'), 'ok')
})

test('H7 usage: posts, drafts, unpublished changes, pages, home, CV and other documents', () => {
  const usage = scanUsage(
    {
      items: [
        {
          collection: 'blog',
          slug: 'edge-ml',
          frontmatter: { title: 'Edge ML', cover: '/uploads/cover.png', coverAlt: '', gallery: ['/uploads/g1.webp'] },
          body: 'Text\n\n![](/uploads/inline.png)\n\nMore ![Server rack in the lab](/uploads/inline.png "Rack")\n',
        },
        { collection: 'work', slug: 'swcs', frontmatter: { title: 'SWCS', draft: true }, body: '<Figure src="/uploads/fig.jpg" alt="Diagram of the pipeline" />' },
      ],
      pending: [{ collection: 'blog', slug: 'edge-ml', frontmatter: { title: 'Edge ML (v2)', cover: '/uploads/cover-2.png', coverAlt: 'A chip' }, body: '' }],
      pages: [{ name: 'now', frontmatter: {}, body: 'Working on ![desk](/uploads/desk.jpg)' }],
      home: {
        hero: { avatarUrl: '/uploads/me.jpg' },
        brands: [{ name: 'CUHK', image: '/uploads/cuhk.png' }],
        photos: [{ url: '/uploads/trip.jpg', describe: 'Hiking in Sai Kung', visible: false }],
      },
      cv: { en: [{ sessionName: 'personalInformation', photo: '/uploads/id.jpg' }], zh: [{ sessionName: 'projects', headerName: '项目', items: [{ link: 'https://x/uploads/zh.png' }] }] },
      other: [{ key: 'inbox-templates', value: { en: 'see /uploads/sig.png' } }],
    },
    { scanBody },
  )
  const by = (name: string) => usage.filter((u) => u.name === name)
  const cover = by('cover.png')[0]
  assert.equal(cover.label, 'Cover')
  assert.equal(cover.alt, 'missing', 'an empty coverAlt')
  assert.equal(cover.doc, 'blog/edge-ml')
  assert.equal(cover.docState, 'live')
  assert.equal(cover.publicHref, '/blog/edge-ml')
  assert.equal(cover.editHref, '/admin/blog/edit?slug=edge-ml')
  assert.equal(by('g1.webp')[0].label, 'Frontmatter › Gallery › 1')

  const inline = by('inline.png')
  assert.equal(inline.length, 1, 'one place: the body')
  assert.equal(inline[0].count, 2)
  assert.equal(inline[0].label, 'Body · lines 3, 5')
  assert.equal(inline[0].line, 3)
  assert.equal(inline[0].alt, 'missing', 'the weakest of the two images')

  const pending = by('cover-2.png')[0]
  assert.equal(pending.doc, 'blog/edge-ml#pending')
  assert.equal(pending.docState, 'pending')
  assert.equal(pending.publicHref, null)
  assert.equal(pending.alt, 'ok')

  const fig = by('fig.jpg')[0]
  assert.equal(fig.docState, 'draft')
  assert.equal(fig.publicHref, null)
  assert.equal(fig.alt, 'ok')

  assert.equal(by('desk.jpg')[0].docTitle, '/now')
  assert.equal(by('me.jpg')[0].label, 'Introduction › Portrait')
  assert.equal(by('cuhk.png')[0].label, 'Brand strip › CUHK › Logo')
  assert.equal(by('trip.jpg')[0].label, 'Field notes › Hiking in Sai Kung (hidden)', 'hidden photos still count')
  const photo = by('id.jpg')[0]
  assert.equal(photo.label, 'Photo (PDF only) · EN')
  assert.equal(photo.docState, 'private')
  assert.equal(photo.publicHref, null)
  assert.equal(by('zh.png')[0].label, '中文 · 项目 › Items › 1 › Link')
  assert.equal(by('sig.png')[0].doc, 'kv/inbox-templates')
  assert.deepEqual(scanUsage(empty), [])
})

test('H7 usage: home labels for unknown paths read as words', () => {
  assert.equal(homeFieldLabel({}, ['openSource', 0, 'imageUrl']), 'Open Source › 1 › Image Url')
  assert.equal(homeFieldLabel({ photos: [{}] }, ['photos', 0, 'url']), 'Field notes › Photo 1')
})

test('H7 rewrite: whole names only, variants follow when the new file has them, JSON and documents', () => {
  const exists = (v: string) => v === 'new.png.w640.webp'
  const text = '![a](/uploads/old.jpg) <img srcset="/uploads/old.jpg.w640.webp 640w, /uploads/old.jpg.w320.avif 320w"> /uploads/old.jpg-w640.webp /uploads/old.jpg.bak https://x.dev/uploads/old.jpg'
  const r = rewriteUploadText(text, 'old.jpg', 'new.png', exists)
  assert.equal(r.count, 4)
  assert.equal(
    r.value,
    '![a](/uploads/new.png) <img srcset="/uploads/new.png.w640.webp 640w, /uploads/new.png 320w"> /uploads/old.jpg-w640.webp /uploads/old.jpg.bak https://x.dev/uploads/new.png',
  )
  const same = rewriteUploadText('nothing here', 'old.jpg', 'new.png')
  assert.equal(same.count, 0)

  const json = rewriteUploadJson({ hero: { avatarUrl: '/uploads/old.jpg' }, list: ['/uploads/old.jpg', 3, null], keep: '/uploads/other.jpg' }, 'old.jpg', 'new.png')
  assert.equal(json.count, 2)
  assert.deepEqual(json.value, { hero: { avatarUrl: '/uploads/new.png' }, list: ['/uploads/new.png', 3, null], keep: '/uploads/other.jpg' })
  const untouched = { a: '/uploads/x.jpg' }
  assert.equal(rewriteUploadJson(untouched, 'old.jpg', 'new.png').value, untouched, 'unchanged values keep their identity')

  const doc = rewriteUploadDocument({ frontmatter: { cover: '/uploads/old.jpg', title: 'T' }, body: 'x ![](/uploads/old.jpg)' }, 'old.jpg', 'new.png')
  assert.equal(doc.count, 2)
  assert.deepEqual(doc.value, { frontmatter: { cover: '/uploads/new.png', title: 'T' }, body: 'x ![](/uploads/new.png)' })
})

test('H7 meta: one clean line per text, capped; unknown shapes dropped; no fallback between languages', () => {
  assert.equal(cleanLine('  A\tteam\n photo\u2028 ', 50), 'A team photo')
  assert.equal(cleanLine(42, 50), '')
  assert.equal(cleanLine('x'.repeat(400), ALT_MAX).length, ALT_MAX)
  assert.deepEqual(cleanMeta({ alt: ' Hi ', caption: 7 }, { alt: '', altZh: '你好', caption: 'old', captionZh: '' }), { alt: 'Hi', altZh: '你好', caption: '', captionZh: '' })
  const doc = readMetaDoc({ items: { 'a.jpg': { alt: 'A', updatedAt: 5 }, 'b.jpg': { alt: '  ' }, 'c.jpg': 'nope' }, junk: true })
  assert.deepEqual(doc, { v: 1, items: { 'a.jpg': { alt: 'A', altZh: '', caption: '', captionZh: '', updatedAt: 5 } } })
  assert.deepEqual(readMetaDoc(null), { v: 1, items: {} })
  const meta = { alt: 'A desk', altZh: '', caption: 'My desk', captionZh: '我的书桌' }
  assert.deepEqual(metaFor(meta, 'en'), { alt: 'A desk', caption: 'My desk' })
  assert.deepEqual(metaFor(meta, 'zh'), { alt: '', caption: '我的书桌' })
  assert.deepEqual(metaFor(null, 'en'), { alt: '', caption: '' })
})

test('H7 upload body: the declared type must be an accepted image the bytes really are', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
  const ok = parseImageUpload({ filename: 'a.png', dataUrl: `data:image/png;base64,${png.toString('base64')}` })
  assert.ok(ok.ok && ok.mime === 'image/png' && ok.buf.length === png.length)
  assert.deepEqual(parseImageUpload({}), { ok: false, status: 400, error: 'Missing fields' })
  assert.equal((parseImageUpload({ filename: 'a', dataUrl: 'nope' }) as { status: number }).status, 400)
  assert.equal((parseImageUpload({ filename: 'a.svg', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }) as { status: number }).status, 415)
  assert.equal((parseImageUpload({ filename: 'a.png', dataUrl: 'data:image/png;base64,' + Buffer.from('<html>').toString('base64') }) as { status: number }).status, 400)
})

// ── The admin view ──────────────────────────────────────────────────────────

const usageRow = (over: Partial<MediaUsage>): MediaUsage => ({
  name: 'x',
  doc: 'blog/a',
  field: 'body',
  label: 'Body',
  line: 1,
  alt: 'ok',
  count: 1,
  docKind: 'post',
  docTitle: 'A post',
  docState: 'live',
  editHref: null,
  publicHref: null,
  ...over,
})

function item(over: Partial<MediaItem>): MediaItem {
  return {
    name: 'a.jpg',
    url: '/uploads/a.jpg',
    bytes: 1000,
    width: 1600,
    height: 900,
    format: 'jpeg',
    animated: false,
    addedAt: 1,
    local: true,
    r2: null,
    r2Missing: null,
    variants: { eligible: true, present: [], missing: [], placeholder: true, bytes: 0 },
    thumb: '/uploads/a.jpg',
    usage: [],
    meta: null,
    replaces: [],
    ...over,
  }
}

const items: MediaItem[] = [
  item({ name: 'desk.jpg', addedAt: 3, bytes: 900_000, meta: { alt: 'A desk', altZh: '', caption: '', captionZh: '', updatedAt: 1 }, usage: [usageRow({ doc: 'blog/a' }), usageRow({ doc: 'blog/a#pending' })] }),
  item({ name: 'logo.png', format: 'png', width: 400, height: 400, addedAt: 2, usage: [usageRow({ doc: 'home', alt: null }), usageRow({ doc: 'blog/b', alt: 'missing' })], meta: { alt: '', altZh: '标志', caption: '', captionZh: '', updatedAt: 1 } }),
  item({ name: 'tall.webp', format: 'webp', width: 800, height: 1600, addedAt: 1, variants: { eligible: true, present: [], missing: ['tall.webp.w320.avif'], placeholder: false, bytes: 0 }, r2: false, r2Missing: 3 }),
]

test('H7 view: orientation, counts, search across texts and where it is used', () => {
  assert.equal(orientationOf(1600, 900), 'landscape')
  assert.equal(orientationOf(1000, 1040), 'square')
  assert.equal(orientationOf(800, 1600), 'portrait')
  assert.equal(orientationOf(null, 5), null)
  assert.equal(usedInCount(items[0]), 1, 'the live and pending versions are one document')
  assert.deepEqual(flagCounts(items), { missingAlt: 2, unused: 1, needsSizes: 1, large: 1, notInR2: 1 })
  assert.ok(matchesQuery(items[0], 'DESK a post'))
  assert.ok(matchesQuery(items[1], '标志'))
  assert.ok(!matchesQuery(items[1], 'desk'))
})

test('H7 view: filters combine; sorting is stable', () => {
  const names = (list: MediaItem[]) => list.map((i) => i.name)
  assert.deepEqual(names(filterItems(items, { ...EMPTY_FILTER, flags: ['missingAlt'] })), ['logo.png', 'tall.webp'])
  assert.deepEqual(names(filterItems(items, { ...EMPTY_FILTER, flags: ['missingAlt', 'unused'] })), ['tall.webp'])
  assert.deepEqual(names(filterItems(items, { ...EMPTY_FILTER, orientation: 'square' })), ['logo.png'])
  assert.deepEqual(names(filterItems(items, { ...EMPTY_FILTER, type: 'webp' })), ['tall.webp'])
  assert.deepEqual(names(filterItems(items, { ...EMPTY_FILTER, flags: ['large'] })), ['desk.jpg'])
  assert.deepEqual(names(filterItems(items, { ...EMPTY_FILTER, flags: ['notInR2'] })), ['tall.webp'])
  assert.deepEqual(names(sortItems(items, 'oldest')), ['tall.webp', 'logo.png', 'desk.jpg'])
  assert.deepEqual(names(sortItems(items, 'largest')), ['desk.jpg', 'logo.png', 'tall.webp'])
  assert.deepEqual(names(sortItems(items, 'most-used')), ['logo.png', 'desk.jpg', 'tall.webp'])
  assert.deepEqual(names(sortItems(items, 'name')), ['desk.jpg', 'logo.png', 'tall.webp'])
})

test('H7 view: URL state round-trips and ignores junk', () => {
  const { filter, sort } = filterFromQuery({ q: 'desk', type: 'png', orientation: 'square', filter: 'unused,bogus,unused', sort: 'largest' })
  assert.deepEqual(filter, { q: 'desk', type: 'png', orientation: 'square', flags: ['unused'] })
  assert.equal(sort, 'largest')
  assert.deepEqual(filterToQuery(filter, sort), { q: 'desk', type: 'png', orientation: 'square', filter: 'unused', sort: 'largest' })
  assert.deepEqual(filterFromQuery({ type: 'svg', sort: 'x' }), { filter: EMPTY_FILTER, sort: 'newest' })
  assert.deepEqual(filterToQuery(EMPTY_FILTER, 'newest'), {})
})

test('H7 view: labels, sizes, trash countdown and Markdown', () => {
  assert.equal(formatBytes(980), '980 B')
  assert.equal(formatBytes(240 * 1024), '240 KB')
  assert.equal(formatBytes(1.4 * 1024 * 1024), '1.4 MB')
  assert.equal(formatBytes(-1), '—')
  assert.equal(tileLabel(items[2]), 'tall.webp, WebP, 800 by 1600 pixels, 1000 B, unused, no alt text, missing responsive sizes')
  const now = Date.UTC(2026, 9, 21)
  assert.equal(daysLeft({ purgeAt: now + 29.2 * 86_400_000 }, now), '30 days left')
  assert.equal(daysLeft({ purgeAt: now + 3600_000 }, now), '1 day left')
  assert.equal(daysLeft({ purgeAt: now - 1 }, now), 'removed tonight')
  assert.equal(imageMarkdown('/uploads/a.png', 'A [b]', 'Say "hi"'), '![A \\[b\\]](/uploads/a.png "Say \\"hi\\"")')
  assert.equal(imageMarkdown('/uploads/a.png', '', ''), '![](/uploads/a.png)')
})

test('H7 fill in alt: Markdown and JSX images of that upload only; decorative and code left alone', () => {
  const body = [
    '![](/uploads/desk.jpg)',
    '',
    '![IMG_2041.jpg](/uploads/desk.jpg.w640.webp "Caption")',
    '',
    '![Already described](/uploads/desk.jpg)',
    '',
    '<img src="/uploads/desk.jpg" />',
    '',
    '<Figure src="/uploads/desk.jpg" alt="" />',
    '',
    "<img alt='DSC_0001' src=\"/uploads/desk.jpg\" />",
    '',
    '![](/uploads/other.jpg)',
    '',
    '```md',
    '![](/uploads/desk.jpg)',
    '```',
  ].join('\n')
  const out = fillBodyAlt(body, scanBody(body), 'desk.jpg', 'A [standing] desk')
  assert.equal(out.changed, 4)
  const lines = out.body.split('\n')
  assert.equal(lines[0], '![A \\[standing\\] desk](/uploads/desk.jpg)')
  assert.equal(lines[2], '![A \\[standing\\] desk](/uploads/desk.jpg.w640.webp "Caption")')
  assert.equal(lines[4], '![Already described](/uploads/desk.jpg)')
  assert.equal(lines[6], '<img alt="A [standing] desk" src="/uploads/desk.jpg" />')
  assert.equal(lines[8], '<Figure src="/uploads/desk.jpg" alt="" />', 'decorative on purpose')
  assert.equal(lines[10], '<img alt="A [standing] desk" src="/uploads/desk.jpg" />')
  assert.equal(lines[12], '![](/uploads/other.jpg)')
  assert.equal(lines[15], '![](/uploads/desk.jpg)', 'code is literal')
  assert.deepEqual(fillBodyAlt(body, scanBody(body), 'desk.jpg', '  '), { body, changed: 0 })
  assert.equal(markdownAlt(' a\\b '), 'a\\\\b')
  assert.equal(jsxAltAttribute('He said "hi"'), "alt='He said \"hi\"'")
  assert.equal(jsxAltAttribute(`"it's"`), null)
})

test('H7 fill in alt: covers without a real alt; the language picks the text', () => {
  assert.deepEqual(fillCoverAlt({ cover: '/uploads/desk.jpg', coverAlt: '' }, 'desk.jpg', 'A desk'), { frontmatter: { cover: '/uploads/desk.jpg', coverAlt: 'A desk' }, changed: 1 })
  assert.equal(fillCoverAlt({ cover: '/uploads/desk.jpg', coverAlt: 'IMG_1234.jpg' }, 'desk.jpg', 'A desk').changed, 1)
  assert.equal(fillCoverAlt({ cover: '/uploads/desk.jpg', coverAlt: 'My desk at home' }, 'desk.jpg', 'A desk').changed, 0)
  assert.equal(fillCoverAlt({ cover: '/uploads/other.jpg' }, 'desk.jpg', 'A desk').changed, 0)
  const meta = { alt: 'A desk', altZh: '书桌' }
  assert.equal(altForLang('en', meta), 'A desk')
  assert.equal(altForLang('zh-Hans', meta), '书桌')
  assert.equal(altForLang('zh-Hant', { alt: 'A desk', altZh: '' }), '')
  assert.equal(altForLang('ja', meta), '')
})
