/**
 * Single source of truth for upload filenames.
 *
 * The upload endpoint (pages/api/admin/upload-image.ts) only ever produces
 * names that match UPLOAD_NAME_RE, the runtime file server
 * (pages/api/uploads/[...path].ts) only serves names that match it, and the
 * snapshot tarball (lib/backup.ts) includes every non-dot file in
 * public/uploads — so a name that passes this check is stored, served and
 * backed up alike.
 *
 * Rules: one flat path segment of [A-Za-z0-9._-], never starting with a dot
 * (dotfiles are hidden and skipped by backups), never containing "..", at
 * most 255 characters (filesystem limit). New uploads are capped tighter
 * (UPLOAD_NAME_MAX_NEW) so a collision suffix always fits.
 */

export const UPLOAD_NAME_RE = /^(?!.*\.\.)[A-Za-z0-9_-][A-Za-z0-9._-]{0,254}$/

/** Longest name the sanitiser emits, including extension and hash suffix. */
export const UPLOAD_NAME_MAX_NEW = 128

const HASH_SUFFIX_LEN = 11 // "-" + 10 hex chars

export function isValidUploadName(name: unknown): name is string {
  return typeof name === 'string' && UPLOAD_NAME_RE.test(name)
}

/**
 * Turn a client-supplied filename into a safe upload name with the given
 * canonical extension (".png", ".jpg", …). Path components and the client's
 * own extension are discarded; anything outside the allowed charset becomes
 * "_"; dot runs collapse; leading/trailing dots go. Falls back to "image".
 */
export function sanitizeUploadName(raw: unknown, ext: string): string {
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) throw new Error(`invalid upload extension: ${ext}`)
  const base = String(raw ?? '').split(/[\\/]/).pop() || ''
  let stem = base.replace(/\.[^.]*$/, '')
  stem = stem
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/_{2,}/g, '_')
    .replace(/^\.+|\.+$/g, '')
  const maxStem = UPLOAD_NAME_MAX_NEW - ext.length - HASH_SUFFIX_LEN
  stem = stem.slice(0, maxStem).replace(/\.+$/, '')
  if (!stem) stem = 'image'
  const name = stem + ext
  if (!UPLOAD_NAME_RE.test(name)) throw new Error('sanitised upload name failed validation')
  return name
}

/** "photo.png" + "a1b2c3d4e5f6…" → "photo-a1b2c3d4e5.png" (used on name collisions). */
export function withHashSuffix(name: string, hexHash: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  const hash = hexHash.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, HASH_SUFFIX_LEN - 1)
  const out = `${stem}-${hash}${ext}`
  if (!UPLOAD_NAME_RE.test(out)) throw new Error('suffixed upload name failed validation')
  return out
}
