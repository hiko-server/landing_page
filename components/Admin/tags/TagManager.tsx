import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Skeleton,
  Spinner,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react'
import { Collapse } from '../../General-UI/Collapse'
import SegmentedTabs, { tabPanelProps, type SegmentedItem } from '../shell/SegmentedTabs'
import { LoadErrorNotice, MONO, RevalidatedPaths, inputProps, outlineButtonProps, primaryButtonProps, warnTextProps } from '../shell/ui'
import { loginHref, parseRevalidated, readJsonObject } from '../shell/http'
import { tagChangeLabel, tagNameProblem, type TagCollection, type TagEntry } from '../../../lib/tagAdmin'
import { tagSlug } from '../../../lib/tagFilter'

/**
 * Tag management (H16): every post tag and case-study tech entry with how
 * many items use it and which, every spelling in use, and rename / merge
 * across all items with a preview of what changes first. Writes go through
 * /api/admin/tags (a history snapshot per item; the public pages refresh).
 */

type Inventory = Record<TagCollection, TagEntry[]>
type ChangeItem = { slug: string; title: string; before: string[]; after: string[]; pendingOnly: boolean }
type Plan = { state: 'idle' } | { state: 'checking' } | { state: 'ready'; items: ChangeItem[]; mergesInto: string | null } | { state: 'error'; error: string }

const TABS: SegmentedItem<TagCollection>[] = [
  { key: 'blog', label: 'Post tags' },
  { key: 'work', label: 'Case-study tech' },
]

const NOUN: Record<TagCollection, [string, string]> = { blog: ['post', 'posts'], work: ['case study', 'case studies'] }

function ChangeDialog({
  collection,
  tags,
  onClose,
  onDone,
}: {
  collection: TagCollection
  /** The tags being renamed (one) or merged (several). */
  tags: TagEntry[]
  onClose: () => void
  onDone: (paths: string[]) => void
}) {
  const ids = useId()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const merging = tags.length > 1
  // Merge: the most used tag's name; rename: the main spelling (edit it).
  const [name, setName] = useState(() => [...tags].sort((a, b) => b.count - a.count)[0]?.label ?? '')
  const [plan, setPlan] = useState<Plan>({ state: 'idle' })
  const [busy, setBusy] = useState(false)
  const problem = tagNameProblem(name)
  const from = useMemo(() => tags.map((t) => t.slug), [tags])

  useEffect(() => {
    if (problem) {
      setPlan({ state: 'idle' })
      return
    }
    let alive = true
    setPlan({ state: 'checking' })
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collection, from, to: name, dryRun: true }),
        })
        const data = await readJsonObject(res)
        if (!alive) return
        if (!res.ok) setPlan({ state: 'error', error: data.error || `HTTP ${res.status}` })
        else setPlan({ state: 'ready', items: Array.isArray(data.items) ? data.items : [], mergesInto: typeof data.mergesInto === 'string' ? data.mergesInto : null })
      } catch {
        if (alive) setPlan({ state: 'error', error: 'Network error — nothing checked.' })
      }
    }, 300)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [collection, from, name, problem])

  const canApply = !problem && !busy && plan.state === 'ready' && plan.items.length > 0

  const apply = async () => {
    if (!canApply) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, from, to: name }),
      })
      const data = await readJsonObject(res)
      if (!res.ok) throw new Error(res.status === 401 ? 'Your session has expired — sign in again.' : data.error || `HTTP ${res.status}`)
      const n = Array.isArray(data.items) ? data.items.length : 0
      const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : []
      toast({
        status: warnings.length ? 'warning' : 'success',
        title: `${merging ? 'Merged' : 'Renamed'} — ${n} ${NOUN[collection][n === 1 ? 0 : 1]} updated`,
        description: warnings.length ? warnings.join(' · ') : 'Each one got a history snapshot first; the public pages are refreshed.',
        position: 'bottom-right',
        duration: 6000,
        isClosable: true,
      })
      onDone(parseRevalidated(data))
    } catch (e) {
      toast({ status: 'error', title: 'Nothing changed', description: e instanceof Error ? (e.message === 'Failed to fetch' ? 'Network error.' : e.message) : String(e), position: 'bottom-right' })
    } finally {
      setBusy(false)
    }
  }

  const sameAsNow = !merging && tags[0] && name.trim() === tags[0].label && tags[0].spellings.length === 1

  return (
    <Modal isOpen onClose={onClose} initialFocusRef={inputRef} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
        <ModalHeader fontSize="md" pb={1} pr={12} wordBreak="break-word">
          {merging ? `Merge ${tags.length} tags` : `Rename “${tags[0]?.label}”`}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            {merging ? (
              <Text fontSize="sm" color="page.fg-secondary">
                {tags.map((t) => `“${t.label}”`).join(', ')} become one tag on every {NOUN[collection][0]}.
              </Text>
            ) : tags[0] && tags[0].spellings.length > 1 ? (
              <Text fontSize="sm" color="page.fg-secondary">
                Written {tags[0].spellings.length} ways today: {tags[0].spellings.map((s) => `“${s}”`).join(', ')}. Every spelling becomes the name below.
              </Text>
            ) : null}
            <FormControl isInvalid={!!problem && !!name}>
              <FormLabel fontSize="13px" htmlFor={`${ids}-name`}>
                {merging ? 'Merged tag name' : 'New name'}
              </FormLabel>
              <Input
                {...inputProps}
                ref={inputRef}
                id={`${ids}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void apply()
                  }
                }}
                autoComplete="off"
                aria-describedby={`${ids}-help`}
              />
              {problem && name ? (
                <FormErrorMessage fontSize="xs">{problem}</FormErrorMessage>
              ) : (
                <FormHelperText id={`${ids}-help`} fontSize="xs" color="page.fg-secondary">
                  Filter link: <Text as="span" fontFamily={MONO}>?tag={tagSlug(name) || '…'}</Text>
                </FormHelperText>
              )}
            </FormControl>

            <Box role="status" aria-live="polite" minH="48px" fontSize="sm">
              {plan.state === 'checking' ? (
                <Flex align="center" gap={2} color="page.fg-secondary">
                  <Spinner size="xs" /> Checking which {NOUN[collection][1]} change…
                </Flex>
              ) : plan.state === 'error' ? (
                <Text color="status.error">{plan.error}</Text>
              ) : plan.state === 'ready' ? (
                plan.items.length ? (
                  <Box>
                    <Text>
                      {tagChangeLabel(
                        tags.map((t) => t.label),
                        name,
                      )}{' '}
                      on {plan.items.length} {NOUN[collection][plan.items.length === 1 ? 0 : 1]}:
                    </Text>
                    {plan.mergesInto ? (
                      <Text fontSize="xs" mt={1} {...warnTextProps}>
                        “{name.trim()}” already exists — these merge into it.
                      </Text>
                    ) : null}
                    <Box as="ul" mt={2} pl={0} listStyleType="none" fontSize="13px">
                      {plan.items.map((it) => (
                        <Box as="li" key={it.slug} py={1.5} borderTop="1px solid" borderColor="page.border">
                          <Text fontWeight={500} noOfLines={1}>
                            {it.title}
                            {it.pendingOnly ? (
                              <Text as="span" fontWeight={400} color="page.fg-secondary">
                                {' '}
                                (unpublished changes)
                              </Text>
                            ) : null}
                          </Text>
                          <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" noOfLines={2}>
                            {it.before.join(', ') || '—'} → {it.after.join(', ') || '—'}
                          </Text>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ) : (
                  <Text color="page.fg-secondary">{sameAsNow ? 'That is already its name.' : 'Nothing would change.'}</Text>
                )
              ) : null}
            </Box>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button size="sm" {...outlineButtonProps} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" {...primaryButtonProps} onClick={() => void apply()} isDisabled={!canApply} isLoading={busy} loadingText={merging ? 'Merging' : 'Renaming'}>
            {merging ? 'Merge' : 'Rename'}
            {plan.state === 'ready' && plan.items.length ? ` (${plan.items.length})` : ''}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function TagRow({
  collection,
  tag,
  selected,
  onSelect,
  onRename,
}: {
  collection: TagCollection
  tag: TagEntry
  selected: boolean
  onSelect: (on: boolean) => void
  onRename: () => void
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const variants = tag.spellings.length > 1
  return (
    <Box as="li" borderTop="1px solid" borderColor="page.border" _first={{ borderTop: 'none' }} data-testid="tag-row">
      <Flex align="center" gap={3} px={{ base: 3, md: 4 }} py={2.5} minH="52px">
        <Checkbox colorScheme="accent" isChecked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select “${tag.label}”`} />
        <Box flex={1} minW={0}>
          <Text fontWeight={500} noOfLines={1}>
            {tag.label}
          </Text>
          {variants ? (
            <Text fontSize="xs" {...warnTextProps} noOfLines={1}>
              Also written {tag.spellings.slice(1).map((s) => `“${s}”`).join(', ')}
            </Text>
          ) : (
            <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" noOfLines={1}>
              ?tag={tag.slug}
            </Text>
          )}
        </Box>
        <Button
          size="xs"
          minH="28px"
          variant="ghost"
          color="page.fg-secondary"
          fontWeight={400}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="tnum"
        >
          {tag.count} {NOUN[collection][tag.count === 1 ? 0 : 1]} {open ? '▴' : '▾'}
        </Button>
        <Button size="xs" minH="28px" {...outlineButtonProps} onClick={onRename} aria-label={variants ? `Unify the spellings of “${tag.label}”` : `Rename “${tag.label}”`}>
          {variants ? 'Unify…' : 'Rename…'}
        </Button>
      </Flex>
      <Collapse open={open} id={listId}>
        <Box as="ul" listStyleType="none" m={0} px={{ base: 3, md: 4 }} pb={3} pl={{ base: 10, md: 12 }} fontSize="13px">
          {tag.items.map((it) => (
            <Box as="li" key={it.slug} py={0.5}>
              <Link as={NextLink} href={`/admin/${collection}/edit?slug=${encodeURIComponent(it.slug)}`} color="accent.text">
                {it.title}
              </Link>
              {it.draft ? (
                <Badge ml={2} colorScheme="yellow" variant="subtle" fontSize="9px">
                  draft
                </Badge>
              ) : null}
              {it.pendingOnly ? (
                <Text as="span" ml={2} fontSize="11px" color="page.fg-secondary">
                  in unpublished changes
                </Text>
              ) : null}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  )
}

export default function TagManager() {
  const router = useRouter()
  const [collection, setCollection] = useState<TagCollection>('blog')
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<TagEntry[] | null>(null)
  const [revalidated, setRevalidated] = useState<string[]>([])
  const filterId = useId()

  useEffect(() => {
    if (!router.isReady) return
    if (router.query.c === 'work') setCollection('work')
  }, [router.isReady, router.query.c])

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await fetch('/api/admin/tags', { cache: 'no-store' })
      if (res.status === 401) {
        void router.replace(loginHref('/admin/tags'))
        return
      }
      const data = await readJsonObject(res)
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setInventory({ blog: Array.isArray(data.blog) ? data.blog : [], work: Array.isArray(data.work) ? data.work : [] })
    } catch (e) {
      setError(e instanceof Error ? (e.message === 'Failed to fetch' ? 'network error' : e.message) : String(e))
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const switchTo = (c: TagCollection) => {
    setCollection(c)
    setSelected(new Set())
    setFilter('')
    const query = { ...router.query }
    if (c === 'work') query.c = 'work'
    else delete query.c
    void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false })
  }

  const tags = useMemo(() => inventory?.[collection] ?? [], [inventory, collection])
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return tags
    const qs = tagSlug(q)
    return tags.filter((t) => t.spellings.some((s) => s.toLowerCase().includes(q)) || (!!qs && t.slug.includes(qs)))
  }, [tags, filter])
  const chosen = tags.filter((t) => selected.has(t.slug))
  const variantCount = tags.filter((t) => t.spellings.length > 1).length

  const items: SegmentedItem<TagCollection>[] = TABS.map((t) => ({ ...t, label: inventory ? `${t.label} · ${inventory[t.key].length}` : t.label }))

  return (
    <Stack spacing={4}>
      <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
        <SegmentedTabs items={items} value={collection} onSelect={switchTo} label="Tag lists" idPrefix="tags" size="sm" />
        <Input
          {...inputProps}
          id={filterId}
          size="sm"
          maxW={{ base: '100%', sm: '260px' }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter tags"
          aria-label="Filter tags"
          type="search"
        />
      </Flex>

      <Box {...tabPanelProps('tags', collection)}>
        {revalidated.length ? (
          <Box mb={3}>
            <RevalidatedPaths paths={revalidated} />
          </Box>
        ) : null}
        {error ? (
          <LoadErrorNotice what="the tags" error={error} onRetry={() => void load()} />
        ) : !inventory ? (
          <Stack spacing={2} aria-busy="true" aria-label="Loading tags">
            <Skeleton h="52px" />
            <Skeleton h="52px" />
            <Skeleton h="52px" />
          </Stack>
        ) : !tags.length ? (
          <Text fontSize="sm" color="page.fg-secondary" py={6} textAlign="center" border="1px dashed" borderColor="page.border" borderRadius="xl">
            {collection === 'blog'
              ? 'No post has tags yet — add them in a post’s Tags field.'
              : 'No case study lists its tech yet — add it in a case study’s Tech field.'}
          </Text>
        ) : (
          <>
            <Flex align="center" justify="space-between" gap={3} mb={2} minH="32px" flexWrap="wrap">
              <Text fontSize="xs" color="page.fg-secondary">
                {variantCount
                  ? `${variantCount} tag${variantCount === 1 ? ' is' : 's are'} written more than one way — “Unify…” picks one spelling.`
                  : 'Select two or more tags to merge them.'}
              </Text>
              <Flex gap={2} align="center">
                {selected.size ? (
                  <Button size="xs" minH="28px" variant="ghost" color="page.fg-secondary" onClick={() => setSelected(new Set())}>
                    Clear ({selected.size})
                  </Button>
                ) : null}
                <Button size="xs" minH="28px" {...primaryButtonProps} isDisabled={chosen.length < 2} onClick={() => setDialog(chosen)}>
                  Merge{chosen.length >= 2 ? ` ${chosen.length} tags` : ''}…
                </Button>
              </Flex>
            </Flex>
            <Box as="ul" listStyleType="none" m={0} border="1px solid" borderColor="page.border" borderRadius="xl" bg="page.bg" overflow="hidden" aria-label={collection === 'blog' ? 'Post tags' : 'Case-study tech'}>
              {shown.map((tag) => (
                <TagRow
                  key={tag.slug}
                  collection={collection}
                  tag={tag}
                  selected={selected.has(tag.slug)}
                  onSelect={(on) =>
                    setSelected((s) => {
                      const next = new Set(s)
                      if (on) next.add(tag.slug)
                      else next.delete(tag.slug)
                      return next
                    })
                  }
                  onRename={() => setDialog([tag])}
                />
              ))}
              {!shown.length ? (
                <Box as="li" px={4} py={6} textAlign="center" fontSize="sm" color="page.fg-secondary">
                  No tag matches “{filter}”.
                </Box>
              ) : null}
            </Box>
          </>
        )}
      </Box>

      {dialog ? (
        <ChangeDialog
          collection={collection}
          tags={dialog}
          onClose={() => setDialog(null)}
          onDone={(paths) => {
            setDialog(null)
            setSelected(new Set())
            setRevalidated(paths)
            void load()
          }}
        />
      ) : null}
    </Stack>
  )
}
