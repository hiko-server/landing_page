import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Skeleton,
  Text,
  Textarea,
  useToast,
} from '@chakra-ui/react'
import { SearchIcon } from '@chakra-ui/icons'
import type { MediaItem, MediaLibraryResponse } from '../../../lib/media/types'
import { ALT_MAX, CAPTION_MAX, metaFor } from '../../../lib/media/meta'
import { EMPTY_FILTER, filterItems, formatBytes, formatDims, sortItems } from '../../../lib/media/view'
import SegmentedTabs, { tabPanelProps, type SegmentedItem } from '../shell/SegmentedTabs'
import { MONO, inputProps, outlineButtonProps, primaryButtonProps, warnTextProps } from '../shell/ui'
import { isFilenameAlt } from '../shell/publishChecks'
import { ACCEPT, fetchLibrary, postMedia } from './api'
import MediaCollection from './MediaCollection'
import MediaThumb from './MediaThumb'
import UploadPanel from './UploadPanel'
import { DropOverlay, useFileDrop } from './useFileDrop'
import { useUploadQueue } from './useUploadQueue'

/**
 * The image picker (H7): the media library inside the editors. Search,
 * pick, and the image's default alt text and caption are offered (in the
 * language chosen; kept per browser) — edit them for this place, and keep
 * them as the image's defaults if you like. Upload (button or drop) adds a
 * new image and selects it. ⌘ / Ctrl + Enter inserts; so does a
 * double-click on an image.
 *
 *   mode 'insert'  an image in a post / page body (alt + caption)
 *   mode 'cover'   a cover (alt only)
 *
 * Loaded on demand (next/dynamic) by components/Admin/RichEditor and
 * components/Admin/shell/CoverImageField.
 */

export type PickedImage = { name: string; url: string; width: number | null; height: number | null; alt: string; caption: string }

type Lang = 'en' | 'zh'
const LANGS: SegmentedItem<Lang>[] = [
  { key: 'en', label: 'English' },
  { key: 'zh', label: '中文' },
]
const LANG_KEY = 'media:pick-lang'

function readLang(): Lang {
  try {
    return window.localStorage.getItem(LANG_KEY) === 'zh' ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onPick: (image: PickedImage) => void
  mode?: 'insert' | 'cover'
}

export default function MediaPicker({ isOpen, onClose, onPick, mode = 'insert' }: Props) {
  const toast = useToast()
  const ids = useId()
  const [lib, setLib] = useState<MediaLibraryResponse | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [lang, setLang] = useState<Lang>('en')
  const [alt, setAlt] = useState('')
  const [caption, setCaption] = useState('')
  const [keep, setKeep] = useState(false)
  const [inserting, setInserting] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingSelect = useRef<string | null>(null)

  const load = useCallback(async () => {
    const out = await fetchLibrary()
    if (!out.ok) {
      setError(out.error)
      return
    }
    setError('')
    setLib(out.body)
    if (pendingSelect.current && out.body.items.some((i) => i.name === pendingSelect.current)) {
      setSelectedName(pendingSelect.current)
      pendingSelect.current = null
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setLang(readLang())
    void load()
  }, [isOpen, load])

  const items = useMemo(() => sortItems(filterItems((lib?.items ?? []).filter((i) => i.local), { ...EMPTY_FILTER, q }), 'newest'), [lib, q])
  const selected: MediaItem | null = selectedName ? lib?.items.find((i) => i.name === selectedName) ?? null : null
  const defaults = metaFor(selected?.meta ?? null, lang)
  const other = metaFor(selected?.meta ?? null, lang === 'en' ? 'zh' : 'en')

  // A new pick or language: start from that image's defaults.
  useEffect(() => {
    setAlt(defaults.alt)
    setCaption(defaults.caption)
    setKeep(!defaults.alt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedName, lang])

  // On a phone the texts sit under the grid: bring them into view after a pick.
  const choose = (item: MediaItem) => {
    setSelectedName(item.name)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' }))
    }
  }

  const changed = !!selected && (alt.trim() !== defaults.alt || (mode === 'insert' && caption.trim() !== defaults.caption))

  const queue = useUploadQueue((name) => {
    pendingSelect.current = name
    void load()
  })
  const { dragging } = useFileDrop((files) => queue.add(files.slice(0, 10)), isOpen)

  const pick = async (item: MediaItem | null = selected) => {
    if (!item || inserting) return
    const isSelected = item.name === selected?.name
    const texts = isSelected ? { alt: alt.trim(), caption: mode === 'insert' ? caption.trim() : '' } : { alt: metaFor(item.meta, lang).alt, caption: mode === 'insert' ? metaFor(item.meta, lang).caption : '' }
    if (isSelected && changed && keep) {
      setInserting(true)
      const fields =
        lang === 'en'
          ? { alt: texts.alt, ...(mode === 'insert' ? { caption: texts.caption } : {}) }
          : { altZh: texts.alt, ...(mode === 'insert' ? { captionZh: texts.caption } : {}) }
      const out = await postMedia({ action: 'meta', name: item.name, ...fields, expectedUpdatedAt: item.meta?.updatedAt ?? 0 })
      setInserting(false)
      if (!out.ok) toast({ status: 'warning', title: 'Inserted, but the defaults were not saved', description: out.error, position: 'bottom-right' })
    }
    onPick({ name: item.name, url: item.url, width: item.width, height: item.height, ...texts })
    onClose()
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && selected) {
      e.preventDefault()
      void pick()
    }
  }

  const title = mode === 'cover' ? 'Choose a cover image' : 'Insert an image'
  const altMissing = !!selected && !alt.trim()
  const altFile = !!alt.trim() && isFilenameAlt(alt.trim())

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={{ base: 'full', md: '6xl' }} scrollBehavior="inside" initialFocusRef={searchRef}>
      <ModalOverlay />
      <ModalContent
        bg="page.bg-elevated"
        border={{ md: '1px solid' }}
        borderColor="page.border"
        onKeyDown={onKeyDown}
        data-testid="media-picker"
        h={{ base: '100dvh', md: 'auto' }}
        maxH={{ base: '100dvh', md: '86vh' }}
      >
        <ModalHeader pb={2} pr={12}>
          <Text fontSize="md" fontWeight={600}>
            {title}
          </Text>
          <Text fontSize="xs" fontWeight={400} color="page.fg-secondary" mt={0.5}>
            From the media library{lib ? ` · ${lib.items.filter((i) => i.local).length} images` : ''} — or upload a new one (drop it anywhere here).
          </Text>
          <Flex gap={2} mt={3} flexWrap="wrap">
            <InputGroup size="sm" flex="1 1 240px">
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="page.fg-secondary" boxSize={3} />
              </InputLeftElement>
              <Input ref={searchRef} {...inputProps} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, alt text, captions, pages" aria-label="Search images" borderRadius="md" />
            </InputGroup>
            <Button size="sm" {...outlineButtonProps} onClick={() => fileRef.current?.click()}>
              Upload…
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                e.target.value = ''
                queue.add(files)
              }}
            />
          </Flex>
        </ModalHeader>
        <ModalCloseButton top={3} />
        <ModalBody pt={2}>
          <Flex gap={5} direction={{ base: 'column', md: 'row' }} align="stretch">
            <Box flex="1" minW={0}>
              {error ? (
                <Text role="alert" fontSize="sm" {...warnTextProps}>
                  Couldn’t load the media library ({error}).{' '}
                  <Button size="xs" variant="link" onClick={() => void load()}>
                    Retry
                  </Button>
                </Text>
              ) : !lib ? (
                <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(140px, 1fr))" gap={3} aria-busy="true" aria-label="Loading images">
                  {Array.from({ length: 8 }, (_, i) => (
                    <Skeleton key={i} borderRadius="lg" sx={{ aspectRatio: '1 / 1.2' }} />
                  ))}
                </Box>
              ) : !items.length ? (
                <Box border="1px dashed" borderColor="page.border-strong" borderRadius="lg" p={8} textAlign="center">
                  <Text fontSize="sm">{q ? 'No image matches.' : 'No images yet — upload one.'}</Text>
                </Box>
              ) : (
                <MediaCollection
                  items={items}
                  view="grid"
                  selected={new Set()}
                  current={selectedName}
                  onOpen={(item) => choose(item)}
                  onActivate={(item) => void pick(item)}
                  onToggle={() => undefined}
                  now={lib.generatedAt}
                  pickOnly
                  label="Images to choose from"
                />
              )}
            </Box>
            <Box
              ref={detailRef}
              as="aside"
              aria-label="Selected image"
              w={{ base: '100%', md: '320px' }}
              flexShrink={0}
              position={{ md: 'sticky' }}
              top={0}
              alignSelf="flex-start"
              border="1px solid"
              borderColor="page.border"
              borderRadius="lg"
              bg="page.bg"
              p={4}
            >
              {!selected ? (
                <Text fontSize="sm" color="page.fg-secondary">
                  Choose an image to see its alt text{mode === 'insert' ? ' and caption' : ''}.
                </Text>
              ) : (
                <>
                  <Box position="relative" h="170px" borderRadius="md" overflow="hidden" border="1px solid" borderColor="page.border">
                    <MediaThumb src={selected.thumb} placeholder={selected.placeholder} width={selected.width} height={selected.height} inset={2} />
                  </Box>
                  <Text fontFamily={MONO} fontSize="11px" mt={2} wordBreak="break-all">
                    {selected.name}
                  </Text>
                  <Text fontSize="11px" color="page.fg-secondary" className="tnum">
                    {formatDims(selected.width, selected.height)} · {formatBytes(selected.bytes)}
                  </Text>
                  <Box mt={3}>
                    <SegmentedTabs items={LANGS} value={lang} onSelect={(l) => {
                      setLang(l)
                      try {
                        window.localStorage.setItem(LANG_KEY, l)
                      } catch {
                        /* the choice lasts for this visit */
                      }
                    }} label="Language of the page" idPrefix={`${ids}-lang`} size="sm" />
                  </Box>
                  <Box {...tabPanelProps(`${ids}-lang`, lang)} mt={3} lang={lang === 'zh' ? 'zh-Hans' : 'en'}>
                    <FormControl>
                      <FormLabel htmlFor={`${ids}-alt`} fontSize="12px" mb={1}>
                        Alt text
                      </FormLabel>
                      <Textarea id={`${ids}-alt`} {...inputProps} size="sm" rows={2} maxLength={ALT_MAX} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder={lang === 'en' ? 'What the picture shows' : '图片内容的简短描述'} />
                    </FormControl>
                    {!alt.trim() && other.alt ? (
                      <Button size="xs" variant="link" color="accent.text" mt={1} onClick={() => setAlt(other.alt)}>
                        Start from the {lang === 'en' ? 'Chinese' : 'English'} text
                      </Button>
                    ) : null}
                    {mode === 'insert' ? (
                      <FormControl mt={3}>
                        <FormLabel htmlFor={`${ids}-caption`} fontSize="12px" mb={1}>
                          Caption
                        </FormLabel>
                        <Input id={`${ids}-caption`} {...inputProps} size="sm" maxLength={CAPTION_MAX} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Shown under the picture (optional)" />
                      </FormControl>
                    ) : null}
                  </Box>
                  {altMissing ? (
                    <Text fontSize="xs" {...warnTextProps} mt={2}>
                      No alt text: screen readers will skip this image.
                    </Text>
                  ) : altFile ? (
                    <Text fontSize="xs" {...warnTextProps} mt={2}>
                      That reads like a file name — describe the picture instead.
                    </Text>
                  ) : null}
                  {changed ? (
                    <Checkbox mt={3} size="sm" isChecked={keep} onChange={(e) => setKeep(e.target.checked)}>
                      <Text fontSize="xs">Also keep as this image’s default</Text>
                    </Checkbox>
                  ) : null}
                </>
              )}
            </Box>
          </Flex>
        </ModalBody>
        <ModalFooter gap={2} borderTop="1px solid" borderColor="page.border">
          <Text fontSize="xs" color="page.fg-secondary" mr="auto" display={{ base: 'none', md: 'block' }}>
            Double-click an image or press ⌘ / Ctrl + Enter to {mode === 'cover' ? 'use it' : 'insert it'}.
          </Text>
          <Button size="sm" {...outlineButtonProps} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" {...primaryButtonProps} onClick={() => void pick()} isDisabled={!selected} isLoading={inserting} loadingText="Saving">
            {mode === 'cover' ? 'Use as cover' : 'Insert image'}
          </Button>
        </ModalFooter>
      </ModalContent>
      <DropOverlay show={dragging} label="Drop to upload and choose" />
      <UploadPanel items={queue.items} summary={queue.summary} onRetry={queue.retry} onClear={queue.clearFinished} zIndex={1450} />
    </Modal>
  )
}
