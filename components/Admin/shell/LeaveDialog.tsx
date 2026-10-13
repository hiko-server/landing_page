import { useRef } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
  Text,
} from '@chakra-ui/react'
import { outlineButtonProps, primaryButtonProps } from './ui'

/**
 * In-app "unsaved changes" dialog used instead of window.confirm by
 * AdminDirtyContext for navigation, tab switches and reloads.
 *
 *   Save and leave  (primary) every dirty editor saves; leaves only if all succeed
 *   Discard         drops the edits and continues
 *   Stay            the least destructive choice, focused by default
 *
 * "Save and leave" is offered only when every dirty editor registered a save
 * function and the action allows it (a "Reload latest" cannot be saved
 * through).
 */
export default function LeaveDialog({
  isOpen,
  title,
  message,
  canSave,
  saving,
  saveLabel = 'Save and leave',
  discardLabel = 'Discard',
  onSave,
  onDiscard,
  onStay,
}: {
  isOpen: boolean
  title: string
  message: string
  canSave: boolean
  saving: boolean
  saveLabel?: string
  discardLabel?: string
  onSave: () => void
  onDiscard: () => void
  onStay: () => void
}) {
  const stayRef = useRef<HTMLButtonElement | null>(null)
  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={stayRef}
      onClose={() => {
        if (!saving) onStay()
      }}
      closeOnOverlayClick={!saving}
      closeOnEsc={!saving}
      isCentered
      motionPreset="none"
    >
      <AlertDialogOverlay>
        <AlertDialogContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
          <AlertDialogHeader fontSize="md" pb={2}>
            {title}
          </AlertDialogHeader>
          <AlertDialogBody fontSize="sm">
            <Text>{message}</Text>
            {canSave ? (
              <Text mt={2} color="page.fg-secondary">
                Saving stops here if anything can’t be saved (for example a newer version saved elsewhere), so nothing is lost.
              </Text>
            ) : null}
          </AlertDialogBody>
          <AlertDialogFooter gap={2} flexWrap="wrap">
            <Button ref={stayRef} size="sm" variant="ghost" onClick={onStay} isDisabled={saving}>
              Stay
            </Button>
            <Button
              size="sm"
              {...outlineButtonProps}
              color="red.600"
              _dark={{ color: 'red.300' }}
              onClick={onDiscard}
              isDisabled={saving}
            >
              {discardLabel}
            </Button>
            {canSave ? (
              <Button size="sm" {...primaryButtonProps} onClick={onSave} isLoading={saving} loadingText="Saving">
                {saveLabel}
              </Button>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  )
}
