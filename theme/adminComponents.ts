import { Accordion, Badge, Checkbox, List, Menu, NumberInput, Popover, Progress, Switch, Table, Tabs, Tag, Tooltip } from '@chakra-ui/theme/components'

/**
 * Chakra's default styles for the themed components only the admin renders.
 * They stay out of the public pages' shared bundle: pages/_app wraps /admin
 * routes in components/Admin/AdminThemeScope.tsx, which adds these to the
 * app theme and is loaded with the admin pages (see theme/chakraComponents.ts).
 */
export const ADMIN_COMPONENT_STYLES = {
  Accordion,
  Badge,
  Checkbox,
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
