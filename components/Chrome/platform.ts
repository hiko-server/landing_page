/**
 * Keyboard-hint helpers shared by the header, the ⌘K palette and the 404
 * page (framework-free, unit-tested in tests/chrome-identity.test.ts).
 *
 *   - The palette shortcut reads ⌘K on Apple platforms and Ctrl K elsewhere.
 *   - On a coarse primary pointer (a phone, a tablet without a trackpad)
 *     keyboard hints are noise: HIDE_ON_COARSE_POINTER removes them with a
 *     media query, so the server HTML is right on the first paint and no
 *     script has to run. `display: none` also takes them out of the
 *     accessibility tree, where a hint for a key the visitor does not have
 *     would only add words.
 */

/** Media query of a touch-first device (primary pointer is a finger). */
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

/** Chakra `sx` that hides an element on touch-first devices. */
export const HIDE_ON_COARSE_POINTER = {
  [`@media ${COARSE_POINTER_QUERY}`]: { display: 'none !important' },
} as const

type NavigatorLike = {
  platform?: string
  userAgent?: string
  userAgentData?: { platform?: string } | null
}

/**
 * True on macOS, iOS and iPadOS (where the palette key is ⌘ rather than
 * Ctrl). User-Agent Client Hints name the platform where they exist
 * ("macOS", "iOS", "Windows", "Android"); otherwise navigator.platform
 * ("MacIntel", "iPhone") or, last, the user-agent string.
 */
export function isApplePlatform(nav: NavigatorLike | null | undefined): boolean {
  if (!nav) return false
  const hint = nav.userAgentData?.platform || nav.platform || nav.userAgent || ''
  return /mac|iphone|ipad|ipod|\bios\b/i.test(hint)
}

/** Visible label of the palette shortcut. */
export function paletteShortcutLabel(apple: boolean): string {
  return apple ? '⌘K' : 'Ctrl K'
}

/** aria-keyshortcuts value of the palette shortcut (plus "/" while single-key shortcuts are on). */
export function paletteKeyShortcuts(apple: boolean, singleKeyOn: boolean): string {
  return `${apple ? 'Meta+K' : 'Control+K'}${singleKeyOn ? ' /' : ''}`
}
