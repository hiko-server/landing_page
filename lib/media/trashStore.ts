import fs from 'fs'
import path from 'path'
import { getDb } from '../db'
import { isValidUploadName } from '../security/uploadName'

/**
 * Where the media library's trash lives and how it is emptied (H7) — the
 * light part of lib/media/trash, with no content or rendering imports, so
 * the nightly purge can be started from instrumentation.ts (which must
 * never reach React or the MDX pipeline). SERVER-ONLY.
 */

/** Days a deleted upload stays restorable. */
export const TRASH_DAYS = 30

export function trashDir(): string {
  return path.join(process.cwd(), 'data', 'media-trash')
}

/** data/media-trash/<name> — `name` is a validated upload name (one flat segment). */
export function assetTrashDir(name: string): string {
  return path.join(trashDir(), name)
}

/** A stored JSON list of names (anything else is an empty list). */
export const parseList = (raw: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * True when the media library's trash has a row for `name` — with or
 * without its folder (after a content restore the row can come back without
 * the files: it still keeps R2 from serving the old upload, so no new file
 * may take the name). A store without the media tables has none.
 */
export function isTrashedName(name: string): boolean {
  try {
    return !!getDb().prepare('SELECT 1 FROM media_trash WHERE name = ?').get(name)
  } catch {
    return false
  }
}

/** Remove a trashed upload for good (its R2 copies were deleted when it was trashed). */
export function purgeFromTrash(name: string): boolean {
  if (!isValidUploadName(name)) return false
  const removed = getDb().prepare('DELETE FROM media_trash WHERE name = ?').run(name).changes > 0
  fs.rmSync(assetTrashDir(name), { recursive: true, force: true })
  return removed
}

/**
 * The nightly purge: every trashed upload older than `days`, and leftover
 * folders no record names (an interrupted delete) of the same age.
 */
export function purgeExpiredTrash(now = Date.now(), days = TRASH_DAYS): string[] {
  const cutoff = now - days * 86_400_000
  const db = getDb()
  const expired = (db.prepare('SELECT name FROM media_trash WHERE deleted_at < ?').all(cutoff) as Array<{ name: string }>).map((r) => r.name)
  for (const name of expired) purgeFromTrash(name)
  const known = new Set((db.prepare('SELECT name FROM media_trash').all() as Array<{ name: string }>).map((r) => r.name))
  let entries: string[] = []
  try {
    entries = fs.readdirSync(trashDir())
  } catch {
    entries = []
  }
  for (const entry of entries) {
    if (known.has(entry) || !isValidUploadName(entry)) continue
    const dir = path.join(trashDir(), entry)
    try {
      if (fs.statSync(dir).mtimeMs < cutoff) {
        fs.rmSync(dir, { recursive: true, force: true })
        expired.push(entry)
      }
    } catch {
      /* gone meanwhile */
    }
  }
  return expired
}
