import fs from 'fs'
import path from 'path'
import { getDb } from '../db'
import { isValidUploadName } from '../security/uploadName'
import { isVariantName } from '../uploadVariants'
import { storeUpload, type ImageMime, type StoredUpload } from '../imageVariants'
import { isTrashed, rebuildUsage, uploadsDir } from './library'
import { readMediaMeta, giveMediaMeta } from './metaStore'
import { rewriteUploadDocument, rewriteUploadJson, type VariantExists } from './rewrite'
import { moveToTrash, type R2Ops } from './trash'
import { rewriteDocuments, type RewrittenDoc } from './docRewrite'

export type { RewrittenDoc }

/**
 * Replacing an upload's file (H7) — SERVER-ONLY.
 *
 * Uploads are served `immutable` for a year (pages/api/uploads), so new
 * bytes under the old name would keep showing the old picture in every
 * browser and at the edge that already has it — the owner's own included.
 * A replacement therefore gets a new file name, and everything else follows:
 *
 *   1. the new file goes through the upload pipeline (lib/imageVariants
 *      storeUpload: checked, metadata stripped, WebP / AVIF variants, the
 *      blur placeholder, mirrored to R2);
 *   2. every reference to the old file moves to the new one — posts and
 *      case studies (live versions and unpublished changes), /now, /uses,
 *      the /about bio, the home page and the CV, each snapshotted first like
 *      any save (lib/media/rewrite and lib/media/docRewrite; a variant
 *      reference moves to the same width);
 *   3. the default alt texts and captions go with it;
 *   4. the old address keeps working: 308 to the new file (media_redirects,
 *      collapsed so it never chains), and the old file waits in the trash
 *      for 30 days (restoring it brings its own address back);
 *   5. the pages that show it are regenerated (the caller revalidates
 *      `paths`).
 */

export type ReplaceRequest = {
  /** The upload being replaced (an original's name). */
  name: string
  raw: Buffer
  mime: ImageMime
  /** The new file's name as the browser sent it (sanitised by storeUpload). */
  filename: string
}

export type ReplaceOutcome =
  | {
      ok: true
      from: string
      upload: StoredUpload
      rewrites: RewrittenDoc[]
      /** Public pages to regenerate. */
      paths: string[]
      warnings: string[]
    }
  | { ok: false; status: 400 | 404 | 409; code: 'INVALID' | 'NOT_FOUND' | 'TRASHED'; error: string }

/** Point `from`'s address at `to` (and every address that pointed at `from`), never in a chain. */
export function recordRedirect(from: string, to: string, now = Date.now()): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('UPDATE media_redirects SET to_name = ? WHERE to_name = ?').run(to, from)
    db.prepare('DELETE FROM media_redirects WHERE from_name = to_name').run()
    db.prepare('DELETE FROM media_redirects WHERE from_name = ?').run(to)
    db.prepare(
      `INSERT INTO media_redirects (from_name, to_name, created_at) VALUES (?, ?, ?)
       ON CONFLICT(from_name) DO UPDATE SET to_name = excluded.to_name, created_at = excluded.created_at`,
    ).run(from, to, now)
  })()
}

export type ReplaceOptions = {
  now?: number
  r2?: R2Ops
  purge?: (paths: string[]) => Promise<unknown>
  /** Test seam: the upload pipeline (default lib/imageVariants storeUpload). */
  store?: typeof storeUpload
}

/**
 * Replace upload `req.name` with new bytes (see the module comment). Throws
 * what storeUpload throws for a refused image (ImageRejectedError,
 * ImageQueueFullError) — nothing has changed then.
 */
export async function replaceUpload(req: ReplaceRequest, opts: ReplaceOptions = {}): Promise<ReplaceOutcome> {
  const { name } = req
  if (!isValidUploadName(name) || isVariantName(name)) return { ok: false, status: 400, code: 'INVALID', error: 'Not an upload name' }
  if (isTrashed(name)) return { ok: false, status: 409, code: 'TRASHED', error: 'This upload is in the trash' }
  const dir = uploadsDir()
  if (!fs.existsSync(path.join(dir, name))) return { ok: false, status: 404, code: 'NOT_FOUND', error: 'This upload is not on the server' }

  const store = opts.store ?? storeUpload
  const upload = await store(req.raw, req.mime, req.filename)
  const to = upload.name
  const warnings: string[] = []
  if (upload.r2Warning) warnings.push(upload.r2Warning)

  const exists: VariantExists = (v) => fs.existsSync(path.join(dir, v))
  const run = await rewriteDocuments((doc) => rewriteUploadDocument(doc, name, to, exists), {
    cv: (value) => rewriteUploadJson(value, name, to, exists),
    home: (value) => rewriteUploadJson(value, name, to, exists),
  })
  warnings.push(...run.warnings)

  // The texts follow the picture; the old file keeps a copy in the trash.
  const meta = readMediaMeta().doc.items[name]
  if (meta) await giveMediaMeta(to, { alt: meta.alt, altZh: meta.altZh, caption: meta.caption, captionZh: meta.captionZh }, opts.now)
  recordRedirect(name, to, opts.now)
  const trashed = await moveToTrash(name, { reason: 'replaced', replacedBy: to, now: opts.now, r2: opts.r2, purge: opts.purge })
  if (!trashed.ok) warnings.push(`the old file stays in the library: ${trashed.error}`)
  else if (trashed.r2Warning) warnings.push(trashed.r2Warning)
  rebuildUsage(true)

  return { ok: true, from: name, upload, rewrites: run.rewrites, paths: run.paths, warnings }
}
