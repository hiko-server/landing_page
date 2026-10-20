import React from 'react'
import NextLink from 'next/link'
import { Box, Button, Flex, Link, Text } from '@chakra-ui/react'

/**
 * The one empty / unavailable state for public pages and widgets.
 *
 *   variant="block"   a page or section with nothing to show yet (/blog,
 *                     /work, /now): a dashed panel with a small glyph, a
 *                     title, one line of explanation and up to a few links
 *                     to somewhere useful;
 *   variant="inline"  a widget that is empty or failed (the GitHub widgets,
 *                     a section whose error boundary tripped): one compact
 *                     row with a status dot, the message and an optional
 *                     retry, sized to the widget so swapping its skeleton
 *                     for this never shifts the page.
 *
 * Same hairline, radius, mono caption and dot in both, so every "nothing
 * here" reads alike across the site. Colours are semantic tokens (both
 * themes on the first paint); `tone="error"` only changes the dot to the
 * accent and announces the row (role="status", or "alert" for a crash).
 * Its own words (the retry button, the actions' name) are props, so a page
 * in another language passes its own (lib/uiStrings).
 */

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

export type EmptyStateAction = { label: string; href: string }

type Common = {
  tone?: 'empty' | 'error'
  /** Live-region role for a state that appears after the page loaded. */
  role?: 'status' | 'alert'
}

type BlockProps = Common & {
  variant?: 'block'
  title: React.ReactNode
  children?: React.ReactNode
  actions?: readonly EmptyStateAction[]
  icon?: React.ReactNode
  /** Heading level of the title (it sits inside a page, under the page's h1). */
  as?: 'h2' | 'h3' | 'p'
  /** Accessible name of the actions list, in the page's language ("Where to next"). */
  actionsLabel?: string
}

type InlineProps = Common & {
  variant: 'inline'
  children: React.ReactNode
  onRetry?: () => void
  retryLabel?: string
  minH?: string | Record<string, string>
}

export type EmptyStateProps = BlockProps | InlineProps

/** Default glyph: an empty frame with a dotted baseline (decorative). */
function EmptyGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M8 15h.01M12 15h.01M16 15h.01" strokeWidth="2.2" />
      </g>
    </svg>
  )
}

function Dot({ tone }: { tone: 'empty' | 'error' }) {
  return (
    <Box
      as="span"
      aria-hidden
      w="6px"
      h="6px"
      borderRadius="full"
      flexShrink={0}
      bg={tone === 'error' ? 'var(--accent)' : 'page.border-strong'}
      sx={{ '@media (forced-colors: active)': { bg: 'CanvasText' } }}
    />
  )
}

export default function EmptyState(props: EmptyStateProps) {
  const tone = props.tone || 'empty'

  if (props.variant === 'inline') {
    const { children, onRetry, retryLabel = 'Try again', minH, role } = props
    return (
      <Flex
        role={role}
        data-empty-state="inline"
        align="center"
        justify="space-between"
        gap={3}
        flexWrap="wrap"
        w="100%"
        minH={minH}
        px={4}
        py={3}
        border="1px dashed"
        borderColor="page.border-strong"
        borderRadius="lg"
      >
        <Flex align="center" gap={2.5} minW={0}>
          <Dot tone={tone} />
          <Text fontFamily={MONO} fontSize="12px" letterSpacing="0.02em" color="page.fg-secondary">
            {children}
          </Text>
        </Flex>
        {onRetry ? (
          <Button
            size="xs"
            minH="24px"
            variant="outline"
            fontFamily={MONO}
            fontWeight={400}
            borderColor="page.border-strong"
            color="page.fg"
            onClick={onRetry}
            _hover={{ borderColor: 'var(--accent)', color: 'accent.text' }}
            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
          >
            {retryLabel}
          </Button>
        ) : null}
      </Flex>
    )
  }

  const { title, children, actions = [], icon, as = 'h2', role, actionsLabel = 'Where to next' } = props
  return (
    <Flex
      role={role}
      data-empty-state="block"
      direction="column"
      align="center"
      textAlign="center"
      gap={3}
      px={[5, 8]}
      py={[10, 14]}
      border="1px dashed"
      borderColor="page.border-strong"
      borderRadius="lg"
    >
      <Flex
        aria-hidden
        align="center"
        justify="center"
        w="40px"
        h="40px"
        mb={1}
        borderRadius="10px"
        border="1px solid"
        borderColor="page.border"
        bg="page.bg-elevated"
        color={tone === 'error' ? 'accent.text' : 'page.fg-subtle'}
      >
        {icon || <EmptyGlyph />}
      </Flex>
      <Text as={as} fontSize="16px" fontWeight={500} letterSpacing="-0.01em" color="page.fg" m={0}>
        {title}
      </Text>
      {children ? (
        <Text maxW="46ch" fontSize="14px" lineHeight="1.6" color="page.fg-secondary" m={0} sx={{ textWrap: 'pretty' }}>
          {children}
        </Text>
      ) : null}
      {actions.length > 0 && (
        <Flex as="ul" listStyleType="none" m={0} p={0} mt={1} gap={2} wrap="wrap" justify="center" aria-label={actionsLabel}>
          {actions.map((a) => (
            <li key={a.href}>
              <Link
                as={NextLink}
                href={a.href}
                display="inline-flex"
                alignItems="center"
                gap={1.5}
                minH="44px"
                px={3}
                fontFamily={MONO}
                fontSize="12px"
                color="accent.text"
                borderRadius="md"
                _hover={{ textDecoration: 'none', bg: 'page.hover' }}
                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
              >
                {a.label} <span aria-hidden>→</span>
              </Link>
            </li>
          ))}
        </Flex>
      )}
    </Flex>
  )
}
