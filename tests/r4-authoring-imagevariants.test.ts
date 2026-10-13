/**
 * Upload pipeline (E6): sharp downscale + WebP variants, EXIF rotation,
 * GIF passthrough, never-blocking failure, variant naming and srcset.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { processUpload, sniffImageType, storeUpload, MAX_EDGE } from '../lib/imageVariants'
import { UPLOAD_NAME_RE } from '../lib/security/uploadName'
import { VARIANT_WIDTHS, isVariantName, uploadNameOf, variantName, variantSrcSet, variantWidthsFor } from '../lib/uploadVariants'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-authoring-img-'))

before(() => process.chdir(tmp))
after(() => {
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 30, g: 80, b: 200 } } })
    .png()
    .toBuffer()

test('a 3000×2000 PNG is downscaled to a 2560 long edge with 640/1280/1920 WebP variants', async () => {
  const out = await processUpload(await png(3000, 2000), 'big.png')
  assert.equal(out.width, MAX_EDGE)
  assert.equal(out.height, Math.round((2000 * MAX_EDGE) / 3000))
  const meta = await sharp(out.buf).metadata()
  assert.equal(meta.format, 'png')
  assert.equal(Math.max(meta.width!, meta.height!), 2560)
  assert.deepEqual(
    out.variants.map((v) => [v.name, v.width]),
    [
      ['big.png.w640.webp', 640],
      ['big.png.w1280.webp', 1280],
      ['big.png.w1920.webp', 1920],
    ],
  )
  for (const v of out.variants) {
    const vm = await sharp(v.buf).metadata()
    assert.equal(vm.format, 'webp')
    assert.equal(vm.width, v.width)
    assert.ok(UPLOAD_NAME_RE.test(v.name))
  }
})

test('a small image keeps its size and format (re-encoded) with only the narrower variants', async () => {
  const buf = await png(800, 600)
  const out = await processUpload(buf, 'small.png')
  const meta = await sharp(out.buf).metadata()
  assert.equal(meta.format, 'png')
  assert.deepEqual([meta.width, meta.height], [800, 600])
  assert.deepEqual([out.width, out.height], [800, 600])
  assert.deepEqual(
    out.variants.map((v) => v.width),
    [640],
  )
})

test('EXIF orientation is applied (portrait phone photo)', async () => {
  const jpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#888' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const out = await processUpload(jpeg, 'phone.jpg')
  assert.deepEqual([out.width, out.height], [300, 400])
  const meta = await sharp(out.buf).metadata()
  assert.deepEqual([meta.width, meta.height], [300, 400])
  assert.ok(!meta.orientation || meta.orientation === 1)
})

test('GIFs pass through untouched without variants; broken bytes never throw', async () => {
  const gif = await sharp({ create: { width: 2000, height: 100, channels: 3, background: '#f00' } })
    .gif()
    .toBuffer()
  const out = await processUpload(gif, 'anim.gif')
  assert.ok(out.buf.equals(gif))
  assert.deepEqual(out.variants, [])
  assert.equal(out.width, 2000)

  const junk = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)])
  const broken = await processUpload(junk, 'broken.png')
  assert.ok(broken.buf.equals(junk))
  assert.deepEqual(broken.variants, [])
})

test('storeUpload writes the original and variants under fresh names; variantSrcSet lists them', async () => {
  const buf = await png(2000, 1000)
  const first = await storeUpload(buf, 'image/png', 'My Photo.png')
  assert.equal(first.url, '/uploads/My_Photo.png')
  assert.deepEqual(first.variants, ['/uploads/My_Photo.png.w640.webp', '/uploads/My_Photo.png.w1280.webp', '/uploads/My_Photo.png.w1920.webp'])
  for (const v of first.variants) assert.ok(fs.existsSync(path.join(tmp, 'public', v)))
  assert.equal(
    variantSrcSet(first.url),
    '/uploads/My_Photo.png.w640.webp 640w, /uploads/My_Photo.png.w1280.webp 1280w, /uploads/My_Photo.png.w1920.webp 1920w, /uploads/My_Photo.png 2000w',
  )
  const second = await storeUpload(buf, 'image/png', 'My Photo.png')
  assert.notEqual(second.url, first.url, 'never overwrites')
  assert.equal(variantSrcSet('/uploads/missing.png'), undefined)
  assert.equal(variantSrcSet('https://example.com/a.png'), undefined)
})

test('variant helpers', () => {
  assert.equal(variantName('a.b.jpg', 640), 'a.b.jpg.w640.webp')
  assert.equal(isVariantName('a.png.w1280.webp'), true)
  assert.equal(isVariantName('a.w1280.webp'), false, 'no original extension: a (legacy) original')
  assert.equal(isVariantName('a.webp'), false)
  assert.deepEqual(variantWidthsFor(1300), [640, 1280])
  assert.deepEqual([...VARIANT_WIDTHS], [640, 1280, 1920])
  assert.equal(uploadNameOf('/uploads/a.jpg.w640.webp'), null, 'variants are not originals')
  assert.equal(uploadNameOf('/uploads/../etc'), null)
  assert.equal(uploadNameOf('/uploads/ok.png?v=1'), 'ok.png')
  assert.equal(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
})
