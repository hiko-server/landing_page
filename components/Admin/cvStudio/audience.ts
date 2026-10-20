/**
 * Words for the audiences (E4, lib/cvVisibility CV_SURFACES) in CV Studio —
 * pure, shared by the audience menu, the Hidden items panel and the preview.
 */

import { CV_SURFACES, audienceOf, type CvSurface } from '../../../lib/cvVisibility'

export const SURFACE_LABEL: Record<CvSurface, string> = {
  web: 'Public pages',
  download: 'Downloads',
  private: 'Private links',
}

/** Short names for a compact chip. */
export const SURFACE_SHORT: Record<CvSurface, string> = {
  web: 'Pages',
  download: 'Files',
  private: 'Links',
}

export const SURFACE_HINT: Record<CvSurface, string> = {
  web: '/cv, /about, home, /publications, search and structured data',
  download: 'The PDF, text and JSON Resume files and the contact card (vCard)',
  private: 'CV variants you share by private link',
}

/** "everywhere" | "Downloads + Private links" | "nowhere" for an audience list (null = unrestricted). */
export function audienceSummary(list: readonly CvSurface[] | null): string {
  if (list === null) return 'everywhere'
  if (!list.length) return 'nowhere'
  return list.map((s) => SURFACE_LABEL[s]).join(' + ')
}

/** "Files · Links" — the chip on a restricted field, entry, list or section. */
export function audienceChip(list: readonly CvSurface[] | null): string {
  if (list === null) return ''
  if (!list.length) return 'Nowhere'
  return list.map((s) => SURFACE_SHORT[s]).join(' · ')
}

/** The list after switching `surface` on or off (null when every surface is on again). */
export function toggledAudience(current: readonly CvSurface[] | null, surface: CvSurface, on: boolean): CvSurface[] | null {
  const base = current ?? [...CV_SURFACES]
  const next = CV_SURFACES.filter((s) => (s === surface ? on : base.includes(s)))
  return next.length === CV_SURFACES.length ? null : next
}

export { audienceOf }
