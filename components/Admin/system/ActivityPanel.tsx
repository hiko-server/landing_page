import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Skeleton,
  Text,
  VisuallyHidden,
} from '@chakra-ui/react'
import { SearchIcon, WarningTwoIcon } from '@chakra-ui/icons'
import { MONO, inputProps, outlineButtonProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { NETWORK_ERROR } from '../shell/authMessages'
import { useListKeyboard } from '../shell/useListKeyboard'
import { AUDIT_AREAS, AUDIT_AREA_LABEL } from '../../../lib/audit/describe'
import type { ActivityItem } from '../../../lib/audit/activity'
import { actorLine, clockTime, groupByDay } from './activityFormat'

/**
 * Admin → System → Activity: every change made in the admin — who (the
 * signed-in browser: device, network prefix, country), what and when —
 * merged with sign-ins (GET /api/admin/activity, lib/audit). Searchable,
 * filterable by area, paged by time. j / k move through the entries, Enter
 * opens the page the change was made on.
 */

const AREA_OPTIONS = [...AUDIT_AREAS.filter((a) => a !== 'session'), 'session'] as const
const SEARCH_DEBOUNCE_MS = 250

export default function ActivityPanel() {
  const router = useRouter()
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [areas, setAreas] = useState<Record<string, number>>({})
  const [keepDays, setKeepDays] = useState<number | null>(null)
  const [area, setArea] = useState('')
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const seq = useRef(0)

  useEffect(() => {
    const t = window.setTimeout(() => setQ(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query])

  const fetchPage = useCallback(async (before: number | null) => {
    const params = new URLSearchParams()
    if (area) params.set('area', area)
    if (q) params.set('q', q)
    if (before) params.set('before', String(before))
    const res = await fetch(`/api/admin/activity?${params.toString()}`, { cache: 'no-store' })
    const json = await readJsonObject(res)
    if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
    return json as unknown as { items: ActivityItem[]; nextBefore: number | null; areas: Record<string, number>; keepDays: number }
  }, [area, q])

  const load = useCallback(async () => {
    const mine = ++seq.current
    setError('')
    try {
      const page = await fetchPage(null)
      if (mine !== seq.current) return
      setItems(Array.isArray(page.items) ? page.items : [])
      setNextBefore(typeof page.nextBefore === 'number' ? page.nextBefore : null)
      setAreas(page.areas && typeof page.areas === 'object' ? page.areas : {})
      setKeepDays(typeof page.keepDays === 'number' ? page.keepDays : null)
      setNow(Date.now())
    } catch (err) {
      if (mine !== seq.current) return
      setError(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : NETWORK_ERROR)
    }
  }, [fetchPage])

  useEffect(() => {
    void load()
  }, [load])

  const loadMore = async () => {
    if (!nextBefore) return
    setLoadingMore(true)
    try {
      const page = await fetchPage(nextBefore)
      setItems((list) => [...(list || []), ...(Array.isArray(page.items) ? page.items : [])])
      setNextBefore(typeof page.nextBefore === 'number' ? page.nextBefore : null)
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : NETWORK_ERROR)
    } finally {
      setLoadingMore(false)
    }
  }

  const flat = useMemo(() => items || [], [items])
  const groups = useMemo(() => groupByDay(flat, now), [flat, now])
  const kb = useListKeyboard({
    count: flat.length,
    global: true,
    onOpen: (i) => {
      const href = flat[i]?.href
      if (href) void router.push(href)
    },
  })

  let index = -1
  return (
    <Box>
      <Flex gap={2} mb={4} flexWrap="wrap" align="center">
        <InputGroup size="sm" maxW={{ base: '100%', sm: '320px' }} flex="1 1 220px">
          <InputLeftElement pointerEvents="none">
            <SearchIcon color="page.fg-secondary" boxSize={3} />
          </InputLeftElement>
          <Input
            {...inputProps}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search activity"
            aria-label="Search activity"
            maxLength={80}
          />
        </InputGroup>
        <Select
          size="sm"
          {...inputProps}
          w={{ base: '100%', sm: '220px' }}
          value={area}
          onChange={(e) => setArea(e.target.value)}
          aria-label="Show activity for"
        >
          <option value="">Everything</option>
          {AREA_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {AUDIT_AREA_LABEL[a]}
              {areas[a] ? ` (${areas[a]} in 30 days)` : ''}
            </option>
          ))}
        </Select>
        <Button size="sm" {...outlineButtonProps} onClick={() => void load()} ml={{ sm: 'auto' }}>
          Refresh
        </Button>
      </Flex>

      {error && !items ? (
        <Alert status="error" variant="left-accent" borderRadius="md" bg="page.bg-elevated">
          <AlertIcon />
          <AlertDescription fontSize="sm" flex={1}>
            Couldn’t load the activity ({error}).
          </AlertDescription>
          <Button size="sm" {...outlineButtonProps} onClick={() => void load()}>
            Retry
          </Button>
        </Alert>
      ) : !items ? (
        <Box aria-busy="true" aria-label="Loading activity">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h="52px" borderRadius="md" mb={2} />
          ))}
        </Box>
      ) : items.length === 0 ? (
        <Box border="1px dashed" borderColor="page.border" borderRadius="lg" px={5} py={8} textAlign="center">
          <Text fontSize="sm" fontWeight={600}>
            {q || area ? 'Nothing matches' : 'Nothing recorded yet'}
          </Text>
          <Text fontSize="xs" color="page.fg-secondary" mt={1} maxW="52ch" mx="auto">
            {q || area
              ? 'Try another word or show everything.'
              : 'Every save, publish, restore, delete and setting change made in the admin appears here, with the browser that made it.'}
          </Text>
        </Box>
      ) : (
        <Box {...kb.listProps} data-testid="activity-list">
          {groups.map((g) => (
            <Box key={g.key} mb={4}>
              <Text
                as="h3"
                fontFamily={MONO}
                fontSize="11px"
                letterSpacing="0.12em"
                textTransform="uppercase"
                color="page.fg-secondary"
                pb={1.5}
                mb={1}
                borderBottom="1px solid"
                borderColor="page.border"
              >
                {g.label}
              </Text>
              <Box as="ol" listStyleType="none">
                {g.items.map((item) => {
                  index += 1
                  const i = index
                  const actor = actorLine(item)
                  const failed = item.kind === 'signin-failed'
                  return (
                    <Box as="li" key={item.id}>
                      <Flex
                        as={item.href ? NextLink : 'div'}
                        {...(item.href ? { href: item.href } : {})}
                        {...kb.itemProps(i)}
                        align="baseline"
                        gap={3}
                        px={2}
                        py={2}
                        borderRadius="md"
                        color="inherit"
                        textDecoration="none"
                        _hover={{ bg: 'page.bg-overlay' }}
                        _focusVisible={{ outline: '2px solid', outlineColor: 'accent.500', outlineOffset: '-2px' }}
                        data-activity={item.action}
                      >
                        <Text as="time" dateTime={new Date(item.ts).toISOString()} fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="tnum" flexShrink={0} w="40px">
                          {clockTime(item.ts)}
                        </Text>
                        <Box minW={0} flex={1}>
                          <Text fontSize="sm" fontWeight={500} wordBreak="break-word">
                            {failed ? <WarningTwoIcon color="status.limited" boxSize={3} mr={1.5} mt="-2px" aria-hidden /> : null}
                            {item.summary}
                          </Text>
                          {actor ? (
                            <Text fontSize="xs" color="page.fg-secondary" noOfLines={1}>
                              {actor}
                            </Text>
                          ) : null}
                        </Box>
                        <Text fontSize="10px" fontFamily={MONO} color="page.muted" flexShrink={0} display={{ base: 'none', sm: 'block' }}>
                          {AUDIT_AREA_LABEL[item.area as keyof typeof AUDIT_AREA_LABEL] || item.area}
                        </Text>
                        {item.href ? <VisuallyHidden>(opens the page)</VisuallyHidden> : null}
                      </Flex>
                    </Box>
                  )
                })}
              </Box>
            </Box>
          ))}
          {nextBefore ? (
            <Flex justify="center" mt={2}>
              <Button size="sm" {...outlineButtonProps} onClick={() => void loadMore()} isLoading={loadingMore} loadingText="Loading">
                Show older activity
              </Button>
            </Flex>
          ) : null}
        </Box>
      )}

      {error && items ? (
        <Text role="alert" fontSize="xs" color="red.500" _dark={{ color: 'red.300' }} mt={2}>
          {error}
        </Text>
      ) : null}
      <Text fontSize="xs" color="page.fg-secondary" mt={4} maxW="70ch">
        Recorded on this server only{keepDays ? ` and kept for ${keepDays} days` : ''}: the action, the time, and the browser that made it
        (device type, network prefix, country — never the full address). Sign-ins come from the sign-in history on the
        Security page. <Text as="span" fontFamily={MONO}>↑ ↓</Text> (or <Text as="span" fontFamily={MONO}>j</Text> /{' '}
        <Text as="span" fontFamily={MONO}>k</Text>) move through the list, <Text as="span" fontFamily={MONO}>Enter</Text> opens an entry.
      </Text>
    </Box>
  )
}
