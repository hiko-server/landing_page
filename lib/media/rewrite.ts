import { variantName, type VariantFormat } from '../uploadVariants'

/**
 * Rewriting references to a replaced upload (H7) — pure and unit-tested.
 *
 * When `/uploads/old.jpg` is replaced by `/uploads/new.png`, every reference
 * the usage index counts (lib/media/usage: anywhere in a text, code
 * included) moves to the new file:
 *
 *   /uploads/old.jpg               → /uploads/new.png
 *   /uploads/old.jpg.w640.webp     → /uploads/new.png.w640.webp when the new
 *                                    file has that variant, else the original
 *   https://<host>/uploads/old.jpg → https://<host>/uploads/new.png
 *
 * A name matches only whole: `/uploads/old.jpg` never matches inside
 * `/uploads/old.jpg-w640.webp` or `/uploads/old.jpg.bak`.
 */

export type RewriteResult<T> = { value: T; count: number }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `exists(name)` — does the new upload have this variant file? */
export type VariantExists = (name: string) => boolean

function pattern(from: string): RegExp {
  // The old name, optionally followed by a variant suffix, then nothing that could continue a name.
  return new RegExp(`/uploads/${escapeRe(from)}(\\.w(\\d+)\\.(webp|avif))?(?![A-Za-z0-9._%-])`, 'g')
}

/** Replace references to upload `from` with `to` in one string. */
export function rewriteUploadText(text: string, from: string, to: string, exists: VariantExists = () => false): RewriteResult<string> {
  if (!text || !text.includes(`/uploads/${from}`)) return { value: text, count: 0 }
  let count = 0
  const value = text.replace(pattern(from), (_m, suffix: string | undefined, w: string | undefined, fmt: string | undefined) => {
    count++
    if (!suffix || !w || !fmt) return `/uploads/${to}`
    const v = variantName(to, Number(w), fmt.toLowerCase() as VariantFormat)
    return `/uploads/${exists(v) ? v : to}`
  })
  return { value: count ? value : text, count }
}

/** Deep rewrite of a JSON-like value (frontmatter, the home document, the CV). */
export function rewriteUploadJson<T>(value: T, from: string, to: string, exists: VariantExists = () => false): RewriteResult<T> {
  let count = 0
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = rewriteUploadText(v, from, to, exists)
      count += r.count
      return r.value
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = walk(x)
      return out
    }
    return v
  }
  const next = walk(value) as T
  return { value: count ? next : value, count }
}

/** Frontmatter and body of one MDX document rewritten together. */
export function rewriteUploadDocument(
  doc: { frontmatter: Record<string, unknown>; body: string },
  from: string,
  to: string,
  exists: VariantExists = () => false,
): RewriteResult<{ frontmatter: Record<string, unknown>; body: string }> {
  const fm = rewriteUploadJson(doc.frontmatter || {}, from, to, exists)
  const body = rewriteUploadText(doc.body || '', from, to, exists)
  const count = fm.count + body.count
  return { value: count ? { frontmatter: fm.value, body: body.value } : doc, count }
}
