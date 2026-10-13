import { useState } from 'react'
import { Box, Button, Flex, Text } from '@chakra-ui/react'
import { copyText } from '../MDX/clipboard'
import { log } from '../../lib/log'
import type { FallbackProps, GetUnsaved } from './ErrorBoundary'

/**
 * Error-boundary fallback for admin panels (components/Common/ErrorBoundary).
 * Its own module so it loads with the admin screens only, never in the
 * bundle every visitor downloads.
 */

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

/** Text the "Copy unsaved changes" button puts on the clipboard; null when there is nothing to copy. */
export function unsavedText(getUnsaved: GetUnsaved): string | null {
  const value = getUnsaved()
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.length ? value : null
  return JSON.stringify(value, null, 2)
}

type CopyState = 'idle' | 'copied' | 'empty' | 'failed'

const COPY_STATUS: Record<CopyState, string> = {
  idle: '',
  copied: 'Unsaved changes copied to the clipboard.',
  empty: 'There are no unsaved changes to copy.',
  failed: 'Could not copy — your browser blocked clipboard access.',
}

/** Fallback for admin panels: explains, offers retry, a full reload and (when available) copying unsaved edits. */
export function PanelFallback({
  error,
  reset,
  getUnsaved,
  title = 'This panel hit an unexpected error.',
}: Partial<FallbackProps> & { title?: string }) {
  const [copy, setCopy] = useState<CopyState>('idle')

  const copyUnsaved = async () => {
    if (!getUnsaved) return
    let text: string | null
    try {
      text = unsavedText(getUnsaved)
    } catch (err) {
      log.warn('could not read unsaved changes from the crashed panel', { err })
      setCopy('failed')
      return
    }
    if (text === null) {
      setCopy('empty')
      return
    }
    setCopy((await copyText(text)) ? 'copied' : 'failed')
  }

  return (
    <Box role="alert" border="1px solid" borderColor="page.border" borderRadius="xl" bg="page.bg-elevated" p={{ base: 4, md: 6 }}>
      <Text as="span" display="block" fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" color="accent.text">
        [ERR]
      </Text>
      <Text mt={1} fontWeight={600}>
        {title}
      </Text>
      <Text mt={1} fontSize="sm" color="page.fg-secondary">
        {getUnsaved
          ? 'Your saved content is safe. Copy your unsaved edits before retrying or reloading.'
          : 'Your saved content is safe. Unsaved edits in this panel may need to be redone.'}
      </Text>
      {error?.message ? (
        <Text mt={3} fontFamily={MONO} fontSize="xs" color="page.fg-secondary" wordBreak="break-word">
          {error.message}
        </Text>
      ) : null}
      <Flex mt={4} gap={2} flexWrap="wrap">
        {reset ? (
          <Button size="sm" variant="outline" borderColor="page.border-strong" onClick={reset}>
            Retry
          </Button>
        ) : null}
        {getUnsaved ? (
          <Button size="sm" variant="outline" borderColor="page.border-strong" onClick={() => void copyUnsaved()}>
            Copy unsaved changes
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </Flex>
      <Text role="status" aria-live="polite" mt={copy === 'idle' ? 0 : 3} fontSize="xs" color="page.fg-secondary">
        {COPY_STATUS[copy]}
      </Text>
    </Box>
  )
}
