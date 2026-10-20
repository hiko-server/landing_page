import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  Box,
  Button,
  Flex,
  Grid,
  IconButton,
  Link,
  Select,
  Skeleton,
  Text,
  VisuallyHidden,
  useToast,
} from '@chakra-ui/react'
import {
  CheckCircleIcon,
  ExternalLinkIcon,
  InfoOutlineIcon,
  WarningTwoIcon,
} from '@chakra-ui/icons'
import { MONO, inputProps, outlineButtonProps, primaryButtonProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { NETWORK_ERROR } from '../shell/authMessages'
import { useListKeyboard } from '../shell/useListKeyboard'
import { useAdminCommands } from '../shell/useAdminCommands'
import { relativeTime } from '../security/securityFormat'
import { cssTransition } from '../../../theme/tokens'
import {
  CHECK_LABEL,
  FIX_LABEL,
  ITEM_KIND_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  type FixResponse,
  type HealthIssue,
  type HealthReport,
  type LinkHealth,
  type Severity,
} from '../../../lib/contentHealth/types'
import {
  NO_FILTER,
  checkOptions,
  countsLine,
  filterIssues,
  fixSummary,
  groupIssues,
  isFiltered,
  itemsTouched,
  linkStatusLine,
  shortUrl,
  type IssueFilter,
} from './contentHealthFormat'

/**
 * Admin → System → Content: the content health center (GET/POST
 * /api/admin/content-health, lib/contentHealth). Every published post, case
 * study and page, the CV and the home page, checked for broken and moved
 * links, tracking parameters, missing, remote or heavy images, alt text,
 * heading structure, hard line breaks and descriptions. Safe problems have a
 * one-click fix that saves like an editor save (undoable in the item's
 * history); "Apply all safe fixes" runs the ones in view after a
 * confirmation. j / k move through the issues, Enter opens the editor, f
 * applies the focused issue's fix (single-key shortcuts can be switched off).
 */

const POLL_MS = 1500
const MAX_DEFERRED_ROUNDS = 6

const SEVERITY_COLOR: Record<Severity, string> = {
  error: 'status.error',
  warning: 'status.warning',
  notice: 'page.fg-secondary',
}

function SeverityIcon({ severity, boxSize = 3.5 }: { severity: Severity; boxSize?: number }) {
  const Icon = severity === 'notice' ? InfoOutlineIcon : WarningTwoIcon
  return <Icon color={SEVERITY_COLOR[severity]} boxSize={boxSize} aria-hidden flexShrink={0} />
}

type LinkState = Pick<LinkHealth, 'running' | 'progress' | 'lastRun' | 'nextAt' | 'intervalHours'>

function fixToast(out: FixResponse): {
  status: 'success' | 'warning' | 'info'
  title: string
  description?: string
} {
  const failed = out.results.filter((r) => !r.ok)
  const live = out.revalidated.length
    ? `Refreshed ${out.revalidated.slice(0, 4).join(', ')}${out.revalidated.length > 4 ? ` and ${out.revalidated.length - 4} more` : ''}.`
    : ''
  if (!out.applied) {
    return {
      status: 'info',
      title: 'Already fixed',
      description: 'Those problems are no longer there.',
    }
  }
  if (failed.length) {
    return {
      status: 'warning',
      title: `Applied ${out.applied} of ${out.applied + failed.length} fixes`,
      description: failed[0].error || 'Some fixes could not be applied.',
    }
  }
  return {
    status: 'success',
    title: out.applied === 1 ? 'Fixed' : `Applied ${out.applied} fixes`,
    description: live || undefined,
  }
}

export default function ContentHealthPanel() {
  const router = useRouter()
  const toast = useToast()
  const [report, setReport] = useState<HealthReport | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<IssueFilter>(NO_FILTER)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkRunning, setBulkRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [linkState, setLinkState] = useState<LinkState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const cancelRef = useRef<HTMLButtonElement>(null)
  const seq = useRef(0)

  const load = useCallback(async (quiet = false) => {
    const mine = ++seq.current
    if (quiet) setRefreshing(true)
    try {
      const res = await fetch('/api/admin/content-health', { cache: 'no-store' })
      const json = await readJsonObject(res)
      if (!res.ok)
        throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
      if (mine !== seq.current) return
      const next = json as unknown as HealthReport
      setReport(next)
      setLinkState(next.links)
      setNow(Date.now())
      setError('')
    } catch (err) {
      if (mine !== seq.current) return
      setError(
        err instanceof Error && err.message !== 'Failed to fetch' ? err.message : NETWORK_ERROR
      )
    } finally {
      if (mine === seq.current) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // While a link check runs, follow its progress; reload the report when it ends.
  const running = !!linkState?.running
  useEffect(() => {
    if (!running) return
    let stop = false
    let finished = false
    const t = window.setInterval(async () => {
      try {
        const res = await fetch('/api/admin/content-health?links=1', { cache: 'no-store' })
        const json = (await readJsonObject(res)) as LinkState
        if (stop || finished || !res.ok) return
        setLinkState(json)
        if (!json.running) {
          finished = true
          window.clearInterval(t)
          const run = json.lastRun
          await load(true)
          if (run) {
            toast({
              status: run.error ? 'error' : 'success',
              title: run.error ? 'Link check failed' : 'Link check finished',
              description:
                run.error ||
                `${run.checked} link${run.checked === 1 ? '' : 's'} checked${run.partial ? '; the rest follow in the next run' : ''}.`,
            })
          }
        }
      } catch {
        // A missed poll is retried on the next tick.
      }
    }, POLL_MS)
    return () => {
      stop = true
      window.clearInterval(t)
    }
  }, [running, load, toast])

  const checkLinks = async () => {
    setStarting(true)
    try {
      const res = await fetch('/api/admin/content-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-links' }),
      })
      const json = await readJsonObject(res)
      if (json.links && typeof json.links === 'object') setLinkState(json.links as LinkState)
      if (!res.ok && res.status !== 409) {
        toast({
          status: res.status === 429 ? 'warning' : 'error',
          title: 'Link check did not start',
          description: typeof json.error === 'string' ? json.error : `HTTP ${res.status}`,
        })
      }
    } catch {
      toast({ status: 'error', title: 'Link check did not start', description: NETWORK_ERROR })
    } finally {
      setStarting(false)
    }
  }

  const postFixes = useCallback(
    async (
      issues: readonly HealthIssue[]
    ): Promise<{ status: number; out: FixResponse & { error?: string } }> => {
      const versions = report?.items || {}
      const res = await fetch('/api/admin/content-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fix',
          fixes: issues.map((i) => ({ id: i.id, version: versions[i.item]?.version })),
        }),
      })
      const json = await readJsonObject(res)
      const out = {
        results: Array.isArray(json.results) ? json.results : [],
        applied: typeof json.applied === 'number' ? json.applied : 0,
        revalidated: Array.isArray(json.revalidated) ? json.revalidated : [],
        ...(typeof json.error === 'string' ? { error: json.error } : {}),
      } as FixResponse & { error?: string }
      return { status: res.status, out }
    },
    [report]
  )

  const runFixes = useCallback(
    async (issues: readonly HealthIssue[]) => {
      const ids = new Set(issues.map((i) => i.id))
      setBusy((prev) => new Set([...prev, ...ids]))
      try {
        let pending = issues.slice()
        let total: FixResponse = { results: [], applied: 0, revalidated: [] }
        let last: { status: number; out: FixResponse & { error?: string } } | null = null
        for (let round = 0; round < MAX_DEFERRED_ROUNDS && pending.length; round++) {
          last = await postFixes(pending)
          if (last.status === 401) {
            toast({
              status: 'error',
              title: 'Signed out',
              description: 'Sign in again to apply fixes.',
            })
            return
          }
          if (last.status >= 400 && last.status !== 409 && last.status !== 422) {
            toast({
              status: last.status === 429 ? 'warning' : 'error',
              title: 'Nothing was fixed',
              description: last.out.error || `HTTP ${last.status}`,
            })
            return
          }
          const deferred = new Set(
            last.out.results.filter((r) => r.code === 'DEFERRED').map((r) => r.id)
          )
          total = {
            results: [...total.results, ...last.out.results.filter((r) => !deferred.has(r.id))],
            applied: total.applied + last.out.applied,
            revalidated: Array.from(new Set([...total.revalidated, ...last.out.revalidated])),
          }
          pending = pending.filter((i) => deferred.has(i.id))
        }
        const conflict = total.results.find((r) => r.code === 'VERSION_CONFLICT')
        if (!total.applied && conflict) {
          toast({ status: 'warning', title: 'Changed elsewhere', description: conflict.error })
        } else if (!total.applied && total.results.some((r) => !r.ok)) {
          toast({
            status: 'error',
            title: 'Nothing was fixed',
            description: total.results.find((r) => !r.ok)?.error || last?.out.error,
          })
        } else {
          toast(fixToast(total))
        }
        await load(true)
      } catch {
        toast({ status: 'error', title: 'Nothing was fixed', description: NETWORK_ERROR })
      } finally {
        setBusy((prev) => {
          const next = new Set(prev)
          ids.forEach((id) => next.delete(id))
          return next
        })
      }
    },
    [postFixes, toast, load]
  )

  const issues = useMemo(() => report?.issues || [], [report])
  const visible = useMemo(() => filterIssues(issues, filter), [issues, filter])
  const groups = useMemo(() => groupIssues(report?.items || {}, visible), [report, visible])
  const flat = useMemo(() => groups.flatMap((g) => g.issues), [groups])
  const fixable = useMemo(() => visible.filter((i) => i.fix), [visible])
  const summary = useMemo(() => fixSummary(fixable), [fixable])
  const itemOptions = useMemo(() => {
    if (!report) return []
    const n = new Map<string, number>()
    for (const i of issues) n.set(i.item, (n.get(i.item) || 0) + 1)
    return Array.from(n.entries())
      .map(([key, count]) => ({
        key,
        count,
        title: report.items[key]?.title || key,
        kind: report.items[key]?.kind,
      }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [report, issues])

  // A filter whose item or check has no issues left (everything there was fixed) resets,
  // so the menus never hold a value they no longer list.
  useEffect(() => {
    if (!report) return
    setFilter((f) => {
      const itemGone = !!f.item && !issues.some((i) => i.item === f.item)
      const checkGone = !!f.check && !issues.some((i) => i.check === f.check)
      if (!itemGone && !checkGone) return f
      return { ...f, item: itemGone ? '' : f.item, check: checkGone ? '' : f.check }
    })
  }, [report, issues])

  const kb = useListKeyboard({
    count: flat.length,
    global: true,
    actions: ['f'],
    onOpen: (i) => {
      const href = report?.items[flat[i]?.item]?.editHref
      if (href) void router.push(href)
    },
    onAction: (key, i) => {
      const issue = flat[i]
      if (key === 'f' && issue?.fix && !busy.has(issue.id)) void runFixes([issue])
    },
  })

  // ⌘K: the content health actions while this view is open (H14).
  useAdminCommands(
    'content-health',
    [
      { id: 'check-links', label: running ? 'Link check running…' : 'Check links now', hint: 'external links of every published page', keywords: 'content health links broken check', run: () => {
        if (!running) void checkLinks()
      } },
      ...(fixable.length ? [{ id: 'fix-all', label: `Apply ${fixable.length} safe content fix${fixable.length === 1 ? '' : 'es'}`, keywords: 'content health fix all tracking images', run: () => setBulkOpen(true) }] : []),
    ],
    `${running ? 1 : 0}|${fixable.length}`,
  )

  const toggleSeverity = (s: Severity) =>
    setFilter((f) => ({ ...f, severity: f.severity === s ? null : s }))

  if (error && !report) {
    return (
      <Alert status="error" variant="left-accent" borderRadius="md" bg="page.bg-elevated">
        <AlertIcon />
        <AlertDescription fontSize="sm" flex={1}>
          Couldn’t load the content health report ({error}).
        </AlertDescription>
        <Button size="sm" {...outlineButtonProps} onClick={() => void load()}>
          Retry
        </Button>
      </Alert>
    )
  }
  if (!report) {
    return (
      <Box aria-busy="true" aria-label="Loading the content health report">
        <Grid
          templateColumns={{
            base: 'repeat(3, minmax(0, 1fr))',
            md: 'repeat(3, minmax(0, 1fr)) minmax(0, 1.6fr)',
          }}
          gap={3}
          mb={6}
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              h={{ base: i === 3 ? '112px' : '88px', md: '120px' }}
              borderRadius="card"
              gridColumn={i === 3 ? { base: 'span 3', md: 'auto' } : undefined}
            />
          ))}
        </Grid>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h="64px" borderRadius="card" mb={2} />
        ))}
      </Box>
    )
  }

  const links = { ...report.links, ...(linkState || {}) }
  const progress =
    links.running && links.progress && links.progress.total
      ? Math.round((links.progress.done / links.progress.total) * 100)
      : null
  const healthy = issues.length === 0
  let index = -1

  return (
    <Box>
      {/* Summary */}
      <Box as="section" aria-labelledby="ch-summary" mb={6}>
        <VisuallyHidden as="h2" id="ch-summary">
          Summary
        </VisuallyHidden>
        <Grid
          templateColumns={{
            base: 'repeat(3, minmax(0, 1fr))',
            md: 'repeat(3, minmax(0, 1fr)) minmax(0, 1.6fr)',
          }}
          gap={3}
        >
          {SEVERITIES.map((s) => {
            const n = report.counts[s]
            const pressed = filter.severity === s
            return (
              <Box
                key={s}
                as="button"
                type="button"
                onClick={() => toggleSeverity(s)}
                aria-pressed={pressed}
                title={
                  pressed
                    ? 'Show every severity'
                    : `Show only ${SEVERITY_LABEL[s].many.toLowerCase()}`
                }
                textAlign="left"
                p={{ base: 3, md: 4 }}
                minH="88px"
                border="1px solid"
                borderColor={pressed ? 'accent.500' : 'page.border'}
                bg={pressed ? 'page.bg-elevated' : 'page.bg'}
                borderRadius="card"
                transition={cssTransition(['background-color', 'border-color'], 'fast')}
                _hover={{ bg: 'page.bg-elevated' }}
                _focusVisible={{
                  outline: '2px solid',
                  outlineColor: 'accent.500',
                  outlineOffset: '2px',
                }}
                data-severity={s}
              >
                <Text textStyle="label" color="page.fg-secondary">
                  {SEVERITY_LABEL[s].many}
                </Text>
                <Flex align="center" gap={2} mt={2}>
                  {n ? (
                    <SeverityIcon severity={s} boxSize={3.5} />
                  ) : (
                    <CheckCircleIcon color="status.open" boxSize={3.5} aria-hidden />
                  )}
                  <Text
                    textStyle="stat"
                    fontSize="title-lg"
                    className="tnum"
                    color={n ? 'page.fg' : 'page.fg-secondary'}
                  >
                    {n}
                  </Text>
                </Flex>
              </Box>
            )
          })}
          <Box
            gridColumn={{ base: 'span 3', md: 'auto' }}
            p={{ base: 3, md: 4 }}
            border="1px solid"
            borderColor="page.border"
            borderRadius="card"
            aria-labelledby="ch-links"
            as="section"
          >
            <Flex justify="space-between" align="flex-start" gap={2} flexWrap="wrap">
              <Box minW={0}>
                <Text as="h3" id="ch-links" textStyle="label" color="page.fg-secondary">
                  External links
                </Text>
                <Text fontSize="small" fontWeight={600} mt={1.5} className="tnum">
                  {links.total ? `${links.total} link${links.total === 1 ? '' : 's'}` : 'None'}
                  {links.broken ? (
                    <Text as="span" color="status.error">
                      {' '}
                      · {links.broken} broken
                    </Text>
                  ) : null}
                  {links.moved ? <Text as="span"> · {links.moved} moved</Text> : null}
                </Text>
              </Box>
              <Button
                size="xs"
                {...outlineButtonProps}
                onClick={() => void checkLinks()}
                isLoading={starting}
                loadingText="Starting"
                isDisabled={links.running || !links.total}
                minH="28px"
              >
                {links.running ? 'Checking…' : 'Check links now'}
              </Button>
            </Flex>
            <Text fontSize="caption" color="page.fg-secondary" mt={1} className="tnum">
              {linkStatusLine(links, (ms) => relativeTime(ms, now))}
            </Text>
            <VisuallyHidden role="status" aria-live="polite">
              {links.running ? 'Link check running.' : ''}
            </VisuallyHidden>
            <Box
              mt={2}
              h="4px"
              borderRadius="pill"
              bg="page.bg-overlay"
              overflow="hidden"
              visibility={progress === null ? 'hidden' : 'visible'}
              role="progressbar"
              aria-label="Link check progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress ?? 0}
            >
              <Box
                h="100%"
                w={`${progress ?? 0}%`}
                bg="accent.500"
                transition={cssTransition('width', 'base')}
              />
            </Box>
          </Box>
        </Grid>
      </Box>

      <Box as="section" aria-labelledby="ch-issues">
        <VisuallyHidden as="h2" id="ch-issues">
          Issues
        </VisuallyHidden>
        {/* Toolbar */}
        <Flex gap={2} mb={4} flexWrap="wrap" align="center">
          <Select
            size="sm"
            {...inputProps}
            w={{ base: '100%', sm: '230px' }}
            value={filter.check}
            onChange={(e) =>
              setFilter((f) => ({ ...f, check: e.target.value as IssueFilter['check'] }))
            }
            aria-label="Show issues of"
            isDisabled={healthy}
          >
            <option value="">All checks ({issues.length})</option>
            {checkOptions(report.counts.byCheck).map((o) => (
              <option key={o.check} value={o.check}>
                {CHECK_LABEL[o.check]} ({o.count})
              </option>
            ))}
          </Select>
          <Select
            size="sm"
            {...inputProps}
            w={{ base: '100%', sm: '260px' }}
            value={filter.item}
            onChange={(e) => setFilter((f) => ({ ...f, item: e.target.value }))}
            aria-label="Show issues in"
            isDisabled={healthy}
          >
            <option value="">All content</option>
            {itemOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.kind ? `${ITEM_KIND_LABEL[o.kind]} · ` : ''}
                {o.title.length > 48 ? `${o.title.slice(0, 47)}…` : o.title} ({o.count})
              </option>
            ))}
          </Select>
          <Flex gap={2} ml={{ md: 'auto' }} w={{ base: '100%', md: 'auto' }}>
            <Button
              size="sm"
              {...outlineButtonProps}
              onClick={() => void load(true)}
              isLoading={refreshing}
              loadingText="Refreshing"
              flex={{ base: 1, md: 'none' }}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              {...primaryButtonProps}
              onClick={() => setBulkOpen(true)}
              isDisabled={!fixable.length || bulkRunning}
              isLoading={bulkRunning}
              loadingText="Fixing"
              flex={{ base: 1, md: 'none' }}
            >
              {fixable.length
                ? `Apply ${fixable.length} safe fix${fixable.length === 1 ? '' : 'es'}`
                : 'No safe fixes'}
            </Button>
          </Flex>
        </Flex>

        {/* Issues */}
        {healthy ? (
          <Box
            border="1px dashed"
            borderColor="page.border"
            borderRadius="card"
            px={5}
            py={10}
            textAlign="center"
            data-testid="content-health-empty"
          >
            <CheckCircleIcon color="status.open" boxSize={5} aria-hidden />
            <Text fontSize="sm" fontWeight={600} mt={2}>
              Everything checked is healthy
            </Text>
            <Text fontSize="xs" color="page.fg-secondary" mt={1} maxW="56ch" mx="auto">
              {report.scanned.items} published item{report.scanned.items === 1 ? '' : 's'} (posts,
              case studies, pages, the CV and the home page), {report.scanned.images} image
              {report.scanned.images === 1 ? '' : 's'} and {links.total} external link
              {links.total === 1 ? '' : 's'}
              {links.total && links.checked < links.total
                ? ` — ${links.total - links.checked} not checked yet`
                : ''}
              .
            </Text>
          </Box>
        ) : flat.length === 0 ? (
          <Box
            border="1px dashed"
            borderColor="page.border"
            borderRadius="card"
            px={5}
            py={8}
            textAlign="center"
          >
            <Text fontSize="sm" fontWeight={600}>
              Nothing matches these filters
            </Text>
            <Button
              size="sm"
              variant="link"
              color="accent.text"
              mt={2}
              onClick={() => setFilter(NO_FILTER)}
            >
              Show every issue
            </Button>
          </Box>
        ) : (
          <Box {...kb.listProps} data-testid="content-health-list">
            {groups.map((g) => (
              <Box
                key={g.item.key}
                as="section"
                aria-labelledby={`ch-item-${g.item.key}`}
                mb={5}
                data-item={g.item.key}
              >
                <Flex
                  align="center"
                  gap={3}
                  pb={2}
                  mb={1}
                  borderBottom="1px solid"
                  borderColor="page.border"
                  flexWrap="wrap"
                >
                  <Box minW={0} flex="1 1 240px">
                    <Text textStyle="label" color="page.fg-secondary">
                      {ITEM_KIND_LABEL[g.item.kind]}
                    </Text>
                    <Text
                      as="h3"
                      id={`ch-item-${g.item.key}`}
                      fontSize="sm"
                      fontWeight={600}
                      mt={0.5}
                      wordBreak="break-word"
                    >
                      {g.item.title}
                    </Text>
                  </Box>
                  <Text fontSize="caption" color="page.fg-secondary" className="tnum">
                    {countsLine(g.counts)}
                  </Text>
                  <Flex gap={1.5}>
                    <Button
                      as={NextLink}
                      href={g.item.editHref}
                      size="xs"
                      {...outlineButtonProps}
                      minH="28px"
                      aria-label={`Edit ${g.item.title}`}
                    >
                      Edit
                    </Button>
                    <Button
                      as="a"
                      href={g.item.publicHref}
                      target="_blank"
                      rel="noopener"
                      size="xs"
                      variant="ghost"
                      minH="28px"
                      rightIcon={<ExternalLinkIcon boxSize={3} aria-hidden />}
                      aria-label={`View ${g.item.title} (opens in a new tab)`}
                    >
                      View
                    </Button>
                  </Flex>
                </Flex>
                <Box role="list" aria-label={`Issues in ${g.item.title}`}>
                  {g.issues.map((issue) => {
                    index += 1
                    const i = index
                    const active = kb.active === i
                    const rowTabbable = kb.active === -1 ? i === 0 : active
                    const working = busy.has(issue.id)
                    const external = !!issue.url && /^https?:\/\//i.test(issue.url)
                    return (
                      <Flex
                        key={issue.id}
                        role="listitem"
                        direction={{ base: 'column', sm: 'row' }}
                        align="stretch"
                        borderBottom="1px solid"
                        borderColor="page.border"
                        _last={{ borderBottom: 'none' }}
                        bg={active ? 'page.bg-elevated' : 'transparent'}
                        _hover={{ bg: 'page.bg-elevated' }}
                        position="relative"
                        transition={cssTransition('background-color', 'fast')}
                        data-check={issue.check}
                        data-severity={issue.severity}
                      >
                        {active ? (
                          <Box
                            position="absolute"
                            left={0}
                            top={0}
                            bottom={0}
                            w="2px"
                            bg="accent.500"
                            aria-hidden
                          />
                        ) : null}
                        <Box
                          as={NextLink}
                          href={report.items[issue.item]?.editHref || '#'}
                          {...kb.itemProps(i)}
                          flex={1}
                          minW={0}
                          display="block"
                          px={3}
                          py={2.5}
                          color="inherit"
                          textDecoration="none"
                          _focusVisible={{
                            outline: '2px solid',
                            outlineColor: 'accent.500',
                            outlineOffset: '-2px',
                          }}
                          aria-current={active ? 'true' : undefined}
                        >
                          <Flex align="baseline" gap={2}>
                            <Box as="span" alignSelf="center">
                              <SeverityIcon severity={issue.severity} />
                            </Box>
                            <VisuallyHidden>{SEVERITY_LABEL[issue.severity].one}: </VisuallyHidden>
                            <Text as="span" fontSize="sm" fontWeight={500} wordBreak="break-word">
                              {issue.message}
                            </Text>
                          </Flex>
                          <Text
                            fontSize="xs"
                            color="page.fg-secondary"
                            mt={0.5}
                            pl={5.5}
                            wordBreak="break-word"
                          >
                            {issue.detail}
                          </Text>
                          <Flex pl={5.5} mt={1} gap={2} flexWrap="wrap" align="baseline">
                            <Text
                              as="span"
                              fontFamily={MONO}
                              fontSize="caption"
                              color="page.fg-secondary"
                            >
                              {issue.where}
                            </Text>
                            <Text as="span" fontSize="caption" color="page.fg-subtle">
                              {CHECK_LABEL[issue.check]}
                            </Text>
                            {issue.url ? (
                              <Text
                                as="span"
                                fontFamily={MONO}
                                fontSize="caption"
                                color="page.fg-secondary"
                                wordBreak="break-all"
                                title={issue.url}
                              >
                                {shortUrl(issue.url)}
                              </Text>
                            ) : null}
                          </Flex>
                          {issue.fix?.to ? (
                            <Text
                              pl={5.5}
                              mt={0.5}
                              fontFamily={MONO}
                              fontSize="caption"
                              color="accent.text"
                              wordBreak="break-all"
                              title={issue.fix.to}
                            >
                              → {shortUrl(issue.fix.to)}
                            </Text>
                          ) : null}
                          <VisuallyHidden>(opens the editor)</VisuallyHidden>
                        </Box>
                        {external || issue.fix ? (
                          <Flex
                            align="flex-start"
                            pt={{ base: 0, sm: 2 }}
                            pb={{ base: 2.5, sm: 0 }}
                            pl={{ base: 8.5, sm: 0 }}
                            pr={2}
                            gap={1}
                            flexShrink={0}
                          >
                            {external ? (
                              <IconButton
                                as="a"
                                href={issue.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                size="xs"
                                variant="ghost"
                                minW="28px"
                                h="28px"
                                tabIndex={rowTabbable ? 0 : -1}
                                icon={<ExternalLinkIcon />}
                                aria-label={`Open ${shortUrl(issue.url as string, 48)} in a new tab`}
                              />
                            ) : null}
                            {issue.fix ? (
                              <Button
                                size="xs"
                                {...outlineButtonProps}
                                minH="28px"
                                tabIndex={rowTabbable ? 0 : -1}
                                onClick={() => void runFixes([issue])}
                                isLoading={working}
                                loadingText="Fixing"
                                isDisabled={bulkRunning}
                                aria-label={`${FIX_LABEL[issue.fix.type].button}: ${issue.message}`}
                                data-fix={issue.fix.type}
                              >
                                {FIX_LABEL[issue.fix.type].button}
                              </Button>
                            ) : null}
                          </Flex>
                        ) : null}
                      </Flex>
                    )
                  })}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {links.unverifiable.length ? (
        <Accordion allowToggle mt={2}>
          <AccordionItem border="1px solid" borderColor="page.border" borderRadius="card">
            <AccordionButton
              px={4}
              py={3}
              fontSize="sm"
              _hover={{ bg: 'page.bg-elevated' }}
              borderRadius="card"
            >
              <Box flex={1} textAlign="left">
                <Text as="span" fontWeight={600}>
                  {links.unverifiable.length} link{links.unverifiable.length === 1 ? '' : 's'} the
                  checker could not verify
                </Text>
                <Text as="span" display="block" fontSize="xs" color="page.fg-secondary" mt={0.5}>
                  Some sites refuse automated requests (LinkedIn, bot walls). That is not a broken
                  link — open them yourself now and then.
                </Text>
              </Box>
              <AccordionIcon ml={2} />
            </AccordionButton>
            <AccordionPanel px={4} pb={3} pt={0}>
              <Box as="ul" listStyleType="none">
                {links.unverifiable.map((u) => (
                  <Box as="li" key={u.url} py={2} borderTop="1px solid" borderColor="page.border">
                    <Link
                      href={u.url}
                      isExternal
                      fontFamily={MONO}
                      fontSize="caption"
                      color="accent.text"
                      wordBreak="break-all"
                    >
                      {shortUrl(u.url)}
                      <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                    </Link>
                    <Text fontSize="xs" color="page.fg-secondary">
                      {u.reason} ·{' '}
                      {u.refs
                        .map((r) => `${report.items[r.item]?.title || r.item} › ${r.where}`)
                        .join('; ')}
                    </Text>
                  </Box>
                ))}
              </Box>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      ) : null}

      {error ? (
        <Text role="alert" fontSize="xs" color="status.error" mt={3}>
          {error}
        </Text>
      ) : null}
      <Text fontSize="xs" color="page.fg-secondary" mt={5} maxW="72ch">
        Checks the published content only; drafts are checked when you publish them. External links
        are requested from this server once a day (HEAD first, two seconds apart per site, with a
        User-Agent that names this site’s link checker); nothing else leaves the server. Every fix
        saves like the editor does, so it shows in the item’s history and can be undone there.{' '}
        <Text as="span" fontFamily={MONO}>
          ↑ ↓
        </Text>{' '}
        (or{' '}
        <Text as="span" fontFamily={MONO}>
          j
        </Text>{' '}
        /{' '}
        <Text as="span" fontFamily={MONO}>
          k
        </Text>
        ) move through the issues,{' '}
        <Text as="span" fontFamily={MONO}>
          Enter
        </Text>{' '}
        opens the editor,{' '}
        <Text as="span" fontFamily={MONO}>
          f
        </Text>{' '}
        applies the fix.
      </Text>

      <AlertDialog
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        leastDestructiveRef={cancelRef}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent mx={4}>
            <AlertDialogHeader fontSize="md">
              Apply {fixable.length} safe fix{fixable.length === 1 ? '' : 'es'}?
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              <Box as="ul" pl={4} mb={3}>
                {summary.map((s) => (
                  <Box as="li" key={s.type}>
                    {s.text}
                  </Box>
                ))}
              </Box>
              <Text color="page.fg-secondary" fontSize="xs">
                {itemsTouched(fixable)
                  ? `${itemsTouched(fixable)} item${itemsTouched(fixable) === 1 ? '' : 's'} will be saved, each with a version in its history you can restore. `
                  : ''}
                {isFiltered(filter) ? 'Only the issues the filters show are included.' : ''}
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" variant="ghost" onClick={() => setBulkOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                {...primaryButtonProps}
                onClick={async () => {
                  setBulkOpen(false)
                  setBulkRunning(true)
                  try {
                    await runFixes(fixable)
                  } finally {
                    setBulkRunning(false)
                  }
                }}
              >
                Apply {fixable.length} fix{fixable.length === 1 ? '' : 'es'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  )
}
