import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  Code,
  Flex,
  HStack,
  Icon,
  ListItem,
  SimpleGrid,
  Skeleton,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  UnorderedList,
  useToast,
} from '@chakra-ui/react'
import {
  FaCloud,
  FaCloudDownloadAlt,
  FaCloudUploadAlt,
  FaDatabase,
  FaSync,
  FaArchive,
} from 'react-icons/fa'
import { readJsonObject } from './shell/http'
import { useStepUp } from './security/useStepUp'
import { wasStepUpCancelled } from './security/stepUpClient'
import {
  lastRunDetail,
  parseBackupSchedule,
  parseRestoreReport,
  scheduleLine,
  type BackupSchedule,
  type RestoreReport,
} from './shell/storageReport'
import {
  Eyebrow,
  MONO,
  Panel,
  RevalidatedPaths,
  outlineButtonProps,
  primaryButtonProps,
} from './shell/ui'

type DbRow = {
  name?: string
  collection?: string
  slug?: string
  key?: string
  bytes: number
  updated_at: number
}
type R2Obj = { key: string; size: number; lastModified: string | null }
type LocalBackup = { filename: string; bytes: number; mtime: number }

type StoragePayload = {
  db: {
    pages: DbRow[]
    items: DbRow[]
    kv: DbRow[]
    totals: { pages: number; items: number; kv: number }
  }
  r2: {
    configured: boolean
    bucket: string | null
    endpoint: string | null
    ok: boolean
    error: string | null
    objects: R2Obj[]
    totalSize: number
    snapshots: R2Obj[]
    hasLatest: boolean
  }
  backups: {
    localDir: string
    local: LocalBackup[]
    lastLocalAt: number | null
    r2Prefix: string
    r2LatestKey: string
  }
  now: number
}

type PullSummary = {
  at: number
  key: string | null
  files: number | null
  safetySnapshot: string | null
  report: RestoreReport | null
}

function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

function fmtDate(ts: number | string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

function fmtRelative(ts: number | null): string {
  if (!ts) return 'never'
  const secs = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function groupR2(objects: R2Obj[]): Record<string, R2Obj[]> {
  const groups: Record<string, R2Obj[]> = {}
  for (const o of objects) {
    const prefix = o.key.includes('/') ? o.key.split('/')[0] : 'root'
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(o)
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.key.localeCompare(b.key))
  return groups
}

const errText = (e: unknown) =>
  e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error' : e.message) : String(e)

/** Mono label + big number, in the public site's stat style. */
function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <Box minW={0}>
      <Eyebrow>{label}</Eyebrow>
      <Text fontSize="lg" fontWeight={600} letterSpacing="-0.02em" mt={1} noOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text fontSize="11px" color="page.fg-secondary" noOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </Box>
  )
}

function HairlineTable({ children, mb = 4 }: { children: React.ReactNode; mb?: number }) {
  return (
    <TableContainer border="1px solid" borderColor="page.border" borderRadius="md" mb={mb}>
      <Table
        size="sm"
        variant="simple"
        sx={{
          'th, td': { borderColor: 'page.border' },
          th: {
            fontFamily: MONO,
            fontSize: '10px',
            letterSpacing: '0.12em',
            color: 'page.fg-secondary',
          },
          'tr:last-of-type td': { borderBottom: 'none' },
        }}
      >
        {children}
      </Table>
    </TableContainer>
  )
}

function CardTitle({
  icon,
  title,
  badge,
}: {
  icon: React.ElementType
  title: string
  badge?: React.ReactNode
}) {
  return (
    <HStack mb={4} spacing={2}>
      <Icon as={icon} color="accent.500" boxSize={3.5} aria-hidden />
      <Text as="h3" fontSize="sm" fontWeight={600}>
        {title}
      </Text>
      <Box ml="auto">{badge}</Box>
    </HStack>
  )
}

function RestoreReportCard({ pull, onDismiss }: { pull: PullSummary; onDismiss: () => void }) {
  const r = pull.report
  return (
    <Panel
      mb={4}
      borderColor="accent.500"
      role="status"
      aria-live="polite"
      aria-labelledby="restore-report-title"
    >
      <Flex align="flex-start" justify="space-between" gap={3} mb={3}>
        <Box>
          <Eyebrow accent>[restore report]</Eyebrow>
          <Text id="restore-report-title" fontSize="sm" fontWeight={600} mt={1}>
            Restored {pull.key ? <Code fontSize="xs">{pull.key}</Code> : 'snapshot'} ·{' '}
            {fmtDate(pull.at)}
          </Text>
        </Box>
        <Button size="xs" variant="ghost" color="page.fg-secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </Flex>
      {r ? (
        <>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={3}>
            <Stat label="Database" value={r.dbReplaced ? 'Replaced' : 'Unchanged'} />
            <Stat label="Files restored" value={pull.files ?? '—'} />
            <Stat label="R2 mirrored" value={r.r2Mirrored} sub="objects re-uploaded" />
            <Stat label="R2 removed" value={r.r2Removed} sub="stale objects deleted" />
          </SimpleGrid>
          {r.revalidated.length ? <RevalidatedPaths paths={r.revalidated} /> : null}
          {r.warnings.length ? (
            <Alert
              status="warning"
              variant="left-accent"
              borderRadius="md"
              mt={3}
              bg="page.bg-elevated"
              alignItems="flex-start"
              fontSize="sm"
            >
              <AlertIcon mt={0.5} />
              <Box>
                <AlertTitle fontSize="sm">
                  {r.warnings.length} warning{r.warnings.length === 1 ? '' : 's'}
                </AlertTitle>
                <UnorderedList fontSize="xs" ml={4} mt={1} spacing={0.5}>
                  {r.warnings.map((w) => (
                    <ListItem key={w}>{w}</ListItem>
                  ))}
                </UnorderedList>
              </Box>
            </Alert>
          ) : null}
        </>
      ) : (
        <Text fontSize="sm" color="page.fg-secondary">
          {pull.files ?? '?'} files restored.
        </Text>
      )}
      {pull.safetySnapshot ? (
        <Text fontSize="xs" color="page.fg-secondary" mt={3}>
          The replaced state was saved first as <Code fontSize="xs">{pull.safetySnapshot}</Code>.
        </Text>
      ) : null}
    </Panel>
  )
}

/** "Scheduled: every 24 h · last run 3 h ago · next in 21 h" plus what the last run did. */
function ScheduleSummary({ schedule, now }: { schedule: BackupSchedule; now: number }) {
  const detail = lastRunDetail(schedule)
  const failed = schedule.lastOk === false
  return (
    <Box
      mb={4}
      px={3}
      py={2.5}
      border="1px solid"
      borderColor={failed ? 'red.400' : 'page.border'}
      borderRadius="md"
      bg="page.bg-elevated"
    >
      <Text fontFamily={MONO} fontSize="xs" color="page.fg" className="tnum">
        {scheduleLine(schedule, now)}
      </Text>
      {detail ? (
        <Text fontSize="xs" color={failed ? 'red.600' : 'page.fg-secondary'} _dark={failed ? { color: 'red.300' } : undefined} mt={1}>
          {failed ? <Box as="span" fontWeight={600}>Needs attention: </Box> : null}
          {detail}
        </Text>
      ) : null}
    </Box>
  )
}

export default function StoragePanel() {
  const [data, setData] = useState<StoragePayload | null>(null)
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [confirmPull, setConfirmPull] = useState(false)
  const [lastPull, setLastPull] = useState<PullSummary | null>(null)
  const toast = useToast()
  // Restoring asks for a recent sign-in or step-up (lib/adminAuth/stepUp.ts).
  const { fetchWithStepUp, stepUpElement } = useStepUp()
  const cancelRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/admin/storage', { cache: 'no-store' })
      const json = await readJsonObject(res)
      if (res.status === 401) throw new Error('Session expired — sign in again.')
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json as StoragePayload)
      setSchedule(parseBackupSchedule(json))
    } catch (e) {
      setErr(errText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runBackup = useCallback(async () => {
    setBackingUp(true)
    try {
      const res = await fetch('/api/admin/storage/backup', { method: 'POST' })
      const json = await readJsonObject(res)
      if (!res.ok || !json.ok) {
        toast({
          status: res.status === 409 ? 'warning' : 'error',
          title: 'Backup failed',
          description: json.error || `HTTP ${res.status}`,
          duration: 7000,
          isClosable: true,
          position: 'bottom-right',
        })
        return
      }
      const summary = `${json.manifest?.totals?.files ?? '?'} files, ${fmtBytes(json.bytes || 0)}`
      if (json.r2?.pushed) {
        toast({
          status: 'success',
          title: 'Backup complete',
          description: `${summary} → local + R2 (${json.r2.key})`,
          duration: 5000,
          isClosable: true,
          position: 'bottom-right',
        })
      } else if (json.r2?.error) {
        toast({
          status: 'warning',
          title: 'Backup saved locally; R2 push failed',
          description: json.r2.error,
          duration: 8000,
          isClosable: true,
          position: 'bottom-right',
        })
      } else {
        toast({
          status: 'info',
          title: 'Backup saved locally',
          description: `${summary} (R2 not configured)`,
          duration: 5000,
          isClosable: true,
          position: 'bottom-right',
        })
      }
      await load()
    } catch (e) {
      toast({
        status: 'error',
        title: 'Backup failed',
        description: errText(e),
        position: 'bottom-right',
      })
    } finally {
      setBackingUp(false)
    }
  }, [load, toast])

  const runPull = useCallback(async () => {
    setConfirmPull(false)
    setPulling(true)
    try {
      const res = await fetchWithStepUp(
        '/api/admin/storage/pull',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'r2' }),
        },
        'Restoring replaces the live site with the backup.',
      )
      if (wasStepUpCancelled(res)) return
      const json = await readJsonObject(res)
      if (!res.ok || !json.ok) {
        toast({
          status: res.status === 503 || res.status === 409 ? 'warning' : 'error',
          title: 'Pull failed',
          description: json.error || `HTTP ${res.status}`,
          duration: 8000,
          isClosable: true,
          position: 'bottom-right',
        })
        return
      }
      const report = parseRestoreReport(json)
      setLastPull({
        at: Date.now(),
        key: typeof json.key === 'string' ? json.key : null,
        files: typeof json.restored?.files === 'number' ? json.restored.files : null,
        safetySnapshot: typeof json.safetySnapshot === 'string' ? json.safetySnapshot : null,
        report,
      })
      toast({
        status: report?.warnings.length ? 'warning' : 'success',
        title: 'Pull complete',
        description: report?.warnings.length
          ? `${report.warnings.length} warning(s) — see the restore report.`
          : 'See the restore report below.',
        duration: 6000,
        isClosable: true,
        position: 'bottom-right',
      })
      await load()
    } catch (e) {
      toast({
        status: 'error',
        title: 'Pull failed',
        description: errText(e),
        position: 'bottom-right',
      })
    } finally {
      setPulling(false)
    }
  }, [load, toast, fetchWithStepUp])

  const r2Groups = useMemo(() => (data ? groupR2(data.r2.objects) : {}), [data])
  const lastLocalAt = data?.backups?.lastLocalAt ?? null
  const lastR2At = useMemo(() => {
    const ts = data?.r2?.snapshots?.[0]?.lastModified
    return ts ? new Date(ts).getTime() : null
  }, [data])

  const pullDisabled = !data?.r2?.configured || !data?.r2?.hasLatest
  const pullHint = !data?.r2?.configured
    ? 'R2 is not configured'
    : !data?.r2?.hasLatest
      ? 'No backups/latest.tgz in R2 yet'
      : 'Download and restore backups/latest.tgz'

  return (
    <Box>
      <Flex
        justify="space-between"
        align={{ base: 'stretch', md: 'flex-end' }}
        mb={5}
        flexWrap="wrap"
        gap={4}
      >
        <Box maxW="62ch">
          <Eyebrow accent>[storage]</Eyebrow>
          <Text as="h2" fontSize="lg" fontWeight={600} letterSpacing="-0.02em" mt={1}>
            Content storage
          </Text>
          <Text fontSize="sm" color="page.fg-secondary" mt={1}>
            Local SQLite is canonical; Cloudflare R2 is the off-site mirror. A snapshot holds the
            whole database, uploads and version history.
          </Text>
        </Box>
        <HStack spacing={2} flexWrap="wrap">
          <Button
            size="sm"
            leftIcon={<Icon as={FaCloudUploadAlt} />}
            {...primaryButtonProps}
            onClick={runBackup}
            isLoading={backingUp}
            loadingText="Backing up"
          >
            Backup now
          </Button>
          <Button
            size="sm"
            leftIcon={<Icon as={FaCloudDownloadAlt} />}
            {...outlineButtonProps}
            onClick={() => setConfirmPull(true)}
            isDisabled={pullDisabled || pulling}
            isLoading={pulling}
            loadingText="Pulling"
            title={pullHint}
          >
            Pull latest
          </Button>
          <Button
            size="sm"
            leftIcon={<Icon as={FaSync} />}
            onClick={() => void load()}
            isLoading={loading}
            variant="ghost"
            color="page.fg-secondary"
          >
            Refresh
          </Button>
        </HStack>
      </Flex>

      {lastPull ? <RestoreReportCard pull={lastPull} onDismiss={() => setLastPull(null)} /> : null}

      {err ? (
        <Alert
          status="error"
          variant="left-accent"
          borderRadius="md"
          mb={4}
          bg="page.bg-elevated"
          role="alert"
        >
          <AlertIcon />
          <AlertDescription fontSize="sm">{err}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <SimpleGrid
          columns={{ base: 1, md: 2 }}
          spacing={4}
          aria-busy="true"
          aria-label="Loading storage status"
        >
          <Skeleton height="200px" borderRadius="xl" />
          <Skeleton height="200px" borderRadius="xl" />
        </SimpleGrid>
      ) : null}

      {data ? (
        <>
          <Panel mb={4}>
            <CardTitle
              icon={FaArchive}
              title="Snapshots"
              badge={
                <Badge variant="outline" colorScheme="accent" fontFamily={MONO} fontSize="9px">
                  tarball · whole site
                </Badge>
              }
            />
            {schedule ? <ScheduleSummary schedule={schedule} now={data.now} /> : null}
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={4}>
              <Stat
                label="Last local backup"
                value={fmtRelative(lastLocalAt)}
                sub={lastLocalAt ? fmtDate(lastLocalAt) : '—'}
              />
              <Stat
                label="Last R2 snapshot"
                value={fmtRelative(lastR2At)}
                sub={lastR2At ? fmtDate(lastR2At) : '—'}
              />
              <Stat label="Local copies" value={data.backups.local.length} />
              <Stat label="R2 copies" value={data.r2.snapshots.length} />
            </SimpleGrid>

            {data.backups.local.length > 0 ? (
              <HairlineTable>
                <Thead>
                  <Tr>
                    <Th>Local file</Th>
                    <Th isNumeric>Size</Th>
                    <Th>Created</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.backups.local.slice(0, 5).map((b) => (
                    <Tr key={b.filename}>
                      <Td>
                        <Code fontSize="xs" bg="transparent">
                          {b.filename}
                        </Code>
                      </Td>
                      <Td isNumeric fontSize="xs">
                        {fmtBytes(b.bytes)}
                      </Td>
                      <Td fontSize="xs">{fmtDate(b.mtime)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </HairlineTable>
            ) : (
              <Text fontSize="xs" color="page.fg-secondary">
                No local snapshots yet. Use <strong>Backup now</strong> to create the first one.
              </Text>
            )}

            {data.r2.configured && data.r2.snapshots.length > 0 ? (
              <HairlineTable mb={0}>
                <Thead>
                  <Tr>
                    <Th>R2 key</Th>
                    <Th isNumeric>Size</Th>
                    <Th>Modified</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.r2.snapshots.slice(0, 5).map((o) => (
                    <Tr key={o.key}>
                      <Td>
                        <HStack spacing={2}>
                          <Code fontSize="xs" bg="transparent">
                            {o.key}
                          </Code>
                          {o.key === data.backups.r2LatestKey ? (
                            <Badge colorScheme="green" variant="subtle" fontSize="9px">
                              latest alias
                            </Badge>
                          ) : null}
                        </HStack>
                      </Td>
                      <Td isNumeric fontSize="xs">
                        {fmtBytes(o.size)}
                      </Td>
                      <Td fontSize="xs">{fmtDate(o.lastModified)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </HairlineTable>
            ) : null}
          </Panel>

          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
            <Panel>
              <CardTitle
                icon={FaDatabase}
                title="Local SQLite"
                badge={
                  <Badge colorScheme="green" variant="subtle" fontSize="9px">
                    canonical
                  </Badge>
                }
              />
              <SimpleGrid columns={3} spacing={4} mb={5}>
                <Stat label="Pages" value={data.db.totals.pages} />
                <Stat label="Items" value={data.db.totals.items} />
                <Stat label="KV" value={data.db.totals.kv} />
              </SimpleGrid>

              <Eyebrow mb={2}>Pages</Eyebrow>
              <HairlineTable>
                <Thead>
                  <Tr>
                    <Th>Name</Th>
                    <Th isNumeric>Size</Th>
                    <Th>Updated</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.db.pages.map((r) => (
                    <Tr key={r.name}>
                      <Td>
                        <Code fontSize="xs" bg="transparent">
                          {r.name}
                        </Code>
                      </Td>
                      <Td isNumeric fontSize="xs">
                        {fmtBytes(r.bytes)}
                      </Td>
                      <Td fontSize="xs">{fmtDate(r.updated_at)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </HairlineTable>

              <Eyebrow mb={2}>Collection items</Eyebrow>
              <HairlineTable>
                <Thead>
                  <Tr>
                    <Th>Collection</Th>
                    <Th>Slug</Th>
                    <Th isNumeric>Size</Th>
                    <Th>Updated</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.db.items.map((r) => (
                    <Tr key={`${r.collection}/${r.slug}`}>
                      <Td fontFamily={MONO} fontSize="xs" color="accent.text">
                        {r.collection}
                      </Td>
                      <Td>
                        <Code fontSize="xs" bg="transparent">
                          {r.slug}
                        </Code>
                      </Td>
                      <Td isNumeric fontSize="xs">
                        {fmtBytes(r.bytes)}
                      </Td>
                      <Td fontSize="xs">{fmtDate(r.updated_at)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </HairlineTable>

              <Eyebrow mb={2}>Key / value</Eyebrow>
              <HairlineTable mb={0}>
                <Thead>
                  <Tr>
                    <Th>Key</Th>
                    <Th isNumeric>Size</Th>
                    <Th>Updated</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.db.kv.map((r) => (
                    <Tr key={r.key}>
                      <Td>
                        <Code fontSize="xs" bg="transparent">
                          {r.key}
                        </Code>
                      </Td>
                      <Td isNumeric fontSize="xs">
                        {fmtBytes(r.bytes)}
                      </Td>
                      <Td fontSize="xs">{fmtDate(r.updated_at)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </HairlineTable>
            </Panel>

            <Panel>
              <CardTitle
                icon={FaCloud}
                title="Cloudflare R2"
                badge={
                  data.r2.configured ? (
                    <Badge
                      colorScheme={data.r2.ok ? 'green' : 'red'}
                      variant="subtle"
                      fontSize="9px"
                    >
                      {data.r2.ok ? 'connected' : 'error'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" fontSize="9px" color="page.fg-secondary">
                      not configured
                    </Badge>
                  )
                }
              />

              {!data.r2.configured ? (
                <Alert
                  status="warning"
                  variant="left-accent"
                  borderRadius="md"
                  mb={3}
                  fontSize="sm"
                  bg="page.bg-elevated"
                  alignItems="flex-start"
                >
                  <AlertIcon mt={0.5} />
                  <Box>
                    <AlertTitle fontSize="sm">R2 env vars missing</AlertTitle>
                    <AlertDescription fontSize="xs">
                      Set <Code fontSize="xs">R2_ENDPOINT</Code>,{' '}
                      <Code fontSize="xs">R2_BUCKET</Code>,{' '}
                      <Code fontSize="xs">R2_ACCESS_KEY_ID</Code> and{' '}
                      <Code fontSize="xs">R2_SECRET_ACCESS_KEY</Code> in{' '}
                      <Code fontSize="xs">.env</Code>, then restart the server. Backups still work
                      locally — they just won’t replicate off-site until R2 is wired up.
                    </AlertDescription>
                  </Box>
                </Alert>
              ) : null}

              {data.r2.error ? (
                <Alert
                  status="error"
                  variant="left-accent"
                  borderRadius="md"
                  mb={3}
                  fontSize="sm"
                  bg="page.bg-elevated"
                  alignItems="flex-start"
                >
                  <AlertIcon mt={0.5} />
                  <Box>
                    <AlertTitle fontSize="sm">R2 request failed</AlertTitle>
                    <AlertDescription fontSize="xs">{data.r2.error}</AlertDescription>
                  </Box>
                </Alert>
              ) : null}

              <SimpleGrid columns={3} spacing={4} mb={4}>
                <Stat
                  label="Bucket"
                  value={
                    <Box as="span" fontFamily={MONO} fontSize="sm">
                      {data.r2.bucket || '—'}
                    </Box>
                  }
                />
                <Stat label="Objects" value={data.r2.objects.length} />
                <Stat label="Total size" value={fmtBytes(data.r2.totalSize)} />
              </SimpleGrid>

              {data.r2.ok && data.r2.objects.length === 0 ? (
                <Text fontSize="sm" color="page.fg-secondary">
                  Bucket reachable but empty. Use <strong>Backup now</strong> to push the first
                  snapshot.
                </Text>
              ) : null}

              {Object.entries(r2Groups).map(([prefix, objs]) => (
                <Box key={prefix}>
                  <HStack mb={2} spacing={2}>
                    <Eyebrow color="accent.text">{prefix}/</Eyebrow>
                    <Text fontSize="xs" color="page.fg-secondary">
                      {objs.length} object{objs.length === 1 ? '' : 's'}
                    </Text>
                  </HStack>
                  <HairlineTable>
                    <Thead>
                      <Tr>
                        <Th>Key</Th>
                        <Th isNumeric>Size</Th>
                        <Th>Modified</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {objs.map((o) => (
                        <Tr key={o.key}>
                          <Td>
                            <Code fontSize="xs" bg="transparent">
                              {o.key.slice(prefix.length + 1) || o.key}
                            </Code>
                          </Td>
                          <Td isNumeric fontSize="xs">
                            {fmtBytes(o.size)}
                          </Td>
                          <Td fontSize="xs">{fmtDate(o.lastModified)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </HairlineTable>
                </Box>
              ))}

              {loading ? (
                <Spinner size="sm" mt={2} color="accent.500" aria-label="Refreshing" />
              ) : null}
            </Panel>
          </SimpleGrid>
        </>
      ) : null}

      <AlertDialog
        isOpen={confirmPull}
        leastDestructiveRef={cancelRef}
        onClose={() => setConfirmPull(false)}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent
            bg="page.bg-elevated"
            border="1px solid"
            borderColor="page.border"
            mx={4}
          >
            <AlertDialogHeader fontSize="md">Pull the latest backup from R2?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              This <strong>replaces</strong> the local SQLite database, uploads and version-history
              snapshots with the contents of{' '}
              <Code fontSize="xs">{data?.backups?.r2LatestKey || 'backups/latest.tgz'}</Code>. Admin
              credentials and MongoDB settings are kept.
              <Text mt={3} color="page.fg-secondary">
                A safety snapshot of the current state is saved first. Afterwards the R2 mirror is
                resynced and the public pages are refreshed — you’ll get a report of what changed.
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button
                ref={cancelRef}
                size="sm"
                {...outlineButtonProps}
                onClick={() => setConfirmPull(false)}
              >
                Cancel
              </Button>
              <Button size="sm" {...primaryButtonProps} onClick={runPull} isLoading={pulling}>
                Pull and restore
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
      {stepUpElement}
    </Box>
  )
}
