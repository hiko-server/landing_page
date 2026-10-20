import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Icon,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuDivider,
  MenuGroup,
  MenuItem,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Select,
  SimpleGrid,
  Switch,
  Text,
} from '@chakra-ui/react'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons'
import { FaDownload, FaFilter, FaSync, FaTimes } from 'react-icons/fa'
import { MONO, inputProps, outlineButtonProps, primaryButtonProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { useStickyRef } from '../shell/stickyRef'
import { formatCount } from '../../../lib/analytics/format'
import { utcDay } from '../../../lib/analytics/shared'
import {
  BROWSERS,
  DEVICES,
  DIMENSION_LABEL,
  EXPLORE_DIMENSIONS,
  EXPLORE_RAW_DAYS,
  PERIOD_LABEL,
  PERIOD_PRESETS,
  earliestDay,
  exploreSearch,
  isDay,
  normalizeFilterValue,
  resolvePeriod,
  shiftSpan,
  spanDays,
  withFilter,
  withoutFilter,
  type ExploreDimension,
  type ExploreQuery,
  type FilterOp,
  type PeriodPreset,
} from '../../../lib/analytics/exploreShared'
import { describeFilter, filterValueLabel, formatSpanWithYear } from '../../../lib/analytics/exploreFormat'
import { EXPORT_TABLES, EXPORT_TABLE_LABEL } from '../../../lib/analytics/exportCsv'

/**
 * The Analytics view's controls, in one row above everything they scope:
 * the period (presets, a custom range, ‹ › to step by the period's own
 * length), "Compare" (draw the previous period), Filter (a dimension, is /
 * is not, a value with suggestions from the period's data), Export (CSV)
 * and Refresh; the active filters as removable chips below. Every change
 * goes to the URL (the panel reads it back), so a view can be reloaded,
 * bookmarked and exported exactly as shown.
 */

const today = () => utcDay(Date.now())

// ── Custom range ───────────────────────────────────────────────────────────

function CustomRangeModal({
  isOpen,
  onClose,
  query,
  onApply,
  finalFocusRef,
}: {
  isOpen: boolean
  onClose: () => void
  query: ExploreQuery
  onApply: (from: string, to: string) => void
  /** The Period button: the menu item that opened the dialog is gone by the time it closes. */
  finalFocusRef: RefObject<HTMLButtonElement>
}) {
  const ids = useId()
  const fromRef = useRef<HTMLInputElement>(null)
  const t = today()
  const current = resolvePeriod(query, t)
  const [from, setFrom] = useState(current.from)
  const [to, setTo] = useState(current.to)
  useEffect(() => {
    if (!isOpen) return
    const span = resolvePeriod(query, today())
    setFrom(span.from)
    setTo(span.to)
  }, [isOpen, query])
  const min = earliestDay(t)
  const problem = !isDay(from) || !isDay(to) ? 'Enter both days.' : from > to ? 'The first day must not be after the last.' : from < min ? `Daily totals go back to ${min}.` : to > t ? 'The last day cannot be in the future.' : null
  const apply = () => {
    if (problem) return
    onApply(from, to)
    onClose()
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} initialFocusRef={fromRef} finalFocusRef={finalFocusRef} isCentered size="md">
      <ModalOverlay />
      <ModalContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
        <ModalHeader fontSize="md" pb={1} pr={12}>
          Custom range
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <form
            id={`${ids}-form`}
            onSubmit={(e) => {
              e.preventDefault()
              apply()
            }}
          >
            <FormControl isInvalid={!!problem}>
              <SimpleGrid columns={2} spacing={3}>
                <Box>
                  <FormLabel htmlFor={`${ids}-from`} fontSize="13px">
                    From
                  </FormLabel>
                  <Input {...inputProps} ref={fromRef} id={`${ids}-from`} type="date" size="sm" value={from} min={min} max={t} onChange={(e) => setFrom(e.target.value)} aria-describedby={`${ids}-help`} />
                </Box>
                <Box>
                  <FormLabel htmlFor={`${ids}-to`} fontSize="13px">
                    To
                  </FormLabel>
                  <Input {...inputProps} id={`${ids}-to`} type="date" size="sm" value={to} min={min} max={t} onChange={(e) => setTo(e.target.value)} aria-describedby={`${ids}-help`} />
                </Box>
              </SimpleGrid>
              {problem ? <FormErrorMessage fontSize="xs">{problem}</FormErrorMessage> : null}
              <FormHelperText id={`${ids}-help`} fontSize="xs" color="page.fg-secondary">
                Days are UTC and both are included. Daily totals go back 400 days; filters use the detailed records of the last {EXPLORE_RAW_DAYS} days.
              </FormHelperText>
            </FormControl>
          </form>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" {...primaryButtonProps} type="submit" form={`${ids}-form`} isDisabled={!!problem}>
            Show {isDay(from) && isDay(to) && from <= to ? `${spanDays({ from, to })} day${spanDays({ from, to }) === 1 ? '' : 's'}` : 'range'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

// ── Period ─────────────────────────────────────────────────────────────────

function PeriodControl({ query, onChange }: { query: ExploreQuery; onChange: (q: ExploreQuery) => void }) {
  const [customOpen, setCustomOpen] = useState(false)
  // Sticky: the dialog reads it as it closes, when the menu button's re-merged ref may be briefly null.
  const [periodRef, setPeriodRef] = useStickyRef<HTMLButtonElement>()
  const t = today()
  const span = resolvePeriod(query, t)
  const before = shiftSpan(span, -1)
  const after = shiftSpan(span, 1)
  const canBack = before.from >= earliestDay(t)
  const canForward = span.to < t
  const label = query.period === 'custom' ? formatSpanWithYear(span) : PERIOD_LABEL[query.period]
  const go = (s: { from: string; to: string }) => onChange({ ...query, period: 'custom', from: s.from, to: s.to > t ? t : s.to })
  const navProps = { size: 'sm', variant: 'ghost', color: 'page.fg-secondary', _hover: { bg: 'page.hover', color: 'page.fg' }, minW: '32px', h: '32px' } as const

  return (
    <HStack spacing={0.5} role="group" aria-label="Period" border="1px solid" borderColor="page.border" borderRadius="lg" bg="page.bg-elevated" p={0.5} minW={0}>
      <IconButton {...navProps} icon={<ChevronLeftIcon boxSize={5} />} aria-label={`Previous period: ${formatSpanWithYear(before)}`} title={formatSpanWithYear(before)} isDisabled={!canBack} onClick={() => go(before)} />
      <Menu placement="bottom-start" isLazy>
        <MenuButton
          ref={setPeriodRef}
          as={Button}
          size="sm"
          h="32px"
          variant="ghost"
          rightIcon={<ChevronDownIcon />}
          fontWeight={600}
          px={2.5}
          minW={0}
          _hover={{ bg: 'page.hover' }}
          _active={{ bg: 'page.hover' }}
          aria-label={`Period: ${label}, ${formatSpanWithYear(span)}`}
          data-testid="period-button"
        >
          <Box as="span" display="inline-flex" alignItems="baseline" gap={2} minW={0}>
            <Box as="span" whiteSpace="nowrap">
              {label}
            </Box>
            {query.period !== 'custom' ? (
              <Box as="span" display={{ base: 'none', md: 'inline' }} fontFamily={MONO} fontSize="11px" fontWeight={400} color="page.fg-secondary" className="tnum" whiteSpace="nowrap">
                {formatSpanWithYear(span)}
              </Box>
            ) : null}
          </Box>
        </MenuButton>
        <MenuList bg="page.bg-elevated" borderColor="page.border" fontSize="sm" zIndex={40} minW="220px">
          <MenuOptionGroup type="radio" value={query.period === 'custom' ? '' : query.period} onChange={(v) => onChange({ ...query, period: v as PeriodPreset, from: null, to: null })}>
            {PERIOD_PRESETS.map((p) => (
              <MenuItemOption key={p} value={p} bg="transparent" _hover={{ bg: 'page.bg-overlay' }} _focus={{ bg: 'page.bg-overlay' }}>
                {PERIOD_LABEL[p]}
              </MenuItemOption>
            ))}
          </MenuOptionGroup>
          <MenuDivider borderColor="page.border" />
          <MenuItem onClick={() => setCustomOpen(true)} bg="transparent" _hover={{ bg: 'page.bg-overlay' }} _focus={{ bg: 'page.bg-overlay' }} pl="2.25rem" fontWeight={query.period === 'custom' ? 600 : 400}>
            Custom range…
          </MenuItem>
        </MenuList>
      </Menu>
      <IconButton {...navProps} icon={<ChevronRightIcon boxSize={5} />} aria-label={`Next period: ${formatSpanWithYear({ from: after.from, to: after.to > t ? t : after.to })}`} isDisabled={!canForward} onClick={() => go(after)} />
      <CustomRangeModal
        isOpen={customOpen}
        onClose={() => setCustomOpen(false)}
        query={query}
        onApply={(from, to) => onChange({ ...query, period: 'custom', from, to })}
        finalFocusRef={periodRef}
      />
    </HStack>
  )
}

// ── Filter picker ──────────────────────────────────────────────────────────

const VALUE_HINT: Record<ExploreDimension, string> = {
  page: 'A path, e.g. /cv or /blog/…',
  source: 'A site’s host name, e.g. linkedin.com',
  country: 'A two-letter country code, e.g. JP',
  device: '',
  browser: '',
  lang: 'A language tag, e.g. en or zh-hans',
}

const VALUE_PROBLEM: Record<ExploreDimension, string> = {
  page: 'Enter a path that starts with /.',
  source: 'Enter a host name such as linkedin.com.',
  country: 'Enter a two-letter code such as JP.',
  device: 'Choose a device class.',
  browser: 'Choose a browser.',
  lang: 'Enter a language tag such as en.',
}

type Suggestion = { key: string; visitors: number }

function FilterPicker({ query, onChange }: { query: ExploreQuery; onChange: (q: ExploreQuery) => void }) {
  const ids = useId()
  const [open, setOpen] = useState(false)
  // A fresh popover for every opening: reopened while its exit animation is
  // still running, Chakra's popover can stay invisible although open.
  const [instance, setInstance] = useState(0)
  const [dim, setDim] = useState<ExploreDimension>('page')
  const [op, setOp] = useState<FilterOp>('is')
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const firstRef = useRef<HTMLSelectElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLElement>(null)
  const inside = (node: EventTarget | null) => node instanceof Node && (!!contentRef.current?.contains(node) || !!triggerRef.current?.contains(node))

  // Close on a press outside, or when focus moves to something outside —
  // but not when the focused field is swapped for another (choosing a
  // dimension replaces the value control: focus then goes nowhere, which
  // Chakra's own closeOnBlur would take for leaving the picker).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const search = exploreSearch(query)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/admin/analytics?${exploreSearch(query, [['values', dim]])}`, { cache: 'no-store', signal: controller.signal })
      .then((r): Promise<Record<string, any>> | Record<string, any> => (r.ok ? readJsonObject(r) : {}))
      .then((b) => {
        const values = Array.isArray(b.values) ? (b.values as Suggestion[]).filter((v) => v && typeof v.key === 'string' && v.key !== '(other)') : []
        setSuggestions(values)
      })
      .catch(() => {
        if (!controller.signal.aborted) setSuggestions([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
    // `search` stands for the query (a new object on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dim, search])

  const reset = () => {
    const existing = query.filters.find((f) => f.dim === dim)
    setOp(existing?.op ?? 'is')
    setValue(existing?.value ?? '')
    setTouched(false)
  }
  useEffect(reset, [dim]) // eslint-disable-line react-hooks/exhaustive-deps

  const normalized = normalizeFilterValue(dim, value)
  const problem = touched && normalized === null ? VALUE_PROBLEM[dim] : null
  const choice = dim === 'device' || dim === 'browser'
  const options: string[] = dim === 'device' ? [...DEVICES] : dim === 'browser' ? [...BROWSERS] : []
  const apply = () => {
    setTouched(true)
    if (normalized === null) return
    onChange({ ...query, filters: withFilter(query.filters, { dim, op, value: normalized }) })
    setOpen(false)
  }

  return (
    <Popover
      key={instance}
      isOpen={open}
      onOpen={() => {
        setInstance((n) => n + 1)
        setOpen(true)
        reset()
      }}
      onClose={() => setOpen(false)}
      placement="bottom-end"
      initialFocusRef={firstRef}
      closeOnBlur={false}
    >
      <PopoverTrigger>
        <Button ref={triggerRef} size="sm" h="34px" {...outlineButtonProps} leftIcon={<Icon as={FaFilter} boxSize="11px" aria-hidden />} data-filter-trigger="">
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        w={{ base: 'calc(100vw - 32px)', sm: '340px' }}
        bg="page.bg-elevated"
        borderColor="page.border"
        boxShadow="elevation.md"
        _focusVisible={{ outline: 'none' }}
        onBlur={(e) => {
          if (e.relatedTarget && !inside(e.relatedTarget)) setOpen(false)
        }}
      >
        <PopoverArrow bg="page.bg-elevated" />
        <PopoverBody p={4}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              apply()
            }}
            aria-label="Add a filter"
          >
            <Text fontSize="sm" fontWeight={600} mb={3}>
              Add a filter
            </Text>
            <SimpleGrid columns={2} spacing={2} mb={3}>
              <FormControl>
                <FormLabel htmlFor={`${ids}-dim`} fontSize="xs" color="page.fg-secondary" mb={1}>
                  Show
                </FormLabel>
                <Select {...inputProps} ref={firstRef} id={`${ids}-dim`} size="sm" value={dim} onChange={(e) => setDim(e.target.value as ExploreDimension)}>
                  {EXPLORE_DIMENSIONS.map((d) => (
                    <option key={d} value={d}>
                      {DIMENSION_LABEL[d]}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel htmlFor={`${ids}-op`} fontSize="xs" color="page.fg-secondary" mb={1}>
                  Condition
                </FormLabel>
                <Select {...inputProps} id={`${ids}-op`} size="sm" value={op} onChange={(e) => setOp(e.target.value as FilterOp)}>
                  <option value="is">is</option>
                  <option value="not">is not</option>
                </Select>
              </FormControl>
            </SimpleGrid>
            <FormControl isInvalid={!!problem} mb={3}>
              <FormLabel htmlFor={`${ids}-value`} fontSize="xs" color="page.fg-secondary" mb={1}>
                {DIMENSION_LABEL[dim]}
              </FormLabel>
              {choice ? (
                <Select {...inputProps} id={`${ids}-value`} size="sm" value={value} placeholder="Choose…" onChange={(e) => setValue(e.target.value)}>
                  {options.map((o) => {
                    const hit = suggestions.find((s) => s.key === o)
                    return (
                      <option key={o} value={o}>
                        {filterValueLabel(dim, o)}
                        {hit ? ` (${formatCount(hit.visitors)})` : ''}
                      </option>
                    )
                  })}
                </Select>
              ) : (
                <>
                  <Input
                    {...inputProps}
                    id={`${ids}-value`}
                    size="sm"
                    value={value}
                    list={`${ids}-list`}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={() => value && setTouched(true)}
                    autoComplete="off"
                    spellCheck={false}
                    fontFamily={dim === 'page' || dim === 'source' ? MONO : undefined}
                    fontSize="13px"
                    aria-describedby={`${ids}-hint`}
                  />
                  <datalist id={`${ids}-list`}>
                    {suggestions.map((s) => (
                      <option key={s.key} value={s.key}>
                        {dim === 'country' || dim === 'lang' ? `${filterValueLabel(dim, s.key)} · ` : ''}
                        {formatCount(s.visitors)} visitor{s.visitors === 1 ? '' : 's'}
                      </option>
                    ))}
                  </datalist>
                </>
              )}
              {problem ? (
                <FormErrorMessage fontSize="xs">{problem}</FormErrorMessage>
              ) : (
                <FormHelperText id={`${ids}-hint`} fontSize="xs" color="page.fg-secondary">
                  {loading ? 'Loading this period’s values…' : choice ? '' : `${VALUE_HINT[dim]}${suggestions.length ? ` — ${suggestions.length} seen in this period` : ''}`}
                </FormHelperText>
              )}
            </FormControl>
            <Flex justify="flex-end" gap={2}>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" {...primaryButtonProps}>
                Apply
              </Button>
            </Flex>
          </form>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  )
}

// ── Bar ────────────────────────────────────────────────────────────────────

export default function ExploreBar({
  query,
  onChange,
  onRefresh,
  loading,
  exportExtra,
}: {
  query: ExploreQuery
  onChange: (q: ExploreQuery) => void
  onRefresh: () => void
  loading: boolean
  /** The conversion's source and the paths' goal, so the export matches the screen. */
  exportExtra: Array<[string, string]>
}) {
  const compareId = useId()
  const barRef = useRef<HTMLDivElement>(null)
  // A removed chip takes its button (and the focus) with it: on to the chip
  // now in its place, the one before it, or — none left — the Filter button.
  const refocusChip = useRef<number | null>(null)
  useEffect(() => {
    const at = refocusChip.current
    if (at === null) return
    refocusChip.current = null
    const removes = barRef.current?.querySelectorAll<HTMLButtonElement>('[data-filter-chip] button')
    const next = removes && removes.length ? removes[Math.min(at, removes.length - 1)] : barRef.current?.querySelector<HTMLButtonElement>('[data-filter-trigger]')
    next?.focus()
  }, [query.filters])
  const exportHref = useMemo(() => (table: string) => `/api/admin/analytics/export?${exploreSearch(query, [...exportExtra, ['table', table]])}`, [query, exportExtra])

  return (
    <Box ref={barRef} mb={4} data-explore-bar="">
      <Flex gap={2} align="center" flexWrap="wrap" rowGap={2}>
        <PeriodControl query={query} onChange={onChange} />
        <Flex align="center" px={2.5} h="38px" border="1px solid" borderColor="page.border" borderRadius="lg" bg="page.bg-elevated">
          <Switch
            id={compareId}
            size="sm"
            colorScheme="purple"
            isChecked={query.compare}
            onChange={(e) => onChange({ ...query, compare: e.target.checked })}
            display="inline-flex"
            alignItems="center"
            sx={{ '.chakra-switch__label': { fontSize: 'sm', ms: 2, whiteSpace: 'nowrap' } }}
            title="Draw the previous period of the same length on the chart"
          >
            Compare
          </Switch>
        </Flex>
        <HStack spacing={2} ml={{ base: 0, md: 'auto' }} flexWrap="wrap">
          <FilterPicker query={query} onChange={onChange} />
          <Menu placement="bottom-end" isLazy>
            <MenuButton as={Button} size="sm" h="34px" {...outlineButtonProps} leftIcon={<Icon as={FaDownload} boxSize="11px" aria-hidden />} rightIcon={<ChevronDownIcon />}>
              Export
            </MenuButton>
            <MenuList bg="page.bg-elevated" borderColor="page.border" fontSize="sm" zIndex={40} maxH="min(70vh, 440px)" overflowY="auto">
              <MenuItem as="a" href={exportHref('all')} download bg="transparent" _hover={{ bg: 'page.bg-overlay' }} _focus={{ bg: 'page.bg-overlay' }} fontWeight={600}>
                All tables (.zip)
              </MenuItem>
              <MenuDivider borderColor="page.border" />
              <MenuGroup title="One table (.csv)" fontSize="xs" color="page.fg-secondary" fontWeight={500}>
                {EXPORT_TABLES.map((t) => (
                  <MenuItem key={t} as="a" href={exportHref(t)} download bg="transparent" _hover={{ bg: 'page.bg-overlay' }} _focus={{ bg: 'page.bg-overlay' }}>
                    {EXPORT_TABLE_LABEL[t]}
                  </MenuItem>
                ))}
              </MenuGroup>
            </MenuList>
          </Menu>
          <IconButton size="sm" h="34px" variant="ghost" color="page.fg-secondary" icon={<Icon as={FaSync} aria-hidden />} aria-label="Refresh" title="Refresh" onClick={onRefresh} isLoading={loading} />
        </HStack>
      </Flex>
      {query.filters.length ? (
        <Flex as="ul" listStyleType="none" m={0} p={0} mt={3} gap={2} flexWrap="wrap" align="center" aria-label="Active filters">
          {query.filters.map((f, index) => {
            const text = describeFilter(f)
            return (
              <Flex as="li" key={f.dim} align="center" gap={1} pl={2.5} pr={1} h="28px" borderRadius="full" border="1px solid" borderColor="accent.500" bg="var(--accent-soft)" fontSize="xs" maxW="100%" minW={0} data-filter-chip="">
                <Text as="span" color="page.fg-secondary" flexShrink={0}>
                  {DIMENSION_LABEL[f.dim]} {f.op === 'is' ? 'is' : 'is not'}
                </Text>
                <Text as="span" fontWeight={600} noOfLines={1} wordBreak="break-all" fontFamily={f.dim === 'page' || f.dim === 'source' ? MONO : undefined} title={filterValueLabel(f.dim, f.value)}>
                  {filterValueLabel(f.dim, f.value)}
                </Text>
                <IconButton
                  size="xs"
                  variant="ghost"
                  borderRadius="full"
                  minW="24px"
                  h="24px"
                  icon={<Icon as={FaTimes} boxSize="10px" aria-hidden />}
                  aria-label={`Remove filter: ${text}`}
                  onClick={() => {
                    refocusChip.current = index
                    onChange({ ...query, filters: withoutFilter(query.filters, f.dim) })
                  }}
                  _hover={{ bg: 'page.hover' }}
                />
              </Flex>
            )
          })}
          {query.filters.length > 1 ? (
            <Box as="li">
              <Button
                size="xs"
                variant="link"
                color="page.fg-secondary"
                onClick={() => {
                  refocusChip.current = 0
                  onChange({ ...query, filters: [] })
                }}
              >
                Clear all
              </Button>
            </Box>
          ) : null}
        </Flex>
      ) : null}
    </Box>
  )
}
