import { normalizeSearchQuery } from './eventsShared'
import { sendGoal } from './goalBeacon'

/**
 * search_empty (critic correction to H9): what visitors look for in the ⌘K
 * palette and do not find. Imported by the palette chunk only.
 *
 * The palette reports every change of its query and result count:
 *
 *   noteSearchResults(query, results, active)
 *
 * `active` is false while the palette is closed or its content index has not
 * loaded (a search without the index is not a real "no results"). A query
 * with zero results is sent only once the visitor stopped typing for
 * SETTLE_MS, or at once when the palette closes on it; typing on, clearing
 * the field or finding results cancels it. The text is normalised and
 * filtered first (lib/analytics/eventsShared normalizeSearchQuery:
 * lowercased, ≤ 40 characters, nothing with an '@' or six or more digits),
 * and each text is sent at most once per page view.
 */

export const SETTLE_MS = 1500

let pending: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let sentFor = ''
const sent = new Set<string>()

function cancel() {
  if (timer) clearTimeout(timer)
  timer = null
  pending = null
}

function flush() {
  const query = pending
  cancel()
  if (query === null) return
  if (sentFor !== location.pathname) {
    sentFor = location.pathname
    sent.clear()
  }
  if (sent.has(query)) return
  sent.add(query)
  sendGoal('search_empty', query)
}

export function noteSearchResults(query: string, results: number, active: boolean): void {
  if (typeof window === 'undefined') return
  if (!active) {
    // Closed with a pending no-result search: that search is final.
    if (pending !== null) flush()
    return
  }
  const normalized = results === 0 ? normalizeSearchQuery(query) : null
  if (normalized === null) return cancel()
  if (timer) clearTimeout(timer)
  pending = normalized
  timer = setTimeout(flush, SETTLE_MS)
}
