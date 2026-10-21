/**
 * Pure helpers that shape the public CV and the content index into home /
 * about page data. Runs on server and client; unit-tested.
 *
 *   - matchCaseStudy: link a CV project (or role) to its /work/<slug> case study
 *   - latestWriting:  the newest posts + case studies for "Writing & case studies"
 *   - skillGroups:    the CV's own Skills section as chip groups
 *
 * Case-study matching: an owner-chosen slug (the CV project's `caseStudy`
 * field) wins when it names a case study that exists. Otherwise matching is
 * deliberately strict (exact equality of normalised keys, never substring /
 * fuzzy) so a project is only linked to a case study that is really about
 * it. Keys derived from a title:
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

import { isoDate } from '../../lib/postDate'
import { caseStudySlug } from '../../lib/cvVisibilityRead'
import { bullets, field, list } from '../CVViewerPage/fields'

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

/** What a CV entry offers for matching: its title, and optionally the owner's chosen slug. */
export type CaseStudyRef = { title?: unknown; caseStudy?: unknown }

/** The slug part of an owner-entered case-study reference (lib/cvVisibilityRead, React-free for the public projection). */
export { caseStudySlug }

/**
 * The case study a CV entry refers to, or null. `project` is either a title
 * string or `{title, caseStudy}`: an owner-chosen `caseStudy` slug that names
 * an existing case study wins; an unknown slug is ignored and the strict
 * title match applies.
 */
export function matchCaseStudy<T extends WorkIndexItem>(project: unknown, works: readonly T[] | null | undefined): T | null {
  if (!Array.isArray(works) || !works.length) return null
  const ref: CaseStudyRef = project && typeof project === 'object' ? (project as CaseStudyRef) : { title: project }
  const chosen = caseStudySlug(ref.caseStudy)
  if (chosen) {
    const hit = works.find((w) => w.slug === chosen)
    if (hit) return hit
  }
  const mine = new Set(titleKeys(ref.title))
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

// ── Writing & case studies ───────────────────────────────────────────────────

export type WritingItem = {
  kind: 'post' | 'work'
  title: string
  href: string
  /** YYYY-MM-DD: a post's publication date, a case study's last update; '' when unknown. */
  date: string
  readingMinutes: number
  /** BCP-47 language of the piece ('en', 'zh-Hans', …). */
  lang: string
  description: string
}

/** The fields of a lib/mdx index entry this needs (posts and case studies alike). */
export type IndexEntryLike = {
  slug: string
  readingMinutes?: number
  lang?: string
  updatedAt?: number | null
  frontmatter?: { title?: unknown; description?: unknown; date?: unknown } | null
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function writingItem(kind: WritingItem['kind'], e: IndexEntryLike): WritingItem | null {
  const slug = text(e?.slug)
  if (!slug) return null
  const fm = e.frontmatter || {}
  return {
    kind,
    title: text(fm.title) || slug,
    href: `/${kind === 'post' ? 'blog' : 'work'}/${slug}`,
    date: kind === 'post' ? isoDate(fm.date) : isoDate(e.updatedAt ?? ''),
    readingMinutes: typeof e.readingMinutes === 'number' && e.readingMinutes > 0 ? Math.round(e.readingMinutes) : 0,
    lang: text(e.lang) || 'en',
    description: text(fm.description),
  }
}

/**
 * The newest `limit` posts and case studies combined, newest first. Posts
 * are dated by their publication date, case studies (which have none) by
 * their last update; undated items come last, posts before case studies on
 * a tie.
 */
export function latestWriting(
  posts: readonly IndexEntryLike[] | null | undefined,
  works: readonly IndexEntryLike[] | null | undefined,
  limit = 3,
): WritingItem[] {
  const all = [
    ...(Array.isArray(posts) ? posts : []).map((p) => writingItem('post', p)),
    ...(Array.isArray(works) ? works : []).map((w) => writingItem('work', w)),
  ].filter((x): x is WritingItem => x !== null)
  return all
    .map((item, order) => ({ item, order }))
    .sort((a, b) => {
      if (a.item.date !== b.item.date) {
        if (!a.item.date) return 1
        if (!b.item.date) return -1
        return a.item.date < b.item.date ? 1 : -1
      }
      return a.order - b.order
    })
    .slice(0, Math.max(0, limit))
    .map(({ item }) => item)
}

// ── Skills (CV) ──────────────────────────────────────────────────────────────

export type Skill = {
  name: string
  /** A short proficiency word shown after the name ("Proficient"). */
  level?: string
  /** A longer proficiency note shown as a tooltip, never inline. */
  note?: string
}
export type SkillGroup = { label: string; items: Skill[] }

/** Levels up to this many words / characters read as a suffix; longer ones become a note. */
const SHORT_LEVEL_WORDS = 3
const SHORT_LEVEL_CHARS = 24

/** Split a CV proficiency string into an inline suffix or a tooltip note. */
export function skillLevel(level: unknown): Pick<Skill, 'level' | 'note'> {
  const raw = text(level)
  if (!raw) return {}
  const words = raw.split(/\s+/).length
  if (words <= SHORT_LEVEL_WORDS && raw.length <= SHORT_LEVEL_CHARS) return { level: raw.replace(/[.。]+$/, '') }
  return { note: raw }
}

/**
 * The CV's own Skills section as chip groups: the core-skills list (skill +
 * proficiency) as "Core skills" (`labels`: the page's words), then every
 * technical group with its own title. Hidden entries / items are already gone from the website-pruned
 * section; blank names are skipped and repeats within a group are dropped.
 */
export function skillGroups(section: unknown, labels: { core: string; fallback: string } = { core: 'Core skills', fallback: 'Skills' }): SkillGroup[] {
  if (!section || typeof section !== 'object') return []
  const groups: SkillGroup[] = []
  const dedupe = (items: Skill[]) => {
    const seen = new Set<string>()
    return items.filter((s) => {
      const k = s.name.toLowerCase()
      if (!s.name || seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  const core = dedupe(list(section, 'languages').map((it) => ({ name: field(it, 'language'), ...skillLevel(field(it, 'level')) })))
  if (core.length) groups.push({ label: labels.core, items: core })

  for (const g of list(section, 'technical')) {
    const items = dedupe(bullets(g, 'description').map((name) => ({ name: name.trim() })))
    const label = field(g, 'name')
    if (items.length) groups.push({ label: label || labels.fallback, items })
  }
  return groups
}
