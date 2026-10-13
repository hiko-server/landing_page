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

/**
 * True when a route change about to render (Next's `beforeHistoryChange`)
 * leaves the page on screen.
 *
 * On a push the address bar still shows the entry being left, so the URL
 * comparison above applies. On Back / Forward (popstate) the browser has
 * already moved the address bar to the target entry, so comparing it with
 * `nextAs` would compare the target with itself: the page on screen is the
 * one React last committed (`committedPageKey`, see TransitionGate).
 */
export function isRouteTransitionNavigation(
  currentHref: string,
  nextAs: string,
  isPop: boolean,
  committedPageKey: string | null,
): boolean {
  if (!isPop) return isCrossPageNavigation(currentHref, nextAs)
  if (committedPageKey === null) return false
  try {
    const current = new URL(currentHref)
    const next = new URL(nextAs, current)
    const onScreen = new URL(committedPageKey, current)
    return next.origin === current.origin && next.pathname !== onScreen.pathname
  } catch {
    return false
  }
}

/** What a `popstate` listener records about the Back / Forward in progress. */
export type PopRecord = { key: unknown; hasUAVisualTransition: boolean }

/** Reads a PopStateEvent: the target entry's Next key and whether the browser animated it itself. */
export function popRecordOf(event: { state?: unknown; hasUAVisualTransition?: unknown }): PopRecord {
  const state = event.state as { key?: unknown } | null | undefined
  return { key: state?.key, hasUAVisualTransition: event.hasUAVisualTransition === true }
}

/**
 * True when the browser already ran its own visual transition for this
 * Back / Forward (an iOS / Android edge swipe), so an author transition
 * would play a second animation on top. Only the popstate of the entry
 * being entered counts.
 */
export function uaAnimatedPop(pop: PopRecord | null, isPop: boolean, historyKey: unknown): boolean {
  return isPop && !!pop && pop.hasUAVisualTransition && pop.key === historyKey
}

type ViewTransitionLike = {
  ready?: Promise<unknown>
  finished?: Promise<unknown>
  updateCallbackDone?: Promise<unknown>
}

type UpdateCallback = () => Promise<void> | void

type DocumentWithViewTransition = {
  // Level 1 takes the callback; Level 2 also accepts { update, types }.
  startViewTransition?: (arg: UpdateCallback | { update: UpdateCallback; types: string[] }) => ViewTransitionLike
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

function swallowRejections(vt: ViewTransitionLike | undefined): void {
  vt?.ready?.catch(swallow)
  vt?.finished?.catch(swallow)
  vt?.updateCallbackDone?.catch(swallow)
}

/**
 * Starts a view transition and returns true, or returns false when the API
 * is missing or throws. The transition's promises reject when it is skipped
 * (hidden tab, a newer transition, …); those rejections are expected and
 * swallowed so they never surface as unhandled errors.
 *
 * `types` (e.g. ['back']) are passed with the Level 2 object form so CSS can
 * select them with :active-view-transition-type(). Browsers with only the
 * Level 1 API reject the object with a TypeError; they get the plain callback
 * form (and the default cross-fade) instead.
 */
export function startViewTransitionSafely(doc: unknown, update: UpdateCallback, types?: string[]): boolean {
  return beginViewTransition(doc, update, types) !== null
}

/**
 * startViewTransitionSafely, returning the transition (its promises already
 * guarded) so the caller can clean up once it settles; null when none started.
 */
export function beginViewTransition(doc: unknown, update: UpdateCallback, types?: string[]): ViewTransitionLike | null {
  const start = (doc as DocumentWithViewTransition | undefined)?.startViewTransition
  if (typeof start !== 'function') return null
  if (types && types.length) {
    try {
      const vt = start.call(doc, { update, types })
      swallowRejections(vt)
      return vt || {}
    } catch (err) {
      if (!(err instanceof TypeError)) return null
      // Level 1 only: fall through to the callback form.
    }
  }
  try {
    const vt = start.call(doc, update)
    swallowRejections(vt)
    return vt || {}
  } catch {
    return null
  }
}

/** Resolves once a started transition has finished or been skipped (at once when there is nothing to wait for). */
export function transitionSettled(vt: ViewTransitionLike | null): Promise<void> {
  const done = vt?.finished
  if (!done || typeof done.then !== 'function') return Promise.resolve()
  return done.then(swallow, swallow)
}

// ── Open overlays ───────────────────────────────────────────────────────────

/**
 * The scrim and the panel of every open Chakra modal layer: the mobile menu
 * drawer, the ⌘K palette, the lightbox and any other dialog.
 */
export const DISMISSIBLE_LAYER_SELECTOR = '.chakra-modal__overlay, .chakra-modal__content'

/** view-transition-name prefix of a lifted layer (`vt-layer-0`, `vt-layer-1`, …). */
export const LAYER_NAME_PREFIX = 'vt-layer-'

type LayerStyle = { viewTransitionName: string; visibility: string }
type LayerElement = { style: LayerStyle; isConnected?: boolean }
type LayerRoot = { querySelectorAll(selector: string): ArrayLike<unknown> }

export type LiftedLayers = {
  /** Number of layers lifted out of the page snapshot. */
  readonly count: number
  /** Run in the update callback (the old snapshot is taken): keep the layers out of the new state. */
  hideFromNewState(): void
  /** Run once the transition settled: anything still mounted shows again. */
  restore(): void
}

/**
 * An overlay that is open when a route transition starts (a drawer link was
 * tapped, Back was pressed with the palette open) would be captured in the
 * page's old snapshot and slide over the incoming page with it. Each open
 * layer gets its own view-transition-name before the old snapshot is taken,
 * so it leaves on its own: the UA fades the lone old image out in place
 * while the page transitions underneath. In the update callback the layers
 * lose their names and are hidden, so none of them is part of the new state
 * even if its dialog's own exit animation is still running.
 */
export function liftDismissibleLayers(root: LayerRoot | null | undefined): LiftedLayers {
  let layers: LayerElement[] = []
  try {
    layers = Array.from((root?.querySelectorAll(DISMISSIBLE_LAYER_SELECTOR) || []) as ArrayLike<LayerElement>).filter(
      (el) => !!el && typeof el === 'object' && !!el.style,
    )
  } catch {
    layers = []
  }
  const previous = layers.map((el) => ({ name: el.style.viewTransitionName, visibility: el.style.visibility }))
  layers.forEach((el, i) => {
    el.style.viewTransitionName = `${LAYER_NAME_PREFIX}${i}`
  })
  let hidden = false
  return {
    count: layers.length,
    hideFromNewState() {
      if (hidden) return
      hidden = true
      layers.forEach((el, i) => {
        el.style.viewTransitionName = previous[i].name
        el.style.visibility = 'hidden'
      })
    },
    restore() {
      layers.forEach((el, i) => {
        el.style.viewTransitionName = previous[i].name
        if (el.isConnected !== false) el.style.visibility = previous[i].visibility
      })
    },
  }
}

// ── Theme reveal ────────────────────────────────────────────────────────────

/** Circle centre (the button's centre, else the viewport's) and the radius that covers the viewport from it. */
export function revealGeometry(
  rect: { left: number; top: number; width: number; height: number } | null,
  viewport: { width: number; height: number },
): { x: number; y: number; r: number } {
  const x = rect ? rect.left + rect.width / 2 : viewport.width / 2
  const y = rect ? rect.top + rect.height / 2 : viewport.height / 2
  const r = Math.hypot(Math.max(x, viewport.width - x), Math.max(y, viewport.height - y))
  return { x, y, r }
}

// ── Direction ───────────────────────────────────────────────────────────────

/** 'next' / 'prev': explicit sequence links; 'forward' / 'back': history order. */
export type RouteDirection = 'next' | 'prev' | 'forward' | 'back'

/** A pending direction older than this is stale (the click did not navigate, e.g. it opened a new tab). */
const PENDING_TTL_MS = 10_000

let pending: { direction: 'next' | 'prev'; at: number } | null = null

/**
 * Set by a link that knows its place in a sequence (article prev / next)
 * right before it navigates; the next route transition takes it.
 */
export function setPendingDirection(direction: 'next' | 'prev' | null, now: number = Date.now()): void {
  pending = direction ? { direction, at: now } : null
}

/** Returns and clears the pending direction (null when none, or when it went stale). */
export function takePendingDirection(now: number = Date.now()): 'next' | 'prev' | null {
  const p = pending
  pending = null
  return p && now - p.at <= PENDING_TTL_MS ? p.direction : null
}

/**
 * The transition type for a navigation: an explicit pending direction wins;
 * a push is 'forward'; a Back / Forward (popstate) compares the history
 * indices of the entry being left and the one being entered. A popstate to
 * an entry with no known index gets no type (the plain cross-fade).
 */
export function resolveDirection(
  pendingDirection: 'next' | 'prev' | null,
  isPop: boolean,
  oldIdx: number | null | undefined,
  newIdx: number | null | undefined,
): RouteDirection | null {
  if (pendingDirection) return pendingDirection
  if (!isPop) return 'forward'
  if (typeof oldIdx !== 'number' || typeof newIdx !== 'number' || oldIdx === newIdx) return null
  return newIdx < oldIdx ? 'back' : 'forward'
}

// ── History order ───────────────────────────────────────────────────────────

type KeyStore = Pick<Storage, 'getItem' | 'setItem'>

const INDEX_STORAGE_KEY = 'vt:history-index:v1'
const INDEX_MAX_ENTRIES = 200

/**
 * Orders history entries without writing into history.state (Next owns it):
 * each entry is identified by Next's own `history.state.key` and mapped to a
 * monotonically increasing index kept in sessionStorage, so the order
 * survives reloads within the tab. An entry pushed after going Back gets a
 * higher index than every entry still on the stack, so comparisons stay
 * correct. Storage failures degrade to an in-memory map.
 */
export class HistoryIndex {
  private map: Record<string, number> = {}
  private max = 0
  private currentKey: string | null = null
  private readonly storage: KeyStore | null

  constructor(storage: KeyStore | null) {
    this.storage = storage
    try {
      const raw = storage?.getItem(INDEX_STORAGE_KEY)
      const parsed = raw ? (JSON.parse(raw) as { map?: unknown; max?: unknown }) : null
      if (parsed && parsed.map && typeof parsed.map === 'object' && !Array.isArray(parsed.map)) {
        for (const [k, v] of Object.entries(parsed.map as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v)) this.map[k] = v
        }
      }
      if (typeof parsed?.max === 'number' && Number.isFinite(parsed.max)) this.max = parsed.max
      this.max = Math.max(this.max, 0, ...Object.values(this.map))
    } catch {
      this.map = {}
      this.max = 0
    }
  }

  /** Index of a known entry key, or null. */
  indexOf(key: unknown): number | null {
    return typeof key === 'string' && key in this.map ? this.map[key] : null
  }

  /** Key of the entry on screen (the last one passed to enter()). */
  get current(): string | null {
    return this.currentKey
  }

  /** Index of the entry on screen, or null before the first enter(). */
  get currentIndex(): number | null {
    return this.indexOf(this.currentKey)
  }

  /** Record that `key` is now on screen; a key never seen before gets the next index. */
  enter(key: unknown): void {
    if (typeof key !== 'string' || !key) return
    this.currentKey = key
    if (key in this.map) return
    this.max += 1
    this.map[key] = this.max
    const keys = Object.keys(this.map)
    if (keys.length > INDEX_MAX_ENTRIES) {
      keys
        .sort((a, b) => this.map[a] - this.map[b])
        .slice(0, keys.length - INDEX_MAX_ENTRIES)
        .forEach((k) => delete this.map[k])
    }
    try {
      this.storage?.setItem(INDEX_STORAGE_KEY, JSON.stringify({ map: this.map, max: this.max }))
    } catch {
      // Quota / disabled storage: the in-memory order still works for this page view.
    }
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

  /** The page React has committed — the one on screen (null before the first commit). */
  get committedPageKey(): string | null {
    return this.committedKey
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
