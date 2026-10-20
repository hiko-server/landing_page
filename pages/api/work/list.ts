import { withApi } from '../../../lib/apiHandler'
import { listWorkInDisplayOrder } from '../../../lib/mdx'
import { collapseTranslations, translationGroups } from '../../../lib/translations'

/**
 * Public list of published project case studies (in /work display order)
 * for index reuse. Drafts are filtered out upstream by lib/mdx.ts:listWork().
 */
export default withApi('work/list', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const all = listWorkInDisplayOrder()
  // Linked translations (F2): each item's other language versions, and whether the index lists it
  // (one entry per piece, the English version where it exists).
  const groups = translationGroups(all)
  const listed = new Set(collapseTranslations(all, 'en', groups).map((c) => c.entry.slug))
  const items = all.map((w) => ({
    slug: w.slug,
    title: w.frontmatter.title,
    description: w.frontmatter.description || null,
    tech: Array.isArray(w.frontmatter.tech) ? w.frontmatter.tech : [],
    status: w.frontmatter.status || 'case-study',
    featured: w.frontmatter.featured || false,
    lang: w.lang,
    permalink: w.permalink,
    translations: (groups.get(w.slug) || []).map((t) => ({ lang: t.lang, permalink: t.permalink })),
    listed: listed.has(w.slug),
  }))
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  return res.status(200).json({ items })
})
