import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
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
  Skeleton,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react'
import { readJsonObject } from './http'
import { collapseContext, diffLines, documentText, type DiffRow } from './textDiff'
import { Eyebrow, MONO, outlineButtonProps, primaryButtonProps } from './ui'

/**
 * Snapshot history of one post, case study or page (/now, /uses): every
 * save and delete snapshotted the previous state on the server. Lists them
 * with relative times, shows what restoring one would change against the
 * editor's current content (unified line diff of frontmatter + body), and
 * restores it (asking first when the editor holds unsaved edits).
 */

export type HistoryKind = 'blog' | 'work' | 'page'

type Version = { filename: string; date: string; isLatest: boolean }

type Props = {
  isOpen: boolean
  onClose: () => void
  kind: HistoryKind
  /** Slug (blog / work) or page name (now / uses). */
  itemRef: string
  /** The editor's current content (unsaved edits included). */
  current: { frontmatter: Record<string, unknown>; body: string }
  dirty: boolean
  /** Called after a successful restore with the new version ETag; the editor reloads. */
  onRestored: (etag: string | null) => void
}

const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const s = Math.round((t - now) / 1000)
  const abs = Math.abs(s)
  if (!rtf) return new Date(t).toLocaleString()
  if (abs < 60) return rtf.format(s, 'second')
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day')
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function refParam(kind: HistoryKind, itemRef: string): string {
  return kind === 'page' ? `name=${encodeURIComponent(itemRef)}` : `slug=${encodeURIComponent(itemRef)}`
}

function DiffView({ rows }: { rows: DiffRow[] }) {
  return (
    <Box
      as="pre"
      fontFamily={MONO}
      fontSize="12px"
      lineHeight={1.55}
      border="1px solid"
      borderColor="page.border"
      borderRadius="md"
      bg="page.bg"
      overflowX="auto"
      py={1}
      m={0}
    >
      {rows.map((r, i) =>
        r.type === 'skip' ? (
          <Box key={i} px={3} py={0.5} color="page.muted" bg="page.bg-elevated" fontStyle="italic">
            ⋯ {r.count} unchanged line{r.count === 1 ? '' : 's'}
          </Box>
        ) : r.line.kind === 'same' ? (
          <Box key={i} px={3} color="page.fg-secondary" whiteSpace="pre-wrap" wordBreak="break-word">
            {'  '}
            {r.line.text}
          </Box>
        ) : r.line.kind === 'add' ? (
          <Box
            as="ins"
            key={i}
            display="block"
            px={3}
            textDecoration="none"
            bg="rgba(34,197,94,0.12)"
            color="page.fg"
            whiteSpace="pre-wrap"
            wordBreak="break-word"
          >
            {'+ '}
            {r.line.text}
          </Box>
        ) : (
          <Box
            as="del"
            key={i}
            display="block"
            px={3}
            textDecoration="none"
            bg="rgba(239,68,68,0.12)"
            color="page.fg"
            whiteSpace="pre-wrap"
            wordBreak="break-word"
          >
            {'− '}
            {r.line.text}
          </Box>
        ),
      )}
    </Box>
  )
}

export default function ItemHistoryDrawer({ isOpen, onClose, kind, itemRef, current, dirty, onRestored }: Props) {
  const toast = useToast()
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [listError, setListError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<{ frontmatter: Record<string, unknown>; body: string } | null>(null)
  const [snapError, setSnapError] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const loadList = useCallback(async () => {
    setVersions(null)
    setListError('')
    try {
      const res = await fetch(`/api/versions?type=${kind}&${refParam(kind, itemRef)}`, { cache: 'no-store' })
      const data = await readJsonObject(res)
      if (!res.ok) throw new Error(res.status === 401 ? 'Session expired — sign in again.' : data.error || `HTTP ${res.status}`)
      const list: Version[] = Array.isArray(data.versions) ? data.versions : []
      setVersions(list)
      setSelected((s) => (s && list.some((v) => v.filename === s) ? s : list[0]?.filename ?? null))
    } catch (e) {
      setListError(e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error' : e.message) : String(e))
    }
  }, [kind, itemRef])

  useEffect(() => {
    if (isOpen) void loadList()
  }, [isOpen, loadList])

  useEffect(() => {
    if (!isOpen || !selected) {
      setSnapshot(null)
      return
    }
    const ctrl = new AbortController()
    setSnapshot(null)
    setSnapError('')
    void (async () => {
      try {
        const res = await fetch(`/api/versions?type=${kind}&${refParam(kind, itemRef)}&file=${encodeURIComponent(selected)}&preview=1`, {
          cache: 'no-store',
          signal: ctrl.signal,
        })
        const data = await readJsonObject(res)
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        const doc = (data.data || {}) as { frontmatter?: Record<string, unknown>; body?: string }
        setSnapshot({ frontmatter: doc.frontmatter || {}, body: typeof doc.body === 'string' ? doc.body : '' })
      } catch (e) {
        if (!ctrl.signal.aborted) setSnapError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => ctrl.abort()
  }, [isOpen, selected, kind, itemRef])

  const diff = useMemo(() => {
    if (!snapshot) return null
    return diffLines(documentText(current.frontmatter, current.body), documentText(snapshot.frontmatter, snapshot.body))
  }, [snapshot, current])

  const restore = async () => {
    if (!selected) return
    setConfirmOpen(false)
    setRestoring(true)
    try {
      const res = await fetch(`/api/versions?type=${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', filename: selected, ...(kind === 'page' ? { name: itemRef } : { slug: itemRef }) }),
      })
      const data = await readJsonObject(res)
      if (!res.ok) throw new Error(res.status === 401 ? 'Session expired — sign in again.' : data.error || `HTTP ${res.status}`)
      toast({ status: 'success', title: 'Version restored', description: 'The previous state was snapshotted first.', position: 'bottom-right' })
      onRestored(typeof data.etag === 'string' ? data.etag : null)
      onClose()
    } catch (e) {
      toast({
        status: 'error',
        title: 'Restore failed',
        description: e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error.' : e.message) : String(e),
        position: 'bottom-right',
      })
    } finally {
      setRestoring(false)
    }
  }

  const selectedVersion = versions?.find((v) => v.filename === selected) || null

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="lg">
      <DrawerOverlay />
      <DrawerContent bg="page.bg-elevated" borderLeft="1px solid" borderColor="page.border">
        <DrawerCloseButton />
        <DrawerHeader pb={2}>
          <Eyebrow accent>[history]</Eyebrow>
          <Text fontSize="md" fontWeight={600} mt={1}>
            Earlier versions
          </Text>
          <Text fontSize="xs" color="page.fg-secondary" fontWeight={400} mt={1}>
            A snapshot is taken before every save, restore and delete (the newest 50 are kept).
          </Text>
        </DrawerHeader>
        <DrawerBody>
          {listError ? (
            <Text role="alert" fontSize="sm" color="red.400">
              Couldn’t load the history ({listError}).{' '}
              <Button size="xs" variant="link" onClick={() => void loadList()}>
                Retry
              </Button>
            </Text>
          ) : !versions ? (
            <Stack spacing={2} aria-busy="true" aria-label="Loading versions">
              <Skeleton h="36px" />
              <Skeleton h="36px" />
              <Skeleton h="36px" />
            </Stack>
          ) : versions.length === 0 ? (
            <Text fontSize="sm" color="page.fg-secondary">
              No earlier versions yet — the first one is taken on the next save.
            </Text>
          ) : (
            <Stack spacing={4}>
              <Box as="ul" listStyleType="none" maxH="220px" overflowY="auto" border="1px solid" borderColor="page.border" borderRadius="md">
                {versions.map((v) => {
                  const active = v.filename === selected
                  return (
                    <Box as="li" key={v.filename} borderBottom="1px solid" borderColor="page.border" _last={{ borderBottom: 'none' }}>
                      <Flex
                        as="button"
                        type="button"
                        w="100%"
                        textAlign="left"
                        px={3}
                        py={2}
                        gap={3}
                        align="baseline"
                        justify="space-between"
                        aria-current={active ? 'true' : undefined}
                        bg={active ? 'var(--accent-soft)' : 'transparent'}
                        sx={active ? { '@media (forced-colors: active)': { outline: '2px solid Highlight', outlineOffset: '-2px' } } : undefined}
                        _hover={{ bg: active ? 'var(--accent-soft)' : 'page.bg-overlay' }}
                        _focusVisible={{ outline: '2px solid', outlineColor: 'accent.500', outlineOffset: '-2px' }}
                        onClick={() => setSelected(v.filename)}
                      >
                        <Text as="span" fontSize="13px" fontWeight={active ? 600 : 500}>
                          {relativeTime(v.date)}
                          {v.isLatest ? (
                            <Text as="span" ml={2} fontSize="11px" color="page.fg-secondary" fontWeight={400}>
                              latest snapshot
                            </Text>
                          ) : null}
                        </Text>
                        <Text as="time" dateTime={v.date} fontFamily={MONO} fontSize="11px" color="page.fg-secondary" flexShrink={0}>
                          {new Date(v.date).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </Flex>
                    </Box>
                  )
                })}
              </Box>

              <Box>
                <Text fontSize="xs" color="page.fg-secondary" mb={2}>
                  Restoring {selectedVersion ? relativeTime(selectedVersion.date) : 'this version'} would change your current
                  {dirty ? ' (unsaved)' : ''} content like this —{' '}
                  <Text as="span" fontFamily={MONO}>
                    − current
                  </Text>
                  ,{' '}
                  <Text as="span" fontFamily={MONO}>
                    + this version
                  </Text>
                  :
                </Text>
                {snapError ? (
                  <Text role="alert" fontSize="sm" color="red.400">
                    Couldn’t load this version ({snapError}).
                  </Text>
                ) : !diff ? (
                  <Skeleton h="160px" />
                ) : diff.tooLarge ? (
                  <Text fontSize="sm" color="page.fg-secondary">
                    Too long to compare here (over 5,000 lines). Restoring still works.
                  </Text>
                ) : diff.added === 0 && diff.removed === 0 ? (
                  <Text fontSize="sm" color="page.fg-secondary">
                    Identical to the current content.
                  </Text>
                ) : (
                  <>
                    <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" mb={1.5}>
                      +{diff.added} / −{diff.removed} lines
                    </Text>
                    <DiffView rows={collapseContext(diff.lines)} />
                  </>
                )}
              </Box>
            </Stack>
          )}
        </DrawerBody>
        <DrawerFooter gap={2} borderTop="1px solid" borderColor="page.border">
          <Button size="sm" {...outlineButtonProps} onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            {...primaryButtonProps}
            isDisabled={!selected || !snapshot}
            isLoading={restoring}
            loadingText="Restoring"
            onClick={() => (dirty ? setConfirmOpen(true) : void restore())}
          >
            Restore this version
          </Button>
        </DrawerFooter>
      </DrawerContent>

      <AlertDialog isOpen={confirmOpen} leastDestructiveRef={cancelRef} onClose={() => setConfirmOpen(false)} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
            <AlertDialogHeader fontSize="md">Discard unsaved edits and restore?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              The editor has changes that aren’t saved. Restoring replaces them with this version (the live version is
              snapshotted first, so the restore can itself be undone).
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" {...outlineButtonProps} onClick={() => setConfirmOpen(false)}>
                Keep editing
              </Button>
              <Button size="sm" colorScheme="red" onClick={() => void restore()}>
                Discard and restore
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Drawer>
  )
}
