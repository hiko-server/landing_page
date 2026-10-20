import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Link,
  Skeleton,
  Stack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
} from '@chakra-ui/react'
import { AddIcon, DeleteIcon, EditIcon } from '@chakra-ui/icons'
import {
  AdminPageShell,
  BackLink,
  LoadErrorNotice,
  MONO,
  RevalidatedPaths,
  outlineButtonProps,
  primaryButtonProps,
} from './ui'
import { loginHref, parseRevalidated, readJsonObject } from './http'
import { useStepUp } from '../security/useStepUp'
import { wasStepUpCancelled } from '../security/stepUpClient'
import { Collapse } from '../../General-UI/Collapse'
import { relativeTime } from './ItemHistoryDrawer'
import { useListKeyboard } from './useListKeyboard'
import { parseItemSchedule, scheduleSummary, type ItemScheduleView } from './itemSchedule'

export type CollectionRow = {
  slug: string
  frontmatter: Record<string, any>
  mtime: number
  /** When the item's unpublished changes were last saved (H4), null without any. */
  pendingAt?: number | null
  /** When it publishes / unpublishes on its own (H5), null when not scheduled. */
  schedule?: ItemScheduleView | null
}

type DeletedRow = { slug: string; title: string; filename: string; date: string }

/** Undo window after a delete. */
const UNDO_MS = 8000

export type Column = {
  header: string
  cell: (row: CollectionRow) => React.ReactNode
  /** Hide below this breakpoint to keep the table readable on phones. */
  hideBelow?: 'sm' | 'md' | 'lg'
}

/**
 * List page shared by /admin/blog and /admin/work: hairline table, inline
 * load error with retry, delete with an accessible confirmation and an
 * 8-second Undo (restores the snapshot taken before the delete), a
 * "Recently deleted" list (anything with snapshots but no live item) with
 * Restore, the public pages a change refreshed, and "Generate responsive
 * versions" (WebP variants for uploads made before the image pipeline).
 */
export default function CollectionIndex({
  collection,
  endpoint,
  title,
  noun,
  nounPlural,
  newLabel,
  columns,
}: {
  collection: 'blog' | 'work'
  endpoint: string
  title: string
  noun: string
  nounPlural: string
  newLabel: string
  columns: Column[]
}) {
  const router = useRouter()
  const toast = useToast()
  // Deleting asks for a recent sign-in or step-up (lib/adminAuth/stepUp.ts).
  const { fetchWithStepUp, stepUpElement } = useStepUp()
  const [items, setItems] = useState<CollectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<CollectionRow | null>(null)
  // j / k / arrows move through the rows, Enter opens the editor, # or Delete asks to delete (H14).
  const kb = useListKeyboard({
    count: items.length,
    global: true,
    actions: ['#', 'Delete'],
    onOpen: (i) => {
      const it = items[i]
      if (it) void router.push(`/admin/${collection}/edit?slug=${encodeURIComponent(it.slug)}`)
    },
    onAction: (_key, i) => {
      const it = items[i]
      if (it) setPendingDelete(it)
    },
  })
  const [deleting, setDeleting] = useState(false)
  const [revalidated, setRevalidated] = useState<string[]>([])
  const [deleted, setDeleted] = useState<DeletedRow[]>([])
  const [deletedOpen, setDeletedOpen] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const deletedId = useId()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(endpoint, { cache: 'no-store' })
      if (res.status === 401) {
        router.replace(loginHref(`/admin/${collection}`))
        return
      }
      const data = await readJsonObject(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message === 'Failed to fetch'
            ? 'network error'
            : e.message
          : String(e)
      )
    } finally {
      setLoading(false)
    }
  }, [endpoint, collection, router])

  const loadDeleted = useCallback(async () => {
    try {
      const res = await fetch(`/api/versions?type=${collection}&deleted=1`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await readJsonObject(res)
      setDeleted(Array.isArray(data.deleted) ? data.deleted : [])
    } catch {
      /* the list is a convenience; the table still works without it */
    }
  }, [collection])

  useEffect(() => {
    void load()
    void loadDeleted()
  }, [load, loadDeleted])

  /** Bring back a deleted item from its newest snapshot. */
  const restoreDeleted = useCallback(
    async (slug: string, filename: string): Promise<boolean> => {
      setRestoring(slug)
      try {
        const res = await fetch(`/api/versions?type=${collection}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restore', slug, filename }),
        })
        const data = await readJsonObject(res)
        if (!res.ok) throw new Error(res.status === 401 ? 'Your session has expired — sign in again.' : data.error || `HTTP ${res.status}`)
        setRevalidated(parseRevalidated(data))
        toast({ status: 'success', title: `Restored “${slug}”`, position: 'bottom-right' })
        void load()
        void loadDeleted()
        return true
      } catch (e) {
        toast({
          status: 'error',
          title: 'Restore failed',
          description: e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error.' : e.message) : String(e),
          position: 'bottom-right',
        })
        return false
      } finally {
        setRestoring(null)
      }
    },
    [collection, toast, load, loadDeleted],
  )

  const optimize = async () => {
    setOptimizing(true)
    let processed = 0
    let skipped = 0
    let failed = 0
    const refreshed = new Set<string>()
    try {
      // A run stops after ~45 s; keep going while the server reports more.
      for (let round = 0; round < 20; round++) {
        const res = await fetch('/api/admin/media-optimize', { method: 'POST' })
        const data = await readJsonObject(res)
        if (!res.ok) throw new Error(res.status === 409 ? 'A run is already in progress.' : data.error || `HTTP ${res.status}`)
        processed += Number(data.processed) || 0
        skipped += Number(data.skipped) || 0
        failed += Array.isArray(data.errors) ? data.errors.length : 0
        parseRevalidated(data).forEach((p) => refreshed.add(p))
        if (!(Number(data.remaining) > 0)) break
      }
      toast({
        status: failed ? 'warning' : 'success',
        title: processed ? `Responsive versions made for ${processed} image${processed === 1 ? '' : 's'}` : 'All images are already optimised',
        description: `${skipped} already done or too small${failed ? `, ${failed} failed (see the server log)` : ''}.${
          refreshed.size ? ` ${refreshed.size} page${refreshed.size === 1 ? '' : 's'} using them refreshed.` : ''
        }`,
        position: 'bottom-right',
        duration: 7000,
        isClosable: true,
      })
    } catch (e) {
      toast({
        status: 'error',
        title: 'Optimisation failed',
        description: e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error.' : e.message) : String(e),
        position: 'bottom-right',
      })
    } finally {
      setOptimizing(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return
    const slug = pendingDelete.slug
    setDeleting(true)
    try {
      const res = await fetchWithStepUp(
        `${endpoint}?slug=${encodeURIComponent(slug)}`,
        { method: 'DELETE' },
        `Deleting “${slug}” takes it off the public site.`,
      )
      if (wasStepUpCancelled(res)) return
      const data = await readJsonObject(res)
      if (!res.ok)
        throw new Error(
          res.status === 401
            ? 'Your session has expired — sign in again.'
            : data.error || `HTTP ${res.status}`
        )
      setRevalidated(parseRevalidated(data))
      const snapshot = typeof data.snapshot === 'string' ? data.snapshot : null
      toast({
        position: 'bottom-right',
        duration: UNDO_MS,
        render: ({ onClose }) => (
          <Flex
            role="status"
            align="center"
            gap={3}
            px={4}
            py={3}
            bg="page.bg-elevated"
            border="1px solid"
            borderColor="page.border-strong"
            borderRadius="lg"
            boxShadow="0 10px 28px rgba(0,0,0,0.18)"
            maxW="360px"
          >
            <Box flex={1} minW={0} fontSize="sm">
              <Text fontWeight={500} noOfLines={1}>
                Deleted “{slug}”
              </Text>
              <Text fontSize="xs" color="page.fg-secondary">
                {snapshot ? 'A snapshot was kept on the server.' : 'It no longer appears on the site.'}
              </Text>
            </Box>
            {snapshot ? (
              <Button
                size="sm"
                {...outlineButtonProps}
                onClick={() => {
                  onClose()
                  void restoreDeleted(slug, snapshot)
                }}
              >
                Undo
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" color="page.fg-secondary" onClick={onClose} aria-label="Dismiss">
              ×
            </Button>
          </Flex>
        ),
      })
      setPendingDelete(null)
      void load()
      void loadDeleted()
    } catch (e) {
      toast({
        status: 'error',
        title: 'Delete failed',
        description:
          e instanceof Error
            ? e.message === 'Failed to fetch'
              ? 'Network error.'
              : e.message
            : String(e),
        position: 'bottom-right',
      })
    } finally {
      setDeleting(false)
    }
  }

  const hide = (b?: Column['hideBelow']) => (b ? { base: 'none', [b]: 'table-cell' } : undefined)

  return (
    <AdminPageShell
      headTitle={`Admin · ${title}`}
      eyebrow={`[admin] ${collection}`}
      title={title}
      actions={
        <>
          <BackLink href="/admin">← Admin</BackLink>
          <Button as={NextLink} href={collection === 'work' ? '/admin/tags?c=work' : '/admin/tags'} size="sm" variant="ghost" color="page.fg-secondary" _hover={{ color: 'page.fg', bg: 'page.bg-overlay' }}>
            {collection === 'work' ? 'Tech' : 'Tags'} &amp; export
          </Button>
          <Button
            size="sm"
            {...outlineButtonProps}
            onClick={() => void optimize()}
            isLoading={optimizing}
            loadingText="Optimising"
            title="Make the resized WebP and AVIF copies and the blur placeholders of uploaded images that don’t have them yet"
          >
            Generate responsive versions
          </Button>
          <Button
            as={NextLink}
            href={`/admin/${collection}/edit`}
            size="sm"
            leftIcon={<AddIcon boxSize={2.5} />}
            {...primaryButtonProps}
          >
            {newLabel}
          </Button>
        </>
      }
    >
      <Stack spacing={4}>
        {revalidated.length ? <RevalidatedPaths paths={revalidated} /> : null}
        {error ? (
          <LoadErrorNotice what={`the ${noun} list`} error={error} onRetry={() => void load()} />
        ) : (
          <TableContainer
            border="1px solid"
            borderColor="page.border"
            borderRadius="xl"
            bg="page.bg"
          >
            <Table
              size="sm"
              variant="simple"
              sx={{
                'th, td': { borderColor: 'page.border', py: 3 },
                th: {
                  fontFamily: MONO,
                  fontSize: '10px',
                  letterSpacing: '0.12em',
                  color: 'page.fg-secondary',
                },
                'tbody tr:last-of-type td': { borderBottom: 'none' },
                'tbody tr:hover': { bg: 'page.bg-elevated' },
              }}
            >
              <Thead>
                <Tr>
                  <Th>Title</Th>
                  {columns.map((c) => (
                    <Th key={c.header} display={hide(c.hideBelow)}>
                      {c.header}
                    </Th>
                  ))}
                  <Th w="96px" textAlign="right">
                    <Box as="span" srOnly>
                      Actions
                    </Box>
                  </Th>
                </Tr>
              </Thead>
              <Tbody aria-busy={loading} {...kb.listProps}>
                {loading ? (
                  [0, 1, 2].map((i) => (
                    <Tr key={i}>
                      <Td colSpan={columns.length + 2}>
                        <Skeleton h="18px" />
                      </Td>
                    </Tr>
                  ))
                ) : items.length === 0 ? (
                  <Tr>
                    <Td
                      colSpan={columns.length + 2}
                      textAlign="center"
                      py={10}
                      color="page.fg-secondary"
                    >
                      No {nounPlural} yet. Use <strong>{newLabel}</strong> to create one.
                    </Td>
                  </Tr>
                ) : (
                  items.map((it, i) => (
                    <Tr key={it.slug}>
                      <Td fontWeight={500} whiteSpace="normal" minW="180px">
                        <Link
                          as={NextLink}
                          href={`/admin/${collection}/edit?slug=${encodeURIComponent(it.slug)}`}
                          _hover={{ color: 'accent.500' }}
                          {...kb.itemProps(i)}
                        >
                          {it.frontmatter.title || it.slug}
                        </Link>
                        <Text
                          fontFamily={MONO}
                          fontSize="11px"
                          color="page.fg-secondary"
                          fontWeight={400}
                        >
                          {it.slug}
                          {it.pendingAt ? (
                            <Badge
                              ml={2}
                              colorScheme="purple"
                              variant="subtle"
                              fontSize="9px"
                              fontFamily="body"
                              title="Saved changes that are not published yet"
                            >
                              changes not live
                            </Badge>
                          ) : null}
                          {(() => {
                            const s = parseItemSchedule(it.schedule)
                            const line = s ? scheduleSummary(s, Date.now()) : null
                            return line ? (
                              <Badge ml={2} colorScheme="blue" variant="subtle" fontSize="10px" fontFamily="body" textTransform="none" whiteSpace="normal" title={line} data-testid="schedule-list-badge">
                                {line}
                              </Badge>
                            ) : null
                          })()}
                        </Text>
                      </Td>
                      {columns.map((c) => (
                        <Td key={c.header} display={hide(c.hideBelow)} fontSize="13px">
                          {c.cell(it)}
                        </Td>
                      ))}
                      <Td textAlign="right">
                        <HStack spacing={1} justify="flex-end">
                          <IconButton
                            as={NextLink}
                            href={`/admin/${collection}/edit?slug=${encodeURIComponent(it.slug)}`}
                            size="xs"
                            aria-label={`Edit ${it.frontmatter.title || it.slug}`}
                            icon={<EditIcon />}
                            variant="ghost"
                            color="page.fg-secondary"
                          />
                          <IconButton
                            size="xs"
                            aria-label={`Delete ${it.frontmatter.title || it.slug}`}
                            icon={<DeleteIcon />}
                            variant="ghost"
                            color="page.fg-secondary"
                            _hover={{ color: 'red.400', bg: 'page.bg-overlay' }}
                            onClick={() => setPendingDelete(it)}
                          />
                        </HStack>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </TableContainer>
        )}

        {deleted.length ? (
          <Box>
            <Button
              size="sm"
              variant="ghost"
              color="page.fg-secondary"
              px={2}
              aria-expanded={deletedOpen}
              aria-controls={deletedId}
              onClick={() => setDeletedOpen((o) => !o)}
            >
              <Box as="span" display="inline-block" mr={2} transition="transform 200ms" transform={deletedOpen ? 'rotate(90deg)' : 'none'} aria-hidden>
                ›
              </Box>
              Recently deleted ({deleted.length})
            </Button>
            <Collapse open={deletedOpen} id={deletedId}>
              <Box as="ul" listStyleType="none" mt={2} border="1px solid" borderColor="page.border" borderRadius="xl">
                {deleted.map((d) => (
                  <Flex
                    as="li"
                    key={d.slug}
                    align="center"
                    justify="space-between"
                    gap={3}
                    px={4}
                    py={2.5}
                    borderBottom="1px solid"
                    borderColor="page.border"
                    _last={{ borderBottom: 'none' }}
                  >
                    <Box minW={0}>
                      <Text fontSize="sm" fontWeight={500} noOfLines={1}>
                        {d.title || d.slug}
                      </Text>
                      <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary">
                        {d.slug} · deleted {relativeTime(d.date)}
                      </Text>
                    </Box>
                    <Button
                      size="xs"
                      {...outlineButtonProps}
                      onClick={() => void restoreDeleted(d.slug, d.filename)}
                      isLoading={restoring === d.slug}
                      loadingText="Restoring"
                      isDisabled={!!restoring && restoring !== d.slug}
                    >
                      Restore
                    </Button>
                  </Flex>
                ))}
              </Box>
            </Collapse>
          </Box>
        ) : null}
      </Stack>

      <AlertDialog
        isOpen={!!pendingDelete}
        leastDestructiveRef={cancelRef}
        onClose={() => setPendingDelete(null)}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent
            bg="page.bg-elevated"
            border="1px solid"
            borderColor="page.border"
            mx={4}
          >
            <AlertDialogHeader fontSize="md">
              Delete “{pendingDelete?.frontmatter.title || pendingDelete?.slug}”?
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              It disappears from the public site immediately. A snapshot is kept on the server, so
              you can undo it right after or restore it later from “Recently deleted”.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button
                ref={cancelRef}
                size="sm"
                {...outlineButtonProps}
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                colorScheme="red"
                onClick={confirmDelete}
                isLoading={deleting}
                loadingText="Deleting"
              >
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
      {stepUpElement}
    </AdminPageShell>
  )
}
