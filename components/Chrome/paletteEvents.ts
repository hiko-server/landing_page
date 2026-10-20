import type { PalettePage } from '../General-UI/paletteModel'

/**
 * Opening the ⌘K palette from page content (the 404 page's search field, the
 * "Ask Lucian" entry on /about and /contact) and from the keyboard layer
 * ("/", "?": components/Chrome/KeyboardLayer.tsx).
 *
 * The palette belongs to the persistent header, which owns its state and its
 * lazily loaded chunk; a page asks for it with a DOM event instead of a
 * shared React context, so nothing new enters the shared bundle and a page
 * rendered without the chrome simply has no listener. `query` prefills the
 * search field, `page` opens a nested page ("?" → Keyboard shortcuts),
 * `instant` skips the entrance animation (opened from the keyboard) and
 * `mode` 'ask' opens it in Ask mode (answers quoted from the site,
 * components/Search/AskView).
 */

export const OPEN_PALETTE_EVENT = 'site:open-command-palette'

/** The palette's two modes: search pages and content, or ask a question. */
export type PaletteMode = 'search' | 'ask'

export type OpenPaletteOptions = { page?: PalettePage | null; instant?: boolean; mode?: PaletteMode }

export type OpenPaletteDetail = { query?: string } & OpenPaletteOptions

/** A mode as the palette accepts it ('search' unless exactly 'ask'). */
export function normalizePaletteMode(mode: unknown): PaletteMode {
  return mode === 'ask' ? 'ask' : 'search'
}

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

/**
 * Ask the header to open the palette (no-op on the server). The second
 * argument is an options object; a bare mode (`openCommandPalette(q, 'ask')`)
 * is accepted as shorthand for `{ mode: 'ask' }`.
 */
export function openCommandPalette(query?: string, options: OpenPaletteOptions | PaletteMode = {}): void {
  if (typeof window === 'undefined') return
  const opts: OpenPaletteOptions = typeof options === 'string' ? { mode: options } : options
  const detail: OpenPaletteDetail = {
    query: normalizePaletteQuery(query),
    page: normalizePalettePage(opts.page),
    instant: opts.instant === true,
  }
  if (normalizePaletteMode(opts.mode) === 'ask') detail.mode = 'ask'
  window.dispatchEvent(new CustomEvent<OpenPaletteDetail>(OPEN_PALETTE_EVENT, { detail }))
}
