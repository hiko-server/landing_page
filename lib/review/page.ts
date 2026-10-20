import { fillUi, uiLangOf, uiText } from '../uiStrings'
import { REVIEW_UI, type ReviewStrings } from '../uiStrings/review'
import { acceptLanguageUi, formatReviewTime } from './format'
import { resolveReviewToken, reviewTarget, type ReviewCollection, type ReviewLink, type ReviewVariant } from './store'

/**
 * What /review/<token> answers (H5, pages/review/[token]) — decided here,
 * server-side and testable, so the page itself only renders:
 *
 *   render       an active link whose draft / changes still exist
 *   redirect     an active link whose item is public by now (published, or
 *                its changes went live or were dropped) → its public page
 *   unavailable  expired or turned off (410), unknown or forged (404),
 *                emptied — the draft deleted or unpublished again (410) —
 *                too many failed look-ups (429), no key configured (503);
 *                in the reader's language, saying nothing about the draft
 */

export type ReviewUnavailableText = { eyebrow: string; title: string; body: string; home: string; lang: string }

export type ReviewDecision =
  | { kind: 'render'; collection: ReviewCollection; slug: string; variant: ReviewVariant; link: ReviewLink }
  | { kind: 'redirect'; destination: string }
  | { kind: 'unavailable'; status: 404 | 410 | 429 | 503; text: ReviewUnavailableText }

type Reason = 'expired' | 'revoked' | 'unknown' | 'gone' | 'unavailable'

const COPY: Record<Reason, { title: keyof ReviewStrings; body: keyof ReviewStrings; status: 404 | 410 | 503 }> = {
  expired: { title: 'expiredTitle', body: 'expiredBody', status: 410 },
  revoked: { title: 'revokedTitle', body: 'revokedBody', status: 410 },
  unknown: { title: 'unknownTitle', body: 'unknownBody', status: 404 },
  gone: { title: 'goneTitle', body: 'goneBody', status: 410 },
  unavailable: { title: 'unavailableTitle', body: 'unavailableBody', status: 503 },
}

/** The interface language of a page language as a `lang` attribute ('en', 'zh-Hans', 'zh-Hant'). */
const langAttr = (lang: string) => uiLangOf(lang)

export function unavailableText(reason: Reason, readerLang: string, values: Record<string, string> = {}): ReviewUnavailableText {
  const ui = uiText(REVIEW_UI, readerLang)
  const copy = COPY[reason]
  return { eyebrow: ui.eyebrow, title: ui[copy.title], body: fillUi(ui[copy.body], values), home: ui.home, lang: langAttr(readerLang) }
}

export type DecideOptions = {
  /** The request's Accept-Language (the language of an "unavailable" page). */
  acceptLanguage?: string | string[]
  /** Count a failed look-up against the client; false when it is over its limit. */
  allowMiss: () => boolean
  now?: number
}

export function decideReview(token: unknown, opts: DecideOptions): ReviewDecision {
  const now = opts.now ?? Date.now()
  const readerLang = acceptLanguageUi(opts.acceptLanguage)
  const unavailable = (reason: Reason, values: Record<string, string> = {}, status?: 429): ReviewDecision => ({
    kind: 'unavailable',
    status: status ?? COPY[reason].status,
    text: unavailableText(reason, readerLang, values),
  })
  const resolved = resolveReviewToken(token, now)
  if (resolved.status === 'unavailable') return unavailable('unavailable')
  if (resolved.status !== 'ok') {
    // Only failed look-ups count against the client.
    if (!opts.allowMiss()) return unavailable('unknown', {}, 429)
    if (resolved.status === 'unknown') return unavailable('unknown')
    if (resolved.status === 'revoked') return unavailable('revoked')
    return unavailable('expired', { when: formatReviewTime(resolved.link.expiresAt, readerLang) })
  }
  const target = reviewTarget(resolved.link)
  if (target.kind === 'public') return { kind: 'redirect', destination: target.path }
  if (target.kind === 'gone') return unavailable('gone')
  return { kind: 'render', collection: target.collection, slug: target.slug, variant: target.variant, link: resolved.link }
}

export type ReviewChromeText = { word: string; note: string; expires: string; label: string; lang: string }

/** The watermark and bar words for a rendered link, in the article's language. */
export function reviewChromeText(link: Pick<ReviewLink, 'expiresAt'>, variant: ReviewVariant, pageLang: string): ReviewChromeText {
  const ui = uiText(REVIEW_UI, pageLang)
  return {
    word: ui.preview,
    note: variant === 'draft' ? ui.draftNote : ui.changesNote,
    expires: fillUi(ui.expires, { when: formatReviewTime(link.expiresAt, pageLang) }),
    label: ui.barLabel,
    lang: langAttr(pageLang),
  }
}
