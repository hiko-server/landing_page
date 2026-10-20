import { Box, Button, CloseButton, Flex, Kbd, Text } from '@chakra-ui/react'
import { MONO } from '../shell/ui'

/**
 * The body of an "… · Undo" toast (rendered through Chakra's toast with a
 * custom render; components/Common/UnifiedToast times it and pauses it on
 * hover / focus / hidden tab). Same elevated surface as the v6 Alert.
 */
export default function UndoToast({
  title,
  onUndo,
  onClose,
  undoKeys,
}: {
  title: string
  onUndo: () => void
  onClose: () => void
  /** Keyboard hint, e.g. "⌘Z" (hidden on phones). */
  undoKeys?: string
}) {
  return (
    <Flex
      align="center"
      gap={3}
      pl={4}
      pr={2}
      py={2}
      minW="280px"
      bg="page.bg-elevated"
      color="page.fg"
      border="1px solid"
      borderColor="page.border-strong"
      borderRadius="md"
      boxShadow="elevation.md"
      data-testid="undo-toast"
    >
      <Text fontSize="sm" fontWeight={500} flex={1} minW={0}>
        {title}
      </Text>
      <Button size="sm" variant="ghost" color="accent.text" fontWeight={600} onClick={onUndo} px={2}>
        Undo
        {undoKeys ? (
          <Box as="span" display={{ base: 'none', md: 'inline' }} ml={2}>
            <Kbd fontSize="10px" fontFamily={MONO} bg="page.bg" borderColor="page.border-strong" color="page.fg-secondary">
              {undoKeys}
            </Kbd>
          </Box>
        ) : null}
      </Button>
      <CloseButton size="sm" onClick={onClose} aria-label="Dismiss" />
    </Flex>
  )
}
