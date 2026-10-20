import {
  Alert,
  Button,
  CloseButton,
  Code,
  Divider,
  Drawer,
  Form,
  FormError,
  FormLabel,
  Heading,
  Input,
  Kbd,
  Link,
  Modal,
  Select,
  Skeleton,
  Spinner,
  Textarea,
} from '@chakra-ui/theme/components'

/**
 * Chakra's default styles for the themed components the PUBLIC site renders
 * (and the admin shares), keyed like `theme.components`. theme/chakra.js
 * builds on Chakra's base theme with these instead of the full default
 * theme, so the ~40 component styles Chakra ships are not all in the shared
 * bundle. Components only the admin uses get their styles from
 * theme/adminComponents.ts, loaded with the admin pages.
 *
 * Adding a Chakra component that has a theme entry (Avatar, Radio, Card,
 * Stat, Slider, …)? Add its styles here (public) or there (admin only):
 * without them it renders unstyled. tests/perf-g5-bundle.test.ts fails when
 * a component imported from '@chakra-ui/react' is missing from the right
 * list.
 */
export const CHAKRA_COMPONENT_STYLES = {
  Alert,
  Button,
  CloseButton,
  Code,
  Divider,
  Drawer,
  Form,
  FormError,
  FormLabel,
  Heading,
  Input,
  Kbd,
  Link,
  Modal,
  Select,
  Skeleton,
  Spinner,
  Textarea,
}
