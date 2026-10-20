import type React from 'react'
import { Flex } from '@chakra-ui/react'

/**
 * CV Studio's inverse-coloured toast body, in the site's style: a short
 * confirmation ("“Email” only on web"), or a title with an Undo beside it.
 *
 * A Flex, not an HStack: Chakra's Stack keeps only element children
 * (getValidChildren), so a plain-text title passed straight in would be
 * dropped and the toast would flash up empty — and say nothing to a screen
 * reader in its role="status" region.
 */
export default function InverseToast({ children }: { children: React.ReactNode }) {
  return (
    <Flex
      align="center"
      gap={4}
      bg="page.fg"
      color="page.bg"
      px={4}
      py={2.5}
      borderRadius="lg"
      boxShadow="xl"
      fontSize="13px"
      maxW="calc(100vw - 32px)"
    >
      {children}
    </Flex>
  )
}
