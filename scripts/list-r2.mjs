/* eslint-disable no-console */
/**
 * Quick visibility into Cloudflare R2: lists every key under the bucket
 * grouped by prefix and prints size + lastModified so you can confirm
 * dual-writes are actually landing in the cloud.
 *
 * Run: `yarn content:list`  (which sets --env-file=.env.local)
 *   or: `node --env-file=.env scripts/list-r2.mjs`
 */
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('[list-r2] R2 env vars missing. Set them in .env or .env.local.')
  process.exit(1)
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

const groups = { pages: [], blog: [], work: [], data: [], uploads: [], other: [] }
let token

do {
  const out = await s3.send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET, ContinuationToken: token }),
  )
  for (const o of out.Contents || []) {
    const key = o.Key
    const bucket =
      key.startsWith('pages/') ? 'pages' :
      key.startsWith('blog/') ? 'blog' :
      key.startsWith('work/') ? 'work' :
      key.startsWith('data/') ? 'data' :
      key.startsWith('uploads/') ? 'uploads' : 'other'
    groups[bucket].push({ key, size: o.Size, modified: o.LastModified })
  }
  token = out.IsTruncated ? out.NextContinuationToken : undefined
} while (token)

const total = Object.values(groups).reduce((n, g) => n + g.length, 0)
console.log(`Bucket: ${R2_BUCKET}  (${total} objects)\n`)
for (const [name, items] of Object.entries(groups)) {
  if (!items.length) continue
  console.log(`── ${name} (${items.length}) ──`)
  for (const it of items.sort((a, b) => b.modified - a.modified)) {
    const when = it.modified.toISOString().replace('T', ' ').slice(0, 19)
    console.log(`  ${when}  ${String(it.size).padStart(8)}  ${it.key}`)
  }
  console.log()
}
