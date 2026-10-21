/**
 * Review round 2 fixes (stream review-fixes-r2):
 *   UX-A-1  toasts sit above a page's sticky bottom bar; the scroll-to-top
 *           button moves above bottom toasts on narrow screens
 *   UX-A-2  "Ask Lucian"'s words carry their language (zh-Hans)
 *   UX-A-3  focus moves into the page once a dialog's trap lets go; the
 *           contact form claims a handed-over question
 *   UX-A-4  a hardware keyboard on a touch screen brings the key hints back
 *   UX-A-5  the admin lists' j / k work from a clicked panel
 *   UX-A-6 / UX-A-7 / VISU-5  contrast-safe tokens for admin controls and text
 *   UX-A-8  a table wider than its box is a focusable, labelled region
 *   VISU-1 / VISU-2  small covers morph as panel + logo; morph fades retimed
 *   OPS-2   one process-wide queue for image encoding
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import { TOAST_BOTTOM, TOAST_STACK_VAR, toastListStyle } from '../components/Chrome/toastWatch'
import { ASK_COPY, askCopyFor } from '../lib/ask/copy'
import { focusUntilItSticks, type FocusEnv } from '../lib/focusAfterDialog'
import { CONTACT_PREFILL_EVENT, stashContactQuestion } from '../lib/contactPrefill'
import { HIDE_ON_COARSE_POINTER, KEYBOARD_ATTR } from '../components/Chrome/platform'
import { isHardwareKeyEvent } from '../components/Chrome/hardwareKeyboard'
import { isNowhereTarget } from '../components/Admin/shell/listKeys'
import { semanticColors } from '../theme/color'
import { ADMIN_COMPONENT_STYLES, ADMIN_GLOBAL_CSS, CONTROL_BORDER } from '../theme/adminComponents'
import { overflowsX, scrollRegionProps } from '../components/Admin/shell/scrollRegion'
import { MORPH_PARTS, MORPH_PART_ATTR, morphName, nameMorphTarget, MORPH_ATTR, type MorphElement } from '../lib/viewTransitionMorph'
import { ImageQueueFullError, JobQueue, envInt, imageJobs } from '../lib/imageJobs'

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ── UX-A-1 ──────────────────────────────────────────────────────────────────

test('UX-A-1: bottom toasts sit above a sticky bottom bar (its height includes the safe area), else above the safe area', () => {
  assert.equal(TOAST_BOTTOM, 'var(--bottom-bar-h, env(safe-area-inset-bottom, 0px))')
  for (const p of ['bottom', 'bottom-left', 'bottom-right'] as const) assert.equal(toastListStyle(p).bottom, TOAST_BOTTOM)
  assert.equal(toastListStyle('top').top, 'env(safe-area-inset-top, 0px)')
  assert.equal(toastListStyle('top').bottom, undefined)
  // The host publishes the bottom stack's height; the scroll-to-top button reads it on narrow screens.
  assert.equal(TOAST_STACK_VAR, '--toast-stack-h')
  const host = read('components/Chrome/ToastHost.tsx')
  assert.match(host, /setProperty\(TOAST_STACK_VAR/)
  assert.match(host, /removeProperty\(TOAST_STACK_VAR\)/)
  const css = read('styles/globals.css')
  assert.match(css, /@media \(max-width: 47\.99em\)\s*\{\s*html \.scroll-top\s*\{\s*translate:\s*0 calc\(-1 \* var\(--toast-stack-h, 0px\)\)/)
})

// ── UX-A-2 ──────────────────────────────────────────────────────────────────

test('UX-A-2: the Ask copy carries its BCP-47 language; Chinese is zh-Hans', () => {
  assert.equal(ASK_COPY.en.lang, 'en')
  assert.equal(ASK_COPY.zh.lang, 'zh-Hans')
  assert.equal(askCopyFor('他会弹钢琴吗？', 'en').lang, 'zh-Hans')
  assert.equal(askCopyFor('Does he play the piano?', 'zh-Hans').lang, 'en')
  const view = read('components/Search/AskView.tsx')
  // Every view root of AskView speaks the copy's language (failed, loading, intro / vague, none, answer).
  assert.ok((view.match(/lang=\{copy\.lang\}/g) || []).length >= 6, 'view roots and option rows carry lang={copy.lang}')
  const palette = read('components/General-UI/CommandPalette.tsx')
  // F3: the palette speaks the page's language; a question in the other language is marked.
  assert.match(palette, /role="status"[^>]*lang=\{asking && askCopy\.lang !== askPage\.lang \? askCopy\.lang : undefined\}/)
  assert.match(palette, /uiLang: copy\.lang === askPage\.lang \? undefined : copy\.lang/)
})

// ── UX-A-3 ──────────────────────────────────────────────────────────────────

function fakeFocus(trapFrames: number) {
  // A focus trap that pulls focus back for `trapFrames` frames.
  let active: unknown = 'combobox'
  let frames = 0
  const queue: Array<() => void> = []
  const target = {
    focusCalls: 0,
    prepared: 0,
    isConnected: true,
    focus() {
      target.focusCalls++
      active = frames < trapFrames ? 'combobox' : target
    },
  }
  const env: FocusEnv = { frame: (cb) => queue.push(cb), active: () => active }
  const flush = () => {
    while (queue.length) {
      frames++
      queue.shift()!()
    }
  }
  return { target, env, flush }
}

test('UX-A-3: focus is retried each frame until the trap lets go; it gives up after the attempts', () => {
  const ok = fakeFocus(2)
  let settled: boolean | null = null
  focusUntilItSticks(ok.target, { prepare: () => ok.target.prepared++, onSettled: (s) => (settled = s) }, ok.env)
  ok.flush()
  assert.equal(settled, true)
  assert.equal(ok.target.focusCalls, 3, 'twice pulled back, the third try stays')
  assert.equal(ok.target.prepared, 3, 'prepared before every try')

  const stuck = fakeFocus(100)
  settled = null
  focusUntilItSticks(stuck.target, { attempts: 4, onSettled: (s) => (settled = s) }, stuck.env)
  stuck.flush()
  assert.equal(settled, false)
  assert.equal(stuck.target.focusCalls, 4)

  settled = null
  focusUntilItSticks({ focus: () => assert.fail('never focused'), isConnected: false }, { onSettled: (s) => (settled = s) }, ok.env)
  assert.equal(settled, false, 'a target that left the page')
})

test('UX-A-3: a mounted contact form claims the handed-over question; otherwise it waits in the draft', () => {
  const g = globalThis as unknown as { window?: unknown }
  const prev = g.window
  const store = new Map<string, string>()
  const win = Object.assign(new EventTarget(), {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  })
  g.window = win
  try {
    assert.equal(stashContactQuestion('   '), false)
    assert.equal(stashContactQuestion('Does he collect stamps?'), 'draft')
    const claim = (e: Event) => e.preventDefault()
    win.addEventListener(CONTACT_PREFILL_EVENT, claim)
    assert.equal(stashContactQuestion('Does he collect stamps?'), 'form')
    win.removeEventListener(CONTACT_PREFILL_EVENT, claim)
    assert.match(store.get('contact_draft') || '', /collect stamps/)
  } finally {
    g.window = prev
  }
  const form = read('components/Contact/ContactPro.tsx')
  assert.match(form, /e\.preventDefault\(\)/)
  assert.match(form, /focusUntilItSticks\(messageRef\.current/)
  assert.match(form, /aria-live="polite" className="sr-only" data-prefill-note/)
  const citation = read('components/Search/citation.ts')
  assert.match(citation, /focusUntilItSticks\(el, \{ preventScroll: true, prepare \}\)/)
})

// ── UX-A-4 ──────────────────────────────────────────────────────────────────

test('UX-A-4: only a hardware keyboard makes the key hints come back on a touch screen', () => {
  const field = { tagName: 'INPUT' }
  const body = { tagName: 'BODY' }
  assert.equal(isHardwareKeyEvent({ key: '?', target: body }), true, 'a key outside a text field: no on-screen keyboard is open')
  assert.equal(isHardwareKeyEvent({ key: 'a', target: field }), false, 'typing in a field may be the on-screen keyboard')
  assert.equal(isHardwareKeyEvent({ key: 'k', metaKey: true, target: field }), true, '⌘K')
  assert.equal(isHardwareKeyEvent({ key: 'Tab', target: field }), true)
  assert.equal(isHardwareKeyEvent({ key: 'Unidentified', target: body }), false)
  assert.equal(isHardwareKeyEvent({ key: 'a', keyCode: 229, target: body }), false, 'IME composition')
  assert.equal(isHardwareKeyEvent({ key: 'a', isComposing: true, target: body }), false)
  assert.equal(KEYBOARD_ATTR, 'data-keyboard')
  assert.deepEqual(HIDE_ON_COARSE_POINTER, { '@media (pointer: coarse)': { 'html:not([data-keyboard]) &': { display: 'none !important' } } })
  assert.match(read('components/Chrome/KeyboardLayer.tsx'), /noteKeyboardUse\(e\)\s*\n\s*const key = layerKeyOf\(e\)/)
  assert.match(read('components/General-UI/CommandPalette.tsx'), /setKeyboardLikely\(!window\.matchMedia\(COARSE_POINTER_QUERY\)\.matches \|\| keyboardSeen\(\)\)/)
})

// ── UX-A-5 ──────────────────────────────────────────────────────────────────

type FakeNode = { id?: string; tagName: string; role?: string; tabindex?: string; parent?: FakeNode; matches(sel: string): boolean; closest(sel: string): unknown }

function node(tagName: string, attrs: { id?: string; role?: string; tabindex?: string } = {}, parent?: FakeNode): FakeNode {
  const self: FakeNode = {
    ...attrs,
    tagName,
    parent,
    matches(sel: string) {
      return sel.split(',').some((part) => {
        const s = part.trim()
        const tag = s.match(/^([a-z]+)/)?.[1]
        if (tag && tag.toUpperCase() !== self.tagName) return false
        for (const [, name, value] of s.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
          const v = name === 'role' ? self.role : name === 'tabindex' ? self.tabindex : name === 'href' && self.tagName === 'A' ? '/x' : undefined
          if (v === undefined || (value !== undefined && v !== value)) return false
        }
        return !!tag || /\[/.test(s)
      })
    },
    closest(sel: string) {
      for (let n: FakeNode | undefined = self; n; n = n.parent) if (n.matches(sel)) return n
      return null
    },
  }
  return self
}

test('UX-A-5: j / k start from "nowhere" — the body, <main>, a clicked tab panel — never from a control or a widget', () => {
  const body = node('BODY')
  const main = node('MAIN', { id: 'main' }, body)
  const panel = node('DIV', { role: 'tabpanel', tabindex: '0' }, main)
  const plain = node('SECTION', { tabindex: '-1' }, panel)
  const dialog = node('DIV', { role: 'dialog' }, body)
  assert.equal(isNowhereTarget(body, body), true)
  assert.equal(isNowhereTarget(main, body), true)
  assert.equal(isNowhereTarget(panel, body), true, 'the dashboard panel a click focused')
  assert.equal(isNowhereTarget(plain, body), true, 'a plain container focused by script')
  assert.equal(isNowhereTarget(node('BUTTON', {}, panel), body), false)
  assert.equal(isNowhereTarget(node('A', {}, panel), body), false)
  assert.equal(isNowhereTarget(node('DIV', { role: 'tab', tabindex: '-1' }, panel), body), false, 'a tab owns its keys')
  assert.equal(isNowhereTarget(node('DIV', { tabindex: '-1' }, dialog), body), false, 'inside a dialog')
  assert.equal(isNowhereTarget(node('DIV', {}, panel), body), false, 'an ordinary element that is not focusable')
  assert.equal(isNowhereTarget(null, body), false)
  assert.match(read('components/Admin/shell/useListKeyboard.ts'), /if \(e\.target && !isNowhereTarget\(e\.target\)\) return/)
})

// ── UX-A-6 / UX-A-7 / VISU-5 ────────────────────────────────────────────────

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

test('UX-A-6: the control border is ≥ 3:1 on every page and row background; admin checkboxes use it (admin-only CSS)', () => {
  for (const mode of ['light', 'dark'] as const)
    for (const bg of ['page.bg', 'page.bg-elevated', 'page.bg-overlay'] as const) {
      const ratio = contrast(CONTROL_BORDER[mode], semanticColors[bg][mode])
      assert.ok(ratio >= 3, `control border on ${bg} (${mode}) = ${ratio.toFixed(2)}`)
    }
  // (fix3-E added the admin's hidden-state colour beside it: tests/review-r3-studio.test.ts.)
  assert.match(ADMIN_GLOBAL_CSS, /^:root\{--control-border:#858585;[^}]*\}\[data-theme='dark'\],\.chakra-ui-dark\{--control-border:#6b6b6b;[^}]*\}$/)
  const checkbox = ADMIN_COMPONENT_STYLES.Checkbox as unknown as { baseStyle: (p: Record<string, unknown>) => { control: Record<string, unknown> } }
  const style = checkbox.baseStyle({ colorScheme: 'purple', colorMode: 'light', theme: {} })
  assert.equal(style.control.borderColor, 'var(--control-border)')
  assert.ok(style.control._checked, 'checked colours stay Chakra’s')
  assert.match(read('components/Admin/AdminThemeScope.tsx'), /<Global styles=\{ADMIN_GLOBAL_CSS\} \/>/)
  assert.ok(!('page.control-border' in semanticColors), 'not in the public theme')
})

test('UX-A-7 / VISU-5: the decorative page.muted never colours admin text or a control’s only cue', () => {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, f.name)
      if (f.isDirectory()) walk(rel)
      else if (/\.tsx?$/.test(f.name)) files.push(rel)
    }
  }
  walk('components/Admin')
  walk('pages/admin')
  for (const file of files) {
    const src = read(file)
    // A text element (Text, Box, a span) or an icon button coloured page.muted.
    assert.doesNotMatch(src, /<(Text|Box|IconButton)\b[^<>]*color=["{'`]+page\.muted/, file)
  }
  const activity = read('components/Admin/system/ActivityPanel.tsx')
  assert.match(activity, /fontSize="label" fontFamily=\{MONO\} color="page\.fg-secondary"/)
  assert.match(read('components/Admin/InboxPanel.tsx'), /color=\{m\.starred \? 'status\.limited' : 'page\.fg-subtle'\}/)
  // Text tokens: page.fg-subtle and page.fg-secondary are ≥ 4.5:1 where these labels sit.
  for (const t of ['page.fg-subtle', 'page.fg-secondary'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const bg of ['page.bg', 'page.bg-elevated', 'page.bg-overlay'] as const) assert.ok(contrast(semanticColors[t][mode], semanticColors[bg][mode]) >= 4.5, `${t} on ${bg} (${mode})`)
})

// ── UX-A-8 ──────────────────────────────────────────────────────────────────

test('UX-A-8: a table wider than its box is a focusable, labelled region — and only then', () => {
  assert.equal(overflowsX(860, 307), true)
  assert.equal(overflowsX(308, 307), false, '1px rounding slack')
  assert.equal(overflowsX(0, 0), false)
  assert.deepEqual(scrollRegionProps(true, 'LCP by page'), { tabIndex: 0, role: 'region', 'aria-label': 'LCP by page' })
  assert.deepEqual(scrollRegionProps(false, 'LCP by page'), {})
  for (const file of ['components/Admin/VitalsAttribution.tsx', 'components/Admin/AnalyticsPanel.tsx', 'components/Admin/analytics/ui.tsx', 'components/Admin/StoragePanel.tsx']) {
    const src = read(file)
    assert.match(src, /useScrollRegion\(/, file)
    assert.match(src, /<TableContainer ref=\{\w+\} \{\.\.\.\w+\}/, file)
  }
  // Every admin table container and the line diff (long lines) follow the same rule (axe scrollable-region-focusable).
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : []))
  const tables = walk('components/Admin').filter((f) => /<TableContainer\b/.test(read(f)))
  assert.ok(tables.includes('components/Admin/shell/CollectionIndex.tsx'), 'the blog / work lists are found')
  for (const file of [...tables, 'components/Admin/shell/LineDiffView.tsx']) {
    const src = read(file)
    assert.match(src, /useScrollRegion\(/, file)
    assert.match(src, /ref=\{\w+\}\s+\{\.\.\.\w+\}/, `${file}: the box takes the hook's ref and region attributes`)
  }
})

// ── VISU-1 / VISU-2 ─────────────────────────────────────────────────────────

type FakeEl = MorphElement & { attrs: Record<string, string>; children: FakeEl[]; tag: string; complete?: boolean; decode?: () => Promise<unknown>; style: { props: Record<string, string>; setProperty(n: string, v: string): void; removeProperty(n: string): void } }

function el(tag: string, attrs: Record<string, string>, children: FakeEl[] = [], extra: Partial<FakeEl> = {}): FakeEl {
  const props: Record<string, string> = {}
  const self: FakeEl = {
    tag,
    attrs,
    children,
    style: { props, setProperty: (n, v) => void (props[n] = v), removeProperty: (n) => void delete props[n] },
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
    getBoundingClientRect: () => ({ top: 100, bottom: 200, left: 0, right: 300, width: 300, height: 100 }),
    querySelectorAll: (sel: string) => {
      const all: FakeEl[] = []
      const walk = (n: FakeEl) => n.children.forEach((c) => (all.push(c), walk(c)))
      walk(self)
      if (sel === 'img') return all.filter((n) => n.tag === 'img')
      const attr = sel.match(/^\[([\w-]+)\]$/)?.[1]
      return attr ? all.filter((n) => attr in n.attrs) : []
    },
    contains: () => false,
    ...extra,
  }
  return self
}

test('VISU-1: a small cover morphs as its panel and, apart from it, its logo — the logo image is awaited', async () => {
  assert.deepEqual(MORPH_PARTS, ['title', 'cover', 'panel', 'logo'])
  assert.equal(morphName('panel'), 'vt-morph-panel')
  assert.equal(morphName('logo'), 'vt-morph-logo')
  let decoded = false
  const logo = el('img', { [MORPH_PART_ATTR]: 'logo' }, [], { complete: false, decode: () => new Promise<void>((r) => setTimeout(() => ((decoded = true), r()), 5)) })
  const panel = el('div', { [MORPH_PART_ATTR]: 'panel' }, [logo])
  const page = el('body', {}, [el('article', { [MORPH_ATTR]: '/work/a' }, [el('h1', { [MORPH_PART_ATTR]: 'title' }), panel])])
  const named = await nameMorphTarget(page, '/work/a', ['title', 'panel', 'logo'], { width: 1440, height: 900 })
  assert.deepEqual(named?.parts, ['title', 'panel', 'logo'])
  assert.equal(panel.style.props['view-transition-name'], 'vt-morph-panel')
  assert.equal(logo.style.props['view-transition-name'], 'vt-morph-logo')
  assert.equal(decoded, true, 'the incoming logo decoded before the new snapshot')

  const frame = read('components/Work/CoverFrame.tsx')
  assert.match(frame, /data-cover="small" data-vt-part=\{morph \? 'panel' : undefined\}/)
  assert.match(frame, /data-vt-part=\{morph && cover\.small \? 'logo' : undefined\}/)
  assert.match(frame, /useImageReveal\(cover && !cover\.small \? cover\.placeholder : null/, 'no blur-up placeholder behind a small cover')
  const css = read('styles/globals.css')
  assert.match(css, /::view-transition-old\(vt-morph-logo\),\s*::view-transition-new\(vt-morph-logo\)\s*\{[^}]*object-fit:\s*contain/)
  assert.match(css, /::view-transition-new\(vt-morph-panel\)\s*\{\s*animation:\s*calc\(var\(--vt-route\) \* 0\.25\)/)
})

test('VISU-2: the outgoing title and page are gone before the title crosses nearby text; the new page comes in late', () => {
  const css = read('styles/globals.css')
  assert.match(css, /::view-transition-old\(vt-morph-title\)\s*\{\s*animation:\s*calc\(var\(--vt-route\) \* 0\.15\)[^}]*vt-fade-out/)
  assert.match(css, /html:active-view-transition-type\(morph\)::view-transition-old\(root\)\s*\{\s*animation:\s*calc\(var\(--vt-route\) \* 0\.2\)[^}]*vt-fade-out/)
  assert.match(css, /html:active-view-transition-type\(morph\)::view-transition-new\(root\)\s*\{\s*animation:\s*calc\(var\(--vt-route\) \* 0\.5\) var\(--ease-standard\) calc\(var\(--vt-route\) \* 0\.5\) both vt-fade-in/)
  // Reduced motion: no view-transition animation at all.
  assert.match(css, /::view-transition-group\(\*\),\s*::view-transition-old\(\*\),\s*::view-transition-new\(\*\)\s*\{\s*animation:\s*none !important/)
})

// ── OPS-2 ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('OPS-2: the job queue runs one job at a time, in arrival order, and releases its slot on failure', async () => {
  const q = new JobQueue(1, 8)
  let running = 0
  let peak = 0
  const order: number[] = []
  const job = (n: number, ms: number, fail = false) => async () => {
    running++
    peak = Math.max(peak, running)
    await sleep(ms)
    order.push(n)
    running--
    if (fail) throw new Error(`job ${n}`)
    return n
  }
  const results = await Promise.allSettled([q.run(job(1, 20)), q.run(job(2, 5, true)), q.run(job(3, 1)), q.run(job(4, 1))])
  assert.equal(peak, 1)
  assert.deepEqual(order, [1, 2, 3, 4])
  assert.equal(results[1].status, 'rejected')
  assert.equal(results[3].status, 'fulfilled')
  assert.deepEqual(q.stats(), { running: 0, waiting: 0, concurrency: 1, maxWaiting: 8 })

  const two = new JobQueue(2, 8)
  running = 0
  peak = 0
  await Promise.all([1, 2, 3, 4, 5].map((n) => two.run(job(n, 5))))
  assert.equal(peak, 2)
})

test('OPS-2: a bounded wait — a request beyond it is refused at once (503); background work always waits', async () => {
  const q = new JobQueue(1, 1)
  let release: () => void = () => undefined
  const first = q.run(() => new Promise<void>((r) => (release = r)))
  const second = q.run(async () => 'second')
  await assert.rejects(q.run(async () => 'third'), (err: unknown) => err instanceof ImageQueueFullError && err.status === 503 && err.retryAfterSeconds > 0)
  const background = q.run(async () => 'backfill', { background: true })
  assert.equal(q.stats().waiting, 2)
  release()
  assert.deepEqual(await Promise.all([first, second, background]), [undefined, 'second', 'backfill'])
  assert.equal(envInt(undefined, 1, 1, 4), 1)
  assert.equal(envInt('3', 1, 1, 4), 3)
  assert.equal(envInt('99', 1, 1, 4), 4)
  assert.equal(envInt('zero', 8, 0, 64), 8)
  // One queue per process, whichever route bundle asks.
  assert.equal(imageJobs(), imageJobs())
  assert.equal((globalThis as unknown as Record<symbol, unknown>)[Symbol.for('landing.imageJobs')], imageJobs())
})

test('OPS-2: concurrent uploads are encoded one at a time (storeUpload goes through the queue)', async (t) => {
  for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]
  // Uploads are written under the working directory: a scratch one.
  const originalCwd = process.cwd()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-fixes-r2-'))
  process.chdir(tmp)
  t.after(() => {
    process.chdir(originalCwd)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
  const { storeUpload } = await import('../lib/imageVariants')
  const photo = (hue: string) => sharp({ create: { width: 1400, height: 900, channels: 3, background: hue, noise: { type: 'gaussian', mean: 120, sigma: 30 } } }).jpeg().toBuffer()
  const files = await Promise.all(['#804060', '#406080', '#608040'].map(photo))
  const queue = imageJobs()
  let peakRunning = 0
  let peakWaiting = 0
  const sample = setInterval(() => {
    const s = queue.stats()
    peakRunning = Math.max(peakRunning, s.running)
    peakWaiting = Math.max(peakWaiting, s.waiting)
  }, 2)
  try {
    const stored = await Promise.all(files.map((buf, i) => storeUpload(buf, 'image/jpeg', `concurrent-${i}.jpg`, { mirror: async () => null })))
    assert.equal(stored.length, 3)
    for (const s of stored) assert.ok(s.avifVariants && s.avifVariants.length > 0 && s.variants.length > 0, 'variants made')
  } finally {
    clearInterval(sample)
  }
  assert.equal(peakRunning, 1, 'never two encodes at once')
  assert.ok(peakWaiting >= 1, 'the others waited their turn')
  assert.equal(queue.stats().running, 0)
  const optimize = read('lib/mediaOptimize.ts')
  assert.match(optimize, /imageJobs\(\)\.run\(/)
  assert.match(optimize, /\{ background: true \}/)
})
