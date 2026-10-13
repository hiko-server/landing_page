/**
 * The optional photo of the PDF CV (E10). SERVER-ONLY.
 *
 * Personal Info may hold a photo with a per-language "put it on this
 * language's PDF" switch (off by default). Both are private fields: no page,
 * API, feed or structured data carries them (lib/cvVisibility
 * PRIVATE_SECTION_FIELDS). Only the PDF reads them, through
 * lib/cvdata readCvPdfPhoto(lang), which answers null unless the owner
 * switched the photo on for THAT language's PDF.
 *
 * The image is read from the uploads (disk, else the R2 mirror) or, for an
 * https reference, fetched once through the SSRF-safe image fetcher
 * (lib/remoteImage via lib/logoMetrics readLogoSource), then re-encoded by
 * sharp as a small JPEG without metadata (pdfkit embeds JPEG / PNG only, and
 * the file must not carry EXIF). Results are memoised by URL; a failure
 * leaves the photo out and never fails the file.
 */

import crypto from 'node:crypto'
import type { CvLang } from '../cvVisibility'
import { log } from '../log'

export type PdfPhoto = {
  /** JPEG bytes (sRGB, no metadata). */
  jpeg: Buffer
  width: number
  height: number
  /** Content hash: part of the PDF's ETag. */
  hash: string
}

/** Longest edge of the embedded JPEG: ~2.4× the printed size, plenty for print. */
export const PDF_PHOTO_MAX_EDGE = 360

const memo = new Map<string, Promise<PdfPhoto | null>>()

/** Re-encode image bytes as the PDF's JPEG (EXIF-rotated, metadata stripped). Null when they do not decode. */
export async function pdfPhotoFromBuffer(buf: Buffer): Promise<PdfPhoto | null> {
  try {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(buf, { failOn: 'error' })
      .rotate()
      .resize({ width: PDF_PHOTO_MAX_EDGE, height: PDF_PHOTO_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb')
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
    return { jpeg: data, width: info.width, height: info.height, hash: crypto.createHash('sha256').update(data).digest('hex').slice(0, 16) }
  } catch {
    return null
  }
}

/** The photo of `lang`'s PDF, or null (not switched on, missing, unreadable). Never throws. */
export async function loadCvPdfPhoto(lang: CvLang): Promise<PdfPhoto | null> {
  let url: string | null = null
  try {
    url = (await import('../cvdata')).readCvPdfPhoto(lang)
  } catch {
    return null
  }
  if (!url) return null
  let job = memo.get(url)
  if (!job) {
    job = (async () => {
      try {
        const { readLogoSource } = await import('../logoMetrics')
        const src = await readLogoSource(url)
        const photo = src ? await pdfPhotoFromBuffer(src.buf) : null
        if (!photo) log.warn('cv pdf: the photo could not be read; it is left out', { lang })
        return photo
      } catch (err) {
        log.warn('cv pdf: the photo could not be read; it is left out', { lang, err })
        return null
      }
    })()
    memo.set(url, job)
    // Forget failures so the next request tries again.
    job.then((p) => {
      if (!p) memo.delete(url as string)
    })
  }
  return job
}

/** Forget memoised photos (tests). */
export function clearCvPdfPhotoCache(): void {
  memo.clear()
}
