// Custom error page: Next's default error UI, never indexable.
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

// Next computes the default error props (statusCode, etc.).
CustomErrorComponent.getInitialProps = (contextData) => NextErrorComponent.getInitialProps(contextData)

export default CustomErrorComponent
