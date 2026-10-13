import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { useToast } from '@chakra-ui/react'
import { useDirtyRegistration } from '../AdminDirtyContext'
import type { RichEditorHandle } from '../RichEditor'
import type { MdxProblem } from '../editor/EditorNotices'
import { loginHref, parseRevalidated, readJsonObject, saveToastCopy } from './http'
import { slugFromTitle } from './publishChecks'
import { useLeaveSaver } from './useLeaveSaver'
import { useLocalDraft } from './useLocalDraft'
import { useSaveShortcut, type SaveState } from './ui'

/**
 * State machine shared by the blog-post and case-study editors
 * (pages/admin/blog/edit, pages/admin/work/edit):
 *
 *   - load by ?slug= with the item's version (ETag); saves send If-Match and
 *     a 409 VERSION_CONFLICT opens "Changed elsewhere" (reload / overwrite)
 *   - dirty tracking against the last loaded / saved state, unsaved-changes
 *     registration (with a saver for "Save and leave"), ⌘S
 *   - local draft recovery (useLocalDraft, key mdx:<collection>:<slug|new>)
 *   - a 422 MDX_INVALID keeps the edits, shows the error and jumps the raw
 *     editor to the line
 *   - publish state: save(), save({ draft: false }) to publish,
 *     save({ draft: true }) to unpublish
 *   - new items derive their slug from the title until the slug is edited
 */

export type LoadState = 'loading' | 'ready' | 'error'

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/

export const parseList = (t: string) =>
  t
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean)

type Options<F extends Record<string, unknown> & { draft: boolean }> = {
  collection: 'blog' | 'work'
  /** Admin API endpoint, e.g. /api/admin/posts. */
  endpoint: string
  /** "post" / "case study" — used in messages. */
  noun: string
  empty: F
  /** Frontmatter key edited through the comma-separated list input. */
  listField: keyof F & string
  fromServer: (frontmatter: Record<string, any>) => F
  toServer: (fm: F, list: string[]) => Record<string, unknown>
}

type DraftValue<F> = { slug: string; fm: F; listText: string; body: string }

export type SaveOptions = {
  /** Publish (false) / unpublish (true); omitted keeps the current state. */
  draft?: boolean
  /** Overwrite a newer server version (no If-Match). */
  force?: boolean
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function useMdxItemEditor<F extends Record<string, unknown> & { draft: boolean }>(opts: Options<F>) {
  const { collection, endpoint, noun, empty, listField, fromServer, toServer } = opts
  const router = useRouter()
  const toast = useToast()
  const slugParam = typeof router.query.slug === 'string' ? router.query.slug : ''
  const isNew = !slugParam

  const [slug, setSlugState] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [fm, setFm] = useState<F>(empty)
  // Raw text of the comma-separated list, parsed on blur / save, so typing
  // ", " or a multi-word item isn't eaten mid-keystroke.
  const [listText, setListText] = useState('')
  const [body, setBody] = useState('')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [revalidated, setRevalidated] = useState<string[]>([])
  const [baseline, setBaseline] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [etag, setEtag] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | undefined>(undefined)
  const [conflict, setConflict] = useState(false)
  const [mdxError, setMdxError] = useState<MdxProblem | null>(null)
  const richRef = useRef<RichEditorHandle>(null)
  // Slug we just created and moved the URL to — its data is already here.
  const justCreated = useRef<string | null>(null)
  // Options of the save that hit a version conflict ("Overwrite anyway" repeats it).
  const conflictOptions = useRef<SaveOptions>({})

  useEffect(() => {
    if (!router.isReady) return
    if (justCreated.current && justCreated.current === slugParam) {
      justCreated.current = null
      return
    }
    setRevalidated([])
    setSessionExpired(false)
    setConflict(false)
    setMdxError(null)
    if (!slugParam) {
      setSlugState('')
      setSlugTouched(false)
      setFm(empty)
      setListText('')
      setBody('')
      setBaseline(null)
      setEtag(null)
      setSavedAt(undefined)
      setLoadState('ready')
      return
    }
    let alive = true
    setLoadState('loading')
    setBaseline(null)
    void (async () => {
      try {
        const res = await fetch(`${endpoint}?slug=${encodeURIComponent(slugParam)}`, {
          cache: 'no-store',
        })
        if (res.status === 401) {
          router.replace(loginHref(router.asPath))
          return
        }
        const data = await readJsonObject(res)
        if (!res.ok) {
          throw new Error(
            res.status === 404 ? `there is no ${noun} with the slug “${slugParam}”` : data.error || `HTTP ${res.status}`,
          )
        }
        if (!alive) return
        const next = fromServer((data.frontmatter as Record<string, any>) || {})
        const list = next[listField]
        setSlugState(String(data.slug || slugParam))
        setSlugTouched(true)
        setFm(next)
        setListText(Array.isArray(list) ? list.join(', ') : '')
        setBody(typeof data.body === 'string' ? data.body : '')
        setEtag(res.headers.get('ETag'))
        setSavedAt(typeof data.updatedAt === 'number' && data.updatedAt > 0 ? data.updatedAt : undefined)
        setLoadState('ready')
      } catch (e: any) {
        if (!alive) return
        setLoadError(e?.message === 'Failed to fetch' ? 'network error' : e?.message || 'unknown error')
        setLoadState('error')
      }
    })()
    return () => {
      alive = false
    }
    // `empty`, `fromServer`, … are static per page; reload only on slug / retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, slugParam, reloadKey])

  // New items: the slug follows the title until it is edited by hand.
  useEffect(() => {
    if (isNew && !slugTouched && loadState === 'ready') setSlugState(slugFromTitle(String(fm.title ?? '')))
  }, [isNew, slugTouched, loadState, fm.title])

  const setSlug = useCallback((value: string) => {
    setSlugTouched(true)
    setSlugState(value)
  }, [])

  // The list field is edited through `listText`; leave it out of the snapshot
  // so normalising it after a save doesn't read as an edit.
  const snapshotOf = useCallback(
    (s: string, f: F, lt: string, b: string) => JSON.stringify({ slug: s, fm: { ...f, [listField]: null }, listText: lt, body: b }),
    [listField],
  )
  const snapshot = useMemo(() => snapshotOf(slug, fm, listText, body), [snapshotOf, slug, fm, listText, body])
  useEffect(() => {
    if (loadState === 'ready' && baseline === null) setBaseline(snapshot)
  }, [loadState, baseline, snapshot])
  const dirty = loadState === 'ready' && baseline !== null && snapshot !== baseline
  const { track, leave } = useLeaveSaver(snapshot)

  const draftValue = useMemo<DraftValue<F>>(() => ({ slug, fm, listText, body }), [slug, fm, listText, body])
  const {
    draft: localDraft,
    stale: localDraftStale,
    restore: takeDraft,
    discard: discardDraft,
    clear: clearDraft,
    flush: flushDraft,
  } = useLocalDraft<DraftValue<F>>({
    key: `mdx:${collection}:${slugParam || 'new'}`,
    value: draftValue,
    baseEtag: etag,
    dirty,
    enabled: loadState === 'ready' && baseline !== null,
    equals: sameJson,
  })

  const restoreDraft = useCallback(() => {
    const v = takeDraft()
    if (!v) return
    if (isNew) {
      setSlugState(v.slug)
      setSlugTouched(v.slug !== slugFromTitle(String(v.fm.title ?? '')))
    }
    setFm(v.fm)
    setListText(v.listText)
    setBody(v.body)
  }, [takeDraft, isNew])

  const save = useCallback(
    async (options: SaveOptions = {}): Promise<boolean> => {
      if (loadState !== 'ready' || savingRef.current) return false
      if (!SLUG_RE.test(slug)) {
        toast({
          status: 'error',
          title: slug ? 'Slug must start with a-z or 0-9 and use only a-z, 0-9, - and _' : 'Add an English slug first',
          position: 'bottom-right',
        })
        return false
      }
      if (!String(fm.title ?? '').trim()) {
        toast({ status: 'error', title: 'Title is required', position: 'bottom-right' })
        return false
      }
      const list = parseList(listText)
      const nextFm: F = options.draft === undefined ? fm : { ...fm, draft: options.draft }
      const savedSnapshot = snapshotOf(slug, nextFm, listText, body)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (!isNew && etag && !options.force) headers['If-Match'] = etag
      savingRef.current = true
      setSaving(true)
      return track(
        savedSnapshot,
        (async (): Promise<boolean> => {
          let res: Response | null = null
          try {
            res = await fetch(endpoint, {
              method: 'PUT',
              headers,
              // New items must never silently overwrite an existing slug.
              body: JSON.stringify({ slug, frontmatter: toServer(nextFm, list), body, create: isNew }),
            })
          } catch {
            res = null
          }
          savingRef.current = false
          setSaving(false)
          if (!res) {
            toast({ status: 'error', title: 'Network error — not saved', description: 'Your edits are kept on this device.', position: 'bottom-right' })
            return false
          }
          const data = await readJsonObject(res)
          if (!res.ok) {
            if (res.status === 409 && data.code === 'VERSION_CONFLICT') {
              flushDraft()
              conflictOptions.current = options
              setConflict(true)
              return false
            }
            if (res.status === 422 && data.code === 'MDX_INVALID') {
              const problem: MdxProblem = {
                line: typeof data.line === 'number' ? data.line : null,
                column: typeof data.column === 'number' ? data.column : null,
                reason: typeof data.reason === 'string' ? data.reason : 'The body does not compile',
              }
              setMdxError(problem)
              if (problem.line !== null) richRef.current?.jumpToLine(problem.line, problem.column ?? 1)
              return false
            }
            if (res.status === 401) setSessionExpired(true)
            toast({
              status: 'error',
              title: 'Save failed',
              description:
                res.status === 401
                  ? 'Your session has expired. Sign in again in a new tab, then save — your edits are kept.'
                  : res.status === 409
                    ? `A ${noun} with the slug “${slug}” already exists. Pick another slug.`
                    : res.status === 429
                      ? 'Too many saves in a short time — wait a minute and try again.'
                      : data.error || `HTTP ${res.status}`,
              position: 'bottom-right',
              duration: 7000,
              isClosable: true,
            })
            return false
          }
          const paths = parseRevalidated(data)
          setSessionExpired(false)
          setMdxError(null)
          setConflict(false)
          setRevalidated(paths)
          setFm({ ...nextFm, [listField]: list })
          setBaseline(savedSnapshot)
          setEtag(typeof data.etag === 'string' ? data.etag : res.headers.get('ETag'))
          setSavedAt(Date.now())
          clearDraft()
          const verb =
            options.draft === false ? 'Published' : options.draft === true ? 'Unpublished — now a draft' : nextFm.draft ? 'Draft saved' : 'Updated'
          toast({ ...saveToastCopy(data), title: `${verb} — snapshot taken`, position: 'bottom-right' })
          if (isNew) {
            justCreated.current = slug
            router.replace(`/admin/${collection}/edit?slug=${encodeURIComponent(slug)}`, undefined, {
              shallow: true,
              scroll: false,
            })
          }
          return true
        })(),
      )
    },
    [loadState, slug, fm, listText, body, snapshotOf, isNew, etag, endpoint, toServer, noun, listField, toast, collection, router, flushDraft, clearDraft, track],
  )

  // "Save and leave": true only once the edits are stored; a 409 / 422 / 401,
  // a network error or a failed check keeps the page open with its explanation.
  useDirtyRegistration(collection, dirty, () => leave(() => save()))

  const canSave = loadState === 'ready' && dirty && !saving
  useSaveShortcut(canSave, () => void save())

  /** Repeat the save that conflicted, without the version check. */
  const overwrite = useCallback(() => save({ ...conflictOptions.current, force: true }), [save])

  /** Load the latest server copy (edits stay available as a local draft). */
  const reload = useCallback(() => {
    flushDraft()
    setConflict(false)
    setReloadKey((k) => k + 1)
  }, [flushDraft])

  /** After a history restore: the server copy changed on purpose; drop the local draft. */
  const reloadAfterRestore = useCallback(() => {
    discardDraft()
    setBaseline(null)
    setReloadKey((k) => k + 1)
  }, [discardDraft])

  /** The frontmatter as it would be saved now (for diffs against snapshots). */
  const serverFrontmatter = useMemo(() => toServer(fm, parseList(listText)), [toServer, fm, listText])

  const saveState: SaveState =
    loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : saving ? 'saving' : dirty ? 'dirty' : 'clean'

  return {
    isNew,
    slugParam,
    slug,
    setSlug,
    slugHint: isNew && !slug && String(fm.title ?? '').trim() ? 'Add an English slug' : '',
    fm,
    setFm,
    serverFrontmatter,
    listText,
    setListText,
    commitList: () => setFm((f) => ({ ...f, [listField]: parseList(listText) })),
    body,
    setBody,
    loadState,
    loadError,
    retry: () => setReloadKey((k) => k + 1),
    reload,
    reloadAfterRestore,
    saving,
    dirty,
    canSave,
    save,
    saveState,
    savedAt,
    sessionExpired,
    revalidated,
    etag,
    conflict,
    overwrite,
    dismissConflict: () => setConflict(false),
    mdxError,
    dismissMdxError: () => setMdxError(null),
    richRef,
    localDraft,
    localDraftStale,
    restoreDraft,
    discardDraft,
  }
}
