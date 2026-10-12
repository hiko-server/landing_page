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
 * Keys the app recorded in r2_pending (an upload/delete that failed) are
 * settled here as well: an uploaded key's entry is cleared, and a pending
 * delete whose row no longer exists is carried out.
 *
 * Run: `yarn content:push`  (node --env-file=.env scripts/sync-to-r2.mjs)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import {
  SAFE_NAME,
  SAFE_UPLOAD,
  createS3,
  inferMime,
  itemKey,
  kvKey,
  openContentDb,
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

const db = openContentDb(DB_PATH)
const s3 = createS3(cfg)
// Only entries recorded before the upload started: a newer failure the app
// records meanwhile belongs to a newer write and stays pending.
const clearPending = db.prepare('DELETE FROM r2_pending WHERE key = ? AND updated_at <= ?')

async function put(key, body, contentType) {
  const startedAt = Date.now()
  await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }))
  clearPending.run(key, startedAt)
}

const ITEM_KEY = /^([a-z0-9][a-z0-9-_]*)\/([a-z0-9][a-z0-9-_]*)\.mdx$/
const itemExists = db.prepare('SELECT 1 FROM collection_items WHERE collection = ? AND slug = ?')

/** Pending deletes of items that are still gone: delete the R2 object now. */
async function settlePendingDeletes() {
  let removed = 0
  const rows = db.prepare("SELECT key FROM r2_pending WHERE op = 'delete'").all()
  for (const { key } of rows) {
    const m = ITEM_KEY.exec(key)
    if (!m || itemExists.get(m[1], m[2])) continue
    const startedAt = Date.now()
    await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
    clearPending.run(key, startedAt)
    removed++
    console.log(`  del  ✕ ${key} (pending delete)`)
  }
  return removed
}

async function main() {
  console.log(`${TAG} Bucket: ${cfg.bucket}`)
  const counts = { pages: 0, items: 0, kv: 0, uploads: 0, deleted: 0 }

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

  // Every existing row was uploaded above (clearing its entry), so what is
  // still pending as a delete has no local row.
  counts.deleted = await settlePendingDeletes()

  console.log(
    `${TAG} OK: ${counts.pages} page(s), ${counts.items} item(s), ${counts.kv} kv, ${counts.uploads} upload(s), ` +
      `${counts.deleted} pending delete(s)`,
  )
}

main()
  .then(() => db.close())
  .catch((err) => {
    console.error(`${TAG} FAILED`, err)
    db.close()
    process.exit(1)
  })
