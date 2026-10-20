import { tagSlug } from './tagFilter'

/**
 * Tag management for posts (`tags`) and case studies (`tech`, the stack) —
 * H16. Pure and client-safe; the store side is lib/tagAdminServer.
 *
 * A tag IS its slug (lib/tagFilter tagSlug: "Edge AI", "edge ai" and
 * "edge-ai" are one tag in the /blog and /work filters, the related-reading
 * links and the feeds), so the inventory groups by slug and lists every
 * spelling in use. Renaming rewrites every spelling of the chosen tags to
 * one new name; merging is renaming several tags to one name. An item that
 * ends up with the same tag twice keeps it once, where it appeared first.
 */

export type TagCollection = 'blog' | 'work'

/** The frontmatter list a collection's tags live in. */
export const TAG_FIELD: Record<TagCollection, 'tags' | 'tech'> = { blog: 'tags', work: 'tech' }

/** Longest tag name the tools accept (the public chips truncate long ones anyway). */
export const TAG_NAME_MAX = 40

export type TaggedItem = {
  slug: string
  title: string
  tags: readonly string[]
  /** The item is a draft (not on the public site). */
  draft?: boolean
  /** Tags of the item's unpublished changes (H4), when it has them. */
  pendingTags?: readonly string[] | null
}

export type TagUse = { slug: string; title: string; draft: boolean; pendingOnly: boolean }

export type TagEntry = {
  /** The tag's identity (lib/tagFilter tagSlug). */
  slug: string
  /** The most used spelling (ties: the one with capitals — "Edge AI" over "edge ai" — then alphabetical). */
  label: string
  /** Every spelling in use, most used first. */
  spellings: string[]
  /** Items carrying it (live or in their unpublished changes). */
  count: number
  items: TagUse[]
}

/** The tag strings of a frontmatter list value (anything else is no tags). */
export function tagsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
}

const capitals = (s: string) => (s.match(/\p{Lu}/gu) || []).length

/** Every tag in use, grouped by slug, most used first (ties alphabetical). */
export function tagInventory(items: readonly TaggedItem[]): TagEntry[] {
  type Acc = { spellings: Map<string, number>; items: Map<string, TagUse> }
  const bySlug = new Map<string, Acc>()
  const note = (raw: string, item: TaggedItem, pendingOnly: boolean) => {
    const tag = raw.trim()
    const slug = tagSlug(tag)
    if (!slug) return
    let acc = bySlug.get(slug)
    if (!acc) bySlug.set(slug, (acc = { spellings: new Map(), items: new Map() }))
    acc.spellings.set(tag, (acc.spellings.get(tag) ?? 0) + 1)
    const prev = acc.items.get(item.slug)
    if (!prev) acc.items.set(item.slug, { slug: item.slug, title: item.title || item.slug, draft: !!item.draft, pendingOnly })
    else if (!pendingOnly && prev.pendingOnly) prev.pendingOnly = false
  }
  for (const item of items) {
    const live = new Set<string>()
    for (const t of tagsOf(item.tags)) {
      live.add(tagSlug(t))
      note(t, item, false)
    }
    for (const t of tagsOf(item.pendingTags)) note(t, item, !live.has(tagSlug(t)))
  }
  const out: TagEntry[] = []
  for (const [slug, acc] of bySlug) {
    const spellings = Array.from(acc.spellings.entries())
      .sort((a, b) => b[1] - a[1] || capitals(b[0]) - capitals(a[0]) || a[0].localeCompare(b[0], 'en'))
      .map(([s]) => s)
    const uses = Array.from(acc.items.values()).sort((a, b) => a.title.localeCompare(b.title, 'en'))
    out.push({ slug, label: spellings[0], spellings, count: uses.length, items: uses })
  }
  return out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en'))
}

/** Why `name` cannot be a tag name, or '' when it can. */
export function tagNameProblem(name: string): string {
  const t = name.trim()
  if (!t) return 'Enter a name.'
  if (/[,，]/.test(t)) return 'A tag name cannot contain a comma (the editors separate tags with commas).'
  if (Array.from(t).length > TAG_NAME_MAX) return `At most ${TAG_NAME_MAX} characters.`
  if (!tagSlug(t)) return 'Use at least one letter or digit.'
  return ''
}

/**
 * `list` with every tag whose slug is in `from` replaced by `to` (at the
 * first such tag's position), duplicates by slug removed (the first stays).
 * `changed` is false when the list is exactly as it was.
 */
export function retagList(list: readonly string[], from: ReadonlySet<string>, to: string): { list: string[]; changed: boolean } {
  // Lists without any of the tags are left exactly as stored.
  if (!list.some((t) => typeof t === 'string' && from.has(tagSlug(t)))) return { list: [...list], changed: false }
  const name = to.trim()
  const target = tagSlug(name)
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    const tag = typeof raw === 'string' ? raw.trim() : ''
    const slug = tagSlug(tag)
    if (!slug) continue
    const next = from.has(slug) ? name : tag
    const nextSlug = from.has(slug) ? target : slug
    if (seen.has(nextSlug)) continue
    seen.add(nextSlug)
    out.push(next)
  }
  const changed = out.length !== list.length || out.some((t, i) => t !== list[i])
  return { list: out, changed }
}

/** A short description of a rename / merge for messages ("Rename “ML” to “Machine learning”"). */
export function tagChangeLabel(fromLabels: readonly string[], to: string): string {
  if (fromLabels.length <= 1) return `Rename “${fromLabels[0] ?? ''}” to “${to.trim()}”`
  return `Merge ${fromLabels.map((l) => `“${l}”`).join(', ')} into “${to.trim()}”`
}
