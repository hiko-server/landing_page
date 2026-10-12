/**
 * Route-change view transitions for the Pages Router (contract F).
 *
 * The browser captures the "old" snapshot at the next rendering opportunity
 * after `document.startViewTransition()` is called, so the new page must not
 * reach the DOM before that. Next renders a route change inside
 * `React.startTransition`, which lets us hold that render cheaply: while the
 * gate is closed, a tiny component in _app throws the gate's promise for the
 * incoming page, and React (no Suspense boundary + a transition lane) simply
 * keeps the current page on screen. The view-transition update callback opens
 * the gate, waits for React to commit the new page, and the browser animates
 * old → new.
 *
 * Data loading is already finished when the gate closes (we start at Next's
 * `beforeHistoryChange`), so the hold is one frame, never a network wait. Every
 * wait is bounded by a timeout so navigation can never get stuck.
 */

/** Pathname part of an asPath — the identity of "a page" for transitions. */
export function pageKeyOf(asPath: string): string {
  return asPath.split(/[?#]/)[0] || '/'
}

/**
 * True when `nextAs` leaves the current page (a different pathname). Query
 * and hash changes on the same page (?lang=zh, ?tab=cv, #section) are not
 * page transitions.
 */
export function isCrossPageNavigation(currentHref: string, nextAs: string): boolean {
  try {
    const current = new URL(currentHref)
    const next = new URL(nextAs, current)
    return next.origin === current.origin && next.pathname !== current.pathname
  } catch {
    return false
  }
}

type ViewTransitionLike = {
  ready?: Promise<unknown>
  finished?: Promise<unknown>
  updateCallbackDone?: Promise<unknown>
}

type DocumentWithViewTransition = {
  startViewTransition?: (update: () => Promise<void> | void) => ViewTransitionLike
}

export function supportsViewTransitions(doc: unknown = typeof document === 'undefined' ? undefined : document): boolean {
  return !!doc && typeof (doc as DocumentWithViewTransition).startViewTransition === 'function'
}

export function prefersReducedMotion(win: unknown = typeof window === 'undefined' ? undefined : window): boolean {
  const mm = (win as { matchMedia?: (q: string) => { matches: boolean } } | undefined)?.matchMedia
  if (typeof mm !== 'function') return false
  try {
    return mm.call(win, '(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const swallow = () => undefined

/**
 * Starts a view transition and returns true, or returns false when the API
 * is missing or throws. The transition's promises reject when it is skipped
 * (hidden tab, a newer transition, …); those rejections are expected and
 * swallowed so they never surface as unhandled errors.
 */
export function startViewTransitionSafely(doc: unknown, update: () => Promise<void> | void): boolean {
  const start = (doc as DocumentWithViewTransition | undefined)?.startViewTransition
  if (typeof start !== 'function') return false
  try {
    const vt = start.call(doc, update)
    vt?.ready?.catch(swallow)
    vt?.finished?.catch(swallow)
    vt?.updateCallbackDone?.catch(swallow)
    return true
  } catch {
    return false
  }
}

/** Resolves when `promise` settles or after `ms`, whichever comes first. Never rejects. */
export function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    promise.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      () => {
        clearTimeout(timer)
        resolve()
      },
    )
  })
}

/**
 * Holds the incoming page's render while the browser captures the old
 * snapshot. Framework-free so it can be unit-tested; _app drives it.
 */
export class TransitionGate {
  private holdPromise: Promise<void> | null = null
  private releaseHold: (() => void) | null = null
  private committedKey: string | null = null
  private commitCount = 0
  private commitCountAtHold = 0
  private commitWaiters: Array<() => void> = []

  get holding(): boolean {
    return this.holdPromise !== null
  }

  /** Close the gate: renders of any page other than the committed one suspend. */
  hold(): void {
    if (this.holdPromise) return
    this.commitCountAtHold = this.commitCount
    this.holdPromise = new Promise<void>((resolve) => {
      this.releaseHold = resolve
    })
  }

  /** Open the gate and let React render the held page. Idempotent. */
  release(): void {
    const resolve = this.releaseHold
    this.holdPromise = null
    this.releaseHold = null
    resolve?.()
  }

  /**
   * The promise a render must throw to wait, or null when `pageKey` may render
   * now (gate open, or it is the page already on screen).
   */
  pendingFor(pageKey: string): Promise<void> | null {
    if (!this.holdPromise || pageKey === this.committedKey) return null
    return this.holdPromise
  }

  /** Record the page React has just committed (called from a layout effect). */
  commit(pageKey: string): void {
    if (pageKey === this.committedKey) return
    const first = this.committedKey === null
    this.committedKey = pageKey
    if (!first) this.markCommitted()
  }

  /**
   * The router finished rendering a navigation (routeChangeComplete). Also
   * counts as a commit, so a navigation whose page key did not change can
   * never leave a transition waiting for its timeout.
   */
  markCommitted(): void {
    this.commitCount += 1
    const waiters = this.commitWaiters
    this.commitWaiters = []
    waiters.forEach((resolve) => resolve())
  }

  /**
   * Resolves once a different page has committed since the last hold() (at
   * once if that already happened), or after `timeoutMs`.
   */
  waitForCommit(timeoutMs: number): Promise<void> {
    if (this.commitCount > this.commitCountAtHold) return Promise.resolve()
    const committed = new Promise<void>((resolve) => {
      this.commitWaiters.push(resolve)
    })
    return settleWithin(committed, timeoutMs)
  }
}
