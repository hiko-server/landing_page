import fs from 'fs'
import path from 'path'
import { UPLOAD_NAME_RE } from './security/uploadName'
import { localImageSize } from './rehype/imageSize'

/**
 * Responsive variants of uploaded images (the Next image optimizer is
 * disabled, so resizing happens once, at upload time — lib/imageVariants.ts,
 * or in the media-optimize backfill; never while a page renders).
 *
 * For an upload `/uploads/photo.jpg` the files next to it are
 *
 *   photo.jpg.w320.webp  photo.jpg.w320.avif     every VARIANT_WIDTHS entry
 *   photo.jpg.w480.webp  photo.jpg.w480.avif     narrower than the original,
 *   …                                            in both formats (G4)
 *   photo.jpg.w1400.webp photo.jpg.w1400.avif    the original's own width
 *                                                (≤ MAX_VARIANT_WIDTH): the
 *                                                largest candidate, smaller
 *                                                than the JPEG / PNG (no
 *                                                same-width WebP for a WebP)
 *   photo.jpg.w16.webp                           the blur placeholder (C8),
 *                                                inlined as a data: URL
 *
 * The original's full name (extension included) is part of every variant
 * name, so `photo.jpg` and `photo.png` never share variants. Pages render an
 * image with `imageSources(url)`: a WebP srcset for the <img>, an AVIF
 * srcset for a <picture> <source> (only once the AVIF set is complete) and
 * the placeholder.
 *
 * The same layout works for the site's own photos under /images (baked and
 * committed by scripts/bake-images.mjs next to the file).
 *
 * SERVER-ONLY: these functions check the filesystem. Call them in
 * getStaticProps / getServerSideProps / API routes and pass the strings down
 * as props; never import this module into client components.
 */

export const VARIANT_WIDTHS = [320, 480, 640, 1280, 1920] as const
export const VARIANT_FORMATS = ['webp', 'avif'] as const
export type VariantFormat = (typeof VARIANT_FORMATS)[number]

/** Widest same-width variant (lib/imageVariants MAX_EDGE: larger originals are downscaled to it on upload). */
export const MAX_VARIANT_WIDTH = 2560
/** Width of the blur placeholder (`name.w16.webp`, C8). */
export const PLACEHOLDER_WIDTH = 16
/** A placeholder larger than this is not inlined (a 16 px WebP is ~100–300 bytes). */
export const PLACEHOLDER_MAX_BYTES = 2048

/**
 * `photo.jpg.w640.webp`, `photo.jpg.w640.avif` and friends — never treated as
 * an original. Group 1 is the original's name, group 2 the width, group 3 the
 * format. The original part must end in an image extension, so a legacy
 * upload such as `x.w640.webp` is still an original (its variants are
 * `x.w640.webp.w640.webp`, …).
 */
export const VARIANT_NAME_RE = /^(.+\.(?:png|jpe?g|webp|gif))\.w(\d+)\.(webp|avif)$/i

/** `photo.jpg` + 640 → `photo.jpg.w640.webp` (or `.avif`): a valid upload name for any new upload name. */
export function variantName(name: string, w: number, format: VariantFormat = 'webp'): string {
  return `${name}.w${Math.trunc(w)}.${format}`
}

/** `photo.jpg` → `photo.jpg.w16.webp`, the blur placeholder. */
export function placeholderName(name: string): string {
  return variantName(name, PLACEHOLDER_WIDTH, 'webp')
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
  return isVariantName(name) ? name.replace(/\.w(\d+)(\.(?:webp|avif))$/i, '-w$1$2') : name
}

/**
 * Variant widths an original of `width` px gets: the VARIANT_WIDTHS narrower
 * than it, then its own width (at most MAX_VARIANT_WIDTH) — the largest
 * candidate in each format. Tiny images (not wider than the placeholder) get
 * none.
 */
export function variantWidthsFor(width: number): number[] {
  if (!Number.isFinite(width) || width <= PLACEHOLDER_WIDTH) return []
  const own = Math.min(Math.trunc(width), MAX_VARIANT_WIDTH)
  const out: number[] = VARIANT_WIDTHS.filter((w) => w < own)
  out.push(own)
  return out
}

/** Formats made at `w` for an original called `name` that is `width` px wide: no same-width WebP of a WebP. */
export function variantFormatsAt(name: string, w: number, width: number): VariantFormat[] {
  const sameWidth = w === Math.min(Math.trunc(width), MAX_VARIANT_WIDTH)
  return sameWidth && /\.webp$/i.test(name) ? ['avif'] : [...VARIANT_FORMATS]
}

/** Every variant file name an original called `name`, `width` px wide, should have (placeholder included). */
export function expectedVariantNames(name: string, width: number): string[] {
  const widths = variantWidthsFor(width)
  if (!widths.length) return []
  const out = widths.flatMap((w) => variantFormatsAt(name, w, width).map((f) => variantName(name, w, f)))
  out.push(placeholderName(name))
  return out
}

/** Every variant file of `name` present in `dir` (any width, either format, the placeholder). */
export function variantFilesOf(dir: string, name: string): string[] {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }
  return entries.filter((n) => variantOriginalName(n) === name)
}

function uploadsDir(): string {
  return path.join(process.cwd(), 'public', 'uploads')
}

function publicDir(): string {
  return path.join(process.cwd(), 'public')
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

const STATIC_IMAGE_RE = /^\/images\/((?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/){0,4})([A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:png|jpe?g|webp))$/i

/**
 * Where a same-site image keeps its variants: an upload (public/uploads) or
 * one of the site's own photos under /images (public/images/…, baked by
 * scripts/bake-images.mjs). `base` is the URL prefix of the variant files.
 */
export function variantHome(url: unknown): { dir: string; name: string; base: string } | null {
  const upload = uploadNameOf(url)
  if (upload) return { dir: uploadsDir(), name: upload, base: '/uploads/' }
  if (typeof url !== 'string') return null
  const clean = url.split(/[?#]/)[0]
  const m = STATIC_IMAGE_RE.exec(clean)
  if (!m || clean.includes('..') || isVariantName(m[2])) return null
  return { dir: path.join(publicDir(), 'images', m[1]), name: m[2], base: `/images/${m[1]}` }
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
 * What the rendered sources depend on, for the uploads a text references:
 * per original, whether it is stored and which variant files exist (both
 * formats, the placeholder). A compiled article embeds its srcsets and
 * placeholders, so this belongs in any cache key of a compiled body —
 * variants written later (the media-optimize backfill) then give a fresh
 * compile instead of the stale tree.
 */
export function variantState(text: unknown): string {
  const names = uploadNamesIn(text)
  if (!names.length) return ''
  const dir = uploadsDir()
  return names
    .map((name) => `${name}:${fs.existsSync(path.join(dir, name)) ? 1 : 0}:${variantFilesOf(dir, name).sort().join(',')}`)
    .join('|')
}

const encodeName = (name: string) => encodeURIComponent(name)

/** The variant files of one format that exist for `home`, narrowest first, with their widths. */
function existingVariants(home: { dir: string; name: string; base: string }, format: VariantFormat, width: number | null): Array<{ url: string; w: number }> {
  const widths = new Set<number>(VARIANT_WIDTHS)
  if (width) for (const w of variantWidthsFor(width)) widths.add(w)
  const out: Array<{ url: string; w: number }> = []
  for (const w of Array.from(widths).sort((a, b) => a - b)) {
    const v = variantName(home.name, w, format)
    if (fs.existsSync(path.join(home.dir, v))) out.push({ url: `${home.base}${encodeName(v)}`, w })
  }
  return out
}

/**
 * `srcset` of the WebP variants (`/uploads/a.jpg.w320.webp 320w, …`). The
 * original is the largest candidate when it is wider than every variant
 * (no same-width variant yet, or an original over MAX_VARIANT_WIDTH).
 * Undefined when the URL has no variant home or no variant exists (then a
 * plain `src` is all there is).
 */
export function variantSrcSet(url: string): string | undefined {
  const home = variantHome(url)
  if (!home) return undefined
  const original = localImageSize(`${home.base}${home.name}`)
  const parts = existingVariants(home, 'webp', original?.width ?? null)
  if (!parts.length) return undefined
  const largest = parts[parts.length - 1].w
  const out = parts.map((p) => `${p.url} ${p.w}w`)
  if (original && original.width > largest) out.push(`${home.base}${encodeName(home.name)} ${original.width}w`)
  return out.join(', ')
}

/**
 * `srcset` of the AVIF variants, for a `<source type="image/avif">`. Only
 * when every AVIF variant the original should have exists — a partial set
 * would cap the image at its widest AVIF on large screens.
 */
export function variantAvifSrcSet(url: string): string | undefined {
  const home = variantHome(url)
  if (!home) return undefined
  const original = localImageSize(`${home.base}${home.name}`)
  if (!original) return undefined
  const expected = variantWidthsFor(original.width)
  if (!expected.length) return undefined
  const parts = existingVariants(home, 'avif', original.width)
  const have = new Set(parts.map((p) => p.w))
  if (!expected.every((w) => have.has(w))) return undefined
  return parts.filter((p) => expected.includes(p.w)).map((p) => `${p.url} ${p.w}w`).join(', ')
}

/** C8: the image's blur placeholder as a `data:image/webp;base64,…` URL, or undefined. */
export function placeholderDataUrl(url: string): string | undefined {
  const home = variantHome(url)
  if (!home) return undefined
  const file = path.join(home.dir, placeholderName(home.name))
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size > PLACEHOLDER_MAX_BYTES || stat.size < 12) return undefined
    const buf = fs.readFileSync(file)
    if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return undefined
    return `data:image/webp;base64,${buf.toString('base64')}`
  } catch {
    return undefined
  }
}

/** Everything a page needs to render a same-site image responsively (G4, C8); each field only when available. */
export type ImageSources = { srcSet?: string; avifSrcSet?: string; placeholder?: string }

export function imageSources(url: string): ImageSources {
  const out: ImageSources = {}
  const srcSet = variantSrcSet(url)
  if (srcSet) out.srcSet = srcSet
  const avifSrcSet = variantAvifSrcSet(url)
  if (avifSrcSet) out.avifSrcSet = avifSrcSet
  const placeholder = placeholderDataUrl(url)
  if (placeholder) out.placeholder = placeholder
  return out
}

/**
 * URL of an image's stored `width`-px WebP variant (`/uploads/a.jpg.w640.webp`),
 * or `url` itself when that variant does not exist or `url` has no variant
 * home — e.g. a right-sized portrait for structured data.
 */
export function variantUrl(url: string, width: number): string {
  const home = variantHome(url)
  if (!home) return url
  const variant = variantName(home.name, width)
  return fs.existsSync(path.join(home.dir, variant)) ? `${home.base}${encodeName(variant)}` : url
}
