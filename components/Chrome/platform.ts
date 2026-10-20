import { isEditableTarget } from '../../lib/keyboardLayer'

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
 *   - Unless the visitor has a keyboard after all (a tablet with a keyboard
 *     case): the first key press only a hardware keyboard can make
 *     (noteKeyboardUse, from the visitor keyboard layer) marks <html> with
 *     `data-keyboard`, and the hints come back — "?" lists every shortcut
 *     instead of an empty page.
 */

/** Media query of a touch-first device (primary pointer is a finger). */
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

/** Attribute on <html> once a hardware keyboard has been used on this page. */
export const KEYBOARD_ATTR = 'data-keyboard'

/** Chakra `sx` that hides an element on touch-first devices — until a hardware keyboard is used. */
export const HIDE_ON_COARSE_POINTER = {
  [`@media ${COARSE_POINTER_QUERY}`]: { [`html:not([${KEYBOARD_ATTR}]) &`]: { display: 'none !important' } },
} as const

type KeyEventLike = {
  key?: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  isComposing?: boolean
  keyCode?: number
  target?: unknown
}

/**
 * True for a key press only a hardware keyboard makes: one outside a text
 * field (an on-screen keyboard is only open while a field has focus), with
 * ⌘ / Ctrl held, or Tab / Escape (keys on-screen keyboards do not have).
 * Composition, and the "Unidentified" / "Process" keys virtual keyboards
 * send, never count.
 */
export function isHardwareKeyEvent(e: KeyEventLike): boolean {
  if (e.isComposing === true || e.keyCode === 229) return false
  const key = e.key || ''
  if (!key || key === 'Unidentified' || key === 'Process' || key === 'Dead') return false
  if (e.metaKey || e.ctrlKey) return true
  if (key === 'Tab' || key === 'Escape') return true
  return !isEditableTarget(e.target)
}

/** Mark the page as used with a hardware keyboard (see the module comment). */
export function noteKeyboardUse(e: KeyEventLike): void {
  if (typeof document === 'undefined' || document.documentElement.hasAttribute(KEYBOARD_ATTR)) return
  if (isHardwareKeyEvent(e)) document.documentElement.setAttribute(KEYBOARD_ATTR, '')
}

/** True once a hardware keyboard has been used on this page. */
export function keyboardSeen(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute(KEYBOARD_ATTR)
}

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
