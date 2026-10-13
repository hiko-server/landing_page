import type { ThemePreference } from '../../lib/themePreference'

/**
 * Pure keyboard model of the header theme menu (ThemeMenu, loaded on
 * demand), unit tested in tests/tokens-theme-b2.test.ts. The menu button's
 * own keys are in ./themeTriggerKeys (shared bundle, kept tiny).
 */

export const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export type { MenuFocus } from './themeTriggerKeys'

/**
 * The item a key moves focus to inside the menu (null: the key is not the
 * menu's). ArrowUp / ArrowDown wrap; from no focused item (`current` -1)
 * they start at the first / last item. A letter jumps to the next item whose
 * label starts with it.
 */
export function menuKeyTarget(key: string, current: number, count: number, labels: readonly string[] = THEME_OPTIONS.map((o) => o.label)): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default: {
      if (key.length !== 1 || !/\p{L}/u.test(key)) return null
      const letter = key.toLowerCase()
      for (let step = 1; step <= count; step++) {
        const i = (Math.max(current, -1) + step + count) % count
        if (labels[i]?.toLowerCase().startsWith(letter)) return i
      }
      return null
    }
  }
}
