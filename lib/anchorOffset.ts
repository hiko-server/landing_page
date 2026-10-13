/**
 * Where a jump target lands below the sticky site header.
 *
 * The offset lives on the targets, as scroll-margin-top — never as
 * html { scroll-padding-top }: a root scroll padding also covers the sticky
 * header's own controls, so focus moving into the header (closing the menu
 * or the ⌘K palette, Tab / Shift+Tab) scrolled the page to "reveal" what was
 * already on screen. styles/globals.css gives every potential target inside
 * <main id="main"> HEADER_CLEARANCE with zero specificity; a component that
 * wants a little more air above its anchors (headings, sections, CV entries,
 * footnotes) sets clearOfHeader(air), which replaces that default.
 *
 * --header-h is the header's rendered height, kept measured on <html> by
 * components/Chrome/SiteChrome.tsx (57px in the server HTML).
 */

/** The default: the header's height plus 16px. */
export const HEADER_CLEARANCE = 'calc(var(--header-h) + 16px)'

/** The default clearance plus `air` (a CSS length) above an anchor target. */
export function clearOfHeader(air: string): string {
  return `calc(var(--header-h) + 16px + ${air})`
}
