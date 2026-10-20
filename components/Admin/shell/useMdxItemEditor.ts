import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { useToast } from '@chakra-ui/react'
import { useDirtyRegistration } from '../AdminDirtyContext'
import type { RichEditorHandle } from '../RichEditor'
import type { MdxProblem } from '../editor/EditorNotices'
import { mergeFrontmatter, modelledKeys, unmodelledFrontmatter, type FrontmatterRecord } from './frontmatterMerge'
import { loginHref, parseRevalidated, readJsonObject, saveToastCopy } from './http'
import { slugFromTitle } from './publishChecks'
import { editorMode, isPendingStale, saveTarget, type PendingMeta, type SaveTarget } from './pendingChanges'
import { parseItemSchedule, type ItemScheduleView, type ScheduleChange } from './itemSchedule'
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
 *   - unpublished changes (H4): saving a PUBLISHED item stores a pending
 *     revision — the public page keeps the published version — and
 *     save({ target: 'live' }) ("Publish changes") makes the edits live;
 *     the editor opens on the pending version when there is one, keeps the
 *     live version for the diff, and can discard the pending changes
 *   - slug rename (H6): renameTo() moves the item (the old address
 *     redirects) and reopens the editor on the new slug
 *   - scheduled publishing (H5): `schedule` is when the draft / the pending
 *     changes go live and when the live item unpublishes; setSchedule()
 *     saves unsaved edits first, then sets it (POST { action: 'schedule' })
 *     and takes the stored item back from the answer
 *   - new items derive their slug from the title until the slug is edited
 *   - frontmatter keys the form does not model (anything added later) are
 *     kept as loaded and saved with the form's fields (./frontmatterMerge);
 *     a modelled field the form clears is still removed
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
  /**
   * The frontmatter the form writes: every key it models, undefined for an
   * empty field (the save removes it). Keys it never writes are kept as stored.
   */
  toServer: (fm: F, list: string[]) => Record<string, unknown>
}

type DraftValue<F> = { slug: string; fm: F; listText: string; body: string }

export type SaveOptions<F = Record<string, unknown>> = {
  /** Publish (false) / unpublish (true); omitted keeps the current state. */
  draft?: boolean
  /** Overwrite a newer server version (no If-Match). */
  force?: boolean
  /** Where a save of a published item goes; omitted: pending for published items, else live. */
  target?: SaveTarget
  /** Fields set together with this save (e.g. "Mark as updated" while publishing changes). */
  patch?: Partial<F>
}

/** The published version of the item as stored (the "before" of the Publish changes diff). */
export type LiveDoc = { frontmatter: Record<string, unknown>; body: string; updatedAt: number }

export type RenameRewrite = { kind: string; ref: string; title: string; links: number }

export type RenameResult =
  | { ok: true; slug: string; links: number; rewrites: RenameRewrite[] }
  | { ok: false; error: string; code?: string }

export type RenamePlan =
  | { ok: true; links: number; rewrites: RenameRewrite[]; takesOverRedirectTo: string | null }
  | { ok: false; error: string; code?: string }

const rewritesOf = (v: unknown): RenameRewrite[] =>
  Array.isArray(v)
    ? v
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => ({ kind: String(r.kind || ''), ref: String(r.ref || ''), title: String(r.title || r.ref || ''), links: Number(r.links) || 0 }))
    : []

const slugsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])

const todayISO = () => new Date().toISOString().slice(0, 10)

/**
 * The schedule after a direct save (mirrors the server, lib/schedule/fields
 * carryScheduleOnSave): publishing ends publishAt and a passed window end,
 * unpublishing by hand ends both, a live save keeps the unpublish time.
 */
function afterLiveSave(s: ItemScheduleView, nowDraft: boolean, wasLive: boolean): ItemScheduleView {
  if (nowDraft) return wasLive ? { publishAt: null, unpublishAt: null, publishes: null } : s
  const end = wasLive || (s.unpublishAt !== null && s.unpublishAt > Date.now()) ? s.unpublishAt : null
  return { publishAt: null, unpublishAt: end, publishes: null }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const isPendingMeta = (v: unknown): v is PendingMeta =>
  !!v && typeof v === 'object' && typeof (v as PendingMeta).updatedAt === 'number' && typeof (v as PendingMeta).baseUpdatedAt === 'number'

export function useMdxItemEditor<F extends Record<string, unknown> & { draft: boolean }>(opts: Options<F>) {
  const { collection, endpoint, noun, empty, listField, fromServer, toServer } = opts
  const router = useRouter()
  const toast = useToast()
  const slugParam = typeof router.query.slug === 'string' ? router.query.slug : ''
  const isNew = !slugParam

  const [slug, setSlugState] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [fm, setFm] = useState<F>(empty)
  // Stored frontmatter keys the form does not model, sent back with every save.
  const [extra, setExtra] = useState<FrontmatterRecord>({})
  const modelled = useMemo(() => modelledKeys(empty, toServer(empty, [])), [empty, toServer])
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
  const [etag, setEtagState] = useState<string | null>(null)
  // The latest version, readable right after a save resolves (before a re-render).
  const etagRef = useRef<string | null>(null)
  const setEtag = useCallback((v: string | null) => {
    etagRef.current = v
    setEtagState(v)
  }, [])
  // H5: the item's schedule as stored (null for a new item).
  const [schedule, setScheduleState] = useState<ItemScheduleView | null>(null)
  const [savedAt, setSavedAt] = useState<number | undefined>(undefined)
  const [conflict, setConflict] = useState(false)
  const [mdxError, setMdxError] = useState<MdxProblem | null>(null)
  // H4: the live (published) version and the pending revision's metadata.
  const [live, setLive] = useState<LiveDoc | null>(null)
  const [pending, setPending] = useState<PendingMeta | null>(null)
  // H6: old slugs that redirect to this item.
  const [redirectsFrom, setRedirectsFrom] = useState<string[]>([])
  const richRef = useRef<RichEditorHandle>(null)
  // Slug we just created (or renamed to) and moved the URL to — its data is already here.
  const justCreated = useRef<string | null>(null)
  // Options of the save that hit a version conflict ("Overwrite anyway" repeats it).
  const conflictOptions = useRef<SaveOptions<F>>({})

  const livePublished = !!live && !live.frontmatter.draft

  /** Take a stored item (GET ?slug, or the answer of a schedule change) into the editor. */
  const applyItem = (data: Record<string, any>, tag: string | null) => {
    const liveFm = (data.frontmatter as Record<string, any>) || {}
    const liveBody = typeof data.body === 'string' ? data.body : ''
    const liveAt = typeof data.updatedAt === 'number' && data.updatedAt > 0 ? data.updatedAt : 0
    const rev = data.pending && typeof data.pending === 'object' ? (data.pending as Record<string, any>) : null
    // The editor works on the pending version when there is one.
    const stored = rev && rev.frontmatter && typeof rev.frontmatter === 'object' ? (rev.frontmatter as Record<string, any>) : liveFm
    const storedBody = rev && typeof rev.body === 'string' ? rev.body : liveBody
    const next = fromServer(stored)
    const list = next[listField]
    setSlugState(String(data.slug || slugParam))
    setSlugTouched(true)
    setFm(next)
    setExtra(unmodelledFrontmatter(stored, modelled))
    setListText(Array.isArray(list) ? list.join(', ') : '')
    setBody(storedBody)
    setEtag(tag)
    setLive({ frontmatter: liveFm, body: liveBody, updatedAt: liveAt })
    setPending(rev && isPendingMeta(rev) ? { updatedAt: rev.updatedAt, baseUpdatedAt: rev.baseUpdatedAt } : null)
    setRedirectsFrom(slugsOf(data.redirectsFrom))
    setScheduleState(parseItemSchedule(data.schedule))
    setSavedAt(rev && typeof rev.updatedAt === 'number' ? rev.updatedAt : liveAt || undefined)
  }

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
      setExtra({})
      setListText('')
      setBody('')
      setBaseline(null)
      setEtag(null)
      setSavedAt(undefined)
      setLive(null)
      setPending(null)
      setRedirectsFrom([])
      setScheduleState(null)
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
        applyItem(data, res.headers.get('ETag'))
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
    savedLocallyAt,
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
    async (options: SaveOptions<F> = {}): Promise<boolean> => {
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
      const patched: F = options.patch ? { ...fm, ...options.patch } : fm
      const nextFm: F = options.draft === undefined ? patched : { ...patched, draft: options.draft }
      const target = saveTarget({ isNew, draftChange: options.draft, livePublished, explicit: options.target })
      const savedSnapshot = snapshotOf(slug, nextFm, listText, body)
      const frontmatterOut = mergeFrontmatter(extra, toServer(nextFm, list), modelled)
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
              body: JSON.stringify({ slug, frontmatter: frontmatterOut, body, create: isNew, target }),
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
                  : res.status === 409 && data.code === 'SLUG_EXISTS'
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
          setSessionExpired(false)
          setMdxError(null)
          setConflict(false)
          setFm({ ...nextFm, [listField]: list })
          setBaseline(savedSnapshot)
          setEtag(typeof data.etag === 'string' ? data.etag : res.headers.get('ETag'))
          setSavedAt(Date.now())
          clearDraft()
          if (target === 'pending') {
            setPending(isPendingMeta(data.pending) ? data.pending : { updatedAt: Date.now(), baseUpdatedAt: live?.updatedAt ?? 0 })
            // The changes' publish time travels with them (the server keeps it).
            setRevalidated([])
            toast({
              status: 'success',
              title: 'Changes saved — not live yet',
              description: 'Visitors see the published version until you publish the changes.',
              position: 'bottom-right',
            })
          } else {
            const tag = typeof data.etag === 'string' ? data.etag : ''
            const liveAt = Number(/^"(\d+)/.exec(tag)?.[1]) || Date.now()
            setLive({ frontmatter: frontmatterOut, body, updatedAt: liveAt })
            setPending(null)
            // What the server keeps of a schedule after a direct save (lib/schedule/fields carryScheduleOnSave).
            setScheduleState((s) => (s ? afterLiveSave(s, !!nextFm.draft, !!live && !live.frontmatter.draft) : s))
            setRevalidated(parseRevalidated(data))
            const verb =
              options.draft === false
                ? 'Published'
                : options.draft === true
                  ? 'Unpublished — now a draft'
                  : options.target === 'live' && livePublished
                    ? 'Changes published'
                    : nextFm.draft
                      ? 'Draft saved'
                      : 'Updated'
            toast({ ...saveToastCopy(data), title: `${verb} — snapshot taken`, position: 'bottom-right' })
          }
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
    [loadState, slug, fm, extra, modelled, listText, body, snapshotOf, isNew, etag, setEtag, endpoint, toServer, noun, listField, toast, collection, router, flushDraft, clearDraft, track, livePublished, live],
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

  /** Drop the pending changes and reopen the published version. */
  const discardPending = useCallback(async (): Promise<boolean> => {
    if (!slugParam) return false
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (etag) headers['If-Match'] = etag
    let res: Response
    try {
      res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ action: 'discard-pending', slug: slugParam }) })
    } catch {
      toast({ status: 'error', title: 'Network error — nothing discarded', position: 'bottom-right' })
      return false
    }
    const data = await readJsonObject(res)
    if (!res.ok) {
      if (res.status === 409 && data.code === 'VERSION_CONFLICT') {
        setConflict(true)
        return false
      }
      toast({ status: 'error', title: 'Couldn’t discard the changes', description: data.error || `HTTP ${res.status}`, position: 'bottom-right' })
      return false
    }
    discardDraft()
    setBaseline(null)
    setReloadKey((k) => k + 1)
    toast({ status: 'success', title: 'Changes discarded', description: 'The editor shows the published version again.', position: 'bottom-right' })
    return true
  }, [slugParam, etag, endpoint, toast, discardDraft])

  /** Dry run of a rename: what would be rewritten, or why it can't happen. */
  const planRename = useCallback(
    async (to: string, redirect: boolean): Promise<RenamePlan> => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'rename', slug: slugParam, to, redirect, dryRun: true }),
        })
        const data = await readJsonObject(res)
        if (!res.ok) return { ok: false, error: res.status === 401 ? 'Your session has expired — sign in again.' : data.error || `HTTP ${res.status}`, code: data.code }
        return {
          ok: true,
          links: Number(data.links) || 0,
          rewrites: rewritesOf(data.rewrites),
          takesOverRedirectTo: typeof data.takesOverRedirectTo === 'string' ? data.takesOverRedirectTo : null,
        }
      } catch {
        return { ok: false, error: 'Network error' }
      }
    },
    [endpoint, slugParam],
  )

  /** Rename the item; the editor reopens on the new slug. */
  const renameTo = useCallback(
    async (to: string, redirect: boolean): Promise<RenameResult> => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (etag) headers['If-Match'] = etag
      let res: Response
      try {
        res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ action: 'rename', slug: slugParam, to, redirect }) })
      } catch {
        return { ok: false, error: 'Network error — nothing changed' }
      }
      const data = await readJsonObject(res)
      if (!res.ok) {
        if (res.status === 409 && data.code === 'VERSION_CONFLICT') return { ok: false, code: data.code, error: 'This was changed elsewhere since you loaded it — reload, then rename.' }
        return { ok: false, code: data.code, error: data.error || `HTTP ${res.status}` }
      }
      const next = String(data.slug || to)
      const links = Number(data.links) || 0
      toast({
        ...saveToastCopy(data),
        title: `Moved to /${collection}/${next}`,
        description:
          (links ? `${links} internal link${links === 1 ? '' : 's'} updated. ` : '') +
          (redirect ? `/${collection}/${slugParam} now redirects here.` : `/${collection}/${slugParam} no longer exists.`),
        position: 'bottom-right',
      })
      discardDraft()
      setBaseline(null)
      await router.replace(`/admin/${collection}/edit?slug=${encodeURIComponent(next)}`, undefined, { shallow: true, scroll: false })
      // After the reload the editor opens on the new slug; keep the refreshed pages listed.
      setRevalidated(parseRevalidated(data))
      return { ok: true, slug: next, links, rewrites: rewritesOf(data.rewrites) }
    },
    [etag, endpoint, slugParam, collection, toast, discardDraft, router],
  )

  /** Stop an old address from redirecting here. */
  const removeRedirect = useCallback(
    async (from: string): Promise<boolean> => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove-redirect', slug: slugParam, from }),
        })
        const data = await readJsonObject(res)
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        setRedirectsFrom(slugsOf(data.redirectsFrom))
        toast({ status: 'success', title: `/${collection}/${from} no longer redirects`, position: 'bottom-right' })
        return true
      } catch (e) {
        toast({ status: 'error', title: 'Couldn’t remove the redirect', description: e instanceof Error ? e.message : String(e), position: 'bottom-right' })
        return false
      }
    },
    [endpoint, slugParam, collection, toast],
  )

  /** The frontmatter as it would be saved now (for diffs against snapshots and the live version). */
  const serverFrontmatter = useMemo(
    () => mergeFrontmatter(extra, toServer(fm, parseList(listText)), modelled),
    [extra, toServer, fm, listText, modelled],
  )

  /** "Publish changes": the editor's state goes live (optionally marked as updated today, posts). */
  const publishChanges = useCallback(
    (markUpdated = false) => save({ target: 'live', ...(markUpdated ? { patch: { updated: todayISO() } as unknown as Partial<F> } : {}) }),
    [save],
  )

  /**
   * H5: set (or clear, with nulls) when the item publishes / unpublishes.
   * Unsaved edits are saved first (where an ordinary save would put them),
   * so the schedule always applies to what the editor shows.
   */
  const setSchedule = useCallback(
    async (change: ScheduleChange): Promise<{ ok: true } | { ok: false; error: string; code?: string }> => {
      if (!slugParam) return { ok: false, error: 'Save the item first' }
      if (dirty && !(await save())) return { ok: false, error: 'Your edits could not be saved — nothing was scheduled.' }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (etagRef.current) headers['If-Match'] = etagRef.current
      let res: Response
      try {
        res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ action: 'schedule', slug: slugParam, ...change }) })
      } catch {
        return { ok: false, error: 'Network error — nothing changed' }
      }
      const data = await readJsonObject(res)
      if (!res.ok) {
        if (res.status === 409 && data.code === 'VERSION_CONFLICT') return { ok: false, code: data.code, error: 'This was changed elsewhere since you loaded it — reload, then schedule.' }
        if (res.status === 401) setSessionExpired(true)
        return { ok: false, code: data.code, error: res.status === 401 ? 'Your session has expired — sign in again.' : data.error || `HTTP ${res.status}` }
      }
      clearDraft()
      applyItem(data, typeof data.etag === 'string' ? data.etag : res.headers.get('ETag'))
      setBaseline(null)
      return { ok: true }
    },
    // applyItem reads only stable setters and the page's static options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slugParam, dirty, save, endpoint, clearDraft],
  )

  const list = useMemo(() => parseList(listText), [listText])

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
    /** The list field (tags / stack) as it would be saved. */
    list,
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
    /** When the unsaved edits were last copied to this device (H3 autosave status). */
    savedLocallyAt,
    // H4
    mode: editorMode(isNew, livePublished),
    live,
    pending,
    pendingStale: isPendingStale(pending, live?.updatedAt),
    discardPending,
    publishChanges,
    // H5
    schedule,
    setSchedule,
    // H6
    redirectsFrom,
    planRename,
    renameTo,
    removeRedirect,
  }
}
