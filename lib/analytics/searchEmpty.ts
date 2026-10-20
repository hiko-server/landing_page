import { normalizeSearchQuery } from './eventsShared'
import { sendGoal } from './goalBeacon'
import { SEARCH_EMPTY_EVENT, type EmptyResultDetail } from '../search/emptyResult'

/**
 * search_empty (critic correction to H9): what visitors look for in the ⌘K
 * palette and do not find. Imported by the palette chunk only.
 *
 * The palette decides WHEN a search or an "Ask" question has found nothing
 * (lib/search/emptyResult onEmptyResult: once the query rested, once per
 * query while the palette is open, mode-aware) and dispatches
 * SEARCH_EMPTY_EVENT on window with the already normalised text. This module
 * is the one listener that turns it into the goal event:
 *
 *   const stop = listenSearchEmpty()   // in the palette, while mounted
 *
 * The text passes normalizeSearchQuery once more (lib/analytics/eventsShared:
 * NFKC, lowercased, ≤ 40 characters, nothing with an '@' or six or more
 * digits) and each text is sent at most once per page view, whichever mode
 * it came from.
 */

let sentFor = ''
const sent = new Set<string>()

/** Report one empty search or question (the event's detail); returns whether a goal was sent. */
export function reportSearchEmpty(detail: EmptyResultDetail | null | undefined): boolean {
  if (typeof window === 'undefined' || !detail) return false
  const query = normalizeSearchQuery(detail.query)
  if (query === null) return false
  if (sentFor !== location.pathname) {
    sentFor = location.pathname
    sent.clear()
  }
  if (sent.has(query)) return false
  sent.add(query)
  sendGoal('search_empty', query)
  return true
}

/** Listen for the palette's empty-result events; returns the unsubscribe. */
export function listenSearchEmpty(): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onEmpty = (e: Event) => reportSearchEmpty((e as CustomEvent<EmptyResultDetail>).detail)
  window.addEventListener(SEARCH_EMPTY_EVENT, onEmpty)
  return () => window.removeEventListener(SEARCH_EMPTY_EVENT, onEmpty)
}
