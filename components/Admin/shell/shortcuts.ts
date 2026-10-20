/**
 * Keyboard shortcut matching for the admin shell (pure — unit tested).
 *
 * Tab switching avoids every combination a browser reserves or an editor
 * already uses:
 *   - ⌘1–9 (macOS) and Ctrl+1–9 (Windows/Linux) switch browser tabs and
 *     can't be intercepted, so they are never used.
 *   - macOS: ⌃1–N everywhere; ⌥1–N outside text fields (inside one, Option
 *     + digit types characters such as ¡ ™ £).
 *   - Windows/Linux: Alt+1–N. Ctrl+Alt (AltGr) is left alone.
 *   - ⌘S / ⌘Z / ⌘⇧Z stay with the editors.
 */

export type KeyLike = {
  key: string
  code?: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

function digitOf(e: KeyLike): number | null {
  const m = (e.code || '').match(/^(?:Digit|Numpad)([1-9])$/)
  if (m) return Number(m[1])
  return /^[1-9]$/.test(e.key) ? Number(e.key) : null
}

/** Index of the tab a key event selects, or null when it isn't a tab shortcut. */
export function tabShortcutIndex(
  e: KeyLike,
  count: number,
  ctx: { isMac: boolean; inEditable: boolean }
): number | null {
  if (e.metaKey || e.shiftKey) return null
  const digit = digitOf(e)
  if (digit === null || digit > count) return null
  const ok = ctx.isMac
    ? (e.ctrlKey && !e.altKey) || (e.altKey && !e.ctrlKey && !ctx.inEditable)
    : e.altKey && !e.ctrlKey
  return ok ? digit - 1 : null
}

/** ⌘S / Ctrl+S (no Alt, no Shift). */
export function isSaveShortcut(e: KeyLike): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's'
}

/** Label for the tab-switch hint, e.g. "⌃1–6" or "Alt+1–6". */
export function tabShortcutLabel(isMac: boolean, count: number): string {
  const range = count > 1 ? `1–${count}` : '1'
  return isMac ? `⌃${range}` : `Alt+${range}`
}

/** Label for one tab's shortcut, e.g. "⌃2" or "Alt+2". */
export function tabShortcutFor(isMac: boolean, index: number): string {
  return isMac ? `⌃${index + 1}` : `Alt+${index + 1}`
}

/** "?" (Shift+/ on most layouts) outside text fields opens the shortcuts overlay. */
export function isHelpShortcut(e: KeyLike, inEditable: boolean): boolean {
  return !inEditable && e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey
}

export type ShortcutItem = { keys: string[]; label: string }
export type ShortcutGroup = { title: string; items: ShortcutItem[] }

/**
 * Every keyboard binding the admin actually implements, grouped for the "?"
 * overlay. Labels follow the platform: ⌘ / ⌥ / ⌃ on macOS, Ctrl / Alt
 * elsewhere.
 */
export function adminShortcutGroups(isMac: boolean, tabCount: number): ShortcutGroup[] {
  const mod = isMac ? '⌘' : 'Ctrl'
  const alt = isMac ? '⌥' : 'Alt'
  const range = tabCount > 1 ? `1–${tabCount}` : '1'
  const tabSwitch: ShortcutItem[] = isMac
    ? [
        { keys: ['⌃', range], label: 'Switch dashboard tab' },
        { keys: ['⌥', range], label: 'Switch dashboard tab (outside text fields)' },
      ]
    : [{ keys: ['Alt', range], label: 'Switch dashboard tab' }]
  return [
    {
      title: 'Everywhere in the admin',
      items: [
        { keys: ['?'], label: 'Show keyboard shortcuts' },
        { keys: [mod, 'S'], label: 'Save the open editor' },
        { keys: ['Esc'], label: 'Close a dialog or menu' },
      ],
    },
    { title: 'Dashboard', items: tabSwitch },
    {
      title: 'CV Studio',
      items: [
        { keys: [mod, 'Z'], label: 'Undo (EN + 中 history)' },
        { keys: isMac ? [mod, '⇧', 'Z'] : [mod, 'Y'], label: 'Redo' },
        { keys: ['Enter'], label: 'New bullet below' },
        { keys: ['Backspace'], label: 'Remove an empty bullet' },
        { keys: [alt, '↑ / ↓'], label: 'Move a bullet' },
        { keys: ['Enter'], label: 'Add the typed skill tag' },
      ],
    },
    {
      title: 'Inbox',
      items: [{ keys: ['↑ / ↓'], label: 'Previous / next message' }],
    },
    {
      title: 'Post & case study editor',
      items: [
        { keys: [mod, '⇧', 'P'], label: 'Toggle Write / Preview' },
        { keys: ['/'], label: 'Insert a block (slash menu)' },
        { keys: [mod, 'K'], label: 'Add or edit a link' },
        { keys: [mod, 'F'], label: 'Find & replace in the body' },
        { keys: ['Enter', '⇧ Enter'], label: 'Next / previous match' },
        { keys: [mod, 'Enter'], label: 'Replace all (in the replace field)' },
      ],
    },
  ]
}
