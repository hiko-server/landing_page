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
