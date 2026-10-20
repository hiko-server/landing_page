/**
 * How a review link (H5, pages/review/[token]) asks a post or case-study
 * page to render one unpublished version. The review page calls the page's
 * own getStaticProps with a context that carries REVIEW_RENDER, so the
 * article renders exactly as it will look when published — and the page
 * treats it as a public render in every other respect: no Draft Mode, no
 * other drafts among its neighbours, no redirect of a missing item.
 *
 * Pure and dependency-free (it is imported by the page modules).
 */

export type ReviewRender = { variant: 'draft' | 'changes' }

/** The key under which the review page puts its request on the context. */
export const REVIEW_RENDER: unique symbol = Symbol.for('lucian-dev.review-render') as never

/** The review request on a getStaticProps context, or null for an ordinary render. */
export function reviewRenderOf(ctx: unknown): ReviewRender | null {
  const value = ctx && typeof ctx === 'object' ? (ctx as Record<symbol, unknown>)[REVIEW_RENDER] : null
  if (!value || typeof value !== 'object') return null
  const variant = (value as { variant?: unknown }).variant
  return variant === 'draft' || variant === 'changes' ? { variant } : null
}

/** What lib/mdx should read for a review: the draft itself, or a live item's pending revision. */
export function reviewReadOptions(review: ReviewRender): { includeDrafts: boolean; pending: boolean } {
  return review.variant === 'draft' ? { includeDrafts: true, pending: false } : { includeDrafts: false, pending: true }
}
