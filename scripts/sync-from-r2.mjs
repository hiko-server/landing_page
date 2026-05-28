/* eslint-disable no-console */
/**
 * Pull every editorial object from Cloudflare R2 into the local SQLite DB.
 *
 * Runs on container startup (see docker-entrypoint.sh) and can be invoked
 * manually with `node scripts/sync-from-r2.mjs`. Failure is fatal so the
 * orchestrator surfaces the problem instead of silently launching a stale
 * site — per the user's requirement that R2 acts as the source of truth on
 * deploy.
 *
 * Keys consumed (mirror the layout written by lib/contentStore.ts):
 *   pages/*.mdx                   → pages
 *   blog/*.mdx, work/*.mdx        → collection_items
 *   data/*.json                   → kv
 *   uploads/*                     → public/uploads/<basename>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import Database from 'better-sqlite3'
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(ROOT, 'data', 'content.db')
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads')

const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  if (process.env.R2_REQUIRED === '1') {
    console.error('[sync-from-r2] R2 env vars missing and R2_REQUIRED=1. Aborting.')
    process.exit(1)
  }
  console.warn('[sync-from-r2] R2 env vars missing. Skipping sync (set R2_REQUIRED=1 to make this fatal).')
  process.exit(0)
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS pages (
    name TEXT PRIMARY KEY, frontmatter TEXT NOT NULL DEFAULT '{}',
    body TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS collection_items (
    collection TEXT NOT NULL, slug TEXT NOT NULL,
    frontmatter TEXT NOT NULL DEFAULT '{}', body TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL, PRIMARY KEY (collection, slug));
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
`)

const upsertPage = db.prepare(
  `INSERT INTO pages (name, frontmatter, body, updated_at) VALUES (?, ?, ?, ?)
   ON CONFLICT(name) DO UPDATE SET frontmatter = excluded.frontmatter, body = excluded.body, updated_at = excluded.updated_at`,
)
const upsertItem = db.prepare(
  `INSERT INTO collection_items (collection, slug, frontmatter, body, updated_at) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(collection, slug) DO UPDATE SET frontmatter = excluded.frontmatter, body = excluded.body, updated_at = excluded.updated_at`,
)
const upsertKv = db.prepare(
  `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
)

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

async function streamToString(stream) {
  const chunks = []
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  return Buffer.concat(chunks).toString('utf-8')
}
async function streamToBuffer(stream) {
  const chunks = []
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  return Buffer.concat(chunks)
}

async function listAll(prefix) {
  const keys = []
  let token
  do {
    const out = await s3.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token }),
    )
    for (const obj of out.Contents || []) if (obj.Key) keys.push(obj.Key)
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)
  return keys
}

async function getText(key) {
  const out = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
  return streamToString(out.Body)
}
async function getBuffer(key) {
  const out = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
  return streamToBuffer(out.Body)
}

async function main() {
  console.log(`[sync-from-r2] Bucket: ${R2_BUCKET}`)

  // pages/
  for (const key of await listAll('pages/')) {
    const name = path.basename(key).replace(/\.(mdx|md)$/, '')
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(name)) continue
    const raw = await getText(key)
    const parsed = matter(raw)
    upsertPage.run(name, JSON.stringify(parsed.data), parsed.content, Date.now())
    console.log(`  page ← ${key}`)
  }

  // blog/ and work/
  for (const collection of ['blog', 'work']) {
    for (const key of await listAll(`${collection}/`)) {
      const slug = path.basename(key).replace(/\.(mdx|md)$/, '')
      if (!/^[a-z0-9][a-z0-9-_]*$/.test(slug)) continue
      const raw = await getText(key)
      const parsed = matter(raw)
      upsertItem.run(
        collection,
        slug,
        JSON.stringify(parsed.data),
        parsed.content,
        Date.now(),
      )
      console.log(`  ${collection} ← ${key}`)
    }
  }

  // data/
  for (const key of await listAll('data/')) {
    const name = path.basename(key).replace(/\.json$/, '')
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(name)) continue
    const raw = await getText(key)
    upsertKv.run(name, raw, Date.now())
    console.log(`  kv ← ${key}`)
  }

  // uploads/
  for (const key of await listAll('uploads/')) {
    const name = path.basename(key)
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) continue
    const buf = await getBuffer(key)
    fs.writeFileSync(path.join(UPLOADS_DIR, name), buf)
    console.log(`  upload ← ${key}`)
  }

  console.log('[sync-from-r2] OK')
  db.close()
}

main().catch((err) => {
  console.error('[sync-from-r2] FAILED', err)
  process.exit(1)
})
