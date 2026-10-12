/**
 * Link CV projects to their /work/<slug> case study.
 *
 * Pure. Matching is deliberately strict (exact equality of normalised keys,
 * never substring / fuzzy) so a project is only linked to a case study that
 * is really about it. Keys derived from a title:
 *
 *   "Project RAKU: AI Assistant Job Search System"
 *     → "raku ai assistant job search system"   (whole title, "Project" dropped)
 *     → "raku"                                  (name before the colon)
 *     → "ai assistant job search system"        (text after the colon)
 *   "WeGreen AI (wegreen.ltd)"
 *     → "wegreen ai wegreen ltd", "wegreen ai", "wegreen ltd"
 *
 * A case study contributes its slug ("project-carboy" → "project carboy",
 * "carboy") and the same keys from its title. Keys shorter than 3 characters
 * are ignored so "AI" or "UI" can never link two unrelated things.
 */

export type WorkIndexItem = {
  slug: string
  title: string
  description?: string
  tech?: string[]
  status?: string
  period?: string
}

const MIN_KEY = 3

export function normalise(s: unknown): string {
  if (typeof s !== 'string') return ''
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

const dropProjectWord = (s: string) => s.replace(/^project\s+/, '')

export function titleKeys(title: unknown): string[] {
  if (typeof title !== 'string' || !title.trim()) return []
  const raw = title.trim()
  const keys = new Set<string>()
  const add = (s: string) => {
    const k = dropProjectWord(normalise(s))
    if (k.length >= MIN_KEY) keys.add(k)
  }
  add(raw)
  const withoutParens = raw.replace(/\([^)]*\)/g, ' ')
  add(withoutParens)
  for (const m of Array.from(raw.matchAll(/\(([^)]*)\)/g))) add(m[1])
  const colon = withoutParens.search(/[:：]/)
  if (colon > 0) {
    add(withoutParens.slice(0, colon))
    add(withoutParens.slice(colon + 1))
  }
  return Array.from(keys)
}

function workKeys(w: WorkIndexItem): string[] {
  const keys = new Set(titleKeys(w.title))
  const slug = normalise(String(w.slug || '').replace(/[-_]+/g, ' '))
  if (slug.length >= MIN_KEY) keys.add(slug)
  const bare = dropProjectWord(slug)
  if (bare.length >= MIN_KEY) keys.add(bare)
  return Array.from(keys)
}

/** The case study a CV project title refers to, or null. */
export function matchCaseStudy<T extends WorkIndexItem>(title: unknown, works: readonly T[] | null | undefined): T | null {
  if (!Array.isArray(works) || !works.length) return null
  const mine = new Set(titleKeys(title))
  if (!mine.size) return null
  for (const w of works) {
    if (workKeys(w).some((k) => mine.has(k))) return w
  }
  return null
}

/** Trimmed, de-duplicated, non-empty strings (tech chips). */
export function chipList(list: unknown, max = 6): string[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of list) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    const k = t.toLowerCase()
    if (!t || seen.has(k)) continue
    seen.add(k)
    out.push(t)
    if (out.length >= max) break
  }
  return out
}
