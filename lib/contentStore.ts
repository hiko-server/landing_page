import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { getDb } from './db'
import { isR2Configured, r2PutText, r2Delete } from './r2'

/**
 * High-level dual-write content store.
 *
 * Read order:
 *   1. SQLite (data/content.db)
 *   2. Legacy file on disk (content/*.mdx, data/*.json)  — auto-seeds DB
 *
 * Write order (per user spec):
 *   1. SQLite — MUST succeed (errors propagate)
 *   2. Cloudflare R2 — MUST succeed if configured; if R2 fails we still keep
 *      the local DB write but surface the error to the caller.
 *
 * R2 key conventions mirror the legacy filesystem so an operator can
 * inspect/restore via any S3 browser:
 *   pages/now.mdx
 *   pages/uses.mdx
 *   blog/{slug}.mdx
 *   work/{slug}.mdx
 *   data/home.json
 *   data/cvdata.json
 *   uploads/{filename}
 */

export type StoreError =
  | { ok: true }
  | { ok: true; r2Warning: string }
  | { ok: false; error: string }

const CONTENT_DIR = path.join(process.cwd(), 'content')
const DATA_DIR = path.join(process.cwd(), 'data')

// ── R2 key helpers ────────────────────────────────────────────────────────
export function pageR2Key(name: string): string {
  return `pages/${name}.mdx`
}
export function itemR2Key(collection: string, slug: string): string {
  return `${collection}/${slug}.mdx`
}
export function kvR2Key(key: string): string {
  return `data/${key}.json`
}
export function uploadR2Key(filename: string): string {
  return `uploads/${filename}`
}

// ── Dual-write helper ─────────────────────────────────────────────────────
async function pushToR2(key: string, body: string, contentType?: string): Promise<string | null> {
  if (!isR2Configured()) return null
  try {
    await r2PutText(key, body, contentType)
    return null
  } catch (err: any) {
    return err?.message || String(err)
  }
}

async function deleteFromR2(key: string): Promise<string | null> {
  if (!isR2Configured()) return null
  try {
    await r2Delete(key)
    return null
  } catch (err: any) {
    return err?.message || String(err)
  }
}

// ── Pages (now, uses) ─────────────────────────────────────────────────────
export type PageRecord = { name: string; frontmatter: Record<string, any>; body: string }

export function getPageFromDb(name: string): PageRecord | null {
  const row = getDb()
    .prepare('SELECT name, frontmatter, body FROM pages WHERE name = ?')
    .get(name) as { name: string; frontmatter: string; body: string } | undefined
  if (!row) return null
  return { name: row.name, frontmatter: JSON.parse(row.frontmatter), body: row.body }
}

function readPageFromFile(name: string): PageRecord | null {
  const fp = path.join(CONTENT_DIR, `${name}.mdx`)
  if (!fs.existsSync(fp)) return null
  const raw = fs.readFileSync(fp, 'utf-8')
  const parsed = matter(raw)
  return { name, frontmatter: parsed.data, body: parsed.content }
}

/** Returns the page, preferring DB then falling back to disk (auto-seeds DB). */
export function getPage(name: string): PageRecord | null {
  const fromDb = getPageFromDb(name)
  if (fromDb) return fromDb
  const fromFile = readPageFromFile(name)
  if (!fromFile) return null
  putPageToDbOnly(name, fromFile.frontmatter, fromFile.body)
  return fromFile
}

function putPageToDbOnly(name: string, frontmatter: Record<string, any>, body: string) {
  getDb()
    .prepare(
      `INSERT INTO pages (name, frontmatter, body, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET frontmatter = excluded.frontmatter, body = excluded.body, updated_at = excluded.updated_at`,
    )
    .run(name, JSON.stringify(frontmatter), body, Date.now())
}

export async function putPage(
  name: string,
  frontmatter: Record<string, any>,
  body: string,
): Promise<StoreError> {
  try {
    putPageToDbOnly(name, frontmatter, body)
  } catch (err: any) {
    return { ok: false, error: `DB write failed: ${err?.message || String(err)}` }
  }
  const r2Body = matter.stringify(body || '\n', frontmatter)
  const r2Err = await pushToR2(pageR2Key(name), r2Body, 'text/markdown; charset=utf-8')
  if (r2Err) return { ok: true, r2Warning: `R2 sync failed: ${r2Err}` }
  return { ok: true }
}

// ── Collection items (blog, work) ─────────────────────────────────────────
export type ItemRecord = {
  collection: string
  slug: string
  frontmatter: Record<string, any>
  body: string
  updated_at: number
}

export function listItemsFromDb(collection: string): ItemRecord[] {
  return (getDb()
    .prepare(
      'SELECT collection, slug, frontmatter, body, updated_at FROM collection_items WHERE collection = ? ORDER BY updated_at DESC',
    )
    .all(collection) as Array<{
    collection: string
    slug: string
    frontmatter: string
    body: string
    updated_at: number
  }>).map((r) => ({
    collection: r.collection,
    slug: r.slug,
    frontmatter: JSON.parse(r.frontmatter),
    body: r.body,
    updated_at: r.updated_at,
  }))
}

export function getItemFromDb(collection: string, slug: string): ItemRecord | null {
  const row = getDb()
    .prepare(
      'SELECT collection, slug, frontmatter, body, updated_at FROM collection_items WHERE collection = ? AND slug = ?',
    )
    .get(collection, slug) as
    | { collection: string; slug: string; frontmatter: string; body: string; updated_at: number }
    | undefined
  if (!row) return null
  return {
    collection: row.collection,
    slug: row.slug,
    frontmatter: JSON.parse(row.frontmatter),
    body: row.body,
    updated_at: row.updated_at,
  }
}

function readItemsFromDisk(collection: string): ItemRecord[] {
  const dir = path.join(CONTENT_DIR, collection)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => (f.endsWith('.mdx') || f.endsWith('.md')) && !f.startsWith('.'))
    .map((file) => {
      const slug = file.replace(/\.(mdx|md)$/, '')
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8')
      const parsed = matter(raw)
      const stat = fs.statSync(path.join(dir, file))
      return {
        collection,
        slug,
        frontmatter: parsed.data,
        body: parsed.content,
        updated_at: stat.mtimeMs,
      }
    })
}

function readItemFromDisk(collection: string, slug: string): ItemRecord | null {
  const fp = path.join(CONTENT_DIR, collection, `${slug}.mdx`)
  if (!fs.existsSync(fp)) return null
  const raw = fs.readFileSync(fp, 'utf-8')
  const parsed = matter(raw)
  const stat = fs.statSync(fp)
  return {
    collection,
    slug,
    frontmatter: parsed.data,
    body: parsed.content,
    updated_at: stat.mtimeMs,
  }
}

function putItemToDbOnly(item: ItemRecord) {
  getDb()
    .prepare(
      `INSERT INTO collection_items (collection, slug, frontmatter, body, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(collection, slug) DO UPDATE SET frontmatter = excluded.frontmatter, body = excluded.body, updated_at = excluded.updated_at`,
    )
    .run(
      item.collection,
      item.slug,
      JSON.stringify(item.frontmatter),
      item.body,
      item.updated_at,
    )
}

/** List items, preferring DB. Falls back to disk and seeds DB on first call. */
export function listItems(collection: string): ItemRecord[] {
  const fromDb = listItemsFromDb(collection)
  if (fromDb.length > 0) return fromDb
  const fromDisk = readItemsFromDisk(collection)
  for (const item of fromDisk) putItemToDbOnly(item)
  return fromDisk
}

export function getItem(collection: string, slug: string): ItemRecord | null {
  const fromDb = getItemFromDb(collection, slug)
  if (fromDb) return fromDb
  const fromDisk = readItemFromDisk(collection, slug)
  if (!fromDisk) return null
  putItemToDbOnly(fromDisk)
  return fromDisk
}

export async function putItem(
  collection: string,
  slug: string,
  frontmatter: Record<string, any>,
  body: string,
): Promise<StoreError> {
  try {
    putItemToDbOnly({ collection, slug, frontmatter, body, updated_at: Date.now() })
  } catch (err: any) {
    return { ok: false, error: `DB write failed: ${err?.message || String(err)}` }
  }
  const r2Body = matter.stringify(body || '\n', frontmatter)
  const r2Err = await pushToR2(itemR2Key(collection, slug), r2Body, 'text/markdown; charset=utf-8')
  if (r2Err) return { ok: true, r2Warning: `R2 sync failed: ${r2Err}` }
  return { ok: true }
}

export async function removeItem(collection: string, slug: string): Promise<StoreError> {
  try {
    getDb()
      .prepare('DELETE FROM collection_items WHERE collection = ? AND slug = ?')
      .run(collection, slug)
  } catch (err: any) {
    return { ok: false, error: `DB delete failed: ${err?.message || String(err)}` }
  }
  const r2Err = await deleteFromR2(itemR2Key(collection, slug))
  if (r2Err) return { ok: true, r2Warning: `R2 delete failed: ${r2Err}` }
  return { ok: true }
}

// ── KV (home.json, cvdata.json, …) ────────────────────────────────────────
export function getKvFromDb<T = any>(key: string): T | null {
  const row = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

function readKvFromDisk<T = any>(key: string): T | null {
  const fp = path.join(DATA_DIR, `${key}.json`)
  if (!fs.existsSync(fp)) return null
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8')) as T
  } catch {
    return null
  }
}

function putKvToDbOnly(key: string, value: any) {
  getDb()
    .prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), Date.now())
}

export function getKv<T = any>(key: string): T | null {
  const fromDb = getKvFromDb<T>(key)
  if (fromDb !== null) return fromDb
  const fromDisk = readKvFromDisk<T>(key)
  if (fromDisk === null) return null
  putKvToDbOnly(key, fromDisk)
  return fromDisk
}

export async function putKv(key: string, value: any): Promise<StoreError> {
  try {
    putKvToDbOnly(key, value)
  } catch (err: any) {
    return { ok: false, error: `DB write failed: ${err?.message || String(err)}` }
  }
  const r2Err = await pushToR2(
    kvR2Key(key),
    JSON.stringify(value, null, 2),
    'application/json; charset=utf-8',
  )
  if (r2Err) return { ok: true, r2Warning: `R2 sync failed: ${r2Err}` }
  return { ok: true }
}
