import React, { useRef } from 'react'
import { Box, Flex, Icon } from '@chakra-ui/react'
import type { IconType } from 'react-icons'
import { MONO } from './ui'

export type SegmentedItem<K extends string> = {
  key: K
  label: string
  icon?: IconType
  /** Human label of a keyboard shortcut, e.g. "⌃1". */
  shortcut?: string
  /** aria-keyshortcuts value, e.g. "Control+1". */
  ariaShortcut?: string
}

/**
 * Compact segmented tablist (WAI-ARIA tabs, manual activation): arrow keys,
 * Home and End move focus; Enter / Space or a click asks `onSelect` — which
 * may refuse (unsaved changes) — to switch. Panels are rendered by the
 * caller with `tabPanelProps(idPrefix, value)`.
 */
export default function SegmentedTabs<K extends string>({
  items,
  value,
  onSelect,
  label,
  idPrefix,
  size = 'md',
}: {
  items: SegmentedItem<K>[]
  value: K
  onSelect: (key: K) => void
  label: string
  idPrefix: string
  size?: 'sm' | 'md'
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % items.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (i - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    if (next < 0) return
    e.preventDefault()
    refs.current[next]?.focus()
  }

  return (
    <Flex
      role="tablist"
      aria-label={label}
      gap={0.5}
      p={0.5}
      border="1px solid"
      borderColor="page.border"
      borderRadius="lg"
      bg="page.bg-elevated"
      maxW="100%"
      overflowX="auto"
      flexShrink={0}
      sx={{ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
    >
      {items.map((it, i) => {
        const selected = it.key === value
        return (
          <Box
            as="button"
            type="button"
            key={it.key}
            ref={(el: HTMLButtonElement | null) => {
              refs.current[i] = el
            }}
            role="tab"
            id={`${idPrefix}-tab-${it.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            aria-keyshortcuts={it.ariaShortcut}
            title={it.shortcut ? `${it.label} (${it.shortcut})` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(it.key)}
            onKeyDown={(e: React.KeyboardEvent) => onKeyDown(e, i)}
            display="inline-flex"
            alignItems="center"
            gap={1.5}
            flexShrink={0}
            px={size === 'sm' ? 2.5 : 3}
            h={size === 'sm' ? '26px' : '30px'}
            borderRadius="md"
            fontSize={size === 'sm' ? '12px' : '13px'}
            fontWeight={500}
            whiteSpace="nowrap"
            color={selected ? 'page.fg' : 'page.fg-secondary'}
            bg={selected ? 'page.bg' : 'transparent'}
            boxShadow={selected ? '0 0 0 1px var(--chakra-colors-page-border-strong)' : 'none'}
            transition="color 150ms var(--ease-out-quart), background-color 150ms var(--ease-out-quart)"
            _hover={{ color: 'page.fg' }}
            _focusVisible={{
              outline: '2px solid',
              outlineColor: 'accent.500',
              outlineOffset: '1px',
            }}
          >
            {it.icon ? (
              <Icon
                as={it.icon}
                boxSize={3}
                color={selected ? 'accent.500' : 'currentColor'}
                aria-hidden
              />
            ) : null}
            {it.label}
            {it.shortcut ? (
              <Box
                as="span"
                display={{ base: 'none', xl: 'inline' }}
                fontFamily={MONO}
                fontSize="10px"
                color="page.muted"
                aria-hidden
              >
                {it.shortcut}
              </Box>
            ) : null}
          </Box>
        )
      })}
    </Flex>
  )
}

/** Props for the panel controlled by a SegmentedTabs instance. */
export function tabPanelProps(idPrefix: string, value: string) {
  return {
    role: 'tabpanel',
    id: `${idPrefix}-panel`,
    'aria-labelledby': `${idPrefix}-tab-${value}`,
    tabIndex: -1,
  } as const
}
