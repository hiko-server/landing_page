import { useCallback, useEffect, useState } from 'react'
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
  Code,
  Flex,
  Skeleton,
  Text,
  useToast,
} from '@chakra-ui/react'
import type { ErrorListItem, ErrorStatus, ErrorTotals } from '../../../lib/errors/store'
import { MONO, outlineButtonProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { NETWORK_ERROR } from '../shell/authMessages'
import SegmentedTabs, { tabPanelProps, type SegmentedItem } from '../shell/SegmentedTabs'
import { absoluteTime, relativeTime } from '../security/securityFormat'
import { browserTally, kindLabel, seriesTotal, sourceLabel, sparkHeights } from './systemFormat'

type Filter = ErrorStatus | 'all'
const FILTERS: Filter[] = ['open', 'resolved', 'ignored', 'all']
const FILTER_LABEL: Record<Filter, string> = { open: 'Open', resolved: 'Resolved', ignored: 'Ignored', all: 'All' }

/** 14 bars, decorative: the count is in the text next to it. */
function Sparkline({ series }: { series: number[] }) {
  const heights = sparkHeights(series)
  const w = 3
  const gap = 2
  const h = 22
  return (
    <Box as="svg" viewBox={`0 0 ${heights.length * (w + gap)} ${h}`} w={`${heights.length * (w + gap)}px`} h={`${h}px`} aria-hidden flexShrink={0} color="accent.500">
      {heights.map((v, i) => (
        <rect key={i} x={i * (w + gap)} y={h - Math.max(1, v * h)} width={w} height={Math.max(1, v * h)} rx={1} fill="currentColor" opacity={v > 0 ? 1 : 0.25} />
      ))}
    </Box>
  )
}

const SOURCE_TONE: Record<string, string> = { client: 'purple', server: 'red', csp: 'orange' }

/**
 * Admin → System → Errors: browser errors, server errors and CSP violations,
 * grouped by fingerprint (GET/PATCH/DELETE /api/admin/errors). A resolved
 * error that happens again reopens by itself and is marked "regressed".
 */
export default function ErrorsPanel() {
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('open')
  const [errors, setErrors] = useState<ErrorListItem[] | null>(null)
  const [totals, setTotals] = useState<ErrorTotals | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async (f: Filter) => {
    try {
      const res = await fetch(`/api/admin/errors?status=${f}`, { cache: 'no-store' })
      const json = await readJsonObject(res)
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
      setErrors(Array.isArray(json.errors) ? (json.errors as ErrorListItem[]) : [])
      setTotals((json.totals as ErrorTotals) || null)
      setNow(Date.now())
      setLoadError('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : NETWORK_ERROR)
    }
  }, [])

  useEffect(() => {
    setErrors(null)
    void load(filter)
  }, [filter, load])

  const change = async (method: 'PATCH' | 'DELETE', body: Record<string, unknown>, key: string, done: string) => {
    setBusy(key)
    try {
      const res = await fetch('/api/admin/errors', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await readJsonObject(res)
      if (!res.ok) {
        toast({ status: 'error', title: 'Not changed', description: typeof json.error === 'string' ? json.error : `HTTP ${res.status}` })
        return
      }
      toast({ status: 'success', title: done })
      await load(filter)
    } catch {
      toast({ status: 'error', title: 'Not changed', description: NETWORK_ERROR })
    } finally {
      setBusy(null)
    }
  }

  const items: SegmentedItem<Filter>[] = FILTERS.map((f) => ({
    key: f,
    label: totals && f !== 'all' ? `${FILTER_LABEL[f]} (${totals[f]})` : FILTER_LABEL[f],
  }))

  return (
    <Box>
      <Flex justify="space-between" align="center" gap={3} flexWrap="wrap" mb={4}>
        <SegmentedTabs items={items} value={filter} onSelect={setFilter} label="Errors by status" idPrefix="errfilter" size="sm" />
        <Flex gap={2} flexWrap="wrap">
          {filter === 'resolved' && errors?.length ? (
            <Button size="sm" {...outlineButtonProps} isLoading={busy === 'clear'} onClick={() => void change('DELETE', { resolved: true }, 'clear', 'Resolved errors deleted')}>
              Delete resolved
            </Button>
          ) : null}
          <Button size="sm" {...outlineButtonProps} onClick={() => void load(filter)}>
            Refresh
          </Button>
        </Flex>
      </Flex>
      {totals ? (
        <Text fontSize="xs" color="page.fg-secondary" mb={3} className="tnum">
          {totals.eventsToday} event{totals.eventsToday === 1 ? '' : 's'} today · {totals.events7d} in 7 days
          {totals.droppedToday ? ` · ${totals.droppedToday} dropped by the limits today` : ''}
        </Text>
      ) : null}

      <Box {...tabPanelProps('errfilter', filter)}>
        {loadError && !errors ? (
          <Alert status="error" variant="left-accent" borderRadius="md" bg="page.bg-elevated">
            <AlertIcon />
            <AlertDescription fontSize="sm" flex={1}>
              Couldn’t load the errors ({loadError}).
            </AlertDescription>
            <Button size="sm" {...outlineButtonProps} onClick={() => void load(filter)}>
              Retry
            </Button>
          </Alert>
        ) : !errors ? (
          <Box aria-busy="true" aria-label="Loading errors">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h="64px" borderRadius="lg" mb={2} />
            ))}
          </Box>
        ) : errors.length === 0 ? (
          <Box border="1px dashed" borderColor="page.border" borderRadius="lg" px={5} py={8} textAlign="center">
            <Text fontSize="sm" fontWeight={600}>
              {filter === 'open' ? 'No open errors' : `No ${FILTER_LABEL[filter].toLowerCase()} errors`}
            </Text>
            <Text fontSize="xs" color="page.fg-secondary" mt={1} maxW="52ch" mx="auto">
              Errors in visitors’ browsers, server errors and Content-Security-Policy violations appear here, grouped by cause — without addresses, cookies or query strings.
            </Text>
          </Box>
        ) : (
          <Accordion allowMultiple as="ul" listStyleType="none" border="1px solid" borderColor="page.border" borderRadius="lg">
            {errors.map((e) => {
              const total14 = seriesTotal(e.daily)
              return (
                <AccordionItem as="li" key={e.fingerprint} borderColor="page.border" _first={{ borderTop: 'none' }} _last={{ borderBottom: 'none' }}>
                  <h3>
                    <AccordionButton px={{ base: 3, md: 4 }} py={3} gap={3} alignItems="flex-start" _hover={{ bg: 'page.bg-overlay' }}>
                      <Box flex={1} minW={0} textAlign="left">
                        <Flex gap={2} align="center" flexWrap="wrap" mb={1}>
                          <Badge colorScheme={SOURCE_TONE[e.source] || 'gray'} variant="subtle" fontFamily={MONO} fontSize="9px">
                            {sourceLabel(e.source)}
                          </Badge>
                          <Text as="span" fontFamily={MONO} fontSize="10px" color="page.fg-secondary">
                            {kindLabel(e.kind)}
                          </Text>
                          {e.regressedAt && e.status === 'open' ? (
                            <Badge colorScheme="red" variant="outline" fontFamily={MONO} fontSize="9px">
                              regressed
                            </Badge>
                          ) : null}
                          {e.status !== 'open' ? (
                            <Badge variant="outline" fontFamily={MONO} fontSize="9px">
                              {e.status}
                            </Badge>
                          ) : null}
                        </Flex>
                        <Text fontSize="sm" fontWeight={600} noOfLines={2} wordBreak="break-word">
                          {e.name && !e.message.startsWith(e.name) ? `${e.name}: ` : ''}
                          {e.message}
                        </Text>
                        <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" mt={0.5} noOfLines={1} className="tnum">
                          {[e.path, e.route].filter(Boolean).join(' · ') || '—'} · last {relativeTime(e.lastSeen, now)}
                        </Text>
                      </Box>
                      <Flex direction="column" align="flex-end" gap={1} flexShrink={0}>
                        <Text fontFamily={MONO} fontSize="sm" fontWeight={600} className="tnum">
                          ×{e.count}
                        </Text>
                        <Sparkline series={e.daily} />
                        <Text srOnly>{`${total14} events in the last 14 days`}</Text>
                      </Flex>
                      <AccordionIcon mt={1} />
                    </AccordionButton>
                  </h3>
                  <AccordionPanel px={{ base: 3, md: 4 }} pb={4}>
                    <Flex gap={4} flexWrap="wrap" fontSize="xs" color="page.fg-secondary" className="tnum" mb={3}>
                      <Text>First seen {absoluteTime(e.firstSeen)}</Text>
                      <Text>Last seen {absoluteTime(e.lastSeen)}</Text>
                      {e.firstRelease || e.lastRelease ? (
                        <Text>
                          Build {e.firstRelease?.slice(0, 7) || '?'}
                          {e.lastRelease && e.lastRelease !== e.firstRelease ? ` → ${e.lastRelease.slice(0, 7)}` : ''}
                        </Text>
                      ) : null}
                      {Object.keys(e.browsers).length ? <Text>{browserTally(e.browsers)}</Text> : null}
                    </Flex>
                    {e.stack ? (
                      <Code
                        as="pre"
                        display="block"
                        whiteSpace="pre"
                        overflowX="auto"
                        fontSize="11px"
                        p={3}
                        borderRadius="md"
                        bg="page.bg"
                        border="1px solid"
                        borderColor="page.border"
                        maxH="260px"
                        tabIndex={0}
                        aria-label="Stack trace"
                      >
                        {e.stack}
                      </Code>
                    ) : (
                      <Text fontSize="xs" color="page.fg-secondary">
                        No stack trace was reported.
                      </Text>
                    )}
                    <Flex gap={2} mt={3} flexWrap="wrap">
                      {e.status !== 'resolved' ? (
                        <Button size="xs" {...outlineButtonProps} isLoading={busy === `res:${e.fingerprint}`} onClick={() => void change('PATCH', { fingerprints: [e.fingerprint], status: 'resolved' }, `res:${e.fingerprint}`, 'Marked resolved')}>
                          Resolve
                        </Button>
                      ) : null}
                      {e.status !== 'open' ? (
                        <Button size="xs" {...outlineButtonProps} isLoading={busy === `open:${e.fingerprint}`} onClick={() => void change('PATCH', { fingerprints: [e.fingerprint], status: 'open' }, `open:${e.fingerprint}`, 'Reopened')}>
                          Reopen
                        </Button>
                      ) : null}
                      {e.status !== 'ignored' ? (
                        <Button size="xs" variant="ghost" isLoading={busy === `ign:${e.fingerprint}`} onClick={() => void change('PATCH', { fingerprints: [e.fingerprint], status: 'ignored' }, `ign:${e.fingerprint}`, 'Ignored — it stays counted but never reopens')}>
                          Ignore
                        </Button>
                      ) : null}
                      <Button size="xs" variant="ghost" color="red.400" isLoading={busy === `del:${e.fingerprint}`} onClick={() => void change('DELETE', { fingerprints: [e.fingerprint] }, `del:${e.fingerprint}`, 'Deleted')}>
                        Delete
                      </Button>
                    </Flex>
                    <Text fontFamily={MONO} fontSize="10px" color="page.muted" mt={3}>
                      fingerprint {e.fingerprint}
                    </Text>
                  </AccordionPanel>
                </AccordionItem>
              )
            })}
          </Accordion>
        )}
      </Box>
    </Box>
  )
}
