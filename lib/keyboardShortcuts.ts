/**
 * Visitor preference for single-character keyboard shortcuts (WCAG 2.1.4
 * Character Key Shortcuts, Level A): "/" opens the ⌘K palette, "G then a
 * letter" navigates, "E" opens the editor on a post, "?" shows the admin's
 * shortcut sheet. All of them can be turned off from the palette ("Keyboard
 * shortcuts: on/off") and from the admin "?" sheet; ⌘K / Ctrl+K and the
 * Alt / Ctrl + digit tab keys carry a modifier and stay on.
 *
 * The choice is stored in localStorage (per browser, never sent anywhere);
 * blocked or failing storage degrades to "on" for this page view. Framework-
 * free so it is unit-tested; components read it through useShortcutsEnabled.
 */

export const SHORTCUTS_STORAGE_KEY = 'kbd:shortcuts:v1'

const OFF = 'off'

type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Stored preference: false only when the visitor turned the shortcuts off. */
export function readShortcutsPreference(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(SHORTCUTS_STORAGE_KEY) !== OFF
  } catch {
    return true
  }
}

/** Persists the preference ("on" is the default, so it removes the entry); false when storage refused. */
export function writeShortcutsPreference(storage: KeyStore | null | undefined, enabled: boolean): boolean {
  if (!storage) return false
  try {
    if (enabled) storage.removeItem(SHORTCUTS_STORAGE_KEY)
    else storage.setItem(SHORTCUTS_STORAGE_KEY, OFF)
    return true
  } catch {
    return false
  }
}

/**
 * True while an input method editor is composing (Chinese, Japanese, Korean
 * input …): the key belongs to the composition, never to a shortcut.
 * keyCode 229 covers browsers that report the composing keydown that way.
 */
export function isImeComposing(e: { isComposing?: boolean; keyCode?: number }): boolean {
  return e.isComposing === true || e.keyCode === 229
}

// ── Live value shared by every listener on the page ───────────────────────────

let cached: boolean | null = null
const listeners = new Set<() => void>()

function localStore(): KeyStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Whether single-character shortcuts are on (read once, then kept in memory). */
export function getShortcutsEnabled(): boolean {
  if (cached === null) cached = readShortcutsPreference(localStore())
  return cached
}

/** Turns the shortcuts on or off for this browser and tells every subscriber. */
export function setShortcutsEnabled(enabled: boolean): void {
  writeShortcutsPreference(localStore(), enabled)
  if (cached === enabled) return
  cached = enabled
  listeners.forEach((fn) => fn())
}

function onStorage(e: StorageEvent): void {
  if (e.key !== null && e.key !== SHORTCUTS_STORAGE_KEY) return
  const next = e.key === null ? true : e.newValue !== OFF
  if (next === cached) return
  cached = next
  listeners.forEach((fn) => fn())
}

/** Subscribe to changes (this tab, and other tabs through the storage event). */
export function subscribeShortcuts(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

/** Forget the in-memory value (tests). */
export function resetShortcutsCache(): void {
  cached = null
}
