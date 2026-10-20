import { withApi } from '../../../lib/apiHandler'
import { listPosts } from '../../../lib/mdx'
import { collapseTranslations, translationGroups } from '../../../lib/translations'

/**
 * Public, cacheable list of published blog posts (title, description,
 * tags, date, reading time) for index reuse. Drafts are filtered out
 * upstream by lib/mdx.ts:listPosts().
 */
export default withApi('blog/list', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const all = listPosts()
  // Linked translations (F2): each item's other language versions, and whether the index lists it
  // (one entry per piece, the English version where it exists).
  const groups = translationGroups(all)
  const listed = new Set(collapseTranslations(all, 'en', groups).map((c) => c.entry.slug))
  const items = all.map((p) => ({
    slug: p.slug,
    title: p.frontmatter.title,
    description: p.frontmatter.description || null,
    tags: Array.isArray(p.frontmatter.tags) ? p.frontmatter.tags : [],
    date: p.frontmatter.date ? String(p.frontmatter.date).slice(0, 10) : null,
    readingMinutes: p.readingMinutes,
    lang: p.lang,
    permalink: p.permalink,
    translations: (groups.get(p.slug) || []).map((t) => ({ lang: t.lang, permalink: t.permalink })),
    listed: listed.has(p.slug),
  }))
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  return res.status(200).json({ items })
})
