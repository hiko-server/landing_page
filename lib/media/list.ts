import { getDb } from '../db'
import { isR2Configured } from '../r2'
import { imageSources } from '../uploadVariants'
import { allUsage, rebuildUsage, scanLocalAssets, syncLocalAssetRows, type AssetRow } from './library'
import { TRASH_DAYS, parseList } from './trashStore'
import { readMediaMeta } from './metaStore'
import { trashItems } from './trash'
import type { MediaFormat, MediaItem, MediaLibraryResponse } from './types'

/**
 * The media library as the admin page and the image picker read it
 * (GET /api/admin/media) — SERVER-ONLY. The usage index is brought up to
 * date and the disk's facts written to media_assets first, so the answer is
 * always current.
 */

const encode = (n: string) => encodeURIComponent(n)

/** Small preview: the 480 / 320 / 640 px WebP variant when there is one, else the original. */
export function thumbOf(name: string, files: readonly string[]): string {
  const set = new Set(files)
  for (const w of [480, 320, 640]) {
    const v = `${name}.w${w}.webp`
    if (set.has(v)) return `/uploads/${encode(v)}`
  }
  return `/uploads/${encode(name)}`
}

export function listLibrary(now = Date.now()): MediaLibraryResponse {
  const db = getDb()
  rebuildUsage(false, now)
  const local = scanLocalAssets()
  syncLocalAssetRows(local, now)
  const rows = db.prepare('SELECT * FROM media_assets').all() as AssetRow[]
  const usage = allUsage()
  const meta = readMediaMeta().doc.items
  const trashed = new Set((db.prepare('SELECT name FROM media_trash').all() as Array<{ name: string }>).map((r) => r.name))
  const replaces = new Map<string, string[]>()
  for (const r of db.prepare('SELECT from_name, to_name FROM media_redirects ORDER BY created_at').all() as Array<{ from_name: string; to_name: string }>) {
    const list = replaces.get(r.to_name)
    if (list) list.push(r.from_name)
    else replaces.set(r.to_name, [r.from_name])
  }
  const state = db.prepare('SELECT r2_checked_at FROM media_index_state WHERE id = 1').get() as { r2_checked_at: number | null } | undefined
  const r2Configured = isR2Configured()

  const items: MediaItem[] = []
  for (const row of rows) {
    if (trashed.has(row.name)) continue
    const a = local.get(row.name)
    const r2Files = parseList(row.r2_files)
    const r2Known = r2Configured && row.r2 !== null
    const url = `/uploads/${encode(row.name)}`
    const r2Set = new Set(r2Files)
    const item: MediaItem = {
      name: row.name,
      url,
      bytes: a ? a.bytes : Number(row.bytes) || 0,
      width: a ? a.width : row.width,
      height: a ? a.height : row.height,
      format: (a ? a.format : (row.format as MediaFormat | null)) ?? null,
      animated: a ? a.animated : !!row.animated,
      addedAt: a ? a.mtimeMs : Number(row.added_at) || 0,
      local: !!a,
      r2: r2Known ? row.r2 === 1 : null,
      r2Missing: r2Known && a ? [row.name, ...a.variantFiles].filter((f) => !r2Set.has(f)).length : null,
      variants: a
        ? { eligible: a.eligible, present: a.variants, missing: a.missing, placeholder: a.placeholder, bytes: a.variants.reduce((n, v) => n + v.bytes, 0) }
        : { eligible: false, present: [], missing: [], placeholder: false, bytes: 0 },
      thumb: thumbOf(row.name, a ? a.variantFiles : r2Files),
      usage: usage.get(row.name) || [],
      meta: meta[row.name] ?? null,
      replaces: replaces.get(row.name) || [],
    }
    if (a) {
      // Exactly what the pages serve for it (lib/uploadVariants).
      const src = imageSources(url)
      if (src.placeholder) item.placeholder = src.placeholder
      if (src.srcSet) item.srcSet = src.srcSet
      if (src.avifSrcSet) item.avifSrcSet = src.avifSrcSet
    }
    items.push(item)
  }
  items.sort((x, y) => y.addedAt - x.addedAt || x.name.localeCompare(y.name))
  return {
    generatedAt: now,
    items,
    trash: trashItems(),
    trashDays: TRASH_DAYS,
    r2: { configured: r2Configured, checkedAt: r2Configured ? (state?.r2_checked_at ?? null) : null },
  }
}

export type LibrarySummary = { total: number; missingAlt: number; unused: number; trash: number }

/** Counts for the admin overview card (uploads on this server). */
export function librarySummary(): LibrarySummary {
  rebuildUsage(false)
  const local = scanLocalAssets()
  const meta = readMediaMeta().doc.items
  const db = getDb()
  const used = new Set((db.prepare('SELECT DISTINCT name FROM media_usage').all() as Array<{ name: string }>).map((r) => r.name))
  let missingAlt = 0
  let unused = 0
  for (const name of local.keys()) {
    const m = meta[name]
    if (!m?.alt && !m?.altZh) missingAlt++
    if (!used.has(name)) unused++
  }
  const trash = (db.prepare('SELECT COUNT(*) AS n FROM media_trash').get() as { n: number }).n
  return { total: local.size, missingAlt, unused, trash: Number(trash) || 0 }
}
