import fs from 'fs'
import path from 'path'
import { getDb } from '../db'
import { getPage, listItems } from '../contentStore'
import { listPendingRevisions } from '../pendingRevisions'
import { readHome } from '../home'
import { readCvData } from '../cvdata'
import { PAGE_NAMES } from '../mdx-admin'
import { scanBody } from '../contentHealth/mdxScan'
import { imageInfo } from '../contentHealth/images'
import { isValidUploadName } from '../security/uploadName'
import { PLACEHOLDER_WIDTH, VARIANT_NAME_RE, expectedVariantNames, variantOriginalName } from '../uploadVariants'
import { MEDIA_META_KEY } from './meta'
import { scanUsage, usageByName, type UsageSources } from './usage'
import type { MediaFormat, MediaUsage, MediaVariant, UsageAlt } from './types'

/**
 * The media library's indexes (H7) — SERVER-ONLY.
 *
 *   - Files: every original in public/uploads (variants grouped under it:
 *     lib/uploadVariants), with the facts the content health center reads
 *     (lib/contentHealth/images imageInfo: size, pixels, format, animation,
 *     whether it can have responsive versions) and which of the expected
 *     variants (expectedVariantNames — WebP and AVIF per width and the blur
 *     placeholder) exist. Refreshed from the disk on every listing into
 *     media_assets, which also keeps what the last R2 listing found
 *     (lib/media/r2sync) — an upload only R2 holds is listed too.
 *   - Usage: the usage index (media_usage, lib/media/usage) is rebuilt
 *     whenever the stored content changed since it was built — the
 *     fingerprint below covers every row of posts, case studies, pending
 *     changes, pages and stored documents, so every save, restore, rename,
 *     import or boot sync counts, whichever path wrote it. Deletes and
 *     replaces re-scan first (`usageOf(name, { fresh: true })`).
 *
 * The listing the admin page reads is lib/media/list; the default texts are
 * lib/media/metaStore; the trash lib/media/trash.
 */

/** Bump when the scanning rules change, so stored indexes are rebuilt (2: alt states of home photos and logos; a logo's measurement is not a place). */
const USAGE_RULES_VERSION = 2

export function uploadsDir(): string {
  return path.join(process.cwd(), 'public', 'uploads')
}

// ── Files ─────────────────────────────────────────────────────────────────

export type LocalAsset = {
  name: string
  bytes: number
  mtimeMs: number
  width: number | null
  height: number | null
  format: MediaFormat | null
  animated: boolean
  eligible: boolean
  variants: MediaVariant[]
  placeholder: boolean
  /** Variant files (names), placeholder included. */
  variantFiles: string[]
  missing: string[]
}

function variantOf(name: string): { width: number; format: 'webp' | 'avif' } | null {
  const m = VARIANT_NAME_RE.exec(name)
  return m ? { width: Number(m[2]), format: m[3].toLowerCase() as 'webp' | 'avif' } : null
}

function statSize(file: string): { size: number; mtimeMs: number } | null {
  try {
    const st = fs.statSync(file)
    return st.isFile() ? { size: st.size, mtimeMs: st.mtimeMs } : null
  } catch {
    return null
  }
}

/** Every original upload on disk with its variants (one directory listing). */
export function scanLocalAssets(dir = uploadsDir()): Map<string, LocalAsset> {
  let entries: string[] = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return new Map()
  }
  const originals: string[] = []
  const variantsOf = new Map<string, string[]>()
  for (const name of entries) {
    if (name.startsWith('.') || !isValidUploadName(name)) continue
    const orig = variantOriginalName(name)
    if (orig) {
      const list = variantsOf.get(orig)
      if (list) list.push(name)
      else variantsOf.set(orig, [name])
    } else originals.push(name)
  }
  const out = new Map<string, LocalAsset>()
  for (const name of originals) {
    const file = path.join(dir, name)
    const st = statSize(file)
    if (!st) continue
    const info = imageInfo(`/uploads/${name}`, { publicDir: path.dirname(dir) })
    const files = (variantsOf.get(name) || []).sort()
    const variants: MediaVariant[] = []
    let placeholder = false
    for (const v of files) {
      const meta = variantOf(v)
      if (!meta) continue
      if (meta.width === PLACEHOLDER_WIDTH && meta.format === 'webp') {
        placeholder = true
        continue
      }
      variants.push({ name: v, width: meta.width, format: meta.format, bytes: statSize(path.join(dir, v))?.size ?? 0 })
    }
    variants.sort((a, b) => a.width - b.width || a.format.localeCompare(b.format))
    const have = new Set(files)
    const expected = info.variantEligible && info.width ? expectedVariantNames(name, info.width) : []
    out.set(name, {
      name,
      bytes: st.size,
      mtimeMs: Math.trunc(st.mtimeMs),
      width: info.width,
      height: info.height,
      format: (info.format as MediaFormat | null) ?? null,
      animated: !!info.animated,
      eligible: !!info.variantEligible,
      variants,
      placeholder,
      variantFiles: files,
      missing: expected.filter((v) => !have.has(v)),
    })
  }
  return out
}

// ── Usage index ───────────────────────────────────────────────────────────

/**
 * A fingerprint of every stored row the usage index is built from: count,
 * newest and sum of the update times per table (any write, delete or
 * timestamp re-stamp changes one of them). The library's own row is left out.
 */
export function contentFingerprint(): string {
  const db = getDb()
  const stats = (sql: string) => {
    const r = db.prepare(sql).get() as { n: number; mx: number; sm: number }
    return `${r.n}:${r.mx}:${r.sm}`
  }
  const agg = 'COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS mx, COALESCE(SUM(updated_at), 0) AS sm'
  return [
    `v${USAGE_RULES_VERSION}`,
    stats(`SELECT ${agg} FROM collection_items`),
    stats(`SELECT ${agg} FROM pages`),
    stats(`SELECT ${agg} FROM pending_revisions`),
    stats(`SELECT ${agg} FROM kv WHERE key <> '${MEDIA_META_KEY}' AND key NOT LIKE 'tombstones:%'`),
  ].join('|')
}

/** Every stored document the usage index reads. */
export function usageSources(): UsageSources {
  const items = (['blog', 'work'] as const).flatMap((collection) =>
    listItems(collection).map((i) => ({ collection, slug: i.slug, frontmatter: (i.frontmatter || {}) as Record<string, unknown>, body: i.body || '' })),
  )
  const pending = (['blog', 'work'] as const).flatMap((collection) =>
    listPendingRevisions(collection).map((p) => ({ collection, slug: p.slug, frontmatter: p.frontmatter || {}, body: p.body || '' })),
  )
  const pages = PAGE_NAMES.map((name) => ({ name, page: getPage(name) }))
    .filter((p) => p.page)
    .map((p) => ({ name: p.name, frontmatter: (p.page?.frontmatter || {}) as Record<string, unknown>, body: p.page?.body || '' }))
  const rows = getDb()
    .prepare(`SELECT key, value FROM kv WHERE key NOT IN ('home', 'cvdata', '${MEDIA_META_KEY}') AND key NOT LIKE 'tombstones:%'`)
    .all() as Array<{ key: string; value: string }>
  const other: UsageSources['other'] = []
  for (const r of rows) {
    try {
      other.push({ key: r.key, value: JSON.parse(r.value) })
    } catch {
      // A row that does not parse refers to nothing the site can render.
    }
  }
  const home = readHome() as unknown as Record<string, unknown> | null
  return { items, pending, pages, home, cv: readCvData(), other }
}

type UsageRow = {
  name: string
  doc: string
  field: string
  label: string
  line: number | null
  alt: string | null
  count: number
  doc_kind: string
  doc_title: string
  doc_state: string | null
  edit_href: string | null
  public_href: string | null
}

const USAGE_ALTS = new Set(['ok', 'missing', 'meaningless', 'decorative'])
const DOC_STATES = new Set(['live', 'draft', 'pending', 'private'])

function fromUsageRow(r: UsageRow): MediaUsage {
  return {
    name: r.name,
    doc: r.doc,
    field: r.field,
    label: r.label,
    line: r.line === null ? null : Number(r.line),
    alt: r.alt && USAGE_ALTS.has(r.alt) ? (r.alt as UsageAlt) : null,
    count: Number(r.count) || 1,
    docKind: r.doc_kind as MediaUsage['docKind'],
    docTitle: r.doc_title,
    docState: r.doc_state && DOC_STATES.has(r.doc_state) ? (r.doc_state as MediaUsage['docState']) : null,
    editHref: r.edit_href,
    publicHref: r.public_href,
  }
}

/**
 * Bring the usage index up to date: rebuilt when the content changed since
 * it was built (or always, with `force`). Returns true when it was rebuilt.
 */
export function rebuildUsage(force = false, now = Date.now()): boolean {
  const db = getDb()
  // Read before the scan: a write that lands during it changes the fingerprint again.
  const fp = contentFingerprint()
  const state = db.prepare('SELECT fingerprint FROM media_index_state WHERE id = 1').get() as { fingerprint: string } | undefined
  if (!force && state?.fingerprint === fp) return false
  const usage = scanUsage(usageSources(), { scanBody })
  const insert = db.prepare(
    `INSERT INTO media_usage (name, doc, field, label, line, alt, count, doc_kind, doc_title, doc_state, edit_href, public_href)
     VALUES (@name, @doc, @field, @label, @line, @alt, @count, @docKind, @docTitle, @docState, @editHref, @publicHref)`,
  )
  db.transaction(() => {
    db.prepare('DELETE FROM media_usage').run()
    for (const u of usage) insert.run({ ...u, line: u.line ?? null, alt: u.alt ?? null })
    db.prepare(
      `INSERT INTO media_index_state (id, fingerprint, built_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET fingerprint = excluded.fingerprint, built_at = excluded.built_at`,
    ).run(fp, now)
  })()
  return true
}

/** Where the content refers to `name` right now (the index is refreshed first when stale). */
export function usageOf(name: string, opts: { fresh?: boolean } = {}): MediaUsage[] {
  rebuildUsage(!!opts.fresh)
  const rows = getDb().prepare('SELECT * FROM media_usage WHERE name = ? ORDER BY doc, field').all(name) as UsageRow[]
  return rows.map(fromUsageRow)
}

/** The whole usage index by upload name (call rebuildUsage first). */
export function allUsage(): Map<string, MediaUsage[]> {
  const rows = getDb().prepare('SELECT * FROM media_usage ORDER BY doc, field').all() as UsageRow[]
  return usageByName(rows.map(fromUsageRow))
}

// ── The asset index (local + R2) ──────────────────────────────────────────

export type AssetRow = {
  name: string
  bytes: number
  width: number | null
  height: number | null
  format: string | null
  animated: number
  local: number
  r2: number | null
  r2_files: string
  added_at: number
  checked_at: number
}


/** Write the disk's facts into media_assets (rows R2 alone still holds stay, as not local). */
export function syncLocalAssetRows(local: Map<string, LocalAsset>, now = Date.now()): void {
  const db = getDb()
  const upsert = db.prepare(
    `INSERT INTO media_assets (name, bytes, width, height, format, animated, local, added_at, checked_at)
     VALUES (@name, @bytes, @width, @height, @format, @animated, 1, @addedAt, @now)
     ON CONFLICT(name) DO UPDATE SET bytes = excluded.bytes, width = excluded.width, height = excluded.height,
       format = excluded.format, animated = excluded.animated, local = 1, added_at = excluded.added_at, checked_at = excluded.checked_at`,
  )
  const rows = db.prepare('SELECT name, local, r2 FROM media_assets').all() as Array<{ name: string; local: number; r2: number | null }>
  db.transaction(() => {
    for (const a of local.values()) {
      upsert.run({ name: a.name, bytes: a.bytes, width: a.width, height: a.height, format: a.format, animated: a.animated ? 1 : 0, addedAt: a.mtimeMs, now })
    }
    for (const r of rows) {
      if (local.has(r.name)) continue
      if (r.r2 === 1) {
        if (r.local) db.prepare('UPDATE media_assets SET local = 0, checked_at = ? WHERE name = ?').run(now, r.name)
      } else db.prepare('DELETE FROM media_assets WHERE name = ?').run(r.name)
    }
  })()
}

/** Is `name` an upload of the library: on this server, or only in R2 (last listing)? */
export function assetExists(name: string): boolean {
  if (!isValidUploadName(name)) return false
  if (fs.existsSync(path.join(uploadsDir(), name))) return true
  return !!getDb().prepare('SELECT 1 FROM media_assets WHERE name = ?').get(name)
}

/** Is `name` in the trash (or replaced)? */
export function isTrashed(name: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM media_trash WHERE name = ?').get(name)
}

