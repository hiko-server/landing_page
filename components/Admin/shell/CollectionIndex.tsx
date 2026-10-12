import React, { useCallback, useEffect, useRef, useState } from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
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

export type CollectionRow = {
  slug: string
  frontmatter: Record<string, any>
  mtime: number
}

export type Column = {
  header: string
  cell: (row: CollectionRow) => React.ReactNode
  /** Hide below this breakpoint to keep the table readable on phones. */
  hideBelow?: 'sm' | 'md' | 'lg'
}

/**
 * List page shared by /admin/blog and /admin/work: hairline table, inline
 * load error with retry, delete with an accessible confirmation, and the
 * public pages the delete refreshed.
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
  const [items, setItems] = useState<CollectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<CollectionRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [revalidated, setRevalidated] = useState<string[]>([])
  const cancelRef = useRef<HTMLButtonElement>(null)

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

  useEffect(() => {
    void load()
  }, [load])

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return
    const slug = pendingDelete.slug
    setDeleting(true)
    try {
      const res = await fetch(`${endpoint}?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' })
      const data = await readJsonObject(res)
      if (!res.ok)
        throw new Error(
          res.status === 401
            ? 'Your session has expired — sign in again.'
            : data.error || `HTTP ${res.status}`
        )
      setRevalidated(parseRevalidated(data))
      toast({
        status: 'success',
        title: `Deleted “${slug}”`,
        description: 'A snapshot was saved on the server first.',
        position: 'bottom-right',
      })
      setPendingDelete(null)
      void load()
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
              <Tbody aria-busy={loading}>
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
                  items.map((it) => (
                    <Tr key={it.slug}>
                      <Td fontWeight={500} whiteSpace="normal" minW="180px">
                        <Link
                          as={NextLink}
                          href={`/admin/${collection}/edit?slug=${encodeURIComponent(it.slug)}`}
                          _hover={{ color: 'accent.500' }}
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
              It disappears from the public site immediately. A snapshot of it is saved on the
              server first.
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
    </AdminPageShell>
  )
}
