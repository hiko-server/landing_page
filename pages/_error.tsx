// Custom error page wired to Sentry (official @sentry/nextjs Pages-Router
// pattern). Renders Next's default error UI but also reports the exception so
// server-side render errors aren't silently swallowed. The SDK is imported
// only when a DSN is configured (server: SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN;
// browser: NEXT_PUBLIC_SENTRY_DSN, inlined at build time), so a deployment
// without Sentry never ships or loads it for this page.
// Error responses are never indexable.
import type { NextPage } from 'next'
import Head from 'next/head'
import type { ErrorProps } from 'next/error'
import NextErrorComponent from 'next/error'

const CustomErrorComponent: NextPage<ErrorProps> = (props) => {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <NextErrorComponent statusCode={props.statusCode} />
    </>
  )
}

CustomErrorComponent.getInitialProps = async (contextData) => {
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs')
    await Sentry.captureUnderscoreErrorException(contextData)
  }
  // Let Next compute the default error props (statusCode, etc.).
  return NextErrorComponent.getInitialProps(contextData)
}

export default CustomErrorComponent
