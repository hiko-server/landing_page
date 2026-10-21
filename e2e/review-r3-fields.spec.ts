import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect, ADMIN, adminCleanup, loginAsAdmin, settle } from './fixtures'

/**
 * Review round 3, fix3-F — the admin's form fields in light and dark:
 *
 *   - ERROR-BORDER   a field marked invalid draws its ring in the intended
 *                    colour: the schedule dialog's "that time has passed"
 *                    ring is the warning colour of each mode (it was
 *                    #000000: Chakra resolves errorBorderColor and
 *                    focusBorderColor through its own colour parser, which
 *                    turns a semantic token or var() into black); a field
 *                    reached by Tab draws the accent ring
 *   - FIELD-BORDERS  every admin screen, at 375 and 1440: axe (WCAG 2.2 A /
 *                    AA) plus a computed check of what axe does not measure
 *                    (WCAG 1.4.11): the edge of every text field, select and
 *                    number field, the box of every checkbox, the track and
 *                    thumb of every switch ≥ 3:1 against what is next to
 *                    them, placeholders ≥ 4.5:1, and every field's focus
 *                    indicator ≥ 3:1 and in the accent
 *
 * Also the post editor's panels and dialogs (search & sharing, find &
 * replace, publish sheet, schedule, review links, history), the media
 * picker and drawer, reply templates and the shortcuts overlay.
 *
 * Nothing is saved: dialogs are closed or cancelled, and the synthetic
 * drafts ("Example draft", one per test that needs the editor) are deleted
 * afterwards. Admin-only: needs ADMIN_EMAIL / ADMIN_PASS.
 */

const ACCENT = 'rgb(99, 102, 241)'

/** A stored theme preference, so Chakra and the CSS tokens agree from the first paint. */
const useTheme = (page: Page, theme: 'light' | 'dark') => page.addInitScript((t) => window.localStorage.setItem('theme-preference', t), theme)

/** axe WCAG 2.2 A / AA over part of the page: "rule target — summary" per failing node. */
async function axe(page: Page, include: string): Promise<string[]> {
  await settle(page)
  const result = await new AxeBuilder({ page }).include(include).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  return result.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')} — ${(n.any[0]?.message || n.failureSummary || '').slice(0, 160)}`))
}

/**
 * The in-page checks (one function, so it can be shipped to the page whole).
 * `mode`: 'static' checks boundaries, boxes, tracks and placeholders as they
 * stand; 'focus' focuses each field in turn and checks its indicator.
 * Disabled controls are exempt (WCAG's inactive components). One line per failure.
 */
async function fieldContrast([rootSel, mode]: [string, 'static' | 'focus']): Promise<string[]> {
  type C = { r: number; g: number; b: number; a: number }
  const roots = Array.from(document.querySelectorAll(rootSel)) as HTMLElement[]
  const parse = (c: string | null | undefined): C | null => {
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
  const over = (d: C, s: C): C => ({ r: s.r * s.a + d.r * (1 - s.a), g: s.g * s.a + d.g * (1 - s.a), b: s.b * s.a + d.b * (1 - s.a), a: 1 })
  /** The opaque colour behind an element: its ancestors' backgrounds (and its own with `withSelf`), through their opacity. */
  const backdrop = (el: Element, withSelf: boolean): C => {
    const chain: Element[] = []
    for (let e: Element | null = withSelf ? el : el.parentElement; e; e = e.parentElement) chain.unshift(e)
    let cur: C = { r: 255, g: 255, b: 255, a: 1 }
    for (const e of chain) {
      const cs = getComputedStyle(e)
      const bg = parse(cs.backgroundColor)
      if (bg && bg.a > 0) cur = over(cur, { ...bg, a: bg.a * Math.min(1, parseFloat(cs.opacity)) })
    }
    return cur
  }
  /** Contrast of a colour painted on an element (through the element's and its ancestors' opacity) against `against`. */
  const opacityOf = (el: Element) => {
    let o = 1
    for (let e: Element | null = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity)
    return o
  }
  const vs = (fg: C, el: Element, against: C) => ratio(over(against, { ...fg, a: fg.a * opacityOf(el) }), against)
  const shown = (el: Element) => {
    if (!(el as HTMLElement).checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) return false
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) return false
    const cs = getComputedStyle(el)
    return cs.clip !== 'rect(0px, 0px, 0px, 0px)' && cs.clipPath !== 'inset(50%)'
  }
  const inactive = (el: Element) => !!el.closest('[disabled], [aria-disabled="true"], [data-disabled], fieldset:disabled')
  const label = (el: Element) => {
    const id = el.getAttribute('id')
    const lab = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent) || el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || el.getAttribute('name') || el.textContent || ''
    return `${el.tagName.toLowerCase()}${(el as HTMLInputElement).type && el.tagName === 'INPUT' ? `[${(el as HTMLInputElement).type}]` : ''} "${lab.trim().replace(/\s+/g, ' ').slice(0, 40)}"`
  }
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const
  const borderSides = (cs: CSSStyleDeclaration) =>
    SIDES.filter((s) => parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) >= 1 && !['none', 'hidden'].includes(cs.getPropertyValue(`border-${s.toLowerCase()}-style`)))
  const sideColor = (cs: CSSStyleDeclaration, s: (typeof SIDES)[number]) => parse(cs.getPropertyValue(`border-${s.toLowerCase()}-color`))
  /** The worst contrast of an element's visible border against the outside and (when it has its own fill) the inside. */
  const edge = (el: Element): number | null => {
    const cs = getComputedStyle(el)
    const sides = borderSides(cs)
    if (!sides.length) return null
    const outside = backdrop(el, false)
    const inside = backdrop(el, true)
    let worst = Infinity
    for (const s of sides) {
      const c = sideColor(cs, s)
      if (!c || c.a === 0) continue
      worst = Math.min(worst, vs(c, el, outside), vs(c, el, inside))
    }
    return worst === Infinity ? null : worst
  }
  /** Colours of a focus indicator: a visible outline and every box-shadow ring. */
  const rings = (el: Element): C[] => {
    const cs = getComputedStyle(el)
    const out: C[] = []
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1) {
      const c = parse(cs.outlineColor)
      if (c && c.a > 0) out.push(c)
    }
    for (const m of cs.boxShadow.matchAll(/rgba?\([^)]+\)[^,]*?(-?[\d.]+px)\s+(-?[\d.]+px)\s+(-?[\d.]+px)\s+(-?[\d.]+px)/g)) {
      const c = parse(m[0])
      if (c && c.a > 0 && parseFloat(m[4]) > 0) out.push(c)
    }
    return out
  }
  const hex = (c: C) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`

  const out: string[] = []
  const fail = (what: string, el: Element, r: number, need: number, extra = '') => {
    if (r < need - 0.005) out.push(`${what} ${label(el)}: ${r.toFixed(2)} < ${need}${extra}`)
  }
  const TEXT_FIELDS = 'input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=hidden]):not([type=file]):not([type=range]), textarea, select'
  for (const root of roots) {
    const fields = Array.from(root.querySelectorAll(TEXT_FIELDS)).filter((el) => shown(el) && !inactive(el))
    if (mode === 'static') {
      for (const el of fields) {
        const cs = getComputedStyle(el)
        if ((el as HTMLInputElement).placeholder && !(el as HTMLInputElement).value) {
          const ph = parse(getComputedStyle(el, '::placeholder').color)
          if (ph) fail('placeholder', el, vs(ph, el, backdrop(el, true)), 4.5)
        }
        // The field's own edge; a borderless field (the tag field's input) is bounded by its frame.
        let e = edge(el)
        if (e === null) {
          const own = parse(cs.backgroundColor)
          if (own && own.a > 0 && ratio(backdrop(el, true), backdrop(el, false)) >= 3) continue
          let frame: Element | null = el.parentElement
          for (let i = 0; frame && i < 4 && e === null; i++, frame = frame.parentElement) {
            if (borderSides(getComputedStyle(frame)).length >= 3) e = edge(frame)
            if (e !== null) break
          }
          if (e === null) {
            out.push(`field edge ${label(el)}: no visible boundary`)
            continue
          }
        }
        fail('field edge', el, e, 3)
      }
      for (const box of Array.from(root.querySelectorAll('.chakra-checkbox__control'))) {
        if (!shown(box) || inactive(box)) continue
        const cs = getComputedStyle(box)
        const on = box.hasAttribute('data-checked') || box.hasAttribute('data-indeterminate')
        if (on) {
          const fill = parse(cs.backgroundColor)
          if (fill) fail('checkbox (ticked)', box, vs(fill, box, backdrop(box, false)), 3)
        } else {
          const e = edge(box)
          if (e === null) out.push(`checkbox ${label(box.closest('label') || box)}: no visible boundary`)
          else fail('checkbox', box.closest('label') || box, e, 3)
        }
      }
      for (const track of Array.from(root.querySelectorAll('.chakra-switch__track'))) {
        if (!shown(track) || inactive(track)) continue
        const fill = parse(getComputedStyle(track).backgroundColor)
        if (fill) fail('switch track', track.closest('label') || track, vs(fill, track, backdrop(track, false)), 3)
        const thumb = track.querySelector('.chakra-switch__thumb')
        const t = thumb && parse(getComputedStyle(thumb).backgroundColor)
        if (thumb && t) fail('switch thumb', track.closest('label') || track, vs(t, thumb, backdrop(thumb, false)), 3)
      }
    } else {
      // Focus each field (and each checkbox / switch) and measure its indicator.
      const targets: Array<[Element, Element, boolean]> = fields.map((el) => [el, el, true])
      for (const input of Array.from(root.querySelectorAll('input.chakra-checkbox__input, input.chakra-switch__input'))) {
        const shownPart = input.parentElement?.querySelector('.chakra-checkbox__control, .chakra-switch__track')
        if (shownPart && shown(shownPart) && !inactive(input)) targets.push([input, shownPart, false])
      }
      const frame = () => new Promise((r) => requestAnimationFrame(r))
      for (const [el, painted, isField] of targets) {
        (el as HTMLElement).focus({ preventScroll: true })
        if (document.activeElement !== el) continue
        // A checkbox or switch shows focus through Chakra's data-focus-visible (React state): let it render.
        if (!isField) {
          await frame()
          await frame()
        }
        const found = rings(painted)
        const against = backdrop(painted, false)
        if (!found.length) {
          out.push(`focus ${label(el)}: no indicator`)
        } else {
          const best = Math.max(...found.map((c) => vs(c, painted, against)))
          fail('focus', el, best, 3, ` (${found.map(hex).join(', ')})`)
          if (isField && !el.matches('[aria-invalid="true"]') && !found.some((c) => hex(c) === 'rgb(99, 102, 241)')) out.push(`focus ${label(el)}: not the accent (${found.map(hex).join(', ')})`)
        }
        (el as HTMLElement).blur()
      }
    }
  }
  return out
}

/** Static and focus checks over a part of the page; transitions off while measuring so states are final. */
async function fields(page: Page, rootSel: string): Promise<string[]> {
  await settle(page)
  const stat = await page.evaluate(fieldContrast, [rootSel, 'static'] as [string, 'static'])
  const style = await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; }' })
  // A real key press first (not a modifier), so a script-focused control counts as keyboard focus (:focus-visible, Chakra's data-focus-visible).
  await page.keyboard.press('Tab')
  const focus = await page.evaluate(fieldContrast, [rootSel, 'focus'] as [string, 'focus'])
  await style.evaluate((el) => (el as HTMLStyleElement).remove())
  return [...stat, ...focus]
}

/** Wait for an admin route's content (not its loading states). */
async function ready(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined)
  await expect(page.locator('[aria-busy="true"], .chakra-skeleton')).toHaveCount(0, { timeout: 15_000 }).catch(() => undefined)
}

/** Close the open dialog or drawer with Escape, from inside it (the checks leave focus on the page). */
async function closeOpen(page: Page) {
  await page.locator(OPEN).evaluate((el) => {
    const inner = el.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])') || (el as HTMLElement)
    inner.focus()
  })
  await page.keyboard.press('Escape')
}

/** Axe and the field checks over a part of the page. */
async function sweep(page: Page, where: string, root = 'body') {
  expect.soft(await axe(page, root), `${where}: axe`).toEqual([])
  expect.soft(await fields(page, root), `${where}: fields`).toEqual([])
}

/** Mark the open dialog / drawer / region (the last visible one) so the checks can target it. */
async function markOpen(page: Page, selector: string) {
  await page.waitForTimeout(300)
  await page.evaluate((sel) => {
    document.querySelectorAll('[data-e2e-open]').forEach((e) => e.removeAttribute('data-e2e-open'))
    const open = Array.from(document.querySelectorAll(sel)).filter((e) => (e as HTMLElement).checkVisibility({ checkVisibilityCSS: true }) && e.getBoundingClientRect().height > 0)
    open[open.length - 1]?.setAttribute('data-e2e-open', '')
  }, selector)
  await expect(page.locator(OPEN)).toHaveCount(1)
}
const OPEN = '[data-e2e-open]'

const today = () => new Date().toISOString().slice(0, 10)

/** A synthetic draft post for the editor, its panels and dialogs; deleted by `removeDraft`. */
async function createDraft(page: Page, slug: string) {
  const status = await page.evaluate(
    async ([s, d]) =>
      (
        await fetch('/api/admin/posts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: s, create: true, frontmatter: { title: 'Example draft', date: d, draft: true, description: 'Created by the review-r3 fields suite; deleted afterwards.' }, body: 'A synthetic paragraph for the field checks.\n' }),
        })
      ).status,
    [slug, today()] as const,
  )
  expect(status).toBe(200)
}
async function removeDraft(page: Page, slug: string) {
  const url = `/api/admin/posts?slug=${slug}`
  let status = await adminCleanup(page, 'DELETE', url)
  if (status === 403) {
    // Deleting needs a recent sign-in (lib/adminAuth/stepUp): confirm it's you with the password, then delete.
    await page.evaluate(async (password) => {
      await fetch('/api/admin/security/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'password', password }) })
    }, ADMIN.password)
    status = await adminCleanup(page, 'DELETE', url)
  }
  expect(status, 'the synthetic draft is deleted').toBe(200)
}

/** The editor's ⋯ menu → an item. */
async function moreAction(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** The admin screens (signed in), each with a readable name. */
const ROUTES: Array<[string, string]> = [
  ['overview', '/admin'],
  ['home editor', '/admin/dashboard?tab=home'],
  ['CV Studio', '/admin/dashboard?tab=cv'],
  ['CV raw JSON', '/admin/dashboard?tab=cv&view=raw'],
  ['CV variants', '/admin/dashboard?tab=cv&view=variants'],
  ['versions', '/admin/dashboard?tab=versions'],
  ['storage', '/admin/dashboard?tab=storage'],
  ['inbox', '/admin/dashboard?tab=inbox'],
  ['analytics', '/admin/dashboard?tab=analytics'],
  ['posts', '/admin/blog'],
  ['new post', '/admin/blog/edit'],
  ['case studies', '/admin/work'],
  ['new case study', '/admin/work/edit'],
  ['about (English)', '/admin/about'],
  ['about (中文)', '/admin/about?lang=zh'],
  ['now', '/admin/now'],
  ['uses', '/admin/uses'],
  ['media library', '/admin/media'],
  ['media trash', '/admin/media?view=trash'],
  ['scheduled & review links', '/admin/publishing'],
  ['tags', '/admin/tags'],
  ['security', '/admin/security'],
  ['system health', '/admin/system'],
  ['activity log', '/admin/system?view=activity'],
  ['content health', '/admin/system?view=content'],
  ['errors', '/admin/system?view=errors'],
  ['storage settings', '/admin/db-config'],
]

/** Signed out. */
const PUBLIC_ROUTES: Array<[string, string]> = [
  ['sign in', '/admin/login'],
  ['forgot password', '/admin/forgot'],
  ['reset password', '/admin/reset'],
]

/** The warning ring of the schedule dialog by mode (orange.700 / orange.300 — the warning text's pair). */
const WARN_RING = { light: 'rgb(156, 66, 33)', dark: 'rgb(246, 173, 85)' } as const

test.describe('admin form fields', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 375]) {
      test(`FIELD-BORDERS: every admin screen's fields, boxes, switches and focus rings meet WCAG 2.2 AA in ${theme} at ${width} @admin`, async ({ page }) => {
        test.setTimeout(420_000)
        await useTheme(page, theme)
        await page.setViewportSize({ width, height: width > 400 ? 900 : 812 })
        for (const [name, url] of PUBLIC_ROUTES) {
          await page.goto(url)
          await ready(page)
          await sweep(page, name)
        }
        await loginAsAdmin(page)
        for (const [name, url] of ROUTES) {
          await page.goto(url)
          await ready(page)
          await sweep(page, name)
        }
      })
    }

    test(`FIELD-BORDERS: the post editor's panels and dialogs, the media drawer and picker, reply templates and the shortcuts in ${theme} @admin`, async ({ page }) => {
      test.setTimeout(300_000)
      await useTheme(page, theme)
      await page.setViewportSize({ width: 1440, height: 900 })
      await loginAsAdmin(page)
      const slug = `e2e-r3-fields-${theme}-${Date.now()}`
      await createDraft(page, slug)
      try {
        await page.goto(`/admin/blog/edit?slug=${slug}`)
        await ready(page)
        await page.getByRole('button', { name: /Search & sharing/ }).click()
        await sweep(page, 'post editor, search & sharing open')

        await page.getByRole('button', { name: /^Find/ }).click()
        await markOpen(page, '[aria-label="Find and replace"]')
        await sweep(page, 'find & replace', OPEN)
        await closeOpen(page)

        const dialogs: Array<[string, () => Promise<void>]> = [
          ['publish sheet', () => page.getByRole('button', { name: 'Publish…' }).click()],
          ['schedule dialog', () => moreAction(page, /^Schedule…/)],
          ['review links', () => moreAction(page, /^Share for review…/)],
          ['history drawer', () => moreAction(page, /^History…/)],
        ]
        for (const [name, open] of dialogs) {
          await open()
          await markOpen(page, '[role="dialog"]')
          await sweep(page, name, OPEN)
          await closeOpen(page)
          await expect(page.getByRole('dialog')).toHaveCount(0)
        }

        await page.getByRole('tab', { name: 'MDX' }).click()
        await page.getByRole('button', { name: 'Insert from library…' }).click()
        await expect(page.getByTestId('media-picker')).toBeVisible()
        await ready(page)
        await markOpen(page, '[data-testid="media-picker"]')
        await sweep(page, 'media picker', OPEN)
        await closeOpen(page)
        await expect(page.getByTestId('media-picker')).toHaveCount(0)
      } finally {
        await removeDraft(page, slug)
      }

      // The media library's drawer (when the library has a file).
      await page.goto('/admin/media')
      await ready(page)
      const tile = page.locator('[data-testid="media-tile"] button').first()
      if (await tile.count()) {
        await tile.click()
        await expect(page.getByTestId('media-drawer')).toBeVisible()
        await ready(page)
        await markOpen(page, '[data-testid="media-drawer"]')
        await sweep(page, 'media drawer', OPEN)
        await closeOpen(page)
      }

      // Reply templates (opening the dialog saves nothing).
      await page.goto('/admin/dashboard?tab=inbox')
      await ready(page)
      await page.getByRole('button', { name: 'Reply templates' }).click()
      await markOpen(page, '[role="dialog"]')
      await sweep(page, 'reply templates', OPEN)
      await closeOpen(page)

      // The keyboard shortcuts overlay.
      await page.goto('/admin')
      await ready(page)
      await page.keyboard.press('?')
      await markOpen(page, '[role="dialog"]')
      await sweep(page, 'keyboard shortcuts', OPEN)
    })

    test(`ERROR-BORDER: the schedule dialog rings a missing time in the warning colour, and a focused field in the accent, in ${theme} @admin`, async ({ page }) => {
      test.setTimeout(120_000)
      await useTheme(page, theme)
      await page.setViewportSize({ width: 1440, height: 900 })
      await loginAsAdmin(page)
      const slug = `e2e-r3-ring-${theme}-${Date.now()}`
      await createDraft(page, slug)
      try {
        await page.goto(`/admin/blog/edit?slug=${slug}`)
        await ready(page)
        await moreAction(page, /^Schedule…/)
        const dialog = page.getByTestId('schedule-dialog')
        await expect(dialog).toBeVisible()
        const publish = dialog.getByRole('group', { name: 'Publish' })
        const date = publish.getByLabel('Date', { exact: true })
        const time = publish.getByLabel(/^Time/)
        await date.fill('')
        await expect(dialog.getByTestId('schedule-publish-msg')).toHaveText('Pick a date and a time.')
        await expect(dialog.getByRole('button', { name: 'Schedule', exact: true })).toBeDisabled()
        // Both fields: invalid, described by the message, ringed in the warning colour (it was #000000).
        const ring = (el: typeof date) =>
          el.evaluate((e) => {
            const cs = getComputedStyle(e)
            return { invalid: e.getAttribute('aria-invalid'), border: cs.borderTopColor, shadow: cs.boxShadow }
          })
        // Off the field (a click on the dialog's title), so the ring is the invalid one, not the focus one.
        await dialog.locator('header').click()
        for (const field of [date, time]) {
          await expect(field).toHaveAttribute('aria-describedby', /-publish-msg$/)
          await expect.poll(() => ring(field)).toEqual({ invalid: 'true', border: WARN_RING[theme], shadow: `${WARN_RING[theme]} 0px 0px 0px 1px` })
        }
        // ≥ 3:1 against the dialog: the computed sweep over the open dialog passes with the fields invalid.
        await markOpen(page, '[role="dialog"]')
        expect(await fields(page, OPEN), 'invalid fields in the dialog').toEqual([])
        // Reached from the keyboard, an invalid field shows the accent focus ring over the warning one.
        // (Shift+Tab from the time first lands on the date's calendar button, which Chromium rings itself;
        // the second reaches the date's last segment.)
        await time.focus()
        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Shift+Tab')
        await expect(date).toBeFocused()
        expect(await date.evaluate((e) => e.matches(':focus-visible'))).toBe(true)
        await expect.poll(() => ring(date)).toEqual({ invalid: 'true', border: ACCENT, shadow: `${ACCENT} 0px 0px 0px 1px` })
        await dialog.getByRole('button', { name: 'Cancel' }).click()
        await expect(dialog).toHaveCount(0)
      } finally {
        await removeDraft(page, slug)
      }
    })
  }
})
