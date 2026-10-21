import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  DISMISSIBLE_LAYER_SELECTOR,
  LAYER_NAME_PREFIX,
  TransitionGate,
  beginViewTransition,
  isRouteTransitionNavigation,
  liftDismissibleLayers,
  popRecordOf,
  transitionSettled,
  uaAnimatedPop,
} from '../lib/viewTransition'
import { REVEAL_ROOT_MARGIN, isBelowFold, observeReveal, revealVariant, type ObserverCtor, type RevealPhase } from '../lib/reveal'
import {
  SHORTCUTS_STORAGE_KEY,
  getShortcutsEnabled,
  isImeComposing,
  readShortcutsPreference,
  resetShortcutsCache,
  setShortcutsEnabled,
  subscribeShortcuts,
  writeShortcutsPreference,
} from '../lib/keyboardShortcuts'
import { MAIN_ID, focusPageStart, focusVerdict, fragmentOf, isPageChange } from '../components/Chrome/routeFocus'
import { HEADER_CLEARANCE, clearOfHeader } from '../lib/anchorOffset'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

// ── FIX-02: Back / Forward route transitions ──────────────────────────────────

test('a push transitions only when the pathname changes (same origin)', () => {
  const here = 'https://lucian-dev.com/blog?x=1'
  assert.equal(isRouteTransitionNavigation(here, '/work', false, '/blog'), true)
  assert.equal(isRouteTransitionNavigation(here, '/blog?x=2', false, '/blog'), false, 'query change')
  assert.equal(isRouteTransitionNavigation(here, '/blog#top', false, '/blog'), false, 'hash change')
  assert.equal(isRouteTransitionNavigation(here, 'https://elsewhere.example/work', false, '/blog'), false, 'other origin')
})

test('Back / Forward compare the target with the committed page, not the address bar', () => {
  // popstate: the address bar already shows the target entry.
  const addressBar = 'https://lucian-dev.com/work'
  assert.equal(isRouteTransitionNavigation(addressBar, '/work', true, '/about'), true, 'about → work')
  assert.equal(isRouteTransitionNavigation(addressBar, '/work?tab=2', true, '/work'), false, 'same page, other query')
  assert.equal(isRouteTransitionNavigation(addressBar, '/work#a', true, '/work'), false, 'same page, other hash')
  assert.equal(isRouteTransitionNavigation(addressBar, '/work', true, null), false, 'nothing committed yet')
  // The old check (address bar vs target) said "same page" for every pop.
  assert.equal(isRouteTransitionNavigation(addressBar, '/work', false, '/about'), false)
})

test('TransitionGate exposes the committed page key', () => {
  const gate = new TransitionGate()
  assert.equal(gate.committedPageKey, null)
  gate.commit('/about')
  assert.equal(gate.committedPageKey, '/about')
  gate.commit('/work')
  assert.equal(gate.committedPageKey, '/work')
})

test('a Back / Forward the browser animated itself (edge swipe) gets no author transition', () => {
  const swipe = popRecordOf({ state: { key: 'k2', __N: true }, hasUAVisualTransition: true })
  assert.deepEqual(swipe, { key: 'k2', hasUAVisualTransition: true })
  assert.equal(uaAnimatedPop(swipe, true, 'k2'), true)
  assert.equal(uaAnimatedPop(swipe, true, 'k3'), false, 'a record from another entry')
  assert.equal(uaAnimatedPop(swipe, false, 'k2'), false, 'a push')
  const button = popRecordOf({ state: { key: 'k2' } })
  assert.equal(button.hasUAVisualTransition, false, 'undefined (older browsers) counts as false')
  assert.equal(uaAnimatedPop(button, true, 'k2'), false)
  assert.equal(uaAnimatedPop(null, true, 'k2'), false)
  assert.deepEqual(popRecordOf({ state: null }), { key: undefined, hasUAVisualTransition: false })
})

test('beginViewTransition returns the transition (types first, Level 1 fallback) or null', async () => {
  const calls: unknown[] = []
  const finished = Promise.resolve()
  const doc = {
    startViewTransition(arg: unknown) {
      calls.push(arg)
      return { finished, ready: finished, updateCallbackDone: finished }
    },
  }
  const vt = beginViewTransition(doc, () => undefined, ['back'])
  assert.ok(vt)
  assert.deepEqual((calls[0] as { types: string[] }).types, ['back'])
  await transitionSettled(vt)

  const level1 = {
    startViewTransition(arg: unknown) {
      if (typeof arg !== 'function') throw new TypeError('Level 1')
      return {}
    },
  }
  assert.ok(beginViewTransition(level1, () => undefined, ['forward']), 'falls back to the callback form')
  assert.equal(beginViewTransition({}, () => undefined), null)
  assert.equal(
    beginViewTransition({ startViewTransition: () => { throw new Error('InvalidStateError') } }, () => undefined),
    null,
  )
  // A skipped transition rejects `finished`; settling never rejects.
  await transitionSettled({ finished: Promise.reject(new Error('skipped')) })
  await transitionSettled(null)
})

// ── FIX-03: open overlays leave the page snapshot ──────────────────────────────

type FakeLayer = { style: { viewTransitionName: string; visibility: string }; isConnected: boolean }
const layer = (): FakeLayer => ({ style: { viewTransitionName: '', visibility: '' }, isConnected: true })

test('open drawer / palette layers get their own snapshot, then leave the new state', () => {
  const scrim = layer()
  const panel = layer()
  let selector = ''
  const root = {
    querySelectorAll(sel: string) {
      selector = sel
      return [scrim, panel]
    },
  }
  const lifted = liftDismissibleLayers(root)
  assert.equal(selector, DISMISSIBLE_LAYER_SELECTOR)
  assert.match(DISMISSIBLE_LAYER_SELECTOR, /chakra-modal__overlay/)
  assert.match(DISMISSIBLE_LAYER_SELECTOR, /chakra-modal__content/)
  assert.equal(lifted.count, 2)
  // Unique names before the old snapshot (duplicates would abort the transition).
  assert.equal(scrim.style.viewTransitionName, `${LAYER_NAME_PREFIX}0`)
  assert.equal(panel.style.viewTransitionName, `${LAYER_NAME_PREFIX}1`)
  // In the update callback: unnamed and hidden, so the new state has no menu.
  lifted.hideFromNewState()
  assert.deepEqual(scrim.style, { viewTransitionName: '', visibility: 'hidden' })
  assert.deepEqual(panel.style, { viewTransitionName: '', visibility: 'hidden' })
  // After the transition: an unmounted layer stays as it was; a still-open one shows again.
  scrim.isConnected = false
  lifted.restore()
  assert.equal(scrim.style.visibility, 'hidden')
  assert.equal(panel.style.visibility, '')
})

test('lifting with no open layer (or no document) is a no-op', () => {
  const none = liftDismissibleLayers({ querySelectorAll: () => [] })
  assert.equal(none.count, 0)
  none.hideFromNewState()
  none.restore()
  assert.equal(liftDismissibleLayers(null).count, 0)
  const broken = liftDismissibleLayers({
    querySelectorAll: () => {
      throw new Error('bad selector')
    },
  })
  assert.equal(broken.count, 0)
})

test('a transition that never started restores the layer names at once', () => {
  const panel = layer()
  const lifted = liftDismissibleLayers({ querySelectorAll: () => [panel] })
  assert.equal(panel.style.viewTransitionName, `${LAYER_NAME_PREFIX}0`)
  lifted.restore()
  assert.deepEqual(panel.style, { viewTransitionName: '', visibility: '' })
})

test('RouteTransitions: pops compare page keys, read the popstate event and lift open layers', () => {
  const src = read('components/Chrome/RouteTransitions.tsx')
  assert.match(src, /isRouteTransitionNavigation\(window\.location\.href, as, isPop, gate\.committedPageKey\)/)
  assert.doesNotMatch(src, /isCrossPageNavigation\(window\.location\.href, as\)/, 'the old address-bar check is gone')
  assert.match(src, /addEventListener\('popstate', onPopState\)/)
  assert.match(src, /uaAnimatedPop\(pop, isPop, key\)/)
  assert.match(src, /liftDismissibleLayers\(document\)[\s\S]*layers\.hideFromNewState\(\)[\s\S]*layers\.restore\(\)/)
  const header = read('components/Header/Header.tsx')
  assert.match(header, /closeCmdk\(\)/, 'the palette closes when the page changes under it')
})

// ── FIX-04: one reveal path ───────────────────────────────────────────────────

type Entry = { isIntersecting: boolean; boundingClientRect: { top: number } }

function fakeObserver() {
  const state: { callback: ((entries: Entry[]) => void) | null; init: unknown; observed: unknown[]; disconnected: number } = {
    callback: null,
    init: null,
    observed: [],
    disconnected: 0,
  }
  const Ctor = class {
    constructor(callback: (entries: Entry[]) => void, init: unknown) {
      state.callback = callback
      state.init = init
    }
    observe(target: unknown) {
      state.observed.push(target)
    }
    disconnect() {
      state.disconnected += 1
    }
  } as unknown as ObserverCtor
  return { Ctor, state, fire: (...entries: Entry[]) => state.callback?.(entries) }
}

test('isBelowFold / revealVariant', () => {
  assert.equal(isBelowFold(900, 800), true)
  assert.equal(isBelowFold(800, 800), true, 'starts exactly at the fold')
  assert.equal(isBelowFold(799, 800), false, 'one pixel on screen')
  assert.equal(isBelowFold(-400, 800), false, 'above the viewport')
  assert.equal(isBelowFold(Number.NaN, 800), false)
  assert.equal(isBelowFold(900, 0), false)
  assert.equal(revealVariant('pending'), 'hidden')
  assert.equal(revealVariant('static'), 'show')
  assert.equal(revealVariant('shown'), 'show')
})

test('a node below the fold waits hidden, then reveals once it scrolls into the zone', () => {
  const io = fakeObserver()
  const phases: RevealPhase[] = []
  const el = {}
  observeReveal(el, (p) => phases.push(p), { IntersectionObserver: io.Ctor, viewportHeight: () => 800, reducedMotion: false })
  assert.deepEqual(io.state.observed, [el])
  assert.deepEqual(io.state.init, { rootMargin: REVEAL_ROOT_MARGIN, threshold: 0 })
  io.fire({ isIntersecting: false, boundingClientRect: { top: 1400 } })
  assert.deepEqual(phases, ['pending'])
  io.fire({ isIntersecting: true, boundingClientRect: { top: 700 } })
  assert.deepEqual(phases, ['pending', 'shown'])
  assert.equal(io.state.disconnected, 1, 'observes once')
  io.fire({ isIntersecting: false, boundingClientRect: { top: 2000 } })
  assert.deepEqual(phases, ['pending', 'shown'], 'never hides again')
})

test('a node on screen (or above it) on the first observation stays static — visible in the first frame', () => {
  for (const entry of [
    { isIntersecting: true, boundingClientRect: { top: 120 } },
    // In the bottom 10% band: on screen although outside the reveal zone.
    { isIntersecting: false, boundingClientRect: { top: 760 } },
    // Scrolled past (Back with a restored position further down).
    { isIntersecting: false, boundingClientRect: { top: -900 } },
  ]) {
    const io = fakeObserver()
    const phases: RevealPhase[] = []
    observeReveal({}, (p) => phases.push(p), { IntersectionObserver: io.Ctor, viewportHeight: () => 800, reducedMotion: false })
    io.fire(entry)
    assert.deepEqual(phases, ['static'], JSON.stringify(entry))
    assert.equal(io.state.disconnected, 1)
  }
})

test('both decisions in one batch of entries are applied in order', () => {
  const io = fakeObserver()
  const phases: RevealPhase[] = []
  observeReveal({}, (p) => phases.push(p), { IntersectionObserver: io.Ctor, viewportHeight: () => 800, reducedMotion: false })
  io.fire({ isIntersecting: false, boundingClientRect: { top: 900 } }, { isIntersecting: true, boundingClientRect: { top: 600 } })
  assert.deepEqual(phases, ['pending', 'shown'])
})

test('reduced motion or no IntersectionObserver: nothing is ever hidden', () => {
  const io = fakeObserver()
  const phases: RevealPhase[] = []
  observeReveal({}, (p) => phases.push(p), { IntersectionObserver: io.Ctor, viewportHeight: () => 800, reducedMotion: true })
  assert.equal(io.state.callback, null, 'no observer under reduced motion')
  observeReveal({}, (p) => phases.push(p), { viewportHeight: () => 800, reducedMotion: false })
  assert.deepEqual(phases, [])
})

test('cleanup stops a pending node from reporting', () => {
  const io = fakeObserver()
  const phases: RevealPhase[] = []
  const stop = observeReveal({}, (p) => phases.push(p), { IntersectionObserver: io.Ctor, viewportHeight: () => 800, reducedMotion: false })
  io.fire({ isIntersecting: false, boundingClientRect: { top: 1200 } })
  stop()
  io.fire({ isIntersecting: true, boundingClientRect: { top: 300 } })
  assert.deepEqual(phases, ['pending'])
})

test('sections and row staggers use the reveal path, not framer whileInView', () => {
  const reveal = read('components/General-UI/SectionReveal.tsx')
  assert.doesNotMatch(reveal, /whileInView|useInView|initial=\{\{ opacity: 0/)
  assert.match(reveal, /useScrollReveal/)
  assert.match(reveal, /'&\[data-reveal="pending"\]'/)
  assert.match(reveal, /@media print/)
  for (const f of [
    'components/LandingPage/Skills.tsx',
    'components/LandingPage/CertificationsPeek.tsx',
    'components/LandingPage/ExperienceTimeline.tsx',
    'components/GitHub/TopRepos.tsx',
    'components/GitHub/ActivityFeed.tsx',
  ]) {
    const src = read(f)
    assert.doesNotMatch(src, /whileInView/, f)
    assert.match(src, /initial=\{false\}/, f)
    assert.match(src, /animate=\{revealVariant\(reveal\.phase\)\}/, f)
    // The phase drives framer variants: decided only once the LazyMotion features have rendered.
    assert.match(src, /useScrollReveal<\w+>\(\{ afterMotionFeatures: true \}\)/, f)
  }
})

test('a row stagger decides its phase only after the motion features arrived and rendered (cold first visit)', () => {
  const hook = read('components/General-UI/useScrollReveal.ts')
  assert.match(hook, /loadMotionFeatures\(\)\s*\.then\(afterTwoFrames\)/)
  assert.match(hook, /requestAnimationFrame\(\(\) => requestAnimationFrame\(/)
  // A section wrapper (CSS, no framer) keeps deciding on the first observation.
  assert.match(hook, /if \(!afterMotionFeatures\) return observe\(\)/)
  assert.doesNotMatch(read('components/General-UI/SectionReveal.tsx'), /afterMotionFeatures/)
})

test('COR-2 / UX-3: every row stagger is marked, and print shows its animated rows whatever their reveal phase', () => {
  // Each stagger container carries data-reveal-list; every element with an
  // opacity / transform variant carries data-reveal-item.
  const lists: Record<string, number> = {
    'components/LandingPage/Skills.tsx': 1, // chips (motion.li)
    'components/LandingPage/CertificationsPeek.tsx': 1, // organisations (motion.section)
    'components/LandingPage/ExperienceTimeline.tsx': 1, // roles (motion.li)
    'components/GitHub/TopRepos.tsx': 1, // repo tiles
    'components/GitHub/ActivityFeed.tsx': 1, // event rows
    // (A2 replaced the 10 staggered language bars with one static stacked bar: LanguageStack.)
  }
  for (const [f, items] of Object.entries(lists)) {
    const src = read(f)
    assert.equal(src.match(/data-reveal-list=""/g)?.length, 1, `${f}: one marked stagger container`)
    assert.equal(src.match(/data-reveal-item=""/g)?.length, items, `${f}: animated rows marked`)
    // The marker sits on the element that runs the reveal (ref + animate).
    assert.match(src, /ref=\{(reveal\.ref|setListRef)\}\s+data-reveal-list=""|ref=\{reveal\.ref\} data-reveal-list=""/, f)
  }
  const css = read('styles/globals.css')
  const print = css.slice(css.indexOf('@media print {'))
  const rule = print.match(/\[data-reveal-list\] > \*,\s*\[data-reveal-list\] \[data-reveal-item\]\s*\{([^}]*)\}/)
  assert.ok(rule, 'print override for the stagger rows')
  // !important: framer-motion writes the hidden state as an inline style.
  assert.match(rule[1], /opacity:\s*1 !important/)
  assert.match(rule[1], /transform:\s*none !important/)
  assert.ok(css.indexOf('[data-reveal-list] > *') > css.indexOf('@media print {'), 'only in print')
})

// ── FIX-13: focus clear of the sticky header, focus after page changes ────────

test('UX-1 / UX-2 / COR-4: targets inside <main> carry the header offset as scroll margins; html has no scroll padding', () => {
  const css = read('styles/globals.css')
  assert.match(css, /--header-h:\s*57px/)
  // No root scroll padding: it also applied to the sticky header's and the bottom bar's own controls.
  assert.doesNotMatch(css, /scroll-padding-(top|bottom)\s*:/)
  // One zero-specificity rule for every potential target inside <main> (and <main> itself, the skip link's target)…
  const rule = css.match(/:where\(#main\),\s*:where\(#main\)\s*:where\(([^)]*)\):where\(\s*:not\(\[data-bottom-bar\], \[data-bottom-bar\] \*\)\s*\)\s*\{([^}]*)\}/)
  assert.ok(rule, 'the :where(#main) scroll-margin rule')
  for (const target of ['[id]', 'a', 'button', 'input', 'select', 'textarea', 'summary', '[tabindex]']) assert.ok(rule[1].split(/,\s*/).includes(target), target)
  assert.match(rule[2], /scroll-margin-top:\s*calc\(var\(--header-h\)\s*\+\s*16px\)/)
  assert.match(rule[2], /scroll-margin-bottom:\s*var\(--bottom-bar-h,\s*0px\)/)
  // …the sticky bottom bars opt out, so focusing their controls never scrolls the page.
  assert.match(read('components/CVViewerPage/CvPageView.tsx'), /as="nav"\s+data-bottom-bar=""/)
  assert.match(read('components/Article/DraftBar.tsx'), /data-bottom-bar=""/)
  // Per-element margins add their air on top of the header clearance (they replace the default).
  assert.equal(HEADER_CLEARANCE, 'calc(var(--header-h) + 16px)')
  assert.equal(clearOfHeader('24px'), 'calc(var(--header-h) + 16px + 24px)')
  assert.match(read('components/Chrome/SiteChrome.tsx'), /HEADER_HEIGHT_VAR = '--header-h'/)
  const mdx = read('components/MDX/MDXContent.tsx')
  assert.match(mdx, /const ANCHOR_MARGIN = clearOfHeader\('16px'\)/)
  assert.match(mdx, /scrollMarginTop: ANCHOR_MARGIN,/, 'headings')
  assert.match(mdx, /'& \[id\^="user-content-fn"\]': \{ scrollMarginTop: ANCHOR_MARGIN \}/, 'footnotes and back links: the header clearance once, plus air')
  assert.match(read('components/LandingPage/Content.tsx'), /scrollMarginTop: clearOfHeader\('8px'\)/)
  assert.match(read('components/CVViewerPage/primitives.tsx'), /ANCHOR_SCROLL_MARGIN = clearOfHeader\('24px'\)/)
  const colophon = read('pages/colophon.tsx')
  assert.match(colophon, /const ANCHOR_MARGIN = clearOfHeader\('24px'\)/)
  assert.equal(colophon.match(/scrollMarginTop: ANCHOR_MARGIN/g)?.length, 2)
  // No fixed pixel margin that would ignore the measured header height.
  for (const f of ['components/MDX/MDXContent.tsx', 'components/LandingPage/Content.tsx', 'components/CVViewerPage/primitives.tsx', 'pages/colophon.tsx']) {
    assert.doesNotMatch(read(f), /scrollMarginTop: '\d+px'/, f)
  }
})

test('isPageChange / fragmentOf', () => {
  assert.equal(isPageChange('/blog', '/work'), true)
  assert.equal(isPageChange('/blog', '/blog?page=2'), false, 'query only')
  assert.equal(isPageChange('/blog', '/blog#top'), false, 'hash only')
  assert.equal(isPageChange('/', '/#section-contact'), false)
  assert.equal(isPageChange('/cv', '/cv/zh'), true)
  assert.equal(isPageChange(null, '/work'), false)
  assert.equal(fragmentOf('/about#experience'), 'experience')
  assert.equal(fragmentOf('/blog/x#%E4%B8%AD%E6%96%87'), '中文')
  assert.equal(fragmentOf('/blog/x#%E4%'), '%E4%', 'malformed escapes stay raw')
  assert.equal(fragmentOf('/about'), '')
})

type FakeEl = {
  id: string
  children: FakeEl[]
  attrs: Record<string, string>
  focused: { preventScroll?: boolean } | null
  focus(o?: { preventScroll?: boolean }): void
  contains(other: unknown): boolean
  hasAttribute(n: string): boolean
  setAttribute(n: string, v: string): void
}

function el(id: string, children: FakeEl[] = [], attrs: Record<string, string> = {}): FakeEl {
  const node: FakeEl = {
    id,
    children,
    attrs: { ...attrs },
    focused: null,
    focus(o) {
      node.focused = o || {}
    },
    contains(other) {
      return other === node || node.children.some((c) => c.contains(other))
    },
    hasAttribute: (n) => n in node.attrs,
    setAttribute: (n, v) => {
      node.attrs[n] = v
    },
  }
  return node
}

function fakeDoc(opts: { main?: FakeEl | null; active?: unknown; dialog?: boolean; others?: FakeEl[] }) {
  const body = { tag: 'body' }
  const all = [...(opts.main ? [opts.main] : []), ...(opts.others || [])]
  const find = (id: string, list: FakeEl[]): FakeEl | null => {
    for (const n of list) {
      if (n.id === id) return n
      const hit = find(id, n.children)
      if (hit) return hit
    }
    return null
  }
  return {
    body,
    activeElement: opts.active === undefined ? body : opts.active,
    getElementById: (id: string) => find(id, all),
    querySelector: (sel: string) => (opts.dialog && /aria-modal/.test(sel) ? {} : null),
  }
}

test('focusVerdict: focus moves to main unless a dialog is open or the new page focused its own content', () => {
  const link = el('nav-link')
  const field = el('email')
  const oldLink = el('old-link')
  const main = el(MAIN_ID, [field, oldLink])
  assert.equal(focusVerdict(fakeDoc({ main: null })), 'skip', 'no <main> (chromeless page)')
  assert.equal(focusVerdict(fakeDoc({ main, dialog: true, active: link })), 'wait', 'the menu is still closing')
  assert.equal(focusVerdict(fakeDoc({ main, active: link, others: [link] })), 'focus', 'header link keeps focus')
  assert.equal(focusVerdict(fakeDoc({ main })), 'focus', 'focus fell back to <body>')
  assert.equal(focusVerdict(fakeDoc({ main, active: main })), 'focus')
  assert.equal(focusVerdict(fakeDoc({ main, active: field }), null), 'skip', 'an autofocus field of the new page')
  assert.equal(focusVerdict(fakeDoc({ main, active: oldLink }), oldLink), 'focus', 'the old page still mounted during its exit')
})

test('focusPageStart focuses <main>, or the #fragment target inside it, without scrolling', () => {
  const section = el('section-contact')
  const outside = el('elsewhere')
  const main = el(MAIN_ID, [section])
  const doc = fakeDoc({ main, others: [outside] })
  assert.equal(focusPageStart(doc, '/about'), main)
  assert.deepEqual(main.focused, { preventScroll: true })
  assert.equal(focusPageStart(doc, '/#section-contact'), section)
  assert.equal(section.attrs.tabindex, '-1', 'made programmatically focusable')
  assert.deepEqual(section.focused, { preventScroll: true })
  main.focused = null
  assert.equal(focusPageStart(doc, '/#elsewhere'), main, 'a target outside the page content is ignored')
  assert.equal(focusPageStart(fakeDoc({ main: null }), '/x'), null)
})

test('_app moves focus after page changes; dialogs closed by a page change do not return focus to the header', () => {
  assert.match(read('pages/_app.tsx'), /useFocusMainOnPageChange\(router\.events, pageKey\)/)
  const header = read('components/Header/Header.tsx')
  assert.match(header, /returnFocusOnClose=\{dialogsReturnFocus\}/)
  assert.match(header, /if \(leavesPage\) \{\s*setDialogsReturnFocus\(false\)/)
  assert.match(read('components/Header/MobileDrawer.tsx'), /returnFocusOnClose=\{returnFocusOnClose\}/)
  // (followups-3: the palette returns focus itself — components/General-UI/paletteSession.ts —
  // and only when the close hands focus back.)
  const palette = read('components/General-UI/CommandPalette.tsx')
  assert.match(palette, /restores: restoreFocus && returnFocusOnClose/)
  assert.match(palette, /finalFocusRef=\{returnFocusRef\}/)
})

// ── FIX-14: single-character shortcuts can be turned off ──────────────────────

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

const throwing = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

test('the shortcuts preference is on by default and persists "off"', () => {
  const store = memoryStorage()
  assert.equal(readShortcutsPreference(store), true)
  assert.equal(writeShortcutsPreference(store, false), true)
  assert.equal(store.data.get(SHORTCUTS_STORAGE_KEY), 'off')
  assert.equal(readShortcutsPreference(store), false)
  assert.equal(writeShortcutsPreference(store, true), true)
  assert.equal(store.data.has(SHORTCUTS_STORAGE_KEY), false, '"on" is the default: nothing stored')
  assert.equal(readShortcutsPreference(memoryStorage({ [SHORTCUTS_STORAGE_KEY]: 'garbage' })), true)
})

test('blocked storage degrades to "on" and never throws', () => {
  assert.equal(readShortcutsPreference(throwing), true)
  assert.equal(readShortcutsPreference(null), true)
  assert.equal(writeShortcutsPreference(throwing, false), false)
  assert.equal(writeShortcutsPreference(null, false), false)
})

test('keys typed into an IME composition are never shortcuts', () => {
  assert.equal(isImeComposing({ isComposing: true, keyCode: 71 }), true)
  assert.equal(isImeComposing({ isComposing: false, keyCode: 229 }), true)
  assert.equal(isImeComposing({ isComposing: false, keyCode: 71 }), false)
  assert.equal(isImeComposing({}), false)
})

test('the live value notifies subscribers once per change', () => {
  resetShortcutsCache()
  assert.equal(getShortcutsEnabled(), true, 'no storage (server / node): on')
  let calls = 0
  const off = subscribeShortcuts(() => {
    calls += 1
  })
  setShortcutsEnabled(false)
  assert.equal(getShortcutsEnabled(), false)
  setShortcutsEnabled(false)
  assert.equal(calls, 1, 'no change, no notification')
  setShortcutsEnabled(true)
  assert.equal(calls, 2)
  off()
  setShortcutsEnabled(false)
  assert.equal(calls, 2, 'unsubscribed')
  resetShortcutsCache()
})

test('every single-character shortcut checks the preference and IME composition', () => {
  const header = read('components/Header/Header.tsx')
  assert.match(header, /if \(isImeComposing\(e\)\) return/)
  // The single-key layer ("/", "?", "G then …", J / K, [ / ], T): one listener
  // that classifies the key (IME composition, modifiers, fields excluded)
  // and stops unless the visitor has the shortcuts on.
  const layer = read('components/Chrome/KeyboardLayer.tsx')
  assert.match(layer, /const key = layerKeyOf\(e\)\s*if \(!key \|\| !getShortcutsEnabled\(\)/)
  assert.match(read('lib/keyboardLayer.ts'), /if \(e\.isComposing === true \|\| e\.keyCode === 229\) return null/)
  const palette = read('components/General-UI/CommandPalette.tsx')
  assert.match(palette, /id: 'action:shortcuts'/)
  // In the palette's language (lib/uiStrings/palette, F3).
  assert.match(palette, /label: fillUi\(p\.shortcuts, \{ state: shortcutsOn \? p\.on : p\.off \}\)/)
  assert.match(palette, /setShortcutsEnabled\(next\)/)
  const overlay = read('components/Admin/shell/ShortcutsOverlay.tsx')
  assert.match(overlay, /<Switch[\s\S]*isChecked=\{shortcutsOn\}[\s\S]*setShortcutsEnabled\(e\.target\.checked\)/)
  assert.match(overlay, /isImeComposing\(e\)/)
  assert.match(overlay, /!getShortcutsEnabled\(\)/)
  const pill = read('components/Article/EditPill.tsx')
  assert.match(pill, /isImeComposing\(e\)/)
  assert.match(pill, /if \(!getShortcutsEnabled\(\)\) return/)
})
