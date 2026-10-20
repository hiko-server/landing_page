/**
 * getStaticProps of the index pages in each language (F3). SERVER-ONLY.
 *
 *   /blog       every published post, one entry per piece (in English where
 *               a translation exists, "Also in 简体中文")
 *   /zh/blog    the posts in Chinese — a Chinese post, or the Chinese
 *               version of a piece with translations ("另有 English")
 *   /work       every published case study, featured first, and the "All
 *               projects" archive of the English CV
 *   /zh/work    the case studies in Chinese, and the archive of the
 *               Chinese CV
 *
 * A Chinese index exists only while it has something in Chinese to list
 * (lib/zhSite): otherwise it answers 404 (with a short window, so it
 * appears once the first Chinese piece is published) and the English page
 * neither links nor announces it. Every page ships its own language's
 * words (lib/uiStrings/lists listUiFor) and its language props
 * (lib/pageLanguage).
 */

import type { GetStaticPropsResult } from 'next'
import { listPosts, listWorkInDisplayOrder, type MDXIndexEntry, type PostFrontmatter } from './mdx'
import { alsoInOf, collapseTranslations, translationGroups, type AlsoIn } from './translations'
import { listUiFor, type ListUi } from './uiStrings/lists'
import { ownerNameZh, pairLanguageProps, type PageLanguageProps } from './pageLanguage'
import { isChineseLang } from './zhSite'
import { ZH_LANG } from './zhRoutes'
import type { CoverView } from '../components/Work/CoverFrame'
import type { ArchiveRow } from './projectArchive'

/** The two languages an index page is rendered in. */
export type IndexLang = 'en' | typeof ZH_LANG

/** ISR window of the index pages (as before F3). */
export const INDEX_REVALIDATE_SECONDS = 60

type Publications = { chromePublications?: boolean }

async function publicationsProp(): Promise<Publications> {
  try {
    // Whether /publications exists, for the nav link (lib/publicationsData).
    return (await import('./publicationsData')).chromePublicationsProp()
  } catch {
    return {}
  }
}

/**
 * One entry per piece in the page's language: on an English page every
 * piece (its English version where it has one), on a Chinese page the
 * pieces in Chinese (Simplified first, else Traditional). `alsoIn` names
 * every other version, English included — the translation groups are
 * those of the whole collection.
 */
export function inLanguage<T extends Parameters<typeof collapseTranslations>[0][number]>(entries: readonly T[], lang: IndexLang): Array<{ entry: T; alsoIn: AlsoIn[] }> {
  const groups = translationGroups(entries)
  const listed = lang === 'en' ? entries : entries.filter((e) => isChineseLang(e.lang))
  return collapseTranslations(listed, lang, groups).map(({ entry, alsoIn }) => ({ entry, alsoIn: alsoInOf(alsoIn) }))
}

// ── /blog, /zh/blog ──────────────────────────────────────────────────────────

export type IndexPost = MDXIndexEntry<PostFrontmatter> & {
  /** Languages the post is also published in (F2): one entry per piece. */
  alsoIn: AlsoIn[]
}

export type BlogIndexProps = PageLanguageProps &
  Publications & {
    posts: IndexPost[]
    ui: ListUi
    /** The owner's Chinese name (title suffix of a Chinese page); '' on English pages. */
    nameZh: string
  }

export async function loadBlogIndex(lang: IndexLang): Promise<GetStaticPropsResult<BlogIndexProps>> {
  const posts = inLanguage(listPosts(), lang).map(({ entry, alsoIn }) => ({ ...entry, alsoIn }))
  if (lang !== 'en' && !posts.length) return { notFound: true, revalidate: INDEX_REVALIDATE_SECONDS }
  return {
    props: {
      posts,
      ui: listUiFor(lang),
      nameZh: lang === 'en' ? '' : await ownerNameZh(),
      ...pairLanguageProps('/blog', lang),
      ...(await publicationsProp()),
    },
    revalidate: INDEX_REVALIDATE_SECONDS,
  }
}

// ── /work, /zh/work ──────────────────────────────────────────────────────────

export type WorkCardData = {
  slug: string
  permalink: string
  lang: string
  title: string
  description: string | null
  period: string | null
  status: 'live' | 'archived' | 'case-study' | null
  featured: boolean
  tech: string[]
  cover: CoverView | null
  /** Short name for the typographic cover ("SWCS"). */
  wordmark: string
  /** "93.59% offline classifier accuracy" — the first of the owner's metrics; null when none. */
  metric: string | null
  /** Languages the case study is also published in (F2). */
  alsoIn: AlsoIn[]
}

export type WorkIndexProps = PageLanguageProps &
  Publications & {
    items: WorkCardData[]
    archive: ArchiveRow[]
    ui: ListUi
    nameZh: string
  }

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function loadWorkIndex(lang: IndexLang): Promise<GetStaticPropsResult<WorkIndexProps>> {
  const [{ resolveCover }, { archiveRows }, { coverWordmark, primaryOutcome }] = await Promise.all([
    import('./coverImage'),
    import('./projectArchive'),
    import('./caseStudy'),
  ])
  const works = listWorkInDisplayOrder()
  // One card per case study, in the page's language (F2, F3).
  const items: WorkCardData[] = inLanguage(works, lang).map(({ entry: w, alsoIn }) => {
    const fm = w.frontmatter
    return {
      slug: w.slug,
      permalink: w.permalink,
      lang: w.lang,
      title: fm.title,
      description: str(fm.description),
      period: str(fm.period),
      status: fm.status === 'live' || fm.status === 'archived' || fm.status === 'case-study' ? fm.status : null,
      featured: fm.featured === true,
      tech: Array.isArray(fm.tech) ? fm.tech.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [],
      cover: resolveCover(fm.cover, '', fm.coverFocus),
      wordmark: coverWordmark(fm.title),
      metric: primaryOutcome(fm.outcomes) || null,
      alsoIn,
    }
  })
  if (lang !== 'en' && !items.length) return { notFound: true, revalidate: INDEX_REVALIDATE_SECONDS }

  // "All projects": the CV in the page's language, its case-study links to
  // the version in that language where one exists.
  let archive: ArchiveRow[] = []
  try {
    const { readPublicCvSections } = await import('./cvdata')
    const cvLang = lang === 'en' ? 'en' : 'zh'
    const cv = readPublicCvSections('website', ['project'], [cvLang])
    const listed = new Set(items.map((i) => i.slug))
    const groups = translationGroups(works)
    const preferred = (slug: string) => (listed.has(slug) ? slug : (groups.get(slug) || []).find((t) => listed.has(t.slug))?.slug || slug)
    const { referenceMonth } = await import('./clock')
    archive = archiveRows(
      cv[cvLang],
      works.map((w) => ({
        slug: w.slug,
        title: w.frontmatter.title,
        permalink: w.permalink,
        role: w.frontmatter.role,
        tech: w.frontmatter.tech,
        link: w.frontmatter.link,
        repo: w.frontmatter.repo,
      })),
      referenceMonth(),
      listUiFor(lang).t.archive.ongoing,
    ).map((row) => {
      if (!row.caseStudy || lang === 'en') return row
      const w = works.find((x) => x.slug === preferred(row.caseStudy!.slug))
      return w ? { ...row, caseStudy: { slug: w.slug, permalink: w.permalink, title: w.frontmatter.title } } : row
    })
  } catch {
    /* no CV: the archive is left out */
  }

  return {
    props: {
      items,
      archive,
      ui: listUiFor(lang),
      nameZh: lang === 'en' ? '' : await ownerNameZh(),
      ...pairLanguageProps('/work', lang),
      ...(await publicationsProp()),
    },
    revalidate: INDEX_REVALIDATE_SECONDS,
  }
}
