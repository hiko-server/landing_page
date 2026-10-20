import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  ButtonGroup,
  Flex,
  HStack,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Spinner,
  Text,
  Tooltip,
  useColorModeValue,
  useDisclosure,
  useToast,
} from '@chakra-ui/react'
import { AddIcon, ChevronDownIcon } from '@chakra-ui/icons'
import { FaFilePdf } from 'react-icons/fa'
import CVResult from '../../CVViewerPage/CVResult'
import ScaledSheet from '../../CVViewerPage/ScaledSheet'
import { useAdminDirty, useDirtyRegistration } from '../AdminDirtyContext'
import { readAdminCv, LOGIN_HREF } from '../cvStudio/cvApi'
import { MONO, SaveButton, SaveStatus, inputProps, outlineButtonProps, primaryButtonProps, useSaveShortcut } from '../shell/ui'
import { publicSections, type CvLang } from '../../../lib/cvVisibility'
import { withEvidenceLinks } from '../../../lib/cvLinks'
import { PAGE_TARGETS, VARIANT_NAME_MAX, applyVariant, newVariantId, variantFromCv, type CvVariant } from '../../../lib/cvVariants'
import { ownerNamesFromSections } from '../../../lib/publications/names'
import type { ShareLink } from '../../../lib/cvShare/links'
import { measureVariant, readLinks, readVariantsDoc, saveVariantsDoc, variantPdfHref, type Measurement } from './api'
import { sectionRows, targetStatus, variantSummary, type Doc } from './model'
import VariantSections from './VariantSections'
import ShareLinks from './ShareLinks'

/**
 * CV variants and their private links (E4) — Admin → Dashboard → CV →
 * "Variants & links".
 *
 *   ┌ toolbar: save · discard · status · new variant ─────────────────────┐
 *   ├ variants │ name, page target, sections & entries, links │ A4 preview ┤
 *
 * A variant is a named selection over the saved CV ("Machine learning",
 * "Embedded", "Full-stack"): which sections and entries it prints and in
 * what order, and how many A4 pages it should take — measured against its
 * real server-rendered PDF in both languages as you edit. The live preview
 * is the A4 sheet a private link shows. All variants save together (⌘S,
 * If-Match like the CV); a deleted variant's links stop working on save.
 * The CV itself is edited in Studio: hidden content, and anything its
 * audience keeps off private links, is never printed by a variant.
 */

type Pane = 'list' | 'edit' | 'preview'

const json = (v: unknown) => JSON.stringify(v)

function uniqueName(base: string, taken: readonly string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()))
  if (!lower.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!lower.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

function MeasureLine({ m, target, measuring, failed }: { m: Measurement | null; target: number | null; measuring: boolean; failed: boolean }) {
  const ok = useColorModeValue('green.700', 'green.300')
  const over = useColorModeValue('orange.700', 'orange.300')
  return (
    <HStack spacing={3} fontSize="12px" flexWrap="wrap" aria-live="polite" minH="20px">
      <Text fontFamily={MONO} fontSize="10px" letterSpacing="0.1em" textTransform="uppercase" color="page.fg-secondary">
        PDF
      </Text>
      {(['en', 'zh'] as CvLang[]).map((l) => {
        const v = m?.[l]
        const s = v ? targetStatus(v.pages, v.lastPageFill, target) : null
        return (
          <HStack key={l} spacing={1.5}>
            <Text as="span" fontFamily={MONO} fontSize="11px" color="page.fg-secondary">
              {l === 'en' ? 'EN' : '中文'}
            </Text>
            <Text as="span" color={s?.tone === 'over' ? over : s?.tone === 'ok' ? ok : 'page.fg'} fontWeight={s?.tone === 'over' ? 600 : 400}>
              {m ? (s ? s.text : 'prints nothing') : '—'}
            </Text>
          </HStack>
        )
      })}
      {measuring ? <Spinner size="xs" color="accent.500" aria-label="Measuring" /> : null}
      {failed && !measuring ? (
        <Text as="span" color="page.fg-secondary">
          couldn’t measure
        </Text>
      ) : null}
    </HStack>
  )
}

export default function CvVariantsPanel() {
  const toast = useToast()
  const { confirmDiscard } = useAdminDirty()
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unauthorized'>('loading')
  const [loadError, setLoadError] = useState('')
  const [cv, setCv] = useState<Doc>({ en: [], zh: [] })
  const [variants, setVariants] = useState<CvVariant[]>([])
  const [savedJson, setSavedJson] = useState('[]')
  const [etag, setEtag] = useState<string | null>(null)
  const [keyConfigured, setKeyConfigured] = useState(true)
  const [links, setLinks] = useState<ShareLink[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [conflict, setConflict] = useState(false)
  const [lang, setLang] = useState<CvLang>('en')
  const [pane, setPane] = useState<Pane>('edit')
  const [measure, setMeasure] = useState<Measurement | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [measureFailed, setMeasureFailed] = useState(false)
  const deleteDialog = useDisclosure()
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const canvas = useColorModeValue('gray.100', 'blackAlpha.600')

  const dirty = state === 'ready' && json(variants) !== savedJson
  const current = variants.find((v) => v.id === selected) ?? null
  const savedVariants = useMemo(() => JSON.parse(savedJson) as CvVariant[], [savedJson])
  const savedCurrent = savedVariants.find((v) => v.id === selected) ?? null
  const currentSaved = !!current && !!savedCurrent && json(current) === json(savedCurrent)

  const refreshLinks = useCallback(async () => {
    const l = await readLinks()
    if (l) setLinks(l)
  }, [])

  const load = useCallback(async () => {
    setState('loading')
    const [doc, cvRead] = await Promise.all([readVariantsDoc(), readAdminCv()])
    if (doc.kind === 'unauthorized' || cvRead.kind === 'unauthorized') {
      setState('unauthorized')
      return
    }
    if (doc.kind === 'error' || cvRead.kind === 'error') {
      setLoadError(doc.kind === 'error' ? doc.error : cvRead.kind === 'error' ? cvRead.error : '')
      setState('error')
      return
    }
    setCv(cvRead.doc)
    setVariants(doc.variants)
    setSavedJson(json(doc.variants))
    setEtag(doc.etag)
    setKeyConfigured(doc.keyConfigured)
    setSelected((s) => (s && doc.variants.some((v) => v.id === s) ? s : doc.variants[0]?.id ?? null))
    setState('ready')
    void refreshLinks()
  }, [refreshLinks])

  useEffect(() => {
    void load()
  }, [load])

  const update = useCallback((next: CvVariant) => setVariants((list) => list.map((v) => (v.id === next.id ? next : v))), [])

  // ── Save ───────────────────────────────────────────────────────────────
  const save = useCallback(async (): Promise<boolean> => {
    if (!dirty || saving) return !dirty
    setSaving(true)
    try {
      const r = await saveVariantsDoc(variants, etag)
      if (r.kind === 'ok') {
        setVariants(r.variants)
        setSavedJson(json(r.variants))
        setEtag(r.etag)
        setSavedAt(Date.now())
        setConflict(false)
        toast({
          status: r.warning ? 'warning' : 'success',
          title: 'Variants saved',
          description: r.revoked ? `${r.revoked === 1 ? 'One link' : `${r.revoked} links`} of the deleted variant stopped working.` : r.warning,
          position: 'bottom-right',
        })
        if (r.revoked) void refreshLinks()
        return true
      }
      if (r.kind === 'conflict') setConflict(true)
      else if (r.kind === 'unauthorized') setState('unauthorized')
      else toast({ status: 'error', title: 'Not saved', description: r.error, position: 'bottom-right', isClosable: true })
      return false
    } finally {
      setSaving(false)
    }
  }, [dirty, saving, variants, etag, toast, refreshLinks])

  useDirtyRegistration('cv-variants', dirty, save)
  useSaveShortcut(state === 'ready', () => void save())

  // ── Measure the PDF against the target (debounced, the SAVED CV) ──────
  const measureKey = current ? json({ sections: current.sections }) : ''
  useEffect(() => {
    if (!current) {
      setMeasure(null)
      return
    }
    const ctrl = new AbortController()
    setMeasuring(true)
    setMeasureFailed(false)
    const t = window.setTimeout(() => {
      measureVariant(current, ctrl.signal)
        .then((m) => {
          if (ctrl.signal.aborted) return
          setMeasure(m)
          setMeasureFailed(!m)
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setMeasureFailed(true)
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setMeasuring(false)
        })
    }, 700)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
    // The selection's sections are the input; the name and target do not change the PDF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureKey])

  // ── Actions ────────────────────────────────────────────────────────────
  const addVariant = (copyOf?: CvVariant) => {
    const names = variants.map((v) => v.name)
    const now = Date.now()
    const v: CvVariant = copyOf
      ? { ...JSON.parse(json(copyOf)), id: newVariantId(), name: uniqueName(`${copyOf.name} copy`.slice(0, VARIANT_NAME_MAX), names), createdAt: now, updatedAt: now }
      : variantFromCv(cv.en.length ? cv.en : cv.zh, uniqueName('New variant', names))
    setVariants((list) => [...list, v])
    setSelected(v.id)
    setPane('edit')
    window.requestAnimationFrame(() => {
      nameRef.current?.focus()
      nameRef.current?.select()
    })
  }

  const deleteCurrent = () => {
    if (!current) return
    const at = variants.findIndex((v) => v.id === current.id)
    const rest = variants.filter((v) => v.id !== current.id)
    setVariants(rest)
    setSelected(rest[Math.min(at, rest.length - 1)]?.id ?? null)
    deleteDialog.onClose()
  }

  const rows = useMemo(() => (current ? sectionRows(cv, lang, current) : []), [cv, lang, current])
  const deferred = useDeferredValue(current)
  const previewSections = useMemo(() => {
    if (!deferred) return []
    return withEvidenceLinks(publicSections(applyVariant(cv[lang], deferred), 'cv', 'private'), { works: [] })
  }, [cv, lang, deferred])
  const ownerNames = useMemo(() => ownerNamesFromSections(publicSections(cv.en, 'cv', 'private'), publicSections(cv.zh, 'cv', 'private')), [cv])
  const activeLinks = current ? links.filter((l) => l.variantId === current.id && l.state === 'active').length : 0
  const languages = measure ? { en: !!measure.en, zh: !!measure.zh } : null

  // ── States ─────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <Flex h="50vh" align="center" justify="center" role="status" aria-label="Loading CV variants">
        <Spinner color="accent.500" />
      </Flex>
    )
  }
  if (state === 'unauthorized' || state === 'error') {
    return (
      <Flex h="50vh" align="center" justify="center" direction="column" gap={3} textAlign="center" px={6} role="alert">
        <Text fontWeight={600}>{state === 'unauthorized' ? 'Session expired — sign in again' : 'Could not load the variants'}</Text>
        {state === 'error' ? (
          <Text fontSize="13px" color="page.fg-secondary" maxW="440px">
            {loadError}
          </Text>
        ) : null}
        {state === 'unauthorized' ? (
          <Button size="sm" as="a" href={LOGIN_HREF} {...primaryButtonProps}>
            Sign in again
          </Button>
        ) : (
          <Button size="sm" onClick={() => void load()}>
            Retry
          </Button>
        )}
      </Flex>
    )
  }

  const listPane = (
    <Box p={3}>
      <Button size="sm" w="100%" leftIcon={<AddIcon boxSize="9px" />} {...outlineButtonProps} borderStyle="dashed" onClick={() => addVariant()} mb={3}>
        New variant
      </Button>
      {variants.length ? (
        <Flex as="ul" direction="column" gap={1} listStyleType="none" m={0} p={0} aria-label="CV variants">
          {variants.map((v) => {
            const on = v.id === selected
            const linksOn = links.filter((l) => l.variantId === v.id && l.state === 'active').length
            return (
              <Box as="li" key={v.id}>
                <Box
                  as="button"
                  type="button"
                  w="100%"
                  textAlign="left"
                  px={3}
                  py={2}
                  borderRadius="md"
                  aria-current={on ? 'true' : undefined}
                  bg={on ? 'var(--accent-soft)' : 'transparent'}
                  borderLeft="2px solid"
                  borderColor={on ? 'var(--accent)' : 'transparent'}
                  _hover={{ bg: on ? 'var(--accent-soft)' : 'page.bg-overlay' }}
                  _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px' }}
                  onClick={() => {
                    setSelected(v.id)
                    setPane('edit')
                  }}
                >
                  <Text fontSize="13px" fontWeight={on ? 600 : 500} noOfLines={1} color={on ? 'accent.text' : 'page.fg'}>
                    {v.name || 'Untitled variant'}
                  </Text>
                  <Text fontSize="11px" color="page.fg-secondary" noOfLines={1}>
                    {variantSummary(cv, 'en', v)}
                    {v.pageTarget ? ` · ${v.pageTarget}p` : ''}
                    {linksOn ? ` · ${linksOn} link${linksOn === 1 ? '' : 's'}` : ''}
                  </Text>
                </Box>
              </Box>
            )
          })}
        </Flex>
      ) : (
        <Text fontSize="12px" color="page.fg-secondary" px={1}>
          No variants yet.
        </Text>
      )}
    </Box>
  )

  const editPane = current ? (
    <Box maxW="760px" mx="auto" px={{ base: 4, md: 6 }} py={5}>
      <Text fontFamily={MONO} fontSize="10px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary">
        CV variant
      </Text>
      <Flex gap={2} mt={1} align="center">
        <Input
          ref={nameRef}
          {...inputProps}
          value={current.name}
          maxLength={VARIANT_NAME_MAX}
          onChange={(e) => update({ ...current, name: e.target.value })}
          aria-label="Variant name"
          placeholder="Machine learning"
          fontSize="20px"
          fontWeight={600}
          h="44px"
          variant="flushed"
          borderColor="page.border"
        />
        <Menu isLazy placement="bottom-end">
          <MenuButton as={IconButton} aria-label="Variant actions" icon={<ChevronDownIcon />} size="sm" variant="ghost" />
          <MenuList fontSize="13px" zIndex={40}>
            <MenuItem onClick={() => addVariant(current)}>Duplicate</MenuItem>
            <MenuItem color="red.500" onClick={deleteDialog.onOpen}>
              Delete variant…
            </MenuItem>
          </MenuList>
        </Menu>
      </Flex>
      <Text fontSize="11px" color="page.fg-secondary" mt={1}>
        Only you see the name — a private link never shows it.
      </Text>

      <Flex mt={5} gap={4} align="center" flexWrap="wrap">
        <HStack spacing={2} role="group" aria-labelledby="variant-target-label">
          <Text id="variant-target-label" fontSize="12px" fontWeight={500}>
            Page target
          </Text>
          <ButtonGroup size="xs" isAttached variant="outline">
            {[null, ...PAGE_TARGETS].map((t) => {
              // Visible "1" is part of the accessible name "1 page" (WCAG 2.5.3).
              const on = current.pageTarget === t
              return (
                <Button
                  key={String(t)}
                  aria-pressed={on}
                  onClick={() => update({ ...current, pageTarget: t })}
                  fontFamily={MONO}
                  borderColor={on ? 'var(--accent)' : 'page.border-strong'}
                  bg={on ? 'var(--accent-soft)' : undefined}
                  color={on ? 'accent.text' : undefined}
                  zIndex={on ? 1 : undefined}
                  aria-label={t ? `${t} page${t === 1 ? '' : 's'}` : 'None (no target)'}
                >
                  {t ? String(t) : 'None'}
                </Button>
              )
            })}
          </ButtonGroup>
        </HStack>
        <MeasureLine m={measure} target={current.pageTarget} measuring={measuring} failed={measureFailed} />
      </Flex>

      <Box mt={6}>
        <Flex align="center" justify="space-between" mb={3} gap={2} flexWrap="wrap">
          <Text fontSize="12px" color="page.fg-secondary" maxW="52ch">
            Ticks and order apply to both languages. Titles below are the {lang === 'en' ? 'English' : 'Chinese'} CV’s.
          </Text>
          <ButtonGroup size="xs" isAttached variant="outline" role="group" aria-label="Language of the titles and the preview">
            {(['en', 'zh'] as CvLang[]).map((l) => (
              <Button
                key={l}
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                fontFamily={MONO}
                borderColor={lang === l ? 'var(--accent)' : 'page.border-strong'}
                bg={lang === l ? 'var(--accent-soft)' : undefined}
                color={lang === l ? 'accent.text' : undefined}
                zIndex={lang === l ? 1 : undefined}
              >
                {l === 'en' ? 'EN' : '中文'}
              </Button>
            ))}
          </ButtonGroup>
        </Flex>
        <VariantSections rows={rows} variant={current} onChange={update} />
      </Box>

      <ShareLinks
        variantId={current.id}
        variantName={current.name || 'this variant'}
        saved={currentSaved}
        keyConfigured={keyConfigured}
        links={links}
        languages={languages}
        onChanged={() => void refreshLinks()}
      />
    </Box>
  ) : (
    <Flex minH="360px" align="center" justify="center" direction="column" gap={3} px={6} textAlign="center">
      <Text fontSize="15px" fontWeight={600}>
        Tailor your CV for each kind of role
      </Text>
      <Text fontSize="13px" color="page.fg-secondary" maxW="420px">
        A variant prints the sections and entries you choose, in your order, aiming at a page count — and you can share it
        with one reader by a private, expiring link.
      </Text>
      <Button size="sm" {...primaryButtonProps} leftIcon={<AddIcon boxSize="9px" />} onClick={() => addVariant()}>
        Create the first variant
      </Button>
    </Flex>
  )

  const previewPane = current ? (
    <Flex direction="column" h="100%" minH={0}>
      <Flex align="center" justify="space-between" gap={2} px={3} py={1.5} minH="40px" borderBottom="1px solid" borderColor="page.border" flexWrap="wrap">
        <Text fontFamily={MONO} fontSize="10px" letterSpacing="0.1em" textTransform="uppercase" color="page.fg-secondary">
          As a private link shows it · {lang === 'en' ? 'EN' : '中文'}
          {current !== deferred ? ' · updating' : ''}
        </Text>
        <Tooltip label={currentSaved ? 'Open the saved variant’s PDF' : 'Save to open the PDF'} hasArrow>
          <Box>
            <IconButton
              as="a"
              href={currentSaved ? variantPdfHref(current.id, lang) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open this variant as PDF"
              aria-disabled={!currentSaved}
              icon={<FaFilePdf />}
              size="xs"
              variant="ghost"
              isDisabled={!currentSaved}
            />
          </Box>
        </Tooltip>
      </Flex>
      <Box flex={1} minH={0} overflow="auto" p={{ base: 3, md: 5 }} bg={canvas}>
        {previewSections.length ? (
          <ScaledSheet pageGuides>
            <CVResult cvData={previewSections as never} lang={lang} ownerNames={ownerNames} />
          </ScaledSheet>
        ) : (
          <Text fontSize="13px" color="page.fg-secondary" textAlign="center" py={16}>
            Nothing to print in {lang === 'en' ? 'English' : 'Chinese'} yet.
          </Text>
        )}
      </Box>
    </Flex>
  ) : null

  return (
    <Flex
      direction="column"
      h={{ base: 'auto', lg: 'var(--admin-workspace-h, calc(100vh - 210px))' }}
      minH={{ lg: '640px' }}
      border="1px solid"
      borderColor="page.border"
      borderRadius="xl"
      overflow={{ base: 'visible', lg: 'hidden' }}
    >
      {/* Toolbar */}
      <Flex
        align="center"
        gap={2}
        px={3}
        py={2}
        borderBottom="1px solid"
        borderColor="page.border"
        borderTopRadius="xl"
        bg="page.bg-elevated"
        wrap="wrap"
        position={{ base: 'sticky', lg: 'static' }}
        top={{ base: '57px', lg: 'auto' }}
        zIndex={5}
      >
        <SaveButton onSave={() => void save()} canSave={dirty} saving={saving} label="Save variants" />
        <Button
          size="sm"
          variant="ghost"
          isDisabled={!dirty || saving}
          onClick={async () => {
            const ok = await confirmDiscard('Discard the unsaved changes to the variants?', { title: 'Discard changes?', allowSave: false, discardLabel: 'Discard' })
            if (ok) {
              setVariants(JSON.parse(savedJson))
              setSelected((s) => (s && (JSON.parse(savedJson) as CvVariant[]).some((v) => v.id === s) ? s : (JSON.parse(savedJson) as CvVariant[])[0]?.id ?? null))
            }
          }}
        >
          Discard
        </Button>
        <HStack ml="auto" spacing={3}>
          <SaveStatus state={saving ? 'saving' : dirty ? 'dirty' : 'clean'} savedAt={savedAt ?? undefined} label={!saving && !dirty && !savedAt ? 'Up to date' : undefined} />
        </HStack>
      </Flex>

      {conflict ? (
        <Flex align="center" gap={3} px={4} py={2} bg="rgba(251,146,60,0.10)" borderBottom="1px solid" borderColor="page.border" wrap="wrap" fontSize="13px" role="alert">
          <Text flex={1} minW="200px">
            The variants were saved somewhere else since you opened them, so nothing was saved here.
          </Text>
          <Button
            size="xs"
            {...outlineButtonProps}
            onClick={async () => {
              const ok = await confirmDiscard('Discard your edits here and load the latest variants?', { title: 'Load the latest variants?', allowSave: false, discardLabel: 'Discard and load' })
              if (ok) {
                setConflict(false)
                void load()
              }
            }}
          >
            Load latest
          </Button>
        </Flex>
      ) : null}

      {/* Phones and tablets: one pane at a time */}
      <ButtonGroup display={{ base: 'flex', lg: 'none' }} size="sm" isAttached variant="outline" m={2} role="group" aria-label="Pane">
        {(['list', 'edit', 'preview'] as Pane[]).map((p) => (
          <Button
            key={p}
            flex={1}
            aria-pressed={pane === p}
            onClick={() => setPane(p)}
            borderColor={pane === p ? 'var(--accent)' : 'page.border'}
            bg={pane === p ? 'var(--accent-soft)' : undefined}
            color={pane === p ? 'accent.text' : undefined}
            zIndex={pane === p ? 1 : undefined}
            fontSize="12px"
          >
            {p === 'list' ? `Variants (${variants.length})` : p === 'edit' ? 'Edit & links' : 'Preview'}
          </Button>
        ))}
      </ButtonGroup>

      <Flex flex={1} minH={0} direction={{ base: 'column', lg: 'row' }}>
        <Box
          as="nav"
          aria-label="CV variants"
          w={{ base: '100%', lg: '260px' }}
          flexShrink={0}
          borderStyle="solid"
          borderColor="page.border"
          borderWidth={0}
          borderRightWidth={{ base: 0, lg: '1px' }}
          bg="page.bg-elevated"
          overflowY={{ lg: 'auto' }}
          display={{ base: pane === 'list' ? 'block' : 'none', lg: 'block' }}
        >
          {listPane}
        </Box>
        <Box
          as="section"
          aria-label="Edit the variant"
          flex={1}
          minW={0}
          overflowY={{ lg: 'auto' }}
          bg="page.bg"
          display={{ base: pane === 'edit' ? 'block' : 'none', lg: 'block' }}
          sx={{ scrollbarGutter: 'stable' }}
        >
          {editPane}
        </Box>
        {previewPane ? (
          <Box
            as="section"
            aria-label="Preview"
            flex={1}
            minW={0}
            borderStyle="solid"
            borderColor="page.border"
            borderWidth={0}
            borderLeftWidth={{ base: 0, lg: '1px' }}
            display={{ base: pane === 'preview' ? 'block' : 'none', lg: 'block' }}
            h={{ base: '75vh', lg: 'auto' }}
          >
            {previewPane}
          </Box>
        ) : null}
      </Flex>

      <AlertDialog isOpen={deleteDialog.isOpen} onClose={deleteDialog.onClose} leastDestructiveRef={cancelRef} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent mx={4}>
            <AlertDialogHeader fontSize="md">Delete “{current?.name || 'this variant'}”?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              The CV itself is not touched.
              {activeLinks
                ? ` When you save, its ${activeLinks === 1 ? 'active link stops' : `${activeLinks} active links stop`} working.`
                : ''}{' '}
              Until you save, Discard brings it back.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" variant="ghost" onClick={deleteDialog.onClose}>
                Cancel
              </Button>
              <Button size="sm" colorScheme="red" onClick={deleteCurrent}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Flex>
  )
}
