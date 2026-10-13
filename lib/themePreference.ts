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
 *   - THEME_PREPAINT_SCRIPT (pages/_document.tsx, inline, before first paint)
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

type ReadableStorage = { getItem(key: string): string | null }

/**
 * The stored preference: the `theme-preference` value, else a legacy
 * explicit `light` (Chakra's key; its `dark` was written for every visitor
 * and is no choice), else `fallback`. Storage that throws (blocked, private
 * mode) counts as empty.
 */
export function readStoredPreference(storage: ReadableStorage | null | undefined, fallback: ThemePreference = DEFAULT_THEME_PREFERENCE): ThemePreference {
  try {
    const stored = parseThemePreference(storage?.getItem(THEME_PREFERENCE_KEY))
    if (stored) return stored
    if (storage?.getItem(LEGACY_COLOR_MODE_KEY) === 'light') return 'light'
  } catch {
    // Storage unavailable: the default applies.
  }
  return fallback
}

/**
 * Inline pre-paint script (runs synchronously in <body> before the first
 * paint). Mirrors readStoredPreference + resolveColorMode — kept in step by
 * tests/tokens-theme-b2.test.ts, which runs it against fake documents.
 */
export function themePrepaintScript(fallback: ThemePreference = DEFAULT_THEME_PREFERENCE): string {
  return (
    '(function(){try{' +
    'var d=document.documentElement,p=null,l=null,s;' +
    `try{s=window.localStorage;p=s.getItem('${THEME_PREFERENCE_KEY}');l=s.getItem('${LEGACY_COLOR_MODE_KEY}')}catch(e){}` +
    `if(p!=='system'&&p!=='light'&&p!=='dark')p=l==='light'?'light':'${fallback}';` +
    `var m=p==='system'?(window.matchMedia&&window.matchMedia('${SYSTEM_DARK_QUERY}').matches?'dark':'light'):p;` +
    `d.setAttribute('data-theme',m);d.style.colorScheme=m;d.setAttribute('${THEME_PREFERENCE_ATTRIBUTE}',p);` +
    "var b=document.body;if(b){b.classList.add('chakra-ui-'+m);b.classList.remove(m==='dark'?'chakra-ui-light':'chakra-ui-dark')}" +
    '}catch(e){}})();'
  )
}

export const THEME_PREPAINT_SCRIPT = themePrepaintScript()

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
 * The current preference: the attribute the pre-paint script (or the last
 * commit) put on <html>, else storage, else the default. A string, so it is
 * a stable useSyncExternalStore snapshot.
 */
export function getThemePreference(): ThemePreference {
  if (typeof document === 'undefined') return DEFAULT_THEME_PREFERENCE
  const attr = parseThemePreference(document.documentElement.getAttribute(THEME_PREFERENCE_ATTRIBUTE))
  return attr ?? readStoredPreference(storage())
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
