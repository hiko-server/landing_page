/* eslint-disable no-console */
/**
 * Push the entire SQLite content store (and public/uploads) to Cloudflare R2.
 *
 * Use this once after the initial filesystem→DB migration to bootstrap the
 * R2 bucket, or any time you want to force-overwrite R2 from the local
 * state. Day-to-day admin writes already dual-write through
 * lib/contentStore.ts so this script is rarely needed.
 *
 * Run: `node scripts/sync-to-r2.mjs`
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import Database from 'better-sqlite3'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(ROOT, 'data', 'content.db')
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads')

const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('[sync-to-r2] R2 env vars missing. Aborting.')
  process.exit(1)
}
if (!fs.existsSync(DB_PATH)) {
  console.error(`[sync-to-r2] No SQLite at ${DB_PATH}. Run migrate-files-to-db.mjs first.`)
  process.exit(1)
}

const db = new Database(DB_PATH, { readonly: true })
const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

async function putText(key, body, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

async function putBuffer(key, body, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

function inferMime(filename) {
  const ext = path.extname(filename).toLowerCase()
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.txt': 'text/plain',
  }
  return map[ext] || 'application/octet-stream'
}

async function main() {
  console.log(`[sync-to-r2] Bucket: ${R2_BUCKET}`)

  // pages
  for (const row of db.prepare('SELECT name, frontmatter, body FROM pages').all()) {
    const fm = JSON.parse(row.frontmatter)
    const yaml = matter.stringify(row.body || '\n', fm)
    await putText(`pages/${row.name}.mdx`, yaml, 'text/markdown; charset=utf-8')
    console.log(`  page → pages/${row.name}.mdx`)
  }

  // collection_items
  for (const row of db
    .prepare('SELECT collection, slug, frontmatter, body FROM collection_items')
    .all()) {
    const fm = JSON.parse(row.frontmatter)
    const yaml = matter.stringify(row.body || '\n', fm)
    await putText(`${row.collection}/${row.slug}.mdx`, yaml, 'text/markdown; charset=utf-8')
    console.log(`  item → ${row.collection}/${row.slug}.mdx`)
  }

  // kv (always stored as pretty-printed JSON)
  for (const row of db.prepare('SELECT key, value FROM kv').all()) {
    let pretty = row.value
    try {
      pretty = JSON.stringify(JSON.parse(row.value), null, 2)
    } catch {
      // leave as-is if not valid JSON
    }
    await putText(`data/${row.key}.json`, pretty, 'application/json; charset=utf-8')
    console.log(`  kv   → data/${row.key}.json`)
  }

  // uploads (filesystem only; not in DB)
  if (fs.existsSync(UPLOADS_DIR)) {
    for (const file of fs.readdirSync(UPLOADS_DIR)) {
      if (file.startsWith('.')) continue
      const fp = path.join(UPLOADS_DIR, file)
      if (!fs.statSync(fp).isFile()) continue
      const buf = fs.readFileSync(fp)
      await putBuffer(`uploads/${file}`, buf, inferMime(file))
      console.log(`  upl  → uploads/${file}`)
    }
  }

  console.log('[sync-to-r2] OK')
  db.close()
}

main().catch((err) => {
  console.error('[sync-to-r2] FAILED', err)
  process.exit(1)
})
