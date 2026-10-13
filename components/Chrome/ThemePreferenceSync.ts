import { useEffect } from 'react'
import { useColorMode } from '@chakra-ui/react'
import {
  DEFAULT_THEME_PREFERENCE,
  SYSTEM_DARK_QUERY,
  THEME_PREFERENCE_KEY,
  commitThemePreference,
  getThemePreference,
  parseThemePreference,
  resolveColorMode,
  systemPrefersDark,
} from '../../lib/themePreference'

/**
 * Mounted once, in pages/_app (shared bundle, so it stays tiny): while the
 * preference is `system` the page follows the operating system's light /
 * dark switch, and a preference changed in another tab applies here too —
 * both without the reveal (nothing was clicked on this page).
 */
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

/** Renders nothing. */
export default function ThemePreferenceSync(): null {
  useThemePreferenceSync()
  return null
}
