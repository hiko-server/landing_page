import type { GetServerSideProps } from 'next'

const Sitemap = () => null

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const host = process.env.NEXT_PUBLIC_SITE_HOST || 'hiko.dev'
  const baseUrl = `https://${host}`
  const pages = ['/', '/cv', '/crypto', '/about', '/contact', '/quick-payment']
  const lastmod = new Date().toISOString()
  const urls = pages
    .map((p) => `  <url><loc>${baseUrl}${p}</loc><lastmod>${lastmod}</lastmod></url>`) 
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
  res.setHeader('Content-Type', 'application/xml')
  res.write(xml)
  res.end()
  return { props: {} }
}

export default Sitemap

