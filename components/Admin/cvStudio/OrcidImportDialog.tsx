import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  HStack,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Text,
  VisuallyHidden,
} from '@chakra-ui/react'
import OrcidIdLink from '../../Common/OrcidIdLink'
import { STATUS_LABELS, VENUE_TYPE_LABELS, type PublicationEntry } from '../../../lib/publications/types'
import { markDuplicates, orcidTypeLabel, toPaperEntry, type DedupedCandidate, type ExistingPaper } from '../../../lib/orcid/works'
import { ORCID_WORKS_URL, defaultSelection, importErrorMessage, type OrcidWorksBody } from '../../../lib/orcid/importClient'
import { outlineButtonProps, primaryButtonProps, warnTextProps } from '../shell/ui'
import { LOGIN_HREF } from './cvApi'
import { monoFont, useStudioTokens } from './fields'

/**
 * "Import from ORCID" (CV Studio → Publications): reads the public works of
 * the owner's ORCID record through POST /api/admin/orcid/works (server-side
 * fetch; nothing is stored), lists them with a checkbox each — new papers
 * ticked, works already on the CV (same DOI, else the same title) and
 * non-paper types (patents, datasets, software …) unticked — and hands the
 * ticked ones to the Studio as ordinary paper entries. Nothing is written
 * until the owner saves the CV. Every failure (no record, ORCID busy, a
 * timeout, an unreadable answer, an expired session) is a sentence the
 * owner can act on. Loaded on demand (admin only); the decisions live in
 * lib/orcid/importClient and lib/orcid/works (unit-tested).
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; retry: boolean; signIn: boolean }
  | { kind: 'ready'; candidates: DedupedCandidate[]; detailsFailed: number }

export default function OrcidImportDialog({
  isOpen,
  onClose,
  orcid,
  existing,
  langLabel,
  onImport,
}: {
  isOpen: boolean
  onClose: () => void
  /** The owner's bare iD (validated by the caller). */
  orcid: string
  /** The papers already in the Publications section being edited. */
  existing: readonly ExistingPaper[]
  /** "EN", "中文" or "EN and 中文" — where the papers are added. */
  langLabel: string
  /** Called once with the ticked papers, in list order; the dialog closes itself afterwards. */
  onImport: (entries: PublicationEntry[]) => void
}) {
  const { border, dim } = useStudioTokens()
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [attempt, setAttempt] = useState(0)
  const firstBoxRef = useRef<HTMLInputElement | null>(null)
  const retryRef = useRef<HTMLButtonElement | null>(null)
  const existingRef = useRef(existing)
  existingRef.current = existing

  // One read per open (and per "Try again"); the answer is dropped if the dialog closed meanwhile.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setPhase({ kind: 'loading' })
    setSelected(new Set())
    ;(async () => {
      try {
        const res = await fetch(ORCID_WORKS_URL, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ orcid }),
        })
        const body = (await res.json().catch(() => undefined)) as OrcidWorksBody | undefined
        if (cancelled) return
        if (!res.ok || !body || !Array.isArray(body.candidates)) {
          setPhase({ kind: 'error', ...importErrorMessage(res.status, body) })
          return
        }
        const candidates = markDuplicates(body.candidates, existingRef.current)
        setPhase({ kind: 'ready', candidates, detailsFailed: typeof body.detailsFailed === 'number' ? body.detailsFailed : 0 })
        setSelected(defaultSelection(candidates))
      } catch {
        if (!cancelled) setPhase({ kind: 'error', message: 'The request did not go through. Check your connection and try again.', retry: true, signIn: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, orcid, attempt])

  const candidates = useMemo(() => (phase.kind === 'ready' ? phase.candidates : []), [phase])
  const newCount = useMemo(() => candidates.filter((c) => c.paper && !c.existing).length, [candidates])
  const dupCount = useMemo(() => candidates.filter((c) => c.existing).length, [candidates])
  const toggle = useCallback((code: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }, [])

  const confirm = () => {
    const entries = candidates.filter((c) => selected.has(c.putCode)).map(toPaperEntry)
    if (entries.length) onImport(entries)
    onClose()
  }

  const n = selected.size
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      scrollBehavior="inside"
      isCentered
      initialFocusRef={phase.kind === 'ready' && candidates.length ? firstBoxRef : phase.kind === 'error' && phase.retry ? retryRef : undefined}
    >
      <ModalOverlay />
      <ModalContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4} maxH="min(88vh, 760px)" data-testid="orcid-import-dialog">
        <ModalHeader fontSize="md" pr={12} pb={2}>
          Import from ORCID
          <Text as="span" display="block" mt={1} fontSize="12px" fontWeight={400} color={dim}>
            Public works of{' '}
            <OrcidIdLink
              id={orcid}
              iconSize={16}
              color="accent.text"
              fontFamily={monoFont}
              fontSize="12px"
              verticalAlign="text-bottom"
              _hover={{ textDecoration: 'underline' }}
            />
          </Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pt={0} pb={2}>
          {phase.kind === 'loading' ? (
            <Flex align="center" gap={3} py={10} justify="center" color={dim} fontSize="13px" role="status">
              <Spinner size="sm" />
              Reading your ORCID record…
            </Flex>
          ) : phase.kind === 'error' ? (
            <Box role="alert" py={6} px={1}>
              <Text fontSize="14px" fontWeight={500} mb={1}>
                Nothing was imported
              </Text>
              <Text fontSize="13px" color={dim}>
                {phase.message}
              </Text>
              {phase.signIn ? (
                <Button as={Link} href={LOGIN_HREF} size="sm" mt={4} {...outlineButtonProps} _hover={{ bg: 'page.bg-overlay', textDecoration: 'none' }}>
                  Sign in again
                </Button>
              ) : phase.retry ? (
                <Button ref={retryRef} size="sm" mt={4} {...outlineButtonProps} onClick={() => setAttempt((a) => a + 1)}>
                  Try again
                </Button>
              ) : null}
            </Box>
          ) : candidates.length === 0 ? (
            <Box py={6} px={1} role="status">
              <Text fontSize="14px" fontWeight={500} mb={1}>
                This ORCID record lists no public works
              </Text>
              <Text fontSize="13px" color={dim}>
                Only works whose visibility is “Everyone” on ORCID can be read here. Works set to “Trusted parties” or “Only me” stay private.
              </Text>
            </Box>
          ) : (
            <>
              <Flex align="center" justify="space-between" gap={2} wrap="wrap" py={2} position="sticky" top={0} bg="page.bg-elevated" zIndex={1}>
                <Text fontSize="12px" color={dim} className="tnum" role="status">
                  {candidates.length} work{candidates.length === 1 ? '' : 's'} · {newCount} new paper{newCount === 1 ? '' : 's'}
                  {dupCount ? ` · ${dupCount} already on the CV` : ''}
                </Text>
                <HStack spacing={1}>
                  <Button size="xs" variant="ghost" fontFamily={monoFont} fontSize="11px" color={dim} onClick={() => setSelected(defaultSelection(candidates))}>
                    select new
                  </Button>
                  <Button size="xs" variant="ghost" fontFamily={monoFont} fontSize="11px" color={dim} onClick={() => setSelected(new Set())}>
                    select none
                  </Button>
                </HStack>
              </Flex>
              {phase.detailsFailed > 0 ? (
                <Text fontSize="12px" mb={2} {...warnTextProps}>
                  ORCID did not send the authors of {phase.detailsFailed} work{phase.detailsFailed === 1 ? '' : 's'} — add them after the import.
                </Text>
              ) : null}
              <Box as="ul" listStyleType="none" m={0} p={0} aria-label="Works on your ORCID record">
                {candidates.map((c, i) => {
                  const checked = selected.has(c.putCode)
                  const meta = [c.venue, c.date, c.venueType ? VENUE_TYPE_LABELS[c.venueType].en : ''].filter(Boolean).join(' · ')
                  const quiet = !!c.existing || !c.paper
                  return (
                    <Box as="li" key={c.putCode} borderTop="1px solid" borderColor={border} py={2.5} px={1} data-orcid-work={c.putCode}>
                      <Checkbox
                        ref={i === 0 ? firstBoxRef : undefined}
                        isChecked={checked}
                        onChange={() => toggle(c.putCode)}
                        colorScheme="accent"
                        alignItems="flex-start"
                        w="100%"
                        sx={{ '.chakra-checkbox__control': { mt: '3px' }, '.chakra-checkbox__label': { ml: 3, minW: 0, flex: 1 } }}
                      >
                        <Text as="span" display="block" fontSize="13px" fontWeight={600} lineHeight="1.35" color={quiet && !checked ? dim : undefined}>
                          {c.title}
                          {c.subtitle ? <Text as="span" fontWeight={400}>{`: ${c.subtitle}`}</Text> : null}
                        </Text>
                        {meta ? (
                          <Text as="span" display="block" fontSize="12px" color={dim} mt={0.5}>
                            {meta}
                          </Text>
                        ) : null}
                        <HStack as="span" spacing={1.5} mt={1} flexWrap="wrap" rowGap={1}>
                          {c.status !== 'published' ? (
                            <Badge variant="subtle" fontFamily={monoFont} fontSize="10px">
                              {STATUS_LABELS[c.status].en}
                            </Badge>
                          ) : null}
                          {!c.paper ? (
                            <Badge variant="outline" colorScheme="orange" fontFamily={monoFont} fontSize="10px">
                              not a paper · {orcidTypeLabel(c.orcidType)}
                            </Badge>
                          ) : null}
                          {c.existing ? (
                            <Badge variant="outline" colorScheme="accent" fontFamily={monoFont} fontSize="10px">
                              already on the CV · #{c.existing.index + 1}
                            </Badge>
                          ) : null}
                          {c.doi ? (
                            <Text as="span" fontFamily={monoFont} fontSize="11px" color={dim}>
                              DOI {c.doi}
                            </Text>
                          ) : null}
                          <Text as="span" fontFamily={monoFont} fontSize="11px" color={dim}>
                            {c.authors.length ? `${c.authors.length} author${c.authors.length === 1 ? '' : 's'}` : c.detailsLoaded ? 'no authors listed' : 'authors not read'}
                          </Text>
                        </HStack>
                        <VisuallyHidden>
                          {c.existing ? ' Already on the CV.' : ''}
                          {!c.paper ? ' Not a paper.' : ''}
                        </VisuallyHidden>
                      </Checkbox>
                    </Box>
                  )
                })}
              </Box>
            </>
          )}
        </ModalBody>
        <ModalFooter gap={2} flexWrap="wrap" borderTop="1px solid" borderColor={border}>
          <Text fontSize="12px" color={dim} flex="1" minW="200px" m={0}>
            Added to {langLabel} as papers you can edit. Nothing is public until you save the CV.
          </Text>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" {...primaryButtonProps} isDisabled={phase.kind !== 'ready' || n === 0} onClick={confirm}>
            Add {n} paper{n === 1 ? '' : 's'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
