/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { closeDb, getDb } from './db'
import {
  isR2Configured,
  getR2Bucket,
  r2GetBuffer,
  r2PutBuffer,
  r2ListDetailed,
} from './r2'

// tar-stream has no bundled types; declared with require + any.
const tar = require('tar-stream') as {
  pack: () => any
  extract: () => any
}

/**
 * Whole-site snapshot system.
 *
 * Per user spec the backup must contain ALL local data — not just per-row
 * dual-writes — so the unit of work is a single gzipped tar:
 *
 *   MANIFEST.json
 *   db/content.db           ← SQLite online backup (consistent across WAL)
 *   data/admin.json         ← bootstrap credentials
 *   data/mongo_config.json  ← Mongo connection settings (when not env-only)
 *   data/snapshots/<dir>/*  ← cv/home/blog/work/page version history
 *   uploads/<file>          ← public/uploads contents
 *
 * Atomicity:
 *   - Snapshot is built in a temp dir and only moved into place once the tar
 *     finalises successfully.
 *   - Restore extracts to a sibling temp tree, swaps the live DB after
 *     closeDb(), then mirrors the remaining trees.
 *
 * R2 layout (S3-compatible):
 *   backups/<ts>.tgz        ← every successful snapshot
 *   backups/latest.tgz      ← alias overwritten on success (cheap pull target)
 */

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'data')
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads')
const BACKUPS_DIR = path.join(DATA_DIR, 'backups')
const DB_PATH = path.join(DATA_DIR, 'content.db')
const SNAPSHOT_DIRS = [
  'cv_snapshots',
  'home_snapshots',
  'blog_snapshots',
  'work_snapshots',
  'page_snapshots',
]
const CONFIG_FILES = ['admin.json', 'mongo_config.json']

const R2_PREFIX = 'backups/'
const R2_LATEST_KEY = `${R2_PREFIX}latest.tgz`

export type SnapshotManifest = {
  version: 1
  createdAt: string
  host: string
  nodeVersion: string
  bucket: string | null
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
}

export type RestoreResult = {
  source: 'r2' | 'local'
  key: string | null
  bytes: number
  manifest: SnapshotManifest | null
  restored: { files: number; dbReplaced: boolean }
}

function tsStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  )
}

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

/** Use SQLite's online backup API so we capture a consistent .db across WAL. */
async function dumpDbToFile(dest: string): Promise<void> {
  if (!fs.existsSync(DB_PATH)) {
    // No DB yet — produce an empty placeholder so the manifest still references it.
    fs.writeFileSync(dest, Buffer.alloc(0))
    return
  }
  const db = getDb()
  await db.backup(dest)
}

/** Build the tar and write a local copy. Returns its absolute path + manifest. */
async function buildLocalSnapshot(): Promise<{
  localPath: string
  manifest: SnapshotManifest
}> {
  ensureDir(BACKUPS_DIR)
  const stamp = tsStamp()
  const filename = `snapshot-${stamp}.tgz`
  const localPath = path.join(BACKUPS_DIR, filename)
  const tmpPath = `${localPath}.tmp`

  // 1. Dump the SQLite DB into a temp file.
  const dbDump = path.join(os.tmpdir(), `content-${stamp}.db`)
  await dumpDbToFile(dbDump)

  const entries: Array<{ tarPath: string; source: string | Buffer }> = []
  const manifestFiles: SnapshotManifest['files'] = []

  // 2. SQLite DB.
  const dbStat = safeStat(dbDump)
  if (dbStat) {
    entries.push({ tarPath: 'db/content.db', source: dbDump })
    manifestFiles.push({ path: 'db/content.db', bytes: dbStat.size })
  }

  // 3. Top-level config files (admin, mongo).
  for (const name of CONFIG_FILES) {
    const abs = path.join(DATA_DIR, name)
    const stat = safeStat(abs)
    if (stat && stat.isFile()) {
      entries.push({ tarPath: `data/${name}`, source: abs })
      manifestFiles.push({ path: `data/${name}`, bytes: stat.size })
    }
  }

  // 4. Version-history snapshot dirs.
  for (const snap of SNAPSHOT_DIRS) {
    const absDir = path.join(DATA_DIR, snap)
    for (const f of listFilesRecursive(absDir)) {
      const stat = safeStat(f.abs)
      if (!stat) continue
      const tarPath = `data/snapshots/${snap}/${f.rel}`
      entries.push({ tarPath, source: f.abs })
      manifestFiles.push({ path: tarPath, bytes: stat.size })
    }
  }

  // 5. Uploaded images.
  for (const f of listFilesRecursive(UPLOADS_DIR)) {
    const stat = safeStat(f.abs)
    if (!stat) continue
    const tarPath = `uploads/${f.rel}`
    entries.push({ tarPath, source: f.abs })
    manifestFiles.push({ path: tarPath, bytes: stat.size })
  }

  // 6. Write everything through tar | gzip → tmp file → atomic rename.
  const pack = tar.pack()
  const gzip = zlib.createGzip({ level: 6 })
  const out = fs.createWriteStream(tmpPath)

  const manifest: SnapshotManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    host: os.hostname(),
    nodeVersion: process.version,
    bucket: isR2Configured() ? getR2Bucket() : null,
    files: manifestFiles,
    totals: {
      files: manifestFiles.length,
      bytes: manifestFiles.reduce((n, f) => n + f.bytes, 0),
    },
  }

  // Pipeline: pack → gzip → file. Push entries while the pipeline is running.
  const piped = pipeline(pack, gzip, out)

  // MANIFEST first so a reader can short-circuit metadata reads.
  await new Promise<void>((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(manifest, null, 2))
    pack.entry({ name: 'MANIFEST.json', size: body.length }, body, (err: Error | null) =>
      err ? reject(err) : resolve(),
    )
  })

  for (const entry of entries) {
    const body =
      typeof entry.source === 'string'
        ? fs.readFileSync(entry.source)
        : entry.source
    await new Promise<void>((resolve, reject) => {
      pack.entry({ name: entry.tarPath, size: body.length }, body, (err: Error | null) =>
        err ? reject(err) : resolve(),
      )
    })
  }

  pack.finalize()
  await piped

  fs.renameSync(tmpPath, localPath)
  try {
    fs.unlinkSync(dbDump)
  } catch {
    // best-effort cleanup
  }

  return { localPath, manifest }
}

/**
 * Create a snapshot, save a local copy, and (if R2 is configured) push to
 * `backups/<ts>.tgz` and overwrite `backups/latest.tgz`.
 *
 * R2 failures never delete the local snapshot — the operator still has
 * a recoverable artefact on disk.
 */
export async function createSnapshot(): Promise<SnapshotResult> {
  const { localPath, manifest } = await buildLocalSnapshot()
  const filename = path.basename(localPath)
  const bytes = fs.statSync(localPath).size

  const result: SnapshotResult = {
    filename,
    localPath,
    bytes,
    manifest,
    r2: { pushed: false, key: null, latestKey: null, error: null },
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
  } catch (err: any) {
    result.r2.error = err?.message || String(err)
  }
  return result
}

// ── Restore side ──────────────────────────────────────────────────────────

async function extractTarball(buf: Buffer, destDir: string): Promise<SnapshotManifest | null> {
  ensureDir(destDir)
  let manifest: SnapshotManifest | null = null
  const extract = tar.extract()

  const done = new Promise<void>((resolve, reject) => {
    extract.on('entry', (header: any, stream: any, next: () => void) => {
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('end', () => {
        try {
          const body = Buffer.concat(chunks)
          // Reject path traversal — only allow forward slashes, no .. segments.
          const safe = header.name.replace(/\\/g, '/')
          if (safe.split('/').some((seg: string) => seg === '..' || seg === '')) {
            return next()
          }
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
          ensureDir(path.dirname(outPath))
          fs.writeFileSync(outPath, body)
          next()
        } catch (err) {
          reject(err)
        }
      })
      stream.on('error', reject)
      stream.resume()
    })
    extract.on('finish', () => resolve())
    extract.on('error', reject)
  })

  const gunzip = zlib.createGunzip()
  Readable.from(buf).pipe(gunzip).pipe(extract)
  await done
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

async function restoreFromBuffer(buf: Buffer, source: 'r2' | 'local', key: string | null): Promise<RestoreResult> {
  const stamp = tsStamp()
  const stageDir = path.join(BACKUPS_DIR, `_restore-${stamp}`)
  ensureDir(BACKUPS_DIR)

  const manifest = await extractTarball(buf, stageDir)

  let filesRestored = 0
  let dbReplaced = false

  // 1. Replace the SQLite DB. Close any open handle so Windows can move it.
  const stagedDb = path.join(stageDir, 'db', 'content.db')
  if (fs.existsSync(stagedDb)) {
    closeDb()
    ensureDir(path.dirname(DB_PATH))
    // Drop WAL/SHM so reopen doesn't replay against the new file.
    for (const ext of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(`${DB_PATH}${ext}`)
      } catch {
        // not present — fine
      }
    }
    fs.copyFileSync(stagedDb, DB_PATH)
    dbReplaced = true
    filesRestored++
  }

  // 2. Top-level config files.
  const stagedDataDir = path.join(stageDir, 'data')
  for (const name of CONFIG_FILES) {
    const src = path.join(stagedDataDir, name)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DATA_DIR, name))
      filesRestored++
    }
  }

  // 3. Snapshot history dirs.
  const stagedSnapshots = path.join(stageDir, 'data', 'snapshots')
  if (fs.existsSync(stagedSnapshots)) {
    for (const snap of SNAPSHOT_DIRS) {
      filesRestored += copyTreeOverwrite(
        path.join(stagedSnapshots, snap),
        path.join(DATA_DIR, snap),
      )
    }
  }

  // 4. Uploads.
  const stagedUploads = path.join(stageDir, 'uploads')
  if (fs.existsSync(stagedUploads)) {
    filesRestored += copyTreeOverwrite(stagedUploads, UPLOADS_DIR)
  }

  // 5. Clean stage dir.
  try {
    fs.rmSync(stageDir, { recursive: true, force: true })
  } catch {
    // best-effort
  }

  return {
    source,
    key,
    bytes: buf.length,
    manifest,
    restored: { files: filesRestored, dbReplaced },
  }
}

/**
 * Pull `backups/latest.tgz` from R2 and apply it. Throws if R2 isn't
 * configured or the object is missing.
 */
export async function restoreLatestFromR2(): Promise<RestoreResult> {
  if (!isR2Configured()) throw new Error('R2 is not configured.')
  const buf = await r2GetBuffer(R2_LATEST_KEY)
  if (!buf) {
    throw new Error(
      `No snapshot at ${R2_LATEST_KEY}. Run "Backup now" once before pulling, or upload a tarball manually.`,
    )
  }
  return restoreFromBuffer(buf, 'r2', R2_LATEST_KEY)
}

/** Restore from a specific local snapshot file (absolute or under data/backups). */
export async function restoreLocalSnapshot(filename: string): Promise<RestoreResult> {
  const abs = path.isAbsolute(filename) ? filename : path.join(BACKUPS_DIR, filename)
  if (!abs.startsWith(BACKUPS_DIR)) throw new Error('Refusing to restore from outside data/backups.')
  if (!fs.existsSync(abs)) throw new Error(`Snapshot not found: ${abs}`)
  const buf = fs.readFileSync(abs)
  return restoreFromBuffer(buf, 'local', path.relative(ROOT, abs))
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
    .filter((f) => f.endsWith('.tgz') && !f.includes('_restore-'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, f))
      return { filename: f, bytes: stat.size, mtime: stat.mtimeMs }
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
}
