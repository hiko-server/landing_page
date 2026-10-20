import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Kbd,
  Select,
  Skeleton,
  Text,
  useToast,
} from '@chakra-ui/react'
import { SearchIcon } from '@chakra-ui/icons'
import { FaList, FaThLarge } from 'react-icons/fa'
import type { MediaItem, MediaLibraryResponse, MediaMeta } from '../../../lib/media/types'
import {
  EMPTY_FILTER,
  FLAGS,
  FLAG_HINT,
  FLAG_LABEL,
  MEDIA_TYPES,
  ORIENTATIONS,
  SORTS,
  SORT_LABEL,
  filterFromQuery,
  filterItems,
  filterToQuery,
  flagCounts,
  formatBytes,
  formatLabel,
  isFiltered,
  matchesFlag,
  relativeTime,
  sortItems,
  type MediaFilter,
  type MediaFlag,
  type MediaSort,
} from '../../../lib/media/view'
import { getShortcutsEnabled, isImeComposing } from '../../../lib/keyboardShortcuts'
import { isTextEntryTarget } from '../shell/listKeys'
import SegmentedTabs, { tabPanelProps, type SegmentedItem } from '../shell/SegmentedTabs'
import { AdminPageShell, BackLink, LoadErrorNotice, MONO, SessionExpiredNotice, inputProps, outlineButtonProps, primaryButtonProps } from '../shell/ui'
import { ACCEPT, fetchLibrary, postMedia, type BatchBody, type OptimizeBody } from './api'
import MediaCollection from './MediaCollection'
import MediaDrawer from './MediaDrawer'
import TrashList from './TrashList'
import UploadPanel from './UploadPanel'
import { DropOverlay, useFileDrop } from './useFileDrop'
import { useUploadQueue } from './useUploadQueue'

/**
 * Admin → Media (H7): every upload — on this server and, after an R2 check,
 * the ones only R2 holds — as a grid or a list, with search, filters (type,
 * shape, no alt text, unused, missing sizes, large, not in R2) and sorting
 * kept in the address (/admin/media?q=…&filter=…), selection with bulk
 * "Generate responsive versions", "Copy to R2" and "Move to trash", uploads
 * by button or drag-and-drop anywhere on the page, the detail drawer
 * (?open=<name>) and the 30-day trash (?view=trash).
 */

type Tab = 'library' | 'trash'
const VIEW_KEY = 'media:view'
const R2_STALE_MS = 6 * 3600_000

function readView(): 'grid' | 'list' {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

function writeView(v: 'grid' | 'list') {
  try {
    window.localStorage.setItem(VIEW_KEY, v)
  } catch {
    /* a private window: the choice lasts for this visit */
  }
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export default function MediaLibrary() {
  const router = useRouter()
  const toast = useToast()
  const [data, setData] = useState<MediaLibraryResponse | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'expired'>('loading')
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [tab, setTab] = useState<Tab>('library')
  const [filter, setFilter] = useState<MediaFilter>(EMPTY_FILTER)
  const [sort, setSort] = useState<MediaSort>('newest')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openName, setOpenName] = useState<string | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmTrash, setConfirmTrash] = useState(false)
  const [r2Checking, setR2Checking] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const lastIndex = useRef<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const tileFocus = useRef<HTMLElement | null>(null)
  const autoChecked = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setView(readView())
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  // ── URL state ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!router.isReady) return
    const parsed = filterFromQuery(router.query as Record<string, string | string[] | undefined>)
    setFilter(parsed.filter)
    setSort(parsed.sort)
    setTab(first(router.query.view) === 'trash' ? 'trash' : 'library')
    setOpenName(first(router.query.open) || null)
    setReady(true)
    // Only on the first load and on back / forward: typing updates the URL itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady])

  const syncUrl = useCallback(
    (next: { filter?: MediaFilter; sort?: MediaSort; tab?: Tab; open?: string | null }) => {
      const f = next.filter ?? filter
      const s = next.sort ?? sort
      const t = next.tab ?? tab
      const o = next.open === undefined ? openName : next.open
      const query: Record<string, string> = { ...filterToQuery(f, s) }
      if (t === 'trash') query.view = 'trash'
      if (o) query.open = o
      void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false })
    },
    [filter, sort, tab, openName, router],
  )

  // ── Data ───────────────────────────────────────────────────────────────
  const apply = useCallback((lib: MediaLibraryResponse) => {
    setData(lib)
    setStatus('ready')
    setNow(Date.now())
    setSelected((cur) => {
      const names = new Set(lib.items.map((i) => i.name))
      const next = new Set(Array.from(cur).filter((n) => names.has(n)))
      return next.size === cur.size ? cur : next
    })
  }, [])

  const load = useCallback(async () => {
    const out = await fetchLibrary()
    if (out.ok) apply(out.body)
    else if (out.status === 401) setStatus('expired')
    else {
      setLoadError(out.error)
      setStatus((s) => (s === 'ready' ? s : 'error'))
      if (status === 'ready') toast({ status: 'error', title: 'Could not refresh the library', description: out.error, position: 'bottom-right' })
    }
  }, [apply, status, toast])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkR2 = useCallback(
    async (quiet: boolean) => {
      setR2Checking(true)
      const out = await postMedia<{ library?: MediaLibraryResponse; onlyInR2: number; notMirrored: number }>({ action: 'r2-scan' })
      setR2Checking(false)
      if (!out.ok) {
        if (!quiet) toast({ status: 'error', title: 'R2 not checked', description: out.error, position: 'bottom-right' })
        return
      }
      if (out.body.library) apply(out.body.library)
      if (!quiet) {
        const { onlyInR2, notMirrored } = out.body
        toast({
          status: onlyInR2 || notMirrored ? 'warning' : 'success',
          title: 'R2 checked',
          description:
            onlyInR2 || notMirrored
              ? [notMirrored ? `${notMirrored} image${notMirrored === 1 ? '' : 's'} not fully copied to R2` : '', onlyInR2 ? `${onlyInR2} only in R2` : ''].filter(Boolean).join(' · ')
              : 'Every image is in R2.',
          position: 'bottom-right',
        })
      }
    },
    [apply, toast],
  )

  // A quiet R2 check when the last one is old (or there never was one).
  useEffect(() => {
    if (!data || autoChecked.current || !data.r2.configured) return
    autoChecked.current = true
    if (!data.r2.checkedAt || Date.now() - data.r2.checkedAt > R2_STALE_MS) void checkR2(true)
  }, [data, checkR2])

  // ── Uploads ────────────────────────────────────────────────────────────
  const refreshTimer = useRef<number | null>(null)
  const onUploaded = useCallback(
    (name: string) => {
      setFresh((cur) => new Set(cur).add(name))
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null
        void load()
      }, 400)
    },
    [load],
  )
  const queue = useUploadQueue(onUploaded)
  const { dragging } = useFileDrop((files) => queue.add(files), status === 'ready' && !openName && !confirmTrash)

  // The "just uploaded" ring fades after a while.
  useEffect(() => {
    if (!fresh.size || queue.summary.active) return
    const id = window.setTimeout(() => setFresh(new Set()), 8000)
    return () => window.clearTimeout(id)
  }, [fresh, queue.summary.active])

  // ── Derived ────────────────────────────────────────────────────────────
  const items = useMemo(() => data?.items ?? [], [data])
  const shown = useMemo(() => sortItems(filterItems(items, filter), sort), [items, filter, sort])
  const counts = useMemo(() => flagCounts(filterItems(items, { ...filter, flags: [] })), [items, filter])
  const totalBytes = useMemo(() => items.reduce((n, i) => n + i.bytes + i.variants.bytes, 0), [items])
  const openItem = openName ? items.find((i) => i.name === openName) ?? null : null
  // The drawer keeps showing the last image while it slides out.
  const lastOpen = useRef<MediaItem | null>(null)
  if (openItem) lastOpen.current = openItem
  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.name)), [items, selected])

  // An address naming an upload that is not (or no longer) in the library.
  useEffect(() => {
    if (status === 'ready' && openName && !openItem) {
      setOpenName(null)
      syncUrl({ open: null })
    }
  }, [status, openName, openItem, syncUrl])

  // ── Keyboard: "/" searches, Escape clears the selection ────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isImeComposing(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) return
      if (e.key === '/' && getShortcutsEnabled() && !isTextEntryTarget(e.target) && tab === 'library') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape' && selected.size && !isTextEntryTarget(e.target)) {
        setSelected(new Set())
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected.size, tab])

  // ── Actions ────────────────────────────────────────────────────────────
  const updateFilter = (next: MediaFilter) => {
    setFilter(next)
    syncUrl({ filter: next })
  }
  const toggleFlag = (flag: MediaFlag) => updateFilter({ ...filter, flags: filter.flags.includes(flag) ? filter.flags.filter((f) => f !== flag) : [...filter.flags, flag] })

  const open = (item: MediaItem) => {
    tileFocus.current = document.activeElement as HTMLElement | null
    setOpenName(item.name)
    syncUrl({ open: item.name })
  }
  const close = () => {
    setOpenName(null)
    syncUrl({ open: null })
  }

  const toggle = (item: MediaItem, index: number, range: boolean) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (range && lastIndex.current !== null) {
        const [a, b] = [Math.min(lastIndex.current, index), Math.max(lastIndex.current, index)]
        const on = !cur.has(item.name)
        for (const it of shown.slice(a, b + 1)) {
          if (on) next.add(it.name)
          else next.delete(it.name)
        }
      } else if (next.has(item.name)) next.delete(item.name)
      else next.add(item.name)
      return next
    })
    lastIndex.current = index
  }
  const toggleAll = (on: boolean) => setSelected(on ? new Set(shown.map((i) => i.name)) : new Set())

  const onMeta = (name: string, meta: MediaMeta | null) => {
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.name === name ? { ...i, meta } : i)) } : d))
  }

  const restore = useCallback(
    async (names: string[]) => {
      setBusy(names.length === 1 ? `restore:${names[0]}` : 'restore')
      const out = await postMedia<BatchBody>({ action: 'restore', names })
      setBusy(null)
      if (out.ok && out.body.library) apply(out.body.library)
      if (!out.ok || out.body.failed.length) {
        toast({ status: 'error', title: 'Not restored', description: out.ok ? out.body.failed[0].error : out.error, position: 'bottom-right' })
        return
      }
      toast({ status: 'success', title: names.length === 1 ? `Restored ${names[0]}` : `Restored ${names.length} images`, position: 'bottom-right', duration: 3000 })
    },
    [apply, toast],
  )

  const announceTrashed = useCallback(
    (names: string[]) => {
      toast({
        position: 'bottom-right',
        duration: 8000,
        render: ({ onClose }) => (
          <Flex align="center" gap={3} bg="page.bg-elevated" border="1px solid" borderColor="page.border-strong" borderRadius="lg" px={4} py={3} boxShadow="lg" role="status">
            <Text fontSize="sm" flex="1">
              {names.length === 1 ? `Moved ${names[0]} to the trash.` : `Moved ${names.length} images to the trash.`}
            </Text>
            <Button
              size="xs"
              {...outlineButtonProps}
              onClick={() => {
                onClose()
                void restore(names)
              }}
            >
              Undo
            </Button>
          </Flex>
        ),
      })
    },
    [restore, toast],
  )

  const onTrashed = (name: string, lib: MediaLibraryResponse | null) => {
    setOpenName(null)
    syncUrl({ open: null })
    if (lib) apply(lib)
    else void load()
    announceTrashed([name])
  }

  const purge = async (name: string) => {
    setBusy(`purge:${name}`)
    const out = await postMedia<BatchBody>({ action: 'purge', names: [name] })
    setBusy(null)
    if (out.ok && out.body.library) apply(out.body.library)
    toast({ status: out.ok && out.body.done.length ? 'success' : 'error', title: out.ok && out.body.done.length ? `Deleted ${name} for good` : 'Not deleted', description: out.ok ? undefined : out.error, position: 'bottom-right', duration: 3000 })
  }

  const bulkGenerate = async () => {
    const names = selectedItems.filter((i) => matchesFlag(i, 'needsSizes')).map((i) => i.name)
    if (!names.length) return
    setBusy('optimize')
    let made = 0
    try {
      for (let round = 0; round < 50; round++) {
        const out = await postMedia<OptimizeBody>({ action: 'optimize', names })
        if (!out.ok) {
          toast({ status: 'error', title: 'Sizes not generated', description: out.error, position: 'bottom-right' })
          break
        }
        made += out.body.processed
        if (!out.body.remaining) {
          if (out.body.library) apply(out.body.library)
          toast({
            status: out.body.errors.length ? 'warning' : 'success',
            title: `Responsive versions ready for ${made} image${made === 1 ? '' : 's'}`,
            description: out.body.errors.length ? `${out.body.errors.length} could not be read: ${out.body.errors[0].name}` : out.body.revalidated.length ? `Refreshed ${out.body.revalidated.join(', ')}` : undefined,
            position: 'bottom-right',
          })
          break
        }
      }
    } finally {
      setBusy(null)
    }
  }

  const bulkMirror = async () => {
    const names = selectedItems.filter((i) => i.local && matchesFlag(i, 'notInR2')).map((i) => i.name)
    if (!names.length) return
    setBusy('r2')
    const out = await postMedia<BatchBody>({ action: 'r2-mirror', names })
    setBusy(null)
    if (out.ok && out.body.library) apply(out.body.library)
    const failed = out.ok ? out.body.failed.length : names.length
    toast({ status: failed ? 'warning' : 'success', title: failed ? `${failed} not copied to R2` : `Copied ${names.length} image${names.length === 1 ? '' : 's'} to R2`, description: out.ok ? out.body.failed[0]?.error : out.error, position: 'bottom-right' })
  }

  const trashable = selectedItems.filter((i) => !i.usage.length)
  const bulkTrash = async () => {
    setConfirmTrash(false)
    const names = trashable.map((i) => i.name)
    if (!names.length) return
    setBusy('trash')
    const out = await postMedia<BatchBody>({ action: 'delete', names })
    setBusy(null)
    if (!out.ok) {
      toast({ status: 'error', title: 'Nothing moved', description: out.error, position: 'bottom-right' })
      return
    }
    if (out.body.library) apply(out.body.library)
    setSelected(new Set())
    if (out.body.done.length) announceTrashed(out.body.done)
    if (out.body.failed.length) toast({ status: 'warning', title: `${out.body.failed.length} kept`, description: out.body.failed[0].error, position: 'bottom-right' })
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const tabs: SegmentedItem<Tab>[] = [
    { key: 'library', label: data ? `Library · ${items.length}` : 'Library' },
    { key: 'trash', label: data?.trash.length ? `Trash · ${data.trash.length}` : 'Trash' },
  ]

  const viewToggle = (
    <HStack spacing={0.5} p={0.5} border="1px solid" borderColor="page.border" borderRadius="lg" bg="page.bg-elevated" role="group" aria-label="Show as">
      {(
        [
          ['grid', 'Grid', FaThLarge],
          ['list', 'List', FaList],
        ] as const
      ).map(([key, label, Icon]) => (
        <IconButton
          key={key}
          size="xs"
          variant="ghost"
          aria-label={label}
          aria-pressed={view === key}
          icon={<Icon size={11} />}
          color={view === key ? 'page.fg' : 'page.fg-secondary'}
          bg={view === key ? 'page.bg' : 'transparent'}
          boxShadow={view === key ? '0 0 0 1px var(--chakra-colors-page-border-strong)' : 'none'}
          onClick={() => {
            setView(key)
            writeView(key)
          }}
        />
      ))}
    </HStack>
  )

  const anyFilter = isFiltered(filter)

  return (
    <AdminPageShell
      headTitle="Admin · Media"
      eyebrow="[admin] content"
      title="Media"
      maxW="var(--container-wide, 1280px)"
      actions={
        <>
          <Button size="sm" {...primaryButtonProps} onClick={() => fileRef.current?.click()} isDisabled={status !== 'ready'}>
            Upload…
          </Button>
          <BackLink href="/admin">← Admin</BackLink>
        </>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        aria-hidden
        tabIndex={-1}
        data-testid="media-upload-input"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          e.target.value = ''
          queue.add(files)
        }}
      />

      {status === 'expired' ? (
        <SessionExpiredNotice returnPath={router.asPath || '/admin/media'} />
      ) : status === 'error' ? (
        <LoadErrorNotice what="the media library" error={loadError} onRetry={() => void load()} />
      ) : (
        <>
          <Flex align="center" justify="space-between" gap={3} flexWrap="wrap" mb={5}>
            <SegmentedTabs
              items={tabs}
              value={tab}
              onSelect={(t) => {
                setTab(t)
                syncUrl({ tab: t })
              }}
              label="Media sections"
              idPrefix="media"
              size="sm"
            />
            <Text fontSize="xs" color="page.fg-secondary" className="tnum" role="status" aria-live="polite" data-testid="media-summary">
              {status === 'loading' || !data
                ? 'Loading…'
                : `${items.length} image${items.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)} with every size${anyFilter && tab === 'library' ? ` · ${shown.length} shown` : ''}`}
              {data?.r2.configured ? (
                <>
                  {' · '}
                  {r2Checking ? 'checking R2…' : data.r2.checkedAt ? `R2 checked ${relativeTime(data.r2.checkedAt, now)}` : 'R2 not checked yet'}{' '}
                  <Button size="xs" variant="link" color="accent.text" onClick={() => void checkR2(false)} isDisabled={r2Checking}>
                    Check now
                  </Button>
                </>
              ) : null}
            </Text>
          </Flex>

          <Box {...tabPanelProps('media', tab)}>
            {tab === 'trash' ? (
              status === 'loading' || !data ? (
                <Skeleton h="120px" borderRadius="lg" />
              ) : (
                <TrashList items={data.trash} now={now} days={data.trashDays} busy={busy} onRestore={(n) => void restore([n])} onPurge={(n) => void purge(n)} />
              )
            ) : (
              <>
                <Flex gap={2.5} flexWrap="wrap" align="center" mb={3}>
                  <InputGroup size="sm" flex={{ base: '1 1 100%', md: '1 1 280px' }} maxW={{ md: '420px' }}>
                    <InputLeftElement pointerEvents="none">
                      <SearchIcon color="page.fg-secondary" boxSize={3} />
                    </InputLeftElement>
                    <Input
                      ref={searchRef}
                      {...inputProps}
                      type="search"
                      value={filter.q}
                      onChange={(e) => updateFilter({ ...filter, q: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape' && filter.q) {
                          e.stopPropagation()
                          updateFilter({ ...filter, q: '' })
                        }
                      }}
                      placeholder="Search names, alt text, captions, pages"
                      aria-label="Search the media library"
                      borderRadius="md"
                    />
                    <InputRightElement pointerEvents="none" display={{ base: 'none', md: 'flex' }} w="2.2rem">
                      <Kbd fontSize="10px" bg="page.bg-elevated" borderColor="page.border-strong" color="page.fg-secondary" aria-hidden>
                        /
                      </Kbd>
                    </InputRightElement>
                  </InputGroup>
                  <Select
                    size="sm"
                    {...inputProps}
                    w="auto"
                    borderRadius="md"
                    value={filter.type}
                    onChange={(e) => updateFilter({ ...filter, type: e.target.value as MediaFilter['type'] })}
                    aria-label="Type"
                  >
                    <option value="all">All types</option>
                    {MEDIA_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {formatLabel(t)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    size="sm"
                    {...inputProps}
                    w="auto"
                    borderRadius="md"
                    value={filter.orientation}
                    onChange={(e) => updateFilter({ ...filter, orientation: e.target.value as MediaFilter['orientation'] })}
                    aria-label="Shape"
                  >
                    <option value="all">Any shape</option>
                    {ORIENTATIONS.map((o) => (
                      <option key={o} value={o}>
                        {o[0].toUpperCase() + o.slice(1)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    size="sm"
                    {...inputProps}
                    w="auto"
                    borderRadius="md"
                    value={sort}
                    onChange={(e) => {
                      const s = e.target.value as MediaSort
                      setSort(s)
                      syncUrl({ sort: s })
                    }}
                    aria-label="Sort"
                  >
                    {SORTS.map((s) => (
                      <option key={s} value={s}>
                        {SORT_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                  <Box ml={{ base: 0, md: 'auto' }}>{viewToggle}</Box>
                </Flex>

                <Flex gap={1.5} flexWrap="wrap" align="center" mb={4} role="group" aria-label="Show only">
                  {FLAGS.filter((f) => f !== 'notInR2' || data?.r2.configured).map((f) => {
                    const on = filter.flags.includes(f)
                    return (
                      <Button
                        key={f}
                        size="xs"
                        variant="outline"
                        borderRadius="full"
                        aria-pressed={on}
                        title={FLAG_HINT[f]}
                        onClick={() => toggleFlag(f)}
                        borderColor={on ? 'accent.500' : 'page.border-strong'}
                        bg={on ? 'var(--accent-soft)' : 'transparent'}
                        color={on ? 'accent.text' : 'page.fg'}
                        _hover={{ bg: on ? 'var(--accent-soft)' : 'page.bg-overlay' }}
                        fontWeight={500}
                        data-testid={`flag-${f}`}
                      >
                        {FLAG_LABEL[f]}
                        <Box as="span" ml={1.5} fontFamily={MONO} fontSize="10px" color={on ? 'accent.text' : 'page.fg-secondary'} className="tnum">
                          {counts[f]}
                        </Box>
                      </Button>
                    )
                  })}
                  {anyFilter ? (
                    <Button size="xs" variant="ghost" color="page.fg-secondary" onClick={() => updateFilter(EMPTY_FILTER)}>
                      Clear filters
                    </Button>
                  ) : null}
                </Flex>

                {status === 'loading' || !data || !ready ? (
                  <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(168px, 1fr))" gap={3} aria-busy="true" aria-label="Loading images">
                    {Array.from({ length: 8 }, (_, i) => (
                      <Skeleton key={i} borderRadius="lg" sx={{ aspectRatio: '1 / 1.2' }} />
                    ))}
                  </Box>
                ) : !items.length ? (
                  <Box border="1px dashed" borderColor="page.border-strong" borderRadius="xl" px={6} py={14} textAlign="center" data-testid="media-empty">
                    <Text fontWeight={500}>No images yet</Text>
                    <Text fontSize="sm" color="page.fg-secondary" mt={1}>
                      Upload one, or drop images anywhere on this page. Each gets WebP and AVIF sizes and a blur placeholder.
                    </Text>
                    <Button size="sm" mt={4} {...primaryButtonProps} onClick={() => fileRef.current?.click()}>
                      Upload images…
                    </Button>
                  </Box>
                ) : !shown.length ? (
                  <Box border="1px dashed" borderColor="page.border-strong" borderRadius="xl" px={6} py={12} textAlign="center">
                    <Text fontWeight={500}>No image matches</Text>
                    <Button size="sm" mt={3} {...outlineButtonProps} onClick={() => updateFilter(EMPTY_FILTER)}>
                      Clear filters
                    </Button>
                  </Box>
                ) : (
                  <MediaCollection
                    items={shown}
                    view={view}
                    selected={selected}
                    fresh={fresh}
                    current={openName}
                    onOpen={(item) => open(item)}
                    onToggle={toggle}
                    onToggleAll={toggleAll}
                    now={now}
                    label="Images"
                  />
                )}
                <Text fontSize="xs" color="page.fg-secondary" mt={4} display={{ base: 'none', md: 'block' }}>
                  Drop images anywhere on this page to upload them. Select several with their checkboxes (Shift for a range) or X.
                </Text>
              </>
            )}
          </Box>
        </>
      )}

      {selected.size && tab === 'library' ? (
        <Flex
          position="sticky"
          bottom={{ base: 3, md: 5 }}
          mt={5}
          zIndex={20}
          align="center"
          gap={2}
          flexWrap="wrap"
          px={4}
          py={2.5}
          bg="page.bg-elevated"
          border="1px solid"
          borderColor="page.border-strong"
          borderRadius="xl"
          boxShadow="0 14px 40px -12px rgba(0,0,0,0.35)"
          role="region"
          aria-label="Selected images"
          data-testid="bulk-bar"
          sx={{
            '@keyframes barIn': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
            animation: 'barIn 250ms var(--ease-standard, ease)',
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <Text fontSize="sm" fontWeight={500} mr={2} className="tnum">
            {selected.size} selected
          </Text>
          <Button size="xs" {...outlineButtonProps} onClick={() => void bulkGenerate()} isLoading={busy === 'optimize'} loadingText="Generating" isDisabled={!selectedItems.some((i) => matchesFlag(i, 'needsSizes')) || !!busy}>
            Generate responsive versions
          </Button>
          {data?.r2.configured ? (
            <Button size="xs" {...outlineButtonProps} onClick={() => void bulkMirror()} isLoading={busy === 'r2'} loadingText="Copying" isDisabled={!selectedItems.some((i) => i.local && matchesFlag(i, 'notInR2')) || !!busy}>
              Copy to R2
            </Button>
          ) : null}
          <Button size="xs" variant="outline" colorScheme="red" borderColor="page.border-strong" onClick={() => setConfirmTrash(true)} isDisabled={!trashable.length || !!busy} isLoading={busy === 'trash'} loadingText="Moving">
            {trashable.length === selected.size ? 'Move to trash…' : `Move ${trashable.length} unused to trash…`}
          </Button>
          <Button size="xs" variant="ghost" color="page.fg-secondary" ml="auto" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </Flex>
      ) : null}

      <MediaDrawer
        item={openItem ?? lastOpen.current}
        isOpen={!!openItem}
        onClose={close}
        now={now}
        r2Configured={!!data?.r2.configured}
        onLibrary={(lib, focus) => {
          if (lib) apply(lib)
          else void load()
          if (focus) {
            setOpenName(focus)
            syncUrl({ open: focus })
          }
        }}
        onMeta={onMeta}
        onTrashed={onTrashed}
        finalFocusRef={tileFocus as React.RefObject<HTMLElement>}
      />

      <AlertDialog isOpen={confirmTrash} leastDestructiveRef={cancelRef} onClose={() => setConfirmTrash(false)} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
            <AlertDialogHeader fontSize="md">
              Move {trashable.length} image{trashable.length === 1 ? '' : 's'} to the trash?
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              Nothing on the site uses {trashable.length === 1 ? 'it' : 'them'}.{' '}
              {selected.size > trashable.length ? `${selected.size - trashable.length} selected image${selected.size - trashable.length === 1 ? ' is' : 's are'} still used and stay${selected.size - trashable.length === 1 ? 's' : ''}. ` : ''}
              They leave this server{data?.r2.configured ? ' and R2' : ''} now; you can restore them from the trash for {data?.trashDays ?? 30} days.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" {...outlineButtonProps} onClick={() => setConfirmTrash(false)}>
                Cancel
              </Button>
              <Button size="sm" colorScheme="red" onClick={() => void bulkTrash()}>
                Move to trash
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      <DropOverlay show={dragging} label="Drop to upload to the media library" />
      <UploadPanel items={queue.items} summary={queue.summary} onRetry={queue.retry} onClear={queue.clearFinished} />
    </AdminPageShell>
  )
}
