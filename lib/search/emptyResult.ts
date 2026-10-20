/**
 * The one place a search or an "Ask" question that found nothing is
 * reported (the critic's `search_empty` signal: what visitors look for and
 * the site does not answer).
 *
 * The ⌘K palette calls onEmptyResult() once per settled query that found
 * nothing (search mode: no page, action or content; Ask mode: no passage) —
 * never per keystroke, and never twice for the same query while the palette
 * is open. Privacy first, at the source: the query is normalised to at most
 * 40 characters, and a query that could identify a person — an e-mail
 * address ('@') or a number of 6+ digits (phone, ID) — is dropped. Nothing
 * else (no URL, no visitor identifier) is passed on.
 *
 * Listeners receive the DOM event SEARCH_EMPTY_EVENT on window
 * ({ query, mode }); the analytics client hooks in there with one line.
 */

export const SEARCH_EMPTY_EVENT = 'site:search-empty'

export type EmptyResultMode = 'search' | 'ask'

export type EmptyResultDetail = { query: string; mode: EmptyResultMode }

/** Longest query passed on (characters). */
export const EMPTY_QUERY_MAX = 40

/**
 * The query as it may be reported, or '' when it must not be: whitespace
 * collapsed, lower-cased, cut to EMPTY_QUERY_MAX characters; '' for an
 * e-mail-like or long-number query.
 */
export function normalizeEmptyQuery(query: unknown): string {
  if (typeof query !== 'string') return ''
  const q = query.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!q || q.includes('@') || /\d{6,}/.test(q.replace(/[\s().+-]/g, ''))) return ''
  return Array.from(q).slice(0, EMPTY_QUERY_MAX).join('').trim()
}

/**
 * Report a query that found nothing. Returns the detail that was dispatched,
 * or null when the query was dropped (empty, or personal data).
 */
export function onEmptyResult(query: string, mode: EmptyResultMode): EmptyResultDetail | null {
  const q = normalizeEmptyQuery(query)
  if (!q || typeof window === 'undefined') return null
  const detail: EmptyResultDetail = { query: q, mode }
  window.dispatchEvent(new CustomEvent<EmptyResultDetail>(SEARCH_EMPTY_EVENT, { detail }))
  return detail
}
