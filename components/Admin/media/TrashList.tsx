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
import type { TrashItem } from '../../../lib/media/types'
import { daysLeft, formatBytes, formatDims, relativeTime } from '../../../lib/media/view'
import { MONO, outlineButtonProps } from '../shell/ui'
import { CHECKERBOARD } from './MediaThumb'

/**
 * The media library's trash (H7): every deleted or replaced upload with what
 * it was, when it goes for good, Restore (files, address, texts and R2 copies
 * come back) and Delete now (asks first). Previews come from the admin-only
 * preview route — trashed files are never served at /uploads.
 */

type Props = {
  items: TrashItem[]
  now: number
  days: number
  busy: string | null
  onRestore: (name: string) => void
  onPurge: (name: string) => void
}

export default function TrashList({ items, now, days, busy, onRestore, onPurge }: Props) {
  const [confirm, setConfirm] = useState<TrashItem | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  if (!items.length) {
    return (
      <Box border="1px dashed" borderColor="page.border-strong" borderRadius="xl" px={6} py={12} textAlign="center" data-testid="trash-empty">
        <Text fontWeight={500}>The trash is empty</Text>
        <Text fontSize="sm" color="page.fg-secondary" mt={1}>
          Deleted and replaced images wait here for {days} days before they are removed for good.
        </Text>
      </Box>
    )
  }

  return (
    <>
      <Text fontSize="sm" color="page.fg-secondary" mb={3}>
        Images here are no longer on the site. Restore puts one back with its address, texts and R2 copy; after {days} days it is removed for good.
      </Text>
      <Box as="ul" listStyleType="none" border="1px solid" borderColor="page.border" borderRadius="lg" aria-label="Images in the trash">
        {items.map((t) => (
          <Flex
            as="li"
            key={t.name}
            align="center"
            gap={3}
            px={{ base: 3, md: 4 }}
            py={3}
            borderBottom="1px solid"
            borderColor="page.border"
            _last={{ borderBottom: 'none' }}
            flexWrap={{ base: 'wrap', md: 'nowrap' }}
            data-testid="trash-row"
            data-name={t.name}
          >
            <Box position="relative" w="48px" h="48px" flexShrink={0} borderRadius="md" overflow="hidden" border="1px solid" borderColor="page.border" sx={CHECKERBOARD}>
              {t.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.preview} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              ) : null}
            </Box>
            <Box flex="1 1 200px" minW={0}>
              <Text fontFamily={MONO} fontSize="12px" noOfLines={1} title={t.name}>
                {t.name}
              </Text>
              <Text fontSize="xs" color="page.fg-secondary" className="tnum">
                {formatDims(t.width, t.height)} · {formatBytes(t.bytes)} ·{' '}
                {t.reason === 'replaced' && t.replacedBy ? (
                  <>
                    replaced by{' '}
                    <Text as="span" fontFamily={MONO}>
                      {t.replacedBy}
                    </Text>
                  </>
                ) : (
                  'deleted'
                )}{' '}
                {relativeTime(t.deletedAt, now)} · {daysLeft(t, now)}
                {t.r2Pending ? ' · R2 copy removed at the next sync' : ''}
              </Text>
              {t.meta?.alt || t.meta?.altZh ? (
                <Text fontSize="xs" color="page.fg-secondary" noOfLines={1} mt={0.5}>
                  Alt: {t.meta.alt || t.meta.altZh}
                </Text>
              ) : null}
            </Box>
            <Flex gap={2} flexShrink={0} ml={{ base: '60px', md: 0 }}>
              <Button size="xs" {...outlineButtonProps} onClick={() => onRestore(t.name)} isLoading={busy === `restore:${t.name}`} loadingText="Restoring">
                Restore
              </Button>
              <Button size="xs" variant="ghost" colorScheme="red" onClick={() => setConfirm(t)} isDisabled={!!busy} aria-label={`Delete ${t.name} now`}>
                Delete now…
              </Button>
            </Flex>
          </Flex>
        ))}
      </Box>

      <AlertDialog isOpen={!!confirm} leastDestructiveRef={cancelRef} onClose={() => setConfirm(null)} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
            <AlertDialogHeader fontSize="md">Delete “{confirm?.name}” for good?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">The file and its responsive versions are removed from this server now. This cannot be undone.</AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" {...outlineButtonProps} onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                colorScheme="red"
                onClick={() => {
                  const name = confirm?.name
                  setConfirm(null)
                  if (name) onPurge(name)
                }}
              >
                Delete for good
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  )
}
