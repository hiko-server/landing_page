import fs from 'fs'
import path from 'path'
import { getDb } from '../db'
import { log } from '../log'
import { isR2Configured, r2Delete, r2GetBuffer, r2List, r2PutBuffer } from '../r2'
import { clearR2Pending, markR2Pending, uploadR2Key } from '../contentStore'
import { purgeEdgeUrls } from '../revalidate'
import { isValidUploadName } from '../security/uploadName'
import { imageSizeFromBytes } from '../rehype/imageSize'
import { isVariantName, variantOriginalName } from '../uploadVariants'
import { isTrashed, rebuildUsage, uploadsDir, usageOf } from './library'
import { TRASH_DAYS, assetTrashDir, parseList, purgeExpiredTrash, purgeFromTrash, trashDir } from './trashStore'
import { cleanMeta, isEmptyMeta } from './meta'
import { giveMediaMeta, takeMediaMeta } from './metaStore'
import type { MediaUsage, TrashItem } from './types'

export { TRASH_DAYS, purgeExpiredTrash, purgeFromTrash, trashDir }

/**
 * The media library's trash (H7) — SERVER-ONLY.
 *
 * Deleting an upload moves its original and every variant file out of
 * public/uploads into data/media-trash/<name>/ (never served; a copy across
 * the two Docker volumes when a rename cannot), records it in media_trash
 * with its default texts, deletes its R2 objects (original and variants) and
 * purges its URLs from the Cloudflare cache. It stays restorable for
 * TRASH_DAYS days — "Restore" moves the files back, mirrors them to R2 again
 * and gives back the texts — and is then removed for good by the nightly
 * purge (lib/media/trashSchedule) or "Delete now".
 *
 * A delete is refused while anything refers to the upload: the usage index
 * is re-scanned from the store first, so a reference saved a moment ago
 * counts. A replaced upload (lib/media/replace) goes to the trash the same
 * way, minus that check — its references were just moved to the new file.
 *
 * R2 deletes that fail are recorded in r2_pending; the trash row is the
 * tombstone the file server (no R2 fallback for a trashed name) and the boot
 * sync (never pulls a trashed name back, retries the pending deletes) honour.
 */

/** The R2 calls the trash makes (a test seam; defaults to lib/r2). */
export type R2Ops = {
  configured: () => boolean
  list: (prefix: string) => Promise<string[]>
  del: (key: string) => Promise<void>
  put: (key: string, body: Buffer, contentType: string) => Promise<void>
  get?: (key: string) => Promise<Buffer | null>
}

export const defaultR2Ops: R2Ops = { configured: isR2Configured, list: r2List, del: r2Delete, put: r2PutBuffer, get: r2GetBuffer }

export const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
}

export const contentTypeOf = (name: string) => UPLOAD_CONTENT_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream'

/** Move a file, across file systems too (data/ and public/uploads are separate Docker volumes). */
export function moveFile(src: string, dst: string): void {
  try {
    fs.renameSync(src, dst)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    fs.copyFileSync(src, dst, fs.constants.COPYFILE_EXCL)
    fs.unlinkSync(src)
  }
}

/** Pixel size from a file's first 64 KB (header only). */
function headerSize(file: string): { width: number; height: number } | null {
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const buf = Buffer.alloc(64 * 1024)
      const n = fs.readSync(fd, buf, 0, buf.length, 0)
      return imageSizeFromBytes(buf.subarray(0, n))
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

/** Original + variant files of `name` in public/uploads. */
export function localFilesOf(name: string, dir = uploadsDir()): string[] {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }
  const out = entries.filter((f) => f === name || variantOriginalName(f) === name)
  // The original first, then its variants in name order.
  return out.sort((a, b) => (a === name ? -1 : b === name ? 1 : a.localeCompare(b)))
}

/** The asset's objects in R2 (uploads/<name> and its variants); null when R2 could not be listed. */
export async function r2KeysOf(name: string, r2: R2Ops = defaultR2Ops): Promise<string[] | null> {
  try {
    const keys = await r2.list(uploadR2Key(name))
    return keys.filter((k) => {
      const base = k.startsWith('uploads/') ? k.slice('uploads/'.length) : ''
      return base === name || variantOriginalName(base) === name
    })
  } catch (err) {
    log.warn('media: could not list an upload in R2', { name, err })
    return null
  }
}

/**
 * Delete the asset's R2 objects (as listed; the files known locally when
 * the listing fails). A failed delete is recorded in r2_pending; the boot
 * sync also removes any R2 object of a trashed name. Returns whether R2 may
 * still hold some of it, and a warning for the admin.
 */
export async function deleteFromR2(name: string, knownFiles: readonly string[], r2: R2Ops = defaultR2Ops): Promise<{ pending: boolean; warning: string | null }> {
  if (!r2.configured()) return { pending: false, warning: null }
  const listed = await r2KeysOf(name, r2)
  const keys = listed ?? Array.from(new Set(knownFiles)).map(uploadR2Key)
  let failed = 0
  for (const key of keys) {
    const startedAt = Date.now()
    try {
      await r2.del(key)
      clearR2Pending(key, startedAt)
    } catch (err) {
      failed++
      markR2Pending(key, 'delete')
      log.warn('media: R2 delete failed; the next sync retries it', { key, err })
    }
  }
  if (failed) return { pending: true, warning: `R2 delete failed for ${failed} file${failed === 1 ? '' : 's'}: the next sync retries` }
  if (!listed) return { pending: true, warning: 'R2 could not be listed: the next sync removes any copy it still holds' }
  return { pending: false, warning: null }
}

export type TrashResult =
  | { ok: true; name: string; files: number; r2Warning?: string }
  | { ok: false; name: string; code: 'INVALID' | 'NOT_FOUND' | 'TRASHED' | 'IN_USE' | 'FS'; error: string; usage?: MediaUsage[] }

export type TrashOptions = {
  reason?: 'deleted' | 'replaced'
  replacedBy?: string
  now?: number
  r2?: R2Ops
  /** Purge the old URLs from the Cloudflare cache (default: lib/revalidate purgeEdgeUrls). */
  purge?: (paths: string[]) => Promise<unknown>
}

/** Move one upload to the trash (see the module comment). */
export async function moveToTrash(name: string, opts: TrashOptions = {}): Promise<TrashResult> {
  const reason = opts.reason ?? 'deleted'
  const now = opts.now ?? Date.now()
  const r2 = opts.r2 ?? defaultR2Ops
  if (!isValidUploadName(name) || isVariantName(name)) return { ok: false, name, code: 'INVALID', error: 'Not an upload name' }
  if (isTrashed(name)) return { ok: false, name, code: 'TRASHED', error: 'Already in the trash' }
  const db = getDb()
  const asset = db.prepare('SELECT bytes, width, height, r2_files FROM media_assets WHERE name = ?').get(name) as
    | { bytes: number; width: number | null; height: number | null; r2_files: string }
    | undefined
  const dir = uploadsDir()
  const files = localFilesOf(name, dir)
  const hasOriginal = files[0] === name
  if (!hasOriginal && !asset) return { ok: false, name, code: 'NOT_FOUND', error: 'No such upload' }
  if (reason === 'deleted') {
    const usage = usageOf(name, { fresh: true })
    if (usage.length) return { ok: false, name, code: 'IN_USE', error: 'Still used — remove it from every place first', usage }
  }

  // 1. The files leave public/uploads (rolled back if any move fails). An
  //    upload only R2 holds is downloaded into the trash first, so it can be
  //    restored like any other; if that fails, nothing is deleted.
  const target = assetTrashDir(name)
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  const moved: string[] = []
  if (!hasOriginal) {
    const keys = r2.configured() && r2.get ? await r2KeysOf(name, r2) : null
    const original = uploadR2Key(name)
    try {
      if (!keys || !keys.includes(original)) throw new Error('R2 holds no copy to keep')
      for (const key of [original, ...keys.filter((k) => k !== original)]) {
        const buf = await (r2.get as NonNullable<R2Ops['get']>)(key)
        if (!buf) continue
        const f = key.slice('uploads/'.length)
        fs.writeFileSync(path.join(target, f), buf as unknown as Uint8Array, { flag: 'wx' })
        moved.push(f)
      }
      if (moved[0] !== name) throw new Error('R2 holds no copy to keep')
    } catch (err) {
      fs.rmSync(target, { recursive: true, force: true })
      log.warn('media: could not keep a copy of an R2-only upload; nothing deleted', { name, err })
      return { ok: false, name, code: 'FS', error: 'Its copy in R2 could not be kept for the trash; nothing was deleted' }
    }
  }
  try {
    for (const f of files) {
      moveFile(path.join(dir, f), path.join(target, f))
      moved.push(f)
    }
  } catch (err) {
    for (const f of moved) {
      try {
        moveFile(path.join(target, f), path.join(dir, f))
      } catch {
        /* best effort: the file stays in the trash folder */
      }
    }
    log.error('media: moving an upload to the trash failed', { name, err })
    return { ok: false, name, code: 'FS', error: 'The files could not be moved to the trash' }
  }

  // 2. The record (tombstone) with its texts; the index forgets it.
  const meta = await takeMediaMeta(name)
  let width = asset?.width ?? null
  let height = asset?.height ?? null
  let bytes = asset?.bytes ?? 0
  if (moved.includes(name)) {
    try {
      bytes = fs.statSync(path.join(target, name)).size
    } catch {
      /* keep the indexed size */
    }
  }
  if ((width === null || height === null) && moved.includes(name)) {
    const size = headerSize(path.join(target, name))
    width = size?.width ?? null
    height = size?.height ?? null
  }
  db.transaction(() => {
    db.prepare(
      `INSERT INTO media_trash (name, files, bytes, width, height, meta, reason, replaced_by, r2_pending, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(name) DO UPDATE SET files = excluded.files, bytes = excluded.bytes, width = excluded.width,
         height = excluded.height, meta = excluded.meta, reason = excluded.reason, replaced_by = excluded.replaced_by,
         r2_pending = 0, deleted_at = excluded.deleted_at`,
    ).run(name, JSON.stringify(moved), bytes, width, height, meta ? JSON.stringify(meta) : null, reason, opts.replacedBy ?? null, now)
    db.prepare('DELETE FROM media_assets WHERE name = ?').run(name)
    db.prepare('DELETE FROM media_usage WHERE name = ?').run(name)
  })()

  // 3. R2 and the edge.
  const known = Array.from(new Set([...moved, ...parseList(asset?.r2_files)]))
  const r2Out = await deleteFromR2(name, known, r2)
  if (r2Out.pending) db.prepare('UPDATE media_trash SET r2_pending = 1 WHERE name = ?').run(name)
  const purge = opts.purge ?? purgeEdgeUrls
  void Promise.resolve(purge(known.map((f) => `/uploads/${encodeURIComponent(f)}`))).catch(() => undefined)
  return { ok: true, name, files: moved.length, ...(r2Out.warning ? { r2Warning: r2Out.warning } : {}) }
}

type TrashRow = {
  name: string
  files: string
  bytes: number
  width: number | null
  height: number | null
  meta: string | null
  reason: string
  replaced_by: string | null
  r2_pending: number
  deleted_at: number
}

function trashRow(name: string): TrashRow | null {
  return (getDb().prepare('SELECT * FROM media_trash WHERE name = ?').get(name) as TrashRow | undefined) ?? null
}

function metaOf(raw: string | null): TrashItem['meta'] {
  try {
    const m = raw ? JSON.parse(raw) : null
    if (!m || typeof m !== 'object') return null
    const clean = cleanMeta(m)
    return isEmptyMeta(clean) ? null : clean
  } catch {
    return null
  }
}

export type RestoreResult =
  | { ok: true; name: string; r2Warning?: string }
  | { ok: false; name: string; code: 'NOT_FOUND' | 'EXISTS' | 'GONE' | 'FS'; error: string }

/** Put a trashed upload back where it was (see the module comment). */
export async function restoreFromTrash(name: string, opts: { r2?: R2Ops; now?: number } = {}): Promise<RestoreResult> {
  const r2 = opts.r2 ?? defaultR2Ops
  const row = isValidUploadName(name) ? trashRow(name) : null
  if (!row) return { ok: false, name, code: 'NOT_FOUND', error: 'Not in the trash' }
  const dir = uploadsDir()
  if (fs.existsSync(path.join(dir, name))) return { ok: false, name, code: 'EXISTS', error: 'A file with this name is in the library again; delete the trashed copy instead' }
  const source = assetTrashDir(name)
  const files = parseList(row.files).filter((f) => fs.existsSync(path.join(source, f)))
  if (!files.includes(name)) {
    // Only R2 held it when it was deleted (or the folder is gone): nothing to put back.
    return { ok: false, name, code: 'GONE', error: 'The trashed file is no longer on the server' }
  }
  fs.mkdirSync(dir, { recursive: true })
  const moved: string[] = []
  try {
    for (const f of files) {
      if (fs.existsSync(path.join(dir, f))) continue // a variant written meanwhile stays
      moveFile(path.join(source, f), path.join(dir, f))
      moved.push(f)
    }
  } catch (err) {
    for (const f of moved) {
      try {
        moveFile(path.join(dir, f), path.join(source, f))
      } catch {
        /* best effort */
      }
    }
    log.error('media: restoring an upload from the trash failed', { name, err })
    return { ok: false, name, code: 'FS', error: 'The files could not be moved back' }
  }
  fs.rmSync(source, { recursive: true, force: true })
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM media_trash WHERE name = ?').run(name)
    // Its own address serves it again.
    db.prepare('DELETE FROM media_redirects WHERE from_name = ?').run(name)
  })()
  await giveMediaMeta(name, metaOf(row.meta), opts.now)

  let failed = 0
  if (r2.configured()) {
    for (const f of moved) {
      const key = uploadR2Key(f)
      const startedAt = Date.now()
      try {
        await r2.put(key, fs.readFileSync(path.join(dir, f)), contentTypeOf(f))
        clearR2Pending(key, startedAt)
      } catch (err) {
        failed++
        markR2Pending(key, 'put')
        log.warn('media: R2 upload of a restored file failed; the next sync retries it', { key, err })
      }
    }
  }
  return failed ? { ok: true, name, r2Warning: `R2 upload failed for ${failed} file${failed === 1 ? '' : 's'}: the next sync retries` } : { ok: true, name }
}

/**
 * After a content restore (lib/backup): content.db — and with it the
 * trash's rows — comes from the snapshot, but the trash's folders
 * (data/media-trash) are not in snapshots, and the uploads are copied back
 * without removing newer ones. A row whose original is on disk in
 * public/uploads names a file the restored content has live: the live file
 * wins — the row and its address redirect go and its texts come back, as a
 * restore from the trash would do (the restore's R2 mirror then uploads
 * what R2 lacks). A row with neither its folder nor the file is kept: it is
 * a tombstone (its R2 deletes may still be pending; dropping it would let
 * the boot sync pull the deleted image back). Returns the names given back.
 */
export async function reconcileTrashAfterRestore(now = Date.now()): Promise<string[]> {
  let rows: TrashRow[]
  try {
    rows = getDb().prepare('SELECT * FROM media_trash').all() as TrashRow[]
  } catch {
    return []
  }
  const dir = uploadsDir()
  const live = rows.filter((r) => isValidUploadName(r.name) && fs.existsSync(path.join(dir, r.name)))
  if (!live.length) return []
  const db = getDb()
  db.transaction(() => {
    for (const r of live) {
      db.prepare('DELETE FROM media_trash WHERE name = ?').run(r.name)
      db.prepare('DELETE FROM media_redirects WHERE from_name = ?').run(r.name)
    }
  })()
  for (const r of live) await giveMediaMeta(r.name, metaOf(r.meta), now)
  rebuildUsage(true)
  log.warn('media: trash rows the restore left beside live files were dropped (the files are back in the library)', { names: live.map((r) => r.name) })
  return live.map((r) => r.name)
}

/** The file to preview a trashed upload with: a small WebP variant when it had one, else the original. */
export function trashPreviewFile(name: string): string | null {
  if (!isValidUploadName(name)) return null
  const row = trashRow(name)
  if (!row) return null
  const dir = assetTrashDir(name)
  const files = parseList(row.files)
  for (const pick of [`${name}.w480.webp`, `${name}.w320.webp`, `${name}.w640.webp`, name]) {
    if (files.includes(pick) && fs.existsSync(path.join(dir, pick))) return path.join(dir, pick)
  }
  return null
}

/** Every trashed upload, newest first. */
export function trashItems(): TrashItem[] {
  const rows = getDb().prepare('SELECT * FROM media_trash ORDER BY deleted_at DESC, name').all() as TrashRow[]
  return rows.map((r) => ({
    name: r.name,
    bytes: Number(r.bytes) || 0,
    width: r.width,
    height: r.height,
    deletedAt: Number(r.deleted_at),
    purgeAt: Number(r.deleted_at) + TRASH_DAYS * 86_400_000,
    reason: r.reason === 'replaced' ? 'replaced' : 'deleted',
    replacedBy: r.replaced_by,
    files: parseList(r.files).length,
    r2Pending: !!r.r2_pending,
    preview: trashPreviewFile(r.name) ? `/api/admin/media/preview?name=${encodeURIComponent(r.name)}` : null,
    meta: metaOf(r.meta),
  }))
}
