/**
 * Shareable tag filters for /blog (post tags) and /work (case-study stack +
 * archive stack) — D8. Pure and client-safe.
 *
 * The filter lives in the URL as `?tag=<slug>` (`edge-ai`, `计算机视觉`),
 * so a filtered list can be shared and the browser's Back button undoes it.
 * Both pages are statically generated, so the server HTML always lists
 * everything; TAG_PREPAINT_SCRIPT (an inline script placed before the list)
 * hides the items that do not match before the first paint, and React takes
 * over after hydration — a shared link shows the filtered list with no
 * layout shift. An unknown tag shows everything.
 */

export type TagCount = { tag: string; slug: string; count: number }

/** URL slug of a tag: NFKC, lower case, every run of non-letters/digits → "-". */
export function tagSlug(tag: string): string {
  return String(tag ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/** Distinct tags (by slug) with how many items carry each, alphabetical; the first spelling wins. */
export function tagCounts(lists: ReadonlyArray<ReadonlyArray<string> | undefined | null>): TagCount[] {
  const bySlug = new Map<string, TagCount>()
  for (const list of lists) {
    const seen = new Set<string>()
    for (const raw of list || []) {
      const tag = typeof raw === 'string' ? raw.trim() : ''
      const slug = tagSlug(tag)
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      const hit = bySlug.get(slug)
      if (hit) hit.count++
      else bySlug.set(slug, { tag, slug, count: 1 })
    }
  }
  return Array.from(bySlug.values()).sort((a, b) => a.tag.localeCompare(b.tag, 'en'))
}

/** The known tag a `?tag=` value names (by slug or by the tag itself), or null. */
export function resolveTagParam(param: unknown, tags: readonly TagCount[]): TagCount | null {
  const raw = Array.isArray(param) ? param[0] : param
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 120) return null
  const slug = tagSlug(raw)
  return tags.find((t) => t.slug === slug) || null
}

/** Space-separated slugs of an item's tags, for `data-tag-slugs` (matched with `~=`). */
export function tagSlugList(tags: ReadonlyArray<string> | undefined | null): string {
  return Array.from(new Set((tags || []).map(tagSlug).filter(Boolean))).join(' ')
}

/** True when an item carries the tag (by slug). */
export function hasTag(tags: ReadonlyArray<string> | undefined | null, slug: string): boolean {
  return (tags || []).some((t) => tagSlug(t) === slug)
}

/** The filtered list's URL. */
export function tagHref(base: '/blog' | '/work', tag: string): string {
  const slug = tagSlug(tag)
  return slug ? `${base}?tag=${encodeURIComponent(slug)}` : base
}

/** id of the style element the prepaint script adds (removed once React has taken over). */
export const TAG_PREPAINT_STYLE_ID = 'tag-filter-prepaint'

/**
 * Inline script (no dependencies, runs before the list is parsed): when the
 * URL's `?tag=` names one of the known slugs in its `data-tags` attribute,
 * hide every `[data-tag-item]` that does not carry it. Same slug rule as
 * tagSlug(). Failures leave the full list.
 */
export const TAG_PREPAINT_SCRIPT =
  '(function(){try{var s=document.currentScript;var p=new URLSearchParams(location.search).get("tag");if(!s||!p)return;' +
  'var k=JSON.parse(s.getAttribute("data-tags")||"[]");' +
  'var g=p.normalize("NFKC").trim().toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu,"-").replace(/^-+|-+$/g,"");' +
  'if(!g||k.indexOf(g)===-1)return;var e=document.createElement("style");e.id="' +
  TAG_PREPAINT_STYLE_ID +
  '";e.textContent="[data-tag-item]:not([data-tag-slugs~=\\""+g+"\\"]){display:none!important}";document.head.appendChild(e)}catch(_){}})()'
