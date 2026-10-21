import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  HStack,
  Text,
  useBreakpointValue,
} from '@chakra-ui/react'
import { CHECK_LABEL, MAX_PAGES, type ReadinessFinding, type ReadinessSeverity } from '../../../lib/cvReadiness'
import type { CvLang } from '../../../lib/cvVisibility'
import { monoFont, useStudioTokens } from './fields'

const GROUPS: Array<{ severity: ReadinessSeverity; title: string; hint: string }> = [
  { severity: 'high', title: 'Fix first', hint: 'Contradictions and claims that are out of date.' },
  { severity: 'medium', title: 'Improve', hint: 'What makes a recruiter skim past.' },
  { severity: 'low', title: 'Consider', hint: 'Links and evidence that would help.' },
]

const SEVERITY_TOKEN: Record<ReadinessSeverity, string> = {
  high: 'status.error',
  medium: 'status.limited',
  low: 'page.fg-secondary',
}

const LANG_TAG: Record<CvLang, string> = { en: 'EN', zh: '中' }

/**
 * Recruiter-readiness panel of the CV Studio (E9): the deterministic checks
 * of lib/cvReadiness, grouped by severity. Each finding jumps to its field
 * ("Go to field") or can be dismissed; dismissals are stored with the CV
 * (and undone like any edit), and a dismissed finding returns only when its
 * content changes. Nothing is ever rewritten for the owner.
 */
export default function ReadinessPanel({
  isOpen,
  onClose,
  open,
  dismissed,
  pages,
  contextError,
  onJump,
  onPreview,
  onDismiss,
  onRestore,
}: {
  isOpen: boolean
  onClose: () => void
  open: ReadinessFinding[]
  dismissed: ReadinessFinding[]
  /** Measured A4 page counts (undefined = that preview has not rendered yet). */
  pages: Partial<Record<CvLang, number>>
  /** Why the case-study / home-page checks could not run (context failed to load), or ''. */
  contextError: string
  onJump: (f: ReadinessFinding) => void
  onPreview: (f: ReadinessFinding) => void
  onDismiss: (f: ReadinessFinding) => void
  onRestore: (f: ReadinessFinding) => void
}) {
  const { border, borderStrong, dim, faint, surfaceAlt } = useStudioTokens()
  const drawerSize = useBreakpointValue({ base: 'full', md: 'md' }) ?? 'md'
  const [showDismissed, setShowDismissed] = useState(false)
  const [jumping, setJumping] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  // After a dismiss / restore removes a row, keep keyboard focus nearby.
  const refocusAt = useRef<number | null>(null)

  useEffect(() => {
    if (isOpen) setJumping(false)
  }, [isOpen])

  useEffect(() => {
    const at = refocusAt.current
    if (at === null) return
    refocusAt.current = null
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-ready-action]')
    if (buttons && buttons.length) buttons[Math.min(at, buttons.length - 1)]?.focus()
  }, [open, dismissed])

  const counts = GROUPS.map((g) => ({ ...g, n: open.filter((f) => f.severity === g.severity).length }))
  let flat = -1

  const row = (f: ReadinessFinding, isDismissed: boolean) => {
    flat += 1
    const myIndex = flat
    return (
      <Flex
        as="li"
        key={f.id}
        direction="column"
        gap={2}
        border="1px solid"
        borderColor={border}
        // Dismissed: a dashed, unfilled card with a secondary title — muted by
        // colour, not opacity, so its words keep ≥ 4.5:1.
        borderStyle={isDismissed ? 'dashed' : 'solid'}
        borderRadius="md"
        bg={isDismissed ? 'transparent' : surfaceAlt}
        px={3}
        py={2.5}
        _hover={{ borderColor: borderStrong }}
        transition="border-color 140ms var(--ease-out-quart)"
        data-finding={f.check}
      >
        <HStack spacing={2} minW={0} flexWrap="wrap">
          <Box w="7px" h="7px" borderRadius="full" bg={SEVERITY_TOKEN[f.severity]} flexShrink={0} aria-hidden />
          <Text fontFamily={monoFont} fontSize="10px" letterSpacing="0.08em" textTransform="uppercase" color={dim}>
            {CHECK_LABEL[f.check]}
          </Text>
          <Text
            fontFamily={monoFont}
            fontSize="9px"
            color={dim}
            border="1px solid"
            borderColor={border}
            borderRadius="3px"
            px="4px"
            lineHeight="14px"
            aria-label={f.lang === 'en' ? 'English' : 'Chinese'}
          >
            {LANG_TAG[f.lang]}
          </Text>
        </HStack>
        <Box minW={0}>
          <Text fontSize="13px" fontWeight={500} wordBreak="break-word" color={isDismissed ? dim : undefined} lang={f.lang === 'zh' ? 'zh-Hans' : undefined}>
            {f.title}
          </Text>
          <Text fontSize="12px" color={dim} mt={0.5}>
            {f.detail}
          </Text>
          {f.crumbs.length > 1 ? (
            <Text fontSize="11px" color={faint} mt={1} noOfLines={1} lang={f.lang === 'zh' ? 'zh-Hans' : undefined}>
              {f.crumbs.join(' › ')}
            </Text>
          ) : null}
        </Box>
        <HStack spacing={2}>
          {isDismissed ? (
            <Button
              size="xs"
              variant="outline"
              borderColor={border}
              data-ready-action=""
              onClick={() => {
                refocusAt.current = myIndex
                onRestore(f)
              }}
            >
              Restore
            </Button>
          ) : (
            <>
              <Button
                size="xs"
                bg="accent.solid"
                color="accent.fg"
                _hover={{ bg: 'accent.solid-hover' }}
                _active={{ bg: 'accent.solid-active' }}
                data-ready-action=""
                onClick={() => {
                  setJumping(true)
                  if (f.path) onJump(f)
                  else onPreview(f)
                }}
                aria-label={`${f.path ? 'Go to the field' : 'Open the preview'}: ${f.title}`}
              >
                {f.path ? 'Go to field' : 'Open preview'}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                color={dim}
                onClick={() => {
                  refocusAt.current = myIndex
                  onDismiss(f)
                }}
                aria-label={`Dismiss: ${f.title}`}
              >
                Dismiss
              </Button>
            </>
          )}
        </HStack>
      </Flex>
    )
  }

  const measured = (['en', 'zh'] as CvLang[]).map((l) => `${l === 'en' ? 'EN' : '中文'} ${pages[l] ? `${pages[l]} p.` : 'not measured'}`)

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size={drawerSize} returnFocusOnClose={!jumping}>
      <DrawerOverlay />
      <DrawerContent bg="page.bg" borderLeft="1px solid" borderColor={border}>
        <DrawerCloseButton />
        <DrawerHeader borderBottom="1px solid" borderColor={border} pb={3}>
          <Text fontFamily={monoFont} fontSize="10px" letterSpacing="0.12em" textTransform="uppercase" color="accent.text">
            Readiness
          </Text>
          <Text fontSize="18px" fontWeight={600} letterSpacing="-0.01em" mt={1}>
            Recruiter readiness
          </Text>
          <HStack spacing={3} mt={2} flexWrap="wrap" aria-label="Open findings by severity">
            {counts.map((c) => (
              <HStack key={c.severity} spacing={1.5}>
                <Box w="7px" h="7px" borderRadius="full" bg={SEVERITY_TOKEN[c.severity]} aria-hidden />
                <Text fontFamily={monoFont} fontSize="11px" fontWeight={400} color={dim}>
                  {c.n} {c.title.toLowerCase()}
                </Text>
              </HStack>
            ))}
          </HStack>
          <Text fontSize="12px" fontWeight={400} color={dim} mt={2}>
            Checks the A4 CV in both languages — what a recruiter gets. Nothing is changed for you.
          </Text>
        </DrawerHeader>
        <DrawerBody px={{ base: 3, md: 5 }} py={4} ref={listRef}>
          {contextError ? (
            <Text fontSize="12px" color={dim} mb={4} role="status">
              {contextError}
            </Text>
          ) : null}
          {open.length === 0 ? (
            <Flex direction="column" align="center" textAlign="center" gap={2} py={10} px={4}>
              <Box as="svg" viewBox="0 0 24 24" w="28px" h="28px" color="status.open" aria-hidden>
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </Box>
              <Text fontWeight={500}>Nothing to flag</Text>
              <Text fontSize="13px" color={dim} maxW="340px">
                {dismissed.length
                  ? `Every open check passes; ${dismissed.length} dismissed.`
                  : 'Dates line up, highlights lead with results and the languages agree.'}
              </Text>
            </Flex>
          ) : (
            GROUPS.map((g) => {
              const items = open.filter((f) => f.severity === g.severity)
              if (!items.length) return null
              return (
                <Box as="section" key={g.severity} aria-label={g.title} mb={6}>
                  <Flex align="baseline" gap={3} mb={2}>
                    <Text as="h3" fontSize="12px" fontWeight={600} flexShrink={0}>
                      {g.title}{' '}
                      <Text as="span" fontFamily={monoFont} fontWeight={400} color={dim}>
                        {items.length}
                      </Text>
                    </Text>
                    <Text fontSize="11px" color={faint} noOfLines={1}>
                      {g.hint}
                    </Text>
                  </Flex>
                  <Flex as="ul" direction="column" gap={1.5} listStyleType="none" m={0} p={0}>
                    {items.map((f) => row(f, false))}
                  </Flex>
                </Box>
              )
            })
          )}
          {dismissed.length ? (
            <Box mt={2}>
              <Button size="xs" variant="ghost" color={dim} onClick={() => setShowDismissed((v) => !v)} aria-expanded={showDismissed}>
                {showDismissed ? 'Hide' : 'Show'} dismissed ({dismissed.length})
              </Button>
              {showDismissed ? (
                <Flex as="ul" direction="column" gap={1.5} listStyleType="none" m={0} mt={2} p={0} aria-label="Dismissed findings">
                  {dismissed.map((f) => row(f, true))}
                </Flex>
              ) : null}
            </Box>
          ) : null}
        </DrawerBody>
        <DrawerFooter borderTop="1px solid" borderColor={border} justifyContent="flex-start" flexDirection="column" alignItems="flex-start" gap={1}>
          <Text fontSize="11px" color={dim}>
            Dismissals are saved with the CV (Save to keep them) and come back when the text changes.
          </Text>
          <Text fontFamily={monoFont} fontSize="10px" color={faint}>
            A4 length (limit {MAX_PAGES} pages): {measured.join(' · ')}
          </Text>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
