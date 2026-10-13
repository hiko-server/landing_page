import fs from 'fs'
import path from 'path'
import { UPLOAD_NAME_RE } from './security/uploadName'
import { localImageSize } from './rehype/imageSize'

/**
 * Responsive variants of uploaded images (the Next image optimizer is
 * disabled, so resizing happens once, at upload time — lib/imageVariants.ts).
 *
 * For an upload `/uploads/photo.jpg` that is wider than a variant width, a
 * WebP copy `/uploads/photo.jpg.w640.webp` (…w1280, …w1920) is stored next
 * to it. The original's full name (extension included) is part of the
 * variant name, so `photo.jpg` and `photo.png` never share variants. Pages
 * that render uploads ask `variantSrcSet(url)` for a srcset.
 *
 * SERVER-ONLY: variantSrcSet checks the filesystem. Call it in
 * getStaticProps / getServerSideProps / API routes and pass the string down
 * as a prop; never import this module into client components.
 */

export const VARIANT_WIDTHS = [640, 1280, 1920] as const

/**
 * `photo.jpg.w640.webp` and friends — never treated as an original. Group 1
 * is the original's name, group 2 the width. The original part must end in
 * an image extension, so a legacy upload such as `x.w640.webp` is still an
 * original (its variants are `x.w640.webp.w640.webp`, …).
 */
export const VARIANT_NAME_RE = /^(.+\.(?:png|jpe?g|webp|gif))\.w(\d+)\.webp$/i

/** `photo.jpg` + 640 → `photo.jpg.w640.webp` (a valid upload name for any new upload name). */
export function variantName(name: string, w: number): string {
  return `${name}.w${Math.trunc(w)}.webp`
}

export function isVariantName(name: string): boolean {
  return VARIANT_NAME_RE.test(name)
}

/** `photo.jpg.w640.webp` → `photo.jpg`; null when `name` is not a variant name. */
export function variantOriginalName(name: string): string | null {
  const m = VARIANT_NAME_RE.exec(name)
  return m ? m[1] : null
}

/**
 * A name a NEW original may be stored under: one that looks like a variant
 * (`a.jpg.w640.webp`) would squat the variant slot of `a.jpg`, so its
 * `.w<digits>` part becomes `-w<digits>` (`a.jpg-w640.webp`).
 */
export function asOriginalName(name: string): string {
  return isVariantName(name) ? name.replace(/\.w(\d+)(\.webp)$/i, '-w$1$2') : name
}

/** Every variant name an original called `name` can have. */
export function allVariantNames(name: string): string[] {
  return VARIANT_WIDTHS.map((w) => variantName(name, w))
}

/** Variant widths an original of `width` px gets (only narrower ones). */
export function variantWidthsFor(width: number): number[] {
  return VARIANT_WIDTHS.filter((w) => w < width)
}

function uploadsDir(): string {
  return path.join(process.cwd(), 'public', 'uploads')
}

/**
 * The original's upload filename for a `/uploads/<name>` URL, or null for
 * anything else — including a variant URL (`variantOriginalName` maps a
 * variant name back to its original).
 */
export function uploadNameOf(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const m = /^\/uploads\/([^/?#]+)$/.exec(url.split(/[?#]/)[0])
  if (!m) return null
  let name: string
  try {
    name = decodeURIComponent(m[1])
  } catch {
    return null
  }
  return UPLOAD_NAME_RE.test(name) && !isVariantName(name) ? name : null
}

/** `/uploads/<name>` anywhere in a text: markdown images, JSX / HTML attributes, frontmatter values. */
const UPLOAD_REF_RE = /\/uploads\/([A-Za-z0-9._%-]+)/g

/**
 * Original upload names a text references (`/uploads/a.png` in an article
 * body or a cover), deduplicated, in order of appearance. Variant URLs and
 * names that are not valid uploads are skipped.
 */
export function uploadNamesIn(text: unknown): string[] {
  if (typeof text !== 'string' || !text) return []
  const out = new Set<string>()
  for (const m of text.matchAll(UPLOAD_REF_RE)) {
    const name = uploadNameOf(`/uploads/${m[1]}`)
    if (name) out.add(name)
  }
  return Array.from(out)
}

/**
 * What variantSrcSet sees on disk for the uploads a text references: per
 * original, whether it is stored and which variant widths exist. A compiled
 * article embeds its srcsets, so this belongs in any cache key of a
 * compiled body — variants written later (the media-optimize backfill) then
 * give a fresh compile instead of the stale, srcset-less tree.
 */
export function variantState(text: unknown): string {
  const names = uploadNamesIn(text)
  if (!names.length) return ''
  const dir = uploadsDir()
  return names
    .map((name) => {
      const widths = VARIANT_WIDTHS.filter((w) => fs.existsSync(path.join(dir, variantName(name, w))))
      return `${name}:${fs.existsSync(path.join(dir, name)) ? 1 : 0}:${widths.join(',')}`
    })
    .join('|')
}

/**
 * `srcset` for an uploaded image: every stored WebP variant
 * (`/uploads/a.jpg.w640.webp 640w, …`) plus the original as the largest
 * candidate when its width is known. Undefined when the URL is not an
 * upload or no variant exists (then a plain `src` is all there is).
 */
export function variantSrcSet(url: string): string | undefined {
  const name = uploadNameOf(url)
  if (!name) return undefined
  const dir = uploadsDir()
  const parts: string[] = []
  let largest = 0
  for (const w of VARIANT_WIDTHS) {
    const v = variantName(name, w)
    if (fs.existsSync(path.join(dir, v))) {
      parts.push(`/uploads/${encodeURIComponent(v)} ${w}w`)
      largest = w
    }
  }
  if (!parts.length) return undefined
  const original = localImageSize(`/uploads/${name}`)
  if (original && original.width > largest) parts.push(`/uploads/${encodeURIComponent(name)} ${original.width}w`)
  return parts.join(', ')
}
