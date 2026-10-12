/**
 * Keyboard shortcut matching for the admin shell (pure — unit tested).
 *
 * Tab switching avoids every combination a browser reserves or an editor
 * already uses:
 *   - ⌘1–9 (macOS) and Ctrl+1–9 (Windows/Linux) switch browser tabs and
 *     can't be intercepted, so they are never used.
 *   - macOS: ⌃1–4 everywhere; ⌥1–4 outside text fields (inside one, Option
 *     + digit types characters such as ¡ ™ £).
 *   - Windows/Linux: Alt+1–4. Ctrl+Alt (AltGr) is left alone.
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

/** Label for the tab-switch hint, e.g. "⌃1–4" or "Alt+1–4". */
export function tabShortcutLabel(isMac: boolean, count: number): string {
  const range = count > 1 ? `1–${count}` : '1'
  return isMac ? `⌃${range}` : `Alt+${range}`
}

/** Label for one tab's shortcut, e.g. "⌃2" or "Alt+2". */
export function tabShortcutFor(isMac: boolean, index: number): string {
  return isMac ? `⌃${index + 1}` : `Alt+${index + 1}`
}
