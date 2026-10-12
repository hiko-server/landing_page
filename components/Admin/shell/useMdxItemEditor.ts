import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { useToast } from '@chakra-ui/react'
import { useDirtyRegistration } from '../AdminDirtyContext'
import { loginHref, parseRevalidated, readJsonObject, saveToastCopy } from './http'
import { useSaveShortcut, type SaveState } from './ui'

/**
 * State machine shared by the blog-post and case-study editors
 * (pages/admin/blog/edit, pages/admin/work/edit): load by ?slug=, dirty
 * tracking against the last loaded / saved state, unsaved-changes
 * registration, ⌘S (only when there is something to save), save with
 * create-vs-overwrite protection, and the list of public pages the save
 * revalidated.
 */

export type LoadState = 'loading' | 'ready' | 'error'

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/

export const parseList = (t: string) =>
  t
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean)

type Options<F extends Record<string, unknown>> = {
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

export function useMdxItemEditor<F extends Record<string, unknown>>(opts: Options<F>) {
  const { collection, endpoint, noun, empty, listField, fromServer, toServer } = opts
  const router = useRouter()
  const toast = useToast()
  const slugParam = typeof router.query.slug === 'string' ? router.query.slug : ''
  const isNew = !slugParam

  const [slug, setSlug] = useState('')
  const [fm, setFm] = useState<F>(empty)
  // Raw text of the comma-separated list, parsed on blur / save, so typing
  // ", " or a multi-word item isn't eaten mid-keystroke.
  const [listText, setListText] = useState('')
  const [body, setBody] = useState('')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [revalidated, setRevalidated] = useState<string[]>([])
  const [baseline, setBaseline] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Slug we just created and moved the URL to — its data is already here.
  const justCreated = useRef<string | null>(null)

  useEffect(() => {
    if (!router.isReady) return
    if (justCreated.current && justCreated.current === slugParam) {
      justCreated.current = null
      return
    }
    setRevalidated([])
    setSessionExpired(false)
    if (!slugParam) {
      setSlug('')
      setFm(empty)
      setListText('')
      setBody('')
      setBaseline(null)
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
            res.status === 404
              ? `there is no ${noun} with the slug “${slugParam}”`
              : data.error || `HTTP ${res.status}`
          )
        }
        if (!alive) return
        const next = fromServer((data.frontmatter as Record<string, any>) || {})
        const list = next[listField]
        setSlug(String(data.slug || slugParam))
        setFm(next)
        setListText(Array.isArray(list) ? list.join(', ') : '')
        setBody(typeof data.body === 'string' ? data.body : '')
        setLoadState('ready')
      } catch (e: any) {
        if (!alive) return
        setLoadError(
          e?.message === 'Failed to fetch' ? 'network error' : e?.message || 'unknown error'
        )
        setLoadState('error')
      }
    })()
    return () => {
      alive = false
    }
    // `empty`, `fromServer`, … are static per page; reload only on slug / retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, slugParam, reloadKey])

  // The list field is edited through `listText`; leave it out of the snapshot
  // so normalising it after a save doesn't read as an edit.
  const snapshot = useMemo(
    () => JSON.stringify({ slug, fm: { ...fm, [listField]: null }, listText, body }),
    [slug, fm, listField, listText, body]
  )
  useEffect(() => {
    if (loadState === 'ready' && baseline === null) setBaseline(snapshot)
  }, [loadState, baseline, snapshot])
  const dirty = loadState === 'ready' && baseline !== null && snapshot !== baseline
  useDirtyRegistration(collection, dirty)

  const save = useCallback(async () => {
    if (loadState !== 'ready' || saving) return
    if (!SLUG_RE.test(slug)) {
      toast({
        status: 'error',
        title: 'Slug must start with a-z or 0-9 and use only a-z, 0-9, - and _',
        position: 'bottom-right',
      })
      return
    }
    if (!String(fm.title ?? '').trim()) {
      toast({ status: 'error', title: 'Title is required', position: 'bottom-right' })
      return
    }
    const list = parseList(listText)
    const savedSnapshot = snapshot
    setSaving(true)
    let res: Response | null = null
    try {
      res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // New items must never silently overwrite an existing slug.
        body: JSON.stringify({ slug, frontmatter: toServer(fm, list), body, create: isNew }),
      })
    } catch {
      res = null
    }
    setSaving(false)
    if (!res) {
      toast({ status: 'error', title: 'Network error — not saved', position: 'bottom-right' })
      return
    }
    const data = await readJsonObject(res)
    if (!res.ok) {
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
      return
    }
    const paths = parseRevalidated(data)
    setSessionExpired(false)
    setRevalidated(paths)
    setFm((f) => ({ ...f, [listField]: list }))
    setBaseline(savedSnapshot)
    toast({ ...saveToastCopy(data), title: 'Saved — snapshot taken', position: 'bottom-right' })
    if (isNew) {
      justCreated.current = slug
      router.replace(`/admin/${collection}/edit?slug=${encodeURIComponent(slug)}`, undefined, {
        shallow: true,
        scroll: false,
      })
    }
  }, [
    loadState,
    saving,
    slug,
    fm,
    listText,
    snapshot,
    endpoint,
    toServer,
    body,
    isNew,
    noun,
    listField,
    toast,
    collection,
    router,
  ])

  const canSave = loadState === 'ready' && dirty && !saving
  useSaveShortcut(canSave, save)

  const saveState: SaveState =
    loadState === 'loading'
      ? 'loading'
      : loadState === 'error'
        ? 'error'
        : saving
          ? 'saving'
          : dirty
            ? 'dirty'
            : 'clean'

  return {
    isNew,
    slugParam,
    slug,
    setSlug,
    fm,
    setFm,
    listText,
    setListText,
    commitList: () => setFm((f) => ({ ...f, [listField]: parseList(listText) })),
    body,
    setBody,
    loadState,
    loadError,
    retry: () => setReloadKey((k) => k + 1),
    saving,
    dirty,
    canSave,
    save,
    saveState,
    sessionExpired,
    revalidated,
  }
}
