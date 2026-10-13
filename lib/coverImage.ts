import { localImageSize } from './rehype/imageSize'
import { variantSrcSet } from './uploadVariants'
import { cleanFocus, COVER_RECOMMENDED_MIN, COVER_SHARP_MIN } from './caseStudy'

export { COVER_RECOMMENDED_MIN, COVER_SHARP_MIN }

/**
 * A case-study cover as the pages render it (SERVER-ONLY: reads the file's
 * header and the upload variants on disk, in getStaticProps).
 *
 *   - real intrinsic size for same-site images (uploads and /public files),
 *     so the <img> carries true width/height and the page can tell a cover
 *     that would be blown up: one narrower than COVER_SHARP_MIN is drawn at
 *     its own size on a tinted panel (`small`), never stretched into a blur;
 *   - the responsive srcset of the upload variants;
 *   - the owner's focal point ("x% y%", default centre) for object-position
 *     wherever the cover is cropped.
 *
 * Remote https covers keep working (size unknown → treated as large).
 */

export type CoverInfo = {
  src: string
  srcSet: string | null
  alt: string
  width: number | null
  height: number | null
  /** Narrower than COVER_SHARP_MIN: drawn at its own size on a panel instead of cropped and stretched. */
  small: boolean
  /** object-position, e.g. "50% 30%". */
  focus: string
}

/** Cover sources an <img> may load: same-site paths or https URLs. */
export function coverSrc(value: unknown): string {
  if (typeof value !== 'string') return ''
  const v = value.trim()
  return /^\/(?!\/)/.test(v) || /^https:\/\//i.test(v) ? v : ''
}

export function resolveCover(cover: unknown, alt?: unknown, focus?: unknown): CoverInfo | null {
  const src = coverSrc(cover)
  if (!src) return null
  let size: { width: number; height: number } | null = null
  let srcSet: string | null = null
  if (src.startsWith('/')) {
    try {
      size = localImageSize(src)
    } catch {
      size = null
    }
    try {
      srcSet = variantSrcSet(src) || null
    } catch {
      srcSet = null
    }
  }
  return {
    src,
    srcSet,
    alt: typeof alt === 'string' ? alt.trim() : '',
    width: size?.width ?? null,
    height: size?.height ?? null,
    small: !!size && size.width < COVER_SHARP_MIN,
    focus: cleanFocus(focus) || '50% 50%',
  }
}
