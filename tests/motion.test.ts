import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  MORPH_ATTR,
  MORPH_PART_ATTR,
  MORPH_TYPE,
  MorphOrigins,
  findMorphElement,
  firstImageIn,
  imageReady,
  inViewport,
  morphKeyOf,
  morphName,
  morphPartsOf,
  nameMorphParts,
  nameMorphTarget,
  parentKeyOf,
  planMorph,
  startMorph,
  type MorphElement,
} from '../lib/viewTransitionMorph'
import { NAV_PROGRESS_ANNOUNCE_MS, NAV_PROGRESS_DELAY_MS, PENDING_LINK_TTL_MS, createNavProgress, pendingLinkOf } from '../lib/navProgress'
import { AUTOHIDE_DELTA, AUTOHIDE_MIN_Y, isLongPage, nextAutoHide, type AutoHideState } from '../lib/readingMotion'
import { KEY_OWNER_SELECTOR, insideKeyOwner, isEditableTarget, layerKeyOf } from '../lib/keyboardLayer'
import { CHORD_MS, anchorIndex, armChord, chordArmed, primaryLinkIndex, stepIndex } from '../lib/keyboardNavigation'
import {
  LAYER_SHORTCUT_ROWS,
  PAGE_TITLES,
  browseItems,
  isPrefetchableHref,
  pageKeyAction,
  searchableItems,
  type PageMember,
} from '../components/General-UI/paletteModel'
import { OPEN_PALETTE_EVENT, normalizePalettePage, openCommandPalette, type OpenPaletteDetail } from '../components/Chrome/paletteEvents'
import { HOVER_MEDIA, createSiteEmotionCache, guardHover } from '../lib/hoverMedia'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

// ── C1: shared-element morphs ───────────────────────────────────────────────

type FakeStyle = { props: Record<string, string>; setProperty(n: string, v: string): void; removeProperty(n: string): void }
type FakeEl = MorphElement & { attrs: Record<string, string>; children: FakeEl[]; rect: { top: number; bottom: number; left: number; right: number; width: number; height: number }; style: FakeStyle; tag: string; complete?: boolean; decode?: () => Promise<unknown> }

const style = (): FakeStyle => {
  const props: Record<string, string> = {}
  return {
    props,
    setProperty: (n, v) => {
      props[n] = v
    },
    removeProperty: (n) => {
      delete props[n]
    },
  }
}

function el(tag: string, attrs: Record<string, string>, top: number, children: FakeEl[] = [], height = 40): FakeEl {
  const self: FakeEl = {
    tag,
    attrs,
    children,
    style: style(),
    rect: { top, bottom: top + height, left: 0, right: 300, width: 300, height },
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
    getBoundingClientRect: () => self.rect,
    querySelectorAll: (sel: string) => {
      const all: FakeEl[] = []
      const walk = (n: FakeEl) => {
        for (const c of n.children) {
          all.push(c)
          walk(c)
        }
      }
      walk(self)
      if (sel === 'img') return all.filter((n) => n.tag === 'img')
      const attr = sel.match(/^\[([\w-]+)\]$/)?.[1]
      return attr ? all.filter((n) => attr in n.attrs) : []
    },
    contains: (other: unknown) => {
      if (other === self) return true
      return self.children.some((c) => c.contains(other))
    },
  }
  return self
}

const root = (children: FakeEl[]) => el('body', {}, 0, children, 4000)
const viewport = { width: 1280, height: 800 }

test('morph keys are decoded pathnames without a trailing slash; detail pages fall back to their collection', () => {
  assert.equal(morphKeyOf('/blog/hello?x=1#top'), '/blog/hello')
  assert.equal(morphKeyOf('/blog/%E4%B8%AD%E6%96%87/'), '/blog/中文')
  assert.equal(morphKeyOf('/'), '/')
  assert.equal(morphKeyOf('/blog/%E4%'), '/blog/%E4%', 'a malformed escape is kept as typed')
  assert.equal(parentKeyOf('/work/swcs'), '/work')
  assert.equal(parentKeyOf('/work'), null)
  assert.equal(morphName('title'), 'vt-morph-title')
  assert.equal(morphName('cover'), 'vt-morph-cover')
  assert.equal(MORPH_TYPE, 'morph')
})

test('only boxes that are on screen take part', () => {
  assert.equal(inViewport({ top: 10, bottom: 50, left: 0, right: 10, width: 10, height: 40 }, viewport), true)
  assert.equal(inViewport({ top: 900, bottom: 950, left: 0, right: 10, width: 10, height: 50 }, viewport), false)
  assert.equal(inViewport({ top: -60, bottom: -10, left: 0, right: 10, width: 10, height: 50 }, viewport), false)
  assert.equal(inViewport({ top: 10, bottom: 10, left: 0, right: 0, width: 0, height: 0 }, viewport), false, 'display: none')
})

test('the clicked card wins when two cards stand for the same page; otherwise the first on screen', () => {
  const titleA = el('span', { [MORPH_PART_ATTR]: 'title' }, 100)
  const a = el('li', { [MORPH_ATTR]: '/blog/x' }, 100, [titleA])
  const titleB = el('span', { [MORPH_PART_ATTR]: 'title' }, 300)
  const b = el('li', { [MORPH_ATTR]: '/blog/x/' }, 300, [titleB])
  const off = el('li', { [MORPH_ATTR]: '/blog/y' }, 2000)
  const doc = root([a, b, off])
  assert.equal(findMorphElement(doc, '/blog/x', viewport), a)
  assert.equal(findMorphElement(doc, '/blog/x', viewport, titleB), b)
  assert.equal(findMorphElement(doc, '/blog/y', viewport), null, 'off screen')
  assert.equal(findMorphElement(null, '/blog/x', viewport), null)
})

test('parts: the first title and cover on screen; naming and clearing are exact and idempotent', () => {
  const cover = el('div', { [MORPH_PART_ATTR]: 'cover' }, 100, [el('img', {}, 100)])
  const title = el('h2', { [MORPH_PART_ATTR]: 'title' }, 300)
  const stray = el('span', { [MORPH_PART_ATTR]: 'subtitle' }, 340)
  const card = el('article', { [MORPH_ATTR]: '/work/a' }, 100, [cover, title, stray], 400)
  const parts = morphPartsOf(card, viewport)
  assert.deepEqual([...parts.keys()], ['cover', 'title'])
  const named = nameMorphParts(parts, ['title'])
  assert.deepEqual(named.parts, ['title'])
  assert.equal(title.style.props['view-transition-name'], 'vt-morph-title')
  assert.equal(cover.style.props['view-transition-name'], undefined, 'restricted to the other side\'s parts')
  named.clear()
  named.clear()
  assert.equal(title.style.props['view-transition-name'], undefined)
  assert.equal(firstImageIn(cover), cover.children[0])
  assert.equal(firstImageIn(title), title)
})

test('planMorph: a card for the destination opens; leaving a detail page flies back to where it was opened from', () => {
  const origins = new MorphOrigins()
  const card = el('li', { [MORPH_ATTR]: '/blog/x' }, 100, [el('span', { [MORPH_PART_ATTR]: 'title' }, 100)])
  const list = root([card])
  const open = planMorph(list, '/blog', '/blog/x', viewport, origins)
  assert.equal(open?.kind, 'open')
  assert.equal(open?.source, card)

  const article = el('article', { [MORPH_ATTR]: '/blog/x' }, 80, [el('h1', { [MORPH_PART_ATTR]: 'title' }, 120)], 2000)
  const detail = root([article])
  // Not recorded: the collection is the way home.
  assert.equal(planMorph(detail, '/blog/x', '/blog', viewport, origins)?.kind, 'return')
  assert.equal(planMorph(detail, '/blog/x', '/', viewport, origins), null, 'home was not where it came from')
  origins.record('/blog/x', '/')
  assert.equal(planMorph(detail, '/blog/x', '/', viewport, origins)?.kind, 'return')
  assert.equal(planMorph(detail, '/blog/x', '/about', viewport, origins), null)
  assert.equal(planMorph(detail, '/blog/x', '/blog/x', viewport, origins), null, 'same page')
})

test('startMorph names the source before the old snapshot, the target after the commit, and clears both', async () => {
  const origins = new MorphOrigins()
  const cardTitle = el('span', { [MORPH_PART_ATTR]: 'title' }, 100)
  const card = el('li', { [MORPH_ATTR]: '/blog/x' }, 100, [cardTitle])
  const list = root([card])
  assert.equal(startMorph(list, '/blog', '/blog/y', viewport, origins), null, 'no card for the destination')
  const active = startMorph(list, '/', '/blog/x?ref=home', viewport, origins)
  assert.ok(active)
  assert.equal(cardTitle.style.props['view-transition-name'], 'vt-morph-title')
  assert.equal(origins.returnTarget('/blog/x'), '/', 'Back from it flies home')
  active.snapshotTaken()
  assert.equal(cardTitle.style.props['view-transition-name'], undefined)
  // React committed the post: its title takes the name.
  const h1 = el('h1', { [MORPH_PART_ATTR]: 'title' }, 120)
  list.children.splice(0, 1, el('article', { [MORPH_ATTR]: '/blog/x' }, 80, [h1], 2000))
  await active.nameTarget()
  assert.equal(h1.style.props['view-transition-name'], 'vt-morph-title')
  active.done()
  active.done()
  assert.equal(h1.style.props['view-transition-name'], undefined)
  // A card without a part on screen does not morph.
  const bare = root([el('li', { [MORPH_ATTR]: '/blog/z' }, 100)])
  assert.equal(startMorph(bare, '/blog', '/blog/z', viewport, origins), null)
})

test('MorphOrigins keeps the newest 50 detail pages', () => {
  const origins = new MorphOrigins()
  for (let i = 0; i < 60; i++) origins.record(`/blog/p${i}`, '/')
  assert.equal(origins.returnTarget('/blog/p59'), '/')
  assert.equal(origins.returnTarget('/blog/p0'), '/blog', 'evicted: falls back to the collection')
})

test('the incoming cover is awaited (bounded) before the new snapshot; nothing else waits', async () => {
  let decoded = false
  const img = { complete: false, decode: () => new Promise<void>((r) => setTimeout(() => ((decoded = true), r()), 5)) }
  await imageReady(img, 1000)
  assert.equal(decoded, true)
  const never = { complete: false, decode: () => new Promise(() => undefined) }
  const t0 = Date.now()
  await imageReady(never, 30)
  assert.ok(Date.now() - t0 < 500, 'bounded')
  await imageReady({ complete: true }, 10)
  await imageReady(null, 10)

  const page = root([el('article', { [MORPH_ATTR]: '/work/a' }, 0, [el('h1', { [MORPH_PART_ATTR]: 'title' }, 100), el('div', { [MORPH_PART_ATTR]: 'cover' }, 300, [el('img', {}, 300)])], 900)])
  const named = await nameMorphTarget(page, '/work/a', ['title'], viewport)
  assert.deepEqual(named?.parts, ['title'], 'only what the old side named')
  assert.equal(await nameMorphTarget(page, '/work/b', ['title'], viewport), null)
  assert.equal(await nameMorphTarget(page, '/work/a', [], viewport), null)
})

test('the morph code is a chunk of its own, loaded when idle or at the first press', () => {
  const src = read('components/Chrome/RouteTransitions.tsx')
  assert.match(src, /import\('\.\.\/\.\.\/lib\/viewTransitionMorph'\)/)
  assert.match(src, /requestIdleCallback\(loadMorph/)
  assert.match(src, /addEventListener\('pointerdown', loadMorph/)
  assert.doesNotMatch(src, /^import \{[^}]*\} from '\.\.\/\.\.\/lib\/viewTransitionMorph'/m, 'only types are imported statically')
  assert.match(src, /morph && !layers\.count \? morph\.lib\.startMorph/, 'nothing morphs from under an open overlay')
  assert.match(src, /active \? 'morph' : null/)
})

test('no element carries a morph name in the markup (names exist only during one transition)', () => {
  for (const file of ['pages/blog/index.tsx', 'pages/blog/[slug].tsx', 'pages/work/index.tsx', 'pages/work/[slug].tsx', 'components/Work/CoverFrame.tsx', 'components/General-UI/PageHeader.tsx', 'components/LandingPage/ProjectSpotlight.tsx', 'components/LandingPage/LatestWriting.tsx', 'components/Now/NowSignals.tsx']) {
    const src = read(file)
    assert.doesNotMatch(src, /viewTransitionName/, file)
    assert.doesNotMatch(src, /vt-(blog|work)-/, file)
  }
})

test('globals.css: fade-through root, morphs styled by name, morph pages fade, cross-document opt-in only with motion', () => {
  const css = read('styles/globals.css')
  assert.match(css, /::view-transition-old\(root\)\s*\{\s*animation:[^}]*vt-fade-out/)
  assert.match(css, /::view-transition-new\(root\)\s*\{\s*animation:[^}]*calc\(var\(--vt-route\) \* 0\.3\) both vt-fade-in/)
  assert.match(css, /::view-transition-old\(vt-morph-title\),\s*::view-transition-new\(vt-morph-title\)\s*\{[^}]*object-fit:\s*none/)
  assert.match(css, /::view-transition-old\(vt-morph-cover\)\s*\{\s*animation:\s*none/)
  assert.match(css, /html:active-view-transition-type\(morph\)::view-transition-old\(root\)\s*\{[^}]*vt-fade-out/)
  assert.match(css, /html:active-view-transition-type\(morph\)\s*\{\s*--vt-route:\s*var\(--duration-slow\)/)
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*@view-transition\s*\{\s*navigation:\s*auto/)
  assert.match(css, /::view-transition\s*\{\s*background-color:\s*var\(--chakra-colors-page-bg\)/)
})

// ── C2: slow-navigation feedback ────────────────────────────────────────────

function fakeTimers() {
  let now = 0
  let seq = 0
  const pending = new Map<number, { at: number; fn: () => void }>()
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        const id = ++seq
        pending.set(id, { at: now + ms, fn })
        return id
      },
      clear: (h: unknown) => {
        pending.delete(h as number)
      },
    },
    advance(ms: number) {
      const end = now + ms
      for (;;) {
        const next = [...pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        pending.delete(next[0])
        now = next[1].at
        next[1].fn()
      }
      now = end
    },
  }
}

test('a fast navigation shows nothing; a slow one shows the bar after 150 ms and is announced after 1 s', () => {
  assert.equal(NAV_PROGRESS_DELAY_MS, 150)
  assert.ok(NAV_PROGRESS_ANNOUNCE_MS >= 1000)
  const log: string[] = []
  const clock = fakeTimers()
  const p = createNavProgress({ show: () => log.push('show'), announce: () => log.push('announce'), hide: () => log.push('hide') }, clock.timers)

  p.start()
  clock.advance(149)
  p.finish()
  clock.advance(5000)
  assert.deepEqual(log, [], 'fast: no flicker, nothing to hide')

  p.start()
  clock.advance(150)
  assert.deepEqual(log, ['show'])
  assert.equal(p.visible, true)
  clock.advance(NAV_PROGRESS_ANNOUNCE_MS - 150)
  assert.deepEqual(log, ['show', 'announce'])
  // A newer navigation keeps the bar up without showing it twice.
  p.start()
  clock.advance(2000)
  assert.deepEqual(log, ['show', 'announce'])
  p.finish()
  assert.deepEqual(log, ['show', 'announce', 'hide'])
  assert.equal(p.visible, false)
})

test('the pending link is the recently clicked one only', () => {
  assert.equal(pendingLinkOf('a', 1000, 1000 + PENDING_LINK_TTL_MS), 'a')
  assert.equal(pendingLinkOf('a', 1000, 1001 + PENDING_LINK_TTL_MS), null)
  assert.equal(pendingLinkOf(null, 1000, 1000), null)
})

test('NavProgress: hidden before any snapshot, inside the header snapshot, a status for screen readers', () => {
  const src = read('components/Chrome/NavProgress.tsx')
  assert.match(src, /events\.on\('beforeHistoryChange', finish\)/)
  assert.match(src, /aria-busy/)
  assert.match(src, /role="status"/)
  assert.match(read('components/Chrome/SiteChrome.tsx'), /<NavProgress \/>[\s\S]*<\/Box>/)
  const css = read('styles/globals.css')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.nav-progress::before,[\s\S]*?animation:\s*none !important/)
})

// ── C5: command palette 4.0 ─────────────────────────────────────────────────

type It = PageMember & { id: string }
const items: It[] = [
  { id: 'page:/' },
  { id: 'open:theme', opens: 'theme' },
  { id: 'theme-dark', page: 'theme' },
  { id: 'cv:view', page: 'cv', nestedOnly: true },
  { id: 'cv-pdf', page: 'cv' },
  { id: 'shortcuts:toggle', page: 'shortcuts', nestedOnly: true },
]

test('nested pages: the browse view hides their items, a search from the top still finds them (not page-only repeats)', () => {
  assert.deepEqual(browseItems(items, null).map((i) => i.id), ['page:/', 'open:theme'])
  assert.deepEqual(browseItems(items, 'cv').map((i) => i.id), ['cv:view', 'cv-pdf'])
  assert.deepEqual(searchableItems(items, null).map((i) => i.id), ['page:/', 'open:theme', 'theme-dark', 'cv-pdf'])
  assert.deepEqual(searchableItems(items, 'shortcuts').map((i) => i.id), ['shortcuts:toggle'])
  assert.deepEqual(Object.keys(PAGE_TITLES), ['theme', 'cv', 'contact', 'shortcuts'])
})

test('Escape, or Backspace in an empty field, leaves a nested page; nothing special at the top', () => {
  assert.equal(pageKeyAction('Escape', 'abc', 'theme'), 'back')
  assert.equal(pageKeyAction('Backspace', '', 'cv'), 'back')
  assert.equal(pageKeyAction('Backspace', 'x', 'cv'), null)
  assert.equal(pageKeyAction('Escape', '', null), null, 'Escape at the top closes the dialog')
  assert.equal(pageKeyAction('ArrowDown', '', 'cv'), null)
})

test('only same-site pages are prefetched (no API, admin, files or other sites)', () => {
  assert.equal(isPrefetchableHref('/blog/x'), true)
  assert.equal(isPrefetchableHref('/cv'), true)
  assert.equal(isPrefetchableHref('/work/x', true), false)
  assert.equal(isPrefetchableHref('https://example.com'), false)
  assert.equal(isPrefetchableHref('//example.com/x'), false)
  for (const href of ['/api/vcard', '/admin/dashboard?tab=inbox', '/feed.xml', '/cv.pdf', '/admin']) assert.equal(isPrefetchableHref(href), false, href)
  assert.equal(isPrefetchableHref(undefined), false)
})

test('the palette opens instantly from the keyboard, defers its rows, and has no full-screen blur on touch screens', () => {
  const src = read('components/General-UI/CommandPalette.tsx')
  assert.match(src, /instant \|\| reduceMotion\s*\?\s*undefined/)
  assert.match(src, /useDeferredValue\(query\)/)
  assert.match(src, /listReady \? computeRows\(q, subpage\) : \{ rows: \[\], total: 0 \}/)
  // Enter never opens a stale row: a lagging ranking is redone for the field's text.
  assert.match(src, /if \(live !== q \|\| !listReady\) runItem\(computeRows\(live, subpage\)\.rows\[0\]\?\.item\)/)
  assert.match(src, /'@media \(hover: hover\) and \(pointer: fine\)': \{ backdropFilter: 'blur\(12px\)' \}/)
  assert.doesNotMatch(src, /<ModalOverlay backdropFilter=/)
  const header = read('components/Header/Header.tsx')
  assert.match(header, /openPalette\('', \{ instant: true \}\)/)
  assert.match(header, /instant=\{paletteInstant\}/)
  assert.ok(LAYER_SHORTCUT_ROWS.some((r) => r.keys.includes('J')))
})

test('"?" asks for the Keyboard shortcuts page; nothing else can be opened from outside', () => {
  assert.equal(normalizePalettePage('shortcuts'), 'shortcuts')
  assert.equal(normalizePalettePage('theme'), null)
  assert.equal(normalizePalettePage({}), null)
  const g = globalThis as unknown as { window?: EventTarget }
  const had = 'window' in g
  const target = new EventTarget()
  g.window = target
  try {
    let detail: OpenPaletteDetail | null = null
    target.addEventListener(OPEN_PALETTE_EVENT, (e) => {
      detail = (e as CustomEvent<OpenPaletteDetail>).detail
    })
    openCommandPalette('  hello\nworld ', { page: 'shortcuts', instant: true })
    assert.deepEqual(detail, { query: 'hello world', page: 'shortcuts', instant: true })
    openCommandPalette()
    assert.deepEqual(detail, { query: '', page: null, instant: false })
  } finally {
    if (had) g.window = target
    else delete g.window
  }
})

// ── C6: touch press feedback, no sticky hover ───────────────────────────────

test('hover rules move into @media (hover:hover), once; everything else is untouched', () => {
  assert.equal(guardHover('.a{color:red;}.a:hover{color:blue;}'), `.a{color:red;}${HOVER_MEDIA}{.a:hover{color:blue;}}`)
  assert.equal(guardHover('[role=group]:hover .b,.c[data-hover]{x:y;}'), `${HOVER_MEDIA}{[role=group]:hover .b,.c[data-hover]{x:y;}}`)
  assert.equal(guardHover('@media (hover: hover) and (pointer: fine){.d:hover{a:b;}}'), '@media (hover: hover) and (pointer: fine){.d:hover{a:b;}}', 'already guarded')
  assert.equal(
    guardHover('@media (min-width:48em){.e{a:b;}.e:hover{-webkit-user-select:none;user-select:none;}}'),
    `@media (min-width:48em){.e{a:b;}${HOVER_MEDIA}{.e:hover{-webkit-user-select:none;user-select:none;}}}`,
  )
  assert.equal(guardHover('@supports (x:y){@media print{.f:hover{a:b;}}}'), `@supports (x:y){@media print{${HOVER_MEDIA}{.f:hover{a:b;}}}}`)
  assert.equal(guardHover('.g:focus-visible{outline:none;}'), '.g:focus-visible{outline:none;}')
  assert.equal(guardHover('@keyframes k{0%{opacity:0;}}.h:hover{a:b;}'), `@keyframes k{0%{opacity:0;}}${HOVER_MEDIA}{.h:hover{a:b;}}`)
  assert.equal(guardHover('.i:hover::after{content:"{:hover}";}'), `${HOVER_MEDIA}{.i:hover::after{content:"{:hover}";}}`, 'braces in strings')
  assert.equal(guardHover('.j{content:"a:hover";}'), '.j{content:"a:hover";}', ':hover in a value is not a selector')
  assert.equal(guardHover(''), '')
})

test('the site Emotion cache renders hover styles inside the media query (server render and browser sheets)', () => {
  const cache = createSiteEmotionCache()
  assert.equal(cache.key, 'css')
  const styles = (s: string) => ({ name: s.length.toString(36), styles: s, next: undefined, map: undefined }) as never
  const rules = cache.insert('.css-x', styles('color:red;&:hover{color:blue;user-select:none;}'), cache.sheet, true)
  assert.equal(rules, `.css-x{color:red;}${HOVER_MEDIA}{.css-x:hover{color:blue;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;}}`, 'Emotion still prefixes')
  // In the browser Emotion inserts rule by rule into a sheet (its own or a <Global>'s).
  const inserted: string[] = []
  const sheet = { insert: (rule: string) => inserted.push(rule) }
  sheet.insert('.css-y:hover{a:b;}')
  const wrapped = cache.insert as unknown as (sel: string, ser: unknown, sh: unknown, cacheIt: boolean) => unknown
  wrapped('.css-z', styles('a:b;'), sheet, false)
  sheet.insert('.css-w:hover{c:d;}')
  assert.deepEqual(inserted, ['.css-y:hover{a:b;}', `${HOVER_MEDIA}{.css-w:hover{c:d;}}`], 'the sheet is guarded from its first use on')
})

test('globals.css: no grey tap flash, press feedback on touch only, hover effects behind (hover: hover)', () => {
  const css = read('styles/globals.css')
  assert.match(css, /html\s*\{\s*-webkit-tap-highlight-color:\s*transparent/)
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)\s*\{\s*html \.pressable\s*\{/)
  assert.match(css, /html \.pressable:active\s*\{[^}]*transition-delay:\s*40ms/)
  // No bare :hover effect outside a (hover: hover) query in the shared helpers.
  for (const sel of ['.link-underline:hover', 'a:hover .nudge', '.hint-wrap:hover .hint']) {
    const at = css.indexOf(sel)
    assert.ok(at > 0, sel)
    const before = css.slice(Math.max(0, at - 200), at)
    assert.match(before, /@media \(hover: hover\)\s*\{[^}]*$/, `${sel} is guarded`)
  }
  assert.match(css, /html \.scroll-top\[data-visible='true'\]\s*\{[^}]*visibility:\s*visible/)
})

// ── C7: reading micro-motion ────────────────────────────────────────────────

test('the header tucks away after reading down a little, returns on the first scroll up, never near the top or on short pages', () => {
  let s: AutoHideState = { hidden: false, anchorY: 0 }
  s = nextAutoHide(s, AUTOHIDE_MIN_Y + 20, true)
  assert.equal(s.hidden, true, 'reading down past the top')
  s = nextAutoHide(s, AUTOHIDE_MIN_Y + 400, true)
  assert.equal(s.hidden, true)
  s = nextAutoHide(s, AUTOHIDE_MIN_Y + 400 - AUTOHIDE_DELTA + 1, true)
  assert.equal(s.hidden, true, 'a tremor up is ignored')
  s = nextAutoHide(s, AUTOHIDE_MIN_Y + 400 - AUTOHIDE_DELTA - 1, true)
  assert.equal(s.hidden, false, 'scrolling up brings it back')
  s = nextAutoHide(s, AUTOHIDE_MIN_Y + 400 - AUTOHIDE_DELTA - 1 + AUTOHIDE_DELTA - 1, true)
  assert.equal(s.hidden, false, 'a tremor down is ignored')
  s = nextAutoHide({ hidden: true, anchorY: 900 }, 20, true)
  assert.equal(s.hidden, false, 'near the top')
  s = nextAutoHide({ hidden: true, anchorY: 300 }, 900, false)
  assert.equal(s.hidden, false, 'short page')
  const same = { hidden: false, anchorY: 50 }
  assert.equal(nextAutoHide(same, 50, true), same, 'no change keeps the object')
  assert.equal(isLongPage(3000, 1000), true)
  assert.equal(isLongPage(2999, 1000), false)
  assert.equal(isLongPage(3000, 0), false)
})

test('globals.css: the header hairline comes in once it is stuck; auto-hide spares dialogs, the open outline, loading and focus', () => {
  const css = read('styles/globals.css')
  assert.match(css, /@supports \(container-type: scroll-state\)\s*\{\s*\.site-header-sticky\s*\{\s*container-type:\s*scroll-state/)
  assert.match(css, /@container scroll-state\(stuck: top\)\s*\{\s*html \.site-header\s*\{[^}]*border-bottom-color:\s*var\(--chakra-colors-page-border\)/)
  assert.match(
    css,
    /html\[data-header-hidden\]:not\(:has\(\[aria-modal='true'\], \.nav-progress\[data-state='loading'\], \[data-toc-open='true'\]\)\)\s*\.site-header-sticky:not\(:focus-within\)/,
  )
  assert.match(css, /\.toc-marker\[data-ready\]\s*\{\s*transition:[^}]*transform var\(--duration-base\)/)
  assert.match(read('components/Article/TableOfContents.tsx'), /--toc-y/)
})

// ── C9: visitor keyboard layer ──────────────────────────────────────────────

const key = (k: string, extra: Record<string, unknown> = {}) => ({ key: k, target: { tagName: 'BODY', closest: () => null }, ...extra })

test('layer keys: the listed characters; nothing with a modifier, in a field, in a widget, while composing', () => {
  for (const k of ['/', '?', 'g', 'j', 'k', '[', ']', 't']) assert.equal(layerKeyOf(key(k)), k)
  assert.equal(layerKeyOf(key('h')), 'other', 'the second key of a chord')
  assert.equal(layerKeyOf(key('Enter')), null)
  assert.equal(layerKeyOf(key('J')), 'other', 'Shift+J is not J')
  assert.equal(layerKeyOf(key('j', { metaKey: true })), null)
  assert.equal(layerKeyOf(key('j', { ctrlKey: true })), null)
  assert.equal(layerKeyOf(key('j', { altKey: true })), null)
  assert.equal(layerKeyOf(key('j', { defaultPrevented: true })), null)
  assert.equal(layerKeyOf(key('j', { isComposing: true })), null)
  assert.equal(layerKeyOf(key('j', { keyCode: 229 })), null)
  assert.equal(layerKeyOf(key('j', { target: { tagName: 'INPUT' } })), null)
  assert.equal(layerKeyOf(key('j', { target: { tagName: 'DIV', isContentEditable: true } })), null)
  assert.equal(layerKeyOf(key('j', { target: { tagName: 'BUTTON', closest: (s: string) => (s === KEY_OWNER_SELECTOR ? {} : null) } })), null)
  assert.equal(layerKeyOf(key('j', { repeat: true })), 'j', 'holding J keeps moving')
  assert.equal(layerKeyOf(key('g', { repeat: true })), null)
  assert.equal(isEditableTarget({ tagName: 'TEXTAREA' }), true)
  assert.equal(isEditableTarget(null), false)
  assert.equal(insideKeyOwner({ closest: () => { throw new Error('bad selector') } }), false)
})

test('"G then …" waits 1.2 s for its second key', () => {
  const c = armChord(1000)
  assert.equal(chordArmed(c, 1000 + CHORD_MS - 1), true)
  assert.equal(chordArmed(c, 1000 + CHORD_MS), false)
  assert.equal(chordArmed(null, 0), false)
})

test('J / K: start from what is on screen, then step without wrapping', () => {
  const boxes = [
    { top: -300, bottom: -200 },
    { top: -100, bottom: 40 },
    { top: 60, bottom: 200 },
    { top: 220, bottom: 400 },
  ]
  // The second item ends under a 56px header: reading starts at the third.
  assert.equal(anchorIndex(boxes, 56), 2)
  assert.equal(anchorIndex(boxes, -1000), 0)
  assert.equal(anchorIndex(boxes, 5000), 4, 'the list is above the viewport')
  assert.equal(stepIndex(-1, 2, 4, 1), 2, 'J takes the first item in view')
  assert.equal(stepIndex(-1, 2, 4, -1), 1, 'K the one before it')
  assert.equal(stepIndex(-1, 0, 4, -1), 0)
  assert.equal(stepIndex(-1, 4, 4, 1), 3)
  assert.equal(stepIndex(1, 0, 4, 1), 2)
  assert.equal(stepIndex(3, 0, 4, 1), 3, 'no wrap at the end')
  assert.equal(stepIndex(0, 0, 4, -1), 0, 'no wrap at the start')
  assert.equal(stepIndex(-1, 0, 0, 1), -1, 'empty list')
})

test('J / K focus the link that opens the item', () => {
  assert.equal(primaryLinkIndex(['/repo', '/work/a'], '/work/a'), 1)
  assert.equal(primaryLinkIndex(['/x', '/y'], '/work/a'), 0)
  assert.equal(primaryLinkIndex(['/x'], null), 0)
  assert.equal(primaryLinkIndex([], '/work/a'), -1)
})

test('the layer is wired: single keys live in the layer (lazy actions), ⌘K stays in the header', () => {
  const header = read('components/Header/Header.tsx')
  assert.doesNotMatch(header, /shortcutTarget|armedUntil/, 'no single-key handling left in the header')
  const layer = read('components/Chrome/KeyboardLayer.tsx')
  assert.match(layer, /import\('\.\/keyboardLayerActions'\)/)
  assert.match(layer, /getShortcutsEnabled\(\)/)
  assert.match(read('components/Chrome/SiteChrome.tsx'), /<KeyboardLayer \/>/)
  for (const file of ['pages/blog/index.tsx', 'pages/work/index.tsx', 'pages/publications.tsx']) assert.match(read(file), /data-kbd-item=""/, file)
  assert.match(read('components/Header/ThemeControl.tsx'), /data-theme-toggle=""/)
})
