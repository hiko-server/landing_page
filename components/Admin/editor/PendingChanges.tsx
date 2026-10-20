import { useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Flex,
  Text,
} from '@chakra-ui/react'
import { outlineButtonProps, primaryButtonProps } from '../shell/ui'
import { ago } from '../shell/autosaveStatus'

/**
 * Unpublished changes on a live post or case study (H4): the banner that
 * says the editor shows saved changes visitors don't see yet — with
 * "Review & publish…", "Preview ↗" (Draft Mode renders the pending version
 * at the real URL) and "Discard…" — and the discard confirmation.
 */

export function PendingChangesBanner({
  noun,
  savedAt,
  stale,
  previewHref,
  onReview,
  onDiscard,
  busy,
}: {
  noun: string
  savedAt: number
  /** The live version changed after these changes were started. */
  stale: boolean
  previewHref: string
  onReview: () => void
  onDiscard: () => void
  busy: boolean
}) {
  return (
    <Flex
      role="region"
      aria-label="Unpublished changes"
      data-testid="pending-banner"
      align={{ base: 'flex-start', md: 'center' }}
      direction={{ base: 'column', md: 'row' }}
      gap={3}
      px={4}
      py={3}
      border="1px solid"
      borderColor={stale ? 'status.warning' : 'page.border-strong'}
      borderRadius="lg"
      bg="page.bg-elevated"
    >
      <Box flex={1} minW={0} fontSize="sm">
        <Text fontWeight={500}>
          Unpublished changes{' '}
          <Text as="span" fontWeight={400} color="page.fg-secondary">
            · saved {ago(savedAt, Date.now())}
          </Text>
        </Text>
        <Text fontSize="xs" color={stale ? 'status.warning' : 'page.fg-secondary'} mt={0.5}>
          {stale
            ? `The live ${noun} changed after these edits were saved (a restore or a change from another tab). Publishing replaces it with what you see here — review the comparison first.`
            : `Visitors still see the published ${noun}. Publish the changes when they are ready.`}
        </Text>
      </Box>
      <Flex gap={2} flexShrink={0} flexWrap="wrap">
        <Button size="sm" variant="ghost" color="page.fg-secondary" onClick={onDiscard} isDisabled={busy}>
          Discard…
        </Button>
        <Button as="a" size="sm" {...outlineButtonProps} href={previewHref} target="_blank" rel="noopener">
          Preview ↗
        </Button>
        <Button size="sm" {...primaryButtonProps} onClick={onReview} isDisabled={busy}>
          Review &amp; publish…
        </Button>
      </Flex>
    </Flex>
  )
}

export function DiscardChangesDialog({
  isOpen,
  noun,
  dirty,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean
  noun: string
  /** The editor also has edits that were never saved. */
  dirty: boolean
  onCancel: () => void
  onConfirm: () => Promise<boolean>
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <AlertDialog isOpen={isOpen} onClose={onCancel} leastDestructiveRef={cancelRef} isCentered>
      <AlertDialogOverlay>
        <AlertDialogContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
          <AlertDialogHeader fontSize="md">Discard the unpublished changes?</AlertDialogHeader>
          <AlertDialogBody fontSize="sm">
            The editor goes back to the published {noun}, which visitors see now.
            {dirty ? ' Your unsaved edits are discarded too.' : ''} The discarded version is not kept in the history.
          </AlertDialogBody>
          <AlertDialogFooter gap={2}>
            <Button ref={cancelRef} size="sm" variant="ghost" onClick={onCancel}>
              Keep them
            </Button>
            <Button
              size="sm"
              colorScheme="red"
              isLoading={busy}
              loadingText="Discarding"
              onClick={async () => {
                setBusy(true)
                const ok = await onConfirm()
                setBusy(false)
                if (ok) onCancel()
              }}
            >
              Discard changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  )
}
