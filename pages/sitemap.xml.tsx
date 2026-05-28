import type { GetServerSideProps } from 'next'
import { listPosts, listWork } from '../lib/mdx'

const Sitemap = () => null

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const host = process.env.NEXT_PUBLIC_SITE_HOST || 'hiko.dev'
  const baseUrl = `https://${host}`
  const lastmod = new Date().toISOString()

  // Static routes (v6 ships new content sections alongside existing pages)
  const staticPages = [
    '/',
    '/about',
    '/work',
    '/blog',
    '/cv',
    '/now',
    '/uses',
    '/contact',
    '/crypto',
    '/quick-payment',
  ]

  const dynamicPages = [
    ...listPosts().map((p) => p.permalink),
    ...listWork().map((w) => w.permalink),
  ]

  const urls = [...staticPages, ...dynamicPages]
    .map((p) => `  <url><loc>${baseUrl}${p}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
  res.setHeader('Content-Type', 'application/xml')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  res.write(xml)
  res.end()
  return { props: {} }
}

export default Sitemap
