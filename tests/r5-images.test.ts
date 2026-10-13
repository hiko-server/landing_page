/**
 * R5 upload-pipeline fixes: variant names carry the original's extension
 * (photo.jpg / photo.png never share variants), clashes on any variant name
 * get the hash suffix, only written files are mirrored to R2, variant-looking
 * originals are renamed, pixel bombs are refused (413) and every original
 * loses its EXIF/GPS: losslessly when it is upright and small enough,
 * re-encoded (orientation applied) otherwise.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import sharp from 'sharp'
import {
  ImageRejectedError,
  MAX_INPUT_PIXELS,
  apngFrameCount,
  assertImageWithinLimits,
  imageGeometry,
  processUpload,
  storeUpload,
  stripJpegMetadata,
  stripWebpMetadata,
} from '../lib/imageVariants'
import { UPLOAD_NAME_RE } from '../lib/security/uploadName'
import { uploadErrorMessage } from '../components/Admin/editor/upload'
import {
  VARIANT_WIDTHS,
  asOriginalName,
  isVariantName,
  uploadNameOf,
  variantName,
  variantOriginalName,
  variantSrcSet,
} from '../lib/uploadVariants'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]
process.env.JWT_SECRET = 'r5-images-secret'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r5-images-'))
const uploads = path.join(tmp, 'public', 'uploads')
let closeDb: (() => void) | null = null

before(() => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
})
after(() => {
  closeDb?.()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

const solid = (width: number, height: number, background: string) => sharp({ create: { width, height, channels: 3, background } })
const sha10 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10)
const listUploads = () => (fs.existsSync(uploads) ? fs.readdirSync(uploads).sort() : [])

/** Average RGB of an image (enough to tell a red picture from a blue one). */
async function meanRgb(file: string): Promise<number[]> {
  const { channels } = await sharp(file).stats()
  return channels.slice(0, 3).map((c) => Math.round(c.mean))
}

// PNG chunk crafting (an acTL chunk turns a still PNG into an "APNG" for the detector).
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
/** Insert chunks right after IHDR (8-byte signature + 25-byte IHDR chunk). */
function withChunksAfterIhdr(png: Buffer, ...chunks: Buffer[]): Buffer {
  return Buffer.concat([png.subarray(0, 33), ...chunks, png.subarray(33)])
}
function acTL(frames: number): Buffer {
  const data = Buffer.alloc(8)
  data.writeUInt32BE(frames, 0)
  return pngChunk('acTL', data)
}

// ── Naming ─────────────────────────────────────────────────────────────────

test('variant names keep the original extension, so they are unique per original', () => {
  assert.equal(variantName('photo.jpg', 640), 'photo.jpg.w640.webp')
  assert.equal(variantName('photo.png', 640), 'photo.png.w640.webp')
  assert.notEqual(variantName('og.png', 1280), variantName('og.jpg', 1280))
  for (const w of VARIANT_WIDTHS) {
    assert.ok(UPLOAD_NAME_RE.test(variantName('a'.repeat(124) + '.png', w)), 'a maximal new upload name still has valid variant names')
  }
  assert.equal(isVariantName('photo.jpg.w640.webp'), true)
  assert.equal(isVariantName('IMG.JPEG.w1920.webp'), true)
  assert.equal(isVariantName('photo.w640.webp'), false, 'old-style name: an ordinary original now')
  assert.equal(isVariantName('photo.jpg'), false)
})

test('variant ↔ original round trip; uploadNameOf only names originals', () => {
  for (const name of ['photo.jpg', 'a.b.png', 'IMG_01.JPEG', 'x.w640.webp', 'anim.gif']) {
    assert.equal(uploadNameOf(`/uploads/${encodeURIComponent(name)}`), name)
    for (const w of VARIANT_WIDTHS) {
      const v = variantName(name, w)
      assert.equal(isVariantName(v), true, v)
      assert.equal(variantOriginalName(v), name)
      assert.equal(uploadNameOf(`/uploads/${v}`), null, 'a variant URL is not an original')
    }
  }
  assert.equal(variantOriginalName('photo.jpg'), null)
  assert.equal(variantOriginalName('photo.w640.webp'), null)
})

test('a variant-looking original name is renamed so it cannot squat a variant slot', () => {
  assert.equal(asOriginalName('hero.jpg.w640.webp'), 'hero.jpg-w640.webp')
  assert.equal(isVariantName(asOriginalName('hero.jpg.w640.webp')), false)
  assert.equal(asOriginalName('hero.webp'), 'hero.webp')
  assert.equal(asOriginalName('x.w640.webp'), 'x.w640.webp', 'not a variant of anything: kept')
})

// ── storeUpload ────────────────────────────────────────────────────────────

test('photo.jpg then photo.png: disjoint variant sets, each srcset shows its own pixels', async () => {
  const red = await solid(1400, 700, '#e01010').jpeg().toBuffer()
  const blue = await solid(1400, 700, '#1010e0').png().toBuffer()
  const jpg = await storeUpload(red, 'image/jpeg', 'photo.jpg')
  const png = await storeUpload(blue, 'image/png', 'photo.png')
  assert.equal(jpg.name, 'photo.jpg')
  assert.equal(png.name, 'photo.png', 'different extension: no clash, no suffix')
  assert.deepEqual(jpg.variants, ['/uploads/photo.jpg.w640.webp', '/uploads/photo.jpg.w1280.webp'])
  assert.deepEqual(png.variants, ['/uploads/photo.png.w640.webp', '/uploads/photo.png.w1280.webp'])
  assert.equal(jpg.variants.filter((v) => png.variants.includes(v)).length, 0)
  assert.equal(variantSrcSet(jpg.url), '/uploads/photo.jpg.w640.webp 640w, /uploads/photo.jpg.w1280.webp 1280w, /uploads/photo.jpg 1400w')
  assert.equal(variantSrcSet(png.url), '/uploads/photo.png.w640.webp 640w, /uploads/photo.png.w1280.webp 1280w, /uploads/photo.png 1400w')
  const [r] = await meanRgb(path.join(uploads, 'photo.jpg.w640.webp'))
  const [, , b] = await meanRgb(path.join(uploads, 'photo.png.w640.webp'))
  assert.ok(r > 180, 'the jpg variant is red')
  assert.ok(b > 180, 'the png variant is blue')
})

test('a clash on a variant name alone triggers the hash suffix', async () => {
  const squatter = Buffer.from('not the variant of the next upload')
  fs.mkdirSync(uploads, { recursive: true })
  fs.writeFileSync(path.join(uploads, 'clash.png.w640.webp'), squatter as unknown as Uint8Array)
  const raw = await solid(900, 600, '#20a020').png().toBuffer()
  const stored = await storeUpload(raw, 'image/png', 'clash.png')
  assert.equal(stored.name, `clash-${sha10(raw)}.png`)
  assert.deepEqual(stored.variants, [`/uploads/clash-${sha10(raw)}.png.w640.webp`])
  assert.ok(fs.readFileSync(path.join(uploads, 'clash.png.w640.webp')).equals(squatter), 'the existing file is untouched')
  assert.equal(fs.existsSync(path.join(uploads, 'clash.png')), false)
})

test('only files this call wrote are mirrored to R2', async () => {
  const raw = await solid(1500, 800, '#a0a020').png().toBuffer()
  const hashed = `mirror-${sha10(raw)}.png`
  // The plain name is taken, and the hashed name's 640 variant already exists.
  fs.writeFileSync(path.join(uploads, 'mirror.png'), 'taken')
  const sentinel = Buffer.from('existing 640 variant')
  fs.writeFileSync(path.join(uploads, variantName(hashed, 640)), sentinel as unknown as Uint8Array)

  const mirrored: string[] = []
  const mirror = async (name: string) => {
    mirrored.push(name)
    return null
  }
  const stored = await storeUpload(raw, 'image/png', 'mirror.png', { mirror })
  assert.equal(stored.name, hashed)
  assert.deepEqual(mirrored, [hashed, variantName(hashed, 1280)], 'the 640 variant was not written, so not mirrored')
  assert.ok(fs.readFileSync(path.join(uploads, variantName(hashed, 640))).equals(sentinel))

  // The same image again: everything already exists → nothing is written or mirrored.
  mirrored.length = 0
  const again = await storeUpload(raw, 'image/png', 'mirror.png', { mirror })
  assert.equal(again.name, hashed)
  assert.deepEqual(mirrored, [])
})

test('an upload named like a variant is stored under a renamed, optimisable name', async () => {
  const webp = await solid(800, 400, '#406080').webp().toBuffer()
  const squat = await storeUpload(webp, 'image/webp', 'hero.jpg.w640.webp')
  assert.equal(squat.name, 'hero.jpg-w640.webp')
  assert.deepEqual(squat.variants, ['/uploads/hero.jpg-w640.webp.w640.webp'])
  const jpg = await storeUpload(await solid(800, 400, '#804060').jpeg().toBuffer(), 'image/jpeg', 'hero.jpg')
  assert.equal(jpg.name, 'hero.jpg', 'its slot was not squatted')
  assert.deepEqual(jpg.variants, ['/uploads/hero.jpg.w640.webp'])
})

// ── Decompression-bomb guard ────────────────────────────────────────────────

test('a 12000×8000 PNG (a few hundred KB) is refused before anything is stored', async () => {
  const bomb = await solid(12000, 8000, '#ffffff').png({ compressionLevel: 9 }).toBuffer()
  assert.ok(bomb.length < 2 * 1024 * 1024, `compresses small (${bomb.length} bytes)`)
  const before = listUploads()
  await assert.rejects(storeUpload(bomb, 'image/png', 'bomb.png'), (err: unknown) => {
    assert.ok(err instanceof ImageRejectedError)
    assert.equal(err.code, 'TOO_MANY_PIXELS')
    assert.equal(err.status, 413)
    assert.match(err.message, /12000×8000/)
    return true
  })
  assert.deepEqual(listUploads(), before, 'nothing written')
})

test('frames count towards the pixel limit (animated PNG / WebP)', async () => {
  const still = await solid(5000, 6000, '#000000').png({ compressionLevel: 9 }).toBuffer()
  assert.deepEqual(await assertImageWithinLimits(still), { width: 5000, height: 6000, frames: 1 })
  const apng = withChunksAfterIhdr(still, acTL(3))
  assert.equal(apngFrameCount(apng), 3)
  assert.ok(5000 * 6000 * 3 > MAX_INPUT_PIXELS)
  await assert.rejects(assertImageWithinLimits(apng), (err: unknown) => err instanceof ImageRejectedError && err.code === 'TOO_MANY_PIXELS' && /3 frames/.test(err.message))

  const frames = await Promise.all(['#f00', '#0f0', '#00f'].map((c) => solid(60, 40, c).png().toBuffer()))
  const anim = await sharp(frames, { join: { animated: true } }).webp({ loop: 0, delay: [100, 100, 100] }).toBuffer()
  assert.deepEqual(await imageGeometry(anim), { width: 60, height: 40, frames: 3 })
})

test('an unreadable image is refused (415), never stored', async () => {
  const junk = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)])
  await assert.rejects(storeUpload(junk, 'image/png', 'junk.png'), (err: unknown) => err instanceof ImageRejectedError && err.code === 'UNREADABLE_IMAGE' && err.status === 415)
  assert.equal(fs.existsSync(path.join(uploads, 'junk.png')), false)
})

test('POST /api/admin/upload-image answers 413 { error, code } for a pixel bomb', async () => {
  const handler = (await import('../pages/api/admin/upload-image')).default as (req: unknown, res: unknown) => Promise<unknown>
  closeDb = (await import('../lib/db')).closeDb
  const bomb = await solid(12000, 8000, '#ffffff').png({ compressionLevel: 9 }).toBuffer()
  const token = jwt.sign({ role: 'admin', email: 'owner@example.test' }, 'r5-images-secret', { algorithm: 'HS256' })
  const out = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> }
  const res = {
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
    end() {
      return res
    },
  }
  const before = listUploads()
  await handler(
    {
      method: 'POST',
      url: '/api/admin/upload-image',
      query: {},
      body: { filename: 'bomb.png', dataUrl: `data:image/png;base64,${bomb.toString('base64')}` },
      cookies: { cv_admin_token: token },
      headers: { cookie: `cv_admin_token=${token}` },
      socket: { remoteAddress: '127.0.0.1' },
    },
    res,
  )
  assert.equal(out.statusCode, 413)
  const body = out.body as { error: string; code: string }
  assert.equal(body.code, 'TOO_MANY_PIXELS')
  assert.match(body.error, /megapixel/)
  assert.deepEqual(listUploads(), before)
  // The editor toast shows the server's reason, not the generic "8 MB" text.
  assert.equal(uploadErrorMessage(413, body), body.error)
  assert.equal(uploadErrorMessage(413, { error: 'Request Entity Too Large' }), 'Image is too large — the limit is 8 MB.')
})

// ── Metadata stripping ─────────────────────────────────────────────────────

/** Decoded RGB pixels, to prove a strip changed no pixel. */
const pixels = async (buf: Buffer) => (await sharp(buf).removeAlpha().raw().toBuffer()).toString('base64')

test('an upright JPEG loses EXIF, XMP, comments and appended images without being re-encoded', async () => {
  const noisy = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
    .jpeg({ quality: 93 })
    .withIccProfile('p3')
    .withExifMerge({
      IFD0: { Make: 'CamMaker', Model: 'X1', BodySerialNumber: 'SN12345' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '35/1 41/1 0/1' },
    })
    .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="35,41N"/></rdf:RDF></x:xmpmeta>')
    .toBuffer()
  // A comment segment right after SOI and a second image after EOI (MPF style).
  const com = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, 0x0f]), Buffer.from('shot in Tokyo', 'latin1')])
  const appended = await solid(8, 8, '#ff0000').jpeg().withExifMerge({ IFD0: { BodySerialNumber: 'SN12345' } }).toBuffer()
  const jpeg = Buffer.concat([noisy.subarray(0, 2), com, noisy.subarray(2), appended])
  const inMeta = await sharp(jpeg).metadata()
  assert.ok(inMeta.exif && inMeta.xmp && inMeta.icc, 'the fixture carries EXIF, XMP and ICC')

  const stripped = stripJpegMetadata(jpeg)
  assert.ok(stripped)
  assert.ok(!stripped.includes('SN12345') && !stripped.includes('Tokyo') && !stripped.includes('GPSLatitude'))
  const meta = await sharp(stripped).metadata()
  assert.equal(meta.exif, undefined)
  assert.equal(meta.xmp, undefined)
  assert.ok(meta.icc, 'ICC profile kept')
  assert.equal(await pixels(stripped), await pixels(noisy), 'pixels identical: nothing was re-encoded')

  const out = await processUpload(jpeg, 'tokyo.jpg')
  assert.ok(out.buf.equals(stripped), 'processUpload takes the lossless path')
  assert.deepEqual([out.width, out.height], [64, 48])

  assert.equal(stripJpegMetadata(Buffer.from('not a jpeg')), null)
  assert.equal(stripJpegMetadata(noisy.subarray(0, noisy.length - 40)), null, 'truncated: no EOI')
})

test('a progressive JPEG survives the lossless strip', async () => {
  const prog = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 100, sigma: 30 } } })
    .jpeg({ progressive: true, quality: 90 })
    .withExifMerge({ IFD0: { BodySerialNumber: 'SN999' } })
    .toBuffer()
  const stripped = stripJpegMetadata(prog)
  assert.ok(stripped && !stripped.includes('SN999'))
  assert.equal(await pixels(stripped), await pixels(prog))
})

test('a lossy WebP loses EXIF and XMP without being re-encoded', async () => {
  const webp = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
    .webp({ quality: 70 })
    .withExifMerge({ IFD0: { BodySerialNumber: 'SN12345' } })
    .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>')
    .toBuffer()
  const inMeta = await sharp(webp).metadata()
  assert.ok(inMeta.exif && inMeta.xmp)
  const stripped = stripWebpMetadata(webp)
  assert.ok(stripped)
  const meta = await sharp(stripped).metadata()
  assert.equal(meta.exif, undefined)
  assert.equal(meta.xmp, undefined)
  assert.equal(stripped.readUInt32LE(4), stripped.length - 8, 'RIFF size updated')
  assert.equal(await pixels(stripped), await pixels(webp))
  const out = await processUpload(webp, 'lossy.webp')
  assert.ok(out.buf.equals(stripped))
  assert.equal(stripWebpMetadata(Buffer.from('RIFF\x00\x00\x00\x00WEBP')), null)
})


test('EXIF (GPS, camera serial) is stripped from a JPEG while its orientation is applied', async () => {
  const jpeg = await solid(40, 30, '#888888')
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: 'CamMaker', Model: 'X1', BodySerialNumber: 'SN12345' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '35/1 41/1 0/1' },
    })
    .toBuffer()
  const inMeta = await sharp(jpeg).metadata()
  assert.equal(inMeta.orientation, 6)
  assert.ok(inMeta.exif?.includes('SN12345'), 'the fixture carries a serial')

  const out = await processUpload(jpeg, 'gps.jpg')
  const meta = await sharp(out.buf).metadata()
  assert.equal(meta.format, 'jpeg')
  assert.equal(meta.exif, undefined)
  assert.ok(!meta.orientation || meta.orientation === 1)
  assert.deepEqual([meta.width, meta.height, out.width, out.height], [30, 40, 30, 40], 'upright pixels')

  // Uploads and imports share storeUpload: the stored file is clean too.
  const stored = await storeUpload(jpeg, 'image/jpeg', 'gps.jpg')
  assert.equal((await sharp(path.join(uploads, stored.name)).metadata()).exif, undefined)
})

test('PNG and WebP originals lose their metadata; lossless WebP stays lossless', async () => {
  const png = await solid(50, 40, '#336699').png().withExifMerge({ IFD0: { Make: 'CamMaker' } }).toBuffer()
  assert.ok((await sharp(png).metadata()).exif)
  const pngOut = await processUpload(png, 'shot.png')
  assert.equal((await sharp(pngOut.buf).metadata()).exif, undefined)
  assert.equal((await sharp(pngOut.buf).metadata()).format, 'png')

  const webp = await solid(50, 40, '#336699').webp({ lossless: true }).withExifMerge({ IFD0: { Make: 'CamMaker' } }).toBuffer()
  const webpOut = await processUpload(webp, 'shot.webp')
  const wm = await sharp(webpOut.buf).metadata()
  assert.equal(wm.format, 'webp')
  assert.equal(wm.exif, undefined)
  assert.ok(webpOut.buf.includes('VP8L'), 'lossless bitstream kept')
})

test('animated images keep their animation: WebP metadata chunks dropped, APNG chunks kept, GIF untouched', async () => {
  const frames = await Promise.all(['#f00', '#0f0', '#00f'].map((c) => solid(60, 40, c).png().toBuffer()))
  const anim = await sharp(frames, { join: { animated: true } })
    .webp({ loop: 0, delay: [100, 120, 140] })
    .withExifMerge({ IFD0: { Make: 'CamMaker' } })
    .toBuffer()
  const out = await processUpload(anim, 'anim.webp')
  const meta = await sharp(out.buf).metadata()
  assert.equal(meta.pages, 3)
  assert.deepEqual(meta.delay, [100, 120, 140])
  assert.equal(meta.exif, undefined)
  assert.deepEqual([out.width, out.height, out.variants.length], [60, 40, 0])

  const still = await solid(30, 20, '#123456').png().toBuffer()
  const text = pngChunk('tEXt', Buffer.from('Comment\0taken at 35.68N 139.69E', 'latin1'))
  const apng = withChunksAfterIhdr(still, acTL(2), text)
  const apngOut = await processUpload(apng, 'anim.png')
  assert.ok(apngOut.buf.includes('acTL'), 'animation control chunk kept')
  assert.ok(!apngOut.buf.includes('tEXt'), 'text chunk dropped')
  assert.equal(apngOut.buf.length, apng.length - text.length)
  assert.deepEqual([apngOut.width, apngOut.height, apngOut.variants.length], [30, 20, 0])

  const gif = await sharp(frames, { join: { animated: true } }).gif({ loop: 0, delay: [100, 100, 100] }).toBuffer()
  const gifOut = await processUpload(gif, 'anim.gif')
  assert.ok(gifOut.buf.equals(gif))
  const stored = await storeUpload(gif, 'image/gif', 'anim.gif')
  assert.ok(fs.readFileSync(path.join(uploads, stored.name)).equals(gif), 'GIF uploads still work, byte-for-byte')
})
