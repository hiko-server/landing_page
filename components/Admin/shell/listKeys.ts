/**
 * Keyboard model of the admin's lists (pure — unit tested; used by
 * useListKeyboard): the Inbox, Activity, Content health, Errors.
 *
 *   j / ↓   next item          k / ↑   previous item
 *   Home    first item         End     last item
 *   Enter   open the item      o       open the item
 *   x       select / unselect (lists with bulk actions)
 *   any key in `actions`       that list's own action on the item (e, s, r, …)
 *
 * Arrows, Home, End and Enter are ordinary widget keys and always work.
 * Single-character keys follow the visitor's shortcut switch (WCAG 2.1.4,
 * lib/keyboardShortcuts) and never fire with a modifier, inside a text field
 * or during IME composition.
 */

export type ListKeyEvent = {
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
  keyCode?: number
}

export type ListKeyContext = {
  count: number
  /** Index of the item with the roving focus (-1 = none yet). */
  active: number
  /** Single-character shortcuts on (lib/keyboardShortcuts). */
  singleKeys: boolean
  /** The event came from a text field (input, textarea, contenteditable). */
  inEditable: boolean
  /** Keys this list maps to its own actions ("e", "s", "#", "Delete", …). */
  actions?: readonly string[]
  /** The list supports selecting several items (x). */
  selectable?: boolean
}

export type ListKeyAction =
  | { type: 'move'; to: number }
  | { type: 'open'; index: number }
  | { type: 'select'; index: number }
  | { type: 'action'; key: string; index: number }

const clamp = (i: number, count: number) => Math.min(count - 1, Math.max(0, i))

/** Keys that are not single printable characters and so need no shortcut switch. */
const WIDGET_ACTION_KEYS = new Set(['Delete', 'Backspace'])

export function listKeyAction(e: ListKeyEvent, ctx: ListKeyContext): ListKeyAction | null {
  if (e.isComposing || e.keyCode === 229) return null
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (ctx.inEditable || ctx.count <= 0) return null
  const from = ctx.active >= 0 && ctx.active < ctx.count ? ctx.active : -1
  const next = (delta: number) => ({ type: 'move' as const, to: from === -1 ? 0 : clamp(from + delta, ctx.count) })
  switch (e.key) {
    case 'ArrowDown':
      return next(1)
    case 'ArrowUp':
      return next(-1)
    case 'Home':
      return { type: 'move', to: 0 }
    case 'End':
      return { type: 'move', to: ctx.count - 1 }
    case 'Enter':
      return from === -1 ? null : { type: 'open', index: from }
    default:
      break
  }
  if (WIDGET_ACTION_KEYS.has(e.key) && ctx.actions?.includes(e.key)) {
    return from === -1 ? null : { type: 'action', key: e.key, index: from }
  }
  if (!ctx.singleKeys || e.key.length !== 1) return null
  const k = e.key === 'J' || e.key === 'K' || e.key === 'X' || e.key === 'O' ? e.key.toLowerCase() : e.key
  if (k === 'j') return next(1)
  if (k === 'k') return next(-1)
  if (from === -1) return null
  if (k === 'o') return { type: 'open', index: from }
  if (k === 'x' && ctx.selectable) return { type: 'select', index: from }
  if (ctx.actions?.includes(e.key)) return { type: 'action', key: e.key, index: from }
  return null
}

/** True when a keydown target is a text-entry element (where letters must type). */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return !!el.closest(
    'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]',
  )
}
