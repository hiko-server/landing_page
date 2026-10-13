/**
 * r2GetRange: a ranged GetObject (bytes=0-(n-1)) on the shared client, null
 * for a missing key, and never more bytes than asked. lib/rehype/imageSize
 * reads an upload's R2 copy with it instead of downloading the whole object.
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { S3Client } from '@aws-sdk/client-s3'

process.env.R2_ENDPOINT = 'https://r2.invalid'
process.env.R2_BUCKET = 'bucket'
process.env.R2_ACCESS_KEY_ID = 'test-id'
process.env.R2_SECRET_ACCESS_KEY = 'test-secret'

let r2: typeof import('../lib/r2')
let imageSize: typeof import('../lib/rehype/imageSize')
const originalSend = S3Client.prototype.send
const sent: Array<{ name: string; input: any }> = []

function stub(reply: (input: any) => unknown) {
  const send = async (command: any) => {
    sent.push({ name: command.constructor.name, input: command.input })
    return reply(command.input)
  }
  Object.assign(S3Client.prototype, { send })
}

before(async () => {
  r2 = await import('../lib/r2')
  imageSize = await import('../lib/rehype/imageSize')
})

afterEach(() => {
  S3Client.prototype.send = originalSend
  sent.length = 0
})

test('asks for the first n bytes and returns them as a Buffer', async () => {
  stub(() => ({ Body: Readable.from([Buffer.from([1, 2, 3]), Buffer.from([4])]) }))
  const buf = await r2.r2GetRange('uploads/a.png', 64)
  assert.deepEqual(sent, [{ name: 'GetObjectCommand', input: { Bucket: 'bucket', Key: 'uploads/a.png', Range: 'bytes=0-63' } }])
  assert.ok(Buffer.isBuffer(buf))
  assert.deepEqual([...buf!], [1, 2, 3, 4])
})

test('a server that ignores Range never yields more than asked', async () => {
  stub(() => ({ Body: Readable.from([Buffer.alloc(100, 7)]) }))
  const buf = await r2.r2GetRange('k', 10)
  assert.equal(buf!.length, 10)
})

test('missing key → null; empty object → empty buffer; other errors propagate', async () => {
  stub(() => {
    throw Object.assign(new Error('nope'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })
  })
  assert.equal(await r2.r2GetRange('missing', 8), null)
  stub(() => {
    throw Object.assign(new Error('range'), { name: 'InvalidRange', $metadata: { httpStatusCode: 416 } })
  })
  assert.equal((await r2.r2GetRange('empty', 8))!.length, 0)
  stub(() => {
    throw Object.assign(new Error('boom'), { name: 'InternalError', $metadata: { httpStatusCode: 500 } })
  })
  await assert.rejects(r2.r2GetRange('k', 8), /boom/)
})

test('rejects a non-positive byte count without a request', async () => {
  stub(() => ({}))
  await assert.rejects(r2.r2GetRange('k', 0), RangeError)
  await assert.rejects(r2.r2GetRange('k', 1.5), RangeError)
  assert.equal(sent.length, 0)
})

/** Serves `object` honouring `Range: bytes=0-N` like R2 does. */
function serve(object: Buffer) {
  stub((input) => {
    const m = /^bytes=0-(\d+)$/.exec(String(input.Range || ''))
    return { Body: Readable.from([m ? object.subarray(0, Number(m[1]) + 1) : object]) }
  })
}

function png(width: number, height: number, total: number): Buffer {
  const b = Buffer.alloc(total)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

/** A JPEG whose SOF0 sits behind ~128 KB of APP2 (ICC) segments. */
function jpegWithBigProfile(width: number, height: number): Buffer {
  const app = Buffer.alloc(2 + 0xfffd)
  app.set([0xff, 0xe2, 0xff, 0xfd])
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app, app, sof, Buffer.alloc(16)])
}

test('image sizing reads only the header of an upload\'s R2 copy', async () => {
  serve(png(640, 480, 2 * 1024 * 1024))
  const resolve = imageSize.createImageSizeResolver({ readUpload: () => null })
  assert.deepEqual(await resolve('/uploads/photo.png'), { width: 640, height: 480 })
  assert.deepEqual(
    sent.map((c) => [c.input.Key, c.input.Range]),
    [['uploads/photo.png', `bytes=0-${imageSize.REMOTE_HEAD_BYTES - 1}`]],
  )
})

test('a JPEG header beyond the first range is read with one larger range', async () => {
  serve(jpegWithBigProfile(1200, 800))
  const resolve = imageSize.createImageSizeResolver({ readUpload: () => null })
  assert.deepEqual(await resolve('/uploads/big-icc.jpg'), { width: 1200, height: 800 })
  assert.equal(sent.length, 2)
  assert.equal(sent[0].input.Range, `bytes=0-${imageSize.REMOTE_HEAD_BYTES - 1}`)
  assert.equal(sent[1].input.Range, `bytes=0-${512 * 1024 - 1}`)
})

test('a missing R2 copy resolves to null', async () => {
  stub(() => {
    throw Object.assign(new Error('nope'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })
  })
  const resolve = imageSize.createImageSizeResolver({ readUpload: () => null })
  assert.equal(await resolve('/uploads/gone.png'), null)
  assert.equal(sent.length, 1)
})
