import fs from 'fs'
import path from 'path'
import { getDb } from '../db'
import { VARIANT_NAME_RE, variantName, type VariantFormat } from '../uploadVariants'

/**
 * What the /uploads/* file server does for a name that is not on disk
 * (H7, SERVER-ONLY) — consulted only on a local miss, so a hit costs nothing:
 *
 *   - a replaced upload (media_redirects): 308 to the file that replaced it;
 *     a variant goes to the new file's variant of the same width and format
 *     when it exists, else to the new original;
 *   - an upload in the media library's trash (media_trash): gone — never
 *     served from R2, even while R2 still holds a copy;
 *   - anything else: null (the usual R2 fallback).
 *
 * Never throws: a store that cannot be read means the usual behaviour.
 */

export type MissPolicy = { redirect: string } | { gone: true } | null

export function uploadMissPolicy(name: string, uploadsDir = path.join(process.cwd(), 'public', 'uploads')): MissPolicy {
  try {
    const m = VARIANT_NAME_RE.exec(name)
    const original = m ? m[1] : name
    const db = getDb()
    const redirect = db.prepare('SELECT to_name FROM media_redirects WHERE from_name = ?').get(original) as { to_name: string } | undefined
    if (redirect) {
      let target = redirect.to_name
      if (m) {
        const v = variantName(target, Number(m[2]), m[3].toLowerCase() as VariantFormat)
        if (fs.existsSync(path.join(uploadsDir, v))) target = v
      }
      return { redirect: `/uploads/${encodeURIComponent(target)}` }
    }
    if (db.prepare('SELECT 1 FROM media_trash WHERE name = ?').get(original)) return { gone: true }
    return null
  } catch {
    return null
  }
}
