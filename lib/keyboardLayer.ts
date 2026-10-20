/**
 * The visitor keyboard layer — which keydown is a layer key (framework-free,
 * unit-tested). components/Chrome/KeyboardLayer.tsx listens; the work of
 * the keys that need more than opening the palette lives in a chunk of its
 * own (components/Chrome/keyboardLayerActions.ts, with the arithmetic in
 * lib/keyboardNavigation.ts), fetched while the browser is idle.
 *
 *   /          open the ⌘K palette
 *   ?          open the palette on its Keyboard shortcuts page
 *   G then …   go to a page (components/Chrome/chrome.ts NAV_SHORTCUTS); a
 *              hint lists the second keys when G is held a moment
 *   J / K      next / previous item of the list on screen (/blog, /work,
 *              /publications); Enter opens it (the item's link has focus)
 *   [ / ]      previous / next article (the article's pager)
 *   T          switch between light and dark
 *
 * All of them are single-character shortcuts (WCAG 2.1.4): none fires while
 * the visitor has turned them off (lib/keyboardShortcuts), inside a text
 * field or an open dialog / menu, with a modifier held, or while an input
 * method is composing. ⌘K / Ctrl+K (components/Header/Header.tsx) carries a
 * modifier and always works.
 */

/** A key of the layer, as the listener classifies it. */
export type LayerKey = '/' | '?' | 'g' | 'j' | 'k' | '[' | ']' | 't' | 'other'

type KeyEventLike = {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  repeat?: boolean
  defaultPrevented?: boolean
  isComposing?: boolean
  keyCode?: number
  target?: unknown
}

type ElementLike = {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => unknown
}

/** Text fields, editable content and selects keep every key for themselves. */
export function isEditableTarget(target: unknown): boolean {
  const el = target as ElementLike | null | undefined
  if (!el || typeof el !== 'object') return false
  return el.isContentEditable === true || /^(INPUT|TEXTAREA|SELECT)$/.test(String(el.tagName || ''))
}

/**
 * Widgets that own the keyboard while focused: a dialog (the palette, the
 * mobile menu, the lightbox), a menu (the theme menu), a listbox, a tab list.
 */
export const KEY_OWNER_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tablist"], [role="grid"]'

/** True when the focused element sits inside a widget that owns the keyboard. */
export function insideKeyOwner(target: unknown): boolean {
  const el = target as ElementLike | null | undefined
  if (!el || typeof el.closest !== 'function') return false
  try {
    return !!el.closest(KEY_OWNER_SELECTOR)
  } catch {
    return false
  }
}

/**
 * The layer key a keydown stands for, or null when the layer must leave it
 * alone (modifier held, already handled, typing, IME composition, a widget
 * that owns the keyboard). Auto-repeat only moves through a list.
 */
export function layerKeyOf(e: KeyEventLike): LayerKey | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return null
  if (e.isComposing === true || e.keyCode === 229) return null
  if (isEditableTarget(e.target) || insideKeyOwner(e.target)) return null
  const key = e.key
  if (e.repeat && key !== 'j' && key !== 'k') return null
  switch (key) {
    case '/':
    case '?':
    case 'g':
    case 'j':
    case 'k':
    case '[':
    case ']':
    case 't':
      return key
    default:
      // A plain character key: it ends a pending "G then …" without acting.
      return key.length === 1 ? 'other' : null
  }
}
