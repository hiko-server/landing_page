import { uploadNameIn } from '../../../lib/media/view'
import type { PickedImage } from '../media/MediaPicker'

/**
 * What an image chosen from the media library changes in a home editor card
 * (followups-3) — pure, unit-tested.
 *
 *   Field-note photo   the URL; the description (the photo's alt text) and
 *                      its Chinese caption follow the picture: a different
 *                      image brings its own texts (as a cover's alt does,
 *                      components/Admin/shell/CoverImageField) — the English
 *                      one as edited in the picker, the Chinese one the
 *                      image's default — even when it has none, since the
 *                      old texts describe another picture. The same image
 *                      only fills what is empty or was edited in the picker.
 *   Affiliation logo   the URL; the name (the organisation, read as the
 *                      logo's alt text) is filled from the image's alt text
 *                      only while the card has none — a replaced file of the
 *                      same organisation keeps its name.
 */

export type Picked = Pick<PickedImage, 'name' | 'url' | 'alt' | 'meta'>

type PhotoTexts = { url: string; describe: string; describe_zh?: string }

/** The changes to a photo card. */
export function photoFromLibrary(prev: PhotoTexts, img: Picked): Partial<PhotoTexts> {
  const same = uploadNameIn(prev.url) === img.name
  const zh = img.meta?.altZh?.trim() || ''
  const change: Partial<PhotoTexts> = { url: img.url }
  if (!same || img.alt) change.describe = img.alt
  if (!same) change.describe_zh = zh
  else if (zh && !prev.describe_zh?.trim()) change.describe_zh = zh
  return change
}

/** A new photo card from the library (visible, no link). */
export function newPhotoFromLibrary(img: Picked): { url: string; describe: string; describe_zh?: string; redirectTo: string; visible: boolean } {
  const zh = img.meta?.altZh?.trim() || ''
  return { url: img.url, describe: img.alt, ...(zh ? { describe_zh: zh } : {}), redirectTo: '', visible: true }
}

type LogoFields = { name: string; image: string }

/** The changes to a logo card. */
export function logoFromLibrary(prev: LogoFields, img: Picked): Partial<LogoFields> {
  const change: Partial<LogoFields> = { image: img.url }
  if (!prev.name.trim() && img.alt) change.name = img.alt
  return change
}

/** A new logo card from the library. */
export function newLogoFromLibrary(img: Picked): { name: string; href: string; image: string; scale: number } {
  return { name: img.alt, href: '', image: img.url, scale: 1 }
}
