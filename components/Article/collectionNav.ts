/**
 * Prev/next and "related" navigation for blog posts and case studies.
 * Pure — computed in getStaticProps from the public index lists.
 */

export type ArticleKind = 'blog' | 'work'

/** A compact, serialisable link to another article. */
export type ArticleLink = {
  kind: ArticleKind
  slug: string
  title: string
  permalink: string
  description: string | null
  /** Publication date (blog) or period (work), for display; null when absent. */
  meta: string | null
  /** Language of the title (contract E tag), for the link's lang attribute. */
  lang: string
  tags: string[]
  /** A post's case study (its `project` frontmatter: a work slug); null / absent otherwise. */
  project?: string | null
}

type IndexEntryLike = {
  slug: string
  permalink: string
  lang: string
  frontmatter: {
    title?: unknown
    description?: unknown
    date?: unknown
    period?: unknown
    tags?: unknown
    tech?: unknown
    project?: unknown
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : []

/** Index entry → ArticleLink (blog tags / work tech become `tags`). */
export function toArticleLink(kind: ArticleKind, entry: IndexEntryLike): ArticleLink {
  const fm = entry.frontmatter
  return {
    kind,
    slug: entry.slug,
    title: str(fm.title) || entry.slug,
    permalink: entry.permalink,
    description: str(fm.description),
    meta: kind === 'blog' ? (str(fm.date) ? String(fm.date).slice(0, 10) : null) : str(fm.period),
    lang: entry.lang,
    tags: kind === 'blog' ? strList(fm.tags) : strList(fm.tech),
    ...(kind === 'blog' && str(fm.project) ? { project: str(fm.project) } : {}),
  }
}

/** The items before and after `slug` in `list` (display order); null at the ends or when absent. */
export function neighbours<T extends { slug: string }>(list: readonly T[], slug: string): { before: T | null; after: T | null } {
  const i = list.findIndex((x) => x.slug === slug)
  if (i < 0) return { before: null, after: null }
  return { before: i > 0 ? list[i - 1] : null, after: i < list.length - 1 ? list[i + 1] : null }
}

const norm = (t: string) => t.normalize('NFKC').trim().toLowerCase()

/**
 * Up to `limit` articles (from any collection) sharing the most tags with
 * `current`, excluding itself.
 * Ties keep the pool order, so callers pass the pool newest-first.
 */
export function relatedByTags(
  current: { kind: ArticleKind; slug: string; tags: readonly string[] },
  pool: readonly ArticleLink[],
  limit = 3,
): ArticleLink[] {
  const mine = new Set(current.tags.map(norm).filter(Boolean))
  if (!mine.size) return []
  const self = `${current.kind}/${current.slug}`
  return pool
    .map((item, order) => ({
      item,
      order,
      score: new Set(item.tags.map(norm).filter((t) => mine.has(t))).size,
    }))
    .filter((x) => x.score > 0 && `${x.item.kind}/${x.item.slug}` !== self)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((x) => x.item)
}

/**
 * Explicit links between a post and its case study (D8): for a post, the
 * case study its `project` names; for a case study, the posts whose
 * `project` is its slug (pool order, i.e. newest first).
 */
export function projectLinks(current: { kind: ArticleKind; slug: string; project?: string | null }, pool: readonly ArticleLink[]): ArticleLink[] {
  if (current.kind === 'blog') {
    if (!current.project) return []
    return pool.filter((x) => x.kind === 'work' && x.slug === current.project)
  }
  return pool.filter((x) => x.kind === 'blog' && x.project === current.slug)
}

/**
 * "Related" at the end of an article: its explicit post ↔ case-study links
 * first, then the pieces sharing the most tags, up to `limit` in all
 * (explicit links are never cut).
 */
export function relatedArticles(
  current: { kind: ArticleKind; slug: string; tags: readonly string[]; project?: string | null },
  pool: readonly ArticleLink[],
  limit = 3,
): ArticleLink[] {
  const explicit = projectLinks(current, pool)
  const seen = new Set(explicit.map((x) => `${x.kind}/${x.slug}`))
  const byTags = relatedByTags(current, pool, pool.length).filter((x) => !seen.has(`${x.kind}/${x.slug}`))
  return [...explicit, ...byTags.slice(0, Math.max(0, limit - explicit.length))]
}
