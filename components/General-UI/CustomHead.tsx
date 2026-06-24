import Head from 'next/head'
import { useEffect, useState } from 'react'
import { VPColor } from '../../theme/color'
import { SITE_HOST, SITE_URL, absUrl, PERSON_NAME } from '../../lib/schema'

// Brand/site name shown in the browser tab and <title>. We want this to track
// the domain the deployment is actually served from (e.g. "lucian-dev.com") rather
// than a baked-in brand string, so the same image reads correctly under any
// domain it is fronted by.
//
// NEXT_PUBLIC_* are inlined at build time, but .env is kept out of the Docker
// build context (see .dockerignore), so at build time these are usually
// undefined. We therefore use them only as the SSR/first-paint fallback and
// let the client correct the value to the real hostname after hydration.
//
// IMPORTANT: this client swap drives ONLY the visible <title>/tab text (UX).
// canonical / og:url / og:image / JSON-LD are pinned to the fixed SITE_URL so
// crawlers always see one canonical origin (no hiko.dev vs lucian-dev.com split).
const FALLBACK_SITE_NAME =
  process.env.NEXT_PUBLIC_SITE_HOST || process.env.NEXT_PUBLIC_PRODUCT_NAME || 'lucian-dev.com'

// Strip a leading "www." and any ":port" so the tab reads as the bare domain.
function normalizeHost(host: string): string {
  return host.replace(/^www\./i, '').replace(/:\d+$/, '')
}

type JsonLd = Record<string, any> | Array<Record<string, any>>

type Props = {
  title?: string
  description?: string
  /** Canonical/OG URL. Should be an absolute lucian-dev.com URL (use absUrl()). */
  url?: string
  image?: string
  imageAlt?: string
  type?: string
  themeColor?: string
  twitterCard?: 'summary' | 'summary_large_image'
  canonical?: string
  hreflang?: Array<{ hrefLang: string; href: string }>
  jsonLd?: JsonLd
  /** Keep this page out of the index (admin, 404, 500). Defaults to indexable. */
  noindex?: boolean
  /** For type="article": ISO dates wired into Open Graph article:* tags. */
  publishedTime?: string
  modifiedTime?: string
}

const CustomHead = ({
  title,
  description,
  url,
  image,
  imageAlt,
  type = 'website',
  themeColor,
  twitterCard = 'summary_large_image',
  canonical,
  hreflang,
  jsonLd,
  noindex = false,
  publishedTime,
  modifiedTime,
}: Props) => {
  // Start from the SSR fallback so the server render and the first client
  // render agree (no hydration mismatch), then switch to the live hostname
  // once mounted — that is the "auto-convert to the deployed domain" behaviour.
  const [productName, setProductName] = useState(() => normalizeHost(FALLBACK_SITE_NAME))
  useEffect(() => {
    const host = typeof window !== 'undefined' ? window.location?.hostname : ''
    if (host) setProductName(normalizeHost(host))
  }, [])

  const pageTitle = title ? `${title} | ${productName}` : productName
  const pageDesc =
    description ||
    'Li Yanpei (Lucian) — software engineer in Hong Kong building full-stack web apps, machine-learning / computer-vision, and embedded systems.'

  // Canonical + OG URL are PINNED to the fixed origin (never the request host).
  const canonicalUrl = canonical || url || SITE_URL
  // og:image must be absolute on the canonical origin or crawlers drop it.
  const rawImage = image || '/images/hikoAvator.png'
  const ogImage = rawImage.startsWith('http') ? rawImage : absUrl(rawImage)
  // The dynamic /api/og endpoint renders a true 1200x630 social card; only
  // claim those dimensions for that source (avatar/photo images are not 1200x630).
  const isOgCard = ogImage.includes('/api/og')
  const altText = imageAlt || (title ? `${title} — ${PERSON_NAME}` : PERSON_NAME)

  return (
    <Head>
      <meta charSet="utf-8" />
      <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      {/* Allow pinch-zoom for accessibility (no maximum-scale / user-scalable=no). */}
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta
        name="theme-color"
        content={themeColor ? themeColor : VPColor ? VPColor.index.blue : '#559ec7'}
      />

      <title>{pageTitle}</title>
      <meta name="description" content={pageDesc} />
      <meta
        name="robots"
        content={noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}
      />
      <link rel="canonical" href={canonicalUrl} />
      {hreflang?.map(({ hrefLang, href }) => (
        <link key={hrefLang} rel="alternate" hrefLang={hrefLang} href={href} />
      ))}

      {/* Open Graph */}
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_HOST} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDesc} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content={altText} />
      {isOgCard && <meta property="og:image:width" content="1200" />}
      {isOgCard && <meta property="og:image:height" content="630" />}
      {type === 'article' && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {type === 'article' && (modifiedTime || publishedTime) && (
        <meta property="article:modified_time" content={modifiedTime || publishedTime} />
      )}
      {type === 'article' && <meta property="article:author" content={PERSON_NAME} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDesc} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={altText} />

      {/* JSON-LD */}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      {/* RSS auto-discovery — readers like NetNewsWire/Feedly look for this */}
      <link rel="alternate" type="application/rss+xml" title={`${SITE_HOST} — Writing`} href="/feed.xml" />

      {/* PWA basics */}
      <link rel="manifest" href="/manifest.json" />
      <link rel="icon" href="/images/favicon-32x32.png" />
      <link rel="apple-touch-icon" href="/apple-icon.png" />
      {/*
        v6: typography is now driven by next/font/local (Inter Variable +
        JetBrains Mono Variable, see pages/_app.tsx). No Google Fonts <link>
        — that triggered Next's no-page-custom-font warning and made the
        page wait on fonts.googleapis.com.
      */}
    </Head>
  )
}

export default CustomHead
