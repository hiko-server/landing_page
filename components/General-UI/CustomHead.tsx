import Head from 'next/head'
import { useEffect, useState } from 'react'
import { VPColor } from '../../theme/color'

// Brand/site name shown in the browser tab and <title>. We want this to track
// the domain the deployment is actually served from (e.g. "hiko.dev") rather
// than a baked-in brand string, so the same image reads correctly under any
// domain it is fronted by.
//
// NEXT_PUBLIC_* are inlined at build time, but .env is kept out of the Docker
// build context (see .dockerignore), so at build time these are usually
// undefined. We therefore use them only as the SSR/first-paint fallback and
// let the client correct the value to the real hostname after hydration.
const FALLBACK_SITE_NAME =
  process.env.NEXT_PUBLIC_SITE_HOST || process.env.NEXT_PUBLIC_PRODUCT_NAME || 'hiko.dev'

// Strip a leading "www." and any ":port" so the tab reads as the bare domain.
function normalizeHost(host: string): string {
  return host.replace(/^www\./i, '').replace(/:\d+$/, '')
}

type JsonLd = Record<string, any> | Array<Record<string, any>>

type Props = {
  title?: string
  description?: string
  url?: string
  image?: string
  type?: string
  themeColor?: string
  twitterCard?: 'summary' | 'summary_large_image'
  canonical?: string
  hreflang?: Array<{ hrefLang: string; href: string }>
  jsonLd?: JsonLd
}

const CustomHead = ({
  title,
  description,
  url,
  image,
  type = 'website',
  themeColor,
  twitterCard = 'summary_large_image',
  canonical,
  hreflang,
  jsonLd,
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
  const pageDesc = description || 'Personal site of Hiko — software engineer.'
  const ogImage = image || '/images/hikoAvator.png'

  return (
    <Head>
      <meta charSet="utf-8" />
      <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      <meta
        name="viewport"
        content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no"
      />
      <meta
        name="theme-color"
        content={themeColor ? themeColor : VPColor ? VPColor.index.blue : '#559ec7'}
      />

      <title>{pageTitle}</title>
      <meta name="description" content={pageDesc} />
      <meta name="keywords" content="Hiko, Li Yanpei, software engineer, CV, crypto" />
      <link rel="canonical" href={canonical || url || ''} />
      {hreflang?.map(({ hrefLang, href }) => (
        <link key={hrefLang} rel="alternate" hrefLang={hrefLang} href={href} />
      ))}

      {/* Open Graph */}
      {url && <meta property="og:url" content={url} />}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDesc} />
      <meta property="og:image" content={ogImage} />

      {/* Twitter Card */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDesc} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD */}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      {/* RSS auto-discovery — readers like NetNewsWire/Feedly look for this */}
      <link
        rel="alternate"
        type="application/rss+xml"
        title={`${productName} — Writing`}
        href="/feed.xml"
      />

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
