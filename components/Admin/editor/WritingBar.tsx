import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
} from '@chakra-ui/react'
import { cssTransition } from '../../../theme/tokens'
import { MONO, useIsMac } from '../shell/ui'
import { formatCount, statsSummary, textStats } from '../../../lib/textStats'
import { autosaveStatus, type AutosaveInput } from '../shell/autosaveStatus'

/**
 * The writing bar above the body of the post and case-study editors (H3):
 *
 *   - where the words are right now (only on this device, saved as a draft,
 *     saved as unpublished changes, live) — shared/autosaveStatus;
 *   - words (CJK counted per character), characters and the reading time —
 *     the same count the public page shows (lib/textStats); details in a
 *     popover;
 *   - Find & replace (also ⌘F / Ctrl+F inside the editor), Focus (dims every
 *     block but the one being written) and Typewriter scrolling (the caret
 *     line stays at the same height). Both modes are remembered on this
 *     device.
 *
 * Not a live region: the title bar's save status already announces state
 * changes; this line is read on demand.
 */

const FOCUS_KEY = 'admin:writing-focus'
const TYPEWRITER_KEY = 'admin:writing-typewriter'

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    window.localStorage.setItem(key, on ? '1' : '0')
  } catch {
    /* storage blocked: the mode just isn't remembered */
  }
}

/** Focus mode and typewriter scrolling, remembered per device. */
export function useWritingModes() {
  const [focusMode, setFocus] = useState(false)
  const [typewriter, setTypewriter] = useState(false)
  useEffect(() => {
    setFocus(readFlag(FOCUS_KEY))
    setTypewriter(readFlag(TYPEWRITER_KEY))
  }, [])
  return {
    focusMode,
    typewriter,
    toggleFocus: () =>
      setFocus((on) => {
        writeFlag(FOCUS_KEY, !on)
        return !on
      }),
    toggleTypewriter: () =>
      setTypewriter((on) => {
        writeFlag(TYPEWRITER_KEY, !on)
        return !on
      }),
  }
}

/** "now" refreshed every 15 s (the "autosaved 3 min ago" line). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

const TONE_DOT = { ok: 'status.open', pending: 'accent.text', unsaved: 'status.warning' } as const

function ModeToggle({ label, hint, pressed, onClick }: { label: string; hint: string; pressed: boolean; onClick: () => void }) {
  return (
    <Button
      size="xs"
      h="28px"
      px={2.5}
      variant="ghost"
      fontWeight={500}
      fontSize="12px"
      aria-pressed={pressed}
      title={hint}
      onClick={onClick}
      color={pressed ? 'accent.text' : 'page.fg-secondary'}
      bg={pressed ? 'page.hover' : undefined}
      _hover={{ bg: 'page.hover', color: 'page.fg' }}
      transition={cssTransition(['color', 'background-color'], 'fast')}
      leftIcon={
        <Box
          as="span"
          aria-hidden
          w="6px"
          h="6px"
          borderRadius="full"
          border="1px solid"
          borderColor="currentColor"
          bg={pressed ? 'currentColor' : 'transparent'}
          transition={cssTransition(['background-color'], 'fast')}
        />
      }
    >
      {label}
    </Button>
  )
}

export default function WritingBar({
  body,
  labelId,
  save,
  focusMode,
  typewriter,
  onToggleFocus,
  onToggleTypewriter,
  onFind,
}: {
  body: string
  /** id of the "Body" label (the editor is labelled by it). */
  labelId: string
  save: Omit<AutosaveInput, 'now'>
  focusMode: boolean
  typewriter: boolean
  onToggleFocus: () => void
  onToggleTypewriter: () => void
  onFind: () => void
}) {
  const isMac = useIsMac()
  const now = useNow()
  // Counting a long body on every keystroke would compete with typing.
  const deferred = useDeferredValue(body)
  const stats = useMemo(() => textStats(deferred), [deferred])
  const line = autosaveStatus({ ...save, now })
  const findKeys = isMac ? '⌘F' : 'Ctrl+F'

  return (
    <Flex align="center" justify="space-between" gap={{ base: 2, md: 4 }} flexWrap="wrap" mb={2} minH="32px">
      <Flex align="baseline" gap={3} minW={0} flexWrap="wrap">
        <Text as="span" id={labelId} fontSize="13px" fontWeight={500}>
          Body
        </Text>
        <Flex align="center" gap={1.5} minW={0} data-testid="autosave-status">
          <Box w="6px" h="6px" borderRadius="full" bg={TONE_DOT[line.tone]} flexShrink={0} aria-hidden />
          <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" noOfLines={1}>
            {line.text}
          </Text>
        </Flex>
      </Flex>

      <Flex align="center" gap={1} flexWrap="wrap" ml="auto">
        <Popover placement="bottom-end" isLazy>
          <PopoverTrigger>
            <Button
              size="xs"
              h="28px"
              px={2}
              variant="ghost"
              fontFamily={MONO}
              fontWeight={400}
              fontSize="11px"
              color="page.fg-secondary"
              _hover={{ bg: 'page.hover', color: 'page.fg' }}
              className="tnum"
              aria-label={`Text statistics: ${statsSummary(stats)}`}
              data-testid="writing-stats"
            >
              {formatCount(stats.words)} {stats.words === 1 ? 'word' : 'words'}
              {stats.readingMinutes ? ` · ${stats.readingMinutes} min read` : ''}
            </Button>
          </PopoverTrigger>
          <PopoverContent w="260px" bg="page.bg-elevated" borderColor="page.border" boxShadow="elevation.md" _focusVisible={{ outline: 'none' }}>
            <PopoverArrow bg="page.bg-elevated" />
            <PopoverBody p={3}>
              <Box as="dl" fontSize="13px" sx={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 1.5, columnGap: 4 }} className="tnum">
                <Text as="dt" color="page.fg-secondary">
                  Words
                </Text>
                <Text as="dd" m={0} textAlign="right">
                  {formatCount(stats.words)}
                </Text>
                {stats.cjk ? (
                  <>
                    <Text as="dt" color="page.fg-secondary">
                      of which CJK characters
                    </Text>
                    <Text as="dd" m={0} textAlign="right">
                      {formatCount(stats.cjk)}
                    </Text>
                  </>
                ) : null}
                <Text as="dt" color="page.fg-secondary">
                  Characters
                </Text>
                <Text as="dd" m={0} textAlign="right">
                  {formatCount(stats.characters)}
                </Text>
                <Text as="dt" color="page.fg-secondary">
                  Without spaces
                </Text>
                <Text as="dd" m={0} textAlign="right">
                  {formatCount(stats.charactersNoSpaces)}
                </Text>
                <Text as="dt" color="page.fg-secondary">
                  Reading time
                </Text>
                <Text as="dd" m={0} textAlign="right">
                  {stats.readingMinutes ? `${stats.readingMinutes} min` : '—'}
                </Text>
              </Box>
              <Text fontSize="11px" color="page.fg-secondary" mt={2.5}>
                Counted on the text readers see (no link targets or markup), like the reading time on the page. Chinese, Japanese and Korean count per character.
              </Text>
            </PopoverBody>
          </PopoverContent>
        </Popover>
        <Button
          size="xs"
          h="28px"
          px={2.5}
          variant="ghost"
          fontWeight={500}
          fontSize="12px"
          color="page.fg-secondary"
          _hover={{ bg: 'page.hover', color: 'page.fg' }}
          onClick={onFind}
          aria-keyshortcuts={isMac ? 'Meta+F' : 'Control+F'}
          title={`Find & replace in the body (${findKeys} while editing)`}
        >
          Find
          <Box as="span" ml={1.5} fontFamily={MONO} fontSize="10px" color="page.fg-subtle" aria-hidden display={{ base: 'none', md: 'inline' }}>
            {findKeys}
          </Box>
        </Button>
        <ModeToggle label="Focus" hint="Dim everything but the paragraph you are writing" pressed={focusMode} onClick={onToggleFocus} />
        <ModeToggle label="Typewriter" hint="Keep the line you are typing at the same height" pressed={typewriter} onClick={onToggleTypewriter} />
      </Flex>
    </Flex>
  )
}
