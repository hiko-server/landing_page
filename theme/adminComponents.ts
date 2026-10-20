import { Accordion, Badge, Checkbox, List, Menu, NumberInput, Popover, Progress, Switch, Table, Tabs, Tag, Tooltip } from '@chakra-ui/theme/components'

type CheckboxStyleFn = Exclude<NonNullable<typeof Checkbox.baseStyle>, Record<string, unknown>>
type CheckboxProps = Parameters<CheckboxStyleFn>[0]

/**
 * The boundary of an unchecked form control (a checkbox's box) by colour
 * mode: ≥ 3:1 on every page and row background (page.bg, bg-elevated,
 * bg-overlay — WCAG 1.4.11; checked in tests/review-fixes-r2.test.ts).
 * page.border / border-strong are hairlines for surfaces, too faint to find
 * a control by. Admin-only, so it lives here (published as
 * --control-border by components/Admin/AdminThemeScope) rather than in the
 * public theme.
 */
export const CONTROL_BORDER = { light: '#858585', dark: '#6b6b6b' } as const

/** The admin's global CSS variables (AdminThemeScope renders them). */
export const ADMIN_GLOBAL_CSS = `:root{--control-border:${CONTROL_BORDER.light}}[data-theme='dark'],.chakra-ui-dark{--control-border:${CONTROL_BORDER.dark}}`

/**
 * Chakra's checkbox with an unchecked box the owner can find: its stock
 * border (gray.200 / whiteAlpha.300) is about 1.2–1.6:1 against the admin's
 * rows; --control-border is ≥ 3:1. Checked, invalid and disabled boxes keep
 * Chakra's own colours (their state rules are more specific).
 */
const adminCheckbox = {
  ...Checkbox,
  baseStyle: (props: CheckboxProps) => {
    const base = typeof Checkbox.baseStyle === 'function' ? Checkbox.baseStyle(props) : Checkbox.baseStyle
    return { ...base, control: { ...base?.control, borderColor: 'var(--control-border)' } }
  },
}

/**
 * Chakra's default styles for the themed components only the admin renders.
 * They stay out of the public pages' shared bundle: pages/_app wraps /admin
 * routes in components/Admin/AdminThemeScope.tsx, which adds these to the
 * app theme and is loaded with the admin pages (see theme/chakraComponents.ts).
 */
export const ADMIN_COMPONENT_STYLES = {
  Accordion,
  Badge,
  Checkbox: adminCheckbox,
  List,
  Menu,
  NumberInput,
  Popover,
  Progress,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
}

type SolidProps = { colorScheme?: string; colorMode?: 'light' | 'dark' } & Record<string, unknown>
type StyleObject = Record<string, any>
type SolidStyle = StyleObject | ((props: SolidProps) => StyleObject)

/**
 * Hues whose stock solid button stays as Chakra ships it: gray (dark text on
 * a light grey), yellow and cyan (Chakra already gives them black text), the
 * alpha scales (no 600–800 steps of their own colour).
 */
const STOCK_SOLID = new Set(['gray', 'yellow', 'cyan', 'whiteAlpha', 'blackAlpha'])

/**
 * Chakra's solid button puts white text on the 500 shade in light mode:
 * 4.1:1 on red.500 (every destructive "Confirm — …" step), 4.47:1 on
 * accent.500, under WCAG 1.4.3's 4.5:1 for 12–14px labels. In light mode a
 * solid button takes the 600 shade instead (hover 700, pressed 800; ≥ 4.5:1
 * with white for every hue — tests/review-r3-ux.test.ts); dark mode keeps
 * Chakra's 200 shade with dark text (≥ 9:1).
 */
export function contrastSafeSolid(solid: SolidStyle): (props: SolidProps) => StyleObject {
  return (props) => {
    const base = typeof solid === 'function' ? solid(props) : solid
    const c = props.colorScheme || 'gray'
    if (props.colorMode === 'dark' || STOCK_SOLID.has(c)) return base
    return {
      ...base,
      bg: `${c}.600`,
      _hover: { ...base._hover, bg: `${c}.700`, _disabled: { ...base._hover?._disabled, bg: `${c}.600` } },
      _active: { ...base._active, bg: `${c}.800` },
    }
  }
}

/**
 * The app theme's Button with contrast-safe solid colours. Only admin
 * screens render solid coloured buttons, so this joins the theme in
 * components/Admin/AdminThemeScope and never reaches the public bundle.
 */
export function withContrastSafeSolidButton<T extends { variants?: Record<string, unknown> }>(button: T): T {
  const solid = button.variants?.solid as SolidStyle | undefined
  if (!solid) return button
  return { ...button, variants: { ...button.variants, solid: contrastSafeSolid(solid) } }
}
