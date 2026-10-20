import { listPosts, listWorkInDisplayOrder, type MDXIndexEntry, type PostFrontmatter, type WorkFrontmatter } from './mdx'
import { toArticleLink, type ArticleLink } from '../components/Article/collectionNav'
import { collapseTranslations, hreflangAlternates, keptVersion, switchLinks, translationGroups, type SwitchLink } from './translations'
import type { Alternate } from './schema'

/**
 * What a post or case-study page needs to know about the other pieces —
 * SERVER-ONLY (content store), called in getStaticProps:
 *
 *   translations  the piece's versions in other languages (F2; drafts too
 *                 in Draft Mode, so the owner can follow the switch to a
 *                 translation being prepared)
 *   alternates    hreflang alternates for <head> (published versions only,
 *                 none in Draft Mode — the page is noindex there)
 *   posts, work   the published posts and case studies as links, one per
 *                 piece in the article's language where it exists (prev /
 *                 next and related never offer the same piece twice), with
 *                 each post's `project` pointing at the case study in that
 *                 language
 */
export type ArticleSiblings = {
  translations: SwitchLink[]
  alternates: Alternate[]
  posts: ArticleLink[]
  work: ArticleLink[]
  /** The case-study slug a post's `project` resolves to in the article's language (undefined when none). */
  projectFor: (project: string | null | undefined) => string | undefined
}

type Self = MDXIndexEntry<PostFrontmatter> | MDXIndexEntry<WorkFrontmatter>

export function articleSiblings(kind: 'blog' | 'work', self: Self, opts: { draftMode: boolean }): ArticleSiblings {
  const posts = listPosts()
  const work = listWorkInDisplayOrder()

  const own = kind === 'blog' ? (opts.draftMode ? listPosts({ includeDrafts: true }) : posts) : opts.draftMode ? listWorkInDisplayOrder({ includeDrafts: true }) : work
  const pool = own.some((e) => e.slug === self.slug) ? own : [...own, self]
  const versions = translationGroups(pool).get(self.slug) || []
  const alternates = opts.draftMode || self.frontmatter.draft ? [] : hreflangAlternates(self, versions)
  const translations = switchLinks(versions)

  const workGroups = translationGroups(work)
  const workKept = collapseTranslations(work, self.lang, workGroups).map((c) => c.entry)
  const keptWork = new Set(workKept.map((w) => w.slug))
  const projectFor = (project: string | null | undefined) => (project ? keptVersion(project, workGroups, keptWork) : undefined)

  const postLinks = collapseTranslations(posts, self.lang).map(({ entry }) => {
    const link = toArticleLink('blog', entry)
    const project = projectFor(link.project)
    return project ? { ...link, project } : link
  })
  return {
    translations,
    alternates,
    posts: postLinks,
    work: workKept.map((w) => toArticleLink('work', w)),
    projectFor,
  }
}
