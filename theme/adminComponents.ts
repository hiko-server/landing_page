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
