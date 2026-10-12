import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
  VisuallyHidden,
  useDisclosure,
  useToast,
  type UseToastOptions,
} from '@chakra-ui/react'
import { ChevronDownIcon, DeleteIcon, ViewOffIcon } from '@chakra-ui/icons'
import { FaRedo, FaUndo, FaSave, FaFileExport, FaFileImport, FaLink, FaUnlink, FaEllipsisH } from 'react-icons/fa'
import { FiFileText, FiGlobe, FiColumns, FiLayout } from 'react-icons/fi'
import { SECTION_BY_NAME, blankSection, type ListDef, type SectionDef } from '../../lib/cvSections'
import {
  countHidden,
  getAt,
  hiddenIndices,
  isFieldHidden,
  isSectionOnCv,
  isSectionOnWebsite,
  revealAll,
  type CvLang,
  type CvPath,
} from '../../lib/cvVisibility'
import { syncLanguage } from '../../lib/cvSync'
import { useDirtyRegistration } from './AdminDirtyContext'
import { useCvDocument } from './cvStudio/useCvDocument'
import {
  addSection,
  hasContent,
  insertMany,
  listOp,
  moveSection,
  otherLang,
  previewText,
  removeSection,
  sectionMisalignments,
  setEntryHidden,
  setFieldHidden,
  setItemHidden,
  setSectionFlag,
  setValue,
  toggleEntryHidden,
  toggleFieldHidden,
  toggleItemHidden,
  twinListItem,
  twinListLength,
  type Doc,
  type LinkedResult,
  type ListOp,
  type Section,
} from './cvStudio/docOps'
import { collectHidden, type HiddenRow } from './cvStudio/hiddenIndex'
import { LOGIN_HREF } from './cvStudio/cvApi'
import { StudioContext, cvPathAttr, type FocusTarget, type StudioApi } from './cvStudio/StudioContext'
import { SectionEditor } from './cvStudio/SectionEditor'
import Sidebar, { type SectionAlignment } from './cvStudio/Sidebar'
import Preview from './cvStudio/Preview'
import HiddenPanel from './cvStudio/HiddenPanel'
import { monoFont, useStudioTokens } from './cvStudio/fields'

/* ─────────────────────────────────────────────────────────────────────────
 * CV Editor Studio
 *
 *   ┌ toolbar: save · undo/redo · EN|中 · link · hidden · more ┐
 *   ├ sections (drag, CV/website switches) │ editor │ live preview ┤
 *
 * Visibility at every level — section (CV and website independently), entry
 * (a degree, a job, a highlight), field (GPA, phone…) and individual bullet
 * or tag — via the eye toggles; the Hidden items panel lists all of it.
 * Hidden content is stripped server-side from every public page and the
 * public API (lib/cvVisibility.ts).
 *
 * Both languages live in one document with one undo history. With "Link" on,
 * visibility switches and structural edits (add / delete / reorder /
 * duplicate) also apply to the other language at the same position — but
 * only where EN and 中 line up (same list lengths on the whole path), and a
 * non-empty item in the other language is never deleted without asking.
 * Text edits are always per-language. Every linked change says where it
 * landed: "(EN + 中)" or "(EN only)".
 * ──────────────────────────────────────────────────────────────────────── */

const LINK_KEY = 'cv-studio:link'
const PREVIEW_KEY = 'cv-studio:preview'

const LANG_LABEL: Record<CvLang, string> = { en: 'EN', zh: '中文' }

function timeAgo(ms: number | null) {
  if (!ms) return ''
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
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

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Human label of a path inside a section ("Roles › #2 › Highlights"). */
function describeSectionPath(def: SectionDef | undefined, path: CvPath): string {
  let lists: ListDef[] | undefined = def?.lists
  const parts: string[] = []
  for (const seg of path) {
    if (typeof seg === 'number') {
      parts.push(`#${seg + 1}`)
      continue
    }
    const l = lists?.find((x) => x.key === seg)
    const f = def?.fields?.find((x) => x.key === seg)
    parts.push(l?.label || f?.label || seg)
    lists = l?.lists
  }
  return parts.join(' › ')
}

type MobilePane = 'sections' | 'edit' | 'preview'

type PendingRemove = { listPath: CvPath; index: number; label?: string; lang: CvLang; twinText: string }

/** Inverse-coloured toast body in the site's style. */
function InverseToast({ children }: { children: React.ReactNode }) {
  return (
    <HStack
      bg="page.fg"
      color="page.bg"
      px={4}
      py={2.5}
      borderRadius="lg"
      boxShadow="xl"
      spacing={4}
      fontSize="13px"
      maxW="calc(100vw - 32px)"
    >
      {children}
    </HStack>
  )
}

/** Toast with an Undo that reverts exactly one edit — disabled once anything else changed. */
function UndoToast({
  title,
  subscribe,
  isCurrent,
  onUndo,
  undoHint,
}: {
  title: string
  subscribe: (cb: () => void) => () => void
  isCurrent: () => boolean
  onUndo: () => void
  undoHint: string
}) {
  const canUndo = useSyncExternalStore(subscribe, isCurrent, () => false)
  return (
    <InverseToast>
      <Text>{title}</Text>
      <Button
        size="xs"
        variant="outline"
        color="inherit"
        borderColor="currentColor"
        _hover={{ bg: 'rgba(127,127,127,0.18)' }}
        isDisabled={!canUndo}
        title={canUndo ? undefined : undoHint}
        onClick={onUndo}
      >
        Undo
      </Button>
    </InverseToast>
  )
}

export default function CVEditorStudio() {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const cv = useCvDocument()
  const { doc, apply, getDoc, undo, redo, dirty } = cv
  useDirtyRegistration('cv-studio', dirty)

  const [lang, setLang] = useState<CvLang>('en')
  const [linked, setLinked] = useState(true)
  const [showPreview, setShowPreview] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [mobilePane, setMobilePane] = useState<MobilePane>('edit')
  const [focus, setFocus] = useState<FocusTarget | null>(null)
  const [pendingRemove, setPendingRemove] = useState<PendingRemove | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [, tick] = useState(0)
  const conflict = useDisclosure()
  const removeDialog = useDisclosure()
  const hiddenPanel = useDisclosure()
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const removeCancelRef = useRef<HTMLButtonElement | null>(null)
  const { border, dim, faint, surfaceAlt, hiddenFg } = useStudioTokens()
  const mod = isMac() ? '⌘' : 'Ctrl'
  const other = otherLang(lang)

  useEffect(() => {
    setLinked(readPref(LINK_KEY, true))
    setShowPreview(readPref(PREVIEW_KEY, true))
  }, [])

  // Re-render every 30s so "saved 2m ago" stays truthful.
  useEffect(() => {
    const id = window.setInterval(() => tick((x) => x + 1), 30000)
    return () => window.clearInterval(id)
  }, [])

  // Tiny store so an open "Deleted …" toast knows whether its Undo still
  // refers to the latest history step.
  const docListeners = useRef(new Set<() => void>())
  const subscribeDoc = useCallback((cb: () => void) => {
    docListeners.current.add(cb)
    return () => {
      docListeners.current.delete(cb)
    }
  }, [])
  useEffect(() => {
    docListeners.current.forEach((cb) => cb())
  }, [doc])

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
  const scope = useCallback(
    (reached: boolean) => (reached ? ` (${LANG_LABEL.en} + 中)` : ` (${LANG_LABEL[lang]} only)`),
    [lang],
  )

  /** Short confirmation; a warning when a linked edit could not reach the other language. */
  const announce = useCallback(
    (title: string, warn?: string) => {
      const id = warn ? 'cv-op-warn' : 'cv-op'
      const options: UseToastOptions = warn
        ? { id, status: 'warning', title, description: warn, duration: 5000, position: 'bottom-right', isClosable: true }
        : { id, duration: 1800, position: 'bottom-right', render: () => <InverseToast>{title}</InverseToast> }
      if (toast.isActive(id)) toast.update(id, options)
      else toast(options)
    },
    [toast],
  )

  const lastUndoToast = useRef<string | null>(null)
  const notifyUndoable = useCallback(
    (title: string, after: Doc) => {
      if (lastUndoToast.current && toast.isActive(lastUndoToast.current)) toast.close(lastUndoToast.current)
      const id = `cv-undo-${Date.now()}`
      lastUndoToast.current = id
      toast({
        id,
        duration: 6000,
        position: 'bottom',
        render: ({ onClose }) => (
          <UndoToast
            title={title}
            subscribe={subscribeDoc}
            isCurrent={() => getDoc() === after}
            undoHint={`Other changes were made since — use Undo in the toolbar (${mod}Z)`}
            onUndo={() => {
              if (getDoc() === after) undo()
              onClose()
            }}
          />
        ),
      })
    },
    [toast, subscribeDoc, getDoc, undo, mod],
  )

  /** Why a linked edit stayed in one language. */
  const unlinkedReason = useCallback(
    (sessionName?: string) => {
      const exists = !sessionName || getDoc()[other].some((s) => s.sessionName === sessionName)
      if (!exists) return `This section doesn’t exist in ${LANG_LABEL[other]}.`
      return `${LANG_LABEL[other]} has a different number of items here, so positions don’t line up.${
        lang === 'en' ? ' “Sync 中 ← EN” realigns the structure.' : ''
      }`
    },
    [getDoc, other, lang],
  )

  /** Run a linked edit, record it, and say where it landed. Returns the result with the committed doc. */
  const run = useCallback(
    (fn: (d: Doc) => LinkedResult): LinkedResult => {
      const r = fn(getDoc())
      const committed = apply(() => r.doc)
      return { doc: committed, reached: r.reached }
    },
    [apply, getDoc],
  )

  const sectionNameAt = useCallback((path: CvPath) => getDoc()[lang][Number(path[0])]?.sessionName, [getDoc, lang])

  const reportVisibility = useCallback(
    (r: LinkedResult, title: string, path: CvPath) => {
      if (linked && !r.reached) announce(`${title}${scope(false)}`, unlinkedReason(sectionNameAt(path)))
      else announce(`${title}${scope(r.reached)}`)
    },
    [linked, announce, scope, unlinkedReason, sectionNameAt],
  )

  const applyListOp = useCallback(
    (listPath: CvPath, op: ListOp, label: string | undefined, link: boolean) => {
      const r = run((d) => listOp(d, lang, listPath, op, link))
      const warn = linked && !r.reached ? unlinkedReason(sectionNameAt(listPath)) : undefined
      if (label) {
        notifyUndoable(`${label}${scope(r.reached)}`, r.doc)
        if (warn && link) announce(`Applied to ${LANG_LABEL[lang]} only`, warn)
      } else if (warn && link) {
        announce(`Applied to ${LANG_LABEL[lang]} only`, warn)
      }
    },
    [run, lang, linked, unlinkedReason, sectionNameAt, notifyUndoable, scope, announce],
  )

  // ── Edit API (context for every form control) ──────────────────────────
  const api: StudioApi = useMemo(
    () => ({
      lang,
      linked,
      focus,
      setValue: (path: CvPath, value: any) => {
        apply((d) => setValue(d, lang, path, value), `${lang}:${path.join('.')}`)
      },
      toggleField: (nodePath: CvPath, field: string, label: string) => {
        const r = run((d) => toggleFieldHidden(d, lang, nodePath, field, linked))
        const nowHidden = isFieldHidden(getAt(r.doc[lang], nodePath), field)
        reportVisibility(r, `${nowHidden ? 'Hidden' : 'Showing'} “${label}”`, nodePath)
      },
      toggleEntry: (entryPath: CvPath, label: string) => {
        const r = run((d) => toggleEntryHidden(d, lang, entryPath, linked))
        const nowHidden = getAt(r.doc[lang], entryPath)?.isVisible === false
        reportVisibility(r, `${nowHidden ? 'Hidden' : 'Showing'} “${label}”`, entryPath)
      },
      toggleItem: (parentPath: CvPath, field: string, index: number, label: string) => {
        const r = run((d) => toggleItemHidden(d, lang, parentPath, field, index, linked))
        const nowHidden = hiddenIndices(getAt(r.doc[lang], parentPath), field).includes(index)
        reportVisibility(r, `${nowHidden ? 'Hidden' : 'Showing'} “${previewText(label, 40)}”`, parentPath)
      },
      list: (listPath: CvPath, op: ListOp, label?: string) => {
        if (op.type === 'remove' && linked) {
          // Never delete typed content in the other language silently.
          const twin = twinListItem(getDoc(), lang, listPath, op.index)
          if (twin !== undefined && hasContent(twin)) {
            setPendingRemove({ listPath, index: op.index, label, lang, twinText: previewText(twin) })
            return
          }
        }
        applyListOp(listPath, op, label, linked)
      },
      insertMany: (listPath: CvPath, index: number, values: string[], replaceAtIndex = false) => {
        const r = run((d) => insertMany(d, lang, listPath, index, values, replaceAtIndex, linked))
        if (linked && !r.reached && values.length > (replaceAtIndex ? 1 : 0)) {
          announce(`Pasted into ${LANG_LABEL[lang]} only`, unlinkedReason(sectionNameAt(listPath)))
        }
      },
      twinLength: (listPath: CvPath) => twinListLength(getDoc(), lang, listPath),
    }),
    [apply, run, getDoc, lang, linked, focus, reportVisibility, applyListOp, announce, unlinkedReason, sectionNameAt],
  )

  const confirmPendingRemove = (both: boolean) => {
    const p = pendingRemove
    setPendingRemove(null)
    if (!p || p.lang !== lang) return
    applyListOp(p.listPath, { type: 'remove', index: p.index }, p.label || 'Deleted item', both)
  }

  // ── Section-level actions ──────────────────────────────────────────────
  const toggleScope = (idx: number, key: 'isVisible' | 'showOnWebsite') => {
    const s = sections[idx]
    if (!s) return
    const on = key === 'isVisible' ? isSectionOnCv(s) : isSectionOnWebsite(s)
    const r = run((d) => setSectionFlag(d, lang, idx, key, !on, linked))
    const label = SECTION_BY_NAME[s.sessionName]?.label || s.sessionName
    reportVisibility(r, `“${label}” ${on ? 'off' : 'on'} the ${key === 'isVisible' ? 'CV' : 'website'}`, [idx])
  }

  const onAddSection = (name: string) => {
    const r = run((d) => addSection(d, lang, (l) => blankSection(name, l) as Section | null, linked))
    setSelected(name)
    setMobilePane('edit')
    announce(`Added “${SECTION_BY_NAME[name]?.label || name}”${scope(r.reached)}`)
  }

  const onRemoveSection = () => {
    if (!selectedSection) return
    const label = SECTION_BY_NAME[selectedSection.sessionName]?.label || selectedSection.sessionName
    const r = run((d) => removeSection(d, lang, selectedSection.sessionName, linked))
    removeDialog.onClose()
    notifyUndoable(`Deleted section “${label}”${scope(r.reached)}`, r.doc)
  }

  const onRevealAll = () => {
    if (selectedIdx < 0 || !selectedSection) return
    const name = selectedSection.sessionName
    const r = run((d) => {
      let next: Doc = { ...d, [lang]: d[lang].map((s, i) => (i === selectedIdx ? revealAll(s) : s)) }
      const reached = linked && d[other].some((s) => s.sessionName === name)
      if (reached) next = { ...next, [other]: next[other].map((s) => (s.sessionName === name ? revealAll(s) : s)) }
      return { doc: next, reached }
    })
    notifyUndoable(`Revealed everything hidden in this section${scope(r.reached)}`, r.doc)
  }

  const onSyncZh = () => {
    const after = apply((d) => ({ ...d, zh: syncLanguage(d.en, d.zh) }))
    notifyUndoable('中文 structure synced from EN — review, then save', after)
  }

  // ── Hidden items panel ─────────────────────────────────────────────────
  const hiddenRows = useMemo(() => collectHidden(doc), [doc])

  const jumpTo = (row: HiddenRow) => {
    hiddenPanel.onClose()
    setLang(row.lang)
    setSelected(row.sectionName)
    setMobilePane('edit')
    setFocus({ lang: row.lang, path: row.targetPath, nonce: Date.now() })
  }

  const showRow = (row: HiddenRow) => {
    const r = run((d) => {
      switch (row.kind) {
        case 'section-cv':
          return setSectionFlag(d, row.lang, row.sectionIdx, 'isVisible', true, linked)
        case 'section-web':
          return setSectionFlag(d, row.lang, row.sectionIdx, 'showOnWebsite', true, linked)
        case 'entry':
          return setEntryHidden(d, row.lang, row.nodePath, false, linked)
        case 'item':
          return setItemHidden(d, row.lang, row.nodePath, String(row.field), Number(row.index), false, linked)
        default:
          return setFieldHidden(d, row.lang, row.nodePath, String(row.field), false, linked)
      }
    })
    const where = r.reached ? ` (${LANG_LABEL.en} + 中)` : ` (${LANG_LABEL[row.lang]} only)`
    announce(`Showing “${previewText(row.label, 40)}”${where}`)
  }

  // Jump: once the target is rendered (entries expand first), scroll to it,
  // focus its eye toggle (or first control) and flash an outline.
  useEffect(() => {
    if (!focus) return
    const selector = `[data-cvpath="${cvPathAttr(focus.lang, focus.path)}"]`
    let raf = 0
    let tries = 0
    const timers: number[] = []
    const attempt = () => {
      const el = rootRef.current?.querySelector<HTMLElement>(selector)
      if (!el) {
        if (tries++ < 60) raf = window.requestAnimationFrame(attempt)
        return
      }
      const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth'
      const target = el.querySelector<HTMLElement>('[data-vis-toggle]') || el.querySelector<HTMLElement>('input, textarea, button')
      const reveal = () => {
        el.scrollIntoView({ block: 'center', behavior })
        if (target && !el.contains(document.activeElement)) target.focus({ preventScroll: true })
      }
      reveal()
      el.setAttribute('data-flash', '')
      // Expanding entries animate open and the panel hands focus back as it
      // closes; settle position and focus once both are done.
      timers.push(window.setTimeout(reveal, 380))
      timers.push(window.setTimeout(() => el.removeAttribute('data-flash'), 1800))
    }
    raf = window.requestAnimationFrame(attempt)
    return () => {
      window.cancelAnimationFrame(raf)
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [focus])

  // ── Alignment between the languages ────────────────────────────────────
  const alignment = useMemo(() => {
    const out: Record<string, SectionAlignment> = {}
    for (const s of doc[lang]) {
      out[s.sessionName] = {
        missing: !doc[other].some((x) => x.sessionName === s.sessionName),
        lists: sectionMisalignments(doc, lang, s.sessionName).length,
      }
    }
    return out
  }, [doc, lang, other])

  // ── Save ───────────────────────────────────────────────────────────────
  const doSave = useCallback(
    async (force = false) => {
      if (cv.saving || cv.loadState !== 'ready') return
      const r = await cv.save(force)
      if (r.kind === 'conflict') {
        conflict.onOpen()
        return
      }
      conflict.onClose()
      if (r.kind === 'ok') {
        setSessionExpired(false)
        toast({
          status: r.warning ? 'warning' : 'success',
          title: 'CV saved',
          description: r.warning || 'Live on /cv, /about and the home page.',
          duration: r.warning ? 6000 : 2200,
          position: 'bottom-right',
        })
      } else if (r.kind === 'unauthorized') {
        setSessionExpired(true)
      } else {
        toast({ status: 'error', title: 'Save failed', description: r.error, position: 'bottom-right', isClosable: true })
      }
    },
    [cv, conflict, toast],
  )

  // ── Shortcuts ──────────────────────────────────────────────────────────
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 's') {
        // Always keep the browser's "Save page" dialog away; save only real changes.
        e.preventDefault()
        if (dirtyRef.current) doSave(false)
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

  // ── Import / export ────────────────────────────────────────────────────
  const exportJSON = () => {
    // In-memory entry keys are symbols, so they never reach the file.
    const blob = new Blob([JSON.stringify({ en: doc.en, zh: doc.zh }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cv-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const onImportFile = async (file: File) => {
    try {
      const j = JSON.parse((await file.text()).replace(/^﻿/, ''))
      const valid = (a: any) => Array.isArray(a) && a.every((s) => s && typeof s === 'object' && typeof s.sessionName === 'string')
      let after: Doc
      if (Array.isArray(j)) {
        if (!valid(j)) throw new Error('Every section needs a "sessionName"')
        after = apply((d) => ({ ...d, [lang]: j }))
      } else if (j && (valid(j.en) || valid(j.zh))) {
        after = apply((d) => ({ en: valid(j.en) ? j.en : d.en, zh: valid(j.zh) ? j.zh : d.zh }))
      } else {
        throw new Error('Expected { en: [...], zh: [...] } or an array of sections')
      }
      notifyUndoable(`Imported ${file.name} — review, then save`, after)
    } catch (e: any) {
      toast({ status: 'error', title: 'Import failed', description: e?.message || 'Invalid JSON', position: 'bottom-right' })
    }
  }

  // ── States ─────────────────────────────────────────────────────────────
  if (cv.loadState === 'loading') {
    return (
      <Flex h="60vh" align="center" justify="center" direction="column" gap={3} role="status">
        <Spinner size="lg" color="var(--accent)" thickness="3px" />
        <Text fontFamily={monoFont} fontSize="11px" color={dim}>
          Loading CV…
        </Text>
      </Flex>
    )
  }
  if (cv.loadState === 'unauthorized' || cv.loadState === 'error') {
    const expired = cv.loadState === 'unauthorized'
    return (
      <Flex h="50vh" align="center" justify="center" direction="column" gap={3} textAlign="center" px={6} role="alert">
        <Text fontWeight={600}>{expired ? 'Session expired — sign in again' : 'Could not load the CV'}</Text>
        <Text fontSize="13px" color={dim} maxW="440px">
          {expired
            ? 'The editor only opens the full CV for a signed-in admin, so nothing was loaded. Sign in again to keep editing.'
            : cv.loadError}
        </Text>
        {expired ? (
          <Button size="sm" as="a" href={LOGIN_HREF} bg="var(--accent)" color="white" _hover={{ opacity: 0.92 }}>
            Sign in again
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
  const otherHas = selectedSection ? doc[other].some((s) => s.sessionName === selectedSection.sessionName) : false
  const misaligned = selectedSection && otherHas ? sectionMisalignments(doc, lang, selectedSection.sessionName) : []

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
      alignment={alignment}
      otherLabel={LANG_LABEL[other]}
    />
  )

  const editor = selectedSection ? (
    <Box maxW="760px" mx="auto" px={{ base: 4, md: 6 }} py={5}>
      <Flex align="flex-start" justify="space-between" gap={3} mb={4} wrap="wrap">
        <Box minW={0}>
          <Text fontFamily={monoFont} fontSize="10px" color={dim} letterSpacing="0.12em" textTransform="uppercase">
            {lang === 'en' ? 'English' : '中文'} · {def?.label || selectedSection.sessionName}
          </Text>
          <HStack spacing={2} mt={1} minW={0}>
            <Text as="h2" fontSize="20px" fontWeight={600} letterSpacing="-0.01em" noOfLines={1}>
              {selectedSection.headerName || def?.label || selectedSection.sessionName}
            </Text>
            {misaligned.length ? (
              <Tooltip
                hasArrow
                label={
                  <Box>
                    <Text fontWeight={600} mb={1}>
                      Lists that differ from {LANG_LABEL[other]}
                    </Text>
                    {misaligned.map((m) => (
                      <Text key={m.path.join('.')}>
                        {describeSectionPath(def, m.path)}: {LANG_LABEL[lang]} {m.mine} · {LANG_LABEL[other]} {m.theirs}
                      </Text>
                    ))}
                    <Text mt={1} opacity={0.8}>
                      Linked edits there apply to {LANG_LABEL[lang]} only.
                    </Text>
                  </Box>
                }
              >
                <Badge variant="outline" colorScheme="orange" fontFamily={monoFont} fontSize="9px" flexShrink={0} tabIndex={0}>
                  EN ≠ 中 · {misaligned.length}
                </Badge>
              </Tooltip>
            ) : null}
          </HStack>
          {def ? (
            <Text fontSize="12px" color={dim} mt={0.5}>
              {def.description}
            </Text>
          ) : null}
        </Box>
        <HStack spacing={3} flexWrap="wrap">
          <HStack as="label" spacing={1.5} cursor="pointer" fontSize="12px" data-cvpath={cvPathAttr(lang, [selectedIdx, 'cv'])} borderRadius="md" px={1}>
            <FiFileText aria-hidden />
            <Text>CV</Text>
            <Switch
              size="sm"
              colorScheme="purple"
              isChecked={isSectionOnCv(selectedSection)}
              onChange={() => toggleScope(selectedIdx, 'isVisible')}
              aria-label="Show this section on the CV / PDF"
            />
          </HStack>
          <HStack as="label" spacing={1.5} cursor="pointer" fontSize="12px" data-cvpath={cvPathAttr(lang, [selectedIdx, 'web'])} borderRadius="md" px={1}>
            <FiGlobe aria-hidden />
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
        <Box mb={4} px={3} py={2} borderRadius="md" border="1px solid" borderColor="orange.300" bg="rgba(251,146,60,0.08)" fontSize="12px">
          This section doesn’t exist in {LANG_LABEL[other]} yet, so linked changes stay in {LANG_LABEL[lang]}.
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
  const statusText = cv.saving ? 'saving…' : dirty ? 'unsaved changes' : cv.savedAt ? `saved ${timeAgo(cv.savedAt)}` : 'up to date'

  return (
    <StudioContext.Provider value={api}>
      <Flex
        ref={rootRef}
        direction="column"
        h={{ base: 'auto', lg: 'var(--admin-workspace-h, calc(100vh - 210px))' }}
        minH={{ lg: '640px' }}
        border="1px solid"
        borderColor={border}
        borderRadius="xl"
        // Clipping would break the sticky toolbar on phones / tablets, so it
        // only applies to the fixed-height desktop layout.
        overflow={{ base: 'visible', lg: 'hidden' }}
        sx={{
          '[data-flash]': {
            outline: '2px solid var(--accent)',
            outlineOffset: '3px',
            borderRadius: '6px',
          },
        }}
      >
        {/* ── Toolbar ─────────────────────────────────────────────── */}
        <Flex
          align="center"
          gap={2}
          px={3}
          py={2}
          borderBottom="1px solid"
          borderColor={border}
          borderTopRadius="xl"
          wrap="wrap"
          bg={surfaceAlt}
          // Below the 57px site header (56px + 1px hairline), which is sticky too.
          position={{ base: 'sticky', lg: 'static' }}
          top={{ base: '57px', lg: 'auto' }}
          zIndex={5}
        >
          <Tooltip label={dirty ? `Save (${mod}S)` : 'Nothing to save'} hasArrow>
            <Button
              size="sm"
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
                {LANG_LABEL[l]}
              </Button>
            ))}
          </ButtonGroup>

          <Tooltip
            label={
              linked
                ? 'Linked: visibility + add / delete / reorder also apply to the other language where the two line up'
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
              iconSpacing={{ base: 0, sm: 2 }}
              aria-pressed={linked}
              aria-label={linked ? 'Linked languages' : 'Unlinked languages'}
              onClick={() => {
                setLinked((v) => {
                  writePref(LINK_KEY, !v)
                  return !v
                })
              }}
              fontSize="12px"
            >
              <Box as="span" display={{ base: 'none', sm: 'inline' }}>
                {linked ? 'Linked' : 'Unlinked'}
              </Box>
            </Button>
          </Tooltip>

          <Tooltip label="Everything hidden from the CV & website (EN + 中)" hasArrow>
            <Button
              size="sm"
              variant="outline"
              borderColor={hiddenRows.length ? 'orange.300' : border}
              color={hiddenRows.length ? hiddenFg : dim}
              leftIcon={<ViewOffIcon />}
              onClick={hiddenPanel.onOpen}
              fontSize="12px"
              aria-haspopup="dialog"
            >
              <Box as="span" display={{ base: 'none', md: 'inline' }} mr={1}>
                Hidden
              </Box>
              <Box as="span" fontFamily={monoFont}>
                {hiddenRows.length}
              </Box>
              <VisuallyHidden> hidden items</VisuallyHidden>
            </Button>
          </Tooltip>

          <Menu isLazy>
            <MenuButton
              as={Button}
              size="sm"
              variant="ghost"
              rightIcon={<ChevronDownIcon />}
              fontSize="12px"
              aria-label="More actions"
              iconSpacing={{ base: 0, sm: 2 }}
            >
              <Box as="span" display={{ base: 'none', sm: 'inline' }}>
                More
              </Box>
              <Box as="span" display={{ base: 'inline-flex', sm: 'none' }} aria-hidden>
                <FaEllipsisH />
              </Box>
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
            <HStack spacing={1.5} fontFamily={monoFont} fontSize="11px" color={dim} role="status" aria-live="polite">
              <Box w="7px" h="7px" borderRadius="full" bg={dirty ? 'orange.400' : 'green.400'} flexShrink={0} aria-hidden />
              <Text display={{ base: 'none', sm: 'block' }} aria-hidden>
                {statusText}
              </Text>
              <VisuallyHidden>{statusText}</VisuallyHidden>
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
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImportFile(f)
              e.target.value = ''
            }}
          />
        </Flex>

        {sessionExpired ? (
          <Flex align="center" gap={3} px={4} py={2} bg="rgba(239,68,68,0.10)" borderBottom="1px solid" borderColor={border} wrap="wrap" fontSize="13px" role="alert">
            <Text flex={1} minW="200px">
              Session expired — sign in again. Nothing was saved; your edits are kept on this device as a draft.
            </Text>
            <Button size="xs" as="a" href={LOGIN_HREF} bg="var(--accent)" color="white" _hover={{ opacity: 0.9 }}>
              Sign in again
            </Button>
          </Flex>
        ) : null}

        {cv.basedOnOlderVersion ? (
          <Flex align="center" gap={3} px={4} py={2} bg="rgba(251,146,60,0.10)" borderBottom="1px solid" borderColor={border} wrap="wrap" fontSize="13px">
            <Text flex={1} minW="200px">
              You are editing on top of an older version — the CV was saved elsewhere since. Saving will ask before replacing it.
            </Text>
            <Button
              size="xs"
              variant="outline"
              borderColor={border}
              onClick={() => {
                if (!dirty || window.confirm('Discard your edits here and load the latest saved CV?')) cv.load()
              }}
            >
              Load latest
            </Button>
          </Flex>
        ) : null}

        {cv.draft ? (
          <Flex
            align="center"
            gap={3}
            px={4}
            py={2}
            bg={cv.draft.stale ? 'rgba(251,146,60,0.10)' : 'var(--accent-soft)'}
            borderBottom="1px solid"
            borderColor={border}
            wrap="wrap"
            fontSize="13px"
            role="region"
            aria-label="Unsaved draft"
          >
            <Box flex={1} minW="220px">
              <Text>
                Found unsaved edits from {timeAgo(cv.draft.at)} on this device.
                {cv.draft.stale ? (
                  <Text as="span" fontWeight={600}>
                    {' '}
                    The draft is based on an older version of the CV.
                  </Text>
                ) : null}
              </Text>
              {cv.draft.stale ? (
                <Text fontSize="12px" color={dim} mt={0.5}>
                  Opening it replaces what you see now; saving will then ask before overwriting the newer saved version.
                </Text>
              ) : null}
            </Box>
            <Button size="xs" onClick={cv.restoreDraft} bg="var(--accent)" color="white" _hover={{ opacity: 0.9 }}>
              {cv.draft.stale ? 'Open older draft' : 'Restore draft'}
            </Button>
            <Button size="xs" variant="ghost" onClick={cv.discardDraft}>
              Discard
            </Button>
          </Flex>
        ) : null}

        {/* ── Mobile pane switcher ─────────────────────────────────── */}
        <ButtonGroup display={{ base: 'flex', lg: 'none' }} size="sm" isAttached variant="outline" m={2} role="group" aria-label="Pane">
          {(['sections', 'edit', 'preview'] as MobilePane[]).map((p) => (
            <Button
              key={p}
              flex={1}
              aria-pressed={mobilePane === p}
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
            as="nav"
            aria-label="CV sections"
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
            bg="page.bg"
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

      <HiddenPanel
        isOpen={hiddenPanel.isOpen}
        onClose={hiddenPanel.onClose}
        rows={hiddenRows}
        linked={linked}
        onJump={jumpTo}
        onShow={showRow}
      />

      {/* Conflict: the CV changed on the server since this version was loaded */}
      <AlertDialog isOpen={conflict.isOpen} onClose={conflict.onClose} leastDestructiveRef={cancelRef} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent mx={4}>
            <AlertDialogHeader fontSize="md">The CV changed somewhere else</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              It was saved from another tab, device or editor after this version was loaded, so nothing was saved. Reload the
              latest copy (your unsaved edits here will be lost — they stay available as a local draft), or overwrite it with
              your version.
            </AlertDialogBody>
            <AlertDialogFooter gap={2} flexWrap="wrap">
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

      {/* Linked delete would remove typed content in the other language */}
      <AlertDialog isOpen={!!pendingRemove} onClose={() => setPendingRemove(null)} leastDestructiveRef={removeCancelRef} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent mx={4}>
            <AlertDialogHeader fontSize="md">Also delete it in {LANG_LABEL[other]}?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              The matching {LANG_LABEL[other]} item isn’t empty:
              <Text
                mt={2}
                px={3}
                py={2}
                borderLeft="2px solid"
                borderColor="var(--accent)"
                bg={surfaceAlt}
                fontSize="13px"
                wordBreak="break-word"
              >
                {pendingRemove?.twinText}
              </Text>
              <Text mt={2} color={dim}>
                Deleting only in {LANG_LABEL[lang]} leaves the two languages with different lengths here, so later linked edits in
                this list stay per-language.
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter gap={2} flexWrap="wrap">
              <Button ref={removeCancelRef} size="sm" variant="ghost" onClick={() => setPendingRemove(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="outline" onClick={() => confirmPendingRemove(false)}>
                Delete in {LANG_LABEL[lang]} only
              </Button>
              <Button size="sm" colorScheme="red" onClick={() => confirmPendingRemove(true)}>
                Delete in both
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      {/* Delete section */}
      <AlertDialog isOpen={removeDialog.isOpen} onClose={removeDialog.onClose} leastDestructiveRef={cancelRef} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent mx={4}>
            <AlertDialogHeader fontSize="md">Delete this section?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              “{selectedSection?.headerName || def?.label}” and everything in it will be removed
              {linked && otherHas ? ' from both EN and 中文' : ` from ${LANG_LABEL[lang]}`}. You can undo until you leave the
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

