import { useRef } from 'react'
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  Box,
  Button,
  Flex,
  Text,
} from '@chakra-ui/react'
import { MONO, outlineButtonProps } from '../shell/ui'

/**
 * Notices shared by the post, case-study and page editors: the local-draft
 * restore banner, the "changed elsewhere" conflict dialog and the inline
 * compile-error banner.
 */

/** "14:32" today, otherwise "12 Oct, 14:32". */
export function draftTimeLabel(at: number, now = Date.now()): string {
  const d = new Date(at)
  const today = new Date(now)
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function DraftBanner({
  at,
  stale,
  onRestore,
  onDiscard,
}: {
  at: number
  stale: boolean
  onRestore: () => void
  onDiscard: () => void
}) {
  return (
    <Flex
      role="region"
      aria-label="Unsaved draft"
      align={{ base: 'flex-start', sm: 'center' }}
      direction={{ base: 'column', sm: 'row' }}
      gap={3}
      px={4}
      py={3}
      border="1px solid"
      borderColor={stale ? 'orange.400' : 'page.border-strong'}
      borderRadius="lg"
      bg={stale ? 'rgba(251,146,60,0.08)' : 'var(--accent-soft)'}
    >
      <Box flex={1} minW={0} fontSize="sm">
        <Text fontWeight={500}>Restore unsaved draft from {draftTimeLabel(at)}?</Text>
        <Text fontSize="xs" color="page.fg-secondary" mt={0.5}>
          {stale
            ? 'It was based on an older version — someone saved since. Restoring replaces what is loaded now.'
            : 'These edits were kept on this device but never saved.'}
        </Text>
      </Box>
      <Flex gap={2} flexShrink={0}>
        <Button size="sm" variant="ghost" color="page.fg-secondary" onClick={onDiscard}>
          Discard
        </Button>
        <Button size="sm" {...outlineButtonProps} onClick={onRestore}>
          {stale ? 'Restore older draft' : 'Restore'}
        </Button>
      </Flex>
    </Flex>
  )
}

export function ConflictDialog({
  isOpen,
  noun,
  saving,
  onCancel,
  onReload,
  onOverwrite,
}: {
  isOpen: boolean
  noun: string
  saving: boolean
  onCancel: () => void
  onReload: () => void
  onOverwrite: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <AlertDialog isOpen={isOpen} onClose={onCancel} leastDestructiveRef={cancelRef} isCentered>
      <AlertDialogOverlay>
        <AlertDialogContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
          <AlertDialogHeader fontSize="md">Changed elsewhere</AlertDialogHeader>
          <AlertDialogBody fontSize="sm">
            This {noun} was saved from another tab, device or editor after you opened it, so nothing was saved. Reload the
            latest copy (your edits here stay available as a local draft), or overwrite it with your version.
          </AlertDialogBody>
          <AlertDialogFooter gap={2} flexWrap="wrap">
            <Button ref={cancelRef} size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" {...outlineButtonProps} onClick={onReload}>
              Reload latest
            </Button>
            <Button size="sm" colorScheme="red" onClick={onOverwrite} isLoading={saving} loadingText="Saving">
              Overwrite anyway
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  )
}

export type MdxProblem = { line: number | null; column: number | null; reason: string }

export function mdxProblemText(p: MdxProblem): string {
  const where = p.line !== null ? `Line ${p.line}${p.column !== null ? `:${p.column}` : ''}: ` : ''
  return `${where}${p.reason}`
}

export function MdxErrorBanner({ problem, onJump, onDismiss }: { problem: MdxProblem; onJump?: () => void; onDismiss: () => void }) {
  return (
    <Alert status="error" variant="left-accent" borderRadius="md" alignItems="center" gap={3} flexWrap="wrap" bg="page.bg-elevated" role="alert">
      <AlertIcon />
      <AlertDescription flex={1} minW="200px" fontSize="sm">
        Not saved — the body doesn’t compile.{' '}
        <Text as="span" fontFamily={MONO} fontSize="13px">
          {mdxProblemText(problem)}
        </Text>
      </AlertDescription>
      <Flex gap={2}>
        {onJump && problem.line !== null ? (
          <Button size="sm" {...outlineButtonProps} onClick={onJump}>
            Show in MDX
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" color="page.fg-secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </Flex>
    </Alert>
  )
}
