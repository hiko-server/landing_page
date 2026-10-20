import { foundations } from '@chakra-ui/theme/foundations'
import { semanticTokens } from '@chakra-ui/theme/semantic-tokens'
import { styles } from '@chakra-ui/theme/styles'

/**
 * Chakra's base theme and theme merge, without the parts of Chakra that
 * reference its complete default theme (G5).
 *
 * `extendTheme` / `extendBaseTheme` live in a module that builds BOTH
 * functions at load time, so importing either keeps all ~40 default
 * component styles in the bundle; `ChakraProvider` imports them too. This
 * module assembles the base theme from @chakra-ui/theme's own sub-modules
 * (foundations, semantic tokens, global styles — exactly what Chakra's
 * `baseTheme` is) and merges overrides the way extendTheme does.
 */

/** Chakra's `baseTheme` (@chakra-ui/theme): foundations, no component styles. */
export const chakraBaseTheme = {
  semanticTokens,
  direction: 'ltr',
  components: {},
  ...foundations,
  styles,
  config: { useSystemColorMode: false, initialColorMode: 'light', cssVarPrefix: 'chakra' },
}

type ThemeValue = unknown
type StyleFunction = (...args: unknown[]) => unknown

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * One value of a theme override merged over the current one, with
 * extendTheme's rules: plain objects merge key by key; when either side is
 * a function (a style function of props) the result is a function that
 * merges both results; anything else — arrays included — is replaced;
 * `undefined` never overrides.
 */
export function mergeThemeValue(current: ThemeValue, override: ThemeValue): ThemeValue {
  if (override === undefined) return current
  if (current === undefined) return override
  if (typeof current === 'function' || typeof override === 'function') {
    return (...args: unknown[]) =>
      mergeThemeValue(
        typeof current === 'function' ? (current as StyleFunction)(...args) : current,
        typeof override === 'function' ? (override as StyleFunction)(...args) : override,
      )
  }
  if (isPlainObject(current) && isPlainObject(override)) {
    const out = { ...current }
    for (const key of Object.keys(override)) out[key] = mergeThemeValue(current[key], override[key])
    return out
  }
  return override
}

/** Chakra's base theme with each override merged on top, left to right (extendBaseTheme). */
export function extendChakraBaseTheme(...overrides: Record<string, unknown>[]): Record<string, any> {
  return overrides.reduce<ThemeValue>((theme, override) => mergeThemeValue(theme, override), chakraBaseTheme) as Record<string, any>
}
