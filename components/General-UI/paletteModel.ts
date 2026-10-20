/**
 * Command palette 4.0 — the framework-free parts (unit-tested):
 *
 *   - nested pages: Theme ›, CV ›, Contact › gather related actions out of
 *     the browse view, and Keyboard shortcuts › (also "?") lists every
 *     shortcut. Searching from the top still finds everything inside them;
 *   - which rows may be prefetched while they are highlighted;
 *   - the keys that leave a nested page;
 *   - where a search's "Ask: …" row goes, and what Enter acts on;
 *   - the keyboard layer's rows of the shortcut sheet.
 */

import { isExplicitQuestion } from '../../lib/search/text'

export type PalettePage = 'theme' | 'cv' | 'contact' | 'shortcuts'

/** How the palette was opened: from the keyboard it appears at once (no entrance animation). */
export type PaletteOpener = 'keyboard' | 'pointer'

export const PALETTE_PAGES: readonly PalettePage[] = ['theme', 'cv', 'contact', 'shortcuts']

export const PAGE_TITLES: Record<PalettePage, string> = {
  theme: 'Theme',
  cv: 'CV',
  contact: 'Contact',
  shortcuts: 'Keyboard shortcuts',
}

/** Grouping-relevant fields of a palette item. */
export type PageMember = {
  /** The nested page the item lives in (shown there; hidden from the browse view, still found by a search from the top). */
  page?: PalettePage
  /** Only inside its page: never a search result from the top (it repeats a top-level item, e.g. "View the CV"). */
  nestedOnly?: boolean
  /** An entry that opens this page instead of running something. */
  opens?: PalettePage
}

/** Items of the browse view (no query) on `page` (null = the top level). */
export function browseItems<T extends PageMember>(items: readonly T[], page: PalettePage | null): T[] {
  return page === null ? items.filter((i) => !i.page) : items.filter((i) => i.page === page)
}

/** Items a query searches on `page`: everything but page-only repeats at the top level, the page's own items inside it. */
export function searchableItems<T extends PageMember>(items: readonly T[], page: PalettePage | null): T[] {
  return page === null ? items.filter((i) => !i.nestedOnly) : items.filter((i) => i.page === page)
}

/** What a key in the search field does on a nested page: go back to the top level, or nothing special. */
export function pageKeyAction(key: string, query: string, page: PalettePage | null): 'back' | null {
  if (page === null) return null
  if (key === 'Escape') return 'back'
  if (key === 'Backspace' && query === '') return 'back'
  return null
}

/**
 * Where a search's "Ask: …" row goes (J1): first for a query phrased as a
 * question (a question word or mark, 他有…吗), after the results otherwise.
 * While the posts and projects are still loading, a query that is not a
 * question gets no Ask row yet: it would stand alone at the top — the row
 * Enter takes — for a title whose page is about to be found.
 */
export function askRowPlacement(query: string, contentLoading: boolean): 'first' | 'last' | 'none' {
  if (isExplicitQuestion(query)) return 'first'
  return contentLoading ? 'none' : 'last'
}

/** What Enter does in Search: run a row, wait for the posts and projects, or nothing. */
export type EnterChoice<T> = { kind: 'run'; row: T } | { kind: 'wait' } | { kind: 'none' }

export type EnterContext<T> = {
  /** The field's text, trimmed. */
  query: string
  /** The rows for that text: the list on screen when it shows this text, else ranked just now. */
  rows: readonly T[]
  /** The highlighted row when the list on screen shows this text; null while it lags behind the field (the first row then). */
  active: number | null
  /** The posts and projects are still loading (a search at the top level). */
  contentLoading: boolean
  /** True for the "Ask: …" row. */
  isAskRow: (row: T) => boolean
  /** An Enter pressed while they were loading, carried out now that they are in (or failed to come). */
  queued?: boolean
}

/**
 * What Enter acts on in Search: what the visitor sees — or would see — for
 * the text in the field. The highlighted row of a list that shows that text;
 * the first row ranked for it when the (deferred) list lags behind. It never
 * switches to Ask for a query that is not phrased as a question unless the
 * visitor has seen the "Ask: …" row on its own: while the posts and projects
 * load it waits for them, and an Enter carried out once they are in opens a
 * result or nothing — a typed title opens its page.
 */
export function resolveEnter<T>(ctx: EnterContext<T>): EnterChoice<T> {
  const row = ctx.active === null ? ctx.rows[0] : ctx.rows[ctx.active]
  const unseenAsk = !!row && ctx.isAskRow(row) && !isExplicitQuestion(ctx.query) && (ctx.contentLoading || !!ctx.queued)
  if (row && !unseenAsk) return { kind: 'run', row }
  return ctx.contentLoading && !ctx.queued ? { kind: 'wait' } : { kind: 'none' }
}

/** Paths a prefetch must never warm: API routes, feeds and files, and the admin. */
const NOT_PREFETCHED = /^\/(?:api|admin)(?:\/|$|\?)|\.(?:pdf|xml|json|vcf|txt)(?:$|[?#])/i

/** True for a same-site page worth prefetching while its row is highlighted. */
export function isPrefetchableHref(href: string | undefined, external = false): boolean {
  if (!href || external) return false
  if (!href.startsWith('/') || href.startsWith('//')) return false
  return !NOT_PREFETCHED.test(href)
}

/** A highlighted row is prefetched once it has stayed highlighted this long (ms): arrowing past rows costs nothing. */
export const PREFETCH_DELAY_MS = 120

export type ShortcutRow = {
  /** Key of the row's words in lib/uiStrings/palette (layerRows). */
  id: 'search' | 'help' | 'list' | 'open' | 'article' | 'theme'
  keys: readonly string[]
  label: string
}

/**
 * The keyboard layer's keys (lib/keyboardLayer.ts) as the Keyboard shortcuts
 * page lists them; the "G then …" rows come from NAV_SHORTCUTS.
 */
export const LAYER_SHORTCUT_ROWS: readonly ShortcutRow[] = [
  { id: 'search', keys: ['/'], label: 'Search' },
  { id: 'help', keys: ['?'], label: 'Every shortcut (this page)' },
  { id: 'list', keys: ['J', 'K'], label: 'Next / previous item in a list' },
  { id: 'open', keys: ['↵'], label: 'Open the selected item' },
  { id: 'article', keys: ['[', ']'], label: 'Previous / next article' },
  { id: 'theme', keys: ['T'], label: 'Switch light / dark' },
]
