import { useCallback, useEffect, useState } from 'react'
import NextLink from 'next/link'
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  Progress,
  SimpleGrid,
  Skeleton,
  Text,
  useToast,
} from '@chakra-ui/react'
import { WarningTwoIcon } from '@chakra-ui/icons'
import type { SystemSnapshot } from '../../../lib/systemHealth'
import type { DrillResult } from '../../../lib/restoreDrill'
import { MONO, Panel, outlineButtonProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { NETWORK_ERROR } from '../shell/authMessages'
import { absoluteTime, relativeTime } from '../security/securityFormat'
import { checkTone, formatBytes, formatDuration, formatUptime } from './systemFormat'

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Box minW={0}>
      <Text fontFamily={MONO} fontSize="10px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary">
        {label}
      </Text>
      <Text fontSize="md" fontWeight={600} mt={0.5} className="tnum" wordBreak="break-word">
        {value}
      </Text>
      {sub ? (
        <Text fontSize="xs" color="page.fg-secondary" className="tnum">
          {sub}
        </Text>
      ) : null}
    </Box>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text as="h3" fontSize="sm" fontWeight={600} mb={3}>
      {children}
    </Text>
  )
}

const DRILL_LABEL: Record<string, string> = { passed: 'passed', failed: 'failed', skipped: 'skipped' }

function DrillChecks({ drill }: { drill: DrillResult }) {
  if (!drill.checks.length) return null
  return (
    <Box as="ul" listStyleType="none" mt={3} border="1px solid" borderColor="page.border" borderRadius="md">
      {drill.checks.map((c) => (
        <Flex as="li" key={c.id} gap={3} px={3} py={2} borderBottom="1px solid" borderColor="page.border" _last={{ borderBottom: 'none' }} align="baseline">
          <Badge colorScheme={checkTone(c.status)} variant="subtle" fontFamily={MONO} fontSize="9px" minW="40px" textAlign="center" flexShrink={0}>
            {c.status}
          </Badge>
          <Box minW={0}>
            <Text fontSize="xs" fontWeight={600}>
              {c.label}
            </Text>
            <Text fontSize="xs" color="page.fg-secondary" wordBreak="break-word">
              {c.detail}
            </Text>
          </Box>
        </Flex>
      ))}
    </Box>
  )
}

/**
 * Admin → System → Health: the deployed build, runtime, disk, databases,
 * backups, restore drills, error totals and recent warnings (GET
 * /api/admin/system; drills: /api/admin/restore-drill).
 */
export default function HealthPanel({ onShowErrors }: { onShowErrors: () => void }) {
  const toast = useToast()
  const [data, setData] = useState<SystemSnapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [drilling, setDrilling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/system', { cache: 'no-store' })
      const json = await readJsonObject(res)
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
      setData(json as SystemSnapshot)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : NETWORK_ERROR)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runDrill = async () => {
    setDrilling(true)
    try {
      const res = await fetch('/api/admin/restore-drill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const json = await readJsonObject(res)
      if (!res.ok || !json.drill) {
        toast({ status: res.status === 409 || res.status === 429 ? 'warning' : 'error', title: 'Drill did not run', description: typeof json.error === 'string' ? json.error : `HTTP ${res.status}`, duration: 6000 })
        return
      }
      const drill = json.drill as DrillResult
      toast({ status: drill.status === 'failed' ? 'error' : drill.status === 'skipped' ? 'warning' : 'success', title: `Restore drill ${DRILL_LABEL[drill.status]}`, description: drill.summary, duration: 6000 })
      await load()
    } catch {
      toast({ status: 'error', title: 'Drill did not run', description: NETWORK_ERROR })
    } finally {
      setDrilling(false)
    }
  }

  if (error && !data) {
    return (
      <Alert status="error" variant="left-accent" borderRadius="md" bg="page.bg-elevated">
        <AlertIcon />
        <AlertDescription fontSize="sm" flex={1}>
          Couldn’t load the system status ({error}).
        </AlertDescription>
        <Button size="sm" {...outlineButtonProps} onClick={() => void load()}>
          Retry
        </Button>
      </Alert>
    )
  }
  if (!data) {
    return (
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} aria-busy="true" aria-label="Loading the system status">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h="140px" borderRadius="xl" />
        ))}
      </SimpleGrid>
    )
  }

  const now = data.now
  const drill = data.restoreDrill.latest
  const disk = data.disk
  const usedPct = disk ? Math.min(100, Math.max(0, disk.usedPct)) : 0

  return (
    <Box>
      <Flex justify="space-between" align="center" gap={3} flexWrap="wrap" mb={4}>
        <Text fontSize="sm" color="page.fg-secondary">
          Read live from this server at {absoluteTime(now)}.
        </Text>
        <Button size="sm" {...outlineButtonProps} onClick={() => void load()} isLoading={loading}>
          Refresh
        </Button>
      </Flex>

      {data.warnings.length ? (
        <Box as="section" aria-labelledby="system-attention" mb={6}>
          <Text as="h2" id="system-attention" fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary" mb={2}>
            Needs attention
          </Text>
          <Box as="ul" listStyleType="none" border="1px solid" borderColor="page.border" borderRadius="lg">
            {data.warnings.map((w) => (
              <Flex as="li" key={w} align="center" gap={3} px={4} py={2.5} borderBottom="1px solid" borderColor="page.border" _last={{ borderBottom: 'none' }}>
                <WarningTwoIcon color="status.limited" boxSize={3.5} aria-hidden />
                <Text fontSize="sm">{w}</Text>
              </Flex>
            ))}
          </Box>
        </Box>
      ) : (
        <Alert status="success" variant="left-accent" borderRadius="md" bg="page.bg-elevated" mb={6} fontSize="sm">
          <AlertIcon />
          <AlertDescription>Everything checked is fine.</AlertDescription>
        </Alert>
      )}

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <Panel as="section" aria-label="Build and runtime">
          <CardTitle>Build &amp; runtime</CardTitle>
          <SimpleGrid columns={2} gap={4}>
            <Stat label="Release" value={data.release.sha ? <Box as="span" fontFamily={MONO}>{data.release.sha.slice(0, 7)}</Box> : 'local build'} sub={data.release.env} />
            <Stat label="Uptime" value={formatUptime(data.release.uptimeS)} sub={`since ${absoluteTime(data.release.startedAt)}`} />
            <Stat label="Node.js" value={data.release.nodeVersion} />
            <Stat label="Memory" value={formatBytes(data.memory.rssBytes)} sub={`heap ${formatBytes(data.memory.heapUsedBytes)} of ${formatBytes(data.memory.heapTotalBytes)}`} />
          </SimpleGrid>
        </Panel>

        <Panel as="section" aria-label="Disk">
          <CardTitle>Disk</CardTitle>
          {disk ? (
            <>
              <Stat label="Free" value={formatBytes(disk.freeBytes)} sub={`of ${formatBytes(disk.totalBytes)} · ${usedPct}% used`} />
              <Progress value={usedPct} size="sm" mt={3} borderRadius="full" colorScheme={usedPct > 90 ? 'red' : usedPct > 80 ? 'orange' : 'purple'} aria-label={`Disk ${usedPct}% used`} />
              <Text fontSize="xs" color="page.fg-secondary" mt={2} fontFamily={MONO} wordBreak="break-all">
                {disk.path}
              </Text>
            </>
          ) : (
            <Text fontSize="sm" color="page.fg-secondary">
              Not reported on this platform.
            </Text>
          )}
        </Panel>

        <Panel as="section" aria-label="Databases" gridColumn={{ md: 'span 2' }}>
          <CardTitle>Databases</CardTitle>
          <Box as="ul" listStyleType="none" border="1px solid" borderColor="page.border" borderRadius="md">
            {data.databases.map((d) => (
              <Flex as="li" key={d.name} px={3} py={2.5} gap={3} align="center" flexWrap="wrap" borderBottom="1px solid" borderColor="page.border" _last={{ borderBottom: 'none' }}>
                <Box flex="1 1 160px" minW={0}>
                  <Text fontSize="sm" fontWeight={600}>
                    {d.name}
                  </Text>
                  <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary">
                    {d.file}
                  </Text>
                </Box>
                <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="tnum" minW="150px">
                  {formatBytes(d.bytes)} · WAL {formatBytes(d.walBytes)}
                </Text>
                {d.error ? (
                  <Badge colorScheme="red" variant="subtle" fontFamily={MONO} fontSize="9px">
                    {d.error}
                  </Badge>
                ) : d.schema ? (
                  <Badge colorScheme={d.schema.state === 'current' ? 'green' : 'orange'} variant="subtle" fontFamily={MONO} fontSize="9px" title={d.schema.lastAppliedAt ? `last migration ${absoluteTime(d.schema.lastAppliedAt)}` : undefined}>
                    schema v{d.schema.version}/{d.schema.latest} {d.schema.state}
                  </Badge>
                ) : null}
              </Flex>
            ))}
          </Box>
        </Panel>

        <Panel as="section" aria-label="Backups">
          <CardTitle>Backups</CardTitle>
          <SimpleGrid columns={2} gap={4}>
            <Stat
              label="Last backup"
              value={data.backup.lastAt ? relativeTime(data.backup.lastAt, now) : 'none'}
              sub={data.backup.lastOk === false ? 'last attempt failed' : data.backup.lastAt ? absoluteTime(data.backup.lastAt) : undefined}
            />
            <Stat
              label="Schedule"
              value={data.backup.scheduled ? `every ${data.backup.intervalHours} h` : 'manual only'}
              sub={data.backup.nextAt ? `next ${relativeTime(data.backup.nextAt, now)}` : undefined}
            />
            <Stat label="Local snapshots" value={data.backup.localCount} />
            <Stat label="R2 mirror" value={data.r2.configured ? 'configured' : 'not configured'} sub={data.r2.pending ? `${data.r2.pending} pending` : undefined} />
          </SimpleGrid>
          <Button as={NextLink} href="/admin/dashboard?tab=storage" size="xs" mt={4} {...outlineButtonProps}>
            Storage &amp; backups
          </Button>
        </Panel>

        <Panel as="section" aria-labelledby="system-drill">
          <Flex justify="space-between" align="baseline" gap={2} flexWrap="wrap">
            <Text as="h3" id="system-drill" fontSize="sm" fontWeight={600} mb={3}>
              Restore drill
            </Text>
            <Button size="xs" {...outlineButtonProps} onClick={() => void runDrill()} isLoading={drilling} loadingText="Drilling…" isDisabled={data.restoreDrill.schedule.running}>
              Run drill now
            </Button>
          </Flex>
          {drill ? (
            <>
              <Flex align="center" gap={2} flexWrap="wrap">
                <Badge colorScheme={checkTone(drill.status)} variant="subtle" fontFamily={MONO} fontSize="10px">
                  {DRILL_LABEL[drill.status]}
                </Badge>
                <Text fontSize="xs" color="page.fg-secondary" className="tnum">
                  {relativeTime(drill.ranAt, now)} · {drill.trigger} · {formatDuration(drill.durationMs)}
                  {drill.source ? ` · ${drill.source === 'r2' ? 'off-site copy (R2)' : 'local snapshot'}` : ''}
                </Text>
              </Flex>
              <Text fontSize="sm" mt={2}>
                {drill.summary}
              </Text>
              {drill.checks.length ? (
                <Accordion allowToggle mt={2}>
                  <AccordionItem border="none">
                    <AccordionButton px={0} fontSize="xs" color="page.fg-secondary" _hover={{ bg: 'transparent', color: 'page.fg' }}>
                      Checks ({drill.checks.length})
                      <AccordionIcon ml={1} />
                    </AccordionButton>
                    <AccordionPanel px={0} pb={0}>
                      <DrillChecks drill={drill} />
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
              ) : null}
            </>
          ) : (
            <Text fontSize="sm" color="page.fg-secondary">
              No drill has run yet. A drill opens the newest backup in a scratch folder and checks that it would restore; the live site is never touched.
            </Text>
          )}
          <Text fontSize="xs" color="page.fg-secondary" mt={3}>
            {data.restoreDrill.schedule.enabled
              ? `Runs every ${data.restoreDrill.schedule.intervalHours} h${data.restoreDrill.schedule.nextAt ? `, next ${relativeTime(data.restoreDrill.schedule.nextAt, now)}` : ''}.`
              : 'Scheduled drills are off (RESTORE_DRILL_INTERVAL_HOURS=0).'}
          </Text>
        </Panel>

        <Panel as="section" aria-label="Errors">
          <CardTitle>Errors</CardTitle>
          {data.errors ? (
            <SimpleGrid columns={2} gap={4}>
              <Stat label="Open" value={data.errors.open} sub={data.errors.new24h ? `${data.errors.new24h} new in 24 h` : 'none new in 24 h'} />
              <Stat label="Events" value={data.errors.eventsToday} sub={`today · ${data.errors.events7d} in 7 days`} />
            </SimpleGrid>
          ) : (
            <Text fontSize="sm" color="page.fg-secondary">
              The error store is unavailable.
            </Text>
          )}
          <Button size="xs" mt={4} {...outlineButtonProps} onClick={onShowErrors}>
            Open errors
          </Button>
        </Panel>

        <Panel as="section" aria-labelledby="system-logs">
          <Text as="h3" id="system-logs" fontSize="sm" fontWeight={600} mb={3}>
            Recent warnings
          </Text>
          {data.logs.entries.length ? (
            <Box as="ol" listStyleType="none" maxH="320px" overflowY="auto" border="1px solid" borderColor="page.border" borderRadius="md" tabIndex={0} aria-label="Recent warn and error log entries, newest first">
              {data.logs.entries.map((e, i) => (
                <Box as="li" key={`${e.ts}-${i}`} px={3} py={2} borderBottom="1px solid" borderColor="page.border" _last={{ borderBottom: 'none' }}>
                  <Flex gap={2} align="baseline" flexWrap="wrap">
                    <Badge colorScheme={e.level === 'error' ? 'red' : 'orange'} variant="subtle" fontFamily={MONO} fontSize="9px">
                      {e.level}
                    </Badge>
                    <Text fontFamily={MONO} fontSize="10px" color="page.fg-secondary" className="tnum" title={absoluteTime(e.ts)}>
                      {relativeTime(e.ts, now)}
                    </Text>
                    <Text fontSize="xs" fontWeight={600} wordBreak="break-word">
                      {e.msg}
                    </Text>
                  </Flex>
                  {e.fields ? (
                    <Text fontFamily={MONO} fontSize="10px" color="page.fg-secondary" mt={1} wordBreak="break-all" noOfLines={3}>
                      {e.fields}
                    </Text>
                  ) : null}
                </Box>
              ))}
            </Box>
          ) : (
            <Text fontSize="sm" color="page.fg-secondary">
              No warnings since the server started.
            </Text>
          )}
          <Text fontSize="xs" color="page.fg-secondary" mt={2}>
            Kept in memory: {data.logs.total} since the server started, the newest 200 retained.
          </Text>
        </Panel>
      </SimpleGrid>

      <Text fontSize="xs" color="page.fg-secondary" mt={6}>
        Everything here is read from this server; nothing is sent to a monitoring service.
      </Text>
    </Box>
  )
}
