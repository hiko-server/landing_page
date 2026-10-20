import type { GetServerSideProps, NextApiRequest } from 'next'
import dynamic from 'next/dynamic'
import ReviewChrome from '../../components/Review/ReviewChrome'
import ReviewUnavailable from '../../components/Review/ReviewUnavailable'
import ReviewHead from '../../components/Review/ReviewHead'
import type { ReviewChromeText, ReviewUnavailableText } from '../../lib/review/page'

/**
 * /review/<token> — a review link (H5): one draft, or a live item's saved,
 * unpublished changes, read-only for anyone who has the link, exactly as
 * the page will look when published (the post / case-study page renders it
 * through its own getStaticProps — lib/review/render), under a "Preview"
 * watermark and bar.
 *
 * Never cached or indexed: rendered per request, `Cache-Control: private,
 * no-store` (Cloudflare does not keep it), `X-Robots-Tag: noindex`, and
 * `Referrer-Policy: no-referrer` (also as a meta tag) so the token never
 * leaves in a Referer header when the reader follows a link. The analytics
 * never record the path (it is not on their allow-list) and the error
 * monitor scrubs the token. Each opening is counted (a number, never who).
 *
 * What it answers is decided in lib/review/page: a link that is public by
 * now redirects to the public page; an expired, turned-off, unknown or
 * emptied link explains itself in the reader's language (410 / 404) without
 * saying anything about the draft. Failed look-ups are rate-limited per
 * client.
 */

type Collection = 'blog' | 'work'

type OkProps = { reviewState: 'ok'; reviewCollection: Collection; reviewChrome: ReviewChromeText } & Record<string, unknown>
type UnavailableProps = { reviewState: 'unavailable'; lang: string; reviewText: ReviewUnavailableText }
type Props = OkProps | UnavailableProps

// Each article page loads only when a link of its kind is opened (its own chunk).
const BlogPost = dynamic(() => import('../blog/[slug]'))
const WorkCase = dynamic(() => import('../work/[slug]'))

export default function ReviewPage(props: Props) {
  if (props.reviewState === 'unavailable') return <ReviewUnavailable {...props.reviewText} />
  // `page` keeps the article's own props — its `review: true` (noindex) included.
  const { reviewState, reviewCollection, reviewChrome, ...page } = props
  void reviewState
  const Page = (reviewCollection === 'blog' ? BlogPost : WorkCase) as unknown as (p: Record<string, unknown>) => JSX.Element
  return (
    <>
      {/* The article renders noindex itself for a review (its `review` prop). */}
      <Page {...page} />
      <ReviewHead />
      <ReviewChrome {...reviewChrome} />
    </>
  )
}

/** Failed look-ups per client per window (a token has 128 random bits; this only keeps probing cheap). */
const FAILED_LIMIT = 30
const FAILED_WINDOW_MS = 10 * 60_000

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const { req, res } = ctx
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  res.setHeader('Referrer-Policy', 'no-referrer')

  const [{ decideReview, reviewChromeText, unavailableText }, { recordReviewView }, { rateLimit }, { acceptLanguageUi }] = await Promise.all([
    import('../../lib/review/page'),
    import('../../lib/review/store'),
    import('../../lib/rateLimit'),
    import('../../lib/review/format'),
  ])

  const decision = decideReview(ctx.params?.token, {
    acceptLanguage: req.headers['accept-language'],
    allowMiss: () => rateLimit(req as unknown as NextApiRequest, FAILED_LIMIT, FAILED_WINDOW_MS, 'review-link-miss').allowed,
  })
  if (decision.kind === 'redirect') return { redirect: { destination: decision.destination, permanent: false } }
  const unavailable = (status: number, text: ReviewUnavailableText) => {
    res.statusCode = status
    return { props: { reviewState: 'unavailable' as const, lang: text.lang, reviewText: text } }
  }
  if (decision.kind === 'unavailable') return unavailable(decision.status, decision.text)

  // The article page builds its own props for this one unpublished version.
  const { REVIEW_RENDER } = await import('../../lib/review/render')
  const page = decision.collection === 'blog' ? await import('../blog/[slug]') : await import('../work/[slug]')
  const out = await page.getStaticProps!({ params: { slug: decision.slug }, draftMode: false, [REVIEW_RENDER]: { variant: decision.variant } } as never)
  if (!('props' in out)) return unavailable(410, unavailableText('gone', acceptLanguageUi(req.headers['accept-language'])))
  const pageProps = (await out.props) as Record<string, unknown>
  recordReviewView(decision.link.id)
  const lang = typeof pageProps.lang === 'string' ? pageProps.lang : 'en'
  return {
    props: {
      ...pageProps,
      reviewState: 'ok' as const,
      reviewCollection: decision.collection,
      reviewChrome: reviewChromeText(decision.link, decision.variant, lang),
    },
  }
}
