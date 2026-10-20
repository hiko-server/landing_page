import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import NextLink from 'next/link'
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Input,
  Link,
  Text,
  Textarea,
  useToast,
} from '@chakra-ui/react'
import type { MediaItem, MediaLibraryResponse, MediaMeta, MediaUsage } from '../../../lib/media/types'
import { ALT_MAX, CAPTION_MAX } from '../../../lib/media/meta'
import {
  altGapsIn,
  formatBytes,
  formatDims,
  formatLabel,
  imageMarkdown,
  inSkippedDoc,
  orientationOf,
  refreshFailedText,
  relativeTime,
  skippedDocsText,
  usedInCount,
} from '../../../lib/media/view'
import { copyText } from '../../MDX/clipboard'
import SegmentedTabs, { tabPanelProps, type SegmentedItem } from '../shell/SegmentedTabs'
import { Eyebrow, MONO, inputProps, outlineButtonProps, primaryButtonProps, useSaveKeys, useSaveShortcut, warnTextProps } from '../shell/ui'
import { isFilenameAlt } from '../shell/publishChecks'
import { ACCEPT, postMedia, replaceFile, type ApplyAltBody, type BatchBody, type MetaBody, type OptimizeBody } from './api'
import MediaThumb from './MediaThumb'
import { Flag } from './MediaCollection'

/**
 * The detail drawer of one upload (H7): a large preview (AVIF / WebP as the
 * site serves it), its facts, the default alt text and caption in English
 * and Chinese (offered whenever it is inserted; ⌘S saves), its responsive
 * versions with "Generate missing sizes", every place that uses it with
 * links to the editor and the page, R2 repair, "Replace file…" and "Move to
 * trash…" — refused while anything uses it.
 */

type Texts = { alt: string; altZh: string; caption: string; captionZh: string }
const textsOf = (m: MediaMeta | null): Texts => ({ alt: m?.alt ?? '', altZh: m?.altZh ?? '', caption: m?.caption ?? '', captionZh: m?.captionZh ?? '' })
const sameTexts = (a: Texts, b: Texts) => a.alt.trim() === b.alt.trim() && a.altZh.trim() === b.altZh.trim() && a.caption.trim() === b.caption.trim() && a.captionZh.trim() === b.captionZh.trim()

type Lang = 'en' | 'zh'
const LANGS: SegmentedItem<Lang>[] = [
  { key: 'en', label: 'English' },
  { key: 'zh', label: '中文' },
]

const STATE_LABEL: Record<NonNullable<MediaUsage['docState']>, string> = {
  live: 'Live',
  draft: 'Draft',
  pending: 'Unpublished changes',
  private: 'PDF only',
}

const ALT_LABEL: Record<string, string> = { missing: 'no alt text', meaningless: 'alt is a file name', decorative: 'marked decorative' }

/** Usage rows grouped by document (a live item and its unpublished changes stay apart). */
function groupUsage(usage: readonly MediaUsage[]): Array<{ doc: string; first: MediaUsage; rows: MediaUsage[] }> {
  const map = new Map<string, MediaUsage[]>()
  for (const u of usage) {
    const list = map.get(u.doc)
    if (list) list.push(u)
    else map.set(u.doc, [u])
  }
  return Array.from(map.entries()).map(([doc, rows]) => ({ doc, first: rows[0], rows }))
}

function Section({ id, title, children, action }: { id: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Box as="section" aria-labelledby={id} py={5} borderTop="1px solid" borderColor="page.border" _first={{ borderTop: 'none', pt: 0 }}>
      <Flex align="center" justify="space-between" gap={3} mb={3} flexWrap="wrap">
        <Heading as="h3" id={id} fontSize="xs" fontFamily={MONO} fontWeight={500} letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary">
          {title}
        </Heading>
        {action}
      </Flex>
      {children}
    </Box>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box minW={0}>
      <Text as="dt" fontSize="11px" color="page.fg-secondary">
        {label}
      </Text>
      <Text as="dd" fontSize="sm" className="tnum" mt={0.5} wordBreak="break-word">
        {children}
      </Text>
    </Box>
  )
}

type Props = {
  item: MediaItem | null
  isOpen: boolean
  onClose: () => void
  now: number
  r2Configured: boolean
  /** The library after a change made here (null: reload it). */
  onLibrary: (lib: MediaLibraryResponse | null, focusName?: string | null) => void
  /** The texts were saved (the library updates the item in place). */
  onMeta: (name: string, meta: MediaMeta | null) => void
  /** Moved to the trash: the page offers Undo. */
  onTrashed: (name: string, lib: MediaLibraryResponse | null) => void
  finalFocusRef?: React.RefObject<HTMLElement>
}

export default function MediaDrawer({ item, isOpen, onClose, now, r2Configured, onLibrary, onMeta, onTrashed, finalFocusRef }: Props) {
  const toast = useToast()
  const ids = useId()
  const saveKeys = useSaveKeys()
  const [lang, setLang] = useState<Lang>('en')
  const [texts, setTexts] = useState<Texts>(() => textsOf(item?.meta ?? null))
  const [baseTexts, setBaseTexts] = useState<Texts>(() => textsOf(item?.meta ?? null))
  const [baseVersion, setBaseVersion] = useState(item?.meta?.updatedAt ?? 0)
  const [conflict, setConflict] = useState<MediaMeta | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<null | 'optimize' | 'trash' | 'replace' | 'r2' | 'alt'>(null)
  const [confirm, setConfirm] = useState<null | 'close' | 'trash' | 'replace' | 'alt'>(null)
  const [replacement, setReplacement] = useState<File | null>(null)
  const [showVariants, setShowVariants] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const altRef = useRef<HTMLTextAreaElement>(null)
  const name = item?.name ?? null

  // Opening the drawer, or another upload in it, starts from the stored texts.
  useEffect(() => {
    if (!isOpen) return
    const t = textsOf(item?.meta ?? null)
    setTexts(t)
    setBaseTexts(t)
    setBaseVersion(item?.meta?.updatedAt ?? 0)
    setConflict(undefined)
    setShowVariants(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, isOpen])

  const dirty = !!item && !sameTexts(texts, baseTexts)

  const save = async (expected = baseVersion) => {
    if (!item || saving) return
    setSaving(true)
    const out = await postMedia<MetaBody>({ action: 'meta', name: item.name, ...texts, expectedUpdatedAt: expected })
    setSaving(false)
    if (!out.ok) {
      if (out.status === 409) {
        setConflict((out.body.current as MediaMeta | null) ?? null)
        return
      }
      toast({ status: 'error', title: 'Not saved', description: out.error, position: 'bottom-right' })
      return
    }
    const meta = out.body.meta
    const t = textsOf(meta)
    setTexts(t)
    setBaseTexts(t)
    setBaseVersion(meta?.updatedAt ?? 0)
    setConflict(undefined)
    onMeta(item.name, meta)
    toast({
      status: out.body.r2Warning ? 'warning' : 'success',
      title: 'Saved',
      description: out.body.r2Warning || 'Offered whenever you insert this image.',
      position: 'bottom-right',
      duration: 2500,
    })
  }

  useSaveShortcut(isOpen && dirty && !saving, () => void save())

  const requestClose = () => {
    if (dirty) setConfirm('close')
    else onClose()
  }

  const usage = useMemo(() => groupUsage(item?.usage ?? []), [item])
  const used = item ? usedInCount(item) : 0
  // Places in posts, case studies and pages that show it without a real alt text.
  const altGaps = useMemo(() => altGapsIn(item?.usage ?? []), [item])

  if (!item) return null
  const orientation = orientationOf(item.width, item.height)
  const missing = item.variants.missing
  const placeholderOnly = missing.length === 1 && /\.w16\.webp$/.test(missing[0])
  const altValue = lang === 'en' ? texts.alt : texts.altZh
  const captionValue = lang === 'en' ? texts.caption : texts.captionZh
  const altWarn = altValue.trim() && isFilenameAlt(altValue.trim())

  const generate = async () => {
    setBusy('optimize')
    try {
      for (let round = 0; round < 20; round++) {
        const out = await postMedia<OptimizeBody>({ action: 'optimize', names: [item.name] })
        if (!out.ok) {
          toast({ status: 'error', title: 'Sizes not generated', description: out.error, position: 'bottom-right' })
          return
        }
        if (out.body.errors.length) {
          toast({ status: 'error', title: 'Sizes not generated', description: out.body.errors[0].error, position: 'bottom-right' })
          onLibrary(out.body.library ?? null)
          return
        }
        if (!out.body.remaining) {
          onLibrary(out.body.library ?? null)
          toast({ status: 'success', title: 'Responsive versions ready', description: out.body.revalidated.length ? `Refreshed ${out.body.revalidated.join(', ')}` : undefined, position: 'bottom-right' })
          return
        }
      }
    } finally {
      setBusy(null)
    }
  }

  const r2Repair = async (action: 'r2-mirror' | 'r2-pull') => {
    setBusy('r2')
    const out = await postMedia<BatchBody>({ action, names: [item.name] })
    setBusy(null)
    if (!out.ok || out.body.failed.length) {
      toast({ status: 'error', title: action === 'r2-mirror' ? 'Not copied to R2' : 'Not downloaded', description: out.ok ? out.body.failed[0].error : out.error, position: 'bottom-right' })
      if (out.ok) onLibrary(out.body.library ?? null)
      return
    }
    onLibrary(out.body.library ?? null)
    toast({ status: 'success', title: action === 'r2-mirror' ? 'Copied to R2' : 'Downloaded to the server', position: 'bottom-right', duration: 2500 })
  }

  const moveToTrash = async () => {
    setConfirm(null)
    setBusy('trash')
    const out = await postMedia<BatchBody>({ action: 'delete', names: [item.name] })
    setBusy(null)
    if (!out.ok || !out.body.done.includes(item.name)) {
      const reason = out.ok ? out.body.failed[0]?.error : out.error
      toast({ status: 'error', title: 'Not moved to the trash', description: reason, position: 'bottom-right' })
      if (out.ok) onLibrary(out.body.library ?? null)
      return
    }
    if (out.body.warnings?.length) toast({ status: 'warning', title: 'R2', description: out.body.warnings.join(' · '), position: 'bottom-right' })
    onTrashed(item.name, out.body.library ?? null)
  }

  const replace = async () => {
    const file = replacement
    setConfirm(null)
    if (!file) return
    setBusy('replace')
    const out = await replaceFile(item.name, file)
    setBusy(null)
    setReplacement(null)
    if (!out.ok) {
      toast({ status: 'error', title: 'Not replaced', description: out.error, position: 'bottom-right' })
      return
    }
    const places = out.body.rewrites.reduce((n, r) => n + r.references, 0)
    const warnings = out.body.warnings ?? []
    const skipped = out.body.skipped ?? []
    toast({
      status: warnings.length || skipped.length || out.body.revalidateFailed?.length ? 'warning' : 'success',
      title: places ? `Replaced — ${places} reference${places === 1 ? '' : 's'} updated` : 'Replaced',
      description:
        [
          skippedDocsText(skipped),
          warnings.join(' · '),
          refreshFailedText(out.body.revalidateFailed),
          out.body.revalidated.length ? `Refreshed ${out.body.revalidated.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' — ') || 'The old address now opens the new file.',
      position: 'bottom-right',
      duration: 6000,
      isClosable: true,
    })
    onLibrary(out.body.library, out.body.name)
  }

  const applyAlt = async () => {
    setConfirm(null)
    setBusy('alt')
    const out = await postMedia<ApplyAltBody>({ action: 'apply-alt', name: item.name })
    setBusy(null)
    if (!out.ok) {
      toast({ status: 'error', title: 'Alt text not filled in', description: out.error, position: 'bottom-right' })
      return
    }
    const skipped = out.body.skipped ?? []
    // What still lacks an alt text afterwards, apart from the documents left unchanged: no default in their language.
    const fresh = out.body.library?.items.find((i) => i.name === item.name)
    const left = fresh ? altGapsIn(fresh.usage).filter((u) => !inSkippedDoc(u, skipped)).length : Math.max(0, altGaps.length - out.body.places)
    toast({
      status: out.body.warnings?.length || skipped.length || left > 0 || out.body.revalidateFailed?.length ? 'warning' : 'success',
      title: out.body.places ? `Alt text filled in ${out.body.places} place${out.body.places === 1 ? '' : 's'}` : skipped.length ? 'Alt text not filled in' : 'Nothing to fill in',
      description:
        [
          skippedDocsText(skipped),
          out.body.warnings?.join(' · '),
          left > 0 ? `${left} left: their language has no default text yet.` : '',
          refreshFailedText(out.body.revalidateFailed),
          out.body.revalidated.length ? `Refreshed ${out.body.revalidated.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' ') || undefined,
      position: 'bottom-right',
      duration: 6000,
      isClosable: true,
    })
    onLibrary(out.body.library)
  }

  const copy = async (text: string, what: string) => {
    const ok = await copyText(text)
    toast({ status: ok ? 'success' : 'error', title: ok ? `${what} copied` : 'Could not copy', position: 'bottom-right', duration: 1800 })
  }

  const absoluteUrl = typeof window === 'undefined' ? item.url : new URL(item.url, window.location.origin).href
  const setText = (key: keyof Texts, value: string) => setTexts((t) => ({ ...t, [key]: value }))

  return (
    <>
      <Drawer isOpen={isOpen} onClose={requestClose} placement="right" size="md" finalFocusRef={finalFocusRef} initialFocusRef={altRef}>
        <DrawerOverlay />
        <DrawerContent bg="page.bg-elevated" borderLeft="1px solid" borderColor="page.border" data-testid="media-drawer" maxW={{ base: '100vw', md: '480px' }}>
          <DrawerCloseButton top={3} />
          <DrawerHeader pb={3} pr={12}>
            <Eyebrow accent>[image]</Eyebrow>
            <Text fontFamily={MONO} fontSize="sm" fontWeight={500} mt={1} wordBreak="break-all">
              {item.name}
            </Text>
          </DrawerHeader>
          <DrawerBody pb={6}>
            <Box position="relative" borderRadius="lg" overflow="hidden" border="1px solid" borderColor="page.border" h={{ base: '220px', md: '280px' }} mb={2}>
              <MediaThumb
                src={item.url}
                srcSet={item.srcSet}
                avifSrcSet={item.avifSrcSet}
                sizes="(max-width: 480px) 100vw, 448px"
                placeholder={item.placeholder}
                width={item.width}
                height={item.height}
                alt={item.meta?.alt || ''}
                eager
                inset={3}
              />
            </Box>
            <Flex gap={2} flexWrap="wrap" mb={5}>
              <Button size="xs" {...outlineButtonProps} onClick={() => void copy(absoluteUrl, 'Address')}>
                Copy address
              </Button>
              <Button size="xs" {...outlineButtonProps} onClick={() => void copy(imageMarkdown(item.url, texts.alt.trim(), texts.caption.trim()), 'Markdown')}>
                Copy Markdown
              </Button>
              <Link href={item.url} isExternal fontSize="xs" alignSelf="center" color="accent.text" px={1}>
                Open original ↗
                <Box as="span" srOnly>
                  {' '}
                  (opens in a new tab)
                </Box>
              </Link>
            </Flex>

            <Section id={`${ids}-details`} title="Details">
              <Box as="dl" display="grid" gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap={3}>
                <Fact label="Pixels">{formatDims(item.width, item.height)}</Fact>
                <Fact label="File size">{formatBytes(item.bytes)}</Fact>
                <Fact label="Type">
                  {formatLabel(item.format)}
                  {item.animated ? ' · animated' : ''}
                </Fact>
                <Fact label="Shape">{orientation ? orientation[0].toUpperCase() + orientation.slice(1) : '—'}</Fact>
                <Fact label="Added">
                  <span title={new Date(item.addedAt).toLocaleString('en-GB')}>{relativeTime(item.addedAt, now)}</span>
                </Fact>
                <Fact label="Stored">
                  {item.local ? 'This server' : 'Only in R2'}
                  {!r2Configured
                    ? ''
                    : item.r2 === null
                      ? ' · R2 not checked yet'
                      : item.r2 && !item.r2Missing
                        ? ' · R2 ✓'
                        : item.r2Missing
                          ? ` · R2 lacks ${item.r2Missing} file${item.r2Missing === 1 ? '' : 's'}`
                          : ' · not in R2'}
                </Fact>
              </Box>
              {r2Configured && item.local && (item.r2 === false || (item.r2Missing ?? 0) > 0) ? (
                <Button size="xs" mt={3} {...outlineButtonProps} isLoading={busy === 'r2'} loadingText="Copying" onClick={() => void r2Repair('r2-mirror')}>
                  Copy to R2
                </Button>
              ) : null}
              {!item.local ? (
                <Button size="xs" mt={3} {...outlineButtonProps} isLoading={busy === 'r2'} loadingText="Downloading" onClick={() => void r2Repair('r2-pull')}>
                  Download to this server
                </Button>
              ) : null}
            </Section>

            <Section
              id={`${ids}-texts`}
              title="Alt text & caption"
              action={<SegmentedTabs items={LANGS} value={lang} onSelect={setLang} label="Language of the texts" idPrefix={`${ids}-lang`} size="sm" />}
            >
              <Box {...tabPanelProps(`${ids}-lang`, lang)} lang={lang === 'zh' ? 'zh-Hans' : 'en'}>
                <FormControl>
                  <FormLabel htmlFor={`${ids}-alt`} fontSize="13px" mb={1}>
                    {lang === 'en' ? 'Alt text' : 'Alt text (中文)'}
                  </FormLabel>
                  <Textarea
                    ref={altRef}
                    id={`${ids}-alt`}
                    {...inputProps}
                    size="sm"
                    rows={2}
                    maxLength={ALT_MAX}
                    value={altValue}
                    onChange={(e) => setText(lang === 'en' ? 'alt' : 'altZh', e.target.value)}
                    placeholder={lang === 'en' ? 'What the picture shows, for someone who cannot see it' : '图片内容的简短描述'}
                    aria-describedby={`${ids}-alt-help`}
                  />
                  <FormHelperText id={`${ids}-alt-help`} fontSize="xs" color="page.fg-secondary" display="flex" justifyContent="space-between" gap={3}>
                    <span>{altWarn ? <Text as="span" {...warnTextProps}>That reads like a file name — describe the picture instead.</Text> : 'Offered whenever you insert this image; you can still change it there.'}</span>
                    <Text as="span" className="tnum" flexShrink={0} aria-hidden>
                      {altValue.length} / {ALT_MAX}
                    </Text>
                  </FormHelperText>
                </FormControl>
                <FormControl mt={3}>
                  <FormLabel htmlFor={`${ids}-caption`} fontSize="13px" mb={1}>
                    {lang === 'en' ? 'Caption' : 'Caption (中文)'}
                  </FormLabel>
                  <Input
                    id={`${ids}-caption`}
                    {...inputProps}
                    size="sm"
                    maxLength={CAPTION_MAX}
                    value={captionValue}
                    onChange={(e) => setText(lang === 'en' ? 'caption' : 'captionZh', e.target.value)}
                    placeholder={lang === 'en' ? 'Shown under the picture (optional)' : '显示在图片下方（可选）'}
                  />
                </FormControl>
              </Box>
              {lang === 'zh' && !texts.altZh && texts.alt ? (
                <Text fontSize="xs" color="page.fg-secondary" mt={2}>
                  Chinese articles get the Chinese text only — an English alt would be read out in the wrong language.
                </Text>
              ) : null}
              {conflict !== undefined ? (
                <Alert status="warning" variant="left-accent" borderRadius="md" mt={3} bg="page.bg" fontSize="sm" alignItems="flex-start" role="alert">
                  <AlertDescription>
                    These texts were changed in another tab since you opened them.
                    <Flex gap={2} mt={2} flexWrap="wrap">
                      <Button
                        size="xs"
                        {...outlineButtonProps}
                        onClick={() => {
                          const t = textsOf(conflict)
                          setTexts(t)
                          setBaseTexts(t)
                          setBaseVersion(conflict?.updatedAt ?? 0)
                          setConflict(undefined)
                          if (item) onMeta(item.name, conflict)
                        }}
                      >
                        Use theirs
                      </Button>
                      <Button size="xs" {...primaryButtonProps} onClick={() => void save(conflict?.updatedAt ?? 0)}>
                        Keep mine and save
                      </Button>
                    </Flex>
                  </AlertDescription>
                </Alert>
              ) : null}
            </Section>

            <Section
              id={`${ids}-variants`}
              title="Responsive versions"
              action={
                item.variants.present.length ? (
                  <Button size="xs" variant="ghost" color="page.fg-secondary" onClick={() => setShowVariants((v) => !v)} aria-expanded={showVariants}>
                    {showVariants ? 'Hide files' : 'Show files'}
                  </Button>
                ) : undefined
              }
            >
              {!item.local ? (
                <Text fontSize="sm" color="page.fg-secondary">
                  Download it to this server to see and make its versions.
                </Text>
              ) : !item.variants.eligible ? (
                <Text fontSize="sm" color="page.fg-secondary">
                  {item.animated || item.format === 'gif'
                    ? 'Animated images are served as they are: resizing would drop their frames.'
                    : 'Too small to need smaller versions — it is served as it is.'}
                </Text>
              ) : (
                <>
                  {item.variants.present.length ? (
                    <Text fontSize="sm">
                      {new Set(item.variants.present.map((v) => v.width)).size} width{new Set(item.variants.present.map((v) => v.width)).size === 1 ? '' : 's'} ·{' '}
                      {[item.variants.present.some((v) => v.format === 'webp') ? 'WebP' : '', item.variants.present.some((v) => v.format === 'avif') ? 'AVIF' : ''].filter(Boolean).join(' + ')}
                      {item.variants.placeholder ? ' · blur placeholder' : ''}
                      <Text as="span" color="page.fg-secondary">
                        {' '}
                        · {formatBytes(item.variants.bytes)} in all
                      </Text>
                    </Text>
                  ) : (
                    <Text fontSize="sm">None yet — every page loads the full file{item.variants.placeholder ? '' : ', with no blur placeholder'}.</Text>
                  )}
                  {missing.length ? (
                    <Flex align="center" gap={3} mt={2} flexWrap="wrap">
                      <Text fontSize="xs" {...warnTextProps}>
                        {placeholderOnly
                          ? 'The blur placeholder is missing.'
                          : item.variants.present.length
                            ? `${missing.length} file${missing.length === 1 ? '' : 's'} missing — pages fall back to larger ones.`
                            : `${missing.length} files to make: WebP and AVIF sizes and the placeholder.`}
                      </Text>
                      <Button size="xs" {...outlineButtonProps} isLoading={busy === 'optimize'} loadingText="Generating" onClick={() => void generate()}>
                        Generate missing sizes
                      </Button>
                    </Flex>
                  ) : (
                    <Text fontSize="xs" color="page.fg-secondary" mt={1}>
                      Complete: every page serves the smallest file that is sharp enough.
                    </Text>
                  )}
                  {showVariants ? (
                    <Box as="ul" listStyleType="none" mt={3} fontFamily={MONO} fontSize="11px" color="page.fg-secondary" display="grid" rowGap={1}>
                      {item.variants.present.map((v) => (
                        <Flex as="li" key={v.name} justify="space-between" gap={4}>
                          <span>
                            {v.width} px · {v.format.toUpperCase()}
                          </span>
                          <Box as="span" className="tnum">
                            {formatBytes(v.bytes)}
                          </Box>
                        </Flex>
                      ))}
                    </Box>
                  ) : null}
                </>
              )}
            </Section>

            <Section id={`${ids}-usage`} title={used ? `Used in ${used} place${used === 1 ? '' : 's'}` : 'Used in'}>
              {!usage.length ? (
                <Text fontSize="sm" color="page.fg-secondary">
                  Nothing on the site refers to it.
                </Text>
              ) : (
                <Box as="ul" listStyleType="none" display="grid" gap={2.5}>
                  {usage.map(({ doc, first, rows }) => (
                    <Box as="li" key={doc} border="1px solid" borderColor="page.border" borderRadius="md" px={3} py={2.5} bg="page.bg">
                      <Flex align="center" gap={2} flexWrap="wrap">
                        <Text fontSize="sm" fontWeight={500} noOfLines={1} minW={0} flex="1 1 auto">
                          {first.docTitle}
                        </Text>
                        {first.docState ? <Flag tone={first.docState === 'live' ? 'muted' : 'info'}>{STATE_LABEL[first.docState]}</Flag> : null}
                      </Flex>
                      <Box as="ul" listStyleType="none" mt={1}>
                        {rows.map((u) => (
                          <Flex as="li" key={u.field} align="center" gap={2} fontSize="xs" color="page.fg-secondary" flexWrap="wrap">
                            <span>{u.label}</span>
                            {u.alt && ALT_LABEL[u.alt] ? (
                              u.alt === 'decorative' ? (
                                <Text as="span">· {ALT_LABEL[u.alt]}</Text>
                              ) : (
                                <Text as="span" {...warnTextProps}>
                                  · {ALT_LABEL[u.alt]}
                                </Text>
                              )
                            ) : null}
                          </Flex>
                        ))}
                      </Box>
                      <Flex gap={3} mt={1.5} fontSize="xs">
                        {first.editHref ? (
                          <Link as={NextLink} href={first.editHref} color="accent.text">
                            Edit
                          </Link>
                        ) : null}
                        {first.publicHref ? (
                          <Link href={first.publicHref} isExternal color="accent.text">
                            View page ↗
                            <Box as="span" srOnly>
                              {' '}
                              (opens in a new tab)
                            </Box>
                          </Link>
                        ) : null}
                      </Flex>
                    </Box>
                  ))}
                </Box>
              )}
              {altGaps.length ? (
                <Box mt={3} border="1px solid" borderColor="page.border" borderRadius="md" px={3} py={2.5} bg="page.bg">
                  <Text fontSize="xs" {...warnTextProps}>
                    Shown without alt text in {altGaps.length} place{altGaps.length === 1 ? '' : 's'}.
                  </Text>
                  {item.meta?.alt || item.meta?.altZh ? (
                    <Button size="xs" mt={2} {...outlineButtonProps} onClick={() => setConfirm('alt')} isDisabled={dirty || !!busy} isLoading={busy === 'alt'} loadingText="Filling in">
                      Use the default alt text there
                    </Button>
                  ) : (
                    <Text fontSize="xs" color="page.fg-secondary" mt={1}>
                      Save a default alt text above, then fill them all in at once.
                    </Text>
                  )}
                </Box>
              ) : null}
              {item.replaces.length ? (
                <Text fontSize="xs" color="page.fg-secondary" mt={3}>
                  It replaced{' '}
                  {item.replaces.map((r, i) => (
                    <React.Fragment key={r}>
                      {i ? ', ' : ''}
                      <Text as="span" fontFamily={MONO}>
                        {r}
                      </Text>
                    </React.Fragment>
                  ))}
                  : {item.replaces.length === 1 ? 'that address opens' : 'those addresses open'} this file.
                </Text>
              ) : null}
            </Section>

            <Section id={`${ids}-file`} title="File">
              <Flex gap={2} flexWrap="wrap">
                <Button size="sm" {...outlineButtonProps} onClick={() => fileRef.current?.click()} isDisabled={!item.local} isLoading={busy === 'replace'} loadingText="Replacing">
                  Replace file…
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  colorScheme="red"
                  borderColor="page.border-strong"
                  onClick={() => setConfirm('trash')}
                  isDisabled={used > 0}
                  isLoading={busy === 'trash'}
                  loadingText="Moving"
                  aria-describedby={used ? `${ids}-trash-why` : undefined}
                >
                  Move to trash…
                </Button>
              </Flex>
              <Text id={`${ids}-trash-why`} fontSize="xs" color="page.fg-secondary" mt={2}>
                {used
                  ? `It can go to the trash once nothing uses it — remove it from the ${used === 1 ? 'place' : `${used} places`} above first, or replace the file instead.`
                  : 'Replacing gives every page the new file under a new address; the old one keeps working. The trash keeps a deleted image for 30 days.'}
              </Text>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                hidden
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  e.target.value = ''
                  if (f) {
                    setReplacement(f)
                    setConfirm('replace')
                  }
                }}
              />
            </Section>
          </DrawerBody>
          <DrawerFooter gap={3} borderTop="1px solid" borderColor="page.border" justifyContent="space-between">
            <Text fontSize="xs" color="page.fg-secondary" role="status" aria-live="polite">
              {dirty ? 'Unsaved changes' : item.meta ? `Saved ${relativeTime(item.meta.updatedAt, now)}` : 'No texts yet'}
            </Text>
            <Flex gap={2}>
              <Button size="sm" {...outlineButtonProps} onClick={requestClose}>
                Close
              </Button>
              <Button size="sm" {...primaryButtonProps} onClick={() => void save()} isDisabled={!dirty} isLoading={saving} loadingText="Saving" aria-keyshortcuts={saveKeys[0] === '⌘' ? 'Meta+S' : 'Control+S'}>
                Save texts
              </Button>
            </Flex>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <AlertDialog isOpen={confirm !== null} leastDestructiveRef={cancelRef} onClose={() => setConfirm(null)} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
            {confirm === 'close' ? (
              <>
                <AlertDialogHeader fontSize="md">Discard the changed texts?</AlertDialogHeader>
                <AlertDialogBody fontSize="sm">The alt text and caption you typed are not saved yet.</AlertDialogBody>
                <AlertDialogFooter gap={2}>
                  <Button ref={cancelRef} size="sm" {...outlineButtonProps} onClick={() => setConfirm(null)}>
                    Keep editing
                  </Button>
                  <Button
                    size="sm"
                    colorScheme="red"
                    onClick={() => {
                      setConfirm(null)
                      setTexts(baseTexts)
                      onClose()
                    }}
                  >
                    Discard
                  </Button>
                </AlertDialogFooter>
              </>
            ) : confirm === 'trash' ? (
              <>
                <AlertDialogHeader fontSize="md">Move “{item.name}” to the trash?</AlertDialogHeader>
                <AlertDialogBody fontSize="sm">
                  Nothing on the site uses it. It leaves this server{r2Configured ? ' and R2' : ''} now and its address stops working (an older version in a page’s history that shows it would show a gap); you can restore it from the trash for 30 days.
                </AlertDialogBody>
                <AlertDialogFooter gap={2}>
                  <Button ref={cancelRef} size="sm" {...outlineButtonProps} onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" colorScheme="red" onClick={() => void moveToTrash()}>
                    Move to trash
                  </Button>
                </AlertDialogFooter>
              </>
            ) : confirm === 'alt' ? (
              <>
                <AlertDialogHeader fontSize="md">Fill in the alt text?</AlertDialogHeader>
                <AlertDialogBody fontSize="sm">
                  <Text>
                    {altGaps.length === 1 ? 'One place shows' : `${altGaps.length} places show`} this image without an alt text:
                  </Text>
                  <Box as="ul" mt={2} pl={4}>
                    {altGaps.slice(0, 6).map((u) => (
                      <li key={`${u.doc}:${u.field}`}>
                        {u.docTitle} — {u.label}
                      </li>
                    ))}
                    {altGaps.length > 6 ? <li>…and {altGaps.length - 6} more</li> : null}
                  </Box>
                  <Text mt={2}>
                    English pages get “{item.meta?.alt || '—'}”{item.meta?.altZh ? `, Chinese pages “${item.meta.altZh}”` : ''}. Each page is snapshotted first, like a save.
                  </Text>
                </AlertDialogBody>
                <AlertDialogFooter gap={2}>
                  <Button ref={cancelRef} size="sm" {...outlineButtonProps} onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" {...primaryButtonProps} onClick={() => void applyAlt()}>
                    Fill in
                  </Button>
                </AlertDialogFooter>
              </>
            ) : confirm === 'replace' ? (
              <>
                <AlertDialogHeader fontSize="md">Replace “{item.name}”?</AlertDialogHeader>
                <AlertDialogBody fontSize="sm">
                  <Text>
                    With{' '}
                    <Text as="span" fontFamily={MONO}>
                      {replacement?.name}
                    </Text>{' '}
                    ({formatBytes(replacement?.size ?? 0)}).
                  </Text>
                  <Text mt={2}>
                    {used
                      ? `Every place that shows it — ${used === 1 ? 'one document' : `${used} documents`} — switches to the new file (a history snapshot of each first), with its alt text and caption.`
                      : 'Nothing uses it yet; the new file takes its alt text and caption.'}{' '}
                    The old address keeps working: it opens the new file. The old file waits in the trash for 30 days.
                  </Text>
                </AlertDialogBody>
                <AlertDialogFooter gap={2}>
                  <Button ref={cancelRef} size="sm" {...outlineButtonProps} onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" {...primaryButtonProps} onClick={() => void replace()}>
                    Replace
                  </Button>
                </AlertDialogFooter>
              </>
            ) : null}
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  )
}

