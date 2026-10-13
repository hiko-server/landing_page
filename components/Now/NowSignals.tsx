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

/**
 * "Updated Oct 13, 2026 · from CV and writing" — when the newest source of
 * the page last changed (a YYYY-MM-DD computed on the server; formatted in
 * UTC so server and client agree). `source` names where the content comes
 * from; null for a page the owner wrote (just "Updated …").
 */
export function UpdatedLine({ updatedOn, source = 'from CV and writing' }: { updatedOn: string; source?: string | null }) {
  if (!updatedOn && !source) return null
  return (
    <Text fontFamily={mono} fontSize="12px" letterSpacing="0.02em" color="page.fg-secondary" className="tnum" m={0}>
      {updatedOn ? (
        <>
          Updated <time dateTime={updatedOn}>{formatPostDate(updatedOn)}</time>
          {source ? ` · ${source}` : null}
        </>
      ) : (
        `${source!.charAt(0).toUpperCase()}${source!.slice(1)}`
      )}
    </Text>
  )
}

export default function NowSignals({ signals, variant }: { signals: Signals; variant: 'full' | 'compact' }) {
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
      {groups.map((g) => (
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
        color={role.status === 'current' ? 'accent.text' : 'page.fg-secondary'}
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
          <Text fontFamily={mono} fontSize="11px" color="page.fg-secondary" whiteSpace="nowrap" className="tnum">
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
