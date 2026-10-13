import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import LeaveDialog from './shell/LeaveDialog'

/**
 * Admin-wide unsaved-changes registry.
 *
 * Every editor reports whether it holds unsaved edits — and how to save them —
 * with `useDirtyRegistration(key, dirty, save?)`. One provider then guards, in
 * one place:
 *   - in-app navigation (Next router links / router.push)
 *   - the browser Back / Forward buttons (URL stays in sync when cancelled)
 *   - closing or reloading the tab (native beforeunload prompt)
 *   - anything else that asks first via `await confirmDiscard()` (dashboard
 *     tab switches, sub-tab switches, "Reload latest", …)
 *
 * Instead of window.confirm it opens LeaveDialog: "Save and leave" runs every
 * dirty editor's save and continues only if all of them succeed (a 409
 * conflict or a 422 validation error keeps you on the page, with the
 * editor's own explanation), "Discard" continues without saving, "Stay"
 * cancels.
 *
 * Editors must not install their own routeChangeStart / beforeunload guards.
 */

const DEFAULT_TITLE = 'Unsaved changes'
const DEFAULT_MESSAGE = 'You have unsaved changes. Leave without saving them?'
const ABORT_REASON = '__admin_dirty_navigation_cancelled__'
/** Window during which the provider's own guards let a confirmed navigation through. */
const BYPASS_MS = 1500

/** Saves an editor's edits; resolves true only when everything was stored. */
export type DirtySaver = () => Promise<boolean>

export type ConfirmOptions = {
  title?: string
  /** Offer "Save and leave" (default true; off for actions such as "Reload latest"). */
  allowSave?: boolean
  saveLabel?: string
  discardLabel?: string
}

type Registry = {
  setDirty: (key: string, dirty: boolean) => void
  setSaver: (key: string, saver: DirtySaver | null) => void
  isAnyDirty: () => boolean
  dirtyKeys: () => string[]
  /** Resolves true when nothing is dirty, or the owner saved or discarded; false to stay. */
  confirmDiscard: (message?: string, options?: ConfirmOptions) => Promise<boolean>
  /** Forget a key's dirty state after its owner deliberately discarded it. */
  clear: (key?: string) => void
}

type Prompt = {
  title: string
  message: string
  canSave: boolean
  saveLabel?: string
  discardLabel?: string
  resolve: (ok: boolean) => void
}

const Ctx = createContext<Registry | null>(null)

export function AdminDirtyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const dirty = useRef(new Map<string, boolean>())
  const savers = useRef(new Map<string, DirtySaver>())
  // Lets the provider's own guards skip the prompt for a navigation the user
  // already confirmed (e.g. confirmDiscard() followed by router.push()).
  const bypassUntil = useRef(0)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const promptRef = useRef<Prompt | null>(null)
  const [saving, setSaving] = useState(false)

  const isAnyDirty = useCallback(() => {
    for (const v of dirty.current.values()) if (v) return true
    return false
  }, [])

  const dirtyKeys = useCallback(() => Array.from(dirty.current.entries()).filter(([, v]) => v).map(([k]) => k), [])

  const open = useCallback(
    (message: string, options: ConfirmOptions = {}): Promise<boolean> => {
      if (!isAnyDirty()) return Promise.resolve(true)
      // One question at a time: a second request while the dialog is open stays put.
      if (promptRef.current) return Promise.resolve(false)
      const canSave = options.allowSave !== false && dirtyKeys().every((k) => savers.current.has(k))
      return new Promise<boolean>((resolve) => {
        const p: Prompt = {
          title: options.title || DEFAULT_TITLE,
          message,
          canSave,
          saveLabel: options.saveLabel,
          discardLabel: options.discardLabel,
          resolve,
        }
        promptRef.current = p
        setPrompt(p)
      })
    },
    [isAnyDirty, dirtyKeys],
  )

  const settle = useCallback((ok: boolean) => {
    const p = promptRef.current
    promptRef.current = null
    setPrompt(null)
    setSaving(false)
    if (ok) bypassUntil.current = Date.now() + BYPASS_MS
    p?.resolve(ok)
  }, [])

  const saveAll = useCallback(async () => {
    setSaving(true)
    for (const key of dirtyKeys()) {
      const save = savers.current.get(key)
      let ok = false
      try {
        ok = !!save && (await save())
      } catch {
        ok = false
      }
      if (!ok) {
        // The editor shows why (conflict dialog, validation errors, toast).
        settle(false)
        return
      }
    }
    settle(true)
  }, [dirtyKeys, settle])

  const registry = useMemo<Registry>(
    () => ({
      setDirty: (key, value) => {
        if (value) dirty.current.set(key, true)
        else dirty.current.delete(key)
      },
      setSaver: (key, saver) => {
        if (saver) savers.current.set(key, saver)
        else savers.current.delete(key)
      },
      isAnyDirty,
      dirtyKeys,
      confirmDiscard: (message = DEFAULT_MESSAGE, options) => {
        if (typeof window === 'undefined') return Promise.resolve(true)
        return open(message, options)
      },
      clear: (key) => {
        if (key) dirty.current.delete(key)
        else dirty.current.clear()
      },
    }),
    [isAnyDirty, dirtyKeys, open],
  )

  // Tab close / reload: the browser's own prompt (custom dialogs can't run here).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isAnyDirty() || Date.now() < bypassUntil.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isAnyDirty])

  // In-app navigation and Back/Forward.
  useEffect(() => {
    const samePage = (url: string) => {
      const strip = (u: string) => u.split('#')[0]
      return strip(url) === strip(router.asPath)
    }
    const passes = (url: string) => samePage(url) || !isAnyDirty() || Date.now() < bypassUntil.current

    /** Ask, then continue to `url` when the owner saved or discarded. */
    const askThenGo = (url: string) => {
      void open(DEFAULT_MESSAGE).then((ok) => {
        if (ok) void router.push(url)
      })
    }

    const onRouteChangeStart = (url: string, { shallow }: { shallow: boolean }) => {
      // Query-only shallow updates (e.g. ?tab=) are the dashboard's own state;
      // it asks via confirmDiscard() before making them.
      if (shallow || passes(url)) return
      askThenGo(url)
      router.events.emit('routeChangeError', new Error(ABORT_REASON), url, { shallow })
      // The pages router has no cancel API: throwing is the supported way to
      // abort. The rejection is swallowed by the handlers below.
      throw ABORT_REASON
    }

    const onUnhandled = (e: PromiseRejectionEvent) => {
      const r = e.reason
      if (r === ABORT_REASON || (r instanceof Error && r.message === ABORT_REASON)) e.preventDefault()
    }
    const onError = (e: ErrorEvent) => {
      if (e.error === ABORT_REASON || e.message?.includes(ABORT_REASON)) e.preventDefault()
    }

    // Back / Forward: the URL has already changed when popstate fires, so a
    // cancelled navigation puts the current URL back to stay in sync, and the
    // dialog continues to the requested entry when the owner confirms.
    router.beforePopState(({ as }) => {
      if (passes(as)) return true
      window.history.pushState(window.history.state, '', router.asPath)
      askThenGo(as)
      return false
    })

    router.events.on('routeChangeStart', onRouteChangeStart)
    window.addEventListener('unhandledrejection', onUnhandled)
    window.addEventListener('error', onError)
    return () => {
      router.events.off('routeChangeStart', onRouteChangeStart)
      window.removeEventListener('unhandledrejection', onUnhandled)
      window.removeEventListener('error', onError)
      router.beforePopState(() => true)
    }
  }, [router, isAnyDirty, open])

  return (
    <Ctx.Provider value={registry}>
      {children}
      <LeaveDialog
        isOpen={!!prompt}
        title={prompt?.title || DEFAULT_TITLE}
        message={prompt?.message || DEFAULT_MESSAGE}
        canSave={!!prompt?.canSave}
        saving={saving}
        saveLabel={prompt?.saveLabel}
        discardLabel={prompt?.discardLabel}
        onSave={() => void saveAll()}
        onDiscard={() => settle(true)}
        onStay={() => settle(false)}
      />
    </Ctx.Provider>
  )
}

const CLEAN_REGISTRY: Registry = {
  setDirty: () => {},
  setSaver: () => {},
  isAnyDirty: () => false,
  dirtyKeys: () => [],
  confirmDiscard: () => Promise.resolve(true),
  clear: () => {},
}

/** Access the registry (null-safe outside a provider: everything is "clean"). */
export function useAdminDirty(): Registry {
  return useContext(Ctx) ?? CLEAN_REGISTRY
}

/**
 * Report an editor's dirty state, and optionally how to save it for "Save and
 * leave". `save` may change every render; the latest one is used. Both are
 * cleared automatically on unmount.
 */
export function useDirtyRegistration(key: string, isDirty: boolean, save?: DirtySaver) {
  const { setDirty, setSaver } = useAdminDirty()
  const saveRef = useRef(save)
  saveRef.current = save
  const hasSave = !!save
  useEffect(() => {
    setDirty(key, isDirty)
  }, [key, isDirty, setDirty])
  useEffect(() => () => setDirty(key, false), [key, setDirty])
  useEffect(() => {
    if (!hasSave) return
    setSaver(key, () => (saveRef.current ? saveRef.current() : Promise.resolve(false)))
    return () => setSaver(key, null)
  }, [key, hasSave, setSaver])
}
