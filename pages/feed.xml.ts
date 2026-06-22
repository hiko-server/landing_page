import type { GetServerSideProps } from 'next'
import { listPosts } from '../lib/mdx'

// Root-level RSS 2.0 alias for /api/rss.xml so feed readers that probe
// /feed.xml by convention find the writing feed without an extra hop.

const FeedXml = () => null

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const host = process.env.NEXT_PUBLIC_SITE_HOST || 'lucian-dev.com'
  const site = `https://${host}`
  const posts = listPosts()

  const items = posts
    .map(
      (p) => `
    <item>
      <title>${xmlEscape(p.frontmatter.title)}</title>
      <link>${site}${p.permalink}</link>
      <guid isPermaLink="true">${site}${p.permalink}</guid>
      <pubDate>${new Date(p.frontmatter.date).toUTCString()}</pubDate>
      ${p.frontmatter.description ? `<description>${xmlEscape(p.frontmatter.description)}</description>` : ''}
    </item>`,
    )
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>LUCIAN-DEV.COM — Writing</title>
    <link>${site}/blog</link>
    <description>Engineering essays, ML notes, and write-ups by Li Yanpei.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>`

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  res.write(xml)
  res.end()
  return { props: {} }
}

export default FeedXml
