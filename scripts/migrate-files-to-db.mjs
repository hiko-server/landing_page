/* eslint-disable no-console */
/**
 * One-time / repeatable: seed data/content.db from the existing filesystem.
 *
 * Reads:
 *   content/now.mdx              → pages('now')
 *   content/uses.mdx             → pages('uses')
 *   content/blog/*.mdx           → collection_items('blog', slug)
 *   content/work/*.mdx           → collection_items('work', slug)
 *   data/home.json               → kv('home')
 *   data/cvdata.json             → kv('cvdata')
 *
 * Idempotent: each call overwrites the matching DB row with the file's
 * current contents. Use this when bringing up a fresh container against
 * legacy MDX files.
 *
 * Run: `node scripts/migrate-files-to-db.mjs`
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(ROOT, 'data', 'content.db')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
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

function importPage(name) {
  const fp = path.join(ROOT, 'content', `${name}.mdx`)
  if (!fs.existsSync(fp)) {
    console.log(`  skip page ${name} (no file)`)
    return
  }
  const raw = fs.readFileSync(fp, 'utf-8')
  const parsed = matter(raw)
  upsertPage.run(name, JSON.stringify(parsed.data), parsed.content, fs.statSync(fp).mtimeMs)
  console.log(`  imported page ${name}`)
}

function importCollection(collection) {
  const dir = path.join(ROOT, 'content', collection)
  if (!fs.existsSync(dir)) return
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.mdx') && !file.endsWith('.md')) continue
    if (file.startsWith('.')) continue
    const slug = file.replace(/\.(mdx|md)$/, '')
    const fp = path.join(dir, file)
    const raw = fs.readFileSync(fp, 'utf-8')
    const parsed = matter(raw)
    upsertItem.run(
      collection,
      slug,
      JSON.stringify(parsed.data),
      parsed.content,
      fs.statSync(fp).mtimeMs,
    )
    console.log(`  imported ${collection}/${slug}`)
  }
}

function importKv(key, file) {
  const fp = path.join(ROOT, 'data', file)
  if (!fs.existsSync(fp)) {
    console.log(`  skip kv ${key} (no file)`)
    return
  }
  const raw = fs.readFileSync(fp, 'utf-8')
  upsertKv.run(key, raw, fs.statSync(fp).mtimeMs)
  console.log(`  imported kv ${key}`)
}

console.log('Migrating filesystem content into SQLite…')
importPage('now')
importPage('uses')
importCollection('blog')
importCollection('work')
importKv('home', 'home.json')
importKv('cvdata', 'cvdata.json')
console.log('Done.')
db.close()
