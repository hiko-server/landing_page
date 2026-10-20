/**
 * CV visibility model — one place that decides what is public.
 *
 * Pure / dependency-free so it runs identically in API routes,
 * getServerSideProps and the admin Studio preview.
 *
 * Three levels, all optional and backwards compatible with existing data:
 *
 *   Section (top-level array element)
 *     isVisible?: boolean        false → section left out of the A4 CV / PDF
 *     showOnWebsite?: boolean    false → section left out of /about + home
 *     hiddenFields?: string[]    section-level fields to hide (e.g. personal
 *                                info `phoneNumber`, skill group `technical`)
 *
 *   Entry (any object inside an array — a degree, job, project, bullet, cert…)
 *     isVisible?: boolean        false → entry hidden everywhere
 *     hiddenFields?: string[]    entry fields to hide (e.g. education `gpa`)
 *
 *   String bullet (an element of a string[] field)
 *     parent.hiddenItems?: { [field]: number[] }  indices hidden everywhere
 *
 * Hidden fields and entries are *removed from public payloads* (not just
 * visually suppressed), so a hidden phone number or GPA never reaches the
 * page HTML, the __NEXT_DATA__ blob or the public JSON API.
 *
 * Redaction marker: a hidden field is blanked type-preservingly (so renderers
 * never crash on a missing string/array) AND its *name* is listed in the
 * node's `redacted` array. Renderers must use isRedacted() to tell "the owner
 * hid this" apart from "this is genuinely empty" — e.g. a hidden end date
 * must not turn a past job into the current one, and a hidden expiry date
 * must not print "No Expiry". Only key names are exposed, never values.
 */

export type CvSectionLike = { sessionName?: string; [k: string]: any }
export type CvDoc = { en: CvSectionLike[]; zh: CvSectionLike[] }
export type CvLang = 'en' | 'zh'

/** Keys that carry visibility metadata rather than content. */
export const VISIBILITY_KEYS = ['isVisible', 'showOnWebsite', 'hiddenFields', 'hiddenItems'] as const

/** Key added by pruning to public nodes; lists the names of hidden fields. */
export const REDACTED_KEY = 'redacted' as const

/**
 * Editor-only bookkeeping that never reaches a public view: dismissed
 * readiness checks (CV Studio, lib/cvReadiness.ts).
 */
export const EDITOR_META_KEYS = ['readinessDismissed'] as const

/**
 * Publication rules that hold whatever the visibility switches say:
 *
 *   - private fields: owner-only values removed from every public view
 *     (the PDF photo and its switch — the server-side PDF reads them from
 *     the full document through lib/cvLocale pdfPhoto);
 *   - consent lists: entries of a list are public only when their consent
 *     flag is exactly `true` (recommendations need the person's
 *     permission); the flag itself is dropped from the output.
 */
export const PRIVATE_SECTION_FIELDS: Readonly<Record<string, readonly string[]>> = {
  personalInformation: ['photo', 'photoOnPdf'],
}
export const CONSENT_LISTS: Readonly<Record<string, { list: string; flag: string }>> = {
  recommendations: { list: 'items', flag: 'permission' },
}

/**
 * String lists whose ORDER carries meaning: a hidden item is replaced by
 * HIDDEN_ITEM_MARK instead of being removed, so the visible items keep their
 * real positions. Publication authors: hiding a co-author must never make
 * the owner look like the first author ("Smith, J., …, Li, Y."). The mark is
 * the only trace of the hidden value — never the value itself.
 */
export const POSITIONAL_ITEM_FIELDS: readonly string[] = ['authors']

/** Paper fields no view shows while a manuscript is under review (lib/publications/citation showsVenue). */
export const UNDER_REVIEW_WITHHELD: readonly string[] = ['venue', 'volume', 'issue', 'pages', 'publisher']
export const HIDDEN_ITEM_MARK = '…'

/**
 * True when `field` was hidden by the owner and blanked during pruning.
 * Works on public (pruned) nodes; on full editor documents it falls back to
 * the hiddenFields metadata, so the Studio preview behaves the same way.
 */
export function isRedacted(node: any, field: string): boolean {
  if (Array.isArray(node?.[REDACTED_KEY]) && node[REDACTED_KEY].includes(field)) return true
  return Array.isArray(node?.hiddenFields) && node.hiddenFields.includes(field)
}

const isPlainObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** Empty value of the same type, so renderers that expect a string/array keep working. */
function blankOf(v: unknown): unknown {
  if (typeof v === 'string') return ''
  if (Array.isArray(v)) return []
  if (isPlainObject(v)) return {}
  return undefined
}

export function isFieldHidden(node: any, field: string): boolean {
  return Array.isArray(node?.hiddenFields) && node.hiddenFields.includes(field)
}

export function isEntryHidden(node: any): boolean {
  return isPlainObject(node) && node.isVisible === false
}

export function hiddenIndices(node: any, field: string): number[] {
  const list = node?.hiddenItems?.[field]
  return Array.isArray(list) ? list.filter((n: unknown) => Number.isInteger(n)) : []
}

export function isItemHidden(node: any, field: string, index: number): boolean {
  return hiddenIndices(node, field).includes(index)
}

/** A section is on the A4 CV unless explicitly switched off. */
export function isSectionOnCv(section: any): boolean {
  return section?.isVisible !== false
}

/** A section is on the website unless explicitly switched off (independent of the CV switch). */
export function isSectionOnWebsite(section: any): boolean {
  return section?.showOnWebsite !== false
}

/**
 * Recursively strip hidden content from an entry/section body.
 * Visibility metadata is removed from the output; hidden fields are blanked
 * (type-preserving) so callers never crash on a missing string/array.
 */
function pruneNode(node: any): any {
  if (Array.isArray(node)) {
    return node.filter((item) => !isEntryHidden(item)).map(pruneNode)
  }
  if (!isPlainObject(node)) return node

  const hidden = new Set<string>(Array.isArray(node.hiddenFields) ? node.hiddenFields : [])
  const out: Record<string, any> = {}
  const redacted: string[] = []
  for (const [key, value] of Object.entries(node)) {
    if ((VISIBILITY_KEYS as readonly string[]).includes(key) || key === REDACTED_KEY) continue
    if ((EDITOR_META_KEYS as readonly string[]).includes(key)) continue
    if (hidden.has(key)) {
      out[key] = blankOf(value)
      redacted.push(key)
      continue
    }
    if (Array.isArray(value)) {
      const skip = new Set(hiddenIndices(node, key))
      const kept = !skip.size
        ? value
        : POSITIONAL_ITEM_FIELDS.includes(key)
          ? value.map((v, i) => (skip.has(i) ? HIDDEN_ITEM_MARK : v))
          : value.filter((_, i) => !skip.has(i))
      out[key] = pruneNode(kept)
      continue
    }
    out[key] = pruneNode(value)
  }
  // A field hidden before it ever had a value (no key stored yet) is still
  // "hidden", not "empty": renderers that fill an empty field from another
  // public source (e.g. GitHub from Home → Socials, lib/cvLinks) must not.
  for (const name of hidden) {
    if (typeof name === 'string' && !(name in node) && !(VISIBILITY_KEYS as readonly string[]).includes(name)) redacted.push(name)
  }
  if (redacted.length) out[REDACTED_KEY] = redacted
  return out
}

/** Prune one section's body while keeping its section-level switches for the renderer. */
function pruneSection(section: CvSectionLike): CvSectionLike {
  const name = String(section.sessionName || '')
  const consent = CONSENT_LISTS[name]
  // An entry without consent is treated as hidden (positions stay intact, so
  // hiddenItems indices keep pointing at the right entries).
  const source =
    consent && Array.isArray(section[consent.list])
      ? {
          ...section,
          [consent.list]: section[consent.list].map((e: unknown) =>
            isPlainObject(e) && e[consent.flag] === true ? e : { ...(isPlainObject(e) ? e : {}), isVisible: false },
          ),
        }
      : section
  const body = pruneNode(source)
  // A manuscript under review is cited without where it was submitted (APA 7;
  // lib/publications showsVenue): since no view renders those fields, the
  // public data never carries them either.
  if (name === 'publications' && Array.isArray(body.papers)) {
    body.papers = body.papers.map((paper: unknown) => {
      if (!isPlainObject(paper) || paper.status !== 'under-review') return paper
      const rest = { ...paper }
      for (const key of UNDER_REVIEW_WITHHELD) delete rest[key]
      return rest
    })
  }
  for (const key of PRIVATE_SECTION_FIELDS[name] || []) {
    delete body[key]
    if (Array.isArray(body[REDACTED_KEY])) {
      body[REDACTED_KEY] = body[REDACTED_KEY].filter((k: string) => k !== key)
      if (!body[REDACTED_KEY].length) delete body[REDACTED_KEY]
    }
  }
  if (consent && Array.isArray(body[consent.list])) {
    body[consent.list] = body[consent.list].map((e: unknown) => {
      if (!isPlainObject(e)) return e
      const rest = { ...e }
      delete rest[consent.flag]
      return rest
    })
  }
  if (section.isVisible === false) body.isVisible = false
  if (section.showOnWebsite === false) body.showOnWebsite = false
  return body
}

export type CvAudience = 'cv' | 'website' | 'any'

/**
 * Public view of one language's sections.
 *   'cv'      → only sections on the A4 CV
 *   'website' → only sections shown on the website
 *   'any'     → sections shown in at least one place (used by the public API)
 */
export function publicSections(sections: unknown, audience: CvAudience = 'any'): CvSectionLike[] {
  if (!Array.isArray(sections)) return []
  return sections
    .filter((s): s is CvSectionLike => isPlainObject(s))
    .filter((s) => {
      if (audience === 'cv') return isSectionOnCv(s)
      if (audience === 'website') return isSectionOnWebsite(s)
      return isSectionOnCv(s) || isSectionOnWebsite(s)
    })
    .map(pruneSection)
}

export function publicCvDoc(doc: { en?: unknown; zh?: unknown }, audience: CvAudience = 'any'): CvDoc {
  return {
    en: publicSections(doc?.en, audience),
    zh: publicSections(doc?.zh, audience),
  }
}

// ── Editor-side helpers (immutable updates) ──────────────────────────────

/** Path into a language's sections: [sectionIndex, key, index, key, …]. */
export type CvPath = Array<string | number>

export function getAt(root: any, path: CvPath): any {
  let cur = root
  for (const seg of path) {
    if (cur == null) return undefined
    cur = cur[seg as any]
  }
  return cur
}

/** Immutable set: returns a new root with `value` at `path` (creating containers as needed). */
export function setAt<T>(root: T, path: CvPath, value: any): T {
  if (path.length === 0) return value
  const [head, ...rest] = path
  const base: any = Array.isArray(root) ? [...(root as any)] : { ...(root as any) }
  base[head as any] = setAt(base[head as any] ?? (typeof rest[0] === 'number' ? [] : {}), rest, value)
  return base
}

/** Toggle `field` in the object's hiddenFields. */
export function withFieldHidden<T extends Record<string, any>>(node: T, field: string, hidden: boolean): T {
  const cur: string[] = Array.isArray(node.hiddenFields) ? node.hiddenFields : []
  const next = hidden ? Array.from(new Set([...cur, field])) : cur.filter((f) => f !== field)
  const out: any = { ...node, hiddenFields: next }
  if (next.length === 0) delete out.hiddenFields
  return out
}

/** Toggle a string bullet's hidden state. */
export function withItemHidden<T extends Record<string, any>>(node: T, field: string, index: number, hidden: boolean): T {
  const cur = hiddenIndices(node, field)
  const nextList = hidden ? Array.from(new Set([...cur, index])).sort((a, b) => a - b) : cur.filter((i) => i !== index)
  const items = { ...(node.hiddenItems || {}) }
  if (nextList.length) items[field] = nextList
  else delete items[field]
  const out: any = { ...node, hiddenItems: items }
  if (Object.keys(items).length === 0) delete out.hiddenItems
  return out
}

/**
 * Re-map hidden bullet indices after the string list at `field` changed shape.
 * `mapping[oldIndex] = newIndex | -1 (removed)`.
 */
export function remapHiddenItems<T extends Record<string, any>>(node: T, field: string, mapping: number[]): T {
  const cur = hiddenIndices(node, field)
  if (!cur.length) return node
  const next = cur
    .map((i) => (i < mapping.length ? mapping[i] : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
  const items = { ...(node.hiddenItems || {}) }
  if (next.length) items[field] = next
  else delete items[field]
  const out: any = { ...node, hiddenItems: items }
  if (Object.keys(items).length === 0) delete out.hiddenItems
  return out
}

/** Count everything hidden inside a section (for sidebar badges). */
export function countHidden(node: any): number {
  if (Array.isArray(node)) return node.reduce((n, x) => n + countHidden(x), 0)
  if (!isPlainObject(node)) return 0
  let n = 0
  if (Array.isArray(node.hiddenFields)) n += node.hiddenFields.length
  if (isPlainObject(node.hiddenItems)) {
    for (const list of Object.values(node.hiddenItems)) if (Array.isArray(list)) n += list.length
  }
  for (const [k, v] of Object.entries(node)) {
    if ((VISIBILITY_KEYS as readonly string[]).includes(k)) continue
    if (Array.isArray(v)) n += v.reduce((acc: number, x: any) => acc + (isEntryHidden(x) ? 1 : 0) + countHidden(x), 0)
    else if (isPlainObject(v)) n += countHidden(v)
  }
  return n
}

function revealNode(node: any, isRoot: boolean): any {
  if (Array.isArray(node)) return node.map((x) => revealNode(x, false))
  if (!isPlainObject(node)) return node
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(node)) {
    if (k === 'hiddenFields' || k === 'hiddenItems') continue
    // Entry switches are reset; the section's own CV / website switches are kept.
    if (!isRoot && k === 'isVisible') continue
    out[k] = revealNode(v, false)
  }
  return out
}

/** Remove every entry/field/bullet hide inside a section (section switches untouched). */
export function revealAll(section: any): any {
  return revealNode(section, true)
}
