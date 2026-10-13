import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { getDb } from './db'
import { isR2Configured, r2PutText, r2Delete } from './r2'
import { noteSnapshot } from './audit/context'

/**
 * High-level dual-write content store.
 *
 * Read order:
 *   1. SQLite (data/content.db)
 *   2. Legacy file on disk (content/*.mdx, data/*.json)  — auto-seeds DB
 *
 * Write order (per user spec):
 *   1. SQLite — MUST succeed (errors propagate). Multi-statement writes
 *      (item + tombstone list) run in one transaction.
 *   2. Cloudflare R2 — retried a few times with backoff when configured; if
 *      it still fails we keep the local DB write and surface the error to the
 *      caller as `r2Warning` (a save never fails because R2 is down). The key
 *      is then recorded in `r2_pending`, so the next boot sync re-uploads (or
 *      re-deletes) it from the local row instead of trusting timestamps; a
 *      later successful upload/delete of the same key clears the entry.
 *
 * Seeds never overwrite: the git seed files only fill a *missing* row. A row
 * that exists but cannot be parsed is reported loudly and treated as absent
 * for readers — it is never silently replaced by the (stale) seed.
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

// ── Frontmatter normalisation ─────────────────────────────────────────────

/**
 * gray-matter parses unquoted YAML dates (`date: 2024-05-01`) into `Date`
 * objects, which getStaticProps / getServerSideProps refuse to serialise.
 * Convert them to strings once, at the disk boundary: midnight-UTC dates
 * become "YYYY-MM-DD", anything else a full ISO timestamp.
 */
export function jsonSafeFrontmatter(value: any): any {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const iso = value.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
  }
  if (Array.isArray(value)) return value.map(jsonSafeFrontmatter)
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue
      out[k] = jsonSafeFrontmatter(v)
    }
    return out
  }
  return value
}

// ── Deletion tombstones ───────────────────────────────────────────────────
// Disk MDX files only *seed* the DB. Without a record of deletions, deleting
// a seeded post would let the next read re-import it from disk.

function tombstoneKey(collection: string) {
  return `tombstones:${collection}`
}

type TombstoneRead = { set: Set<string>; corrupt: boolean }

function readTombstoneRow(collection: string): TombstoneRead {
  const row = getDb().prepare('SELECT value, updated_at FROM kv WHERE key = ?').get(tombstoneKey(collection)) as
    | { value: string; updated_at: number }
    | undefined
  if (!row) return { set: new Set(), corrupt: false }
  try {
    const list = JSON.parse(row.value)
    return { set: new Set(Array.isArray(list) ? list.filter((x: unknown) => typeof x === 'string') : []), corrupt: false }
  } catch (err) {
    reportCorruptKv(tombstoneKey(collection), row.updated_at, err)
    return { set: new Set(), corrupt: true }
  }
}

function readTombstones(collection: string): Set<string> {
  return readTombstoneRow(collection).set
}

function writeTombstones(collection: string, set: Set<string>) {
  getDb()
    .prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(tombstoneKey(collection), JSON.stringify(Array.from(set)), Date.now())
}

// ── Dual-write helper ─────────────────────────────────────────────────────

export type RetryOptions = {
  /** Total attempts including the first one (default 3). */
  attempts?: number
  /** Delay before the 2nd attempt; each later delay is 4× the previous (default 300 ms). */
  baseDelayMs?: number
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>
  /** Called after every failed attempt that will be retried. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Run `fn`, retrying failures with exponential backoff; rethrows the last error. */
export async function retryAsync<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, Math.floor(opts.attempts ?? 3))
  const base = Math.max(0, opts.baseDelayMs ?? 300)
  const sleep = opts.sleep ?? defaultSleep
  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === attempts) break
      const delay = base * 4 ** (attempt - 1)
      opts.onRetry?.(err, attempt, delay)
      await sleep(delay)
    }
  }
  throw lastErr
}

const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

// ── Keys R2 is known to be stale for ──────────────────────────────────────

export type R2PendingOp = 'put' | 'delete'

/**
 * Record that the latest upload/delete of `key` never reached R2. The entry's
 * timestamp only moves forward, so a sync that read an older entry never
 * clears this newer failure. Never throws: the caller's DB write already
 * succeeded and must not be reported as failed.
 */
export function markR2Pending(key: string, op: R2PendingOp, now = Date.now()): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO r2_pending (key, op, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET op = excluded.op, updated_at = MAX(excluded.updated_at, r2_pending.updated_at + 1)`,
      )
      .run(key, op, now)
  } catch (err) {
    console.error(`[contentStore] could not record pending R2 ${op} for ${key}:`, errMessage(err))
  }
}

/**
 * A successful upload/delete of `key` that started at `startedAt` brought R2
 * up to date: clear failures recorded before it started (a failure recorded
 * later belongs to a newer write and stays). Never throws.
 */
export function clearR2Pending(key: string, startedAt: number): void {
  try {
    getDb().prepare('DELETE FROM r2_pending WHERE key = ? AND updated_at <= ?').run(key, startedAt)
  } catch (err) {
    console.error(`[contentStore] could not clear pending R2 state for ${key}:`, errMessage(err))
  }
}

async function r2WithRetry(op: R2PendingOp, key: string, fn: () => Promise<void>): Promise<string | null> {
  if (!isR2Configured()) return null
  const startedAt = Date.now()
  try {
    await retryAsync(fn, {
      onRetry: (err, attempt, delay) =>
        console.warn(`[contentStore] R2 ${op} ${key} failed (attempt ${attempt}), retrying in ${delay} ms:`, errMessage(err)),
    })
  } catch (err) {
    console.error(`[contentStore] R2 ${op} ${key} failed after retries:`, errMessage(err))
    markR2Pending(key, op)
    return errMessage(err)
  }
  clearR2Pending(key, startedAt)
  return null
}

function pushToR2(key: string, body: string, contentType?: string): Promise<string | null> {
  return r2WithRetry('put', key, () => r2PutText(key, body, contentType))
}

function deleteFromR2(key: string): Promise<string | null> {
  return r2WithRetry('delete', key, () => r2Delete(key))
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
  return { name, frontmatter: jsonSafeFrontmatter(parsed.data), body: parsed.content }
}

/** Returns the page, preferring DB then falling back to disk (auto-seeds DB). */
export function getPage(name: string): PageRecord | null {
  const fromDb = getPageFromDb(name)
  if (fromDb) return fromDb
  const fromFile = readPageFromFile(name)
  if (!fromFile) return null
  // Seed only a missing row; if another worker seeded it first, theirs wins.
  getDb()
    .prepare('INSERT INTO pages (name, frontmatter, body, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO NOTHING')
    .run(name, JSON.stringify(fromFile.frontmatter), fromFile.body, Date.now())
  return getPageFromDb(name) ?? fromFile
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
  const dead = readTombstones(collection)
  return fs
    .readdirSync(dir)
    .filter((f) => (f.endsWith('.mdx') || f.endsWith('.md')) && !f.startsWith('.'))
    .filter((f) => !dead.has(f.replace(/\.(mdx|md)$/, '')))
    .map((file) => {
      const slug = file.replace(/\.(mdx|md)$/, '')
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8')
      const parsed = matter(raw)
      const stat = fs.statSync(path.join(dir, file))
      return {
        collection,
        slug,
        frontmatter: jsonSafeFrontmatter(parsed.data),
        body: parsed.content,
        updated_at: stat.mtimeMs,
      }
    })
}

function readItemFromDisk(collection: string, slug: string): ItemRecord | null {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug) || readTombstones(collection).has(slug)) return null
  const fp = path.join(CONTENT_DIR, collection, `${slug}.mdx`)
  if (!fs.existsSync(fp)) return null
  const raw = fs.readFileSync(fp, 'utf-8')
  const parsed = matter(raw)
  const stat = fs.statSync(fp)
  return {
    collection,
    slug,
    frontmatter: jsonSafeFrontmatter(parsed.data),
    body: parsed.content,
    updated_at: stat.mtimeMs,
  }
}

function putItemToDbOnly(item: ItemRecord, onConflict: 'update' | 'ignore' = 'update') {
  const conflict =
    onConflict === 'ignore'
      ? 'DO NOTHING'
      : 'DO UPDATE SET frontmatter = excluded.frontmatter, body = excluded.body, updated_at = excluded.updated_at'
  getDb()
    .prepare(
      `INSERT INTO collection_items (collection, slug, frontmatter, body, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(collection, slug) ${conflict}`,
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
  if (fromDisk.length === 0) return fromDisk
  getDb().transaction(() => {
    for (const item of fromDisk) putItemToDbOnly(item, 'ignore')
  })()
  return listItemsFromDb(collection)
}

export function getItem(collection: string, slug: string): ItemRecord | null {
  const fromDb = getItemFromDb(collection, slug)
  if (fromDb) return fromDb
  const fromDisk = readItemFromDisk(collection, slug)
  if (!fromDisk) return null
  putItemToDbOnly(fromDisk, 'ignore')
  return getItemFromDb(collection, slug) ?? fromDisk
}

export async function putItem(
  collection: string,
  slug: string,
  frontmatter: Record<string, any>,
  body: string,
): Promise<StoreError> {
  try {
    getDb().transaction(() => {
      putItemToDbOnly({ collection, slug, frontmatter: jsonSafeFrontmatter(frontmatter), body, updated_at: Date.now() })
      // A corrupt tombstone row is left untouched (reported by the reader);
      // the item row itself wins over any tombstone on read.
      const dead = readTombstoneRow(collection)
      if (!dead.corrupt && dead.set.delete(slug)) writeTombstones(collection, dead.set)
    })()
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
    getDb().transaction(() => {
      const dead = readTombstoneRow(collection)
      // Rewriting a corrupt list would forget every earlier deletion and let
      // seeded posts reappear — refuse instead (the transaction rolls back).
      if (dead.corrupt) {
        throw new Error(`kv row "${tombstoneKey(collection)}" is not valid JSON; fix it before deleting`)
      }
      getDb().prepare('DELETE FROM collection_items WHERE collection = ? AND slug = ?').run(collection, slug)
      dead.set.add(slug)
      writeTombstones(collection, dead.set)
    })()
  } catch (err: any) {
    return { ok: false, error: `DB delete failed: ${err?.message || String(err)}` }
  }
  const r2Err = await deleteFromR2(itemR2Key(collection, slug))
  if (r2Err) return { ok: true, r2Warning: `R2 delete failed: ${r2Err}` }
  return { ok: true }
}

// ── KV (home.json, cvdata.json, …) ────────────────────────────────────────

const reportedCorrupt = new Set<string>()

/** Loud, once-per-version report of a kv row that is not valid JSON. */
function reportCorruptKv(key: string, updatedAt: number, err: unknown) {
  const id = `${key}@${updatedAt}`
  if (reportedCorrupt.has(id)) return
  reportedCorrupt.add(id)
  console.error(
    `[contentStore] CORRUPT kv row "${key}" (updated_at ${updatedAt}) is not valid JSON: ${errMessage(err)}. ` +
      'Readers get null; the row is NOT replaced by the seed file. Restore it from a snapshot or R2.',
  )
}

type KvRow = { value: string; updated_at: number }

function readKvRow(key: string): KvRow | null {
  return (getDb().prepare('SELECT value, updated_at FROM kv WHERE key = ?').get(key) as KvRow | undefined) ?? null
}

export type KvRead<T> = {
  /** Parsed value, or null when there is no row or the row is corrupt. */
  value: T | null
  /** Row `updated_at` in ms; 0 when there is no row. */
  updatedAt: number
  /** True when a row exists but its value is not valid JSON. */
  corrupt: boolean
  /** Raw stored text (kept so a corrupt row can still be snapshotted). */
  raw: string | null
}

function decodeKvRow<T>(key: string, row: KvRow | null): KvRead<T> {
  if (!row) return { value: null, updatedAt: 0, corrupt: false, raw: null }
  try {
    return { value: JSON.parse(row.value) as T, updatedAt: row.updated_at, corrupt: false, raw: row.value }
  } catch (err) {
    reportCorruptKv(key, row.updated_at, err)
    return { value: null, updatedAt: row.updated_at, corrupt: true, raw: row.value }
  }
}

export function getKvFromDb<T = any>(key: string): T | null {
  return decodeKvRow<T>(key, readKvRow(key)).value
}

/** Version metadata only (cheap): null when the row does not exist. */
export function getKvMeta(key: string): { updatedAt: number } | null {
  const row = getDb().prepare('SELECT updated_at FROM kv WHERE key = ?').get(key) as { updated_at: number } | undefined
  return row ? { updatedAt: row.updated_at } : null
}

function readKvFromDisk<T = any>(key: string): T | null {
  const fp = path.join(DATA_DIR, `${key}.json`)
  if (!fs.existsSync(fp)) return null
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8')) as T
  } catch (err) {
    console.error(`[contentStore] seed file data/${key}.json is not valid JSON:`, errMessage(err))
    return null
  }
}

/**
 * Upsert. `updated_at` is strictly increasing per key (never equal to the
 * previous value), so it doubles as a version / ETag even for two writes
 * within the same millisecond.
 */
function putKvToDbOnly(key: string, value: any): number {
  const db = getDb()
  db.prepare(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = MAX(excluded.updated_at, kv.updated_at + 1)`,
  ).run(key, JSON.stringify(value), Date.now())
  return getKvMeta(key)?.updatedAt ?? 0
}

/**
 * Read a kv value with its version. A missing row is seeded from the git
 * seed file (data/<key>.json) — a corrupt row is not.
 */
export function getKvWithMeta<T = any>(key: string): KvRead<T> {
  const row = readKvRow(key)
  if (row) return decodeKvRow<T>(key, row)
  const fromDisk = readKvFromDisk<T>(key)
  if (fromDisk === null) return { value: null, updatedAt: 0, corrupt: false, raw: null }
  getDb()
    .prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING')
    .run(key, JSON.stringify(fromDisk), Date.now())
  return decodeKvRow<T>(key, readKvRow(key))
}

export function getKv<T = any>(key: string): T | null {
  return getKvWithMeta<T>(key).value
}

export type KvPutResult =
  | { ok: true; updatedAt: number; r2Warning?: string }
  | { ok: false; error: string; conflict?: { updatedAt: number } }

export type KvPutOptions = {
  /**
   * Optimistic-concurrency check, evaluated atomically with the write against
   * the row's current `updated_at` (0 when missing). Returning false aborts
   * the write with `conflict`.
   */
  precondition?: (currentUpdatedAt: number) => boolean
}

export async function putKv(key: string, value: any, opts: KvPutOptions = {}): Promise<KvPutResult> {
  let updatedAt: number
  try {
    const outcome = getDb().transaction((): { conflict: number } | { updatedAt: number } => {
      if (opts.precondition) {
        const current = getKvMeta(key)?.updatedAt ?? 0
        if (!opts.precondition(current)) return { conflict: current }
      }
      return { updatedAt: putKvToDbOnly(key, value) }
    })()
    if ('conflict' in outcome) {
      return {
        ok: false,
        error: 'The stored document changed since it was loaded',
        conflict: { updatedAt: outcome.conflict },
      }
    }
    updatedAt = outcome.updatedAt
  } catch (err: any) {
    return { ok: false, error: `DB write failed: ${err?.message || String(err)}` }
  }
  const r2Err = await pushToR2(
    kvR2Key(key),
    JSON.stringify(value, null, 2),
    'application/json; charset=utf-8',
  )
  if (r2Err) return { ok: true, updatedAt, r2Warning: `R2 sync failed: ${r2Err}` }
  return { ok: true, updatedAt }
}

// ── Versions / ETags (HTTP helpers for kv-backed documents) ──────────────

/** Strong ETag for a kv version: `"<updated_at ms>"` (`"0"` when no row). */
export function kvEtag(updatedAt: number): string {
  const n = Number.isFinite(updatedAt) && updatedAt > 0 ? Math.trunc(updatedAt) : 0
  return `"${n}"`
}

/**
 * Evaluate an `If-Match` request header against the current kv version.
 * No header (or an empty one) → allowed, for backward compatibility.
 * `*` matches only an existing row. Strong comparison: weak tags never match.
 */
export function ifMatchAllows(header: string | string[] | undefined, updatedAt: number): boolean {
  const raw = Array.isArray(header) ? header.join(',') : header
  if (typeof raw !== 'string' || raw.trim() === '') return true
  const current = kvEtag(updatedAt)
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .some((t) => (t === '*' ? updatedAt > 0 : t === current))
}

/**
 * JSON with object keys sorted, for "did anything change?" comparisons that
 * must not depend on key order.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value))
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src).sort()) {
      if (src[k] !== undefined) out[k] = sortKeysDeep(src[k])
    }
    return out
  }
  return value
}

// ── Filesystem snapshots (audit trail for cv / home) ─────────────────────

/** How many snapshots of each kind are kept on disk (newest first). */
export const SNAPSHOT_KEEP = 100

/** Error text of a restore whose snapshot file does not exist (maps to HTTP 404). */
export const SNAPSHOT_NOT_FOUND = 'Snapshot not found'

/** HTTP status for a failed snapshot restore: missing file 404, storage failure 500, bad input 400. */
export function restoreErrorStatus(error: string): 400 | 404 | 500 {
  if (error === SNAPSHOT_NOT_FOUND) return 404
  return error.startsWith('DB write failed') ? 500 : 400
}

const SNAPSHOT_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,126}\.json$/

/** Validate a caller-supplied snapshot filename. Returns null for anything unsafe or non-string. */
export function safeSnapshotName(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const name = input.trim()
  return SNAPSHOT_NAME.test(name) && !name.includes('..') ? name : null
}

/**
 * `Content-Disposition: attachment` for a download, with an ASCII-only
 * fallback `filename` and an RFC 5987 `filename*` (RFC 6266).
 */
export function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^A-Za-z0-9_.-]/g, '_') || 'download.json'
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

export function listSnapshotFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse()
  } catch {
    return []
  }
}

export function readSnapshotFile(dir: string, filename: unknown): string | null {
  const safe = safeSnapshotName(filename)
  if (!safe) return null
  const filePath = path.join(dir, safe)
  try {
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

/** Newest-first snapshot files written by writeSnapshotFile for `prefix`. */
function ownSnapshots(dir: string, prefix: string): string[] {
  return listSnapshotFiles(dir).filter((f) => f.startsWith(`${prefix}_`))
}

/**
 * Write `<prefix>_<UTC stamp>.json` into `dir` and prune to the newest
 * SNAPSHOT_KEEP files of that prefix. When the newest existing snapshot has
 * identical content no duplicate is written and its name is returned.
 */
export function writeSnapshotFile(dir: string, prefix: string, content: string, now = new Date()): string {
  fs.mkdirSync(dir, { recursive: true })
  const existing = ownSnapshots(dir, prefix)
  let filename: string
  if (existing.length && readSnapshotFile(dir, existing[0]) === content) filename = existing[0]
  else {
    const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
    filename = `${prefix}_${stamp}.json`
    fs.writeFileSync(path.join(dir, filename), content, 'utf-8')
    pruneSnapshots(dir, prefix, SNAPSHOT_KEEP)
  }
  // The activity log links this version to the write that replaces it (lib/audit).
  if (prefix === 'cv' || prefix === 'home') noteSnapshot(prefix, filename)
  return filename
}

/** Delete all but the newest `keep` snapshots of `prefix`; returns the removed names. */
export function pruneSnapshots(dir: string, prefix: string, keep: number = SNAPSHOT_KEEP): string[] {
  const stale = ownSnapshots(dir, prefix).slice(Math.max(0, keep))
  const removed: string[] = []
  for (const f of stale) {
    try {
      fs.unlinkSync(path.join(dir, f))
      removed.push(f)
    } catch (err) {
      console.warn(`[contentStore] could not prune snapshot ${f}:`, errMessage(err))
    }
  }
  return removed
}
