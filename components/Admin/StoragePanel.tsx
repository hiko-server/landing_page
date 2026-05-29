import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  ButtonGroup,
  Code,
  Divider,
  Flex,
  HStack,
  Heading,
  Icon,
  SimpleGrid,
  Skeleton,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Table,
  Tag,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  useDisclosure,
  useToast,
} from '@chakra-ui/react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
} from '@chakra-ui/react'
import {
  FaCloud,
  FaCloudDownloadAlt,
  FaCloudUploadAlt,
  FaDatabase,
  FaSync,
  FaCheckCircle,
  FaExclamationTriangle,
  FaArchive,
} from 'react-icons/fa'

type DbRow = { name?: string; collection?: string; slug?: string; key?: string; bytes: number; updated_at: number }
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
  return d.toLocaleString()
}

function fmtRelative(ts: number | null): string {
  if (!ts) return 'never'
  const secs = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function groupR2(objects: R2Obj[]): Record<string, R2Obj[]> {
  const groups: Record<string, R2Obj[]> = {}
  for (const o of objects) {
    const prefix = o.key.includes('/') ? o.key.split('/')[0] : 'root'
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(o)
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => a.key.localeCompare(b.key))
  }
  return groups
}

export default function StoragePanel() {
  const [data, setData] = useState<StoragePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [pulling, setPulling] = useState(false)
  const toast = useToast()
  const cardBg = useColorModeValue('white', 'gray.800')
  const border = useColorModeValue('gray.200', 'gray.700')
  const dim = useColorModeValue('gray.600', 'gray.400')
  const subtleBg = useColorModeValue('gray.50', 'gray.900')

  const confirmPull = useDisclosure()
  const cancelRef = React.useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/admin/storage')
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const runBackup = useCallback(async () => {
    setBackingUp(true)
    try {
      const res = await fetch('/api/admin/storage/backup', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json?.ok) {
        toast({
          status: 'error',
          title: 'Backup failed',
          description: json?.error || `HTTP ${res.status}`,
          duration: 7000,
          isClosable: true,
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
        })
      } else if (json.r2?.error) {
        toast({
          status: 'warning',
          title: 'Backup saved locally; R2 push failed',
          description: json.r2.error,
          duration: 8000,
          isClosable: true,
        })
      } else {
        toast({
          status: 'info',
          title: 'Backup saved locally',
          description: `${summary} (R2 not configured)`,
          duration: 5000,
          isClosable: true,
        })
      }
      await load()
    } catch (e: any) {
      toast({ status: 'error', title: 'Backup failed', description: e?.message || String(e) })
    } finally {
      setBackingUp(false)
    }
  }, [load, toast])

  const runPull = useCallback(async () => {
    confirmPull.onClose()
    setPulling(true)
    try {
      const res = await fetch('/api/admin/storage/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'r2' }),
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) {
        toast({
          status: res.status === 503 ? 'warning' : 'error',
          title: 'Pull failed',
          description: json?.error || `HTTP ${res.status}`,
          duration: 8000,
          isClosable: true,
        })
        return
      }
      const restored = json.restored || {}
      toast({
        status: 'success',
        title: 'Pull complete',
        description: `${restored.files ?? '?'} files restored${restored.dbReplaced ? ' (DB replaced)' : ''} from ${json.key}`,
        duration: 6000,
        isClosable: true,
      })
      await load()
    } catch (e: any) {
      toast({ status: 'error', title: 'Pull failed', description: e?.message || String(e) })
    } finally {
      setPulling(false)
    }
  }, [confirmPull, load, toast])

  const r2Groups = useMemo(() => (data ? groupR2(data.r2.objects) : {}), [data])
  const lastLocalAt = data?.backups?.lastLocalAt ?? null
  const lastR2At = useMemo(() => {
    if (!data?.r2?.snapshots?.length) return null
    const ts = data.r2.snapshots[0].lastModified
    return ts ? new Date(ts).getTime() : null
  }, [data])

  const pullDisabled = !data?.r2?.configured || !data?.r2?.hasLatest

  return (
    <Box>
      <Flex justify="space-between" align={{ base: 'stretch', md: 'center' }} mb={4} flexWrap="wrap" gap={3}>
        <Box>
          <Heading size="md" fontFamily="'Sora', sans-serif">
            Content Storage
          </Heading>
          <Text fontSize="sm" color={dim}>
            Local SQLite is canonical; Cloudflare R2 is the off-site mirror. Snapshots include the
            whole DB, uploads, version history and admin/Mongo config.
          </Text>
        </Box>
        <ButtonGroup size="sm" isAttached={false} spacing={2} flexWrap="wrap">
          <Button
            leftIcon={<Icon as={FaCloudUploadAlt} />}
            colorScheme="teal"
            onClick={runBackup}
            isLoading={backingUp}
            loadingText="Backing up…"
            borderRadius="10px"
          >
            Backup now
          </Button>
          <Button
            leftIcon={<Icon as={FaCloudDownloadAlt} />}
            colorScheme="orange"
            variant="outline"
            onClick={() => confirmPull.onOpen()}
            isDisabled={pullDisabled || pulling}
            isLoading={pulling}
            loadingText="Pulling…"
            borderRadius="10px"
            title={
              !data?.r2?.configured
                ? 'R2 not configured'
                : !data?.r2?.hasLatest
                ? 'No backups/latest.tgz in R2 yet'
                : 'Pull and restore backups/latest.tgz'
            }
          >
            Pull latest
          </Button>
          <Button
            leftIcon={<Icon as={FaSync} />}
            onClick={load}
            isLoading={loading}
            variant="ghost"
            borderRadius="10px"
          >
            Refresh
          </Button>
        </ButtonGroup>
      </Flex>

      {err && (
        <Alert status="error" borderRadius="md" mb={4}>
          <AlertIcon />
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      {loading && !data && (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <Skeleton height="200px" borderRadius="md" />
          <Skeleton height="200px" borderRadius="md" />
        </SimpleGrid>
      )}

      {data && (
        <>
          {/* ── Snapshot summary strip ───────────────────────────────────── */}
          <Box
            bg={subtleBg}
            border="1px solid"
            borderColor={border}
            borderRadius="lg"
            p={4}
            mb={4}
          >
            <HStack mb={3} spacing={2}>
              <Icon as={FaArchive} color="purple.400" />
              <Heading size="sm">Snapshots</Heading>
              <Badge colorScheme="purple" ml="auto">tarball · whole-site</Badge>
            </HStack>
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={3}>
              <Stat>
                <StatLabel fontSize="xs">Last local backup</StatLabel>
                <StatNumber fontSize="md">{fmtRelative(lastLocalAt)}</StatNumber>
                <Text fontSize="xs" color={dim}>{lastLocalAt ? fmtDate(lastLocalAt) : '—'}</Text>
              </Stat>
              <Stat>
                <StatLabel fontSize="xs">Last R2 snapshot</StatLabel>
                <StatNumber fontSize="md">{fmtRelative(lastR2At)}</StatNumber>
                <Text fontSize="xs" color={dim}>{lastR2At ? fmtDate(lastR2At) : '—'}</Text>
              </Stat>
              <Stat>
                <StatLabel fontSize="xs">Local copies</StatLabel>
                <StatNumber fontSize="md">{data.backups.local.length}</StatNumber>
              </Stat>
              <Stat>
                <StatLabel fontSize="xs">R2 copies</StatLabel>
                <StatNumber fontSize="md">{data.r2.snapshots.length}</StatNumber>
              </Stat>
            </SimpleGrid>

            {data.backups.local.length > 0 && (
              <Table size="sm" variant="simple" mb={2}>
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
                      <Td><Code fontSize="xs">{b.filename}</Code></Td>
                      <Td isNumeric fontSize="xs">{fmtBytes(b.bytes)}</Td>
                      <Td fontSize="xs">{fmtDate(b.mtime)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}

            {data.r2.configured && data.r2.snapshots.length > 0 && (
              <Table size="sm" variant="simple">
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
                          <Code fontSize="xs">{o.key}</Code>
                          {o.key === data.backups.r2LatestKey && (
                            <Badge colorScheme="green" fontSize="2xs">latest alias</Badge>
                          )}
                        </HStack>
                      </Td>
                      <Td isNumeric fontSize="xs">{fmtBytes(o.size)}</Td>
                      <Td fontSize="xs">{fmtDate(o.lastModified)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}

            {data.backups.local.length === 0 && (
              <Text fontSize="xs" color={dim} fontStyle="italic">
                No snapshots yet. Click <strong>Backup now</strong> to create the first one.
              </Text>
            )}
          </Box>

          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
            {/* ── Local DB ───────────────────────────────────────────── */}
            <Box bg={cardBg} border="1px solid" borderColor={border} borderRadius="lg" p={5}>
              <HStack mb={4} spacing={2}>
                <Icon as={FaDatabase} color="blue.400" />
                <Heading size="sm">Local SQLite</Heading>
                <Badge colorScheme="green" ml="auto">
                  canonical
                </Badge>
              </HStack>
              <SimpleGrid columns={3} spacing={4} mb={5}>
                <Stat>
                  <StatLabel fontSize="xs">Pages</StatLabel>
                  <StatNumber fontSize="2xl">{data.db.totals.pages}</StatNumber>
                </Stat>
                <Stat>
                  <StatLabel fontSize="xs">Items</StatLabel>
                  <StatNumber fontSize="2xl">{data.db.totals.items}</StatNumber>
                </Stat>
                <Stat>
                  <StatLabel fontSize="xs">KV</StatLabel>
                  <StatNumber fontSize="2xl">{data.db.totals.kv}</StatNumber>
                </Stat>
              </SimpleGrid>

              <Divider mb={3} />
              <Text fontWeight="600" fontSize="sm" mb={2}>
                Pages
              </Text>
              <Table size="sm" variant="simple" mb={4}>
                <Thead>
                  <Tr>
                    <Th>Name</Th>
                    <Th isNumeric>Size</Th>
                    <Th>Updated</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.db.pages.map(r => (
                    <Tr key={r.name}>
                      <Td><Code fontSize="xs">{r.name}</Code></Td>
                      <Td isNumeric fontSize="xs">{fmtBytes(r.bytes)}</Td>
                      <Td fontSize="xs">{fmtDate(r.updated_at)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>

              <Text fontWeight="600" fontSize="sm" mb={2}>
                Collection items
              </Text>
              <Table size="sm" variant="simple" mb={4}>
                <Thead>
                  <Tr>
                    <Th>Collection</Th>
                    <Th>Slug</Th>
                    <Th isNumeric>Size</Th>
                    <Th>Updated</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.db.items.map(r => (
                    <Tr key={`${r.collection}/${r.slug}`}>
                      <Td><Tag size="sm" colorScheme="purple">{r.collection}</Tag></Td>
                      <Td><Code fontSize="xs">{r.slug}</Code></Td>
                      <Td isNumeric fontSize="xs">{fmtBytes(r.bytes)}</Td>
                      <Td fontSize="xs">{fmtDate(r.updated_at)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>

              <Text fontWeight="600" fontSize="sm" mb={2}>
                Key/value
              </Text>
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th>Key</Th>
                    <Th isNumeric>Size</Th>
                    <Th>Updated</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.db.kv.map(r => (
                    <Tr key={r.key}>
                      <Td><Code fontSize="xs">{r.key}</Code></Td>
                      <Td isNumeric fontSize="xs">{fmtBytes(r.bytes)}</Td>
                      <Td fontSize="xs">{fmtDate(r.updated_at)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>

            {/* ── R2 ────────────────────────────────────────────────── */}
            <Box bg={cardBg} border="1px solid" borderColor={border} borderRadius="lg" p={5}>
              <HStack mb={4} spacing={2}>
                <Icon as={FaCloud} color="orange.400" />
                <Heading size="sm">Cloudflare R2</Heading>
                {data.r2.configured ? (
                  data.r2.ok ? (
                    <Badge colorScheme="green" ml="auto">
                      <HStack spacing={1}><Icon as={FaCheckCircle} boxSize={3} /><Text>connected</Text></HStack>
                    </Badge>
                  ) : (
                    <Badge colorScheme="red" ml="auto">
                      <HStack spacing={1}><Icon as={FaExclamationTriangle} boxSize={3} /><Text>error</Text></HStack>
                    </Badge>
                  )
                ) : (
                  <Badge colorScheme="gray" ml="auto">Not configured</Badge>
                )}
              </HStack>

              {!data.r2.configured && (
                <Alert status="warning" borderRadius="md" mb={3} fontSize="sm">
                  <AlertIcon />
                  <Box>
                    <AlertTitle fontSize="sm">R2 env vars missing</AlertTitle>
                    <AlertDescription fontSize="xs">
                      Set <Code fontSize="xs">R2_ENDPOINT</Code>, <Code fontSize="xs">R2_BUCKET</Code>,{' '}
                      <Code fontSize="xs">R2_ACCESS_KEY_ID</Code> and{' '}
                      <Code fontSize="xs">R2_SECRET_ACCESS_KEY</Code> in <Code fontSize="xs">.env</Code>, then restart the dev server.
                      Backups still work locally — they just won't replicate off-site until R2 is wired up.
                    </AlertDescription>
                  </Box>
                </Alert>
              )}

              {data.r2.error && (
                <Alert status="error" borderRadius="md" mb={3} fontSize="sm">
                  <AlertIcon />
                  <Box>
                    <AlertTitle fontSize="sm">R2 request failed</AlertTitle>
                    <AlertDescription fontSize="xs">{data.r2.error}</AlertDescription>
                  </Box>
                </Alert>
              )}

              <SimpleGrid columns={2} spacing={4} mb={4}>
                <Stat>
                  <StatLabel fontSize="xs">Bucket</StatLabel>
                  <StatNumber fontSize="md" fontFamily="mono">{data.r2.bucket || '—'}</StatNumber>
                </Stat>
                <Stat>
                  <StatLabel fontSize="xs">Objects</StatLabel>
                  <StatNumber fontSize="2xl">{data.r2.objects.length}</StatNumber>
                </Stat>
              </SimpleGrid>
              <Text fontSize="xs" color={dim} mb={3}>
                Total size: <strong>{fmtBytes(data.r2.totalSize)}</strong>
              </Text>

              {data.r2.ok && data.r2.objects.length === 0 && (
                <Alert status="info" borderRadius="md" fontSize="sm">
                  <AlertIcon />
                  <AlertDescription>
                    Bucket reachable but empty. Click <strong>Backup now</strong> to push the first snapshot.
                  </AlertDescription>
                </Alert>
              )}

              {data.r2.objects.length > 0 &&
                Object.entries(r2Groups).map(([prefix, objs]) => (
                  <Box key={prefix} mb={4}>
                    <HStack mb={2}>
                      <Tag size="sm" colorScheme="orange">{prefix}/</Tag>
                      <Text fontSize="xs" color={dim}>{objs.length} object{objs.length === 1 ? '' : 's'}</Text>
                    </HStack>
                    <Table size="sm" variant="simple">
                      <Thead>
                        <Tr>
                          <Th>Key</Th>
                          <Th isNumeric>Size</Th>
                          <Th>Modified</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {objs.map(o => (
                          <Tr key={o.key}>
                            <Td>
                              <Code fontSize="xs">{o.key.slice(prefix.length + 1) || o.key}</Code>
                            </Td>
                            <Td isNumeric fontSize="xs">{fmtBytes(o.size)}</Td>
                            <Td fontSize="xs">{fmtDate(o.lastModified)}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                ))}

              {loading && data && <Spinner size="sm" mt={2} />}
            </Box>
          </SimpleGrid>
        </>
      )}

      {/* ── Pull confirmation ─────────────────────────────────────────── */}
      <AlertDialog
        isOpen={confirmPull.isOpen}
        leastDestructiveRef={cancelRef}
        onClose={confirmPull.onClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Pull latest backup from R2?
            </AlertDialogHeader>
            <AlertDialogBody>
              This will <strong>overwrite</strong> your local SQLite database, uploads,
              version-history snapshots, and admin/Mongo config with the contents of{' '}
              <Code fontSize="xs">{data?.backups?.r2LatestKey || 'backups/latest.tgz'}</Code>.
              <br /><br />
              Run <em>Backup now</em> first if you want a recovery point for the current state.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={confirmPull.onClose}>
                Cancel
              </Button>
              <Button colorScheme="orange" onClick={runPull} ml={3} isLoading={pulling}>
                Pull and restore
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  )
}
