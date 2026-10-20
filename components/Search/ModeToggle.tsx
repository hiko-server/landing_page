import { Flex, chakra } from '@chakra-ui/react'
import type { PaletteMode } from '../Chrome/paletteEvents'
import { MessageCircleQuestionIcon } from '../Icons/ui/ask'
import { SearchIcon } from '../Icons/ui/chrome'
import { cssTransition } from '../../theme/tokens'

/**
 * The palette's Search / Ask switch: two toggle buttons (aria-pressed) in a
 * labelled group, 24 px tall (WCAG 2.5.8), the current one raised. Choosing
 * one keeps the typed text — a search becomes a question and back.
 */
export default function ModeToggle({
  mode,
  onChange,
  labels,
}: {
  mode: PaletteMode
  onChange: (mode: PaletteMode) => void
  labels: { group: string; search: string; ask: string }
}) {
  return (
    <Flex
      role="group"
      aria-label={labels.group}
      align="center"
      gap="2px"
      p="2px"
      borderRadius="control"
      border="1px solid"
      borderColor="page.border"
      bg="page.bg-elevated"
      flexShrink={0}
    >
      {(['search', 'ask'] as const).map((m) => {
        const on = mode === m
        return (
          <chakra.button
            key={m}
            type="button"
            aria-pressed={on}
            // Phones show the icons only; the name stays.
            aria-label={m === 'search' ? labels.search : labels.ask}
            onClick={() => onChange(m)}
            display="inline-flex"
            alignItems="center"
            gap={1.5}
            h="24px"
            minW="28px"
            px={{ base: 1.5, sm: 2 }}
            borderRadius="calc(var(--chakra-radii-control) - 2px)"
            fontFamily="mono"
            fontSize="label"
            lineHeight="1"
            bg={on ? 'page.bg' : 'transparent'}
            color={on ? 'page.fg' : 'page.fg-secondary'}
            boxShadow={on ? 'elevation.sm' : 'none'}
            transition={cssTransition(['background-color', 'color', 'box-shadow'], 'fast')}
            _hover={{ color: 'page.fg' }}
            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '1px' }}
          >
            {m === 'search' ? <SearchIcon size="xs" /> : <MessageCircleQuestionIcon size="xs" />}
            <chakra.span display={{ base: 'none', sm: 'inline' }} aria-hidden>
              {m === 'search' ? labels.search : labels.ask}
            </chakra.span>
          </chakra.button>
        )
      })}
    </Flex>
  )
}
