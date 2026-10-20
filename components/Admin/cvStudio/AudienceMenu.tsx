import React from 'react'
import { Box, Button, Menu, MenuButton, MenuDivider, MenuItem, MenuItemOption, MenuList, MenuOptionGroup, Text, Tooltip } from '@chakra-ui/react'
import { FiShare2 } from 'react-icons/fi'
import { CV_SURFACES, isCvSurface, normalizeAudience, type CvSurface } from '../../../lib/cvVisibility'
import { SURFACE_HINT, SURFACE_LABEL, audienceChip, audienceSummary } from './audience'
import { monoFont, useStudioTokens } from './fields'

/** Rows on the admin's menu surface: the hover / focus wash is page.bg-overlay, never Chakra's grey. */
const ITEM_SURFACE = { bg: 'transparent', _hover: { bg: 'page.bg-overlay' }, _focus: { bg: 'page.bg-overlay' } } as const

/**
 * "Shows on" — the audience of a field, an entry, a list or a section (E4,
 * lib/cvVisibility): Public pages, Downloads, Private links. A menu of
 * checkboxes (role menuitemcheckbox, Space / Enter toggle, the menu stays
 * open); the last one left cannot be unchecked — keeping something off
 * every surface is the eye's job, and hidden always wins.
 *
 * Unrestricted, the trigger is a quiet icon; restricted, it becomes a chip
 * that says where the thing shows ("Files · Links"), so a limited phone
 * number is visible at a glance next to its field.
 */
export default function AudienceMenu({
  value,
  onChange,
  label,
  compactOnPhones = false,
}: {
  /** null = every surface. */
  value: readonly CvSurface[] | null
  onChange: (next: CvSurface[] | null) => void
  /** What it applies to, for the accessible name ("Phone"). */
  label: string
  /**
   * On a phone a restricted trigger is the tinted icon alone (a bullet's
   * text needs the width); the chip's words stay in its name and tooltip.
   */
  compactOnPhones?: boolean
}) {
  const { faint, dim } = useStudioTokens()
  const checked: readonly CvSurface[] = value ?? CV_SURFACES
  const restricted = value !== null
  const summary = audienceSummary(value)
  // The chip's visible words are part of the name (WCAG 2.5.3 Label in Name).
  const name = restricted ? `Where ${label} shows: ${audienceChip(value)} (${summary})` : `Where ${label} shows: ${summary}`

  return (
    <Menu closeOnSelect={false} isLazy placement="bottom-end">
      <Tooltip label={restricted ? `Only on: ${summary}` : 'Shows everywhere — limit to pages, downloads or private links'} hasArrow openDelay={300}>
        <MenuButton
          as={Button}
          size="xs"
          variant="ghost"
          flexShrink={0}
          aria-label={name}
          data-audience-toggle=""
          data-restricted={restricted ? '' : undefined}
          px={restricted ? (compactOnPhones ? { base: 0, md: 1.5 } : 1.5) : 0}
          minW="24px"
          h="24px"
          fontFamily={monoFont}
          fontSize="9px"
          letterSpacing="0.06em"
          textTransform="uppercase"
          fontWeight={600}
          color={restricted ? 'accent.text' : faint}
          bg={restricted ? 'var(--accent-soft)' : undefined}
          border="1px solid"
          borderColor={restricted ? 'var(--accent)' : 'transparent'}
          _hover={{ color: 'accent.text', bg: 'var(--accent-soft)' }}
          _focusVisible={{ boxShadow: '0 0 0 2px var(--accent-ring)' }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
          }}
        >
          <Box as="span" display="inline-flex" alignItems="center" gap={1}>
            <FiShare2 aria-hidden size={11} />
            {restricted ? (
              <Box as="span" aria-hidden display={compactOnPhones ? { base: 'none', md: 'inline' } : undefined}>
                {audienceChip(value)}
              </Box>
            ) : null}
          </Box>
        </MenuButton>
      </Tooltip>
      {/* The admin's menu surface (as every other admin menu): the 11px hints keep ≥ 4.5:1 on the focused row in both themes. */}
      <MenuList bg="page.bg-elevated" borderColor="page.border-strong" fontSize="13px" minW="290px" maxW="calc(100vw - 32px)" zIndex={40} onClick={(e) => e.stopPropagation()}>
        <Text px={3} pt={1} pb={1.5} fontFamily={monoFont} fontSize="10px" letterSpacing="0.1em" textTransform="uppercase" color={dim}>
          {label} shows on
        </Text>
        <MenuOptionGroup
          type="checkbox"
          value={[...checked]}
          onChange={(v) => {
            const picked = (Array.isArray(v) ? v : [v]).filter(isCvSurface)
            if (!picked.length) return
            onChange(normalizeAudience(picked))
          }}
        >
          {CV_SURFACES.map((s) => {
            const last = checked.length === 1 && checked[0] === s
            return (
              <MenuItemOption key={s} value={s} isDisabled={last} title={last ? 'To keep it off everything, hide it with the eye' : undefined} {...ITEM_SURFACE}>
                <Box>
                  <Text as="span" display="block" fontWeight={500}>
                    {SURFACE_LABEL[s]}
                  </Text>
                  <Text as="span" display="block" fontSize="11px" color={dim} lineHeight="1.4">
                    {SURFACE_HINT[s]}
                  </Text>
                </Box>
              </MenuItemOption>
            )
          })}
        </MenuOptionGroup>
        <MenuDivider />
        <MenuItem isDisabled={!restricted} closeOnSelect onClick={() => onChange(null)} {...ITEM_SURFACE}>
          Show everywhere
        </MenuItem>
        <Text px={3} pt={1} pb={1} fontSize="11px" color={dim} maxW="290px">
          The eye still hides it everywhere — hidden always wins.
        </Text>
      </MenuList>
    </Menu>
  )
}
