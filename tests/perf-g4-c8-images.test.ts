/**
 * G4 — AVIF and small variants (320 / 480 px, the original's own width) in
 * the upload pipeline, selected by <picture> / srcset; C8 — blur-up
 * placeholders made at upload / backfill and inlined by the pages.
 * (The pipeline itself: tests/r4-authoring-imagevariants, r5-images and
 * fix08-upload-variants.)
 */
import { register } from 'node:module'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PLACEHOLDER_MAX_BYTES,
  expectedVariantNames,
  imageSources,
  placeholderDataUrl,
  placeholderName,
  variantAvifSrcSet,
  variantFilesOf,
  variantFormatsAt,
  variantHome,
  variantName,
  variantSrcSet,
  variantWidthsFor,
} from '../lib/uploadVariants'
import { blurBackgroundImage, isPlaceholder, placeholderStyle, revealOnLoad, revealOnMount } from '../lib/lqip'
import rehypeImages from '../lib/rehype/images'
import { collectImages } from '../lib/rehype/hast'

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { readFileSync } from 'node:fs'
      import { fileURLToPath } from 'node:url'
      import { createRequire } from 'node:module'
      const require = createRequire(${JSON.stringify(new URL('../package.json', import.meta.url).href)})
      const ts = require('typescript')
      export async function resolve(specifier, context, next) {
        if (specifier === 'next/link' || specifier === 'next/router' || specifier === 'next/head' || specifier === 'next/dynamic') return next(specifier + '.js', context)
        return next(specifier, context)
      }
      export async function load(url, context, next) {
        if (url.startsWith('file:') && url.endsWith('.tsx') && !url.includes('/node_modules/')) {
          const source = readFileSync(fileURLToPath(url), 'utf8')
          const out = ts.transpileModule(source, {
            fileName: fileURLToPath(url),
            compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
          })
          return { format: 'module', source: out.outputText, shortCircuit: true }
        }
        return next(url, context)
      }
    `),
  import.meta.url,
)

const html = (el: unknown) => renderToStaticMarkup(el as Parameters<typeof renderToStaticMarkup>[0]).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

const repoRoot = process.cwd()
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'perf-g4-c8-')))
const uploads = path.join(tmp, 'public', 'uploads')

before(() => {
  fs.mkdirSync(uploads, { recursive: true })
  process.chdir(tmp)
})
after(() => {
  process.chdir(repoRoot)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const solid = (w: number, h: number, color: string) => sharp({ create: { width: w, height: h, channels: 3, background: color } })

async function writeSet(name: string, width: number, opts: { skip?: (n: string) => boolean } = {}) {
  const height = Math.round(width * 0.6)
  fs.writeFileSync(path.join(uploads, name), new Uint8Array(await solid(width, height, '#3a6').png().toBuffer()))
  for (const v of expectedVariantNames(name, width)) {
    if (opts.skip?.(v)) continue
    const m = /\.w(\d+)\.(webp|avif)$/.exec(v) as RegExpExecArray
    const img = solid(Number(m[1]), Math.max(1, Math.round(Number(m[1]) * 0.6)), '#3a6')
    const buf = m[2] === 'avif' ? await img.avif().toBuffer() : await img.webp().toBuffer()
    fs.writeFileSync(path.join(uploads, v), new Uint8Array(buf))
  }
}

test('variant plan: 320 / 480 / 640 / 1280 / 1920 below the original, its own width, both formats, a 16 px placeholder', () => {
  assert.deepEqual(variantWidthsFor(1000), [320, 480, 640, 1000])
  assert.deepEqual(variantFormatsAt('a.jpg', 1000, 1000), ['webp', 'avif'])
  assert.deepEqual(variantFormatsAt('a.webp', 1000, 1000), ['avif'], 'a WebP original is its own same-width WebP')
  assert.deepEqual(variantFormatsAt('a.webp', 640, 1000), ['webp', 'avif'])
  assert.deepEqual(expectedVariantNames('a.webp', 500), ['a.webp.w320.webp', 'a.webp.w320.avif', 'a.webp.w480.webp', 'a.webp.w480.avif', 'a.webp.w500.avif', 'a.webp.w16.webp'])
  assert.deepEqual(expectedVariantNames('icon.png', 12), [])
  assert.equal(placeholderName('a.png'), 'a.png.w16.webp')
})

test('variantHome: uploads and the site’s own /images photos; never traversal, variants or remote URLs', () => {
  assert.deepEqual(variantHome('/uploads/a.png'), { dir: uploads, name: 'a.png', base: '/uploads/' })
  const stat = variantHome('/images/imageScroller/fyp.png')
  assert.equal(stat?.name, 'fyp.png')
  assert.equal(stat?.base, '/images/imageScroller/')
  assert.equal(stat?.dir, path.join(tmp, 'public', 'images', 'imageScroller/'))
  for (const bad of ['/images/../uploads/a.png', '/images/a.png.w640.webp', '/images/x.svg', 'https://example.com/a.png', '/uploads/../x.png', '//evil/a.png', 42]) {
    assert.equal(variantHome(bad), null, String(bad))
  }
})

test('the AVIF srcset appears only once the set is complete; the WebP srcset uses whatever exists', async () => {
  await writeSet('full.png', 1000)
  assert.equal(variantSrcSet('/uploads/full.png'), [320, 480, 640, 1000].map((w) => `/uploads/full.png.w${w}.webp ${w}w`).join(', '))
  assert.equal(variantAvifSrcSet('/uploads/full.png'), [320, 480, 640, 1000].map((w) => `/uploads/full.png.w${w}.avif ${w}w`).join(', '))

  await writeSet('partial.png', 1000, { skip: (n) => n === variantName('partial.png', 1000, 'avif') || n === variantName('partial.png', 1000) })
  assert.equal(variantAvifSrcSet('/uploads/partial.png'), undefined, 'a missing AVIF width: no AVIF source at all')
  assert.match(variantSrcSet('/uploads/partial.png') || '', /\/uploads\/partial\.png 1000w$/, 'the original stays the largest WebP-set candidate')
  assert.deepEqual(variantFilesOf(uploads, 'partial.png').length, 7)
})

test('placeholderDataUrl: a small, real WebP only', async () => {
  await writeSet('ph.png', 800)
  const url = placeholderDataUrl('/uploads/ph.png') as string
  assert.match(url, /^data:image\/webp;base64,/)
  assert.ok(isPlaceholder(url))
  fs.writeFileSync(path.join(uploads, 'fake.png'), 'x')
  fs.writeFileSync(path.join(uploads, 'fake.png.w16.webp'), '<svg onload=alert(1)>')
  assert.equal(placeholderDataUrl('/uploads/fake.png'), undefined, 'not a WebP: not inlined')
  fs.writeFileSync(path.join(uploads, 'big.png'), 'x')
  fs.writeFileSync(path.join(uploads, 'big.png.w16.webp'), Buffer.concat([Buffer.from('RIFF0000WEBP'), Buffer.alloc(PLACEHOLDER_MAX_BYTES)]))
  assert.equal(placeholderDataUrl('/uploads/big.png'), undefined, 'too large to inline')
  assert.deepEqual(imageSources('/uploads/none.png'), {})
})

test('lqip: the blur SVG is percent-encoded, keeps the aspect ratio and only takes WebP data URLs', () => {
  const ph = `data:image/webp;base64,${'A'.repeat(40)}`
  const bg = blurBackgroundImage(ph, 1600, 900) as string
  assert.match(bg, /^url\("data:image\/svg\+xml;charset=utf-8,%3Csvg /)
  assert.match(bg, /viewBox='0 0 640 360'/)
  assert.match(bg, /feGaussianBlur/)
  assert.ok(!/[<>"#]/.test(bg.slice(5, -2)), 'nothing raw that would break the url("…")')
  assert.match(blurBackgroundImage(ph) as string, /viewBox='0 0 640 400'/, '16:10 without a size')
  for (const bad of ['javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', `data:image/webp;base64,${'A'.repeat(4000)}`, `data:image/webp;base64,AAA"onerror`, null]) {
    assert.equal(blurBackgroundImage(bad), null, String(bad).slice(0, 30))
  }
  assert.deepEqual(Object.keys(placeholderStyle(ph, { fit: 'cover', position: '20% 80%' })), ['backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat'])
  assert.equal(placeholderStyle(ph, { fit: 'cover' }).backgroundSize, 'cover')
  assert.equal(placeholderStyle(ph).backgroundSize, '100% 100%')
  assert.deepEqual(placeholderStyle('nope'), {})
})

test('reveal states: an image already there never fades; a loading one fades unless fading is off', () => {
  assert.equal(revealOnMount(true, true), 'shown')
  assert.equal(revealOnMount(false, true), 'pending')
  assert.equal(revealOnMount(false, false), 'idle')
  assert.equal(revealOnLoad('pending', true), 'reveal')
  assert.equal(revealOnLoad('idle', false), 'shown')
  assert.equal(revealOnLoad('pending', false), 'shown')
})

type HNode = { type: string; tagName?: string; properties: Record<string, unknown>; children: HNode[] }
const img = (props: Record<string, unknown>): HNode => ({ type: 'element', tagName: 'img', properties: props, children: [] })
const root = (...children: HNode[]) => ({ type: 'root', properties: {}, children: children.map((c) => ({ type: 'element', tagName: 'p', properties: {}, children: [c, { type: 'text', value: ' text', properties: {}, children: [] } as unknown as HNode] })) })

test('rehypeImages sets data-avif-srcset and data-lqip from the stored variants only (never from the author)', async () => {
  const ph = `data:image/webp;base64,${'B'.repeat(40)}`
  const tree = root(
    img({ src: '/uploads/a.png', dataLqip: 'data:image/svg+xml,<svg/>', dataAvifSrcset: 'https://evil.example/x.avif 1w' }),
    img({ src: '/uploads/b.png', srcSet: '/uploads/b-own.png 2x' }),
    img({ src: '/uploads/c.png' }),
  )
  await rehypeImages({
    resolveSize: () => ({ width: 1000, height: 600 }),
    srcSetFor: (src) => (src === '/uploads/c.png' ? null : `${src}.w640.webp 640w`),
    avifSrcSetFor: (src) => `${src}.w640.avif 640w`,
    placeholderFor: (src) => (src === '/uploads/c.png' ? 'data:image/png;base64,AAAA' : ph),
  })(tree as never)
  const [a, b, c] = tree.children.map((p) => (p.children[0] as HNode).properties)
  assert.equal(a.dataAvifSrcset, '/uploads/a.png.w640.avif 640w')
  assert.equal(a.dataLqip, ph)
  assert.equal(b.srcSet, '/uploads/b-own.png 2x', 'an author’s own srcset is kept…')
  assert.equal(b.dataAvifSrcset, undefined, '…and never overridden by an AVIF source')
  assert.equal(c.srcSet, undefined)
  assert.equal(c.dataAvifSrcset, undefined, 'no WebP srcset: no AVIF source either')
  assert.equal(c.dataLqip, undefined, 'only a WebP data: URL is a placeholder')
  const items = collectImages(tree as never)
  assert.equal(items[0].avifSrcSet, '/uploads/a.png.w640.avif 640w', 'the lightbox gets the AVIF set too')
  assert.equal(items[2].avifSrcSet, undefined)
})

test('MdxImage renders a <picture> with the AVIF source and the blurred placeholder behind the frame', async () => {
  const { MdxImage } = await import('../components/MDX/Figure')
  const ph = `data:image/webp;base64,${'C'.repeat(40)}`
  const out = html(
    createElement(MdxImage, {
      src: '/uploads/a.png',
      srcSet: '/uploads/a.png.w640.webp 640w',
      sizes: '100vw',
      width: 1000,
      height: 600,
      alt: 'A',
      'data-avif-srcset': '/uploads/a.png.w640.avif 640w',
      'data-lqip': ph,
    } as never),
  )
  assert.match(out, /<picture style="display:contents"><source type="image\/avif" srcSet="\/uploads\/a\.png\.w640\.avif 640w" sizes="100vw"\/><img /)
  assert.match(out, /data-lqip="idle"/)
  assert.match(out, /background-image:url\(&quot;data:image\/svg\+xml/)
  const plain = html(createElement(MdxImage, { src: '/uploads/x.png', alt: 'X' } as never))
  assert.doesNotMatch(plain, /<picture|data-lqip|background-image/)
})

test('CoverFrame: AVIF source and placeholder for a large cover; a small cover keeps its panel', async () => {
  const { default: CoverFrame } = await import('../components/Work/CoverFrame')
  const ph = `data:image/webp;base64,${'D'.repeat(40)}`
  const cover = { src: '/uploads/c.png', srcSet: '/uploads/c.png.w640.webp 640w', avifSrcSet: '/uploads/c.png.w640.avif 640w', placeholder: ph, alt: 'C', width: 1600, height: 1000, small: false, focus: '30% 70%' }
  const out = html(createElement(CoverFrame, { cover, title: 'T', sizes: '100vw', eager: true }))
  assert.match(out, /<source type="image\/avif" srcSet="\/uploads\/c\.png\.w640\.avif 640w" sizes="100vw"\/>/)
  assert.match(out, /background-size:cover;background-position:30% 70%/)
  const small = html(createElement(CoverFrame, { cover: { ...cover, small: true }, title: 'T', sizes: '100vw' }))
  assert.doesNotMatch(small, /data:image\/svg\+xml/, 'the small cover’s panel is never replaced by a blur')
})

test('the field-note photos under public/images have their baked variants (scripts/bake-images.mjs)', () => {
  process.chdir(repoRoot)
  try {
    const dir = path.join(repoRoot, 'public', 'images', 'imageScroller')
    const photos = fs.readdirSync(dir).filter((n) => /\.(png|jpe?g)$/i.test(n))
    assert.ok(photos.length > 0)
    for (const name of photos) {
      const s = imageSources(`/images/imageScroller/${name}`)
      assert.ok(s.srcSet && s.avifSrcSet && s.placeholder, `${name}: srcset, AVIF and placeholder`)
      assert.doesNotMatch(s.srcSet, new RegExp(`/${name.replace(/\./g, '\\.')} \\d+w`), `${name}: the same-width WebP replaces the original`)
    }
  } finally {
    process.chdir(tmp)
  }
})
