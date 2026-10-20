/**
 * The media library's wire types (H7) — shared by the server (lib/media/*,
 * /api/admin/media) and the admin UI (components/Admin/media). Types only:
 * safe to import from client code.
 */

export type MediaFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'svg' | 'avif' | 'other'

/** What kind of document refers to an upload. */
export type UsageDocKind = 'post' | 'work' | 'page' | 'home' | 'cv' | 'setting'

/** Whether the place shows the image with a real alt text (null: not an image tag, or unknown). */
export type UsageAlt = 'ok' | 'missing' | 'meaningless' | 'decorative'

/** One place an upload is referred to (lib/media/usage). */
export type MediaUsage = {
  /** Original upload name (a variant reference counts for its original). */
  name: string
  /** Stable document key: "blog/<slug>", "blog/<slug>#pending", "work/…", "page/now", "home", "cv", "kv/<key>". */
  doc: string
  /** Stable field key inside the document: "cover", "body", "hero.avatarUrl", "en.0.photo", … */
  field: string
  /** Where, in words: "Cover", "Body · line 12", "Introduction › Portrait". */
  label: string
  /** First line of a body reference. */
  line: number | null
  /** The weakest alt seen at this place (null when not an image tag). */
  alt: UsageAlt | null
  /** References at this place. */
  count: number
  docKind: UsageDocKind
  /** "SWCS", "/now", "Home page", "CV". */
  docTitle: string
  /** live | draft | pending (unpublished changes of a live item) | private (CV PDF photo) | null. */
  docState: 'live' | 'draft' | 'pending' | 'private' | null
  /** Admin editor of the document. */
  editHref: string | null
  /** The public page that shows it (only for live content). */
  publicHref: string | null
}

/** The owner's default texts for one upload, offered when it is inserted. */
export type MediaMeta = {
  alt: string
  altZh: string
  caption: string
  captionZh: string
  /** ms; the entry's version for the optimistic-concurrency check. */
  updatedAt: number
}

export type MediaVariant = { name: string; width: number; format: 'webp' | 'avif'; bytes: number }

export type MediaItem = {
  name: string
  url: string
  bytes: number
  width: number | null
  height: number | null
  format: MediaFormat | null
  animated: boolean
  /** The original's modification time (ms) — when it was uploaded. */
  addedAt: number
  /** The file is on this server's disk. */
  local: boolean
  /** The original is in R2 (null: never listed, or R2 not configured). */
  r2: boolean | null
  /** Files of this asset (original + variants) on disk but not in R2 at the last listing; null when unknown. */
  r2Missing: number | null
  variants: {
    /** The upload can have responsive versions (JPEG / PNG / WebP, still, wide enough). */
    eligible: boolean
    present: MediaVariant[]
    /** Expected variant files that do not exist (lib/uploadVariants expectedVariantNames). */
    missing: string[]
    placeholder: boolean
    /** Bytes of every variant file together. */
    bytes: number
  }
  /** Small preview: the 320 / 480 px WebP when there is one, else the original. */
  thumb: string
  /** C8 blur placeholder (data: URL), when present. */
  placeholder?: string
  /** WebP and AVIF srcsets for the large preview. */
  srcSet?: string
  avifSrcSet?: string
  usage: MediaUsage[]
  meta: MediaMeta | null
  /** Old names whose address redirects here (replaced files). */
  replaces: string[]
}

export type TrashItem = {
  name: string
  bytes: number
  width: number | null
  height: number | null
  deletedAt: number
  /** When it is removed for good. */
  purgeAt: number
  reason: 'deleted' | 'replaced'
  replacedBy: string | null
  files: number
  /** R2 still holds some of its files (the next sync removes them). */
  r2Pending: boolean
  /** Admin-only preview of the trashed file (or null when none can be shown). */
  preview: string | null
  meta: Omit<MediaMeta, 'updatedAt'> | null
}

export type MediaLibraryResponse = {
  generatedAt: number
  items: MediaItem[]
  trash: TrashItem[]
  /** Days a deleted upload stays in the trash. */
  trashDays: number
  r2: { configured: boolean; checkedAt: number | null }
}
