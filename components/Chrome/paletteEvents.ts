import type { PalettePage } from '../General-UI/paletteModel'

/**
 * Opening the ⌘K palette from page content (the 404 page's search field) and
 * from the keyboard layer ("/", "?": components/Chrome/KeyboardLayer.tsx).
 *
 * The palette belongs to the persistent header, which owns its state and its
 * lazily loaded chunk; a page asks for it with a DOM event instead of a
 * shared React context, so nothing new enters the shared bundle and a page
 * rendered without the chrome simply has no listener. `query` prefills the
 * search field, `page` opens a nested page ("?" → Keyboard shortcuts) and
 * `instant` skips the entrance animation (opened from the keyboard).
 */

export const OPEN_PALETTE_EVENT = 'site:open-command-palette'

export type OpenPaletteOptions = { page?: PalettePage | null; instant?: boolean }

export type OpenPaletteDetail = { query?: string } & OpenPaletteOptions

/** Longest query a page may prefill (the palette's field is a single line). */
export const PALETTE_QUERY_MAX = 80

/** A prefill value as the palette accepts it: a trimmed, single-line string, or ''. */
export function normalizePaletteQuery(query: unknown): string {
  if (typeof query !== 'string') return ''
  return query.replace(/\s+/g, ' ').trim().slice(0, PALETTE_QUERY_MAX)
}

/** The nested page an event may open: only the Keyboard shortcuts page is opened from outside. */
export function normalizePalettePage(page: unknown): PalettePage | null {
  return page === 'shortcuts' ? 'shortcuts' : null
}

/** Ask the header to open the palette (no-op on the server). */
export function openCommandPalette(query?: string, options: OpenPaletteOptions = {}): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<OpenPaletteDetail>(OPEN_PALETTE_EVENT, {
      detail: { query: normalizePaletteQuery(query), page: normalizePalettePage(options.page), instant: options.instant === true },
    }),
  )
}
