import { test } from 'node:test'
import assert from 'node:assert/strict'
import rehypeHeadings from '../lib/rehype/headings'
import rehypeImages, { captionFor } from '../lib/rehype/images'
import { imageSizeFromBytes } from '../lib/rehype/imageSize'
import { createRequire } from 'node:module'
import type { HastNode } from '../lib/rehype/hast'
import type { TocEntry } from '../lib/toc'

const text = (value: string): HastNode => ({ type: 'text', value })
const el = (tagName: string, properties: Record<string, unknown>, children: HastNode[] = []): HastNode => ({
  type: 'element',
  tagName,
  properties,
  children,
})

test('headings get unique ids, self-links and a TOC of h2/h3', () => {
  const tree = el('root', {}, [
    el('h2', {}, [text('Overview')]),
    el('h3', {}, [text('Details '), el('code', {}, [text('x()')])]),
    el('h4', {}, [text('Deep')]),
    el('h2', {}, [text('Overview')]),
    el('h2', { id: 'custom' }, [text('Kept id')]),
    el('h3', {}, [el('a', { href: 'https://x.com' }, [text('Demo')]), text(' link')]),
    el('h2', {}, [text('   ')]),
  ])
  tree.type = 'root'
  let toc: TocEntry[] = []
  rehypeHeadings({ onToc: (t) => (toc = t) })(tree)

  assert.deepEqual(toc, [
    { id: 'overview', text: 'Overview', depth: 2 },
    { id: 'details-x', text: 'Details x()', depth: 3 },
    { id: 'overview-1', text: 'Overview', depth: 2 },
    { id: 'custom', text: 'Kept id', depth: 2 },
    { id: 'demo-link', text: 'Demo link', depth: 3 },
  ])
  const [h2] = tree.children!
  assert.equal(h2.properties!.id, 'overview')
  const anchor = h2.children![0]
  assert.equal(anchor.tagName, 'a')
  assert.deepEqual(anchor.properties, { className: ['heading-anchor'], href: '#overview' })
  assert.equal(anchor.children![0].value, 'Overview')
  // h4 gets an id but is not in the TOC.
  assert.equal(tree.children![2].properties!.id, 'deep')
  // A heading containing a link gets a separate trailing anchor (no nested links).
  const linked = tree.children![5]
  const last = linked.children![linked.children!.length - 1]
  assert.deepEqual(last.properties!.className, ['heading-anchor', 'heading-anchor-icon'])
  assert.equal(last.properties!.href, '#demo-link')
  assert.equal(linked.children![0].properties!.href, 'https://x.com')
})

test('an existing element id is never reused for a heading', () => {
  const tree = el('root', {}, [el('div', { id: 'intro' }), el('h2', {}, [text('Intro')])])
  rehypeHeadings()(tree)
  assert.equal(tree.children![1].properties!.id, 'intro-1')
})

test('images: lazy/async, sized when known, lone images become captioned figures', async () => {
  const tree = el('root', {}, [
    el('p', {}, [text('\n'), el('img', { src: '/a.png', alt: 'A chart of latency' }), text(' ')]),
    el('p', {}, [el('img', { src: '/b.png', alt: 'image.png' })]),
    el('p', {}, [el('img', { src: 'https://cdn/x.jpg', alt: 'x', title: 'Real caption' })]),
    el('p', {}, [el('img', { src: '/c.png', alt: 'inline' }), text(' (Ref: somewhere)')]),
  ])
  await rehypeImages({
    resolveSize: async (src) => (src.startsWith('/') ? { width: 800, height: 600 } : null),
    srcSetFor: (src) => (src === '/a.png' ? '/a.w640.webp 640w, /a.png 800w' : undefined),
  })(tree)
  const [f1, f2, f3, p4] = tree.children!

  assert.equal(f1.tagName, 'figure')
  assert.deepEqual(f1.properties!.className, ['article-figure'])
  const img1 = f1.children![0]
  assert.equal(img1.properties!.loading, 'lazy')
  assert.equal(img1.properties!.decoding, 'async')
  assert.equal(img1.properties!.width, 800)
  assert.equal(img1.properties!.height, 600)
  assert.equal(img1.properties!.srcSet, '/a.w640.webp 640w, /a.png 800w')
  assert.equal(img1.properties!.sizes, '(min-width: 768px) 720px, 100vw')
  assert.equal(f1.children![1].tagName, 'figcaption')
  assert.equal(f1.children![1].children![0].value, 'A chart of latency')

  // File-name alt → figure without caption.
  assert.equal(f2.tagName, 'figure')
  assert.equal(f2.children!.length, 1)

  // Title wins and the duplicate tooltip is dropped; remote image stays unsized.
  assert.equal(f3.children![1].children![0].value, 'Real caption')
  assert.equal(f3.children![0].properties!.title, undefined)
  assert.equal(f3.children![0].properties!.width, undefined)

  assert.equal(f2.children![0].properties!.srcSet, undefined)

  // Image sharing a paragraph with text stays inline (no figure inside <p>).
  assert.equal(p4.tagName, 'p')
  assert.equal(p4.children![0].properties!.loading, 'lazy')
  assert.equal(p4.children![0].properties!.width, 800)
})

test('captionFor ignores file-name alts', () => {
  assert.equal(captionFor('1755661280418.jpg', ''), '')
  assert.equal(captionFor('Car Boy 产品页面', undefined), 'Car Boy 产品页面')
  assert.equal(captionFor('alt', ' Title '), 'Title')
  assert.equal(captionFor(undefined, undefined), '')
})

test('imageSizeFromBytes reads PNG, GIF, JPEG (with EXIF rotation) and WebP headers', () => {
  const png = new Uint8Array(32)
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  png.set([0, 0, 0x03, 0x20, 0, 0, 0x02, 0x58], 16) // 800 × 600
  assert.deepEqual(imageSizeFromBytes(png), { width: 800, height: 600 })

  const gif = new Uint8Array(16)
  gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00]) // 320 × 240
  assert.deepEqual(imageSizeFromBytes(gif), { width: 320, height: 240 })

  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0] // 800w × 600h
  const jpeg = new Uint8Array([0xff, 0xd8, ...sof])
  assert.deepEqual(imageSizeFromBytes(jpeg), { width: 800, height: 600 })

  // APP1 Exif, big-endian TIFF, one IFD entry: Orientation (0x0112) = 6 (rotate 90°).
  const exif = [
    0x45, 0x78, 0x69, 0x66, 0, 0, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, // TIFF header, IFD at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1, 0x00, 0x06, 0, 0, // orientation = 6
    0, 0, 0, 0,
  ]
  const app1 = [0xff, 0xe1, 0x00, exif.length + 2, ...exif]
  const rotated = new Uint8Array([0xff, 0xd8, ...app1, ...sof])
  assert.deepEqual(imageSizeFromBytes(rotated), { width: 600, height: 800 })

  const webp = new Uint8Array(30)
  webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58])
  webp.set([0x7f, 0x02, 0x00, 0x1f, 0x03, 0x00], 24) // 640 × 800 (stored minus one, 24-bit LE)
  assert.deepEqual(imageSizeFromBytes(webp), { width: 640, height: 800 })

  assert.equal(imageSizeFromBytes(new Uint8Array(40)), null)
})

test('a failing size or srcset lookup never breaks compilation', async () => {
  const tree = el('root', {}, [el('p', {}, [el('img', { src: '/x.png', alt: 'x' })])])
  await rehypeImages({
    resolveSize: () => Promise.reject(new Error('disk gone')),
    srcSetFor: () => {
      throw new Error('boom')
    },
  })(tree)
  const img = tree.children![0].children![0]
  assert.equal(img.properties!.width, undefined)
  assert.equal(img.properties!.loading, 'lazy')
})

test('the production CSP has no unsafe-eval; development keeps it for React Refresh', () => {
  const { buildCsp } = createRequire(import.meta.url)('../lib/csp.js') as { buildCsp: (env?: string) => string }
  const prod = buildCsp('production')
  assert.ok(!prod.includes("'unsafe-eval'"), prod)
  assert.match(prod, /script-src 'self' 'unsafe-inline'/)
  assert.match(prod, /frame-src https:\/\/www\.youtube-nocookie\.com/)
  // Only the GitHub API besides 'self' (the optional Sentry hosts went with the integration).
  assert.match(prod, /(^|; )connect-src 'self' https:\/\/api\.github\.com;/)
  assert.ok(!/sentry/i.test(prod), prod)
  assert.ok(!buildCsp('test').includes("'unsafe-eval'"))
  assert.match(buildCsp('development'), /script-src [^;]*'unsafe-eval'/)
})
