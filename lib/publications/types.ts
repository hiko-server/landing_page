/**
 * Publications (论文) — the vocabulary shared by the CV registry, the
 * validator, the renderers (A4 sheet, Reading view, /publications) and the
 * citation generators. Pure and framework-free.
 *
 * Stored shape: a CV section `{ sessionName: 'publications', papers: [...] }`
 * whose entries carry the fields of `PublicationEntry` (all optional in
 * storage; the renderers read them through `toPublication`).
 */

/** CV section name and the list key that holds its entries. */
export const PUBLICATIONS_SECTION = 'publications'
export const PAPERS_KEY = 'papers'

export const VENUE_TYPES = ['journal', 'conference', 'workshop', 'preprint', 'thesis', 'book-chapter', 'other'] as const
export type VenueType = (typeof VENUE_TYPES)[number]

/**
 * Publication statuses, most mature first. This is also the display order:
 * published work, then forthcoming work (in press, accepted), then work
 * under review, then preprints.
 */
export const PUBLICATION_STATUSES = ['published', 'in-press', 'accepted', 'under-review', 'preprint'] as const
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number]

export type PubLang = 'en' | 'zh'

export const STATUS_LABELS: Record<PublicationStatus, Record<PubLang, string>> = {
  published: { en: 'Published', zh: '已发表' },
  'in-press': { en: 'In press', zh: '印刷中' },
  accepted: { en: 'Accepted', zh: '已录用' },
  'under-review': { en: 'Under review', zh: '审稿中' },
  preprint: { en: 'Preprint', zh: '预印本' },
}

/** Plural group headings (the /publications page groups by status). */
export const STATUS_GROUP_LABELS: Record<PublicationStatus, Record<PubLang, string>> = {
  published: { en: 'Published', zh: '已发表' },
  'in-press': { en: 'In press', zh: '印刷中' },
  accepted: { en: 'Accepted', zh: '已录用' },
  'under-review': { en: 'Under review', zh: '审稿中' },
  preprint: { en: 'Preprints', zh: '预印本' },
}

export const VENUE_TYPE_LABELS: Record<VenueType, Record<PubLang, string>> = {
  journal: { en: 'Journal article', zh: '期刊论文' },
  conference: { en: 'Conference paper', zh: '会议论文' },
  workshop: { en: 'Workshop paper', zh: '研讨会论文' },
  preprint: { en: 'Preprint', zh: '预印本' },
  thesis: { en: 'Thesis', zh: '学位论文' },
  'book-chapter': { en: 'Book chapter', zh: '书籍章节' },
  other: { en: 'Other', zh: '其他' },
}

/** Link labels for the renderers. */
export const LINK_LABELS: Record<'doi' | 'url' | 'pdf' | 'code' | 'slides', Record<PubLang, string>> = {
  doi: { en: 'DOI', zh: 'DOI' },
  url: { en: 'Paper', zh: '论文页面' },
  pdf: { en: 'PDF', zh: 'PDF' },
  code: { en: 'Code', zh: '代码' },
  slides: { en: 'Slides', zh: '幻灯片' },
}

export function isVenueType(v: unknown): v is VenueType {
  return typeof v === 'string' && (VENUE_TYPES as readonly string[]).includes(v)
}

export function isPublicationStatus(v: unknown): v is PublicationStatus {
  return typeof v === 'string' && (PUBLICATION_STATUSES as readonly string[]).includes(v)
}

export function statusLabel(status: PublicationStatus, lang: PubLang = 'en'): string {
  return STATUS_LABELS[status][lang] || STATUS_LABELS[status].en
}

/** Only `published` counts as published; everything else is labelled with its real status. */
export function isPublishedStatus(status: PublicationStatus): boolean {
  return status === 'published'
}

/** One stored entry, as the owner typed it (before visibility pruning). */
export type PublicationEntry = {
  title?: string
  authors?: string[]
  venue?: string
  venueType?: VenueType | ''
  status?: PublicationStatus | ''
  /** YYYY or YYYY-MM. */
  date?: string
  volume?: string
  issue?: string
  pages?: string
  publisher?: string
  doi?: string
  url?: string
  pdfUrl?: string
  codeUrl?: string
  slidesUrl?: string
  abstract?: string
  keywords?: string[]
  award?: string
}

/** One author of a public publication. `hidden`: the owner hid this name (its position is kept). */
export type PubAuthor = { name: string; hidden: boolean }

/** A publication ready to render: public values only, trimmed and normalised. */
export type Publication = {
  /**
   * Position among the section's visible entries, before sorting — the CV
   * anchor index (`cv-publications-<index>`), stable across the A4 sheet and
   * the Reading view.
   */
  index: number
  title: string
  authors: PubAuthor[]
  venue: string
  venueType: VenueType | ''
  status: PublicationStatus
  /** YYYY or YYYY-MM ('' when not given or not valid). */
  date: string
  /** The year of `date` ('' when none). */
  year: string
  volume: string
  issue: string
  pages: string
  publisher: string
  /** Normalised DOI ("10.1234/abc"), '' when absent or not a DOI. */
  doi: string
  /** Safe links: https:// URLs or same-site paths ('' when absent or refused). */
  url: string
  pdfUrl: string
  codeUrl: string
  slidesUrl: string
  abstract: string
  keywords: string[]
  award: string
}
