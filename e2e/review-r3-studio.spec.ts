import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect, adminCleanup, loginAsAdmin, settle } from './fixtures'

/**
 * Review round 3, fix3-E:
 *
 *   - CV-STUDIO-CONTRAST  CV Studio in light and dark, 1440 and 375: axe
 *                         color-contrast over the studio, every section,
 *                         its menus and panels, with a hidden field, a
 *                         hidden entry and bullet and a section off both
 *                         the CV and the website on screen; plus computed
 *                         checks axe leaves "incomplete" (text over the
 *                         hidden stripe and through opacity, placeholders,
 *                         field edges, switch tracks and thumbs, icon-only
 *                         buttons, focus rings)
 *   - DRAFTBAR-ROOM       Tab through every footer link of a draft preview
 *                         at 375 and 1440: none is under the draft bar, the
 *                         bar stays above the footer and the page has room
 *                         below the footer for it
 *
 * Nothing is saved: the studio's visibility changes stay in the page (it is
 * closed unsaved), and the draft post is synthetic and deleted afterwards.
 * Admin-only: needs ADMIN_EMAIL / ADMIN_PASS.
 */

/** A stored theme preference, so Chakra and the CSS tokens agree from the first paint. */
const useTheme = (page: Page, theme: 'light' | 'dark') => page.addInitScript((t) => window.localStorage.setItem('theme-preference', t), theme)

const STUDIO = '[data-testid="cv-studio"]'
const MENU = '[data-e2e-open]'

async function openStudio(page: Page) {
  await page.goto('/admin/dashboard?tab=cv')
  await expect(page.locator(STUDIO)).toBeVisible()
  await expect(page.getByRole('group', { name: 'Editing language' })).toBeVisible()
  await settle(page)
}

/** axe color-contrast over part of the page: "target — summary" per failing node. */
async function axeContrast(page: Page, include: string): Promise<string[]> {
  await settle(page)
  const result = await new AxeBuilder({ page }).include(include).withRules(['color-contrast']).analyze()
  return result.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} — ${n.any[0]?.message || n.failureSummary}`))
}

/** Mark the open menu or dialog (the visible one) so axe and the computed checks can target it. */
async function markOpen(page: Page, role: 'menu' | 'dialog') {
  await page.waitForTimeout(200)
  await page.evaluate((r) => {
    document.querySelectorAll('[data-e2e-open]').forEach((e) => e.removeAttribute('data-e2e-open'))
    const open = Array.from(document.querySelectorAll(`[role="${r}"]`)).find((e) => (e as HTMLElement).checkVisibility({ checkVisibilityCSS: true }) && e.getBoundingClientRect().height > 0)
    open?.setAttribute('data-e2e-open', '')
  }, role)
}

/**
 * Computed contrast where axe gives up (gradients, overlaps, opacity) and
 * where axe does not look (WCAG 1.4.11): every text node through its
 * ancestors' opacity and backgrounds — the hidden stripe's tint counted as a
 * possible backdrop — ≥ 4.5:1 (3:1 when large); placeholders ≥ 4.5:1; text
 * field edges, switch tracks, a switch's thumb on its track and the icon of
 * an icon-only button ≥ 3:1. Disabled controls are exempt (WCAG's inactive
 * components). Returns one line per failure.
 */
function computedContrast(rootSel: string): string[] {
  type C = { r: number; g: number; b: number; a: number }
  const root = document.querySelector(rootSel) as HTMLElement
  const parse = (c: string | null): C | null => {
    const m = c && c.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const lum = (c: C) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const ratio = (a: C, b: C) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  const over = (d: C, s: C): C => ({ r: s.r * s.a + d.r * (1 - s.a), g: s.g * s.a + d.g * (1 - s.a), b: s.b * s.a + d.b * (1 - s.a), a: s.a + d.a * (1 - s.a) })
  type Layer = { o: number; c: C }
  const flatten = (layers: Layer[]): C => {
    let cur = layers[layers.length - 1].c
    for (let i = layers.length - 1; i > 0; i--) {
      const { o } = layers[i]
      const parent = layers[i - 1].c
      const a = cur.a
      cur = { r: parent.r * (1 - o * a) + o * cur.r, g: parent.g * (1 - o * a) + o * cur.g, b: parent.b * (1 - o * a) + o * cur.b, a: 1 }
    }
    return cur
  }
  const paint = (ls: Layer[], c: C): Layer[] => {
    const copy = ls.slice()
    const top = copy[copy.length - 1]
    copy[copy.length - 1] = { o: top.o, c: over(top.c, c) }
    return copy
  }
  /** Possible backdrops of an element (several when a striped gradient is behind it). */
  const backdrops = (el: Element, withSelf: boolean): Layer[][] => {
    const chain: Element[] = []
    for (let e: Element | null = withSelf ? el : el.parentElement; e; e = e.parentElement) chain.unshift(e)
    let variants: Layer[][] = [[{ o: 1, c: { r: 255, g: 255, b: 255, a: 1 } }]]
    for (const e of chain) {
      const cs = getComputedStyle(e)
      const o = parseFloat(cs.opacity)
      if (o < 1) variants = variants.map((ls) => [...ls, { o, c: { r: 0, g: 0, b: 0, a: 0 } }])
      const bg = parse(cs.backgroundColor)
      if (bg && bg.a > 0) variants = variants.map((ls) => paint(ls, bg))
      if (root.contains(e) && cs.backgroundImage !== 'none') {
        const tints = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse).filter((c): c is C => !!c && c.a > 0)
        variants = variants.concat(tints.flatMap((t) => variants.map((ls) => paint(ls, t)))).slice(0, 16)
      }
    }
    return variants
  }
  const worst = (fg: C, el: Element, withSelf: boolean) =>
    Math.min(...backdrops(el, withSelf).map((ls) => ratio(flatten(paint(ls, fg)), flatten(ls))))
  const shown = (el: Element) => (el as HTMLElement).checkVisibility({ checkVisibilityCSS: true }) && el.getClientRects().length > 0
  const inactive = (el: Element) => !!el.closest('[disabled], [aria-disabled="true"], [data-disabled]')
  const name = (el: Element) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || (el as HTMLInputElement).placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`
  const out: string[] = []
  const check = (what: string, el: Element, fg: C | null, need: number, withSelf = true) => {
    if (!fg || inactive(el)) return
    const r = worst(fg, el, withSelf)
    if (r < need - 0.005) out.push(`${what} ${name(el)}: ${r.toFixed(2)} < ${need}`)
  }

  const seen = new Set<Element>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!n.textContent?.trim() || !el || seen.has(el) || !shown(el)) continue
    seen.add(el)
    const cs = getComputedStyle(el)
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)') continue
    const size = parseFloat(cs.fontSize)
    const large = size >= 24 || (parseInt(cs.fontWeight) >= 700 && size >= 18.66)
    check('text', el, parse(cs.color), large ? 3 : 4.5)
  }
  for (const el of Array.from(root.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=color]), textarea'))) {
    if (!shown(el)) continue
    const cs = getComputedStyle(el)
    if ((el as HTMLInputElement).value) check('field text', el, parse(cs.color), 4.5)
    if ((el as HTMLInputElement).placeholder) check('placeholder', el, parse(getComputedStyle(el, '::placeholder').color), 4.5)
    if (parseFloat(cs.borderTopWidth) > 0 && !el.closest('[data-e2e-borderless]')) check('field edge', el, parse(cs.borderTopColor), 3, false)
  }
  for (const btn of Array.from(root.querySelectorAll('button, [role="button"], [aria-roledescription="sortable"]'))) {
    const svg = btn.querySelector('svg')
    if (!svg || !shown(btn) || (btn.textContent || '').trim()) continue
    check('icon', svg, parse(getComputedStyle(svg).color), 3)
  }
  for (const track of Array.from(root.querySelectorAll('.chakra-switch__track'))) {
    if (!shown(track)) continue
    check('switch track', track, parse(getComputedStyle(track).backgroundColor), 3, false)
    const thumb = track.querySelector('.chakra-switch__thumb')
    if (thumb) check('switch thumb', thumb, parse(getComputedStyle(thumb).backgroundColor), 3, false)
  }
  return out
}

const computed = (page: Page, rootSel: string) => page.evaluate(computedContrast, rootSel)

/** The open entries' expand buttons (not menu triggers). */
const collapsedEntries = (page: Page) => page.locator(`${STUDIO} button[aria-expanded="false"][aria-controls]:not([aria-haspopup]):visible`)

async function expandAll(page: Page) {
  for (let i = 0; i < 12; i++) {
    const next = collapsedEntries(page).first()
    if (!(await next.count())) break
    await next.click()
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`CV-STUDIO-CONTRAST: CV Studio meets AA in ${theme} — every section, menu and panel, at 375 and 1440 @admin`, async ({ page }) => {
    test.setTimeout(240_000)
    await useTheme(page, theme)
    await loginAsAdmin(page)

    // Phones first (nothing changed yet): the editor, the sections pane and the preview pane.
    await page.setViewportSize({ width: 375, height: 812 })
    await openStudio(page)
    const panes = page.getByRole('group', { name: 'Pane' })
    for (const pane of ['Edit', 'Sections', 'Preview']) {
      await panes.getByRole('button', { name: pane }).click()
      expect(await axeContrast(page, STUDIO), `375 ${pane}: axe`).toEqual([])
      expect(await computed(page, STUDIO), `375 ${pane}: computed`).toEqual([])
    }

    await page.setViewportSize({ width: 1440, height: 900 })
    const studio = page.locator(STUDIO)
    const sidebar = page.getByRole('navigation', { name: 'CV sections' })
    const rows = sidebar.locator('button[type="button"]:not([aria-label]):not([aria-haspopup])')
    const sections = await rows.count()
    expect(sections, 'the CV has sections').toBeGreaterThan(2)

    // On screen while checking (in the page only — never saved): a hidden field, a hidden entry and
    // bullet, a section off both the CV and the website, and the language toggle on 中文 / Unlinked.
    await rows.first().click()
    await studio.locator('[data-vis-toggle][aria-pressed="false"]').first().click()
    // The last section, off both the CV and the website (its row turns quiet).
    const lastRow = rows.nth(sections - 1).locator('xpath=..')
    for (const where of [/^Hide from CV \/ PDF/, /^Hide from website/]) {
      const off = lastRow.getByRole('button', { name: where })
      if (await off.count()) await off.click()
    }
    await expect(lastRow.getByRole('button', { name: /^Hide from/ })).toHaveCount(0)
    const expanded = studio.locator('button[aria-expanded="true"][aria-controls]:not([aria-haspopup])')
    let hidEntry = false
    for (let i = 0; i < sections; i++) {
      const label = (await rows.nth(i).innerText()).split('\n')[0]
      await rows.nth(i).click()
      await expandAll(page)
      if (!hidEntry && (await expanded.count())) {
        // The first entry: hidden, and one of its bullets too.
        const entry = expanded.first().locator('xpath=ancestor::*[@data-cvpath][1]')
        await entry.locator('[data-vis-toggle]').first().click()
        const bullet = entry.locator('[role="group"] [data-vis-toggle][aria-pressed="false"]').first()
        if (await bullet.count()) await bullet.click()
        hidEntry = true
      }
      expect(await axeContrast(page, STUDIO), `${label}: axe`).toEqual([])
      expect(await computed(page, STUDIO), `${label}: computed`).toEqual([])
    }
    expect(hidEntry, 'an entry was hidden on screen').toBe(true)

    const toolbar = page.getByRole('group', { name: 'Editing language' })
    await toolbar.getByRole('button', { name: '中文' }).click()
    await page.getByRole('button', { name: 'Linked languages' }).click()
    expect(await axeContrast(page, STUDIO), '中文, unlinked: axe').toEqual([])
    expect(await computed(page, STUDIO), '中文, unlinked: computed').toEqual([])
    await page.getByRole('button', { name: 'Unlinked languages' }).click()
    await toolbar.getByRole('button', { name: 'EN' }).click()
    await rows.first().click()

    // Menus, opened from the keyboard (the focused row shows the ring), and the two panels.
    const menus: Array<[string, () => Promise<void>]> = [
      ['More', () => page.getByRole('button', { name: 'More actions', exact: true }).click()],
      ['Section actions', () => page.getByRole('button', { name: 'Section actions' }).click()],
      ['Shows on', () => studio.locator('[data-audience-toggle]').first().click()],
      ['Add section', () => page.getByRole('button', { name: 'Add section' }).click()],
    ]
    for (const [label, open] of menus) {
      if (label === 'Add section' && (await page.getByRole('button', { name: 'Add section' }).isDisabled())) continue
      await open()
      await page.keyboard.press('ArrowDown')
      await markOpen(page, 'menu')
      expect(await axeContrast(page, MENU), `${label} menu: axe`).toEqual([])
      expect(await computed(page, MENU), `${label} menu: computed`).toEqual([])
      // A row reached by keyboard: the accent ring inside its edge (a background wash alone is ~1.1:1).
      const ring = await page.evaluate(() => {
        const cs = getComputedStyle(document.activeElement!)
        return { style: cs.outlineStyle, color: cs.outlineColor, width: cs.outlineWidth }
      })
      expect(ring, `${label}: focused row`).toEqual({ style: 'solid', color: 'rgb(99, 102, 241)', width: '2px' })
      await page.keyboard.press('Escape')
    }
    for (const [label, name] of [
      ['Hidden items', /hidden items/],
      ['Readiness', /readiness findings/],
    ] as const) {
      await page.getByRole('button', { name }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await markOpen(page, 'dialog')
      expect(await axeContrast(page, MENU), `${label} panel: axe`).toEqual([])
      expect(await computed(page, MENU), `${label} panel: computed`).toEqual([])
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toBeHidden()
    }

    // A text field reached by Tab draws the accent ring — Chakra turned 'var(--accent)' into black, invisible on the dark page.
    const heading = studio.getByLabel(/^Section heading/i)
    await heading.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(heading).toBeFocused()
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.activeElement!).boxShadow))
      .toBe('rgb(99, 102, 241) 0px 0px 0px 1px')
  })
}

// ── DRAFTBAR-ROOM ──────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10)

test('DRAFTBAR-ROOM: Tab through the footer of a draft preview — no focused link under the draft bar, at 375 and 1440 @admin', async ({ page }) => {
  test.setTimeout(150_000)
  await loginAsAdmin(page)
  const slug = `e2e-r3-draftbar-${Date.now()}`
  const body = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}. ${'A synthetic sentence that fills the line for the draft bar check. '.repeat(3)}`).join('\n\n')
  const created = await page.evaluate(
    async ([s, b, d]) => {
      const res = await fetch('/api/admin/posts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: s, create: true, frontmatter: { title: 'Example draft', date: d, draft: true, description: 'Created by the review-r3 studio suite; deleted afterwards.' }, body: b }),
      })
      return res.status
    },
    [slug, body, today()] as const,
  )
  expect(created).toBe(200)
  try {
    await page.goto(`/api/admin/draft?path=${encodeURIComponent(`/blog/${slug}`)}`)
    await expect(page).toHaveURL(new RegExp(`/blog/${slug}$`))
    for (const viewport of [
      { width: 375, height: 700 },
      { width: 1440, height: 800 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto(`/blog/${slug}`)
      const bar = page.getByRole('region', { name: 'Draft preview' })
      await expect(bar).toBeVisible()
      // Hosted on <body>, above the footer, with the site's column padded by its measured height.
      await expect.poll(() => page.evaluate(() => document.querySelector('[aria-label="Draft preview"]')!.parentElement === document.body)).toBe(true)
      await expect
        .poll(() => page.evaluate(() => [getComputedStyle(document.querySelector('[data-site-chrome]')!).paddingBottom, getComputedStyle(document.documentElement).getPropertyValue('--bottom-bar-h').trim()]))
        .toEqual(await bar.evaluate((el) => [`${Math.ceil(el.getBoundingClientRect().height)}px`, `${Math.ceil(el.getBoundingClientRect().height)}px`]))

      const seen: string[] = []
      const covered: string[] = []
      let inFooter = false
      for (let i = 0; i < 200; i++) {
        await page.keyboard.press('Tab')
        const at = await page.evaluate(async () => {
          // Let the focus scroll settle (smooth scrolling included).
          let last = -1
          for (let n = 0; n < 30; n++) {
            await new Promise((r) => requestAnimationFrame(r))
            if (window.scrollY === last) break
            last = window.scrollY
          }
          const el = document.activeElement as HTMLElement | null
          if (!el || el === document.body) return { where: 'none' as const }
          if (!el.closest('footer') || el.closest('#main')) return { where: 'page' as const }
          const box = el.getBoundingClientRect()
          const bar = document.querySelector('[aria-label="Draft preview"]')!.getBoundingClientRect()
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          return {
            where: 'footer' as const,
            label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30),
            clear: !!hit && el.contains(hit) && box.bottom <= bar.top,
            box: `${Math.round(box.top)}–${Math.round(box.bottom)}, bar ${Math.round(bar.top)}`,
          }
        })
        if (at.where === 'footer') {
          inFooter = true
          seen.push(at.label)
          if (!at.clear) covered.push(`${at.label} (${at.box})`)
        } else if (inFooter) break
      }
      expect(seen.length, `${viewport.width}px: footer links reached`).toBeGreaterThan(3)
      expect(covered, `${viewport.width}px: focused footer links under the draft bar`).toEqual([])
      // Tab goes on from the footer to the bar's Exit (after the footer now that the bar is on <body>).
      const exit = bar.getByRole('link', { name: 'Exit' })
      for (let i = 0; i < 4 && !(await exit.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
      await expect(exit).toBeFocused()

      // At the very end of the page the footer ends above the bar and the bar is not painted over.
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
      const end = await page.evaluate(() => {
        const bar = document.querySelector('[aria-label="Draft preview"]')!
        const exit = bar.querySelector('a')!.getBoundingClientRect()
        const hit = document.elementFromPoint(exit.left + exit.width / 2, exit.top + exit.height / 2)
        const footer = Array.from(document.querySelectorAll('footer')).find((f) => !f.closest('#main'))!.getBoundingClientRect()
        return { exitOnTop: !!hit && bar.contains(hit), footerBottom: Math.round(footer.bottom), barTop: Math.round(bar.getBoundingClientRect().top) }
      })
      expect(end.exitOnTop, `${viewport.width}px: the bar is above the footer`).toBe(true)
      expect(end.footerBottom, `${viewport.width}px: room below the footer`).toBeLessThanOrEqual(end.barTop)
    }
  } finally {
    if ((await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)) === 403) {
      // Deleting needs a recent sign-in: sign in again for the clean-up (the
      // sign-in page sends a still-signed-in browser on to the admin, so drop
      // this context's session first).
      await page.context().clearCookies()
      await loginAsAdmin(page, { fresh: true })
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  }
})
