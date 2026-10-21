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
 * public theme. Text fields, the switch's "off" track and the tag field
 * take it too.
 */
export const CONTROL_BORDER = { light: '#858585', dark: '#6b6b6b' } as const

/**
 * "Hidden from the CV and website" (CV Studio's eyes, "hidden" chips and
 * counts): Chakra's orange.700 / orange.300 — the admin's warning-text pair
 * (shell/ui warnTextProps) — ≥ 4.5:1 for small text on every admin surface,
 * the hidden-stripe tint included (tests/review-r3-studio.test.ts).
 * orange.600 was 4.2:1 on the toolbar's page.bg-elevated.
 */
export const HIDDEN_FG = { light: '#9c4221', dark: '#f6ad55' } as const

/** The admin's own colour tokens, as CSS custom properties (AdminThemeScope publishes them). */
export const ADMIN_COLOR_VARS = {
  '--control-border': CONTROL_BORDER,
  '--admin-hidden-fg': HIDDEN_FG,
} as const

const declarations = (mode: 'light' | 'dark') =>
  Object.entries(ADMIN_COLOR_VARS)
    .map(([name, pair]) => `${name}:${pair[mode]}`)
    .join(';')

/** The admin's global CSS variables (AdminThemeScope renders them). */
export const ADMIN_GLOBAL_CSS = `:root{${declarations('light')}}[data-theme='dark'],.chakra-ui-dark{${declarations('dark')}}`

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

type StyleObject = Record<string, any>
type StyleFn = (props: any) => StyleObject
type StyleValue = StyleObject | StyleFn | undefined
const resolve = (style: StyleValue, props: unknown): StyleObject => (typeof style === 'function' ? style(props) : style || {})

/**
 * Chakra's switch with tracks that stay findable (WCAG 1.4.11): "off" is
 * --control-border (≥ 3:1 on every admin surface, the white thumb ≥ 3.7:1 on
 * it) instead of gray.300 / whiteAlpha.400 (1.5:1 / 2:1); "on" is the 500
 * shade in both modes — in dark mode Chakra's 200 shade left the white thumb
 * at 1.7:1 on it, so where the thumb sat could not be seen. `--switch-bg` is
 * the track colour variable of Chakra's switch theme.
 */
const adminSwitch = {
  ...Switch,
  baseStyle: (props: { colorScheme: string } & Record<string, unknown>) => {
    const base = resolve(Switch.baseStyle as StyleValue, props)
    const on = `colors.${props.colorScheme}.500`
    return {
      ...base,
      track: {
        ...base.track,
        '--switch-bg': 'var(--control-border)',
        _dark: { ...base.track?._dark, '--switch-bg': 'var(--control-border)' },
        _checked: { ...base.track?._checked, '--switch-bg': on, _dark: { ...base.track?._checked?._dark, '--switch-bg': on } },
      },
    }
  },
}

/**
 * Chakra's menu on the admin's own surface: the list is page.bg-elevated
 * (Chakra's is white / gray.700, a bluish grey the 11px hints fell to 3.9:1
 * on), the active row page.bg-overlay; a row reached by keyboard also gets
 * the accent ring inside its edge, since a background wash alone is about
 * 1.1:1 against the rows around it (WCAG 1.4.11). A disabled row keeps its
 * words readable (page.fg-subtle, ≥ 4.5:1) instead of fading to 40%: in the
 * admin a disabled row still says something ("Reveal all hidden (0)", the
 * one audience that cannot be unticked). `--menu-bg` is the background
 * variable of Chakra's menu theme.
 */
const adminMenu = {
  ...Menu,
  baseStyle: (props: Record<string, unknown>) => {
    const base = resolve(Menu.baseStyle as StyleValue, props)
    const row = { '--menu-bg': 'colors.page.bg-overlay', _dark: { '--menu-bg': 'colors.page.bg-overlay' } }
    return {
      ...base,
      list: {
        ...base.list,
        '--menu-bg': 'colors.page.bg-elevated',
        _dark: { ...base.list?._dark, '--menu-bg': 'colors.page.bg-elevated' },
        borderColor: 'page.border-strong',
      },
      item: {
        ...base.item,
        _focus: row,
        _active: row,
        _expanded: row,
        _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '-2px' },
        _disabled: { opacity: 1, color: 'page.fg-subtle', cursor: 'not-allowed' },
      },
    }
  },
}

/**
 * Chakra's badge with outline text that reads (WCAG 1.4.3): in light mode
 * the 500 shade was 3–4.5:1 on paper (orange.500 3.0, gray.500 3.95, the
 * accent 4.47), so it takes the 700 shade; dark mode keeps Chakra's.
 * `--badge-color` is the text (and ring) variable of Chakra's badge theme.
 */
const adminBadge = {
  ...Badge,
  variants: {
    ...Badge.variants,
    outline: (props: { colorScheme: string } & Record<string, unknown>) => ({
      ...resolve(Badge.variants?.outline as StyleValue, props),
      '--badge-color': `colors.${props.colorScheme}.700`,
    }),
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
  Badge: adminBadge,
  Checkbox: adminCheckbox,
  List,
  Menu: adminMenu,
  NumberInput,
  Popover,
  Progress,
  Switch: adminSwitch,
  Table,
  Tabs,
  Tag,
  Tooltip,
}

type SolidProps = { colorScheme?: string; colorMode?: 'light' | 'dark' } & Record<string, unknown>
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

/** A text field's boundary and placeholder in the admin (see withAdminFieldContrast). */
export const FIELD_BOUNDARY = { borderColor: 'var(--control-border)', hover: 'page.fg-subtle', placeholder: 'page.fg-subtle' } as const

/**
 * The ring of an admin field reached by keyboard: the accent (≥ 3.8:1 on
 * every admin surface in both modes), not Chakra's default blue. Chakra
 * draws a field's rings from its `focusBorderColor` / `errorBorderColor`
 * props through its own colour parser (theme-tools getColor), which knows
 * PALETTE tokens only: a semantic token ('status.warning') or a var()
 * comes out #000000 — a black ring, invisible on the dark page. So those
 * props take palette tokens ('accent.500', 'orange.700'), chosen per colour
 * mode where it matters; tests/review-r3-fields.test.ts rejects anything
 * else anywhere in the source.
 */
export const FIELD_RING = { focus: 'accent.500' } as const

type FieldConfig = { baseStyle?: StyleValue; variants?: Record<string, StyleValue> } & Record<string, unknown>
/** The variants whose edge is a line in the field's border colour (outline: a box; flushed: the underline). */
const BOUNDED_VARIANTS = new Set(['outline', 'flushed'])
type FieldProps = { focusBorderColor?: string } & Record<string, unknown>

/**
 * The app theme's Input, Textarea, Select or NumberInput with an admin field
 * you can find and read (WCAG 1.4.11 / 1.4.3): the outline variant's border
 * and the flushed one's underline are --control-border (Chakra's inherited
 * gray.200 / whiteAlpha.300 is 1.2–1.5:1, and it lightened further on
 * hover), hover darkens it to page.fg-subtle, and placeholders are
 * page.fg-subtle (Chakra's gray.500 /
 * whiteAlpha.400 is 3.6–4:1) — in every variant, the unstyled one of the tag
 * field included. A field's own borderColor prop still wins (so fields leave
 * it alone); the focus ring is the accent in every variant unless a field
 * names another (FIELD_RING) — read-only fields included — and the invalid
 * ring stays Chakra's. `parts`:
 * Input, Select and NumberInput style a `field` part, Textarea the element
 * itself. Admin-only: AdminThemeScope applies it.
 */
export function withAdminFieldContrast<T extends FieldConfig | undefined>(config: T, parts: boolean): T {
  if (!config) return config
  const placeholder = { _placeholder: { color: FIELD_BOUNDARY.placeholder } }
  const boundary = (field: StyleObject = {}) => {
    // Chakra takes the ring off a read-only field (`boxShadow: none !important`), leaving a 1px
    // colour change as its only focus cue; a read-only field reached by Tab keeps the ring.
    const readOnly: StyleObject = { ...field._readOnly }
    delete readOnly.boxShadow
    return {
      ...field,
      borderColor: FIELD_BOUNDARY.borderColor,
      _hover: { ...field._hover, borderColor: FIELD_BOUNDARY.hover },
      ...(field._readOnly ? { _readOnly: readOnly } : {}),
    }
  }
  const ringed = (props: FieldProps) => ({ ...props, focusBorderColor: props.focusBorderColor || FIELD_RING.focus })
  const variants = Object.fromEntries(
    Object.entries(config.variants || {}).map(([name, variant]) => {
      if (typeof variant !== 'function') return [name, variant]
      if (!BOUNDED_VARIANTS.has(name)) return [name, (props: FieldProps) => variant(ringed(props))]
      return [
        name,
        (props: FieldProps) => {
          const v = variant(ringed(props))
          return parts ? { ...v, field: boundary(v.field) } : boundary(v)
        },
      ]
    }),
  )
  return {
    ...config,
    baseStyle: (props: unknown) => {
      const base = resolve(config.baseStyle, props)
      return parts ? { ...base, field: { ...base.field, ...placeholder } } : { ...base, ...placeholder }
    },
    variants: config.variants ? variants : config.variants,
  }
}
