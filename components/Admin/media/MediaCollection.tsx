import React, { useCallback, useRef } from 'react'
import { Box, Checkbox, Flex, Table, Tbody, Td, Text, Th, Thead, Tr, VisuallyHidden } from '@chakra-ui/react'
import type { MediaItem } from '../../../lib/media/types'
import { formatBytes, formatDims, formatLabel, hasDefaultAlt, needsSizes, relativeTime, tileLabel, usedInCount, usesWithoutAlt } from '../../../lib/media/view'
import { useListKeyboard } from '../shell/useListKeyboard'
import { SCROLL_REGION_FOCUS, useScrollRegion } from '../shell/scrollRegion'
import { MONO, warnTextProps } from '../shell/ui'
import MediaThumb from './MediaThumb'

/**
 * The media library's grid and list (H7). One upload per tile / row; the
 * tile's button opens the detail drawer and carries the roving focus
 * (useListKeyboard: ↑ ↓ ← → move — by rows and columns in the grid — Home /
 * End, Enter opens, X selects); the checkbox selects (Shift-click selects a
 * range). Badges say what needs attention: no alt text, unused, missing
 * sizes, only in R2.
 */

export type CollectionProps = {
  items: MediaItem[]
  view: 'grid' | 'list'
  selected: ReadonlySet<string>
  /** Names to mark as just uploaded. */
  fresh?: ReadonlySet<string>
  /** The upload shown in the drawer / picker (marked as current). */
  current?: string | null
  onOpen: (item: MediaItem, index: number) => void
  /** Picker: a double-click picks the image at once. */
  onActivate?: (item: MediaItem) => void
  onToggle: (item: MediaItem, index: number, range: boolean) => void
  onToggleAll?: (on: boolean) => void
  now: number
  /** Picker: tiles only, no checkboxes. */
  pickOnly?: boolean
  label: string
}

type Tone = 'warn' | 'muted' | 'info'

export function Flag({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  const color = tone === 'warn' ? warnTextProps : tone === 'info' ? { color: 'accent.text' } : { color: 'page.fg-secondary' }
  return (
    <Box
      as="span"
      title={title}
      display="inline-flex"
      alignItems="center"
      gap={1}
      px={1.5}
      h="18px"
      borderRadius="sm"
      border="1px solid"
      borderColor="page.border"
      bg="page.bg"
      fontFamily={MONO}
      fontSize="10px"
      letterSpacing="0.04em"
      whiteSpace="nowrap"
      {...color}
    >
      {tone === 'warn' ? <Box as="span" w="5px" h="5px" borderRadius="full" bg="orange.400" aria-hidden /> : null}
      {children}
    </Box>
  )
}

export function itemFlags(item: MediaItem): Array<{ key: string; tone: Tone; label: string; title: string }> {
  const out: Array<{ key: string; tone: Tone; label: string; title: string }> = []
  const noAlt = usesWithoutAlt(item).length
  if (!hasDefaultAlt(item)) out.push({ key: 'alt', tone: 'warn', label: 'No alt', title: 'No default alt text yet' })
  else if (noAlt) out.push({ key: 'alt', tone: 'warn', label: 'Alt missing', title: `Shown without alt text in ${noAlt} place${noAlt === 1 ? '' : 's'}` })
  if (!item.usage.length) out.push({ key: 'unused', tone: 'muted', label: 'Unused', title: 'Nothing on the site refers to it' })
  if (needsSizes(item)) out.push({ key: 'sizes', tone: 'info', label: 'Sizes', title: 'Some responsive versions are missing' })
  if (!item.local) out.push({ key: 'r2', tone: 'info', label: 'R2 only', title: 'Not on this server; served from R2' })
  return out
}

/** Columns of a CSS grid of tiles, measured from where the tiles wrap. */
function gridColumns(container: HTMLElement | null): number {
  const tiles = container ? Array.from(container.querySelectorAll<HTMLElement>('[data-list-item]')) : []
  if (!tiles.length) return 1
  const top = tiles[0].getBoundingClientRect().top
  let n = 0
  for (const t of tiles) {
    if (Math.abs(t.getBoundingClientRect().top - top) > 2) break
    n++
  }
  return Math.max(1, n)
}

export default function MediaCollection({ items, view, selected, fresh, current, onOpen, onActivate, onToggle, onToggleAll, now, pickOnly = false, label }: CollectionProps) {
  const containerRef = useRef<HTMLElement | null>(null)
  const { listProps, itemProps, focusItem, active } = useListKeyboard({
    count: items.length,
    onOpen: (i) => items[i] && onOpen(items[i], i),
    onSelect: pickOnly ? undefined : (i) => items[i] && onToggle(items[i], i, false),
  })
  const activeRef = useRef(active)
  activeRef.current = active

  const setRefs = useCallback(
    (el: HTMLElement | null) => {
      containerRef.current = el
      listProps.ref(el)
    },
    [listProps],
  )

  // The grid moves by rows and columns; everything else is the list's model.
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (view === 'grid' && !e.altKey && !e.metaKey && !e.ctrlKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const target = e.target as HTMLElement
      if (!target.hasAttribute('data-list-item')) return
      const from = Math.max(0, activeRef.current)
      const cols = gridColumns(containerRef.current)
      const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -cols : cols
      const to = Math.min(items.length - 1, Math.max(0, from + delta))
      e.preventDefault()
      if (to !== from) focusItem(to)
      return
    }
    listProps.onKeyDown(e)
  }

  const [scrollRef, regionProps] = useScrollRegion(`${label}, scrolls sideways`)
  const allOn = items.length > 0 && items.every((i) => selected.has(i.name))
  const someOn = !allOn && items.some((i) => selected.has(i.name))
  const anySelected = selected.size > 0

  const help = (
    <VisuallyHidden>
      {view === 'grid' ? 'Arrow keys move between images, ' : 'Up and down arrows move between images, '}
      Enter opens one{pickOnly ? '' : ', X selects it'}.
    </VisuallyHidden>
  )

  if (view === 'grid') {
    return (
      <Box>
        {help}
        <Box
          as="ul"
          role="list"
          aria-label={label}
          ref={setRefs}
          onKeyDown={onKeyDown}
          display="grid"
          gridTemplateColumns={{ base: 'repeat(auto-fill, minmax(140px, 1fr))', md: `repeat(auto-fill, minmax(${pickOnly ? 140 : 168}px, 1fr))` }}
          gap={{ base: 2.5, md: 3 }}
          listStyleType="none"
        >
          {items.map((item, i) => {
            const isSel = selected.has(item.name)
            const isCurrent = current === item.name
            const isFresh = fresh?.has(item.name)
            const flags = itemFlags(item)
            return (
              <Box
                as="li"
                key={item.name}
                data-group=""
                position="relative"
                borderRadius="lg"
                border="1px solid"
                borderColor={isSel || isCurrent ? 'accent.500' : 'page.border'}
                boxShadow={isSel || isCurrent ? '0 0 0 1px var(--accent)' : isFresh ? '0 0 0 2px var(--accent-ring)' : 'none'}
                bg="page.bg"
                overflow="hidden"
                transition="border-color 150ms var(--ease-standard, ease), box-shadow 450ms var(--ease-standard, ease)"
                _hover={{ borderColor: isSel || isCurrent ? 'accent.500' : 'page.border-strong' }}
                sx={{
                  '& img': { transition: 'transform 250ms var(--ease-standard, ease)' },
                  '@media (hover: hover)': { '&:hover img': { transform: 'scale(1.015)' } },
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none', '& img': { transition: 'none' }, '&:hover img': { transform: 'none' } },
                }}
                data-testid="media-tile"
                data-name={item.name}
              >
                <Box
                  as="button"
                  type="button"
                  display="block"
                  w="100%"
                  textAlign="left"
                  onClick={() => onOpen(item, i)}
                  onDoubleClick={onActivate ? () => onActivate(item) : undefined}
                  aria-label={tileLabel(item)}
                  aria-current={isCurrent ? 'true' : undefined}
                  _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px', borderRadius: 'lg' }}
                  {...itemProps(i)}
                >
                  <Box position="relative" sx={{ aspectRatio: '1 / 1' }}>
                    <MediaThumb src={item.thumb} placeholder={item.placeholder} width={item.width} height={item.height} inset={2} />
                  </Box>
                  <Box px={2.5} py={2} borderTop="1px solid" borderColor="page.border" minW={0}>
                    <Text fontFamily={MONO} fontSize="11px" noOfLines={1} title={item.name} color="page.fg">
                      {item.name}
                    </Text>
                    <Text fontSize="11px" color="page.fg-secondary" className="tnum" noOfLines={1}>
                      {formatDims(item.width, item.height)} · {formatBytes(item.bytes)}
                    </Text>
                  </Box>
                </Box>
                {!pickOnly ? (
                  <Checkbox
                    position="absolute"
                    top={2}
                    left={2}
                    size="md"
                    bg="page.bg"
                    borderRadius="sm"
                    tabIndex={-1}
                    isChecked={isSel}
                    onChange={(e) => onToggle(item, i, (e.nativeEvent as MouseEvent).shiftKey === true)}
                    aria-label={`Select ${item.name}`}
                    opacity={anySelected || isSel ? 1 : 0}
                    transition="opacity 150ms"
                    _groupHover={{ opacity: 1 }}
                    sx={{ '[data-group]:focus-within &': { opacity: 1 }, '@media (hover: none)': { opacity: 1 } }}
                  />
                ) : null}
                {flags.length ? (
                  <Flex position="absolute" top={2} right={2} gap={1} flexWrap="wrap" justify="flex-end" maxW="calc(100% - 40px)" pointerEvents="none" aria-hidden>
                    {flags.slice(0, pickOnly ? 1 : 2).map((f) => (
                      <Flag key={f.key} tone={f.tone} title={f.title}>
                        {f.label}
                      </Flag>
                    ))}
                  </Flex>
                ) : null}
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  }

  return (
    <Box>
      {help}
      <Box ref={scrollRef} overflowX="auto" border="1px solid" borderColor="page.border" borderRadius="lg" _focusVisible={SCROLL_REGION_FOCUS} {...regionProps}>
        <Table size="sm" sx={{ 'th, td': { borderColor: 'page.border' } }}>
          <Thead>
            <Tr>
              {!pickOnly ? (
                <Th w="40px" px={3}>
                  <Checkbox
                    isChecked={allOn}
                    isIndeterminate={someOn}
                    onChange={(e) => onToggleAll?.(e.target.checked)}
                    aria-label={allOn ? 'Unselect all shown' : 'Select all shown'}
                  />
                </Th>
              ) : null}
              <Th>Image</Th>
              <Th isNumeric>Size</Th>
              <Th display={{ base: 'none', md: 'table-cell' }}>Pixels</Th>
              <Th display={{ base: 'none', lg: 'table-cell' }}>Type</Th>
              <Th>Used in</Th>
              <Th display={{ base: 'none', md: 'table-cell' }}>Alt text</Th>
              <Th display={{ base: 'none', lg: 'table-cell' }}>Added</Th>
            </Tr>
          </Thead>
          <Tbody ref={setRefs} onKeyDown={onKeyDown} aria-label={label}>
            {items.map((item, i) => {
              const isSel = selected.has(item.name)
              const used = usedInCount(item)
              const noAlt = usesWithoutAlt(item).length
              return (
                <Tr
                  key={item.name}
                  bg={isSel ? 'var(--accent-soft)' : current === item.name ? 'page.bg-overlay' : undefined}
                  _hover={{ bg: isSel ? 'var(--accent-soft)' : 'page.bg-overlay' }}
                  data-testid="media-row"
                  data-name={item.name}
                >
                  {!pickOnly ? (
                    <Td px={3}>
                      <Checkbox
                        tabIndex={-1}
                        isChecked={isSel}
                        onChange={(e) => onToggle(item, i, (e.nativeEvent as MouseEvent).shiftKey === true)}
                        aria-label={`Select ${item.name}`}
                      />
                    </Td>
                  ) : null}
                  <Td maxW={{ base: '200px', md: '360px' }}>
                    <Flex
                      as="button"
                      type="button"
                      align="center"
                      gap={3}
                      w="100%"
                      textAlign="left"
                      onClick={() => onOpen(item, i)}
                      aria-label={tileLabel(item)}
                      borderRadius="md"
                      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                      {...itemProps(i)}
                    >
                      <Box position="relative" w="40px" h="40px" flexShrink={0} borderRadius="md" overflow="hidden" border="1px solid" borderColor="page.border">
                        <MediaThumb src={item.thumb} placeholder={item.placeholder} width={item.width} height={item.height} />
                      </Box>
                      <Text fontFamily={MONO} fontSize="12px" noOfLines={1} title={item.name} minW={0}>
                        {item.name}
                      </Text>
                    </Flex>
                  </Td>
                  <Td isNumeric className="tnum" whiteSpace="nowrap">
                    {formatBytes(item.bytes)}
                  </Td>
                  <Td display={{ base: 'none', md: 'table-cell' }} className="tnum" whiteSpace="nowrap">
                    {formatDims(item.width, item.height)}
                  </Td>
                  <Td display={{ base: 'none', lg: 'table-cell' }}>{formatLabel(item.format)}</Td>
                  <Td whiteSpace="nowrap">{used ? `${used} place${used === 1 ? '' : 's'}` : <Text as="span" color="page.fg-secondary">Unused</Text>}</Td>
                  <Td display={{ base: 'none', md: 'table-cell' }}>
                    {!hasDefaultAlt(item) ? (
                      <Flag tone="warn">None yet</Flag>
                    ) : noAlt ? (
                      <Flag tone="warn" title={`Shown without alt text in ${noAlt} place${noAlt === 1 ? '' : 's'}`}>
                        Missing in {noAlt}
                      </Flag>
                    ) : (
                      <Text as="span" fontSize="xs" noOfLines={1} maxW="220px" title={item.meta?.alt || item.meta?.altZh}>
                        {item.meta?.alt || item.meta?.altZh}
                      </Text>
                    )}
                  </Td>
                  <Td display={{ base: 'none', lg: 'table-cell' }} whiteSpace="nowrap" color="page.fg-secondary" title={new Date(item.addedAt).toLocaleString('en-GB')}>
                    {relativeTime(item.addedAt, now)}
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      </Box>
    </Box>
  )
}
