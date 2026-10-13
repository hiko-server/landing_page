/**
 * The read side of the home document: which sections show, in which order,
 * and which highlights are complete. Pure and tiny on purpose — the public
 * home page imports THIS module, not lib/homeShape, so the write-time
 * validation the admin needs (normalizeHomeWrite and friends) stays out of
 * the visitor's bundle. lib/homeShape re-exports everything here, so
 * server code and the admin can keep importing from there.
 */

import type { HomeData, HomeHighlight, SectionKey } from './homeShape'

/** Limits of the proof strip (part of HOME_LIMITS in lib/homeShape). */
export const HIGHLIGHT_LIMITS = {
  highlightsMax: 4,
  highlightValueMax: 60,
  highlightLabelMax: 120,
  highlightHrefMax: 300,
} as const

/** Tiny render-time helper. Omitted/undefined → visible. Explicit false → hidden. */
export function isSectionVisible(data: HomeData | null | undefined, key: SectionKey): boolean {
  const v = data?.sections?.[key]
  return v !== false
}

/** Sections that sit above the numbered list, always in this order. */
export const FIXED_SECTION_KEYS = ['introduction', 'highlights', 'brands'] as const

/** The numbered home sections ([02]…), which the owner can reorder. */
export type SortableSectionKey = Exclude<SectionKey, (typeof FIXED_SECTION_KEYS)[number]>

/** The built-in order of the numbered sections. */
export const DEFAULT_SECTION_ORDER: readonly SortableSectionKey[] = [
  'open-source',
  'tech-stack',
  'activity',
  'projects',
  'writing',
  'experience',
  'certifications',
  'photos',
  'contact',
]

/**
 * "Recruiter-first": the evidence a hiring manager scans for (projects,
 * experience, writing, skills) before the GitHub activity.
 */
export const RECRUITER_SECTION_ORDER: readonly SortableSectionKey[] = [
  'projects',
  'experience',
  'writing',
  'tech-stack',
  'certifications',
  'open-source',
  'activity',
  'photos',
  'contact',
]

const SORTABLE = new Set<string>(DEFAULT_SECTION_ORDER)

export function isSortableSectionKey(value: unknown): value is SortableSectionKey {
  return typeof value === 'string' && SORTABLE.has(value)
}

/**
 * A complete order from whatever is stored: unknown and repeated keys are
 * dropped, and every section missing from it is inserted at its default
 * place (right after the nearest section that precedes it in
 * DEFAULT_SECTION_ORDER), so a document written before a section existed
 * still shows that section.
 */
export function resolveSectionOrder(raw: unknown): SortableSectionKey[] {
  const out: SortableSectionKey[] = []
  for (const k of Array.isArray(raw) ? raw : []) if (isSortableSectionKey(k) && !out.includes(k)) out.push(k)
  DEFAULT_SECTION_ORDER.forEach((key, i) => {
    if (out.includes(key)) return
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.indexOf(DEFAULT_SECTION_ORDER[j])
      if (idx >= 0) {
        at = idx + 1
        break
      }
    }
    out.splice(at, 0, key)
  })
  return out
}

/** True when `order` is exactly `preset`. */
export function isSameOrder(order: readonly string[], preset: readonly string[]): boolean {
  return order.length === preset.length && order.every((k, i) => k === preset[i])
}

/** An absolute https:// URL with a host and no embedded credentials. */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || /\s/.test(value.trim())) return false
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password
  } catch {
    return false
  }
}

/** A link a highlight may point to: a site path (not protocol-relative) or a full https:// URL. */
export function isHighlightHref(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v || v.length > HIGHLIGHT_LIMITS.highlightHrefMax || /\s/.test(v)) return false
  if (v.startsWith('/')) return !v.startsWith('//') && !v.startsWith('/\\')
  return isHttpsUrl(v)
}

/**
 * The highlights visitors may see: complete tiles only (headline,
 * description and a valid link), at most HIGHLIGHT_LIMITS.highlightsMax,
 * trimmed. A malformed stored entry is skipped rather than shown broken.
 */
export function visibleHighlights(raw: unknown): HomeHighlight[] {
  if (!Array.isArray(raw)) return []
  const out: HomeHighlight[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const h = item as Record<string, unknown>
    const value = typeof h.value === 'string' ? h.value.trim() : ''
    const label = typeof h.label === 'string' ? h.label.trim() : ''
    const href = typeof h.href === 'string' ? h.href.trim() : ''
    if (!value || !label || !isHighlightHref(href)) continue
    out.push({ value, label, href })
    if (out.length >= HIGHLIGHT_LIMITS.highlightsMax) break
  }
  return out
}
