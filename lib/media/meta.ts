import type { MediaMeta } from './types'

/**
 * The owner's default texts per upload (H7): alt text and caption in English
 * and Chinese, offered when the image is inserted (the editor, a cover).
 * Pure parts of the store kept in the kv row `media-library`
 * (lib/media/library) — a kv row, so it is mirrored to R2 and restored with
 * the rest of the content like home and the CV.
 */

export const MEDIA_META_KEY = 'media-library'

/** Long enough for a good description; alt text should stay well under it (WCAG: concise). */
export const ALT_MAX = 300
export const CAPTION_MAX = 500

export type MediaMetaInput = Partial<Record<'alt' | 'altZh' | 'caption' | 'captionZh', unknown>>

export type MediaMetaDoc = { v: 1; items: Record<string, MediaMeta> }

/** One line of plain text: control characters and runs of whitespace become a space, trimmed, capped. */
export function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

/** The texts as stored, from untrusted input (missing fields keep `base`). */
export function cleanMeta(input: MediaMetaInput, base: Omit<MediaMeta, 'updatedAt'> = { alt: '', altZh: '', caption: '', captionZh: '' }): Omit<MediaMeta, 'updatedAt'> {
  const pick = (k: keyof MediaMetaInput, max: number) => (k in input ? cleanLine(input[k], max) : base[k])
  return {
    alt: pick('alt', ALT_MAX),
    altZh: pick('altZh', ALT_MAX),
    caption: pick('caption', CAPTION_MAX),
    captionZh: pick('captionZh', CAPTION_MAX),
  }
}

export const isEmptyMeta = (m: Omit<MediaMeta, 'updatedAt'>) => !m.alt && !m.altZh && !m.caption && !m.captionZh

/** A stored document from whatever the kv row holds (unknown shapes and bad entries dropped). */
export function readMetaDoc(value: unknown): MediaMetaDoc {
  const items: Record<string, MediaMeta> = {}
  const raw = value && typeof value === 'object' ? (value as { items?: unknown }).items : null
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [name, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      const clean = cleanMeta(e)
      if (isEmptyMeta(clean)) continue
      const at = Number(e.updatedAt)
      items[name] = { ...clean, updatedAt: Number.isFinite(at) && at > 0 ? Math.trunc(at) : 0 }
    }
  }
  return { v: 1, items }
}

/**
 * The texts to offer for an insertion in `lang`. No fallback to the other
 * language: an English alt in a Chinese article would be read out in the
 * wrong language — the picker offers to copy it instead.
 */
export function metaFor(meta: Pick<MediaMeta, 'alt' | 'altZh' | 'caption' | 'captionZh'> | null | undefined, lang: 'en' | 'zh'): { alt: string; caption: string } {
  if (!meta) return { alt: '', caption: '' }
  if (lang === 'zh') return { alt: meta.altZh, caption: meta.captionZh }
  return { alt: meta.alt, caption: meta.caption }
}
