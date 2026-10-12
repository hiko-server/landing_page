import React from 'react'
import { Box, Button, Flex, Text } from '@chakra-ui/react'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

/**
 * Calm, in-place empty / error state for data widgets (GitHub stats, repos,
 * languages, activity). Takes the widget's own min height so swapping the
 * skeleton for this notice never shifts the page.
 */
export default function WidgetNotice({
  kind,
  children,
  onRetry,
  minH,
}: {
  kind: 'empty' | 'error'
  children: React.ReactNode
  onRetry?: () => void
  minH?: string | Record<string, string>
}) {
  return (
    <Flex
      role={kind === 'error' ? 'status' : undefined}
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
        <Box
          as="span"
          aria-hidden
          w="6px"
          h="6px"
          borderRadius="full"
          flexShrink={0}
          bg={kind === 'error' ? 'var(--accent)' : 'page.border-strong'}
        />
        <Text fontFamily={monoFont} fontSize="12px" letterSpacing="0.02em" color="page.fg-secondary">
          {children}
        </Text>
      </Flex>
      {onRetry ? (
        <Button
          size="xs"
          variant="outline"
          fontFamily={monoFont}
          fontWeight={400}
          borderColor="page.border-strong"
          color="page.fg"
          onClick={onRetry}
          _hover={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
        >
          Try again
        </Button>
      ) : null}
    </Flex>
  )
}
