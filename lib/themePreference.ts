import type { ColorModeProviderProps } from '@chakra-ui/react'

type StorageManager = NonNullable<ColorModeProviderProps['colorModeManager']>

/**
 * Theme preference: System / Light / Dark (pure, client-safe; no React).
 *
 * The visitor's PREFERENCE (`system` | `light` | `dark`) is stored in
 * localStorage under `theme-preference`; the colour MODE on screen
 * (`light` | `dark`) is derived from it — for `system`, from
 * `prefers-color-scheme`. Nothing is stored until the visitor chooses
 * (unlike Chakra's own script, which wrote the default on every first visit).
 * A preference is not an identifier: it never leaves the browser.
 *
 *   - THEME_PREPAINT_SCRIPT (lib/themePrepaint.ts — kept out of this module
 *     so the client bundle does not carry it; pages/_document.tsx inlines it)
 *     resolves the mode and sets `data-theme`, `color-scheme`, Chakra's body
 *     class and `data-theme-preference` on <html> — so every semantic token
 *     (CSS variables keyed off data-theme) is right on the first frame, on
 *     static and ISR pages alike, with no flash and no hydration mismatch
 *     (React never renders <html> attributes; the server HTML is
 *     mode-agnostic).
 *   - themePreferenceManager is Chakra's colour-mode storage manager: it
 *     answers with the resolved mode and turns Chakra's own writes (the
 *     header toggle, the mobile drawer's toggle) into an explicit
 *     light / dark preference — but never overwrites `system` with the mode
 *     it currently resolves to.
 *   - commitThemePreference / subscribeThemePreference / getThemePreference
 *     are a tiny external store (useSyncExternalStore) for the menu, the ⌘K
 *     palette and the system / other-tab listeners
 *     (components/Chrome/useThemePreference.ts).
 *
 * The default for visitors without a preference is NEXT_PUBLIC_DEFAULT_THEME
 * (build time; `dark`, the brand look, when unset — decisions.md B2).
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ColorMode = 'light' | 'dark'

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']
export const THEME_PREFERENCE_KEY = 'theme-preference'
/** Chakra's key: holds 'light' for visitors who toggled before preferences existed. */
export const LEGACY_COLOR_MODE_KEY = 'chakra-ui-color-mode'
export const THEME_PREFERENCE_ATTRIBUTE = 'data-theme-preference'
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

export function parseThemePreference(value: unknown): ThemePreference | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null
}

/** NEXT_PUBLIC_DEFAULT_THEME when valid, else dark (the brand default). */
export function defaultThemePreference(env: string | undefined = process.env.NEXT_PUBLIC_DEFAULT_THEME): ThemePreference {
  return parseThemePreference(env?.trim().toLowerCase()) ?? 'dark'
}

export const DEFAULT_THEME_PREFERENCE: ThemePreference = defaultThemePreference()

/** The colour mode a preference shows. */
export function resolveColorMode(preference: ThemePreference, systemDark: boolean): ColorMode {
  if (preference === 'system') return systemDark ? 'dark' : 'light'
  return preference
}

/** The mode the server renders the first frame with (only CSS variables depend on it). */
export function serverColorMode(fallback: ThemePreference = DEFAULT_THEME_PREFERENCE): ColorMode {
  return fallback === 'light' ? 'light' : 'dark'
}

// ── Client store ────────────────────────────────────────────────────────────

const listeners = new Set<() => void>()

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** True when the operating system asks for dark (false when it cannot be read). */
export function systemPrefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(SYSTEM_DARK_QUERY).matches
  } catch {
    return false
  }
}

/**
 * The current preference: the attribute the pre-paint script (which reads
 * storage, lib/themePrepaint.ts) or the last commit put on <html>; the
 * default when it is missing. A string, so it is a stable
 * useSyncExternalStore snapshot.
 */
export function getThemePreference(): ThemePreference {
  if (typeof document === 'undefined') return DEFAULT_THEME_PREFERENCE
  return parseThemePreference(document.documentElement.getAttribute(THEME_PREFERENCE_ATTRIBUTE)) ?? DEFAULT_THEME_PREFERENCE
}

/** The mode the current preference shows right now. */
export function currentResolvedMode(): ColorMode {
  return resolveColorMode(getThemePreference(), systemPrefersDark())
}

/**
 * Record a preference: storage (best effort), the <html> attribute and the
 * subscribers. `persist: false` for a change that arrived from another tab
 * (already stored).
 */
export function commitThemePreference(preference: ThemePreference, { persist = true }: { persist?: boolean } = {}): void {
  if (persist) {
    try {
      storage()?.setItem(THEME_PREFERENCE_KEY, preference)
    } catch {
      // Not persisted (private mode, quota): it still applies to this page.
    }
  }
  if (typeof document !== 'undefined') document.documentElement.setAttribute(THEME_PREFERENCE_ATTRIBUTE, preference)
  listeners.forEach((fn) => fn())
}

export function subscribeThemePreference(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Chakra's colour-mode storage (ChakraProvider `colorModeManager`).
 *
 * get: the resolved mode of the current preference. set: Chakra calls it
 * with a resolved mode on mount and on every toggle; a mode that differs
 * from what the preference shows is an explicit choice and is stored as
 * one, while the mount call (same mode) never turns `system` into a fixed
 * value.
 */
export const themePreferenceManager: StorageManager = {
  type: 'localStorage',
  ssr: false,
  get(init) {
    if (typeof document === 'undefined') return init
    return currentResolvedMode()
  },
  set(value) {
    if (value !== 'light' && value !== 'dark') return
    if (currentResolvedMode() !== value) commitThemePreference(value)
  },
}
