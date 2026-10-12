import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
  ButtonGroup,
  Divider,
  Flex,
  HStack,
  IconButton,
  Kbd,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Spinner,
  Switch,
  Text,
  Tooltip,
  useDisclosure,
  useToast,
} from '@chakra-ui/react'
import { ChevronDownIcon, DeleteIcon } from '@chakra-ui/icons'
import { FaRedo, FaUndo, FaSave, FaFileExport, FaFileImport, FaLink, FaUnlink } from 'react-icons/fa'
import { FiFileText, FiGlobe, FiColumns, FiLayout } from 'react-icons/fi'
import { useRouter } from 'next/router'
import { SECTION_BY_NAME, blankSection } from '../../lib/cvSections'
import { countHidden, getAt, isSectionOnCv, isSectionOnWebsite, revealAll, type CvLang, type CvPath } from '../../lib/cvVisibility'
import { syncLanguage } from '../../lib/cvSync'
import { useCvDocument } from './cvStudio/useCvDocument'
import {
  addSection,
  canLinkList,
  listOp,
  moveSection,
  otherLang,
  removeSection,
  setSectionFlag,
  setValue,
  toggleEntryHidden,
  toggleFieldHidden,
  toggleItemHidden,
  type Doc,
  type ListOp,
  type Section,
} from './cvStudio/docOps'
import { StudioContext, type StudioApi } from './cvStudio/StudioContext'
import { SectionEditor } from './cvStudio/SectionEditor'
import Sidebar from './cvStudio/Sidebar'
import Preview from './cvStudio/Preview'
import { monoFont, useStudioTokens } from './cvStudio/fields'

/* ─────────────────────────────────────────────────────────────────────────
 * CV Editor Studio
 *
 *   ┌ toolbar: save · undo/redo · EN|中 · link · sync · import/export ┐
 *   ├ sections (drag, CV/website switches) │ editor │ live A4 preview ┤
 *
 * Visibility at every level — section (CV and website independently), entry
 * (a degree, a job, a highlight), field (GPA, phone…) and individual bullet
 * or tag — via the eye toggles. Hidden content is stripped server-side from
 * every public page and the public API (lib/cvVisibility.ts).
 *
 * Both languages live in one document with one undo history. With "Link" on,
 * visibility switches and structural edits (add / delete / reorder /
 * duplicate) apply to the other language at the same position, so EN and 中
 * stay aligned; text edits are always per-language.
 * ──────────────────────────────────────────────────────────────────────── */

const LINK_KEY = 'cv-studio:link'
const PREVIEW_KEY = 'cv-studio:preview'

function timeAgo(ms: number | null) {
  if (!ms) return ''
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function writePref(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

type MobilePane = 'sections' | 'edit' | 'preview'

export default function CVEditorStudio() {
  const toast = useToast()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const cv = useCvDocument()
  const { doc, apply, undo, redo, dirty } = cv

  const [lang, setLang] = useState<CvLang>('en')
  const [linked, setLinked] = useState(true)
  const [showPreview, setShowPreview] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [mobilePane, setMobilePane] = useState<MobilePane>('edit')
  const [, tick] = useState(0)
  const conflict = useDisclosure()
  const removeDialog = useDisclosure()
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const { border, dim, faint, surfaceAlt } = useStudioTokens()
  const mod = isMac() ? '⌘' : 'Ctrl'

  useEffect(() => {
    setLinked(readPref(LINK_KEY, true))
    setShowPreview(readPref(PREVIEW_KEY, true))
  }, [])

  // Re-render every 30s so "saved 2m ago" stays truthful.
  useEffect(() => {
    const id = window.setInterval(() => tick((x) => x + 1), 30000)
    return () => window.clearInterval(id)
  }, [])

  const docRef = useRef(doc)
  docRef.current = doc

  const sections = doc[lang]
  // Keep a valid selection when data loads / language switches / sections change.
  useEffect(() => {
    if (cv.loadState !== 'ready') return
    if (!selected || !sections.some((s) => s.sessionName === selected)) {
      setSelected(sections[0]?.sessionName || null)
    }
  }, [cv.loadState, sections, selected])

  const selectedIdx = sections.findIndex((s) => s.sessionName === selected)
  const selectedSection = selectedIdx >= 0 ? sections[selectedIdx] : null

  // ── Notifications ──────────────────────────────────────────────────────
  const notifyUndoable = useCallback(
    (title: string) => {
      const id = `undo-${title}`
      if (toast.isActive(id)) toast.close(id)
      toast({
        id,
        duration: 5000,
        position: 'bottom',
        render: ({ onClose }) => (
          <HStack
            bg="gray.900"
            color="white"
            px={4}
            py={2.5}
            borderRadius="lg"
            boxShadow="xl"
            spacing={4}
            fontSize="13px"
            border="1px solid rgba(255,255,255,0.12)"
          >
            <Text>{title}</Text>
            <Button
              size="xs"
              variant="outline"
              colorScheme="whiteAlpha"
              onClick={() => {
                undo()
                onClose()
              }}
            >
              Undo
            </Button>
          </HStack>
        ),
      })
    },
    [toast, undo],
  )

  const warnUnlinked = useCallback(() => {
    const id = 'unlinked'
    if (toast.isActive(id)) return
    toast({
      id,
      status: 'info',
      duration: 4000,
      position: 'bottom-right',
      title: `Applied to ${lang === 'en' ? 'EN' : '中文'} only`,
      description: `The ${lang === 'en' ? '中文' : 'EN'} list has a different length here. Use “Sync 中 ← EN” to realign.`,
    })
  }, [toast, lang])

  // ── Edit API (context for every form control) ──────────────────────────
  const api: StudioApi = useMemo(
    () => ({
      lang,
      linked,
      setValue: (path: CvPath, value: any) => apply((d) => setValue(d, lang, path, value), `${lang}:${path.join('.')}`),
      toggleField: (nodePath: CvPath, field: string) => apply((d) => toggleFieldHidden(d, lang, nodePath, field, linked)),
      toggleEntry: (entryPath: CvPath) => apply((d) => toggleEntryHidden(d, lang, entryPath, linked)),
      toggleItem: (parentPath: CvPath, field: string, index: number) =>
        apply((d) => toggleItemHidden(d, lang, parentPath, field, index, linked)),
      list: (listPath: CvPath, op: ListOp, label?: string) => {
        const reaches = !linked || canLinkList(docRef.current, lang, listPath)
        apply((d) => listOp(d, lang, listPath, op, linked).doc)
        if (!reaches) warnUnlinked()
        if (label) notifyUndoable(label)
      },
      insertMany: (listPath: CvPath, index: number, values: string[], replaceAtIndex = false) => {
        apply((d) => {
          let next = d
          let at = index
          let rest = values
          if (replaceAtIndex && values.length) {
            next = setValue(next, lang, [...listPath, index], values[0])
            rest = values.slice(1)
            at = index + 1
          } else if (!replaceAtIndex) {
            const cur = getAt(next[lang], listPath)
            at = Math.min(index + (Array.isArray(cur) && cur.length > index ? 1 : 0), Array.isArray(cur) ? cur.length : 0)
          }
          rest.forEach((v, k) => {
            const r = listOp(next, lang, listPath, { type: 'insert', index: at + k, item: v, twinItem: '' }, linked)
            next = r.doc
          })
          return next
        })
      },
    }),
    [apply, lang, linked, notifyUndoable, warnUnlinked],
  )

  // ── Section-level actions ──────────────────────────────────────────────
  const toggleScope = (idx: number, key: 'isVisible' | 'showOnWebsite') => {
    const s = sections[idx]
    if (!s) return
    const on = key === 'isVisible' ? isSectionOnCv(s) : isSectionOnWebsite(s)
    apply((d) => setSectionFlag(d, lang, idx, key, !on, linked))
  }

  const onAddSection = (name: string) => {
    apply((d) => addSection(d, lang, (l) => blankSection(name, l) as Section | null, linked))
    setSelected(name)
    setMobilePane('edit')
  }

  const onRemoveSection = () => {
    if (!selectedSection) return
    const label = SECTION_BY_NAME[selectedSection.sessionName]?.label || selectedSection.sessionName
    apply((d) => removeSection(d, lang, selectedSection.sessionName, linked))
    removeDialog.onClose()
    notifyUndoable(`Deleted section “${label}”${linked ? ' (EN + 中)' : ''}`)
  }

  const onRevealAll = () => {
    if (selectedIdx < 0) return
    const name = selectedSection?.sessionName
    apply((d) => {
      let next: Doc = { ...d, [lang]: d[lang].map((s, i) => (i === selectedIdx ? revealAll(s) : s)) }
      if (linked) {
        const o = otherLang(lang)
        next = { ...next, [o]: next[o].map((s) => (s.sessionName === name ? revealAll(s) : s)) }
      }
      return next
    })
    notifyUndoable('Revealed every hidden field and item in this section')
  }

  const onSyncZh = () => {
    apply((d) => ({ ...d, zh: syncLanguage(d.en, d.zh) }))
    notifyUndoable('中文 structure synced from EN — review, then save')
  }

  // ── Save ───────────────────────────────────────────────────────────────
  const doSave = useCallback(
    async (force = false) => {
      if (cv.saving || cv.loadState !== 'ready') return
      const r = await cv.save(force)
      if (r === 'conflict') {
        conflict.onOpen()
        return
      }
      if (r.ok) {
        conflict.onClose()
        toast({
          status: r.warning ? 'warning' : 'success',
          title: 'CV saved',
          description: r.warning || 'Live on /cv, /about and the home page.',
          duration: r.warning ? 6000 : 2200,
          position: 'bottom-right',
        })
      } else {
        toast({ status: 'error', title: 'Save failed', description: r.error, position: 'bottom-right' })
      }
    },
    [cv, conflict, toast],
  )

  // ── Shortcuts ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        doSave(false)
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [doSave, undo, redo])

  // ── Leave guards ───────────────────────────────────────────────────────
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    const onRoute = (url: string) => {
      if (!dirty || url.startsWith('/admin/dashboard')) return
      if (!window.confirm('You have unsaved CV changes. Leave without saving?')) {
        router.events.emit('routeChangeError')
        throw 'Route change aborted (unsaved CV changes)'
      }
    }
    window.addEventListener('beforeunload', onUnload)
    router.events.on('routeChangeStart', onRoute)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      router.events.off('routeChangeStart', onRoute)
    }
  }, [dirty, router.events])

  // ── Import / export ────────────────────────────────────────────────────
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cv-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const onImportFile = async (file: File) => {
    try {
      const j = JSON.parse(await file.text())
      const valid = (a: any) => Array.isArray(a) && a.every((s) => s && typeof s === 'object' && typeof s.sessionName === 'string')
      if (Array.isArray(j)) {
        if (!valid(j)) throw new Error('Every section needs a "sessionName"')
        apply((d) => ({ ...d, [lang]: j }))
      } else if (j && (valid(j.en) || valid(j.zh))) {
        apply((d) => ({ en: valid(j.en) ? j.en : d.en, zh: valid(j.zh) ? j.zh : d.zh }))
      } else {
        throw new Error('Expected { en: [...], zh: [...] } or an array of sections')
      }
      notifyUndoable(`Imported ${file.name} — review, then save`)
    } catch (e: any) {
      toast({ status: 'error', title: 'Import failed', description: e?.message || 'Invalid JSON', position: 'bottom-right' })
    }
  }

  // ── States ─────────────────────────────────────────────────────────────
  if (cv.loadState === 'loading') {
    return (
      <Flex h="60vh" align="center" justify="center" direction="column" gap={3}>
        <Spinner size="lg" color="var(--accent)" thickness="3px" />
        <Text fontFamily={monoFont} fontSize="11px" color={dim}>
          Loading CV…
        </Text>
      </Flex>
    )
  }
  if (cv.loadState === 'unauthorized' || cv.loadState === 'error') {
    return (
      <Flex h="50vh" align="center" justify="center" direction="column" gap={3} textAlign="center" px={6}>
        <Text fontWeight={600}>{cv.loadState === 'unauthorized' ? 'Your session has expired' : 'Could not load the CV'}</Text>
        <Text fontSize="13px" color={dim} maxW="420px">
          {cv.loadState === 'unauthorized' ? 'Sign in again to keep editing.' : cv.loadError}
        </Text>
        {cv.loadState === 'unauthorized' ? (
          <Button size="sm" as="a" href={`/admin/login?next=${encodeURIComponent('/admin/dashboard?tab=cv')}`}>
            Sign in
          </Button>
        ) : (
          <Button size="sm" onClick={() => cv.load()}>
            Retry
          </Button>
        )}
      </Flex>
    )
  }

  const def = selectedSection ? SECTION_BY_NAME[selectedSection.sessionName] : undefined
  const hiddenHere = selectedSection ? countHidden(selectedSection) : 0
  const otherHas = selectedSection ? doc[otherLang(lang)].some((s) => s.sessionName === selectedSection.sessionName) : false

  // ── Panes ──────────────────────────────────────────────────────────────
  const sidebar = (
    <Sidebar
      sections={sections}
      selected={selected}
      onSelect={(n) => {
        setSelected(n)
        setMobilePane('edit')
      }}
      onMove={(from, to) => apply((d) => moveSection(d, lang, from, to, linked))}
      onToggleCv={(i) => toggleScope(i, 'isVisible')}
      onToggleWeb={(i) => toggleScope(i, 'showOnWebsite')}
      onAdd={onAddSection}
    />
  )

  const editor = selectedSection ? (
    <Box maxW="760px" mx="auto" px={{ base: 4, md: 6 }} py={5}>
      <Flex align="flex-start" justify="space-between" gap={3} mb={4} wrap="wrap">
        <Box minW={0}>
          <Text fontFamily={monoFont} fontSize="10px" color={dim} letterSpacing="0.12em" textTransform="uppercase">
            {lang === 'en' ? 'English' : '中文'} · {def?.label || selectedSection.sessionName}
          </Text>
          <Text fontSize="20px" fontWeight={600} mt={1} letterSpacing="-0.01em" noOfLines={1}>
            {selectedSection.headerName || def?.label || selectedSection.sessionName}
          </Text>
          {def ? (
            <Text fontSize="12px" color={dim} mt={0.5}>
              {def.description}
            </Text>
          ) : null}
        </Box>
        <HStack spacing={3} flexWrap="wrap">
          <HStack as="label" spacing={1.5} cursor="pointer" fontSize="12px">
            <FiFileText />
            <Text>CV</Text>
            <Switch
              size="sm"
              colorScheme="purple"
              isChecked={isSectionOnCv(selectedSection)}
              onChange={() => toggleScope(selectedIdx, 'isVisible')}
              aria-label="Show this section on the CV / PDF"
            />
          </HStack>
          <HStack as="label" spacing={1.5} cursor="pointer" fontSize="12px">
            <FiGlobe />
            <Text>Website</Text>
            <Switch
              size="sm"
              colorScheme="purple"
              isChecked={isSectionOnWebsite(selectedSection)}
              onChange={() => toggleScope(selectedIdx, 'showOnWebsite')}
              aria-label="Show this section on the website"
            />
          </HStack>
          <Menu isLazy placement="bottom-end">
            <MenuButton as={IconButton} aria-label="Section actions" icon={<ChevronDownIcon />} size="sm" variant="ghost" />
            <MenuList fontSize="13px">
              <MenuItem isDisabled={hiddenHere === 0} onClick={onRevealAll}>
                Reveal all hidden ({hiddenHere})
              </MenuItem>
              <MenuDivider />
              <MenuItem icon={<DeleteIcon />} color="red.400" onClick={removeDialog.onOpen}>
                Delete section…
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>
      {linked && !otherHas ? (
        <Box mb={4} px={3} py={2} borderRadius="md" bg="orange.50" _dark={{ bg: 'rgba(251,146,60,0.12)' }} fontSize="12px">
          This section doesn’t exist in {lang === 'en' ? '中文' : 'EN'} yet, so linked changes stay here.
          {lang === 'en' ? ' Use “Sync 中 ← EN” to create it.' : ''}
        </Box>
      ) : null}
      <Divider mb={5} borderColor={border} />
      <SectionEditor key={`${lang}-${selectedSection.sessionName}`} def={def} section={selectedSection} sectionIdx={selectedIdx} />
    </Box>
  ) : (
    <Flex h="100%" minH="320px" align="center" justify="center" direction="column" gap={2} px={6} textAlign="center">
      <Text fontSize="14px" fontWeight={500}>
        {sections.length ? 'Pick a section to edit' : `No ${lang === 'en' ? 'English' : '中文'} sections yet`}
      </Text>
      <Text fontSize="12px" color={dim}>
        {lang === 'zh' && doc.en.length ? 'Start from the English version with “Sync 中 ← EN”.' : 'Add one from the sidebar.'}
      </Text>
      {lang === 'zh' && doc.en.length ? (
        <Button size="sm" mt={2} onClick={onSyncZh}>
          Sync 中 ← EN
        </Button>
      ) : null}
    </Flex>
  )

  const preview = <Preview sections={sections} lang={lang} />

  return (
    <StudioContext.Provider value={api}>
      <Flex direction="column" h={{ base: 'auto', lg: 'calc(100vh - 210px)' }} minH={{ lg: '640px' }} border="1px solid" borderColor={border} borderRadius="xl" overflow="hidden">
        {/* ── Toolbar ─────────────────────────────────────────────── */}
        <Flex
          align="center"
          gap={2}
          px={3}
          py={2}
          borderBottom="1px solid"
          borderColor={border}
          wrap="wrap"
          bg={surfaceAlt}
          position={{ base: 'sticky', lg: 'static' }}
          top={0}
          zIndex={5}
        >
          <ButtonGroup size="sm" isAttached>
            <Tooltip label={`Save (${mod}S)`} hasArrow>
              <Button
                leftIcon={<FaSave />}
                onClick={() => doSave(false)}
                isLoading={cv.saving}
                loadingText="Saving"
                isDisabled={!dirty}
                bg={dirty ? 'var(--accent)' : undefined}
                color={dirty ? 'white' : undefined}
                _hover={dirty ? { opacity: 0.92 } : undefined}
                _disabled={{ opacity: 0.55, cursor: 'not-allowed' }}
              >
                Save
              </Button>
            </Tooltip>
          </ButtonGroup>

          <ButtonGroup size="sm" isAttached variant="outline">
            <Tooltip label={`Undo (${mod}Z)`} hasArrow>
              <IconButton aria-label="Undo" icon={<FaUndo />} onClick={undo} isDisabled={!cv.canUndo} borderColor={border} />
            </Tooltip>
            <Tooltip label={`Redo (${mod}⇧Z)`} hasArrow>
              <IconButton aria-label="Redo" icon={<FaRedo />} onClick={redo} isDisabled={!cv.canRedo} borderColor={border} />
            </Tooltip>
          </ButtonGroup>

          <ButtonGroup size="sm" isAttached variant="outline" role="group" aria-label="Editing language">
            {(['en', 'zh'] as CvLang[]).map((l) => (
              <Button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                fontFamily={monoFont}
                borderColor={lang === l ? 'var(--accent)' : border}
                bg={lang === l ? 'var(--accent-soft)' : undefined}
                color={lang === l ? 'var(--accent)' : undefined}
                zIndex={lang === l ? 1 : undefined}
              >
                {l === 'en' ? 'EN' : '中文'}
              </Button>
            ))}
          </ButtonGroup>

          <Tooltip
            label={
              linked
                ? 'Linked: visibility + add/delete/reorder also apply to the other language'
                : 'Unlinked: every change applies to this language only'
            }
            hasArrow
          >
            <Button
              size="sm"
              variant="outline"
              borderColor={linked ? 'var(--accent)' : border}
              color={linked ? 'var(--accent)' : dim}
              leftIcon={linked ? <FaLink /> : <FaUnlink />}
              aria-pressed={linked}
              onClick={() => {
                setLinked((v) => {
                  writePref(LINK_KEY, !v)
                  return !v
                })
              }}
              fontSize="12px"
            >
              {linked ? 'Linked' : 'Unlinked'}
            </Button>
          </Tooltip>

          <Menu isLazy>
            <MenuButton as={Button} size="sm" variant="ghost" rightIcon={<ChevronDownIcon />} fontSize="12px">
              More
            </MenuButton>
            <MenuList fontSize="13px">
              <MenuItem onClick={onSyncZh}>Sync 中 ← EN structure</MenuItem>
              <MenuDivider />
              <MenuItem icon={<FaFileImport />} onClick={() => fileRef.current?.click()}>
                Import JSON…
              </MenuItem>
              <MenuItem icon={<FaFileExport />} onClick={exportJSON}>
                Export JSON (EN + 中)
              </MenuItem>
            </MenuList>
          </Menu>

          <HStack ml="auto" spacing={3}>
            <HStack spacing={1.5} fontFamily={monoFont} fontSize="11px" color={dim} aria-live="polite">
              <Box w="7px" h="7px" borderRadius="full" bg={dirty ? 'orange.400' : 'green.400'} />
              <Text>{cv.saving ? 'saving…' : dirty ? 'unsaved changes' : cv.savedAt ? `saved ${timeAgo(cv.savedAt)}` : 'up to date'}</Text>
            </HStack>
            <Tooltip label={showPreview ? 'Hide preview' : 'Show preview'} hasArrow>
              <IconButton
                aria-label={showPreview ? 'Hide preview' : 'Show preview'}
                aria-pressed={showPreview}
                icon={showPreview ? <FiColumns /> : <FiLayout />}
                size="sm"
                variant="ghost"
                display={{ base: 'none', lg: 'inline-flex' }}
                onClick={() =>
                  setShowPreview((v) => {
                    writePref(PREVIEW_KEY, !v)
                    return !v
                  })
                }
              />
            </Tooltip>
          </HStack>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImportFile(f)
              e.target.value = ''
            }}
          />
        </Flex>

        {cv.draft ? (
          <Flex align="center" gap={3} px={4} py={2} bg="var(--accent-soft)" borderBottom="1px solid" borderColor={border} wrap="wrap" fontSize="13px">
            <Text flex={1} minW="200px">
              Found unsaved edits from {timeAgo(cv.draft.at)} on this device.
            </Text>
            <Button size="xs" onClick={cv.restoreDraft} bg="var(--accent)" color="white" _hover={{ opacity: 0.9 }}>
              Restore draft
            </Button>
            <Button size="xs" variant="ghost" onClick={cv.discardDraft}>
              Discard
            </Button>
          </Flex>
        ) : null}

        {/* ── Mobile pane switcher ─────────────────────────────────── */}
        <ButtonGroup display={{ base: 'flex', lg: 'none' }} size="sm" isAttached variant="outline" m={2} role="tablist">
          {(['sections', 'edit', 'preview'] as MobilePane[]).map((p) => (
            <Button
              key={p}
              flex={1}
              role="tab"
              aria-selected={mobilePane === p}
              onClick={() => setMobilePane(p)}
              borderColor={mobilePane === p ? 'var(--accent)' : border}
              bg={mobilePane === p ? 'var(--accent-soft)' : undefined}
              color={mobilePane === p ? 'var(--accent)' : undefined}
              zIndex={mobilePane === p ? 1 : undefined}
              textTransform="capitalize"
              fontSize="12px"
            >
              {p}
            </Button>
          ))}
        </ButtonGroup>

        {/* ── Workspace ────────────────────────────────────────────── */}
        <Flex flex={1} minH={0} direction={{ base: 'column', lg: 'row' }}>
          <Box
            w={{ base: '100%', lg: '272px' }}
            flexShrink={0}
            borderRight={{ lg: '1px solid' }}
            borderColor={border}
            display={{ base: mobilePane === 'sections' ? 'block' : 'none', lg: 'block' }}
            minH={{ base: '360px', lg: 0 }}
            bg={surfaceAlt}
          >
            {sidebar}
          </Box>
          <Box
            flex={1}
            minW={0}
            overflowY={{ lg: 'auto' }}
            display={{ base: mobilePane === 'edit' ? 'block' : 'none', lg: 'block' }}
            sx={{ scrollbarGutter: 'stable' }}
          >
            {editor}
          </Box>
          {showPreview ? (
            <Box
              flex={1}
              minW={0}
              borderLeft={{ lg: '1px solid' }}
              borderColor={border}
              display={{ base: mobilePane === 'preview' ? 'block' : 'none', lg: 'block' }}
              h={{ base: '75vh', lg: 'auto' }}
            >
              {preview}
            </Box>
          ) : (
            <Box display={{ base: mobilePane === 'preview' ? 'block' : 'none', lg: 'none' }} h="75vh">
              {preview}
            </Box>
          )}
        </Flex>

        <Flex
          px={3}
          py={1.5}
          borderTop="1px solid"
          borderColor={border}
          fontFamily={monoFont}
          fontSize="10px"
          color={faint}
          gap={4}
          wrap="wrap"
          display={{ base: 'none', md: 'flex' }}
        >
          <HStack spacing={1}>
            <Kbd fontSize="9px">{mod}</Kbd>
            <Kbd fontSize="9px">S</Kbd>
            <Text>save</Text>
          </HStack>
          <HStack spacing={1}>
            <Kbd fontSize="9px">{mod}</Kbd>
            <Kbd fontSize="9px">Z</Kbd>
            <Text>undo</Text>
          </HStack>
          <HStack spacing={1}>
            <Kbd fontSize="9px">Enter</Kbd>
            <Text>new bullet</Text>
          </HStack>
          <HStack spacing={1}>
            <Kbd fontSize="9px">Alt</Kbd>
            <Kbd fontSize="9px">↑↓</Kbd>
            <Text>move bullet</Text>
          </HStack>
          <Text ml="auto">
            <Badge variant="outline" fontSize="9px" mr={1}>
              eye
            </Badge>
            hides a field, entry or bullet from the CV and website
          </Text>
        </Flex>
      </Flex>

      {/* Conflict: the CV changed on the server since it was loaded */}
      <AlertDialog isOpen={conflict.isOpen} onClose={conflict.onClose} leastDestructiveRef={cancelRef} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="md">The CV changed somewhere else</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              It was saved from another tab or editor after you opened the Studio. Overwrite it with your version, or reload
              the latest copy (your unsaved edits here will be lost).
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" variant="ghost" onClick={conflict.onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  conflict.onClose()
                  cv.load()
                }}
              >
                Reload latest
              </Button>
              <Button size="sm" colorScheme="red" onClick={() => doSave(true)} isLoading={cv.saving}>
                Overwrite
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      {/* Delete section */}
      <AlertDialog isOpen={removeDialog.isOpen} onClose={removeDialog.onClose} leastDestructiveRef={cancelRef} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="md">Delete this section?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              “{selectedSection?.headerName || def?.label}” and everything in it will be removed
              {linked ? ' from both EN and 中文' : ` from ${lang === 'en' ? 'EN' : '中文'}`}. You can undo until you leave the
              page. To keep it but not show it, switch off CV and Website instead.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelRef} size="sm" variant="ghost" onClick={removeDialog.onClose}>
                Cancel
              </Button>
              <Button size="sm" colorScheme="red" onClick={onRemoveSection}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </StudioContext.Provider>
  )
}
