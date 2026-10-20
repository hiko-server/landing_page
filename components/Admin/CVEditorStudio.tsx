import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
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
import { FiCheckCircle, FiFileText, FiGlobe, FiColumns, FiLayout } from 'react-icons/fi'
import { SECTION_BY_NAME, blankSection, type ListDef, type SectionDef } from '../../lib/cvSections'
import {
  audienceOf,
  countHidden,
  getAt,
  hiddenIndices,
  isFieldHidden,
  isSectionOnCv,
  isSectionOnWebsite,
  publicSections,
  revealAll,
  type CvLang,
  type CvPath,
  type CvSurface,
} from '../../lib/cvVisibility'
import { withSectionUidsBeside } from '../../lib/cvEntryUid'
import { syncLanguage } from '../../lib/cvSync'
import { ownerNamesFromSections } from '../../lib/publications/names'
import { errorFocusPath, validateCvDoc, type CvValidationError } from '../../lib/cvValidate'
import { useAdminDirty, useDirtyRegistration } from './AdminDirtyContext'
import { SaveStatus } from './shell/ui'
import { useCvDocument } from './cvStudio/useCvDocument'
import {
  addSection,
  duplicatesHidden,
  hasContent,
  appendEntries,
  insertMany,
  listOp,
  moveSection,
  otherLang,
  previewText,
  removeSection,
  sectionMisalignments,
  setEntryHidden,
  studioOwnsUndo,
  setFieldHidden,
  setItemHidden,
  setFieldAudience,
  setItemAudience,
  setNodeAudience,
  setSectionFlag,
  setSharedValue,
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
import InverseToast from './cvStudio/InverseToast'
import AudienceMenu from './cvStudio/AudienceMenu'
import { audienceSummary } from './cvStudio/audience'
import { monoFont, useStudioTokens } from './cvStudio/fields'
import {
  partitionFindings,
  runReadinessChecks,
  withDismissal,
  type ReadinessContext,
  type ReadinessFinding,
} from '../../lib/cvReadiness'
import { referenceMonth } from '../../lib/clock'
import { publishedCaseStudies } from '../../lib/caseStudyLinks'
import { normalizeOrcidId } from '../../lib/orcid/id'
import { dropStaleOrcidAuth } from '../../lib/orcid/connection'
import { orcidAuthMarkerOf } from '../../lib/orcid/marker'
import { ORCID_RETURN_KEYS, orcidConnectNotice, type OrcidNotice } from '../../lib/orcid/connectUi'

// The readiness drawer only loads when it is first opened.
const ReadinessPanel = dynamic(() => import('./cvStudio/ReadinessPanel'), { ssr: false })

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
 * Text edits are always per-language, except registry fields marked
 * `shared` (language-neutral values: a publication's status, DOI, date,
 * links), which reach the aligned twin silently. Every linked change says
 * where it landed: "(EN + 中)" or "(EN only)".
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
  const { confirmDiscard } = useAdminDirty()
  // Values the registry check rejected on the last save attempt (first few shown with jump links).
  const [invalid, setInvalid] = useState<CvValidationError[]>([])

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
  const readinessPanel = useDisclosure()
  // Readiness checks (E9): server context (home e-mail, case studies) + measured A4 pages.
  const [readyCtx, setReadyCtx] = useState<ReadinessContext | null>(null)
  const [readyErr, setReadyErr] = useState('')
  const [pages, setPages] = useState<Partial<Record<CvLang, number>>>({})
  const [readinessLoaded, setReadinessLoaded] = useState(false)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const removeCancelRef = useRef<HTMLButtonElement | null>(null)
  const { border, dim, faint, surfaceAlt, hiddenFg } = useStudioTokens()
  const mod = isMac() ? '⌘' : 'Ctrl'
  const other = otherLang(lang)

  useEffect(() => {
    setLinked(readPref(LINK_KEY, true))
    setShowPreview(readPref(PREVIEW_KEY, true))
  }, [])

  // Readiness context; ?panel=readiness (from the status hub) opens the panel.
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/cv-readiness', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as ReadinessContext
        if (!cancelled) setReadyCtx(body)
      })
      .catch(() => {
        if (!cancelled) setReadyErr('The case-study and home-page checks could not load; the others ran on the CV alone.')
      })
    try {
      if (new URLSearchParams(window.location.search).get('panel') === 'readiness') {
        setReadinessLoaded(true)
        readinessPanel.onOpen()
      }
    } catch {
      /* no URL access — the panel opens from the toolbar */
    }
    return () => {
      cancelled = true
    }
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // The ORCID iD the Publications import reads (this language first; the field is shared, so usually both agree).
  const [orcid, orcidAuthenticated] = useMemo((): [string, boolean] => {
    for (const l of [lang, other]) {
      const pi = doc[l].find((s) => s.sessionName === 'personalInformation')
      const id = normalizeOrcidId(pi?.orcid)
      if (id) return [id, orcidAuthMarkerOf(pi)?.id === id]
    }
    return ['', false]
  }, [doc, lang, other])

  // Published case studies, as /cv links them (the readiness context's index; null until it loads).
  const caseStudies = readyCtx?.caseStudies ?? null
  const publishedWorks = useMemo(() => publishedCaseStudies(caseStudies), [caseStudies])

  // ── Edit API (context for every form control) ──────────────────────────
  const api: StudioApi = useMemo(
    () => ({
      lang,
      linked,
      focus,
      setValue: (path: CvPath, value: any, opts?: { shared?: boolean }) => {
        // Changing the ORCID iD also drops an "authenticated" marker that no
        // longer confirms it, in the same undo step (lib/orcid/connection).
        if (opts?.shared && linked) apply((d) => dropStaleOrcidAuth(setSharedValue(d, lang, path, value, true).doc), `${lang}:${path.join('.')}`)
        else apply((d) => dropStaleOrcidAuth(setValue(d, lang, path, value)), `${lang}:${path.join('.')}`)
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
      setFieldAudience: (nodePath: CvPath, field: string, list: CvSurface[] | null, label: string) => {
        const r = run((d) => setFieldAudience(d, lang, nodePath, field, list, linked))
        reportVisibility(r, `“${previewText(label, 40)}” ${list ? `only on ${audienceSummary(list)}` : 'shows everywhere'}`, nodePath)
      },
      setNodeAudience: (path: CvPath, list: CvSurface[] | null, label: string) => {
        const r = run((d) => setNodeAudience(d, lang, path, list, linked))
        reportVisibility(r, `“${previewText(label, 40)}” ${list ? `only on ${audienceSummary(list)}` : 'shows everywhere'}`, path)
      },
      setItemAudience: (parentPath: CvPath, field: string, index: number, list: CvSurface[] | null, label: string) => {
        const r = run((d) => setItemAudience(d, lang, parentPath, field, index, list, linked))
        reportVisibility(r, `“${previewText(label, 40)}” ${list ? `only on ${audienceSummary(list)}` : 'shows everywhere'}`, parentPath)
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
        // A copy of something hidden stays hidden — say so, or the owner may
        // expect it to show once saved.
        const hiddenCopy = op.type === 'duplicate' && duplicatesHidden(getDoc(), lang, listPath, op.index)
        applyListOp(listPath, op, hiddenCopy ? `${label || 'Duplicated'} — the copy is hidden` : label, linked)
      },
      insertMany: (listPath: CvPath, index: number, values: string[], replaceAtIndex = false) => {
        const r = run((d) => insertMany(d, lang, listPath, index, values, replaceAtIndex, linked))
        if (linked && !r.reached && values.length > (replaceAtIndex ? 1 : 0)) {
          announce(`Pasted into ${LANG_LABEL[lang]} only`, unlinkedReason(sectionNameAt(listPath)))
        }
      },
      appendEntries: (listPath: CvPath, entries: readonly Record<string, any>[], label: string) => {
        if (!entries.length) return
        const r = run((d) => appendEntries(d, lang, listPath, entries, linked))
        notifyUndoable(`${label}${scope(r.reached)}`, r.doc)
        if (linked && !r.reached) announce(`Added to ${LANG_LABEL[lang]} only`, unlinkedReason(sectionNameAt(listPath)))
      },
      goToField: (sectionName: string, field: string) => {
        const idx = getDoc()[lang].findIndex((s) => s.sessionName === sectionName)
        if (idx < 0) {
          announce(`Add the “${SECTION_BY_NAME[sectionName]?.label || sectionName}” section first`)
          return
        }
        setSelected(sectionName)
        setMobilePane('edit')
        setFocus({ lang, path: [idx, field], nonce: Date.now(), control: true })
      },
      orcid,
      orcidAuthenticated,
      caseStudies,
      dirty,
      serverChange: { etag: cv.getBaseEtag, adopt: cv.adoptSaved, current: getDoc },
      twinLength: (listPath: CvPath) => twinListLength(getDoc(), lang, listPath),
      twinValue: (path: CvPath) => {
        const d = getDoc()
        const name = d[lang][Number(path[0])]?.sessionName
        const at = d[other].findIndex((s) => s.sessionName === name)
        return at < 0 ? undefined : getAt(d[other], [at, ...path.slice(1)])
      },
    }),
    [apply, run, getDoc, lang, other, linked, focus, orcid, orcidAuthenticated, caseStudies, dirty, cv.getBaseEtag, cv.adoptSaved, reportVisibility, applyListOp, announce, unlinkedReason, sectionNameAt, notifyUndoable, scope],
  )

  // Back from "Connect your ORCID iD" (?orcid=connected | ?orcid=error&reason=…,
  // lib/orcid/connectUi): the keys leave the address at once (a reload must
  // not repeat the toast); once the CV is loaded, the toast and the iD field.
  const router = useRouter()
  const [orcidNotice, setOrcidNotice] = useState<OrcidNotice | null>(null)
  useEffect(() => {
    if (!router.isReady) return
    const notice = orcidConnectNotice(router.query)
    if (!notice) return
    setOrcidNotice(notice)
    const rest = { ...router.query }
    for (const key of ORCID_RETURN_KEYS) delete rest[key]
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true, scroll: false }).catch(() => undefined)
    // Once, when the address is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady])
  useEffect(() => {
    if (!orcidNotice || cv.loadState !== 'ready') return
    setOrcidNotice(null)
    toast({
      id: 'orcid-connect',
      status: orcidNotice.status,
      title: orcidNotice.title,
      description: orcidNotice.description,
      position: 'bottom-right',
      isClosable: true,
      duration: orcidNotice.status === 'success' ? 7000 : 12000,
    })
    api.goToField('personalInformation', 'orcid')
  }, [orcidNotice, cv.loadState, toast, api])

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

  // ── Readiness panel ────────────────────────────────────────────────────
  const deferredDoc = React.useDeferredValue(doc)
  const findings = useMemo(
    () =>
      runReadinessChecks(deferredDoc, {
        now: readyCtx?.now || referenceMonth(),
        homeEmail: readyCtx?.homeEmail,
        caseStudies: readyCtx?.caseStudies,
        pages,
      }),
    [deferredDoc, readyCtx, pages],
  )
  const readiness = useMemo(() => partitionFindings(deferredDoc, findings), [deferredDoc, findings])
  const onPages = useCallback(
    (l: CvLang, n: number) => setPages((p) => (p[l] === n ? p : { ...p, [l]: n })),
    [],
  )

  const jumpToFinding = (f: ReadinessFinding) => {
    if (!f.path) return
    readinessPanel.onClose()
    setLang(f.lang)
    setSelected(f.sectionName)
    setMobilePane('edit')
    setFocus({ lang: f.lang, path: f.path, nonce: Date.now() })
  }

  const previewFinding = (f: ReadinessFinding) => {
    readinessPanel.onClose()
    setLang(f.lang)
    setMobilePane('preview')
    if (!showPreview) {
      writePref(PREVIEW_KEY, true)
      setShowPreview(true)
    }
  }

  const setDismissed = (f: ReadinessFinding, dismissed: boolean) => {
    const live = new Set(findings.map((x) => x.id))
    apply((d) => withDismissal(d, f, dismissed, live))
    announce(dismissed ? 'Dismissed — save the CV to keep it' : 'Restored to the readiness list')
  }

  const jumpTo = (row: HiddenRow) => {
    hiddenPanel.onClose()
    setLang(row.lang)
    setSelected(row.sectionName)
    setMobilePane('edit')
    setFocus({ lang: row.lang, path: row.targetPath, nonce: Date.now(), ...(row.kind === 'limited' ? { toggle: 'audience' as const } : {}) })
  }

  const showRow = (row: HiddenRow) => {
    const r = run((d) => {
      switch (row.kind) {
        case 'limited':
          return row.index !== undefined
            ? setItemAudience(d, row.lang, row.nodePath, String(row.field), row.index, null, linked)
            : row.field !== undefined
              ? setFieldAudience(d, row.lang, row.nodePath, String(row.field), null, linked)
              : setNodeAudience(d, row.lang, row.nodePath, null, linked)
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
    announce(`${row.kind === 'limited' ? 'Everywhere now:' : 'Showing'} “${previewText(row.label, 40)}”${where}`)
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
      const control = focus.control ? el.querySelector<HTMLElement>('input, textarea, select') : null
      const audience = focus.toggle === 'audience' ? el.querySelector<HTMLElement>('[data-audience-toggle]') : null
      const target = control || audience || el.querySelector<HTMLElement>('[data-vis-toggle]') || el.querySelector<HTMLElement>('input, textarea, button')
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

  // The owner's names from both languages' public Personal Info: author lists
  // in the A4 preview emphasise them exactly like /cv and /cv/zh do.
  const ownerNames = useMemo(() => ownerNamesFromSections(publicSections(doc.en, 'cv'), publicSections(doc.zh, 'cv')), [doc.en, doc.zh])

  // ── Save ───────────────────────────────────────────────────────────────
  /** Save; resolves true only when the server stored the document. */
  const doSave = useCallback(
    async (force = false): Promise<boolean> => {
      if (cv.saving || cv.loadState !== 'ready') return false
      // Same registry check as the server, so a bad value is pointed at before a round trip.
      const checked = validateCvDoc(getDoc())
      if (!checked.ok) {
        setInvalid(checked.errors)
        toast({
          status: 'error',
          title: 'Not saved — fix the highlighted values',
          description: checked.errors[0]?.message,
          position: 'bottom-right',
          isClosable: true,
        })
        return false
      }
      const r = await cv.save(force)
      if (r.kind === 'conflict') {
        conflict.onOpen()
        return false
      }
      conflict.onClose()
      if (r.kind === 'ok') {
        setSessionExpired(false)
        setInvalid([])
        toast({
          status: r.warning ? 'warning' : 'success',
          title: 'CV saved',
          description: r.warning || 'Live on /cv, /about and the home page.',
          duration: r.warning ? 6000 : 2200,
          position: 'bottom-right',
        })
        return true
      }
      if (r.kind === 'invalid') {
        setInvalid(r.errors)
        toast({ status: 'error', title: 'Not saved', description: r.error, position: 'bottom-right', isClosable: true })
      } else if (r.kind === 'unauthorized') {
        setSessionExpired(true)
      } else {
        toast({ status: 'error', title: 'Save failed', description: r.error, position: 'bottom-right', isClosable: true })
      }
      return false
    },
    [cv, conflict, toast, getDoc],
  )
  useDirtyRegistration('cv-studio', dirty, () => doSave(false))

  const jumpToError = (e: CvValidationError) => {
    const target = errorFocusPath(e.path)
    const name = getDoc()[target.lang][target.sectionIdx]?.sessionName
    if (!name) return
    setLang(target.lang)
    setSelected(name)
    setMobilePane('edit')
    setFocus({ lang: target.lang, path: target.path, nonce: Date.now() })
  }

  const describeError = (e: CvValidationError) => {
    const target = errorFocusPath(e.path)
    const section = doc[target.lang][target.sectionIdx]
    const sdef = section ? SECTION_BY_NAME[section.sessionName] : undefined
    const where = describeSectionPath(sdef, target.path.slice(1))
    const sectionLabel = sdef?.label || section?.sessionName || `Section ${target.sectionIdx + 1}`
    return `${LANG_LABEL[target.lang]} · ${sectionLabel}${where ? ` › ${where}` : ''}`
  }

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
        if (dirtyRef.current) void doSave(false)
      } else if (k === 'z' || k === 'y') {
        // Only the Studio's own document: the command palette, dialogs, the
        // Hidden-items drawer and fields outside the Studio keep native undo.
        if (!studioOwnsUndo(e.target, rootRef.current, document)) return
        e.preventDefault()
        if (k === 'z' && !e.shiftKey) undo()
        else redo()
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
        // Every entry gets its stable uid (lib/cvEntryUid), paired with the other language only
        // where the lists line up, duplicates repaired.
        after = apply((d) => ({ ...d, [lang]: withSectionUidsBeside(j, lang, lang === 'en' ? d.zh : d.en) }))
      } else if (j && (valid(j.en) || valid(j.zh))) {
        after = apply((d) => {
          const en: Doc['en'] = valid(j.en) ? withSectionUidsBeside(j.en, 'en', valid(j.zh) ? j.zh : d.zh) : d.en
          return { en, zh: valid(j.zh) ? withSectionUidsBeside<Doc['zh'][number]>(j.zh, 'zh', en) : d.zh }
        })
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
          <Box data-cvpath={cvPathAttr(lang, [selectedIdx, 'audience'])} borderRadius="md">
            <AudienceMenu
              value={audienceOf(selectedSection.onlyIn)}
              onChange={(l) => api.setNodeAudience([selectedIdx], l, def?.label || selectedSection.sessionName)}
              label={`the ${def?.label || selectedSection.sessionName} section`}
            />
          </Box>
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

  const preview = <Preview sections={sections} lang={lang} onPages={onPages} ownerNames={ownerNames} works={publishedWorks} />

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
              onClick={() => void doSave(false)}
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

          <Tooltip label="Everything hidden from the CV & website, or limited to some places (EN + 中)" hasArrow>
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

          <Tooltip label="Recruiter-readiness checks: dates, contradictions, weak highlights, links (EN + 中)" hasArrow>
            <Button
              size="sm"
              variant="outline"
              borderColor={readiness.open.some((f) => f.severity === 'high') ? 'red.300' : readiness.open.length ? 'orange.300' : border}
              color={readiness.open.length ? undefined : dim}
              leftIcon={<FiCheckCircle aria-hidden />}
              onClick={() => {
                setReadinessLoaded(true)
                readinessPanel.onOpen()
              }}
              fontSize="12px"
              aria-haspopup="dialog"
              data-readiness-count={readiness.open.length}
            >
              <Box as="span" display={{ base: 'none', md: 'inline' }} mr={1}>
                Readiness
              </Box>
              <Box as="span" fontFamily={monoFont}>
                {readiness.open.length}
              </Box>
              <VisuallyHidden> readiness findings to review</VisuallyHidden>
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
            <SaveStatus
              state={cv.saving ? 'saving' : dirty ? 'dirty' : 'clean'}
              savedAt={cv.savedAt ?? undefined}
              label={!cv.saving && !dirty && !cv.savedAt ? 'Up to date' : undefined}
            />
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

        {invalid.length ? (
          <Box px={4} py={2.5} bg="rgba(239,68,68,0.08)" borderBottom="1px solid" borderColor={border} fontSize="13px" role="alert">
            <Flex align="center" justify="space-between" gap={3} wrap="wrap">
              <Text fontWeight={600}>
                Not saved: {invalid.length === 1 ? 'one value needs fixing' : `${invalid.length}${invalid.length >= 50 ? '+' : ''} values need fixing`}
              </Text>
              <Button size="xs" variant="ghost" onClick={() => setInvalid([])}>
                Dismiss
              </Button>
            </Flex>
            <Box as="ul" mt={1} pl={0} listStyleType="none">
              {invalid.slice(0, 5).map((e) => (
                <Box as="li" key={`${e.path.join('.')}-${e.message}`} mt={1}>
                  <Button variant="link" size="sm" fontSize="13px" color="accent.text" whiteSpace="normal" textAlign="left" onClick={() => jumpToError(e)}>
                    {describeError(e)}
                  </Button>
                  <Text as="span" color={dim}>
                    {' — '}
                    {e.message}
                  </Text>
                </Box>
              ))}
            </Box>
            {invalid.length > 5 ? (
              <Text mt={1} color={dim} fontSize="12px">
                …and {invalid.length - 5} more. Fix these, then save again.
              </Text>
            ) : null}
          </Box>
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
              onClick={async () => {
                const ok = await confirmDiscard('Discard your edits here and load the latest saved CV?', {
                  title: 'Load the latest CV?',
                  allowSave: false,
                  discardLabel: 'Discard and load',
                })
                if (ok) cv.load()
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
            hides a field, entry or bullet everywhere ·
            <Badge variant="outline" fontSize="9px" mx={1}>
              shows on
            </Badge>
            limits it to pages, downloads or private links
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

      {readinessLoaded ? (
        <ReadinessPanel
          isOpen={readinessPanel.isOpen}
          onClose={readinessPanel.onClose}
          open={readiness.open}
          dismissed={readiness.dismissed}
          pages={pages}
          contextError={readyErr}
          onJump={jumpToFinding}
          onPreview={previewFinding}
          onDismiss={(f) => setDismissed(f, true)}
          onRestore={(f) => setDismissed(f, false)}
        />
      ) : null}

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
              <Button size="sm" colorScheme="red" onClick={() => void doSave(true)} isLoading={cv.saving}>
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

