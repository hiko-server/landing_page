import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
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
} from '@chakra-ui/react'
import { FaCloud, FaDatabase, FaSync, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa'

type DbRow = { name?: string; collection?: string; slug?: string; key?: string; bytes: number; updated_at: number }
type R2Obj = { key: string; size: number; lastModified: string | null }

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
  const cardBg = useColorModeValue('white', 'gray.800')
  const border = useColorModeValue('gray.200', 'gray.700')
  const dim = useColorModeValue('gray.600', 'gray.400')

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

  const r2Groups = useMemo(() => (data ? groupR2(data.r2.objects) : {}), [data])

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} flexWrap="wrap" gap={3}>
        <Box>
          <Heading size="md" fontFamily="'Sora', sans-serif">
            Content Storage
          </Heading>
          <Text fontSize="sm" color={dim}>
            Local SQLite is canonical; Cloudflare R2 is the off-site mirror.
          </Text>
        </Box>
        <Button
          size="sm"
          leftIcon={<Icon as={FaSync} />}
          onClick={load}
          isLoading={loading}
          borderRadius="10px"
        >
          Refresh
        </Button>
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
                <Badge colorScheme="gray" ml="auto">not configured</Badge>
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
                  Bucket reachable but empty. Run <Code fontSize="xs">yarn content:push</Code> to seed R2 from your local DB.
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
      )}
    </Box>
  )
}
