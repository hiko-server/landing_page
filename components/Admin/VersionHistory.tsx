/**
 * VersionHistory — browse the CV / Home snapshots taken before every save and
 * restore, compare one with the live document as a readable structural diff,
 * download it, or restore it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Skeleton,
  Spinner,
  Stack,
  Text,
  Textarea,
  Tooltip,
  useToast,
} from '@chakra-ui/react'
import { SearchIcon } from '@chakra-ui/icons'
import { FaCamera, FaDownload, FaUndo, FaExchangeAlt } from 'react-icons/fa'
import {
  diffJson,
  formatDiffValue,
  type DiffEntry,
  type DiffKind,
  type DiffResult,
} from './shell/jsonDiff'
import { readJsonObject } from './shell/http'
import {
  Eyebrow,
  MONO,
  Panel,
  inputProps,
  outlineButtonProps,
  primaryButtonProps,
} from './shell/ui'
import SegmentedTabs, { tabPanelProps, type SegmentedItem } from './shell/SegmentedTabs'

type DocType = 'cv' | 'home'

type VersionEntry = {
  filename: string
  date: string
  label: string
  index: number
  isLatest: boolean
  type: DocType
}

const TYPE_ITEMS: SegmentedItem<DocType>[] = [
  { key: 'cv', label: 'CV' },
  { key: 'home', label: 'Home page' },
]

const DOC_LABEL: Record<DocType, string> = { cv: 'CV', home: 'Home page' }

/** What restoring the snapshot would do to the live document. */
const KIND_COPY: Record<DiffKind, { label: string; color: string }> = {
  added: { label: 'would add', color: 'green' },
  removed: { label: 'would remove', color: 'red' },
  changed: { label: 'would change', color: 'orange' },
}

function formatWhen(v: VersionEntry): string {
  if (!v.date) return v.filename
  const d = new Date(v.date)
  if (Number.isNaN(d.getTime())) return v.filename
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function errorText(e: unknown, fallback: string): string {
  if (e instanceof Error)
    return e.message === 'Failed to fetch' ? 'Network error' : e.message || fallback
  return fallback
}

function DiffRow({ e }: { e: DiffEntry }) {
  const kind = KIND_COPY[e.kind]
  return (
    <Box
      py={2.5}
      borderBottom="1px solid"
      borderColor="page.border"
      _last={{ borderBottom: 'none' }}
    >
      <Flex gap={2} align="center" flexWrap="wrap" mb={1.5}>
        <Badge
          colorScheme={kind.color}
          variant="subtle"
          fontSize="10px"
          textTransform="none"
          fontFamily={MONO}
        >
          {kind.label}
        </Badge>
        <Text fontFamily={MONO} fontSize="12px" wordBreak="break-all" color="page.fg">
          {e.path}
        </Text>
      </Flex>
      <Stack spacing={1} fontFamily={MONO} fontSize="12px" pl={{ base: 0, md: 2 }}>
        {e.kind !== 'added' ? (
          <Flex gap={2} align="baseline">
            <Text as="span" color="page.muted" flexShrink={0} w="64px">
              live
            </Text>
            <Text
              as="span"
              color="page.fg-secondary"
              textDecoration={e.kind === 'removed' ? 'line-through' : undefined}
              wordBreak="break-word"
            >
              {formatDiffValue(e.before)}
            </Text>
          </Flex>
        ) : null}
        {e.kind !== 'removed' ? (
          <Flex gap={2} align="baseline">
            <Text as="span" color="page.muted" flexShrink={0} w="64px">
              snapshot
            </Text>
            <Text as="span" color="page.fg" wordBreak="break-word">
              {formatDiffValue(e.after)}
            </Text>
          </Flex>
        ) : null}
      </Stack>
    </Box>
  )
}

export default function VersionHistory() {
  const toast = useToast()
  const [dataType, setDataType] = useState<DocType>('cv')
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [snapshotting, setSnapshotting] = useState(false)

  // Compare modal
  const [compareTarget, setCompareTarget] = useState<VersionEntry | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState('')
  const [snapshotData, setSnapshotData] = useState<unknown>(undefined)
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [view, setView] = useState<'changes' | 'raw'>('changes')
  const [filter, setFilter] = useState('')

  // Restore confirmation
  const [restoreTarget, setRestoreTarget] = useState<VersionEntry | null>(null)
  const [restoring, setRestoring] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const fetchVersions = useCallback(async () => {
    setLoading(true)
    setListError('')
    try {
      const res = await fetch(`/api/versions?type=${dataType}`, { cache: 'no-store' })
      if (res.status === 401) throw new Error('Session expired — sign in again.')
      const data = await readJsonObject(res)
      if (!res.ok || !data.ok) throw new Error(data.error || `Server responded ${res.status}`)
      setVersions(Array.isArray(data.versions) ? data.versions : [])
    } catch (e) {
      setVersions([])
      setListError(errorText(e, 'Failed to load versions'))
    } finally {
      setLoading(false)
    }
  }, [dataType])

  useEffect(() => {
    void fetchVersions()
  }, [fetchVersions])

  const takeSnapshot = async () => {
    setSnapshotting(true)
    try {
      const res = await fetch(`/api/versions?type=${dataType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'snapshot' }),
      })
      const data = await readJsonObject(res)
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast({
        status: 'success',
        title: 'Snapshot saved',
        description: data.file,
        position: 'bottom-right',
      })
      void fetchVersions()
    } catch (e) {
      toast({
        status: 'error',
        title: 'Snapshot failed',
        description: errorText(e, 'Unknown error'),
        position: 'bottom-right',
      })
    } finally {
      setSnapshotting(false)
    }
  }

  const openCompare = async (v: VersionEntry) => {
    setCompareTarget(v)
    setCompareLoading(true)
    setCompareError('')
    setSnapshotData(undefined)
    setDiff(null)
    setFilter('')
    setView('changes')
    const liveUrl = v.type === 'home' ? '/api/admin/home' : '/api/admin/cvdata'
    let haveSnapshot = false
    try {
      const [snapRes, liveRes] = await Promise.all([
        fetch(`/api/versions?type=${v.type}&file=${encodeURIComponent(v.filename)}&preview=1`, {
          cache: 'no-store',
        }),
        fetch(liveUrl, { cache: 'no-store' }),
      ])
      const snap = await readJsonObject(snapRes)
      if (!snapRes.ok || !snap.ok) throw new Error(snap.error || `Snapshot: HTTP ${snapRes.status}`)
      setSnapshotData(snap.data)
      haveSnapshot = true
      if (liveRes.status === 401) throw new Error('Session expired — sign in again to compare.')
      if (!liveRes.ok) throw new Error(`Live version: HTTP ${liveRes.status}`)
      const live: unknown = await liveRes.json()
      setDiff(diffJson(live, snap.data))
    } catch (e) {
      setCompareError(errorText(e, 'Failed to load'))
      // The snapshot itself is still worth showing when only the live side failed.
      if (haveSnapshot) setView('raw')
    } finally {
      setCompareLoading(false)
    }
  }

  const closeCompare = () => setCompareTarget(null)

  const download = (v: VersionEntry) => {
    const url = `/api/${v.type === 'home' ? 'home' : 'cvdata'}?download=1&file=${encodeURIComponent(v.filename)}`
    window.open(url, '_blank', 'noopener')
  }

  const confirmRestore = async () => {
    if (!restoreTarget || restoring) return
    setRestoring(true)
    try {
      const res = await fetch(`/api/versions?type=${restoreTarget.type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', filename: restoreTarget.filename }),
      })
      const data = await readJsonObject(res)
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast({
        status: data.r2Warning ? 'warning' : 'success',
        title: `${DOC_LABEL[restoreTarget.type]} restored`,
        description:
          data.r2Warning ||
          `Rolled back to ${restoreTarget.filename}. The previous live state was snapshotted first.`,
        position: 'bottom-right',
        duration: 6000,
      })
      setRestoreTarget(null)
      setCompareTarget(null)
      void fetchVersions()
    } catch (e) {
      toast({
        status: 'error',
        title: 'Restore failed',
        description: errorText(e, 'Unknown error'),
        position: 'bottom-right',
      })
    } finally {
      setRestoring(false)
    }
  }

  const shown = useMemo(() => {
    if (!diff) return []
    const q = filter.trim().toLowerCase()
    if (!q) return diff.entries
    return diff.entries.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        formatDiffValue(e.before).toLowerCase().includes(q) ||
        formatDiffValue(e.after).toLowerCase().includes(q)
    )
  }, [diff, filter])

  const rawSnapshot = useMemo(
    () =>
      snapshotData === undefined
        ? ''
        : typeof snapshotData === 'string'
          ? snapshotData
          : JSON.stringify(snapshotData, null, 2),
    [snapshotData]
  )

  return (
    <Box>
      <Flex
        align={{ base: 'stretch', md: 'flex-end' }}
        justify="space-between"
        gap={4}
        mb={5}
        flexWrap="wrap"
      >
        <Box maxW="60ch">
          <Eyebrow accent>[versions]</Eyebrow>
          <Text as="h2" fontSize="lg" fontWeight={600} letterSpacing="-0.02em" mt={1}>
            Version history
          </Text>
          <Text fontSize="sm" color="page.fg-secondary" mt={1}>
            A snapshot is taken before every save and every restore. Compare one with what’s live,
            download it, or roll back to it.
          </Text>
        </Box>
        <HStack spacing={2} flexWrap="wrap">
          <SegmentedTabs
            items={TYPE_ITEMS}
            value={dataType}
            onSelect={setDataType}
            label="Document"
            idPrefix="ver"
            size="sm"
          />
          <Button
            size="sm"
            leftIcon={<FaCamera />}
            {...outlineButtonProps}
            isLoading={snapshotting}
            loadingText="Saving"
            onClick={takeSnapshot}
          >
            Snapshot now
          </Button>
        </HStack>
      </Flex>

      <Panel p={0} overflow="hidden" {...tabPanelProps('ver', dataType)}>
        {loading ? (
          <Stack p={4} spacing={3} aria-busy="true" aria-label="Loading versions">
            <Skeleton h="44px" />
            <Skeleton h="44px" />
            <Skeleton h="44px" />
          </Stack>
        ) : listError ? (
          <Flex
            direction="column"
            align="center"
            gap={3}
            py={10}
            px={4}
            textAlign="center"
            role="alert"
          >
            <Text color="red.400" fontSize="sm">
              {listError}
            </Text>
            <Button size="sm" {...outlineButtonProps} onClick={() => void fetchVersions()}>
              Retry
            </Button>
          </Flex>
        ) : versions.length === 0 ? (
          <Text color="page.fg-secondary" fontSize="sm" py={10} px={4} textAlign="center">
            No {DOC_LABEL[dataType]} snapshots yet. Use “Snapshot now”, or save an edit to create
            one.
          </Text>
        ) : (
          <Box as="ul" listStyleType="none" aria-label={`${DOC_LABEL[dataType]} snapshots`}>
            {versions.map((v) => (
              <Flex
                as="li"
                key={v.filename}
                align="center"
                justify="space-between"
                gap={3}
                px={{ base: 3, md: 4 }}
                py={3}
                borderBottom="1px solid"
                borderColor="page.border"
                _last={{ borderBottom: 'none' }}
                _hover={{ bg: 'page.bg-elevated' }}
                flexWrap="wrap"
              >
                <Box minW={0} flex="1 1 220px">
                  <Flex align="center" gap={2}>
                    <Text fontSize="sm" fontWeight={600}>
                      {formatWhen(v)}
                    </Text>
                    {v.isLatest ? (
                      <Badge
                        variant="outline"
                        colorScheme="accent"
                        fontSize="9px"
                        fontFamily={MONO}
                      >
                        latest
                      </Badge>
                    ) : null}
                  </Flex>
                  <Text
                    fontSize="11px"
                    fontFamily={MONO}
                    color="page.fg-secondary"
                    noOfLines={1}
                    title={v.filename}
                  >
                    {v.filename}
                  </Text>
                </Box>
                <HStack spacing={1}>
                  <Button
                    size="xs"
                    variant="ghost"
                    leftIcon={<FaExchangeAlt />}
                    color="page.fg-secondary"
                    onClick={() => void openCompare(v)}
                  >
                    Compare
                  </Button>
                  <Tooltip label="Download JSON" openDelay={300}>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      color="page.fg-secondary"
                      icon={<FaDownload />}
                      aria-label={`Download ${v.filename}`}
                      onClick={() => download(v)}
                    />
                  </Tooltip>
                  <Button
                    size="xs"
                    variant="ghost"
                    leftIcon={<FaUndo />}
                    color="page.fg-secondary"
                    onClick={() => setRestoreTarget(v)}
                  >
                    Restore
                  </Button>
                </HStack>
              </Flex>
            ))}
          </Box>
        )}
      </Panel>

      {/* Compare modal */}
      <Modal isOpen={!!compareTarget} onClose={closeCompare} size="4xl" scrollBehavior="inside">
        <ModalOverlay backdropFilter="blur(6px)" />
        <ModalContent
          bg="page.bg"
          border="1px solid"
          borderColor="page.border"
          mx={{ base: 2, md: 4 }}
        >
          <ModalHeader pb={2}>
            <Eyebrow accent>[compare] {compareTarget ? DOC_LABEL[compareTarget.type] : ''}</Eyebrow>
            <Text fontSize="md" fontWeight={600} mt={1}>
              {compareTarget ? formatWhen(compareTarget) : ''} vs live
            </Text>
            <Text
              fontSize="11px"
              fontFamily={MONO}
              color="page.fg-secondary"
              fontWeight={400}
              noOfLines={1}
            >
              {compareTarget?.filename}
            </Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {compareLoading ? (
              <Flex justify="center" py={10} role="status" aria-label="Loading comparison">
                <Spinner color="accent.500" />
              </Flex>
            ) : (
              <Stack spacing={3}>
                {compareError ? (
                  <Text fontSize="sm" color="red.400" role="alert">
                    Couldn’t build the comparison: {compareError}
                  </Text>
                ) : null}
                <Flex justify="space-between" align="center" gap={3} flexWrap="wrap">
                  <SegmentedTabs
                    items={[
                      { key: 'changes', label: diff ? `Changes (${diff.total})` : 'Changes' },
                      { key: 'raw', label: 'Snapshot JSON' },
                    ]}
                    value={view}
                    onSelect={setView}
                    label="Comparison view"
                    idPrefix="cmp"
                    size="sm"
                  />
                  {diff && diff.total > 0 ? (
                    <HStack
                      spacing={3}
                      fontFamily={MONO}
                      fontSize="11px"
                      color="page.fg-secondary"
                      aria-label="Summary"
                    >
                      <Text>+{diff.counts.added} add</Text>
                      <Text>−{diff.counts.removed} remove</Text>
                      <Text>~{diff.counts.changed} change</Text>
                    </HStack>
                  ) : null}
                </Flex>

                <Box {...tabPanelProps('cmp', view)}>
                  {view === 'raw' ? (
                    <Textarea
                      value={rawSnapshot}
                      readOnly
                      rows={24}
                      fontFamily={MONO}
                      fontSize="xs"
                      resize="vertical"
                      bg="page.bg-elevated"
                      borderColor="page.border"
                      aria-label="Snapshot JSON"
                    />
                  ) : diff ? (
                    diff.total === 0 ? (
                      <Text fontSize="sm" color="page.fg-secondary" py={6} textAlign="center">
                        Identical to the live version — restoring it would change nothing.
                      </Text>
                    ) : (
                      <Stack spacing={3}>
                        <Text fontSize="sm" color="page.fg-secondary">
                          Restoring this snapshot would make these changes to the live{' '}
                          {compareTarget ? DOC_LABEL[compareTarget.type] : ''}:
                        </Text>
                        <InputGroup size="sm">
                          <InputLeftElement pointerEvents="none">
                            <SearchIcon color="page.muted" />
                          </InputLeftElement>
                          <Input
                            {...inputProps}
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Filter by path or value"
                            aria-label="Filter changes"
                            borderRadius="md"
                          />
                        </InputGroup>
                        <Box border="1px solid" borderColor="page.border" borderRadius="md" px={3}>
                          {shown.length ? (
                            shown.map((e) => <DiffRow key={`${e.kind}:${e.path}`} e={e} />)
                          ) : (
                            <Text fontSize="sm" color="page.fg-secondary" py={4}>
                              No changes match “{filter}”.
                            </Text>
                          )}
                        </Box>
                        {diff.total > diff.entries.length ? (
                          <Text fontSize="xs" color="page.fg-secondary">
                            Showing the first {diff.entries.length} of {diff.total} differences.
                            Download the snapshot for the full document.
                          </Text>
                        ) : null}
                      </Stack>
                    )
                  ) : null}
                </Box>
              </Stack>
            )}
          </ModalBody>
          <ModalFooter gap={2} flexWrap="wrap">
            {compareTarget ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<FaDownload />}
                  onClick={() => download(compareTarget)}
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  {...primaryButtonProps}
                  leftIcon={<FaUndo />}
                  onClick={() => setRestoreTarget(compareTarget)}
                >
                  Restore this version
                </Button>
              </>
            ) : null}
            <Button size="sm" {...outlineButtonProps} onClick={closeCompare}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Restore confirmation */}
      <AlertDialog
        isOpen={!!restoreTarget}
        leastDestructiveRef={cancelRef}
        onClose={() => setRestoreTarget(null)}
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
              Restore the {restoreTarget ? DOC_LABEL[restoreTarget.type] : ''} to this version?
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              <Text
                fontFamily={MONO}
                fontSize="12px"
                p={2}
                borderRadius="md"
                border="1px solid"
                borderColor="page.border"
                bg="page.bg"
                wordBreak="break-all"
              >
                {restoreTarget?.filename}
              </Text>
              <Text mt={3} color="page.fg-secondary">
                The live version is replaced and goes live immediately. A snapshot of the current
                state is saved first, so this can be undone from this list.
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button
                ref={cancelRef}
                size="sm"
                {...outlineButtonProps}
                onClick={() => setRestoreTarget(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                {...primaryButtonProps}
                leftIcon={<FaUndo />}
                onClick={confirmRestore}
                isLoading={restoring}
                loadingText="Restoring"
              >
                Restore
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  )
}
