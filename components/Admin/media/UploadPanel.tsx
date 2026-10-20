import { useEffect, useState } from 'react'
import { Box, Button, Flex, IconButton, Text } from '@chakra-ui/react'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CloseIcon, WarningTwoIcon } from '@chakra-ui/icons'
import { formatBytes } from '../../../lib/media/view'
import { MONO, outlineButtonProps, warnTextProps } from '../shell/ui'
import { queueHeading, waitLabel, type QueueItem, type QueueSummary } from './uploadQueue'

/**
 * The upload queue's panel (H7), bottom right: one row per file with its
 * preview and state; the heading says how far it got and is announced to
 * screen readers. It folds away, and closes once everything is finished.
 */

type Props = {
  items: QueueItem[]
  summary: QueueSummary
  onRetry: (id: string) => void
  onClear: () => void
  /** Above a dialog (the image picker) when needed. */
  zIndex?: number
}

function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

export default function UploadPanel({ items, summary, onRetry, onClear, zIndex = 1300 }: Props) {
  const [open, setOpen] = useState(true)
  const now = useTicker(summary.waiting)
  if (!items.length) return null
  const heading = queueHeading(summary)
  return (
    <Box
      position="fixed"
      right={{ base: 3, md: 6 }}
      bottom={{ base: 3, md: 6 }}
      zIndex={zIndex}
      w={{ base: 'calc(100vw - 24px)', sm: '360px' }}
      bg="page.bg-elevated"
      border="1px solid"
      borderColor="page.border-strong"
      borderRadius="xl"
      boxShadow="0 18px 50px -12px rgba(0,0,0,0.35)"
      overflow="hidden"
      data-testid="upload-panel"
      sx={{
        '@keyframes uploadIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        animation: 'uploadIn 250ms var(--ease-standard, ease)',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <Flex align="center" gap={2} px={4} py={2.5} borderBottom={open ? '1px solid' : 'none'} borderColor="page.border">
        <Text flex="1" fontSize="sm" fontWeight={500} role="status" aria-live="polite" aria-atomic="true">
          {heading}
        </Text>
        <IconButton
          size="xs"
          variant="ghost"
          aria-label={open ? 'Fold the upload list' : 'Show the upload list'}
          aria-expanded={open}
          icon={open ? <ChevronDownIcon boxSize={4} /> : <ChevronUpIcon boxSize={4} />}
          onClick={() => setOpen((o) => !o)}
        />
        {!summary.active ? <IconButton size="xs" variant="ghost" aria-label="Close the upload list" icon={<CloseIcon boxSize={2.5} />} onClick={onClear} /> : null}
      </Flex>
      {open ? (
        <Box as="ul" listStyleType="none" maxH="40vh" overflowY="auto" aria-label="Uploads">
          {items.map((it) => (
            <Flex as="li" key={it.id} align="center" gap={3} px={4} py={2} borderBottom="1px solid" borderColor="page.border" _last={{ borderBottom: 'none' }}>
              <Box w="36px" h="36px" flexShrink={0} borderRadius="md" overflow="hidden" bg="page.bg-overlay" border="1px solid" borderColor="page.border">
                {it.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : null}
              </Box>
              <Box flex="1" minW={0}>
                <Text fontFamily={MONO} fontSize="11px" noOfLines={1} title={it.fileName}>
                  {it.uploaded || it.fileName}
                </Text>
                <Text fontSize="11px" {...(it.status === 'error' ? warnTextProps : { color: 'page.fg-secondary' })} noOfLines={2}>
                  {it.status === 'queued'
                    ? `Waiting · ${formatBytes(it.size)}`
                    : it.status === 'uploading'
                      ? 'Uploading and making sizes…'
                      : it.status === 'waiting'
                        ? `${it.error || 'The server is busy'} — ${waitLabel(it.until, now)}`
                        : it.status === 'done'
                          ? it.warning || 'Uploaded · add its alt text'
                          : it.error}
                </Text>
              </Box>
              {it.status === 'done' ? (
                <CheckIcon color="green.500" boxSize={3} aria-label="Uploaded" />
              ) : it.status === 'error' ? (
                it.error && /not a JPEG|8 MB/.test(it.error) ? (
                  <WarningTwoIcon {...warnTextProps} boxSize={3.5} aria-label="Not uploaded" />
                ) : (
                  <Button size="xs" {...outlineButtonProps} onClick={() => onRetry(it.id)}>
                    Retry
                  </Button>
                )
              ) : (
                <Box
                  w="12px"
                  h="12px"
                  borderRadius="full"
                  border="2px solid"
                  borderColor="page.border-strong"
                  borderTopColor={it.status === 'uploading' ? 'accent.500' : 'page.border-strong'}
                  aria-hidden
                  sx={{
                    '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
                    animation: it.status === 'uploading' ? 'spin 800ms linear infinite' : 'none',
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                  }}
                />
              )}
            </Flex>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}
