// Custom error page wired to Sentry (official @sentry/nextjs Pages-Router
// pattern). Renders Next's default error UI but also reports the exception so
// server-side render errors aren't silently swallowed. Inert without a DSN.
import * as Sentry from '@sentry/nextjs'
import type { NextPage } from 'next'
import type { ErrorProps } from 'next/error'
import NextErrorComponent from 'next/error'

const CustomErrorComponent: NextPage<ErrorProps> = (props) => {
  return <NextErrorComponent statusCode={props.statusCode} />
}

CustomErrorComponent.getInitialProps = async (contextData) => {
  // Report the error to Sentry (no-op when the SDK is disabled).
  await Sentry.captureUnderscoreErrorException(contextData)
  // Let Next compute the default error props (statusCode, etc.).
  return NextErrorComponent.getInitialProps(contextData)
}

export default CustomErrorComponent
