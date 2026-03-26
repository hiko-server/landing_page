/* eslint-disable @next/next/no-page-custom-font */
import Head from 'next/head'
import { VPColor } from '../../theme/color'

const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME || 'HIKO.DEV'

type JsonLd = Record<string, any> | Array<Record<string, any>>

type Props = {
  title?: string
  description?: string
  url?: string
  image?: string
  imageAlt?: string
  type?: string
  themeColor?: string
  twitterCard?: 'summary' | 'summary_large_image'
  canonical?: string
  hreflang?: Array<{ hrefLang: string; href: string }>
  jsonLd?: JsonLd
  robots?: string
  locale?: string
  siteName?: string
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
  robots = 'index,follow,max-image-preview:large',
  locale = 'en_US',
  siteName = productName,
}: Props) => {
  const pageTitle = title ? `${title} | ${productName}` : productName
  const pageDesc = description || 'Personal site of Hiko — software engineer.'
  const ogImage = image || '/images/hikoAvator.png'
  const resolvedCanonical = canonical || url
  const resolvedImageAlt = imageAlt || pageTitle

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
      <meta name="robots" content={robots} />
      <meta name="googlebot" content={robots} />
      {resolvedCanonical ? <link rel="canonical" href={resolvedCanonical} /> : null}
      {hreflang?.map(({ hrefLang, href }) => (
        <link key={hrefLang} rel="alternate" hrefLang={hrefLang} href={href} />
      ))}

      {/* Open Graph */}
      {url && <meta property="og:url" content={url} />}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content={locale} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDesc} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content={resolvedImageAlt} />

      {/* Twitter Card */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDesc} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={resolvedImageAlt} />

      {/* JSON-LD */}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      {/* PWA basics */}
      <link rel="manifest" href="/manifest.json" />
      <link rel="icon" href="/images/favicon-32x32.png" />
      <link rel="apple-touch-icon" href="/apple-icon.png" />

      {/* Fonts (optional) */}
      <link
        href="https://fonts.googleapis.com/css?family=Open+Sans:300,400|Oswald:600&display=optional"
        rel="stylesheet"
      />
    </Head>
  )
}

export default CustomHead
