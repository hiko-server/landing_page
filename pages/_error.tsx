// Custom error page wired to Sentry (official @sentry/nextjs Pages-Router
// pattern). Renders Next's default error UI but also reports the exception so
// server-side render errors aren't silently swallowed. Inert without a DSN.
// Error responses are never indexable.
import * as Sentry from '@sentry/nextjs'
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
  // Report the error to Sentry (no-op when the SDK is disabled).
  await Sentry.captureUnderscoreErrorException(contextData)
  // Let Next compute the default error props (statusCode, etc.).
  return NextErrorComponent.getInitialProps(contextData)
}

export default CustomErrorComponent
