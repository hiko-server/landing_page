import { safeHref } from './cvFormat'

/**
 * Case-study "At a glance" fields (frontmatter of work/<slug>), shared by the
 * public pages (lib/mdx workEntry cleans them), the admin form
 * (components/Admin/shell/itemFrontmatter.ts) and the publish checklist.
 * Pure and client-safe.
 *
 *   summary    one-line outcome, shown under the title (≤ SUMMARY_MAX)
 *   outcomes   up to OUTCOMES_MAX metrics the owner typed — value, unit,
 *              label and where the number comes from. Never extracted from
 *              the body: a number appears only because the owner entered it.
 *   team       "Solo", "Team of 4", …
 *   published  publication date of the case study (YYYY-MM-DD)
 *   links      up to LINKS_MAX extra links (demo video, paper, slides)
 *   coverFocus focal point of the cover ("x% y%"), used as object-position
 *              wherever the cover is cropped
 *
 * Anything malformed is dropped rather than shown half-valid.
 */

export type WorkOutcome = {
  /** The number as written: "93.59", "61", "3.3", "2×". */
  value: string
  /** Shown right after the value: "%", "ms", "s", "kB". */
  unit?: string
  /** What was measured: "Offline classifier accuracy". */
  label: string
  /** Where the number comes from: "120-cycle labelled run". */
  source?: string
  /** Optional evidence link: https://…, a same-site path or a #section of the case study. */
  sourceUrl?: string
}

export type WorkLink = { label: string; url: string }

/** A cover narrower than this is drawn at its own size on a panel, never stretched (D2). */
export const COVER_SHARP_MIN = 960
/** Covers at least this wide stay sharp on large and high-density screens. */
export const COVER_RECOMMENDED_MIN = 1600

export const SUMMARY_MAX = 200
export const OUTCOMES_MAX = 4
export const LINKS_MAX = 4
export const OUTCOME_LIMITS = { value: 16, unit: 12, label: 80, source: 120 } as const
export const LINK_LABEL_MAX = 40
export const TEAM_MAX = 60

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '')

/** An evidence / extra link that may be rendered: http(s), a same-site path or an in-page #anchor; '' otherwise. */
export function safeCaseStudyUrl(v: unknown): string {
  const raw = typeof v === 'string' ? v.trim() : ''
  if (/^#[A-Za-z0-9_:.-]{1,80}$/.test(raw)) return raw
  const href = safeHref(raw)
  return /^(https?:\/\/|\/(?!\/))/i.test(href) ? href : ''
}

/** The metrics worth showing, in the owner's order: value and label required, at most OUTCOMES_MAX. */
export function cleanOutcomes(raw: unknown): WorkOutcome[] {
  if (!Array.isArray(raw)) return []
  const out: WorkOutcome[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const value = text(o.value, OUTCOME_LIMITS.value)
    const label = text(o.label, OUTCOME_LIMITS.label)
    if (!value || !label) continue
    const unit = text(o.unit, OUTCOME_LIMITS.unit)
    const source = text(o.source, OUTCOME_LIMITS.source)
    const sourceUrl = safeCaseStudyUrl(o.sourceUrl)
    out.push({ value, label, ...(unit ? { unit } : {}), ...(source ? { source } : {}), ...(sourceUrl ? { sourceUrl } : {}) })
    if (out.length >= OUTCOMES_MAX) break
  }
  return out
}

/** Extra links with a label and a safe URL, at most LINKS_MAX. */
export function cleanLinks(raw: unknown): WorkLink[] {
  if (!Array.isArray(raw)) return []
  const out: WorkLink[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const l = item as Record<string, unknown>
    const label = text(l.label, LINK_LABEL_MAX)
    const url = safeCaseStudyUrl(l.url)
    if (!label || !url || url.startsWith('#')) continue
    out.push({ label, url })
    if (out.length >= LINKS_MAX) break
  }
  return out
}

/** A real calendar date as YYYY-MM-DD (a longer ISO timestamp keeps its day); '' otherwise. */
export function cleanDate(raw: unknown): string {
  const s = raw instanceof Date ? raw.toISOString() : typeof raw === 'string' ? raw.trim() : ''
  const m = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(s)
  if (!m) return ''
  const d = new Date(`${m[1]}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === m[1] ? m[1] : ''
}

/** A focal point "x% y%" with both values 0–100 (rounded to one decimal); '' otherwise. */
export function cleanFocus(raw: unknown): string {
  const m = /^\s*(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%\s*$/.exec(typeof raw === 'string' ? raw : '')
  if (!m) return ''
  const x = Number(m[1])
  const y = Number(m[2])
  if (x > 100 || y > 100) return ''
  const r = (n: number) => String(Math.round(n * 10) / 10)
  return `${r(x)}% ${r(y)}%`
}

/** The focal point as numbers (50/50 when unset). */
export function focusPoint(raw: unknown): { x: number; y: number } {
  const clean = cleanFocus(raw)
  if (!clean) return { x: 50, y: 50 }
  const [x, y] = clean.split(/\s+/).map((v) => Number(v.replace('%', '')))
  return { x, y }
}

export type GlanceFields = {
  summary?: string
  outcomes?: WorkOutcome[]
  team?: string
  published?: string
  links?: WorkLink[]
  coverFocus?: string
}

/**
 * The frontmatter with its "At a glance" fields cleaned: each one present
 * only when it holds something valid (the public strip renders nothing for
 * a case study that does not fill them).
 */
export function cleanGlanceFields<T extends Record<string, unknown>>(fm: T): T & GlanceFields {
  const out: Record<string, unknown> = { ...fm }
  const summary = text(fm.summary, SUMMARY_MAX)
  const outcomes = cleanOutcomes(fm.outcomes)
  const team = text(fm.team, TEAM_MAX)
  const published = cleanDate(fm.published)
  const links = cleanLinks(fm.links)
  const coverFocus = cleanFocus(fm.coverFocus)
  const set = (key: keyof GlanceFields, value: unknown, keep: boolean) => {
    if (keep) out[key] = value
    else delete out[key]
  }
  set('summary', summary, !!summary)
  set('outcomes', outcomes, outcomes.length > 0)
  set('team', team, !!team)
  set('published', published, !!published)
  set('links', links, links.length > 0)
  set('coverFocus', coverFocus, !!coverFocus)
  return out as T & GlanceFields
}

/** "93.59%" / "61 ms": value and unit as they read (no space before %, ×, ° and similar). */
export function outcomeText(o: Pick<WorkOutcome, 'value' | 'unit'>): string {
  if (!o.unit) return o.value
  return /^[%×x°′″+]/.test(o.unit) ? `${o.value}${o.unit}` : `${o.value} ${o.unit}`
}

/** The headline metric of a case study for cards: "93.59% offline classifier accuracy"; '' when none. */
export function primaryOutcome(outcomes: unknown): string {
  const [first] = cleanOutcomes(outcomes)
  if (!first) return ''
  const label = first.label.charAt(0).toLowerCase() + first.label.slice(1)
  // Keep acronyms ("CPU load") and CJK labels as written.
  const shown = /^[A-Z]{2}/.test(first.label) || /[㐀-鿿]/.test(first.label) ? first.label : label
  return `${outcomeText(first)} ${shown}`
}

/**
 * The short name a typographic cover shows: an acronym in parentheses
 * ("Smart Waste Classification System (SWCS)" → "SWCS"), else the title up
 * to a colon or dash, else the title — at most 28 characters on a word
 * boundary.
 */
export function coverWordmark(title: unknown): string {
  const t = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : ''
  if (!t) return ''
  const acronym = /\(([A-Z0-9][A-Z0-9&.+-]{1,11})\)\s*$/.exec(t)
  if (acronym) return acronym[1]
  const head = t.split(/\s+[–—-]\s+|[:：]\s*/)[0].trim() || t
  if (Array.from(head).length <= 28) return head
  const cut = Array.from(head).slice(0, 28).join('')
  const space = cut.lastIndexOf(' ')
  return `${(space > 12 ? cut.slice(0, space) : cut).trim()}…`
}
