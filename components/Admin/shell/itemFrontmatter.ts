import { modelledKeys } from './frontmatterMerge'
import { cleanDate, cleanFocus, LINKS_MAX, OUTCOMES_MAX } from '../../../lib/caseStudy'

/**
 * The frontmatter forms of the admin editors — posts and case studies
 * (pages/admin/blog/edit, pages/admin/work/edit) and the /now and /uses
 * pages (components/Admin/PageEditor): the empty form, the form read from
 * the stored frontmatter (fromServer) and the frontmatter the form writes
 * (toServer — every key it models, undefined for an empty field). The
 * editors keep the keys a form does not model (./frontmatterMerge).
 */

const todayISO = () => new Date().toISOString().slice(0, 10)

const textOf = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

// ── Blog posts ───────────────────────────────────────────────────────────

export type BlogFrontmatter = {
  title: string
  description: string
  date: string
  tags: string[]
  draft: boolean
  cover: string
  /** Slug of the case study the post is about (linked both ways on the site); '' for none. */
  project: string
  /** Search-result title when it should differ from the title (H1); '' = the title. */
  seoTitle: string
  /** BCP-47 language ('' = detected from the text). */
  lang: string
  /** "Mark as updated": the post's dateModified, YYYY-MM-DD ('' = none). */
  updated: string
  /** Description of the cover (shown in the social card's alt text). */
  coverAlt: string
}

export const BLOG_EMPTY: BlogFrontmatter = {
  title: '',
  description: '',
  date: todayISO(),
  tags: [],
  draft: true,
  cover: '',
  project: '',
  seoTitle: '',
  lang: '',
  updated: '',
  coverAlt: '',
}

export const blogFromServer = (f: Record<string, any>): BlogFrontmatter => ({
  title: String(f.title || ''),
  description: String(f.description || ''),
  date: String(f.date || todayISO()).slice(0, 10),
  tags: Array.isArray(f.tags) ? f.tags.map(String) : [],
  draft: Boolean(f.draft),
  cover: String(f.cover || ''),
  project: typeof f.project === 'string' ? f.project : '',
  seoTitle: textOf(f.seoTitle),
  lang: textOf(f.lang),
  updated: cleanDate(f.updated),
  coverAlt: textOf(f.coverAlt),
})

export const blogToServer = (fm: BlogFrontmatter, tags: string[]) => ({
  title: fm.title,
  description: fm.description || undefined,
  date: fm.date,
  tags: tags.length ? tags : undefined,
  draft: fm.draft || undefined,
  cover: fm.cover || undefined,
  project: fm.project.trim() || undefined,
  seoTitle: fm.seoTitle.trim() || undefined,
  lang: fm.lang.trim() || undefined,
  updated: cleanDate(fm.updated) || undefined,
  coverAlt: (fm.cover && fm.coverAlt.trim()) || undefined,
})

// ── Case studies ─────────────────────────────────────────────────────────

export type WorkStatus = 'live' | 'case-study' | 'archived'

export const WORK_STATUSES: WorkStatus[] = ['case-study', 'live', 'archived']

/** One "At a glance" metric row of the form (all text, possibly half filled while editing). */
export type OutcomeForm = { value: string; unit: string; label: string; source: string; sourceUrl: string }
export type LinkForm = { label: string; url: string }

export const OUTCOME_EMPTY: OutcomeForm = { value: '', unit: '', label: '', source: '', sourceUrl: '' }
export const LINK_EMPTY: LinkForm = { label: '', url: '' }

export type WorkFrontmatter = {
  title: string
  description: string
  role: string
  period: string
  tech: string[]
  status: WorkStatus
  featured: boolean
  link: string
  repo: string
  cover: string
  coverAlt: string
  /** Cover focal point "x% y%" ('' = centre). */
  coverFocus: string
  /** Hidden from /work until published; a missing flag means published. */
  draft: boolean
  /** "At a glance" (lib/caseStudy.ts): one-line outcome. */
  summary: string
  team: string
  /** Publication date of the case study, YYYY-MM-DD ('' = none). */
  published: string
  outcomes: OutcomeForm[]
  links: LinkForm[]
  /** Search-result title when it should differ from the title (H1); '' = the title. */
  seoTitle: string
  /** BCP-47 language ('' = detected from the text). */
  lang: string
}

export const WORK_EMPTY: WorkFrontmatter = {
  title: '',
  description: '',
  role: '',
  period: '',
  tech: [],
  status: 'case-study',
  featured: false,
  link: '',
  repo: '',
  cover: '',
  coverAlt: '',
  coverFocus: '',
  draft: true,
  summary: '',
  team: '',
  published: '',
  outcomes: [],
  links: [],
  seoTitle: '',
  lang: '',
}

function outcomesFromServer(raw: unknown): OutcomeForm[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((o) => o && typeof o === 'object')
    .slice(0, OUTCOMES_MAX)
    .map((o: Record<string, unknown>) => ({
      value: textOf(o.value),
      unit: textOf(o.unit),
      label: textOf(o.label),
      source: textOf(o.source),
      sourceUrl: textOf(o.sourceUrl),
    }))
}

function linksFromServer(raw: unknown): LinkForm[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((l) => l && typeof l === 'object')
    .slice(0, LINKS_MAX)
    .map((l: Record<string, unknown>) => ({ label: textOf(l.label), url: textOf(l.url) }))
}

/**
 * Rows the owner has started are kept as typed (trimmed, empty keys left
 * out) — the public page shows only complete ones (lib/caseStudy
 * cleanOutcomes) and the publish checklist points at the rest.
 */
function outcomesToServer(rows: OutcomeForm[]): Array<Record<string, string>> | undefined {
  const out = rows
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)))
    .filter((r) => Object.keys(r).length > 0)
    .slice(0, OUTCOMES_MAX)
  return out.length ? out : undefined
}

function linksToServer(rows: LinkForm[]): Array<Record<string, string>> | undefined {
  const out = rows
    .map((r) => ({ label: r.label.trim(), url: r.url.trim() }))
    .filter((r) => r.label || r.url)
    .slice(0, LINKS_MAX)
  return out.length ? out : undefined
}

export const workFromServer = (f: Record<string, any>): WorkFrontmatter => ({
  title: String(f.title || ''),
  description: String(f.description || ''),
  role: String(f.role || ''),
  period: String(f.period || ''),
  tech: Array.isArray(f.tech) ? f.tech.map(String) : [],
  status: WORK_STATUSES.includes(f.status) ? f.status : 'case-study',
  featured: Boolean(f.featured),
  link: String(f.link || ''),
  repo: String(f.repo || ''),
  cover: String(f.cover || ''),
  coverAlt: String(f.coverAlt || ''),
  coverFocus: cleanFocus(f.coverFocus),
  draft: f.draft === true,
  summary: textOf(f.summary),
  team: textOf(f.team),
  published: cleanDate(f.published),
  outcomes: outcomesFromServer(f.outcomes),
  links: linksFromServer(f.links),
  seoTitle: textOf(f.seoTitle),
  lang: textOf(f.lang),
})

export const workToServer = (fm: WorkFrontmatter, tech: string[]) => ({
  title: fm.title,
  description: fm.description || undefined,
  role: fm.role || undefined,
  period: fm.period || undefined,
  tech: tech.length ? tech : undefined,
  status: fm.status,
  featured: fm.featured || undefined,
  link: fm.link || undefined,
  repo: fm.repo || undefined,
  cover: fm.cover || undefined,
  coverAlt: (fm.cover && fm.coverAlt.trim()) || undefined,
  coverFocus: (fm.cover && cleanFocus(fm.coverFocus)) || undefined,
  draft: fm.draft || undefined,
  summary: fm.summary.trim() || undefined,
  team: fm.team.trim() || undefined,
  published: cleanDate(fm.published) || undefined,
  outcomes: outcomesToServer(fm.outcomes),
  links: linksToServer(fm.links),
  seoTitle: fm.seoTitle.trim() || undefined,
  lang: fm.lang.trim() || undefined,
})

// ── Single pages (/now, /uses) ───────────────────────────────────────────

export type PageFormFrontmatter = {
  title: string
  description: string
  updated: string
}

export const pageToServer = (fm: PageFormFrontmatter) => ({
  title: fm.title,
  description: fm.description || undefined,
  updated: fm.updated,
})

/** The keys the page form edits; any other stored key (lang, …) is kept on save. */
export const PAGE_MODELLED_KEYS: ReadonlySet<string> = modelledKeys(pageToServer({ title: '', description: '', updated: '' }))
