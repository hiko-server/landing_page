import { useRef } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { useBottomBarOffset } from '../Common/useBottomBarOffset'

/**
 * Fixed bottom bar shown while an article renders in Draft Mode (the
 * preview cookie issued by the admin-gated /api/admin/draft). "Exit" clears
 * Draft Mode through the same endpoint and returns to the public page, as a
 * full navigation so the cookie change takes effect. `pending`: the page
 * shows a live item's unpublished changes (H4), not a draft.
 */
export default function DraftBar({ path, pending = false }: { path: string; pending?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useBottomBarOffset(ref)
  const exitHref = `/api/admin/draft?disable=1&path=${encodeURIComponent(path)}`

  return (
    <Box
      ref={ref}
      role="region"
      aria-label={pending ? 'Preview of unpublished changes' : 'Draft preview'}
      // Its controls are not scrolled clear of the bar they sit in (globals.css).
      data-bottom-bar=""
      position="fixed"
      left={0}
      right={0}
      bottom={0}
      zIndex={30}
      bg="page.bg-elevated"
      borderTop="1px solid"
      borderColor="page.border-strong"
      py={2.5}
      pb="calc(10px + env(safe-area-inset-bottom))"
      className="no-print"
      sx={{ '@media (forced-colors: active)': { borderTop: '2px solid CanvasText' } }}
    >
      {/* The page's gutter (16 / 24 / 32 px, as the header and footer), so its edges line up with theirs. */}
      <Flex maxW="var(--container-content)" mx="auto" px="var(--page-gutter)" align="center" justify="space-between" gap={4}>
        <Text as="p" m={0} fontFamily="var(--font-geist-mono), monospace" fontSize="12px" color="page.fg-secondary">
          <Box as="span" color="accent.text" fontWeight={600}>
            {pending ? 'Unpublished changes' : 'Draft preview'}
          </Box>{' '}
          {pending ? '· visitors still see the published version' : '· not visible to visitors'}
        </Text>
        <Box
          as="a"
          href={exitHref}
          display="inline-flex"
          alignItems="center"
          minH="36px"
          px={3}
          borderRadius="md"
          border="1px solid"
          borderColor="page.border-strong"
          fontSize="13px"
          fontWeight={500}
          color="page.fg"
          textDecoration="none"
          _hover={{ bg: 'page.hover' }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
        >
          Exit
        </Box>
      </Flex>
    </Box>
  )
}
