import type { MediaItem, MediaUsage, TrashItem } from './types'

/**
 * The media library's view logic (H7) — pure, client-safe, unit-tested:
 * search, filters, sorting, counts, labels and the URL state of the admin
 * page (/admin/media?q=…&filter=…&sort=…).
 */

export const MEDIA_TYPES = ['jpeg', 'png', 'webp', 'gif'] as const
export type MediaTypeFilter = 'all' | (typeof MEDIA_TYPES)[number]
export const ORIENTATIONS = ['landscape', 'portrait', 'square'] as const
export type Orientation = (typeof ORIENTATIONS)[number]

/** The toggles (filter chips), in display order. */
export const FLAGS = ['missingAlt', 'unused', 'needsSizes', 'large', 'notInR2'] as const
export type MediaFlag = (typeof FLAGS)[number]

export const FLAG_LABEL: Record<MediaFlag, string> = {
  missingAlt: 'No alt text',
  unused: 'Unused',
  needsSizes: 'Missing sizes',
  large: 'Large files',
  notInR2: 'Not in R2',
}

export const FLAG_HINT: Record<MediaFlag, string> = {
  missingAlt: 'No default alt text in either language, or shown somewhere without one',
  unused: 'Nothing on the site refers to it',
  needsSizes: 'Some responsive versions (WebP, AVIF, blur placeholder) are missing',
  large: 'The original is 500 KB or more',
  notInR2: 'R2 is missing some of its files (as of the last check)',
}

/** An original this heavy is worth a look (FLAG_HINT.large says it in words). */
export const LARGE_BYTES = 500 * 1024

export const SORTS = ['newest', 'oldest', 'largest', 'name', 'most-used'] as const
export type MediaSort = (typeof SORTS)[number]
export const SORT_LABEL: Record<MediaSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  largest: 'Largest first',
  name: 'Name',
  'most-used': 'Most used',
}

export type MediaFilter = {
  q: string
  type: MediaTypeFilter
  orientation: 'all' | Orientation
  flags: MediaFlag[]
}

export const EMPTY_FILTER: MediaFilter = { q: '', type: 'all', orientation: 'all', flags: [] }

/** Landscape / portrait / square (within 5 %), or null without a size. */
export function orientationOf(width: number | null | undefined, height: number | null | undefined): Orientation | null {
  if (!width || !height) return null
  if (Math.abs(width - height) / Math.max(width, height) <= 0.05) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

export const hasDefaultAlt = (item: Pick<MediaItem, 'meta'>) => !!(item.meta?.alt || item.meta?.altZh)

/** Places that show the image without a real alt text. */
export function usesWithoutAlt(item: Pick<MediaItem, 'usage'>): MediaUsage[] {
  return item.usage.filter((u) => u.alt === 'missing' || u.alt === 'meaningless')
}

export const needsSizes = (item: Pick<MediaItem, 'variants'>) => item.variants.eligible && item.variants.missing.length > 0

/** Number of distinct documents that use it. */
export function usedInCount(item: Pick<MediaItem, 'usage'>): number {
  return new Set(item.usage.map((u) => u.doc.replace(/#pending$/, ''))).size
}

export function matchesFlag(item: MediaItem, flag: MediaFlag): boolean {
  switch (flag) {
    case 'missingAlt':
      return !hasDefaultAlt(item) || usesWithoutAlt(item).length > 0
    case 'unused':
      return item.usage.length === 0
    case 'needsSizes':
      return needsSizes(item)
    case 'large':
      return item.bytes >= LARGE_BYTES
    case 'notInR2':
      return item.r2 === false || (item.r2Missing ?? 0) > 0
  }
}

const fold = (s: string) => s.normalize('NFKC').toLowerCase()

/** Every word of the query appears in the name, the texts or the titles of what uses it. */
export function matchesQuery(item: MediaItem, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = fold(
    [item.name, item.meta?.alt, item.meta?.altZh, item.meta?.caption, item.meta?.captionZh, ...item.usage.map((u) => u.docTitle), ...item.replaces].filter(Boolean).join(' \u0000 '),
  )
  return words.every((w) => hay.includes(w))
}

export function filterItems(items: readonly MediaItem[], f: MediaFilter): MediaItem[] {
  return items.filter(
    (item) =>
      (f.type === 'all' || item.format === f.type) &&
      (f.orientation === 'all' || orientationOf(item.width, item.height) === f.orientation) &&
      f.flags.every((flag) => matchesFlag(item, flag)) &&
      matchesQuery(item, f.q),
  )
}

export function sortItems(items: readonly MediaItem[], sort: MediaSort): MediaItem[] {
  const out = [...items]
  const byName = (a: MediaItem, b: MediaItem) => a.name.localeCompare(b.name)
  switch (sort) {
    case 'oldest':
      return out.sort((a, b) => a.addedAt - b.addedAt || byName(a, b))
    case 'largest':
      return out.sort((a, b) => b.bytes - a.bytes || byName(a, b))
    case 'name':
      return out.sort(byName)
    case 'most-used':
      return out.sort((a, b) => usedInCount(b) - usedInCount(a) || b.addedAt - a.addedAt)
    default:
      return out.sort((a, b) => b.addedAt - a.addedAt || byName(a, b))
  }
}

/** How many uploads each toggle would show (ignoring the other toggles). */
export function flagCounts(items: readonly MediaItem[]): Record<MediaFlag, number> {
  const out = Object.fromEntries(FLAGS.map((f) => [f, 0])) as Record<MediaFlag, number>
  for (const item of items) for (const f of FLAGS) if (matchesFlag(item, f)) out[f]++
  return out
}

/** "980 B", "240 KB", "1.4 MB". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024 - 512) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export const formatDims = (w: number | null | undefined, h: number | null | undefined) => (w && h ? `${w} × ${h}` : '—')

const FORMAT_LABEL: Record<string, string> = { jpeg: 'JPEG', png: 'PNG', webp: 'WebP', gif: 'GIF', svg: 'SVG', avif: 'AVIF' }
export const formatLabel = (format: string | null | undefined) => (format ? FORMAT_LABEL[format] || format.toUpperCase() : 'File')

/** The accessible name of a tile: what a screen reader hears before it opens. */
export function tileLabel(item: MediaItem): string {
  const parts = [item.name, formatLabel(item.format), item.width && item.height ? `${item.width} by ${item.height} pixels` : '', formatBytes(item.bytes)]
  const used = usedInCount(item)
  parts.push(used ? `used in ${used} ${used === 1 ? 'place' : 'places'}` : 'unused')
  if (!hasDefaultAlt(item)) parts.push('no alt text')
  if (needsSizes(item)) parts.push('missing responsive sizes')
  if (!item.local) parts.push('only in R2')
  return parts.filter(Boolean).join(', ')
}

/** "3 days ago" style for a timestamp (English admin UI). */
export function relativeTime(ms: number, now: number): string {
  const diff = Math.round((ms - now) / 1000)
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })
  if (abs < 45) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 45) return rtf.format(Math.round(diff / 86400), 'day')
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "29 days left" until a trashed upload is removed for good. */
export function daysLeft(item: Pick<TrashItem, 'purgeAt'>, now: number): string {
  const days = Math.max(0, Math.ceil((item.purgeAt - now) / 86_400_000))
  return days <= 0 ? 'removed tonight' : `${days} day${days === 1 ? '' : 's'} left`
}

// ── URL state ───────────────────────────────────────────────────────────

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export function filterFromQuery(query: Record<string, string | string[] | undefined>): { filter: MediaFilter; sort: MediaSort } {
  const type = first(query.type)
  const orientation = first(query.orientation)
  const flags = first(query.filter)
    .split(',')
    .filter((f): f is MediaFlag => (FLAGS as readonly string[]).includes(f))
  const sort = first(query.sort)
  return {
    filter: {
      q: first(query.q).slice(0, 200),
      type: (MEDIA_TYPES as readonly string[]).includes(type) ? (type as MediaTypeFilter) : 'all',
      orientation: (ORIENTATIONS as readonly string[]).includes(orientation) ? (orientation as Orientation) : 'all',
      flags: Array.from(new Set(flags)),
    },
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as MediaSort) : 'newest',
  }
}

/** The query keys for a filter (defaults left out). */
export function filterToQuery(filter: MediaFilter, sort: MediaSort): Record<string, string> {
  const out: Record<string, string> = {}
  if (filter.q.trim()) out.q = filter.q.trim()
  if (filter.type !== 'all') out.type = filter.type
  if (filter.orientation !== 'all') out.orientation = filter.orientation
  if (filter.flags.length) out.filter = FLAGS.filter((f) => filter.flags.includes(f)).join(',')
  if (sort !== 'newest') out.sort = sort
  return out
}

export const isFiltered = (f: MediaFilter) => !!f.q.trim() || f.type !== 'all' || f.orientation !== 'all' || f.flags.length > 0

/** Markdown for an image: `![alt](url "caption")` (quotes in the caption escaped). */
export function imageMarkdown(url: string, alt: string, caption = ''): string {
  const a = alt.replace(/[[\]\\]/g, '\\$&').replace(/\s+/g, ' ').trim()
  const c = caption.replace(/\s+/g, ' ').trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `![${a}](${url}${c ? ` "${c}"` : ''})`
}
