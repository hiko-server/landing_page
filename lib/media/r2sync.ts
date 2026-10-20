import fs from 'fs'
import path from 'path'
import { getDb } from '../db'
import { log } from '../log'
import { clearR2Pending, uploadR2Key } from '../contentStore'
import { isR2Configured, r2GetBuffer, r2GetRange, r2ListDetailed, r2PutBuffer, type R2ObjectMeta } from '../r2'
import { imageSizeFromBytes } from '../rehype/imageSize'
import { isValidUploadName } from '../security/uploadName'
import { variantOriginalName } from '../uploadVariants'
import { sniffImageType } from '../imageVariants'
import { scanLocalAssets, syncLocalAssetRows, uploadsDir } from './library'
import { parseList } from './trashStore'
import { contentTypeOf, localFilesOf } from './trash'

/**
 * The media library's R2 index (H7) — SERVER-ONLY. Uploads are mirrored to
 * R2 when they are stored; this checks that and repairs it:
 *
 *   scanR2()      lists uploads/ in R2 and records, per original, which of
 *                 its files R2 holds (media_assets.r2 / r2_files); an
 *                 original only R2 holds is listed in the library too (its
 *                 pixel size read from the first 64 KB of the object).
 *   mirrorToR2()  uploads the files of an upload that R2 is missing.
 *   pullFromR2()  downloads an upload only R2 holds (original and variants)
 *                 to this server — what the boot sync would do at the next
 *                 start (never over an existing file).
 *
 * Trashed uploads are left out everywhere. Every R2 call is bounded by
 * lib/r2's timeouts and retries.
 */

export type R2IndexOps = {
  configured: () => boolean
  listDetailed: (prefix: string) => Promise<R2ObjectMeta[]>
  getRange: (key: string, bytes: number) => Promise<Buffer | null>
  getBuffer: (key: string) => Promise<Buffer | null>
  put: (key: string, body: Buffer, contentType: string) => Promise<void>
}

export const defaultR2IndexOps: R2IndexOps = {
  configured: isR2Configured,
  listDetailed: r2ListDetailed,
  getRange: r2GetRange,
  getBuffer: r2GetBuffer,
  put: r2PutBuffer,
}

/** Header reads per scan for R2-only originals (their pixel size). */
const MAX_HEADER_READS = 40
const HEADER_BYTES = 64 * 1024

export type R2ScanResult = { ok: true; objects: number; originals: number; onlyInR2: number; notMirrored: number } | { ok: false; error: string }

type Group = { files: string[]; original: R2ObjectMeta | null }

/** R2 objects under uploads/, grouped by the original they belong to. */
export function groupR2Uploads(objects: readonly R2ObjectMeta[]): Map<string, Group> {
  const out = new Map<string, Group>()
  for (const obj of objects) {
    if (!obj.key.startsWith('uploads/')) continue
    const base = obj.key.slice('uploads/'.length)
    if (!isValidUploadName(base) || base.startsWith('.')) continue
    const orig = variantOriginalName(base) ?? base
    const g = out.get(orig) ?? { files: [], original: null }
    g.files.push(base)
    if (orig === base) g.original = obj
    out.set(orig, g)
  }
  for (const g of out.values()) g.files.sort()
  return out
}

export async function scanR2(ops: R2IndexOps = defaultR2IndexOps, now = Date.now()): Promise<R2ScanResult> {
  if (!ops.configured()) return { ok: false, error: 'R2 is not configured' }
  let objects: R2ObjectMeta[]
  try {
    objects = await ops.listDetailed('uploads/')
  } catch (err) {
    log.warn('media: R2 listing failed', { err })
    return { ok: false, error: `R2 could not be listed: ${err instanceof Error ? err.message : String(err)}` }
  }
  const groups = groupR2Uploads(objects)
  const db = getDb()
  const local = scanLocalAssets()
  syncLocalAssetRows(local, now)
  const trashed = new Set((db.prepare('SELECT name FROM media_trash').all() as Array<{ name: string }>).map((r) => r.name))
  const rows = db.prepare('SELECT name, local, width FROM media_assets').all() as Array<{ name: string; local: number; width: number | null }>
  let notMirrored = 0
  db.transaction(() => {
    const setR2 = db.prepare('UPDATE media_assets SET r2 = ?, r2_files = ?, checked_at = ? WHERE name = ?')
    for (const r of rows) {
      const g = groups.get(r.name)
      if (r.local) {
        setR2.run(g?.original ? 1 : 0, JSON.stringify(g?.files ?? []), now, r.name)
        const own = local.get(r.name)
        const have = new Set(g?.files ?? [])
        if (own && [r.name, ...own.variantFiles].some((f) => !have.has(f))) notMirrored++
      } else if (!g?.original || trashed.has(r.name)) {
        db.prepare('DELETE FROM media_assets WHERE name = ?').run(r.name)
      }
    }
    const upsertRemote = db.prepare(
      `INSERT INTO media_assets (name, bytes, local, r2, r2_files, added_at, checked_at) VALUES (?, ?, 0, 1, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET bytes = excluded.bytes, r2 = 1, r2_files = excluded.r2_files, added_at = excluded.added_at, checked_at = excluded.checked_at
       WHERE media_assets.local = 0`,
    )
    for (const [name, g] of groups) {
      if (!g.original || local.has(name) || trashed.has(name)) continue
      const at = g.original.lastModified ? Date.parse(g.original.lastModified) : now
      upsertRemote.run(name, g.original.size, JSON.stringify(g.files), Number.isFinite(at) ? at : now, now)
    }
    db.prepare(
      `INSERT INTO media_index_state (id, fingerprint, built_at, r2_checked_at) VALUES (1, '', 0, ?)
       ON CONFLICT(id) DO UPDATE SET r2_checked_at = excluded.r2_checked_at`,
    ).run(now)
  })()

  // Pixel sizes of the uploads only R2 holds (a header read each, a few per scan).
  const unknown = (db.prepare('SELECT name FROM media_assets WHERE local = 0 AND width IS NULL ORDER BY added_at DESC LIMIT ?').all(MAX_HEADER_READS) as Array<{ name: string }>).map(
    (r) => r.name,
  )
  for (const name of unknown) {
    try {
      const head = await ops.getRange(uploadR2Key(name), HEADER_BYTES)
      const size = head ? imageSizeFromBytes(head) : null
      if (size) db.prepare('UPDATE media_assets SET width = ?, height = ? WHERE name = ?').run(size.width, size.height, name)
    } catch (err) {
      log.warn('media: could not read an R2 image header', { name, err })
    }
  }
  const onlyInR2 = Array.from(groups.entries()).filter(([n, g]) => g.original && !local.has(n) && !trashed.has(n)).length
  return { ok: true, objects: objects.length, originals: groups.size, onlyInR2, notMirrored }
}

export type BatchResult = { done: string[]; failed: Array<{ name: string; error: string }> }

/** Upload the files of local uploads that R2 is missing (as of the last scan). */
export async function mirrorToR2(names: readonly string[], ops: R2IndexOps = defaultR2IndexOps): Promise<BatchResult> {
  const out: BatchResult = { done: [], failed: [] }
  if (!ops.configured()) return { done: [], failed: names.map((name) => ({ name, error: 'R2 is not configured' })) }
  const db = getDb()
  const dir = uploadsDir()
  for (const name of names) {
    if (!isValidUploadName(name) || !fs.existsSync(path.join(dir, name))) {
      out.failed.push({ name, error: 'Not on this server' })
      continue
    }
    const row = db.prepare('SELECT r2_files FROM media_assets WHERE name = ?').get(name) as { r2_files: string } | undefined
    const have = new Set(parseList(row?.r2_files))
    const files = localFilesOf(name, dir)
    let error = ''
    for (const f of files) {
      if (have.has(f)) continue
      const key = uploadR2Key(f)
      const startedAt = Date.now()
      try {
        await ops.put(key, fs.readFileSync(path.join(dir, f)), contentTypeOf(f))
        clearR2Pending(key, startedAt)
        have.add(f)
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
        break
      }
    }
    db.prepare('UPDATE media_assets SET r2 = ?, r2_files = ? WHERE name = ?').run(have.has(name) ? 1 : 0, JSON.stringify(Array.from(have).sort()), name)
    if (error) out.failed.push({ name, error: `R2 upload failed: ${error}` })
    else out.done.push(name)
  }
  return out
}

const RASTER_EXT = /\.(png|jpe?g|webp|gif)$/i

/** Download uploads only R2 holds to this server (never over an existing file). */
export async function pullFromR2(names: readonly string[], ops: R2IndexOps = defaultR2IndexOps): Promise<BatchResult> {
  const out: BatchResult = { done: [], failed: [] }
  if (!ops.configured()) return { done: [], failed: names.map((name) => ({ name, error: 'R2 is not configured' })) }
  const db = getDb()
  const dir = uploadsDir()
  fs.mkdirSync(dir, { recursive: true })
  for (const name of names) {
    const row = isValidUploadName(name)
      ? (db.prepare('SELECT r2_files FROM media_assets WHERE name = ? AND local = 0 AND r2 = 1').get(name) as { r2_files: string } | undefined)
      : undefined
    const trashed = !!db.prepare('SELECT 1 FROM media_trash WHERE name = ?').get(name)
    if (!row || trashed) {
      out.failed.push({ name, error: 'Not an upload only R2 holds' })
      continue
    }
    const files = parseList(row.r2_files).filter((f) => f === name || variantOriginalName(f) === name)
    const ordered = [name, ...files.filter((f) => f !== name)]
    let error = ''
    for (const f of ordered) {
      const dest = path.join(dir, f)
      if (fs.existsSync(dest)) continue
      try {
        const buf = await ops.getBuffer(uploadR2Key(f))
        if (!buf) {
          if (f === name) error = 'R2 no longer has it'
          continue
        }
        // The original must really be the image its name says (as the upload route checks).
        if (f === name && RASTER_EXT.test(f) && !sniffImageType(buf)) {
          error = 'R2 holds something that is not an image under this name'
          break
        }
        fs.writeFileSync(dest, buf as unknown as Uint8Array, { flag: 'wx' })
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
        if (f === name) break
      }
    }
    if (error) out.failed.push({ name, error })
    else out.done.push(name)
  }
  syncLocalAssetRows(scanLocalAssets())
  return out
}
