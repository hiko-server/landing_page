import { isEditableTarget } from '../../lib/keyboardLayer'
import { KEYBOARD_ATTR } from './platform'

/**
 * A hardware keyboard on a touch-first device (./platform.ts: the keyboard
 * hints hidden on touch screens come back once one is used). Kept apart from
 * ./platform, which the header — and so every page's shared bundle —
 * imports: only the visitor keyboard layer and the palette, both loaded on
 * demand, need it.
 */

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
