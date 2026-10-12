import React from 'react'
import NextLink from 'next/link'
import { Box, Flex, LinkBox, LinkOverlay, Text } from '@chakra-ui/react'
import type { NowLink, NowRole, NowSignals as Signals } from '../../lib/nowSignals'
import { formatPostDate } from '../../lib/postDate'

/**
 * Renders the live /now signals (lib/nowSignals.ts).
 *
 *   variant="full"     the page's main content when the owner has not written one
 *   variant="compact"  a sidebar next to the owner's own text
 *
 * Nothing here is invented: every line comes from the public CV, the home
 * "currently coding" chip or the published writing.
 */

const mono = 'var(--font-geist-mono), ui-monospace, monospace'
const ease = 'var(--ease-out-quart, cubic-bezier(0.22,1,0.36,1))'

export function AutoUpdatedLabel({ composed }: { composed: string }) {
  return (
    <Flex align="center" gap={2} fontFamily={mono} fontSize="11px" letterSpacing="0.04em" color="page.fg-secondary">
      <Box as="span" position="relative" w="6px" h="6px" flexShrink={0} aria-hidden>
        <Box as="span" className="pulse-dot" position="absolute" inset={0} borderRadius="full" />
        <Box as="span" position="absolute" inset={0} borderRadius="full" bg="var(--live-green)" />
      </Box>
      <Text as="span">
        Auto-updated from my CV and writing
        {composed ? (
          <>
            {' · '}
            <time dateTime={composed}>{formatPostDate(composed)}</time>
          </>
        ) : null}
      </Text>
    </Flex>
  )
}

export default function NowSignals({
  signals,
  variant,
  startAt = 2,
}: {
  signals: Signals
  variant: 'full' | 'compact'
  /** Section number of the first group (full variant). */
  startAt?: number
}) {
  const compact = variant === 'compact'
  const groups: Array<{ key: string; title: string; body: React.ReactNode }> = []

  if (signals.roles.length) {
    groups.push({
      key: 'roles',
      title: 'Currently',
      body: (
        <Box as="ul" listStyleType="none" m={0} p={0}>
          {signals.roles.map((r, i) => (
            <RoleRow key={i} role={r} compact={compact} first={i === 0} />
          ))}
        </Box>
      ),
    })
  }

  if (signals.coding) {
    const c = signals.coding
    groups.push({
      key: 'coding',
      title: c.label || 'Currently coding',
      body: (
        <Box>
          <Text fontSize={compact ? '15px' : ['17px', '19px']} fontWeight={600} color="page.fg" lineHeight="1.35">
            {c.project}
          </Text>
          {c.note ? (
            <Text fontFamily={mono} fontSize="12px" color="page.fg-secondary" mt={1}>
              {c.note}
            </Text>
          ) : null}
        </Box>
      ),
    })
  }

  if (signals.post || signals.work) {
    groups.push({
      key: 'writing',
      title: 'Latest writing',
      body: (
        <Flex direction={compact ? 'column' : ['column', 'row']} gap={3}>
          {signals.post ? <WritingCard item={signals.post} kind="Blog post" collection="blog" compact={compact} /> : null}
          {signals.work ? <WritingCard item={signals.work} kind="Case study" collection="work" compact={compact} /> : null}
        </Flex>
      ),
    })
  }

  if (!groups.length) return null

  return (
    <Flex direction="column" gap={compact ? 6 : [10, 12]}>
      {groups.map((g, i) => (
        <Box as="section" key={g.key} aria-labelledby={`now-${variant}-${g.key}`}>
          <Text
            as={compact ? 'h3' : 'h2'}
            id={`now-${variant}-${g.key}`}
            className={compact ? undefined : 'section-label-rule'}
            fontFamily={mono}
            fontSize="11px"
            letterSpacing="0.12em"
            textTransform="uppercase"
            color="page.fg-secondary"
            mb={compact ? 2 : 5}
          >
            {compact ? null : (
              <Text as="span" aria-hidden mr="0.6em">
                [{String(startAt + i).padStart(2, '0')}]
              </Text>
            )}
            {g.title}
          </Text>
          {g.body}
        </Box>
      ))}
    </Flex>
  )
}

function RoleRow({ role, compact, first }: { role: NowRole; compact: boolean; first: boolean }) {
  const tag = role.status === 'upcoming' ? 'Starting soon' : role.kind === 'study' ? 'Studying' : 'Working'
  const place = [role.org, role.location].filter(Boolean).join(' · ')
  return (
    <Box
      as="li"
      py={compact ? 2.5 : 4}
      borderTop={first ? undefined : '1px solid'}
      borderColor="page.border"
      display={compact ? 'block' : 'grid'}
      gridTemplateColumns={{ md: '140px minmax(0,1fr) auto' }}
      columnGap={6}
      alignItems="baseline"
    >
      <Text
        fontFamily={mono}
        fontSize="10px"
        letterSpacing="0.14em"
        textTransform="uppercase"
        color={role.status === 'current' ? 'var(--accent)' : 'page.fg-secondary'}
        mb={compact ? 0.5 : [1, 1, 0]}
      >
        {tag}
      </Text>
      <Box minW={0}>
        <Text fontSize={compact ? '15px' : ['17px', '19px']} fontWeight={600} lineHeight="1.35" color="page.fg">
          {role.title}
        </Text>
        {place ? (
          <Text fontSize={compact ? '14px' : ['15px', '16px']} color="page.fg-secondary" lineHeight="1.5" mt={0.5}>
            {place}
          </Text>
        ) : null}
      </Box>
      {role.when ? (
        <Text
          fontFamily={mono}
          fontSize="12px"
          color="page.fg-secondary"
          mt={compact ? 1 : [1.5, 1.5, 0]}
          textAlign={compact ? undefined : { md: 'right' }}
          whiteSpace={{ md: compact ? undefined : 'nowrap' }}
        >
          {role.when}
        </Text>
      ) : null}
    </Box>
  )
}

function WritingCard({
  item,
  kind,
  collection,
  compact,
}: {
  item: NowLink
  kind: string
  collection: 'blog' | 'work'
  compact: boolean
}) {
  const slug = item.href.split('/').filter(Boolean).pop() || ''
  return (
    <LinkBox
      as="article"
      flex="1"
      minW={0}
      border="1px solid"
      borderColor="page.border"
      borderRadius="12px"
      bg="page.bg-elevated"
      p={compact ? 3.5 : [4, 5]}
      transition={`border-color 250ms ${ease}, transform 250ms ${ease}`}
      _hover={{ borderColor: 'var(--accent)', transform: 'translateY(-1px)' }}
      _focusWithin={{ borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-ring)' }}
      sx={{ '@media (prefers-reduced-motion: reduce)': { '&:hover': { transform: 'none' } } }}
    >
      <Flex justify="space-between" align="baseline" gap={3} mb={2}>
        <Text fontFamily={mono} fontSize="10px" letterSpacing="0.14em" textTransform="uppercase" color="page.fg-secondary">
          {kind}
        </Text>
        {item.date ? (
          <Text fontFamily={mono} fontSize="11px" color="page.fg-secondary" whiteSpace="nowrap">
            {item.dateTime ? <time dateTime={item.dateTime}>{item.date}</time> : item.date}
          </Text>
        ) : null}
      </Flex>
      <Text
        as={compact ? 'h4' : 'h3'}
        fontSize={compact ? '15px' : ['16px', '17px']}
        fontWeight={600}
        lineHeight="1.35"
        color="page.fg"
        style={slug ? { viewTransitionName: `vt-${collection}-${slug}` } as React.CSSProperties : undefined}
      >
        <LinkOverlay as={NextLink} href={item.href} _focus={{ outline: 'none' }}>
          {item.title}
        </LinkOverlay>
      </Text>
      {item.description && !compact ? (
        <Text fontSize="15px" lineHeight="1.6" color="page.fg-secondary" mt={1.5} noOfLines={2}>
          {item.description}
        </Text>
      ) : null}
    </LinkBox>
  )
}
