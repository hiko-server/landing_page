import type { GetServerSideProps } from 'next'
import { listPosts, listWork } from '../lib/mdx'
import { xmlEscape } from '../lib/feeds'
import { getDb } from '../lib/db'
import { latestDate } from '../lib/postDate'
import { SITE_URL, CV_ALTERNATES, type Alternate } from '../lib/schema'
import { hasPublicationsPage } from '../lib/publicationsData'

/**
 * sitemap.xml with real <lastmod> values: items use the newest of their
 * frontmatter `updated` / `date` and the content-store write time; static
 * pages use the write time of the data they render (home, CV, now, uses).
 * The bilingual CV is listed in both languages (/cv and /cv/zh) with
 * reciprocal hreflang alternates. Drafts never appear (listPosts/listWork);
 * /publications is listed only while it has public papers (else it is a 404).
 */

const Sitemap = () => null

type Entry = { path: string; lastmod: string; alternates?: readonly Alternate[] }

/** Content-store write time (epoch ms) for a kv key or page name; 0 when unknown. */
function storedAt(table: 'kv' | 'pages', id: string): number {
  try {
    const sql = table === 'kv' ? 'SELECT updated_at FROM kv WHERE key = ?' : 'SELECT updated_at FROM pages WHERE name = ?'
    const row = getDb().prepare(sql).get(id) as { updated_at: number } | undefined
    return row?.updated_at || 0
  } catch {
    return 0
  }
}

function urlXml({ path, lastmod, alternates }: Entry): string {
  const lines = [`    <loc>${xmlEscape(`${SITE_URL}${path}`)}</loc>`]
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`)
  for (const a of alternates || []) {
    lines.push(`    <xhtml:link rel="alternate" hreflang="${xmlEscape(a.hrefLang)}" href="${xmlEscape(a.href)}" />`)
  }
  return `  <url>\n${lines.join('\n')}\n  </url>`
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const posts = listPosts()
  const work = listWork()
  const postEntries: Entry[] = posts.map((p) => ({
    path: p.permalink,
    lastmod: latestDate([p.frontmatter.updated, p.frontmatter.date, p.updatedAt]),
  }))
  const workEntries: Entry[] = work.map((w) => ({ path: w.permalink, lastmod: latestDate([w.updatedAt]) }))

  const home = storedAt('kv', 'home')
  const cv = storedAt('kv', 'cvdata')

  const entries: Entry[] = [
    { path: '/', lastmod: latestDate([home, cv]) },
    { path: '/about', lastmod: latestDate([home, cv]) },
    { path: '/work', lastmod: latestDate(workEntries.map((e) => e.lastmod)) },
    { path: '/blog', lastmod: latestDate(postEntries.map((e) => e.lastmod)) },
    { path: '/cv', lastmod: latestDate([cv]), alternates: CV_ALTERNATES },
    { path: '/cv/zh', lastmod: latestDate([cv]), alternates: CV_ALTERNATES },
    ...(hasPublicationsPage() ? [{ path: '/publications', lastmod: latestDate([cv]) }] : []),
    { path: '/now', lastmod: latestDate([storedAt('pages', 'now')]) },
    { path: '/uses', lastmod: latestDate([storedAt('pages', 'uses')]) },
    { path: '/contact', lastmod: latestDate([home]) },
    { path: '/colophon', lastmod: '' },
    ...postEntries,
    ...workEntries,
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.map(urlXml).join('\n')}
</urlset>`
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  res.write(xml)
  res.end()
  return { props: {} }
}

export default Sitemap
