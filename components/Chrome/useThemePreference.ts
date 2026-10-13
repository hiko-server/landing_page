import { useCallback, useSyncExternalStore } from 'react'
import { useColorMode } from '@chakra-ui/react'
import {
  commitThemePreference,
  getThemePreference,
  resolveColorMode,
  subscribeThemePreference,
  systemPrefersDark,
  type ThemePreference,
} from '../../lib/themePreference'
import { revealThemeChange } from '../../lib/themeTransition'

/**
 * React side of the System / Light / Dark preference (lib/themePreference.ts),
 * for the theme menu and the ⌘K palette (both loaded on demand).
 *
 * useThemePreference: the current preference (null until mounted — the
 * server cannot know it) and `choose(preference, origin)`, which stores it
 * and applies its mode through Chakra (data-theme, body class, colorMode),
 * revealed by the circular theme transition from `origin` when the mode on
 * screen changes. ./ThemePreferenceSync keeps every page in step with the
 * OS and other tabs.
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
