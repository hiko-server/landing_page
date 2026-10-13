import fs from 'fs'
import path from 'path'
import { UPLOAD_NAME_RE } from './security/uploadName'
import { localImageSize } from './rehype/imageSize'

/**
 * Responsive variants of uploaded images (the Next image optimizer is
 * disabled, so resizing happens once, at upload time — lib/imageVariants.ts).
 *
 * For an upload `/uploads/photo.jpg` that is wider than a variant width, a
 * WebP copy `/uploads/photo.w640.webp` (…w1280, …w1920) is stored next to
 * it. Pages that render uploads ask `variantSrcSet(url)` for a srcset.
 *
 * SERVER-ONLY: variantSrcSet checks the filesystem. Call it in
 * getStaticProps / getServerSideProps / API routes and pass the string down
 * as a prop; never import this module into client components.
 */

export const VARIANT_WIDTHS = [640, 1280, 1920] as const

/** `photo.w640.webp` and friends — never treated as an original. */
export const VARIANT_NAME_RE = /\.w\d+\.webp$/

/** `photo.jpg` + 640 → `photo.w640.webp` (always a valid upload name for a valid input). */
export function variantName(name: string, w: number): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  return `${stem}.w${Math.trunc(w)}.webp`
}

export function isVariantName(name: string): boolean {
  return VARIANT_NAME_RE.test(name)
}

/** Variant widths an original of `width` px gets (only narrower ones). */
export function variantWidthsFor(width: number): number[] {
  return VARIANT_WIDTHS.filter((w) => w < width)
}

function uploadsDir(): string {
  return path.join(process.cwd(), 'public', 'uploads')
}

/** The upload filename of a `/uploads/<name>` URL, or null for anything else. */
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

/**
 * `srcset` for an uploaded image: every stored WebP variant
 * (`/uploads/a.w640.webp 640w, …`) plus the original as the largest
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
