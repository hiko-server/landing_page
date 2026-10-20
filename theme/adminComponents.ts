import { Accordion, Badge, Checkbox, List, Menu, NumberInput, Popover, Progress, Switch, Table, Tabs, Tag, Tooltip } from '@chakra-ui/theme/components'

type CheckboxStyleFn = Exclude<NonNullable<typeof Checkbox.baseStyle>, Record<string, unknown>>
type CheckboxProps = Parameters<CheckboxStyleFn>[0]

/**
 * Chakra's checkbox with an unchecked box the owner can find: its stock
 * border (gray.200 / whiteAlpha.300) is about 1.2–1.6:1 against the admin's
 * rows; page.control-border is ≥ 3:1 (WCAG 1.4.11). Checked, invalid and
 * disabled boxes keep Chakra's own colours (their state rules come later).
 */
const adminCheckbox = {
  ...Checkbox,
  baseStyle: (props: CheckboxProps) => {
    const base = typeof Checkbox.baseStyle === 'function' ? Checkbox.baseStyle(props) : Checkbox.baseStyle
    return { ...base, control: { ...base?.control, borderColor: 'page.control-border' } }
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
