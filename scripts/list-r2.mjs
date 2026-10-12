/* eslint-disable no-console */
/**
 * Quick visibility into Cloudflare R2: lists every key under the bucket
 * grouped by prefix and prints size + lastModified so you can confirm
 * dual-writes are actually landing in the cloud.
 *
 * Run: `yarn content:list`  (node --env-file=.env scripts/list-r2.mjs)
 */
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { createS3, r2Env } from './content-helpers.mjs'

const cfg = r2Env()
if (!cfg) {
  console.error('[list-r2] R2 env vars missing. Set them in .env or .env.local.')
  process.exit(1)
}

const s3 = createS3(cfg)
const PREFIXES = ['pages', 'blog', 'work', 'data', 'uploads', 'backups']
const groups = Object.fromEntries([...PREFIXES, 'other'].map((p) => [p, []]))
let token

try {
  do {
    const out = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, ContinuationToken: token }))
    for (const o of out.Contents || []) {
      const group = PREFIXES.find((p) => o.Key.startsWith(`${p}/`)) || 'other'
      groups[group].push({ key: o.Key, size: o.Size ?? 0, modified: o.LastModified ? new Date(o.LastModified) : null })
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)
} catch (err) {
  console.error('[list-r2] FAILED', err?.message || err)
  process.exit(1)
}

const total = Object.values(groups).reduce((n, g) => n + g.length, 0)
console.log(`Bucket: ${cfg.bucket}  (${total} objects)\n`)
for (const [name, items] of Object.entries(groups)) {
  if (!items.length) continue
  console.log(`── ${name} (${items.length}) ──`)
  for (const it of items.sort((a, b) => (b.modified?.getTime() || 0) - (a.modified?.getTime() || 0))) {
    const when = it.modified ? it.modified.toISOString().replace('T', ' ').slice(0, 19) : '—'.padEnd(19)
    console.log(`  ${when}  ${String(it.size).padStart(8)}  ${it.key}`)
  }
  console.log()
}
