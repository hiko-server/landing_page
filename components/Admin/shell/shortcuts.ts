import { NAV_SHORTCUTS } from '../../Chrome/chrome'
import { ADMIN_CHORDS } from './adminCommands'

const PUBLIC_PAGE_LABEL: Record<string, string> = { '/': 'Home page', '/about': 'About', '/work': 'Work', '/blog': 'Writing', '/cv': 'CV', '/now': 'Now', '/uses': 'Uses' }

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

export const EDITOR_GROUP_TITLE = 'Post & case study editor'

/**
 * Every keyboard binding the admin actually implements, grouped for the "?"
 * overlay. Labels follow the platform: ⌘ / ⌥ / ⌃ on macOS, Ctrl / Alt
 * elsewhere. Single-letter keys (G chords, list and Inbox keys, "?") follow
 * the shortcut switch (lib/keyboardShortcuts).
 */
export function adminShortcutGroups(isMac: boolean, tabCount: number): ShortcutGroup[] {
  const mod = isMac ? '⌘' : 'Ctrl'
  const alt = isMac ? '⌥' : 'Alt'
  const enter = isMac ? '↵' : 'Enter'
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
        { keys: [mod, 'K'], label: 'Command menu: go anywhere, run an action' },
        { keys: [mod, 'S'], label: 'Save the open editor' },
        { keys: ['Esc'], label: 'Close a dialog or menu' },
      ],
    },
    {
      title: 'Go to (G, then a letter)',
      items: ADMIN_CHORDS.map((c) => ({ keys: ['G', c.key.toUpperCase()], label: c.label })),
    },
    {
      title: 'Go to the site (G, then a letter)',
      items: NAV_SHORTCUTS.map((n) => ({ keys: ['G', n.key.toUpperCase()], label: PUBLIC_PAGE_LABEL[n.url] || n.url })),
    },
    {
      title: 'Lists',
      items: [
        { keys: ['J', 'K'], label: 'Next / previous item' },
        { keys: ['↑ / ↓'], label: 'Previous / next item' },
        { keys: ['Home', 'End'], label: 'First / last item' },
        { keys: ['Enter'], label: 'Open the item (also O)' },
        { keys: ['X'], label: 'Select the message (Inbox)' },
      ],
    },
    { title: 'Dashboard', items: tabSwitch },
    {
      title: 'Inbox',
      items: [
        { keys: ['R'], label: 'Reply' },
        { keys: ['S'], label: 'Star / unstar' },
        { keys: ['E'], label: 'Archive (or move back to the inbox)' },
        { keys: ['U'], label: 'Mark read / unread' },
        { keys: ['#'], label: 'Delete (with Undo)' },
        { keys: [mod, 'Z'], label: 'Undo the last delete or archive' },
        { keys: [mod, enter], label: 'Send the reply' },
      ],
    },
    {
      title: 'Content health',
      items: [{ keys: ['F'], label: 'Apply the focused issue’s safe fix' }],
    },
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
      title: EDITOR_GROUP_TITLE,
      items: [
        { keys: [mod, '⇧', 'P'], label: 'Toggle Write / Preview' },
        { keys: ['/'], label: 'Insert a block (slash menu)' },
        { keys: [mod, 'K'], label: 'Add or edit a link' },
      ],
    },
  ]
}

/** Case-insensitive search over a binding's label, its keys and its group ("" keeps everything). */
export function filterShortcutGroups(groups: ShortcutGroup[], query: string): ShortcutGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return groups
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        const text = `${g.title} ${it.label} ${it.keys.join(' ')}`.toLowerCase()
        return words.every((w) => text.includes(w))
      }),
    }))
    .filter((g) => g.items.length > 0)
}
