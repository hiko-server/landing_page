import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'
import crypto from 'crypto'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import Database from 'better-sqlite3'
import matter from 'gray-matter'
import { CONTENT_DB_PATH, closeDb, getDb, reopenDb } from './db'
import {
  isR2Configured,
  getR2Bucket,
  r2Delete,
  r2GetBuffer,
  r2PutBuffer,
  r2PutText,
  r2ListDetailed,
} from './r2'
import { itemR2Key, kvR2Key, markR2Pending, pageR2Key, uploadR2Key } from './contentStore'
import { STATIC_CONTENT_PATHS, collectionPaths, type Collection } from './revalidate'
import { isValidUploadName } from './security/uploadName'
// @ts-expect-error -- tar-stream ships no type declarations (typed below).
import tarStream from 'tar-stream'
import { inboxFile, mergeInboxText } from './inbox'

// A static import (not require) so the standalone tracer bundles the package
// and the module also loads as native ESM (node --test).
const tar = tarStream as {
  pack: () => any
  extract: () => any
}

/**
 * Whole-site snapshot system.
 *
 * The unit of work is a single gzipped tar of all *content*:
 *
 *   MANIFEST.json
 *   db/content.db           ← SQLite online backup (consistent across WAL)
 *   data/snapshots/<dir>/*  ← cv/home/blog/work/page version history
 *   uploads/<file>          ← public/uploads contents
 *   data/inbox/contact-inbox.jsonl ← contact messages (merged on restore, never replaced)
 *
 * Credentials and connection settings are not content: data/admin.json and
 * data/mongo_config.json are never written into a snapshot, and when an older
 * snapshot still carries them they are ignored on restore — restoring content
 * must never roll back the admin password.
 *
 * Atomicity:
 *   - A snapshot is built in a temp file and only renamed into place once the
 *     tar finalises successfully. Names carry milliseconds + a random suffix,
 *     so two snapshots in the same second can never overwrite each other.
 *   - Restore extracts to a sibling temp tree, validates the database, takes a
 *     safety snapshot of the current state, swaps the live DB file with a
 *     rename while the shared connection is closed, then mirrors the rest.
 *   - Right after the swap, one transaction stamps every restored row with
 *     the restore time and tombstones every blog/work slug the restore
 *     dropped, so the restored state is the newest side for the boot sync.
 *   - The R2 per-key objects are then rewritten from the restored DB (and item
 *     objects the restored DB no longer has are deleted). Keys the mirror
 *     could not write or delete are recorded in r2_pending, and the boot sync
 *     pushes/deletes them on the next start — it can never resurrect
 *     pre-restore content from a stale R2.
 *   - Backups and restores are serialised: a second request while one runs
 *     fails fast with StorageBusyError instead of interleaving.
 *
 * Retention: the newest LOCAL_KEEP tarballs are kept in data/backups and the
 * newest R2_KEEP in R2 (plus backups/latest.tgz). Only files this module
 * names (snapshot-*.tgz) are ever pruned.
 *
 * R2 layout (S3-compatible):
 *   backups/<name>.tgz      ← every successful snapshot
 *   backups/latest.tgz      ← alias overwritten on success (cheap pull target)
 */

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'data')
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads')
const BACKUPS_DIR = path.join(DATA_DIR, 'backups')
const DB_PATH = CONTENT_DB_PATH
const SNAPSHOT_DIRS = [
  'cv_snapshots',
  'home_snapshots',
  'blog_snapshots',
  'work_snapshots',
  'page_snapshots',
]
/** Files under data/ that may appear in old snapshots but are never restored. */
const NEVER_RESTORED = ['admin.json', 'mongo_config.json']
const REQUIRED_TABLES = ['pages', 'collection_items', 'kv']
const COLLECTIONS: Collection[] = ['blog', 'work']
const SAFE_NAME = /^[a-z0-9][a-z0-9-_]*$/

const R2_PREFIX = 'backups/'
const R2_LATEST_KEY = `${R2_PREFIX}latest.tgz`

export const LOCAL_KEEP = 20
export const R2_KEEP = 30
/** Names this module generates; nothing else in data/backups or R2 is pruned. */
export const SNAPSHOT_FILE_RE = /^snapshot-\d{8}-\d{6}(?:-\d{3}-[0-9a-f]{6})?\.tgz$/

export type SnapshotManifest = {
  version: 1
  createdAt: string
  host: string
  nodeVersion: string
  bucket: string | null
  reason?: 'manual' | 'pre-restore'
  files: Array<{ path: string; bytes: number }>
  totals: { files: number; bytes: number }
}

export type SnapshotResult = {
  filename: string
  localPath: string
  bytes: number
  manifest: SnapshotManifest
  r2: {
    pushed: boolean
    key: string | null
    latestKey: string | null
    error: string | null
  }
  pruned: { local: string[]; r2: string[] }
  warnings: string[]
}

/** What a restore changed (contract H, minus `revalidated`, which the API fills in). */
export type RestoreReport = {
  dbReplaced: boolean
  r2Mirrored: number
  r2Removed: number
  warnings: string[]
}

export type RestoreResult = {
  source: 'r2' | 'local'
  key: string | null
  bytes: number
  manifest: SnapshotManifest | null
  restored: { files: number; dbReplaced: boolean }
  /** Local snapshot of the state that was replaced (data/backups/<name>). */
  safetySnapshot: string | null
  report: RestoreReport
  /** Public pages whose content may have changed: static pages + every blog/work path before and after. */
  pathsToRevalidate: string[]
}

export class StorageBusyError extends Error {
  constructor(running: string) {
    super(`A ${running} is already running — try again when it has finished.`)
    this.name = 'StorageBusyError'
  }
}

// ── Small pure helpers (unit-tested) ──────────────────────────────────────

/** `snapshot-20261012-101500-123-a1b2c3.tgz` — sortable, unique per call. */
export function snapshotFilename(d = new Date(), suffix = crypto.randomBytes(3).toString('hex')): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const stamp =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}` +
    `-${pad(d.getUTCMilliseconds(), 3)}`
  return `snapshot-${stamp}-${suffix}.tgz`
}

/** Entries beyond the newest `keep` (newest first by `timeOf`, then by name). */
export function selectForPruning<T extends { name: string }>(items: T[], keep: number, timeOf: (t: T) => number): T[] {
  const sorted = [...items].sort((a, b) => timeOf(b) - timeOf(a) || b.name.localeCompare(a.name))
  return sorted.slice(Math.max(0, keep))
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err))

// ── Serialisation of backup/restore ───────────────────────────────────────

type LockGlobal = typeof globalThis & { __storageOperation?: string | null }

async function exclusive<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  const g = globalThis as LockGlobal
  if (g.__storageOperation) throw new StorageBusyError(g.__storageOperation)
  g.__storageOperation = operation
  try {
    return await fn()
  } finally {
    g.__storageOperation = null
  }
}

// ── Filesystem helpers ────────────────────────────────────────────────────

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p)
  } catch {
    return null
  }
}

function listFilesRecursive(dir: string, prefix = ''): Array<{ abs: string; rel: string }> {
  const out: Array<{ abs: string; rel: string }> = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const abs = path.join(dir, entry.name)
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(abs, rel))
    } else if (entry.isFile()) {
      out.push({ abs, rel })
    }
  }
  return out
}

/** Flat, servable files in public/uploads (the only ones /uploads/* can serve). */
function listUploadFiles(dir: string): Array<{ abs: string; name: string }> {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && isValidUploadName(e.name))
    .map((e) => ({ abs: path.join(dir, e.name), name: e.name }))
}

const UPLOAD_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
}

// ── Snapshot side ─────────────────────────────────────────────────────────

/** Use SQLite's online backup API so we capture a consistent .db across WAL. */
async function dumpDbToFile(dest: string): Promise<void> {
  if (!fs.existsSync(DB_PATH)) {
    // No DB yet — produce an empty placeholder so the manifest still references it.
    fs.writeFileSync(dest, Buffer.alloc(0))
    return
  }
  await getDb().backup(dest)
}

/** Build the tar and write a local copy. Returns its absolute path + manifest. */
async function buildLocalSnapshot(reason: NonNullable<SnapshotManifest['reason']>): Promise<{
  localPath: string
  manifest: SnapshotManifest
}> {
  ensureDir(BACKUPS_DIR)
  const filename = snapshotFilename()
  const localPath = path.join(BACKUPS_DIR, filename)
  const tmpPath = `${localPath}.tmp`
  const dbDump = path.join(os.tmpdir(), `${filename}.content.db`)

  try {
    await dumpDbToFile(dbDump)

    const entries: Array<{ tarPath: string; source: string }> = []
    const manifestFiles: SnapshotManifest['files'] = []
    const add = (tarPath: string, source: string) => {
      const stat = safeStat(source)
      if (!stat) return
      entries.push({ tarPath, source })
      manifestFiles.push({ path: tarPath, bytes: stat.size })
    }

    add('db/content.db', dbDump)
    for (const snap of SNAPSHOT_DIRS) {
      for (const f of listFilesRecursive(path.join(DATA_DIR, snap))) add(`data/snapshots/${snap}/${f.rel}`, f.abs)
    }
    for (const f of listFilesRecursive(UPLOADS_DIR)) add(`uploads/${f.rel}`, f.abs)
    // Contact inbox (messages + read state) — restored by merging, never replacing.
    add('data/inbox/contact-inbox.jsonl', inboxFile())

    const manifest: SnapshotManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      host: os.hostname(),
      nodeVersion: process.version,
      bucket: isR2Configured() ? getR2Bucket() : null,
      reason,
      files: manifestFiles,
      totals: {
        files: manifestFiles.length,
        bytes: manifestFiles.reduce((n, f) => n + f.bytes, 0),
      },
    }

    // Pipeline: pack → gzip → file. Push entries while the pipeline is running.
    const pack = tar.pack()
    const piped = pipeline(pack, zlib.createGzip({ level: 6 }), fs.createWriteStream(tmpPath))
    const addEntry = (name: string, body: Buffer) =>
      new Promise<void>((resolve, reject) => {
        pack.entry({ name, size: body.length }, body, (err: Error | null) => (err ? reject(err) : resolve()))
      })

    // MANIFEST first so a reader can short-circuit metadata reads.
    await addEntry('MANIFEST.json', Buffer.from(JSON.stringify(manifest, null, 2)))
    for (const entry of entries) await addEntry(entry.tarPath, fs.readFileSync(entry.source))
    pack.finalize()
    await piped

    fs.renameSync(tmpPath, localPath)
    return { localPath, manifest }
  } finally {
    fs.rmSync(dbDump, { force: true })
    fs.rmSync(tmpPath, { force: true })
  }
}

function pruneLocalBackups(keepFilename: string, warnings: string[]): string[] {
  const candidates = listLocalBackups()
    .filter((b) => SNAPSHOT_FILE_RE.test(b.filename) && b.filename !== keepFilename)
    .map((b) => ({ ...b, name: b.filename }))
  // The snapshot just written counts towards the limit.
  const victims = selectForPruning(candidates, LOCAL_KEEP - 1, (b) => b.mtime)
  const removed: string[] = []
  for (const v of victims) {
    try {
      fs.unlinkSync(path.join(BACKUPS_DIR, v.filename))
      removed.push(v.filename)
    } catch (err) {
      warnings.push(`Could not prune local backup ${v.filename}: ${errMsg(err)}`)
    }
  }
  return removed
}

async function pruneR2Backups(warnings: string[]): Promise<string[]> {
  const objs = (await r2ListDetailed(R2_PREFIX))
    .filter((o) => o.key !== R2_LATEST_KEY && SNAPSHOT_FILE_RE.test(o.key.slice(R2_PREFIX.length)))
    .map((o) => ({ ...o, name: o.key }))
  const victims = selectForPruning(objs, R2_KEEP, (o) => Date.parse(o.lastModified || '') || 0)
  const removed: string[] = []
  await mapLimit(victims, 4, async (v) => {
    try {
      await r2Delete(v.key)
      removed.push(v.key)
    } catch (err) {
      warnings.push(`Could not prune ${v.key} from R2: ${errMsg(err)}`)
    }
  })
  return removed
}

/**
 * Create a snapshot, save a local copy, and (if R2 is configured) push to
 * `backups/<name>.tgz` and overwrite `backups/latest.tgz`. Old snapshots
 * beyond the retention limits are pruned afterwards.
 *
 * R2 failures never delete the local snapshot — the operator still has
 * a recoverable artefact on disk.
 */
export function createSnapshot(): Promise<SnapshotResult> {
  return exclusive('backup', async () => {
    const { localPath, manifest } = await buildLocalSnapshot('manual')
    const filename = path.basename(localPath)
    const warnings: string[] = []
    const result: SnapshotResult = {
      filename,
      localPath,
      bytes: fs.statSync(localPath).size,
      manifest,
      r2: { pushed: false, key: null, latestKey: null, error: null },
      pruned: { local: pruneLocalBackups(filename, warnings), r2: [] },
      warnings,
    }

    if (!isR2Configured()) return result

    try {
      const body = fs.readFileSync(localPath)
      const key = `${R2_PREFIX}${filename}`
      await r2PutBuffer(key, body, 'application/gzip')
      await r2PutBuffer(R2_LATEST_KEY, body, 'application/gzip')
      result.r2.pushed = true
      result.r2.key = key
      result.r2.latestKey = R2_LATEST_KEY
    } catch (err) {
      result.r2.error = errMsg(err)
      return result
    }

    try {
      result.pruned.r2 = await pruneR2Backups(warnings)
    } catch (err) {
      warnings.push(`Could not list R2 backups for pruning: ${errMsg(err)}`)
    }
    return result
  })
}

// ── Restore side ──────────────────────────────────────────────────────────

async function extractTarball(buf: Buffer, destDir: string): Promise<SnapshotManifest | null> {
  ensureDir(destDir)
  let manifest: SnapshotManifest | null = null
  const extract = tar.extract()

  extract.on('entry', (header: any, stream: any, next: (err?: unknown) => void) => {
    const chunks: Buffer[] = []
    stream.on('data', (c: Buffer) => chunks.push(c))
    stream.on('error', next)
    stream.on('end', () => {
      try {
        const body = Buffer.concat(chunks)
        // Reject path traversal — only allow forward slashes, no .. / empty
        // (absolute) segments.
        const safe = String(header.name || '').replace(/\\/g, '/')
        if (safe.split('/').some((seg: string) => seg === '..' || seg === '')) return next()
        if (header.type === 'directory') return next()
        if (safe === 'MANIFEST.json') {
          try {
            manifest = JSON.parse(body.toString('utf-8'))
          } catch {
            manifest = null
          }
          return next()
        }
        const outPath = path.join(destDir, safe)
        if (!path.resolve(outPath).startsWith(path.resolve(destDir) + path.sep)) return next()
        ensureDir(path.dirname(outPath))
        fs.writeFileSync(outPath, body)
        next()
      } catch (err) {
        next(err)
      }
    })
    stream.resume()
  })

  // pipeline() propagates errors from EVERY stage (a corrupt / non-gzip
  // buffer used to emit an uncaught gunzip error and hang the request).
  await pipeline(Readable.from(buf), zlib.createGunzip(), extract)
  return manifest
}

function copyTreeOverwrite(src: string, dest: string): number {
  if (!fs.existsSync(src)) return 0
  let count = 0
  ensureDir(dest)
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, entry.name)
    const b = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      count += copyTreeOverwrite(a, b)
    } else if (entry.isFile()) {
      fs.copyFileSync(a, b)
      count++
    }
  }
  return count
}

/**
 * Is the staged file a usable content DB? `null` = no database in the
 * snapshot (taken before the store existed); a string = why it is unusable.
 * The staged copy is private to this restore, so it may be opened read-write.
 */
function inspectStagedDb(file: string): { usable: true } | { usable: false; reason: string | null } {
  const stat = safeStat(file)
  if (!stat || stat.size === 0) return { usable: false, reason: null }
  let db: Database.Database | null = null
  try {
    db = new Database(file, { fileMustExist: true })
    const check = String(db.pragma('quick_check', { simple: true }))
    if (check !== 'ok') return { usable: false, reason: `integrity check failed (${check})` }
    const tables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
        (r) => r.name,
      ),
    )
    const missing = REQUIRED_TABLES.filter((t) => !tables.has(t))
    if (missing.length) return { usable: false, reason: `missing table(s): ${missing.join(', ')}` }
    return { usable: true }
  } catch (err) {
    return { usable: false, reason: `not a readable SQLite database (${errMsg(err)})` }
  } finally {
    db?.close()
  }
}

/** Newest updated_at in the live DB (0 when empty or unreadable). */
function newestRowStamp(): number {
  try {
    const row = getDb()
      .prepare(
        `SELECT max(m) AS m FROM (
           SELECT max(updated_at) AS m FROM pages
           UNION ALL SELECT max(updated_at) FROM collection_items
           UNION ALL SELECT max(updated_at) FROM kv)`,
      )
      .get() as { m: number | null } | undefined
    return Number(row?.m) || 0
  } catch {
    return 0
  }
}

/**
 * Make the freshly swapped-in DB the newest side for the boot sync, in one
 * transaction:
 *   - every page / item / kv row gets updated_at = the restore time (kept
 *     above every pre-restore version, so a kv ETag from before the restore
 *     can never match a restored row);
 *   - every blog/work slug that existed before the restore and is missing
 *     after it joins that collection's tombstone list (stamped the same), so
 *     the boot sync deletes its R2 copy instead of importing it again;
 *   - r2_pending entries carried in the snapshot are dropped (they describe
 *     the replaced timeline; the mirror records its own failures).
 * Without this, restored rows keep their old timestamps and lose to the
 * pre-restore R2 objects whenever the mirror below fails.
 */
function settleRestoredDb(before: Array<{ collection: string; slug: string }>, floor: number): string[] {
  const warnings: string[] = []
  const db = getDb()
  const stamp = Math.max(Date.now(), floor + 1)
  db.transaction(() => {
    db.prepare('UPDATE pages SET updated_at = ?').run(stamp)
    db.prepare('UPDATE collection_items SET updated_at = ?').run(stamp)
    db.prepare('UPDATE kv SET updated_at = ?').run(stamp)
    db.prepare('DELETE FROM r2_pending').run()

    const after = new Set(
      (db.prepare('SELECT collection, slug FROM collection_items').all() as Array<{ collection: string; slug: string }>).map(
        (r) => `${r.collection}/${r.slug}`,
      ),
    )
    for (const collection of COLLECTIONS) {
      const dropped = before
        .filter((r) => r.collection === collection && !after.has(`${collection}/${r.slug}`))
        .map((r) => r.slug)
      if (!dropped.length) continue
      const key = `tombstones:${collection}`
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined
      let list: string[] = []
      if (row) {
        try {
          const parsed: unknown = JSON.parse(row.value)
          list = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
        } catch {
          // Rewriting a corrupt list would forget every earlier deletion.
          warnings.push(
            `kv '${key}' in the restored DB is not valid JSON, so ${dropped.length} ${collection} item(s) the restore ` +
              'removed were not recorded as deleted; if their R2 copies survive, the next boot sync imports them again.',
          )
          continue
        }
      }
      const set = new Set(list)
      for (const slug of dropped) set.add(slug)
      db.prepare(
        `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(key, JSON.stringify(Array.from(set)), stamp)
    }
  })()
  return warnings
}

function currentItemRefs(): Array<{ collection: string; slug: string }> {
  try {
    return getDb().prepare('SELECT collection, slug FROM collection_items').all() as Array<{
      collection: string
      slug: string
    }>
  } catch {
    return []
  }
}

/** Every public path whose content may differ after the restore. */
function restoredPaths(refs: Array<{ collection: string; slug: string }>): string[] {
  const out = new Set<string>(STATIC_CONTENT_PATHS)
  for (const { collection, slug } of refs) {
    if (!(COLLECTIONS as string[]).includes(collection) || !SAFE_NAME.test(slug)) continue
    for (const p of collectionPaths(collection as Collection, slug)) out.add(p)
  }
  return Array.from(out)
}

function summarizeFailures(what: string, failures: string[]): string {
  const shown = failures.slice(0, 5).join('; ')
  const more = failures.length > 5 ? ` (+${failures.length - 5} more)` : ''
  return `${what} failed for ${failures.length} object(s): ${shown}${more}`
}

/**
 * Rewrite every pages/items/kv R2 object from the (restored) local DB, delete
 * item objects the DB no longer has, and upload restored images R2 lacks.
 * Failures become warnings: the local restore has already succeeded. A page /
 * item / kv key that could not be written or deleted is recorded in
 * r2_pending, so the next boot sync repairs it from the restored DB.
 */
async function mirrorDbToR2(warnings: string[]): Promise<{ mirrored: number; removed: number }> {
  const db = getDb()
  const puts: Array<{ key: string; body: string; contentType: string }> = []
  const mdx = 'text/markdown; charset=utf-8'

  const pages = db.prepare('SELECT name, frontmatter, body FROM pages').all() as Array<{
    name: string
    frontmatter: string
    body: string
  }>
  for (const p of pages) {
    puts.push({ key: pageR2Key(p.name), body: matter.stringify(p.body || '\n', JSON.parse(p.frontmatter)), contentType: mdx })
  }

  const items = db.prepare('SELECT collection, slug, frontmatter, body FROM collection_items').all() as Array<{
    collection: string
    slug: string
    frontmatter: string
    body: string
  }>
  const liveItemKeys = new Set<string>()
  for (const it of items) {
    const key = itemR2Key(it.collection, it.slug)
    liveItemKeys.add(key)
    puts.push({ key, body: matter.stringify(it.body || '\n', JSON.parse(it.frontmatter)), contentType: mdx })
  }

  // kv keys the boot sync reads back; tombstone bookkeeping stays local.
  const kv = db.prepare('SELECT key, value FROM kv').all() as Array<{ key: string; value: string }>
  for (const row of kv) {
    if (!SAFE_NAME.test(row.key)) continue
    try {
      puts.push({
        key: kvR2Key(row.key),
        body: JSON.stringify(JSON.parse(row.value), null, 2),
        contentType: 'application/json; charset=utf-8',
      })
    } catch {
      warnings.push(`kv '${row.key}' in the restored DB is not valid JSON; it was not mirrored to R2.`)
    }
  }

  let mirrored = 0
  const failures: string[] = []
  // Content keys R2 still holds pre-restore state for (boot sync repairs them)
  // vs restored images it lacks (the boot sync only downloads images).
  let contentStale = false
  let uploadsStale = false
  await mapLimit(puts, 4, async (p) => {
    try {
      await r2PutText(p.key, p.body, p.contentType)
      mirrored++
    } catch (err) {
      failures.push(`${p.key}: ${errMsg(err)}`)
      markR2Pending(p.key, 'put')
      contentStale = true
    }
  })

  // Item objects the restored DB does not have (or non-canonical duplicates).
  let removed = 0
  for (const collection of COLLECTIONS) {
    let remote: Array<{ key: string }>
    try {
      remote = await r2ListDetailed(`${collection}/`)
    } catch (err) {
      warnings.push(`Could not list ${collection}/ in R2 (${errMsg(err)}); stale objects were not removed.`)
      contentStale = true
      continue
    }
    const stale = remote.filter((o) => {
      const base = o.key.slice(collection.length + 1)
      return /^[a-z0-9][a-z0-9-_]*\.(mdx|md)$/.test(base) && !liveItemKeys.has(o.key)
    })
    await mapLimit(stale, 4, async (o) => {
      try {
        await r2Delete(o.key)
        removed++
      } catch (err) {
        failures.push(`delete ${o.key}: ${errMsg(err)}`)
        // Recorded under the canonical key, which is what the boot sync
        // reconciles (it finds a `.md` variant of the same slug too). A slug
        // the restored DB still has is pushed instead — also correct.
        markR2Pending(itemR2Key(collection, o.key.slice(collection.length + 1).replace(/\.(mdx|md)$/, '')), 'delete')
        contentStale = true
      }
    })
  }

  // Restored images R2 has never seen (a fresh container rehydrates from R2).
  try {
    const remoteUploads = new Set((await r2ListDetailed('uploads/')).map((o) => o.key))
    const missing = listUploadFiles(UPLOADS_DIR).filter((f) => !remoteUploads.has(uploadR2Key(f.name)))
    await mapLimit(missing, 4, async (f) => {
      try {
        const type = UPLOAD_MIME[path.extname(f.name).toLowerCase()] || 'application/octet-stream'
        await r2PutBuffer(uploadR2Key(f.name), fs.readFileSync(f.abs), type)
        mirrored++
      } catch (err) {
        failures.push(`${uploadR2Key(f.name)}: ${errMsg(err)}`)
        uploadsStale = true
      }
    })
  } catch (err) {
    warnings.push(`Could not list uploads/ in R2 (${errMsg(err)}); restored images were not mirrored.`)
    uploadsStale = true
  }

  if (failures.length) warnings.push(summarizeFailures('R2 mirror', failures))
  if (contentStale) {
    warnings.push(
      'R2 is stale until the next successful sync: some R2 objects still hold the pre-restore content. ' +
        'The restored content stays in charge — the next container start pushes it to R2 and removes the dropped items.',
    )
  }
  if (uploadsStale) {
    warnings.push(
      'Some restored images are not in R2 yet, and the boot sync does not upload images: run `yarn content:push` ' +
        'once R2 is reachable, or a fresh container will be missing them.',
    )
  }
  return { mirrored, removed }
}

async function restoreFromBuffer(buf: Buffer, source: 'r2' | 'local', key: string | null): Promise<RestoreResult> {
  const stageDir = path.join(BACKUPS_DIR, `_restore-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`)
  ensureDir(BACKUPS_DIR)

  const warnings: string[] = []
  let filesRestored = 0
  let dbReplaced = false
  let manifest: SnapshotManifest | null = null
  let safetySnapshot: string | null = null
  const before = currentItemRefs()
  const newestBefore = newestRowStamp()

  try {
    manifest = await extractTarball(buf, stageDir)

    // 0. Validate before touching anything live.
    const stagedDb = path.join(stageDir, 'db', 'content.db')
    const inspection = inspectStagedDb(stagedDb)
    if (!inspection.usable && inspection.reason) {
      throw new Error(`Snapshot database is unusable: ${inspection.reason}. Nothing was restored.`)
    }
    if (!inspection.usable) warnings.push('The snapshot contains no database; the current content DB was kept.')

    // 1. Safety net: the state about to be replaced becomes a local snapshot.
    safetySnapshot = path.basename((await buildLocalSnapshot('pre-restore')).localPath)

    // 2. Replace the SQLite DB. Copy next to the target first, then rename —
    //    a crash mid-copy can never leave a half-written live database. The
    //    shared connection is closed for every runtime, then reopened.
    if (inspection.usable) {
      ensureDir(path.dirname(DB_PATH))
      const incoming = `${DB_PATH}.restore`
      fs.copyFileSync(stagedDb, incoming)
      closeDb()
      // Drop WAL/SHM so reopen doesn't replay against the new file.
      for (const ext of ['-wal', '-shm']) fs.rmSync(`${DB_PATH}${ext}`, { force: true })
      fs.renameSync(incoming, DB_PATH)
      reopenDb()
      dbReplaced = true
      filesRestored++
      try {
        warnings.push(...settleRestoredDb(before, newestBefore))
      } catch (err) {
        warnings.push(
          `Could not stamp the restored rows as current (${errMsg(err)}); if the R2 mirror below fails too, ` +
            'the next boot sync may bring back pre-restore content from R2.',
        )
      }
    }

    // 3. Credentials / connection settings are never taken from a snapshot.
    for (const name of NEVER_RESTORED) {
      if (fs.existsSync(path.join(stageDir, 'data', name))) {
        warnings.push(`data/${name} in the snapshot was ignored (credentials and settings are never restored).`)
      }
    }

    // 4. Snapshot history dirs.
    const stagedSnapshots = path.join(stageDir, 'data', 'snapshots')
    for (const snap of SNAPSHOT_DIRS) {
      filesRestored += copyTreeOverwrite(path.join(stagedSnapshots, snap), path.join(DATA_DIR, snap))
    }

    // 5. Uploads — only flat names the file server can actually serve.
    const stagedUploads = listUploadFiles(path.join(stageDir, 'uploads'))
    if (stagedUploads.length) ensureDir(UPLOADS_DIR)
    for (const f of stagedUploads) {
      fs.copyFileSync(f.abs, path.join(UPLOADS_DIR, f.name))
      filesRestored++
    }

    // 6. Contact inbox: merge, so messages received after the snapshot survive.
    const stagedInbox = path.join(stageDir, 'data', 'inbox', 'contact-inbox.jsonl')
    if (fs.existsSync(stagedInbox)) {
      try {
        const added = mergeInboxText(fs.readFileSync(stagedInbox, 'utf8'))
        if (added) filesRestored++
      } catch (err) {
        warnings.push(`Contact inbox could not be merged (${errMsg(err)}).`)
      }
    }
  } finally {
    // Always clean the stage dir — also when extraction failed.
    fs.rmSync(stageDir, { recursive: true, force: true })
  }

  // 7. Make R2 match the restored DB.
  let r2Mirrored = 0
  let r2Removed = 0
  if (dbReplaced && isR2Configured()) {
    const mirror = await mirrorDbToR2(warnings)
    r2Mirrored = mirror.mirrored
    r2Removed = mirror.removed
  }

  return {
    source,
    key,
    bytes: buf.length,
    manifest,
    restored: { files: filesRestored, dbReplaced },
    safetySnapshot,
    report: { dbReplaced, r2Mirrored, r2Removed, warnings },
    pathsToRevalidate: restoredPaths([...before, ...currentItemRefs()]),
  }
}

/**
 * Pull `backups/latest.tgz` from R2 and apply it. Throws if R2 isn't
 * configured or the object is missing.
 */
export function restoreLatestFromR2(): Promise<RestoreResult> {
  return exclusive('restore', async () => {
    if (!isR2Configured()) throw new Error('R2 is not configured.')
    const buf = await r2GetBuffer(R2_LATEST_KEY)
    if (!buf) {
      throw new Error(
        `No snapshot at ${R2_LATEST_KEY}. Run "Backup now" once before pulling, or upload a tarball manually.`,
      )
    }
    return restoreFromBuffer(buf, 'r2', R2_LATEST_KEY)
  })
}

/** Restore from a specific local snapshot file (a bare *.tgz name under data/backups). */
export function restoreLocalSnapshot(filename: string): Promise<RestoreResult> {
  return exclusive('restore', async () => {
    // Only a bare *.tgz name inside data/backups is accepted (no paths, no
    // `..`, no sibling directories that merely share the prefix).
    const abs = path.resolve(BACKUPS_DIR, path.basename(String(filename || '')))
    if (path.dirname(abs) !== path.resolve(BACKUPS_DIR) || !abs.endsWith('.tgz')) {
      throw new Error('Refusing to restore from outside data/backups.')
    }
    if (!fs.existsSync(abs)) throw new Error(`Snapshot not found: ${path.basename(abs)}`)
    return restoreFromBuffer(fs.readFileSync(abs), 'local', path.relative(ROOT, abs))
  })
}

// ── Inventory ─────────────────────────────────────────────────────────────

export type LocalBackupMeta = {
  filename: string
  bytes: number
  mtime: number
}

export function listLocalBackups(): LocalBackupMeta[] {
  if (!fs.existsSync(BACKUPS_DIR)) return []
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.tgz') && !f.startsWith('_restore-'))
    .flatMap((f) => {
      const stat = safeStat(path.join(BACKUPS_DIR, f))
      return stat && stat.isFile() ? [{ filename: f, bytes: stat.size, mtime: stat.mtimeMs }] : []
    })
    .sort((a, b) => b.mtime - a.mtime)
}

export type R2BackupMeta = {
  key: string
  size: number
  lastModified: string | null
}

export async function listR2Backups(): Promise<R2BackupMeta[]> {
  if (!isR2Configured()) return []
  const objs = await r2ListDetailed(R2_PREFIX)
  return objs
    .filter((o) => o.key.endsWith('.tgz'))
    .sort((a, b) => (a.lastModified || '').localeCompare(b.lastModified || '') * -1)
}

export const BACKUP_CONSTANTS = {
  R2_PREFIX,
  R2_LATEST_KEY,
  BACKUPS_DIR,
  LOCAL_KEEP,
  R2_KEEP,
}
