import type { ReactElement } from 'react'
import { Box, chakra, useColorMode } from '@chakra-ui/react'
import { toggleThemeWithTransition } from '../../lib/themeTransition'

/**
 * Light / Dark segmented control (the mobile menu). Each segment shows its
 * own mode's icon next to its own name, and the current one is pressed, so
 * icon, label and state always agree — unlike a single toggle whose icon
 * shows the current mode while its label names the other. Choosing the
 * other mode runs the same circular reveal as the header toggle, from the
 * segment that was pressed.
 */

type Mode = 'light' | 'dark'

const SunGlyph = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="4.25" fill="currentColor" />
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </g>
  </svg>
)

const MoonGlyph = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
)

export const THEME_OPTIONS: readonly { mode: Mode; label: string; icon: () => ReactElement }[] = [
  { mode: 'light', label: 'Light', icon: SunGlyph },
  { mode: 'dark', label: 'Dark', icon: MoonGlyph },
]

export default function ThemeSwitch() {
  const { colorMode, toggleColorMode } = useColorMode()

  return (
    <Box
      role="group"
      aria-label="Theme"
      display="grid"
      gridTemplateColumns={`repeat(${THEME_OPTIONS.length}, minmax(0, 1fr))`}
      gap="2px"
      p="3px"
      border="1px solid"
      borderColor="page.border"
      borderRadius="10px"
      bg="page.bg"
    >
      {THEME_OPTIONS.map(({ mode, label, icon: Icon }) => {
        const pressed = colorMode === mode
        return (
          <chakra.button
            key={mode}
            type="button"
            aria-pressed={pressed}
            onClick={(e) => {
              if (!pressed) toggleThemeWithTransition(toggleColorMode, e.currentTarget)
            }}
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            gap={2}
            h="40px"
            borderRadius="7px"
            fontSize="14px"
            fontWeight={500}
            color={pressed ? 'page.fg' : 'page.fg-secondary'}
            bg={pressed ? 'page.bg-elevated' : 'transparent'}
            boxShadow={pressed ? '0 0 0 1px var(--chakra-colors-page-border-strong)' : 'none'}
            transition="color 150ms, background-color 150ms"
            _hover={{ color: 'page.fg' }}
            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '1px' }}
            sx={{ '@media (forced-colors: active)': pressed ? { outline: '2px solid CanvasText' } : {} }}
          >
            <Icon />
            {label}
          </chakra.button>
        )
      })}
    </Box>
  )
}
