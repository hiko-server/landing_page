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

/** All objects under `prefix` as { key, mtime (ms), size }. */
async function listAll(prefix) {
  const objs = []
  let token
  do {
    const out = await s3.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token }),
    )
    for (const obj of out.Contents || []) {
      if (obj.Key) objs.push({ key: obj.Key, mtime: obj.LastModified ? new Date(obj.LastModified).getTime() : 0, size: obj.Size ?? -1 })
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)
  return objs
}

// The local DB now persists across deploys (docker volume). If an earlier R2
// push failed, R2 holds an OLDER copy than the DB — never let it overwrite a
// newer local edit. 5s of slack absorbs clock skew between us and R2.
const SKEW_MS = 5000
const localPageAt = db.prepare('SELECT updated_at FROM pages WHERE name = ?')
const localItemAt = db.prepare('SELECT updated_at FROM collection_items WHERE collection = ? AND slug = ?')
const localKvAt = db.prepare('SELECT updated_at FROM kv WHERE key = ?')
const tombstonesOf = (collection) => {
  try {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(`tombstones:${collection}`)
    return new Set(row ? JSON.parse(row.value) : [])
  } catch {
    return new Set()
  }
}
const localIsNewer = (row, mtime) => !!row && Number(row.updated_at) > mtime + SKEW_MS
let skipped = 0

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
  for (const { key, mtime } of await listAll('pages/')) {
    const name = path.basename(key).replace(/\.(mdx|md)$/, '')
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(name)) continue
    if (localIsNewer(localPageAt.get(name), mtime)) {
      skipped++
      continue
    }
    const raw = await getText(key)
    const parsed = matter(raw)
    upsertPage.run(name, JSON.stringify(parsed.data), parsed.content, mtime || Date.now())
    console.log(`  page ← ${key}`)
  }

  // blog/ and work/
  for (const collection of ['blog', 'work']) {
    const dead = tombstonesOf(collection)
    for (const { key, mtime } of await listAll(`${collection}/`)) {
      const slug = path.basename(key).replace(/\.(mdx|md)$/, '')
      if (!/^[a-z0-9][a-z0-9-_]*$/.test(slug)) continue
      // Deleted locally (an R2 delete may have failed) — don't resurrect it.
      if (dead.has(slug) || localIsNewer(localItemAt.get(collection, slug), mtime)) {
        skipped++
        continue
      }
      const raw = await getText(key)
      const parsed = matter(raw)
      upsertItem.run(collection, slug, JSON.stringify(parsed.data), parsed.content, mtime || Date.now())
      console.log(`  ${collection} ← ${key}`)
    }
  }

  // data/
  for (const { key, mtime } of await listAll('data/')) {
    const name = path.basename(key).replace(/\.json$/, '')
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(name)) continue
    if (localIsNewer(localKvAt.get(name), mtime)) {
      skipped++
      continue
    }
    const raw = await getText(key)
    upsertKv.run(name, raw, mtime || Date.now())
    console.log(`  kv ← ${key}`)
  }

  // uploads/ — immutable names; skip files already present with the same size.
  for (const { key, size } of await listAll('uploads/')) {
    const name = path.basename(key)
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) continue
    const dest = path.join(UPLOADS_DIR, name)
    try {
      if (fs.existsSync(dest) && fs.statSync(dest).size === size) continue
    } catch {
      /* re-download */
    }
    const buf = await getBuffer(key)
    fs.writeFileSync(dest, buf)
    console.log(`  upload ← ${key}`)
  }

  console.log(`[sync-from-r2] OK${skipped ? ` (kept ${skipped} newer local item(s))` : ''}`)
  db.close()
}

main().catch((err) => {
  console.error('[sync-from-r2] FAILED', err)
  process.exit(1)
})
