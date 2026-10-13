/**
 * Opening the ⌘K palette from page content (the 404 page's search field).
 *
 * The palette belongs to the persistent header, which owns its state and its
 * lazily loaded chunk; a page asks for it with a DOM event instead of a
 * shared React context, so nothing new enters the shared bundle and a page
 * rendered without the chrome simply has no listener. `query` prefills the
 * search field.
 */

export const OPEN_PALETTE_EVENT = 'site:open-command-palette'

export type OpenPaletteDetail = { query?: string }

/** Longest query a page may prefill (the palette's field is a single line). */
export const PALETTE_QUERY_MAX = 80

/** A prefill value as the palette accepts it: a trimmed, single-line string, or ''. */
export function normalizePaletteQuery(query: unknown): string {
  if (typeof query !== 'string') return ''
  return query.replace(/\s+/g, ' ').trim().slice(0, PALETTE_QUERY_MAX)
}

/** Ask the header to open the palette (no-op on the server). */
export function openCommandPalette(query?: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<OpenPaletteDetail>(OPEN_PALETTE_EVENT, { detail: { query: normalizePaletteQuery(query) } }))
}
