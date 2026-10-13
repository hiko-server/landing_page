import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useColorMode } from '@chakra-ui/react'
import {
  SYSTEM_DARK_QUERY,
  THEME_PREFERENCE_KEY,
  DEFAULT_THEME_PREFERENCE,
  commitThemePreference,
  getThemePreference,
  parseThemePreference,
  resolveColorMode,
  subscribeThemePreference,
  systemPrefersDark,
  type ThemePreference,
} from '../../lib/themePreference'
import { revealThemeChange } from '../../lib/themeTransition'

/**
 * React side of the System / Light / Dark preference (lib/themePreference.ts).
 *
 * useThemePreference: the current preference (null until mounted — the
 * server cannot know it) and `choose(preference, origin)`, which stores it
 * and applies its mode through Chakra (data-theme, body class, colorMode),
 * revealed by the circular theme transition from `origin` when the mode on
 * screen changes.
 *
 * useThemePreferenceSync (mounted once, in pages/_app): follows the
 * operating system while the preference is `system`, and preferences
 * changed in another tab.
 */

const serverSnapshot = () => null

export function useThemePreference() {
  const { setColorMode } = useColorMode()
  const preference = useSyncExternalStore(subscribeThemePreference, getThemePreference, serverSnapshot)

  const choose = useCallback(
    (next: ThemePreference, origin: HTMLElement | null = null) => {
      const mode = resolveColorMode(next, systemPrefersDark())
      // Store first: Chakra's setColorMode then writes the same mode back
      // through the storage manager, which leaves `system` alone.
      const apply = () => {
        commitThemePreference(next)
        setColorMode(mode)
      }
      const onScreen = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
      if (onScreen === mode) apply()
      else revealThemeChange(apply, origin)
    },
    [setColorMode],
  )

  return { preference, choose }
}

export function useThemePreferenceSync(): void {
  const { setColorMode } = useColorMode()

  useEffect(() => {
    let mql: MediaQueryList | null = null
    try {
      mql = window.matchMedia(SYSTEM_DARK_QUERY)
    } catch {
      mql = null
    }
    const onSystemChange = () => {
      if (getThemePreference() === 'system') setColorMode(systemPrefersDark() ? 'dark' : 'light')
    }
    const onStorage = (e: StorageEvent) => {
      // key null: the whole storage was cleared in another tab.
      if (e.key !== THEME_PREFERENCE_KEY && e.key !== null) return
      const next = parseThemePreference(e.newValue) ?? DEFAULT_THEME_PREFERENCE
      commitThemePreference(next, { persist: false })
      setColorMode(resolveColorMode(next, systemPrefersDark()))
    }
    mql?.addEventListener('change', onSystemChange)
    window.addEventListener('storage', onStorage)
    return () => {
      mql?.removeEventListener('change', onSystemChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [setColorMode])
}

/** Renders nothing; keeps the page in step with the OS and other tabs. */
export function ThemePreferenceSync(): null {
  useThemePreferenceSync()
  return null
}
