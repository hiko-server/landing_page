/**
 * Command palette 4.0 — the framework-free parts (unit-tested):
 *
 *   - nested pages: Theme ›, CV ›, Contact › gather related actions out of
 *     the browse view, and Keyboard shortcuts › (also "?") lists every
 *     shortcut. Searching from the top still finds everything inside them;
 *   - which rows may be prefetched while they are highlighted;
 *   - the keys that leave a nested page;
 *   - the keyboard layer's rows of the shortcut sheet.
 */

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
