/**
 * The header theme menu button's keys (WAI-ARIA menu button), apart from the
 * menu's own keyboard model (./themeMenuKeys) so the shared bundle carries
 * only this. Unit tested in tests/tokens-theme-b2.test.ts.
 */

/** Which item takes focus when the menu opens. */
export type MenuFocus = 'checked' | 'first' | 'last'

/** ArrowDown opens on the first item, ArrowUp on the last; other keys are left to the button. */
export function triggerKeyFocus(key: string): MenuFocus | null {
  if (key === 'ArrowDown') return 'first'
  if (key === 'ArrowUp') return 'last'
  return null
}
