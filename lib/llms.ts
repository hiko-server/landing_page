import { getItem, getPage } from './contentStore'
import { listPosts, listWorkInDisplayOrder, type MDXIndexEntry, type PostFrontmatter, type WorkFrontmatter } from './mdx'
import { PERSON_NAME, SITE_URL } from './schema'
import { HOME_DESCRIPTION } from './homeDescription'
import { isoDate } from './postDate'
import { translationGroups } from './translations'
import { articleMarkdown, buildLlmsFullTxt, buildLlmsTxt, type LlmsEntry, type LlmsInput, type TwinArticle } from './markdownTwin'
import { log } from './log'
import { hasPublicationsPage } from './publicationsData'
import { orcidOf } from './orcid/cv'
import { orcidUrl } from './orcid/id'
import type { CvLang } from './cvVisibility'
import { zhPathOf } from './zhRoutes'
import { zhAvailable } from './zhSite'

/**
 * Loaders for the Markdown twins, /llms.txt and /llms-full.txt (G9) —
 * SERVER-ONLY (content store). Public content only: the published posts and
 * case studies (lib/mdx listPosts / listWork exclude drafts), the fields
 * their pages show, the home page's description, the owner's /now and /uses
 * descriptions, which public pages exist (/publications, the CV in each
 * language) and the owner's public ORCID iD (a researcher identifier, not a
 * contact detail; absent when unset or hidden). Nothing hidden and no CV
 * data otherwise — the CV is linked, never quoted — and no contact details.
 */

export type Collection = 'blog' | 'work'

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : [])

type PostEntry = MDXIndexEntry<PostFrontmatter>
type WorkEntry = MDXIndexEntry<WorkFrontmatter>

function twinOf(kind: Collection, entry: PostEntry | WorkEntry, body: string, ctx: { posts: PostEntry[]; work: WorkEntry[] }): TwinArticle {
  const list = kind === 'blog' ? ctx.posts : ctx.work
  const translations = translationGroups(list).get(entry.slug) || []
  const base = {
    kind,
    title: entry.frontmatter.title,
    description: str(entry.frontmatter.description),
    lang: entry.lang,
    permalink: entry.permalink,
    readingMinutes: entry.readingMinutes,
    author: PERSON_NAME,
    translations,
    body,
  }
  if (kind === 'blog') {
    const fm = entry.frontmatter as PostFrontmatter
    const study = fm.project ? ctx.work.find((w) => w.slug === fm.project) : undefined
    return {
      ...base,
      date: str(fm.date),
      updated: str(fm.updated),
      tags: strList(fm.tags),
      project: study ? { title: study.frontmatter.title, permalink: study.permalink } : null,
    }
  }
  const fm = entry.frontmatter as WorkFrontmatter
  return {
    ...base,
    summary: str(fm.summary),
    role: str(fm.role),
    team: str(fm.team),
    period: str(fm.period),
    published: str(fm.published),
    tech: strList(fm.tech),
    link: str(fm.link),
    repo: str(fm.repo),
    outcomes: fm.outcomes || [],
    links: fm.links || [],
  }
}

export type MarkdownTwin = {
  markdown: string
  lang: string
  /** Same-site path of the canonical HTML page. */
  permalink: string
  /** Last content-store write (epoch ms), 0 when unknown. */
  updatedAt: number
}

/** The Markdown twin of a published post or case study; null for drafts and unknown slugs. */
export function loadMarkdownTwin(kind: Collection, slug: string): MarkdownTwin | null {
  if (!SLUG_RE.test(slug)) return null
  const posts = listPosts()
  const work = listWorkInDisplayOrder()
  const entry = (kind === 'blog' ? posts : work).find((e) => e.slug === slug)
  if (!entry) return null
  const item = getItem(kind, slug)
  if (!item) return null
  return {
    markdown: articleMarkdown(twinOf(kind, entry, item.body || '', { posts, work }), SITE_URL),
    lang: entry.lang,
    permalink: entry.permalink,
    updatedAt: entry.updatedAt || 0,
  }
}

function pageDescription(name: 'now' | 'uses'): string | undefined {
  try {
    return str(getPage(name)?.frontmatter?.description)
  } catch {
    return undefined
  }
}

function hasPublications(): boolean {
  try {
    return hasPublicationsPage()
  } catch {
    return false
  }
}

/** The owner's public ORCID record URI (website audience, either language's Personal Info); '' when unset or hidden. */
async function publicOrcid(): Promise<string> {
  try {
    const { readPublicCvSections } = await import('./cvdata')
    const pi = readPublicCvSections('website', ['personalInformation'], ['en', 'zh'])
    return orcidUrl(orcidOf(pi.en[0]) || orcidOf(pi.zh[0]))
  } catch {
    return ''
  }
}

/** Whether a CV language has anything public to show (the same test as its page's downloads, lib/cvExport). */
async function cvHasContent(lang: CvLang): Promise<boolean> {
  try {
    const [{ loadCvSource }, { buildCvModel, hasContent }] = await Promise.all([import('./cvSource'), import('./cvExport/model')])
    const src = await loadCvSource(lang)
    return hasContent(buildCvModel(src.sections, { lang, now: src.now, updatedAt: src.updatedAt, canonical: '' }))
  } catch {
    return false
  }
}

async function llmsInput(posts: PostEntry[], work: WorkEntry[]): Promise<LlmsInput> {
  const entry = (e: PostEntry | WorkEntry, date?: string): LlmsEntry => ({
    title: e.frontmatter.title,
    permalink: e.permalink,
    lang: e.lang,
    description: str(e.frontmatter.description),
    ...(date ? { date } : {}),
  })
  return {
    siteUrl: SITE_URL,
    name: PERSON_NAME,
    summary: HOME_DESCRIPTION,
    work: work.map((w) => entry(w)),
    posts: posts.map((p) => entry(p, isoDate(p.frontmatter.date) || undefined)),
    publications: hasPublications(),
    cv: { en: await cvHasContent('en'), zh: await cvHasContent('zh') },
    ...(await publicOrcid().then((orcid) => (orcid ? { orcid } : {}))),
    nowDescription: pageDescription('now'),
    usesDescription: pageDescription('uses'),
    zhPages: zhAvailable().flatMap((p) => zhPathOf(p) ?? []),
  }
}

/** /llms.txt. */
export async function loadLlmsTxt(): Promise<string> {
  return buildLlmsTxt(await llmsInput(listPosts(), listWorkInDisplayOrder()))
}

/** /llms-full.txt: every published case study, then every post (newest first). A body that fails to convert is left out and logged. */
export function loadLlmsFullTxt(): string {
  const posts = listPosts()
  const work = listWorkInDisplayOrder()
  const articles: string[] = []
  const add = (kind: Collection, e: PostEntry | WorkEntry) => {
    try {
      const body = getItem(kind, e.slug)?.body || ''
      articles.push(articleMarkdown(twinOf(kind, e, body, { posts, work }), SITE_URL))
    } catch (err) {
      log.warn('llms-full: could not convert an article', { kind, slug: e.slug, err })
    }
  }
  work.forEach((w) => add('work', w))
  posts.forEach((p) => add('blog', p))
  return buildLlmsFullTxt({ siteUrl: SITE_URL, name: PERSON_NAME, summary: HOME_DESCRIPTION }, articles)
}
