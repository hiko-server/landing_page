import { modelledKeys } from './frontmatterMerge'

/**
 * The frontmatter forms of the admin editors — posts and case studies
 * (pages/admin/blog/edit, pages/admin/work/edit) and the /now and /uses
 * pages (components/Admin/PageEditor): the empty form, the form read from
 * the stored frontmatter (fromServer) and the frontmatter the form writes
 * (toServer — every key it models, undefined for an empty field). The
 * editors keep the keys a form does not model (./frontmatterMerge).
 */

const todayISO = () => new Date().toISOString().slice(0, 10)

// ── Blog posts ───────────────────────────────────────────────────────────

export type BlogFrontmatter = {
  title: string
  description: string
  date: string
  tags: string[]
  draft: boolean
  cover: string
}

export const BLOG_EMPTY: BlogFrontmatter = {
  title: '',
  description: '',
  date: todayISO(),
  tags: [],
  draft: true,
  cover: '',
}

export const blogFromServer = (f: Record<string, any>): BlogFrontmatter => ({
  title: String(f.title || ''),
  description: String(f.description || ''),
  date: String(f.date || todayISO()).slice(0, 10),
  tags: Array.isArray(f.tags) ? f.tags.map(String) : [],
  draft: Boolean(f.draft),
  cover: String(f.cover || ''),
})

export const blogToServer = (fm: BlogFrontmatter, tags: string[]) => ({
  title: fm.title,
  description: fm.description || undefined,
  date: fm.date,
  tags: tags.length ? tags : undefined,
  draft: fm.draft || undefined,
  cover: fm.cover || undefined,
})

// ── Case studies ─────────────────────────────────────────────────────────

export type WorkStatus = 'live' | 'case-study' | 'archived'

export const WORK_STATUSES: WorkStatus[] = ['case-study', 'live', 'archived']

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
  /** Hidden from /work until published; a missing flag means published. */
  draft: boolean
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
  draft: true,
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
  draft: f.draft === true,
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
  draft: fm.draft || undefined,
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
