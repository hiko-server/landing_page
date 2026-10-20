import Head from 'next/head'

/**
 * The head of a page opened through a review link (H5): never indexed or
 * archived, and no Referer that could carry the token. The article page
 * itself renders `noindex` for a review (its `review` prop), so whichever
 * robots meta next/head keeps last (it keeps the one rendered last, which
 * changes as components re-render), it says noindex; the response's
 * X-Robots-Tag and Referrer-Policy headers say the same.
 */
export default function ReviewHead() {
  return (
    <Head>
      <meta name="robots" content="noindex, nofollow, noarchive" />
      <meta name="referrer" content="no-referrer" />
    </Head>
  )
}
