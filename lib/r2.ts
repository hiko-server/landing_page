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
 * credentials. Mutating helpers throw when R2 is configured but reachable —
 * callers decide whether the failure is fatal (per user spec: dual-write
 * means R2 errors propagate while the local DB write is already persisted).
 */

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
