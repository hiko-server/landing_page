import { useCallback, useEffect, useMemo, useState } from 'react'
import NextLink from 'next/link'
import { Badge, Box, Button, Flex, Skeleton, Stack, Text } from '@chakra-ui/react'
import { SectionLabel, MONO } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { bothZones, relativeInstant } from '../shell/itemSchedule'
import { parseReviewLink, parseReviewLinks, type ReviewLinkRow } from '../shell/reviewLinks'
import { ReviewLinkItem } from '../editor/ReviewLinksDialog'
import { localTimeZone, zonedDay, formatInstant, SCHEDULE_TIME_ZONE } from '../../../lib/schedule/time'

/**
 * Admin → Scheduled & review links (H5): everything that will publish,
 * go live as changes or unpublish on its own — grouped by day in Hong Kong
 * time, with this device's time when it differs — the scheduler's state,
 * and every active review link with Copy and Turn off. Times are set in
 * the editors (Publish… → Schedule…, Share for review…).
 */

type Kind = 'publish' | 'publish-changes' | 'unpublish'
type Entry = { collection: 'blog' | 'work'; slug: string; title: string; kind: Kind; at: number }
type SchedulerState = { running: boolean; nextCheckAt: number | null; lastPassAt: number | null; lastPassOk: boolean | null; lastError: string | null }

const KIND: Record<Kind, { label: string; scheme: string }> = {
  publish: { label: 'Publishes', scheme: 'green' },
  'publish-changes': { label: 'Changes go live', scheme: 'purple' },
  unpublish: { label: 'Unpublishes', scheme: 'orange' },
}

const isKind = (v: unknown): v is Kind => v === 'publish' || v === 'publish-changes' || v === 'unpublish'

function parseEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .filter((e) => (e.collection === 'blog' || e.collection === 'work') && typeof e.slug === 'string' && isKind(e.kind) && typeof e.at === 'number')
    .map((e) => ({ collection: e.collection as 'blog' | 'work', slug: e.slug as string, title: typeof e.title === 'string' ? e.title : (e.slug as string), kind: e.kind as Kind, at: e.at as number }))
}

/** "Today", "Tomorrow", else "Sun 25 Oct 2026" — days in Hong Kong time. */
function dayHeading(day: string, now: number): string {
  const today = zonedDay(now)
  const tomorrow = zonedDay(now + 86_400_000)
  if (day === today) return 'Today'
  if (day === tomorrow) return 'Tomorrow'
  const [y, m, d] = day.split('-').map(Number)
  return formatInstant(Date.UTC(y, m - 1, d, 4), SCHEDULE_TIME_ZONE).replace(/, \d{2}:\d{2}$/, '')
}

export default function PublishingOverview() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [scheduler, setScheduler] = useState<SchedulerState | null>(null)
  const [links, setLinks] = useState<ReviewLinkRow[] | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const zone = useMemo(() => localTimeZone(), [])

  const load = useCallback(async () => {
    setError('')
    try {
      const [a, b] = await Promise.all([fetch('/api/admin/publishing', { cache: 'no-store' }), fetch('/api/admin/review-links', { cache: 'no-store' })])
      const [pa, pb] = await Promise.all([readJsonObject(a), readJsonObject(b)])
      if (!a.ok) throw new Error(pa.error || `HTTP ${a.status}`)
      if (!b.ok) throw new Error(pb.error || `HTTP ${b.status}`)
      setEntries(parseEntries(pa.scheduled))
      setScheduler(pa.scheduler && typeof pa.scheduler === 'object' ? (pa.scheduler as SchedulerState) : null)
      setLinks(parseReviewLinks(pb.links))
      setNow(Date.now())
    } catch (e) {
      setError(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'network error')
    }
  }, [])

  useEffect(() => {
    void load()
    // Keep "in 3 h" current, and pick up what the scheduler did.
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    const refresh = setInterval(() => void load(), 120_000)
    return () => {
      clearInterval(tick)
      clearInterval(refresh)
    }
  }, [load])

  const groups = useMemo(() => {
    const out: Array<{ day: string; items: Entry[] }> = []
    for (const e of entries || []) {
      const day = zonedDay(Math.max(e.at, 0))
      const last = out[out.length - 1]
      if (last && last.day === day) last.items.push(e)
      else out.push({ day, items: [e] })
    }
    return out
  }, [entries])

  const revoke = async (id: string) => {
    const res = await fetch('/api/admin/review-links', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    const data = await readJsonObject(res)
    if (!res.ok) {
      setError(data.error || `HTTP ${res.status}`)
      return false
    }
    const updated = parseReviewLink(data.link)
    setLinks((l) => (l || []).map((x) => (x.id === id ? (updated ?? { ...x, status: 'revoked' as const, path: null }) : x)))
    return true
  }

  return (
    <Stack spacing={0}>
      {error ? (
        <Text fontSize="sm" color="status.error" role="alert" mb={4}>
          Couldn’t load everything ({error}).{' '}
          <Button size="xs" variant="link" color="accent.text" onClick={() => void load()}>
            Retry
          </Button>
        </Text>
      ) : null}

      <SectionLabel
        index={1}
        id="scheduled-heading"
        title="Scheduled"
        hint="Drafts that publish, changes that go live and items that unpublish on their own — the server does it on time, and catches up after a restart. Times are Hong Kong time."
      />
      <Box as="section" aria-labelledby="scheduled-heading" mb={10}>
        {entries === null && !error ? (
          <Stack spacing={2}>
            <Skeleton h="44px" />
            <Skeleton h="44px" />
          </Stack>
        ) : !entries?.length ? (
          <Text fontSize="sm" color="page.fg-secondary" data-testid="schedule-empty">
            Nothing is scheduled. In a draft, choose <strong>Publish…</strong> → <strong>Schedule…</strong> to publish it later; on a live item, ⋯ → <strong>Schedule…</strong>.
          </Text>
        ) : (
          <Stack spacing={5} data-testid="schedule-list">
            {groups.map((g) => (
              <Box key={g.day}>
                <Text fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary" mb={1}>
                  {dayHeading(g.day, now)}
                </Text>
                <Box as="ul">
                  {g.items.map((e) => {
                    const z = bothZones(e.at, zone)
                    const k = KIND[e.kind]
                    return (
                      <Flex as="li" key={`${e.collection}:${e.slug}:${e.kind}`} listStyleType="none" align={{ base: 'flex-start', sm: 'center' }} direction={{ base: 'column', sm: 'row' }} gap={{ base: 1, sm: 4 }} py={2.5} borderTop="1px solid" borderColor="page.border">
                        <Box w={{ sm: '200px' }} flexShrink={0}>
                          <Text fontSize="sm" fontWeight={600} className="tnum">
                            {z.site.replace(/^.*, /, '')}
                          </Text>
                          <Text fontSize="xs" color="page.fg-secondary" className="tnum">
                            {e.at <= now ? 'due now' : relativeInstant(e.at, now)}
                            {z.local ? ` · ${z.local}` : ''}
                          </Text>
                        </Box>
                        <Flex align="center" gap={2} minW={0} flex={1} wrap="wrap">
                          <Badge colorScheme={k.scheme} variant="subtle" fontSize="9px">
                            {k.label}
                          </Badge>
                          <Text as={NextLink} href={`/admin/${e.collection}/edit?slug=${encodeURIComponent(e.slug)}`} fontSize="sm" className="link-underline" minW={0}>
                            {e.title}
                          </Text>
                          <Text as="span" fontSize="xs" color="page.fg-secondary">
                            {e.collection === 'blog' ? 'Post' : 'Case study'}
                          </Text>
                        </Flex>
                      </Flex>
                    )
                  })}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
        {scheduler ? (
          <Text fontSize="xs" color="page.fg-secondary" mt={4} data-testid="scheduler-status">
            {scheduler.running
              ? `Scheduler running${scheduler.nextCheckAt ? ` · next check ${relativeInstant(scheduler.nextCheckAt, now)}` : ''}`
              : 'The scheduler is not running in this server process — scheduled items will be published once it starts.'}
            {scheduler.lastPassAt ? ` · last pass ${relativeInstant(scheduler.lastPassAt, now)}${scheduler.lastPassOk === false ? ' (failed — it retries on its own)' : ''}` : ''}
            {' · '}
            <Text as={NextLink} href="/admin/system?view=activity" className="link-underline">
              What it did: Activity
            </Text>
          </Text>
        ) : null}
      </Box>

      <SectionLabel
        index={2}
        id="review-heading"
        title="Review links"
        hint="Private links to a draft or to unpublished changes, read-only, each with its own expiry. Make them in an editor: ⋯ → Share for review…"
      />
      <Box as="section" aria-labelledby="review-heading">
        {links === null && !error ? (
          <Skeleton h="56px" />
        ) : !links?.length ? (
          <Text fontSize="sm" color="page.fg-secondary" data-testid="review-empty">
            No active review links.
          </Text>
        ) : (
          // The section label above already draws the rule over the first link.
          <Box as="ul" data-testid="review-list" sx={{ '& > li:first-of-type': { borderTop: 'none', pt: 0 } }}>
            {links.map((l) => (
              <ReviewLinkItem key={l.id} link={l} now={now} onRevoke={revoke} showItem />
            ))}
          </Box>
        )}
      </Box>
    </Stack>
  )
}
