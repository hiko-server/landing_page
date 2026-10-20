import { Box, chakra } from '@chakra-ui/react'
import { MonitorIcon, MoonIcon, SunIcon } from '../Icons/ui/theme'
import { useThemePreference } from '../Chrome/useThemePreference'
import type { ThemePreference } from '../../lib/themePreference'
import { cssTransition } from '../../theme/tokens'
import { THEME_OPTIONS as PREFERENCE_OPTIONS } from './themeMenuKeys'
import { useChromeUi } from '../Chrome/chromeLang'
import { MENU_UI } from '../../lib/uiStrings/menu'

/**
 * System / Light / Dark segmented control (the mobile menu). The same
 * preference model as the header's theme menu and the ⌘K palette
 * (lib/themePreference via useThemePreference), so all three always agree:
 * the pressed segment is the stored PREFERENCE, and System follows the
 * operating system live. Each segment shows its own icon next to its own
 * name. Choosing another preference runs the same circular reveal as the
 * header, from the segment that was pressed, when the mode on screen
 * changes.
 */

const ICONS: Record<ThemePreference, typeof SunIcon> = { system: MonitorIcon, light: SunIcon, dark: MoonIcon }

export const THEME_OPTIONS = PREFERENCE_OPTIONS.map((o) => ({ ...o, icon: ICONS[o.value] }))

export default function ThemeSwitch() {
  const { preference, choose } = useThemePreference()
  const { t, lang } = useChromeUi()
  const m = MENU_UI[lang]

  return (
    <Box
      role="group"
      aria-label={t.theme}
      display="grid"
      gridTemplateColumns={`repeat(${THEME_OPTIONS.length}, minmax(0, 1fr))`}
      gap="2px"
      p="3px"
      border="1px solid"
      borderColor="page.border"
      borderRadius="10px"
      bg="page.bg"
    >
      {THEME_OPTIONS.map(({ value, icon: Icon }) => {
        const pressed = preference === value
        return (
          <chakra.button
            key={value}
            type="button"
            aria-pressed={pressed}
            onClick={(e) => {
              if (!pressed) choose(value, e.currentTarget)
            }}
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            gap={2}
            h="40px"
            minW={0}
            borderRadius="7px"
            fontSize="14px"
            fontWeight={500}
            color={pressed ? 'page.fg' : 'page.fg-secondary'}
            bg={pressed ? 'page.bg-elevated' : 'transparent'}
            boxShadow={pressed ? '0 0 0 1px var(--chakra-colors-page-border-strong)' : 'none'}
            transition={cssTransition(['color', 'background-color'], 'fast')}
            _hover={{ color: 'page.fg' }}
            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '1px' }}
            sx={{ '@media (forced-colors: active)': pressed ? { outline: '2px solid CanvasText' } : {} }}
          >
            <Icon size="sm" />
            {m[value]}
          </chakra.button>
        )
      })}
    </Box>
  )
}
