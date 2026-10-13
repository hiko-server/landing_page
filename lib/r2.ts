import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, type _Object } from '@aws-sdk/client-s3'

/**
 * Cloudflare R2 client (S3-compatible).
 *
 * Required env vars:
 *   R2_ENDPOINT           e.g. https://<account>.r2.cloudflarestorage.com
 *   R2_BUCKET             e.g. hiko-landing-page
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *
 * `isR2Configured()` lets callers skip cleanly when running locally without
 * credentials. Mutating helpers throw when R2 is configured but unreachable —
 * callers decide whether the failure is fatal (per user spec: dual-write
 * means R2 errors propagate while the local DB write is already persisted).
 *
 * Every call is bounded: a TCP connect that does not complete within
 * R2_TIMEOUTS.connectionMs, or a socket that stays silent for
 * R2_TIMEOUTS.requestMs, fails the attempt, and the SDK's standard retry
 * strategy (exponential backoff + jitter, retryable errors only) gives up
 * after R2_TIMEOUTS.maxAttempts. An R2 outage therefore turns an admin save
 * into a prompt "R2 sync failed" warning instead of a request that hangs.
 */

export const R2_TIMEOUTS = {
  connectionMs: 5_000,
  requestMs: 10_000,
  maxAttempts: 3,
} as const

const ENDPOINT = process.env.R2_ENDPOINT || ''
const BUCKET = process.env.R2_BUCKET || ''
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ''
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ''

let client: S3Client | null = null

export function isR2Configured(): boolean {
  return Boolean(ENDPOINT && BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY)
}

export function getR2Bucket(): string {
  return BUCKET
}

function getClient(): S3Client {
  if (client) return client
  if (!isR2Configured()) {
    throw new Error(
      'R2 is not configured. Set R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.',
    )
  }
  client = new S3Client({
    region: 'auto',
    endpoint: ENDPOINT,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
    maxAttempts: R2_TIMEOUTS.maxAttempts,
    retryMode: 'standard',
    requestHandler: {
      connectionTimeout: R2_TIMEOUTS.connectionMs,
      requestTimeout: R2_TIMEOUTS.requestMs,
    },
  })
  return client
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function r2GetText(key: string): Promise<string | null> {
  try {
    const out = await getClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    if (!out.Body) return null
    return await streamToString(out.Body as NodeJS.ReadableStream)
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null
    throw err
  }
}

export async function r2GetBuffer(key: string): Promise<Buffer | null> {
  try {
    const out = await getClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    if (!out.Body) return null
    return await streamToBuffer(out.Body as NodeJS.ReadableStream)
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null
    throw err
  }
}

/**
 * The first `bytes` bytes of an object (GetObject with `Range: bytes=0-(n-1)`),
 * e.g. an image header, without downloading the whole file. Objects shorter
 * than the range come back whole; an empty object (416 InvalidRange) yields
 * an empty buffer. null when the key does not exist. Same client, timeouts
 * and retries as every other helper.
 */
export async function r2GetRange(key: string, bytes: number): Promise<Buffer | null> {
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw new RangeError(`r2GetRange: bytes must be a positive integer, got ${bytes}`)
  try {
    const out = await getClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: `bytes=0-${bytes - 1}` }))
    if (!out.Body) return null
    const buf = await streamToBuffer(out.Body as NodeJS.ReadableStream)
    // A server that ignores Range answers 200 with the full object: never hand back more than asked.
    return buf.length > bytes ? buf.subarray(0, bytes) : buf
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null
    if (err?.name === 'InvalidRange' || err?.$metadata?.httpStatusCode === 416) return Buffer.alloc(0)
    throw err
  }
}

export async function r2PutText(key: string, body: string, contentType = 'text/plain; charset=utf-8'): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function r2PutBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function r2Delete(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

export async function r2List(prefix: string): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined
  do {
    const out = await getClient().send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }),
    )
    for (const obj of (out.Contents || []) as _Object[]) {
      if (obj.Key) keys.push(obj.Key)
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)
  return keys
}

export type R2ObjectMeta = { key: string; size: number; lastModified: string | null }

export async function r2ListDetailed(prefix = ''): Promise<R2ObjectMeta[]> {
  const out: R2ObjectMeta[] = []
  let token: string | undefined
  do {
    const resp = await getClient().send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }),
    )
    for (const obj of (resp.Contents || []) as _Object[]) {
      if (!obj.Key) continue
      out.push({
        key: obj.Key,
        size: Number(obj.Size || 0),
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
      })
    }
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined
  } while (token)
  return out
}
