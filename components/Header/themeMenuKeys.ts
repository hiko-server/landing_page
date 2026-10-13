import type { ThemePreference } from '../../lib/themePreference'

/**
 * Pure keyboard / pointer model of the header theme control (ThemeControl +
 * ThemeMenu), unit tested in tests/tokens-theme-b2.test.ts.
 */

export const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Which item takes focus when the menu opens. */
export type MenuFocus = 'checked' | 'first' | 'last'

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

/** The menu button's keys (WAI-ARIA menu button): which item to open on, or null to let the key through. */
export function triggerKeyFocus(key: string): MenuFocus | null {
  if (key === 'ArrowDown') return 'first'
  if (key === 'ArrowUp') return 'last'
  return null
}

/** A touch held this long on the theme toggle opens the menu instead of toggling. */
export const LONG_PRESS_MS = 500
/** Moving the finger further than this (px) cancels the long-press (it is a scroll). */
export const LONG_PRESS_SLOP = 10

/** True when a pointer moved far enough from its start to cancel a long-press. */
export function exceedsSlop(start: { x: number; y: number }, now: { x: number; y: number }, slop = LONG_PRESS_SLOP): boolean {
  return Math.hypot(now.x - start.x, now.y - start.y) > slop
}
