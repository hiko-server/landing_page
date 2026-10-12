import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/router'

/**
 * Admin-wide unsaved-changes registry.
 *
 * Every editor reports whether it holds unsaved edits with
 * `useDirtyRegistration(key, dirty)`. One provider then guards, in one place:
 *   - in-app navigation (Next router links / router.push)
 *   - the browser Back / Forward buttons (URL stays in sync when cancelled)
 *   - closing or reloading the tab (native beforeunload prompt)
 *   - anything else that asks first via `confirmDiscard()` (dashboard tab
 *     switches, sub-tab switches, "Reload latest", …)
 *
 * Editors must not install their own routeChangeStart / beforeunload guards.
 */

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave without saving?'
const ABORT_REASON = '__admin_dirty_navigation_cancelled__'

type Registry = {
  setDirty: (key: string, dirty: boolean) => void
  isAnyDirty: () => boolean
  dirtyKeys: () => string[]
  /** True when nothing is dirty or the user confirmed discarding. */
  confirmDiscard: (message?: string) => boolean
  /** Forget a key's dirty state after its owner deliberately discarded it. */
  clear: (key?: string) => void
}

const Ctx = createContext<Registry | null>(null)

export function AdminDirtyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const dirty = useRef(new Map<string, boolean>())
  // Lets the provider's own guards skip the prompt for a navigation the user
  // already confirmed (e.g. confirmDiscard() followed by router.push()).
  const bypassUntil = useRef(0)

  const isAnyDirty = useCallback(() => {
    for (const v of dirty.current.values()) if (v) return true
    return false
  }, [])

  const registry = useMemo<Registry>(
    () => ({
      setDirty: (key, value) => {
        if (value) dirty.current.set(key, true)
        else dirty.current.delete(key)
      },
      isAnyDirty,
      dirtyKeys: () => Array.from(dirty.current.entries()).filter(([, v]) => v).map(([k]) => k),
      confirmDiscard: (message = DEFAULT_MESSAGE) => {
        if (!isAnyDirty()) return true
        const ok = typeof window === 'undefined' ? true : window.confirm(message)
        if (ok) bypassUntil.current = Date.now() + 1500
        return ok
      },
      clear: (key) => {
        if (key) dirty.current.delete(key)
        else dirty.current.clear()
      },
    }),
    [isAnyDirty],
  )

  // Tab close / reload.
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

    const onRouteChangeStart = (url: string, { shallow }: { shallow: boolean }) => {
      // Query-only shallow updates (e.g. ?tab=) are the dashboard's own state;
      // it asks via confirmDiscard() before making them.
      if (shallow || samePage(url) || !isAnyDirty() || Date.now() < bypassUntil.current) return
      if (window.confirm(DEFAULT_MESSAGE)) {
        bypassUntil.current = Date.now() + 1500
        return
      }
      router.events.emit('routeChangeError', new Error(ABORT_REASON), url, { shallow })
      // The pages router has no cancel API: throwing is the supported way to
      // abort. The rejection is swallowed by the handler below.
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
    // cancelled navigation must put the current URL back to stay in sync.
    router.beforePopState(({ as }) => {
      if (samePage(as) || !isAnyDirty() || Date.now() < bypassUntil.current) return true
      if (window.confirm(DEFAULT_MESSAGE)) {
        bypassUntil.current = Date.now() + 1500
        return true
      }
      window.history.pushState(window.history.state, '', router.asPath)
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
  }, [router, isAnyDirty])

  return <Ctx.Provider value={registry}>{children}</Ctx.Provider>
}

/** Access the registry (null-safe outside a provider: everything is "clean"). */
export function useAdminDirty(): Registry {
  const ctx = useContext(Ctx)
  return (
    ctx ?? {
      setDirty: () => {},
      isAnyDirty: () => false,
      dirtyKeys: () => [],
      confirmDiscard: () => true,
      clear: () => {},
    }
  )
}

/** Report an editor's dirty state; it is cleared automatically on unmount. */
export function useDirtyRegistration(key: string, isDirty: boolean) {
  const { setDirty } = useAdminDirty()
  useEffect(() => {
    setDirty(key, isDirty)
  }, [key, isDirty, setDirty])
  useEffect(() => () => setDirty(key, false), [key, setDirty])
}
