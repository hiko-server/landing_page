import { Box, Button, Flex, Text } from '@chakra-ui/react'
import { availabilityView, type AvailabilityStatus } from '../Common/contactForm'

/**
 * The owner's availability on /contact (home.availability, set in the Home
 * editor). Renders nothing unless a status is set — no invented "open to
 * work" badge.
 *
 *   ● Available for new work        From 2026-11
 *   [Backend] [ML engineering]      [Book a call ↗]
 *
 * The 8px dot uses the status.* tokens; for 'open' a ring behind it pulses
 * (2 s, CSS keyframes `status-pulse` from styles/globals.css, which exist
 * only when motion is allowed, so the dot is static under reduced motion). The label always states the status in words, so colour is
 * never the only cue; in forced-colors mode the dot takes the text colour.
 */

const mono = 'var(--font-geist-mono), ui-monospace, monospace'

const DOT_TOKEN: Record<AvailabilityStatus, string> = {
  open: 'status.open',
  limited: 'status.limited',
  closed: 'status.closed',
}

type AvailabilityInput = Parameters<typeof availabilityView>[0]

export default function AvailabilityCard({
  availability,
  mb = 6,
}: {
  availability?: AvailabilityInput
  /** Space below the card (Chakra spacing). */
  mb?: number | string
}) {
  const view = availabilityView(availability)
  if (!view) return null

  return (
    <Box
      as="section"
      id="availability"
      aria-labelledby="availability-label"
      border="1px solid"
      borderColor="page.border"
      borderRadius="lg"
      bg="page.bg-elevated"
      px={{ base: 4, md: 5 }}
      py={4}
      mb={mb}
    >
      <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
        <Flex
          as="p"
          id="availability-label"
          align="center"
          gap={2.5}
          px={3}
          py={1}
          border="1px solid"
          borderColor="page.border-strong"
          borderRadius="full"
          fontSize="14px"
          fontWeight={500}
          color="page.fg"
          m={0}
        >
          <Box
            as="span"
            aria-hidden
            position="relative"
            w="8px"
            h="8px"
            borderRadius="full"
            flexShrink={0}
            bg={DOT_TOKEN[view.status]}
            sx={{
              // 'open' pulses a ring behind the dot; the dot itself stays put.
              ...(view.status === 'open'
                ? {
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 'inherit',
                      bg: 'inherit',
                      opacity: 0,
                    },
                    '@media (prefers-reduced-motion: no-preference)': {
                      '&::before': {
                        animation: 'status-pulse 2s cubic-bezier(0.22, 1, 0.36, 1) infinite',
                      },
                    },
                  }
                : null),
              '@media (forced-colors: active)': {
                bg: 'CanvasText',
                forcedColorAdjust: 'none',
                '&::before': { display: 'none' },
              },
            }}
          />
          {view.label}
        </Flex>
        {view.from ? (
          <Text fontFamily={mono} fontSize="12px" color="page.fg-secondary" className="tnum" m={0}>
            From <time dateTime={view.from}>{view.from}</time>
          </Text>
        ) : null}
      </Flex>

      {view.roles.length || view.bookingUrl ? (
        <Flex mt={4} align="center" justify="space-between" gap={3} flexWrap="wrap">
          {view.roles.length ? (
            <Flex
              as="ul"
              aria-label="Roles"
              listStyleType="none"
              m={0}
              p={0}
              gap={2}
              flexWrap="wrap"
            >
              {view.roles.map((r) => (
                <Box
                  as="li"
                  key={r}
                  fontFamily={mono}
                  fontSize="12px"
                  lineHeight="1.4"
                  px={2.5}
                  py={1}
                  border="1px solid"
                  borderColor="page.border-strong"
                  borderRadius="full"
                  color="page.fg-secondary"
                >
                  {r}
                </Box>
              ))}
            </Flex>
          ) : null}
          {view.bookingUrl ? (
            <Button
              as="a"
              href={view.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              ml="auto"
              size="sm"
              h="36px"
              bg="accent.solid"
              color="accent.fg"
              fontWeight={600}
              _hover={{ bg: 'accent.solid-hover' }}
              _active={{ bg: 'accent.solid-active' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
            >
              Book a call
              <Box as="span" aria-hidden className="nudge-ne" display="inline-block" ml={1.5}>
                ↗
              </Box>
              <span className="sr-only"> (opens in a new tab)</span>
            </Button>
          ) : null}
        </Flex>
      ) : null}
    </Box>
  )
}
