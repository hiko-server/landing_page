/* eslint-disable @next/next/no-page-custom-font */
import Head from 'next/head'
import { VPColor } from '../../theme/color'

const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME

const CustomHead = ({
  title,
  themeColor,
}: {
  title?: string
  themeColor?: string
}) => {
  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no"
        />
        <meta
          name="theme-color"
          content={
            themeColor ? themeColor : VPColor ? VPColor.index.blue : '##559ec7'
          }
        />

        {/* For PWA use*/}

        <meta
          name="application-name"
          content={productName ? productName : 'PMark'}
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta
          name="apple-mobile-web-app-title"
          content={productName ? productName : 'PMark'}
        />
        <meta
          name="description"
          content={productName ? productName : 'PMark'}
        />
        <meta name="keywords" content={productName ? productName : 'PMark'} />
        {/* <meta name="format-detection" content="telephone=no" /> */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="/icons/browserconfig.xml" />
        <meta
          name="msapplication-TileColor"
          content={VPColor ? VPColor.index.blue : '#559ec7'}
        />
        <meta name="msapplication-tap-highlight" content="no" />

        {/* SEO */}
        <meta name="description" content="Description" />
        <meta name="keywords" content="Keywords" />

        {/* Can customize here*/}
        <title>{title ? title : productName}</title>

        <link
          href="https://fonts.googleapis.com/css?family=Open+Sans:300,400|Oswald:600&display=optional"
          rel="stylesheet"
        />
        <link
          data-react-helmet="true"
          rel="icon"
          href="https://blobscdn.gitbook.com/v0/b/gitbook-28427.appspot.com/o/spaces%2F-L9iS6Wm2hynS5H9Gj7j%2Favatar.png?generation=1523462254548780&amp;alt=media"
        />

        {/* For PWA icons use*/}
        <link rel="manifest" href="/manifest.json" />
        <link
          href="/icons/favicon-16x16.png"
          rel="icon"
          type="image/png"
          sizes="16x16"
        />
        <link
          href="/icons/favicon-32x32.png"
          rel="icon"
          type="image/png"
          sizes="32x32"
        />
        <link rel="apple-touch-icon" href="/apple-icon.png"></link>
      </Head>
    </>
  )
}

export default CustomHead
