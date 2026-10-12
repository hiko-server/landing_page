import React, { useId, useState } from 'react'
import { Box, Text } from '@chakra-ui/react'
import type { TocEntry } from '../../lib/toc'
import { jumpToSection } from './useActiveHeading'

const MONO = 'var(--font-geist-mono), monospace'

type Props = {
  toc: readonly TocEntry[]
  activeId: string | null
}

function TocList({ toc, activeId, onNavigate }: Props & { onNavigate?: () => void }) {
  return (
    <Box as="ol" listStyleType="none" m={0} p={0} borderLeft="1px solid" borderColor="page.border">
      {toc.map((entry) => {
        const active = entry.id === activeId
        return (
          <Box as="li" key={entry.id} m={0}>
            <Box
              as="a"
              href={`#${entry.id}`}
              aria-current={active ? 'location' : undefined}
              onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                e.preventDefault()
                if (onNavigate) {
                  // Collapse first, then scroll: the panel sits above the
                  // target, so closing it afterwards would shift the page.
                  onNavigate()
                  window.requestAnimationFrame(() => jumpToSection(entry.id))
                } else {
                  jumpToSection(entry.id)
                }
              }}
              display="block"
              ml="-1px"
              py={1.5}
              pl={entry.depth === 3 ? 6 : 3}
              pr={2}
              fontSize="13px"
              lineHeight="1.45"
              borderLeft="1px solid"
              borderColor={active ? 'var(--accent)' : 'transparent'}
              color={active ? 'page.fg' : 'page.fg-secondary'}
              fontWeight={active ? 500 : 400}
              textDecoration="none"
              transition="color 150ms var(--ease-out-quart), border-color 150ms var(--ease-out-quart)"
              _hover={{ color: 'page.fg' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px', borderRadius: '2px' }}
            >
              {entry.text}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/** Sticky right-rail table of contents (xl and up). */
export function TocRail({ toc, activeId }: Props) {
  const labelId = useId()
  return (
    <Box as="nav" aria-labelledby={labelId}>
      <Text
        id={labelId}
        fontFamily={MONO}
        fontSize="11px"
        letterSpacing="0.12em"
        textTransform="uppercase"
        color="page.fg-secondary"
        mb={3}
      >
        On this page
      </Text>
      <TocList toc={toc} activeId={activeId} />
    </Box>
  )
}

/** Collapsible table of contents shown above the article below xl. */
export function TocDisclosure({ toc, activeId }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <Box
      as="nav"
      aria-label="On this page"
      mb={10}
      border="1px solid"
      borderColor="page.border"
      borderRadius="lg"
      bg="page.surface"
    >
      <Box
        as="button"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        display="flex"
        w="100%"
        alignItems="center"
        justifyContent="space-between"
        gap={3}
        px={4}
        minH="44px"
        fontFamily={MONO}
        fontSize="11px"
        letterSpacing="0.12em"
        textTransform="uppercase"
        color="page.fg-secondary"
        borderRadius="lg"
        _hover={{ color: 'page.fg' }}
        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
      >
        <span>
          On this page <Text as="span" opacity={0.7}>({toc.length})</Text>
        </span>
        <Box
          as="span"
          aria-hidden
          display="inline-block"
          transform={open ? 'rotate(45deg)' : 'none'}
          transition="transform 200ms var(--ease-out-quart)"
          fontSize="14px"
          lineHeight={1}
        >
          +
        </Box>
      </Box>
      <Box id={panelId} hidden={!open} px={4} pb={4}>
        <TocList toc={toc} activeId={activeId} onNavigate={() => setOpen(false)} />
      </Box>
    </Box>
  )
}
