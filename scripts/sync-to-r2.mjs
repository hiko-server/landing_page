/* eslint-disable no-console */
/**
 * Push the entire SQLite content store (and public/uploads) to Cloudflare R2.
 *
 * Use this once after the initial filesystem→DB migration to bootstrap the
 * R2 bucket, or any time you want to force-overwrite R2 from the local
 * state. Day-to-day admin writes already dual-write through
 * lib/contentStore.ts, and the boot sync (sync-from-r2.mjs) pushes rows that
 * are newer locally, so this script is rarely needed.
 *
 * Run: `yarn content:push`  (node --env-file=.env scripts/sync-to-r2.mjs)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import Database from 'better-sqlite3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import {
  SAFE_NAME,
  SAFE_UPLOAD,
  createS3,
  inferMime,
  itemKey,
  kvKey,
  pageKey,
  prettyJson,
  r2Env,
  serializeMdx,
} from './content-helpers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(ROOT, 'data', 'content.db')
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads')
const TAG = '[sync-to-r2]'

const cfg = r2Env()
if (!cfg) {
  console.error(`${TAG} R2 env vars missing. Aborting.`)
  process.exit(1)
}
if (!fs.existsSync(DB_PATH)) {
  console.error(`${TAG} No SQLite at ${DB_PATH}. Run migrate-files-to-db.mjs first.`)
  process.exit(1)
}

const db = new Database(DB_PATH, { readonly: true, timeout: 10_000 })
const s3 = createS3(cfg)

async function put(key, body, contentType) {
  await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }))
}

async function main() {
  console.log(`${TAG} Bucket: ${cfg.bucket}`)
  const counts = { pages: 0, items: 0, kv: 0, uploads: 0 }

  for (const row of db.prepare('SELECT name, frontmatter, body FROM pages').all()) {
    await put(pageKey(row.name), serializeMdx(matter, JSON.parse(row.frontmatter), row.body), 'text/markdown; charset=utf-8')
    counts.pages++
    console.log(`  page → ${pageKey(row.name)}`)
  }

  for (const row of db.prepare('SELECT collection, slug, frontmatter, body FROM collection_items').all()) {
    const key = itemKey(row.collection, row.slug)
    await put(key, serializeMdx(matter, JSON.parse(row.frontmatter), row.body), 'text/markdown; charset=utf-8')
    counts.items++
    console.log(`  item → ${key}`)
  }

  // Only keys the boot sync reads back (tombstone bookkeeping stays local).
  for (const row of db.prepare('SELECT key, value FROM kv').all()) {
    if (!SAFE_NAME.test(row.key)) continue
    await put(kvKey(row.key), prettyJson(row.value), 'application/json; charset=utf-8')
    counts.kv++
    console.log(`  kv   → ${kvKey(row.key)}`)
  }

  if (fs.existsSync(UPLOADS_DIR)) {
    for (const file of fs.readdirSync(UPLOADS_DIR)) {
      if (file.startsWith('.') || !SAFE_UPLOAD.test(file)) continue
      const fp = path.join(UPLOADS_DIR, file)
      if (!fs.statSync(fp).isFile()) continue
      await put(`uploads/${file}`, fs.readFileSync(fp), inferMime(file))
      counts.uploads++
      console.log(`  upl  → uploads/${file}`)
    }
  }

  console.log(`${TAG} OK: ${counts.pages} page(s), ${counts.items} item(s), ${counts.kv} kv, ${counts.uploads} upload(s)`)
}

main()
  .then(() => db.close())
  .catch((err) => {
    console.error(`${TAG} FAILED`, err)
    db.close()
    process.exit(1)
  })
