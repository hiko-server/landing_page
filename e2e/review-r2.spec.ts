import { devices, type Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, settle } from './fixtures'

/**
 * Review round 2 fixes (stream review-fixes-r2):
 *   - UX-A-1: on a phone, a toast sits above the /cv action bar, never on it
 *   - UX-A-2: Ask's Chinese words carry lang="zh-Hans" (status, no answer,
 *     "ask more specifically", the "Ask: …" row's hint and badge)
 *   - UX-A-3: "Ask Lucian directly" on /contact focuses the message and says so
 *   - UX-A-4: "?" on a touch screen with a hardware keyboard lists every shortcut
 *   - VISU-3: the Keyboard shortcuts page keeps a usable field at 320–1440
 *   - VISU-1 / VISU-2: a small cover morphs as panel + logo; the morph's
 *     outgoing title and page fade first
 *   - @admin UX-A-5 (j / k from a clicked panel), UX-A-6 / UX-A-7 / VISU-5
 *     (contrast), UX-A-8 (scrollable tables), VISU-4 (summary cards),
 *     VISU-6 (the editor header on phones and tablets)
 *
 * Production-safe without @admin: only GETs and in-page actions (the Ask
 * hand-off fills the contact form but never sends it). The @admin tests read
 * only; the Inbox ones serve synthetic messages to the page.
 */

const chromiumOnly = (project: string) => project !== 'chromium'

/** WCAG contrast of two computed colours (the second opaque; the first may be translucent). */
async function contrastOf(page: Page, fg: string, bg: string): Promise<number> {
  return page.evaluate(
    ([f, b]) => {
      const parse = (s: string) => (s.match(/[\d.]+/g) || []).map(Number)
      const [fr, fg2, fb, fa = 1] = parse(f)
      const [br, bg2, bb] = parse(b)
      const mix = [fr * fa + br * (1 - fa), fg2 * fa + bg2 * (1 - fa), fb * fa + bb * (1 - fa)]
      const lum = (rgb: number[]) => {
        const [r, g, bl] = rgb.map((v) => {
          const c = v / 255
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl
      }
      const [x, y] = [lum(mix), lum([br, bg2, bb])].sort((p, q) => q - p)
      return (x + 0.05) / (y + 0.05)
    },
    [fg, bg] as const,
  )
}

/** The first opaque background behind an element. */
const opaqueBackground = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor
      if (c && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(c)) return c
    }
    return getComputedStyle(document.body).backgroundColor
  }, selector)

test.describe('public review-r2 fixes', () => {
  test('UX-A-1: on a phone, an error toast sits above the /cv action bar; every bar control stays reachable', async ({ browser, baseURL }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'emulates its own phone')
    const context = await browser.newContext({ ...devices['Pixel 7'], baseURL })
    try {
      const page = await context.newPage()
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } })
        document.execCommand = () => false
      })
      await page.goto('/cv')
      const bar = page.getByRole('navigation', { name: 'CV actions' })
      await expect(bar).toBeVisible()
      await page.getByRole('button', { name: 'Open command palette' }).first().tap()
      await page.getByRole('combobox').fill('copy page link')
      await page.getByRole('option').first().tap()
      const alert = page.locator('.chakra-toast [role="alert"]')
      await expect(alert).toContainText('Copy failed')
      await expect(page.locator('.chakra-toast').first()).toHaveCSS('opacity', '1')
      const toastBox = (await alert.boundingBox())!
      const barBox = (await bar.boundingBox())!
      expect(toastBox.y + toastBox.height, 'the toast ends above the bar').toBeLessThanOrEqual(barBox.y + 0.5)
      // Every control of the bar is the topmost element at its centre.
      const covered = await bar.evaluate((nav) =>
        Array.from(nav.querySelectorAll<HTMLElement>('a, button'))
          .filter((b) => b.getClientRects().length)
          .filter((b) => {
            const r = b.getBoundingClientRect()
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            return !hit || !b.contains(hit)
          })
          .map((b) => b.textContent?.trim() || b.getAttribute('aria-label')),
      )
      expect(covered).toEqual([])
    } finally {
      await context.close()
    }
  })

  test('UX-A-2: every Chinese word of Ask is inside lang="zh-Hans" — no answer, "ask more specifically", the status and the Ask row', async ({ page }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'once is enough')
    await page.goto('/about')
    await page.keyboard.press('ControlOrMeta+KeyK')
    const dialog = page.getByRole('dialog')
    const input = dialog.getByRole('combobox')
    const chineseOutsideZh = () =>
      dialog.evaluate((root) => {
        const out: string[] = []
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = (n.nodeValue || '').trim()
          if (!/\p{Script=Han}/u.test(text)) continue
          const lang = n.parentElement?.closest('[lang]')?.getAttribute('lang') || ''
          if (!/^zh/i.test(lang)) out.push(`${text} @ ${lang || '(none)'}`)
        }
        return out
      })

    // Search mode: the "Ask: …" row — label, hint and badge.
    await input.fill('他会弹钢琴吗？')
    await expect(dialog.getByRole('option').first()).toContainText('提问：他会弹钢琴吗？')
    expect(await chineseOutsideZh()).toEqual([])

    // Ask: no answer on the site.
    await dialog.getByRole('button', { name: 'Ask', exact: true }).click()
    await input.fill('他收集 zqxw 邮票吗？')
    await expect(dialog.getByRole('status')).toHaveText('本站没有答案')
    await expect(dialog.getByRole('status')).toHaveAttribute('lang', 'zh-Hans')
    await expect(dialog.getByRole('option', { name: /直接问 Lucian/ })).toBeVisible()
    expect(await chineseOutsideZh()).toEqual([])

    // Ask: too vague.
    await input.fill('他？')
    await expect(dialog.getByText(/请问得具体一些：/)).toBeVisible()
    expect(await chineseOutsideZh()).toEqual([])
  })

  test('UX-A-3: "Ask Lucian directly" on /contact moves focus to the filled message and says so', async ({ page }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'once is enough')
    await page.goto('/contact')
    const message = page.getByRole('textbox', { name: /^Message/ })
    await expect(message).toBeVisible()
    await page.keyboard.press('ControlOrMeta+KeyK')
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Ask', exact: true }).click()
    const question = 'Does he collect zqxw stamps?'
    await dialog.getByRole('combobox').fill(question)
    await expect(dialog.getByRole('option', { name: /Ask Lucian directly/ })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(message).toHaveValue(question)
    await expect(message).toBeFocused()
    // It stays there (the palette's focus trap let go), in view, and the change is announced.
    await page.waitForTimeout(400)
    await expect(message).toBeFocused()
    await expect(message).toBeInViewport()
    await expect(page.locator('[data-prefill-note]')).toHaveText(/Your question is in the Message field/)
    expect(new URL(page.url()).search).toBe('')
  })

  test('UX-A-4: "?" on a touch-first tablet with a hardware keyboard lists every shortcut', async ({ browser, baseURL }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'emulates its own tablet')
    const context = await browser.newContext({ ...devices['iPad Pro 11'], baseURL })
    try {
      const page = await context.newPage()
      await page.goto('/blog')
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'a touch-first device').toBe(true)
      // Before any key press the keyboard hints stay hidden (server HTML, no script needed).
      await expect(page.locator('html')).not.toHaveAttribute('data-keyboard', /.*/)
      // "?" on the page (not in a field): only a hardware keyboard makes that key press.
      await settle(page)
      await page.keyboard.press('Shift+Slash')
      await expect(page.getByRole('listbox', { name: 'Keyboard shortcuts' })).toBeVisible()
      const sheet = page.getByRole('dialog').getByRole('region', { name: 'Keyboard shortcuts' })
      await expect(sheet).toBeVisible()
      await expect(sheet.locator('dt').first()).toBeVisible()
      expect(await sheet.locator('dt').count()).toBeGreaterThan(5)
      await expect(sheet.locator('kbd').first()).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-keyboard', '')
    } finally {
      await context.close()
    }
  })

  test('VISU-3: the Keyboard shortcuts page keeps a usable field from 320 to 1440 px', async ({ page }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'sizes its own window')
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/blog')
      await settle(page)
      await page.keyboard.press('Shift+Slash')
      await expect(page.getByRole('listbox', { name: 'Keyboard shortcuts' })).toBeVisible()
      const dialog = page.getByRole('dialog')
      const input = dialog.getByRole('combobox')
      await expect(dialog.getByRole('button', { name: /Back to all commands/ })).toBeVisible()
      // No Search / Ask switch on a nested page; the field shows its whole placeholder.
      await expect(dialog.getByRole('group', { name: 'Palette mode' })).toHaveCount(0)
      const fit = await input.evaluate((el: HTMLInputElement) => {
        const cs = getComputedStyle(el)
        const ctx = document.createElement('canvas').getContext('2d')!
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        const box = el.closest('[role="dialog"]')!.getBoundingClientRect()
        const header = Array.from(el.parentElement!.children).map((c) => c.getBoundingClientRect())
        return {
          text: ctx.measureText(el.placeholder).width,
          content: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
          inside: header.every((r) => r.width === 0 || (r.left >= box.left - 0.5 && r.right <= box.right + 0.5)),
        }
      })
      expect(fit.content, `field width at ${width}`).toBeGreaterThanOrEqual(72)
      expect(fit.text, `placeholder fits at ${width}`).toBeLessThanOrEqual(fit.content)
      expect(fit.inside, `the header stays inside the dialog at ${width}`).toBe(true)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
    }
  })

  test('VISU-1 / VISU-2: a small cover morphs as panel + logo, and the outgoing title and page fade first', async ({ page }, testInfo) => {
    test.skip(chromiumOnly(testInfo.project.name), 'Chromium view transitions')
    await page.goto('/work')
    const small = page.locator('[data-cover="small"][data-vt-part="panel"]').first()
    test.skip((await small.count()) === 0, 'no small cover in this store')
    await expect(small.locator('img[data-vt-part="logo"]')).toHaveCount(1)
    const card = small.locator('xpath=ancestor::*[@data-vt-morph][1]')
    await card.scrollIntoViewIfNeeded()
    await page.evaluate(() => {
      const w = window as unknown as { __vt?: Array<[string, number, number]> }
      const orig = document.startViewTransition.bind(document)
      document.startViewTransition = ((arg: Parameters<typeof orig>[0]) => {
        const t = orig(arg)
        t.ready.then(() => {
          w.__vt = document
            .getAnimations()
            .map((a) => a.effect as KeyframeEffect)
            .filter((e) => e.pseudoElement?.startsWith('::view-transition'))
            .map((e) => [e.pseudoElement as string, Number(e.getTiming().duration), Number(e.getTiming().delay)])
        })
        return t
      }) as typeof document.startViewTransition
    })
    await card.locator('a').first().click()
    await page.waitForURL(/\/work\/.+/)
    const anims = (await page.waitForFunction(() => (window as unknown as { __vt?: Array<[string, number, number]> }).__vt).then((h) => h.jsonValue())) || []
    const timing = (name: string) => anims.find(([p]) => p === name)
    // Paired: the panel and the logo morph apart; the small panel is never a scaled "cover" snapshot.
    expect(timing('::view-transition-group(vt-morph-panel)')).toBeTruthy()
    expect(timing('::view-transition-group(vt-morph-logo)')).toBeTruthy()
    expect(timing('::view-transition-group(vt-morph-cover)')).toBeFalsy()
    const route = timing('::view-transition-group(vt-morph-title)')![1]
    expect(timing('::view-transition-old(vt-morph-title)')![1]).toBeCloseTo(route * 0.15, 0)
    expect(timing('::view-transition-old(root)')![1]).toBeCloseTo(route * 0.2, 0)
    const newRoot = timing('::view-transition-new(root)')!
    expect(newRoot[1]).toBeCloseTo(route * 0.5, 0)
    expect(newRoot[2]).toBeCloseTo(route * 0.5, 0)
  })
})

// ── @admin ─────────────────────────────────────────────────────────────────

const SYNTHETIC_INBOX = {
  messages: [0, 1, 2].map((i) => ({
    id: `e2e-r2-${i}`,
    at: new Date(Date.now() - (i + 1) * 3600_000).toISOString(),
    name: `Example Person ${i + 1}`,
    email: `person${i + 1}@example.com`,
    subject: `Synthetic message ${i + 1}`,
    message: 'A synthetic message for the review-r2 check.',
    delivered: true,
    read: i > 0,
    starred: false,
    archived: false,
    replied: false,
    replies: [],
  })),
  unread: 1,
  total: 3,
  storage: { backend: 'local', ok: true },
}

/** The Inbox with synthetic messages (GET only; nothing is written). */
async function syntheticInbox(page: Page) {
  await page.route(
    (url) => url.pathname === '/api/admin/inbox',
    (route) => (route.request().method() === 'GET' ? route.fulfill({ json: SYNTHETIC_INBOX }) : route.continue()),
  )
}

const withTheme = (page: Page, theme: 'light' | 'dark') =>
  page.addInitScript((t) => {
    try {
      localStorage.setItem('theme-preference', t)
    } catch {
      /* private mode */
    }
  }, theme)

test.describe('admin review-r2 fixes', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('@admin UX-A-5 / UX-A-6 / VISU-5: j / k work after a click on the panel; checkboxes and the star are findable', async ({ page }) => {
    await loginAsAdmin(page)
    await syntheticInbox(page)
    for (const theme of ['light', 'dark'] as const) {
      await withTheme(page, theme)
      await page.goto('/admin/dashboard?tab=inbox')
      const list = page.getByTestId('inbox-list')
      await expect(list.locator('[data-message-id]')).toHaveCount(3)
      await settle(page)

      // Contrast: the select box (≥ 3:1) and the unstarred star (≥ 3:1) against their row.
      const box = page.locator('.chakra-checkbox__control').first()
      const border = await box.evaluate((el) => getComputedStyle(el).borderTopColor)
      const bg = await opaqueBackground(page, '.chakra-checkbox__control')
      expect(await contrastOf(page, border, bg), `checkbox border (${theme})`).toBeGreaterThanOrEqual(3)
      const star = list.getByRole('button', { name: /^Star the message/ }).first()
      const starColor = await star.evaluate((el) => getComputedStyle(el).color)
      const starBg = await opaqueBackground(page, '[data-message-id] button[aria-pressed="false"]')
      expect(await contrastOf(page, starColor, starBg), `unstarred star (${theme})`).toBeGreaterThanOrEqual(3)
    }

    // A click on the panel's blank space focuses a tab panel (the dashboard's, or the
    // Inbox's folder panel inside it); j still moves into the list.
    const panel = page.locator('#dash-panel')
    const blank = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect()
      for (let y = r.top + 4; y < r.top + 240; y += 8)
        for (let x = r.right - 8; x > r.left + r.width / 2; x -= 16) {
          const hit = document.elementFromPoint(x, y)
          if (!hit || !el.contains(hit)) continue
          const control = hit.closest('a, button, input, select, textarea, label, [role="button"], [tabindex]:not([role="tabpanel"])')
          if (!control || !el.contains(control)) return { x, y }
        }
      return null
    })
    expect(blank, 'a blank point in the panel').toBeTruthy()
    await page.mouse.click(blank!.x, blank!.y)
    await expect(page.locator(':focus')).toHaveAttribute('role', 'tabpanel')
    await page.keyboard.press('j')
    await expect(page.getByTestId('inbox-list').locator('[data-list-item="0"]')).toBeFocused()
    await page.keyboard.press('j')
    await expect(page.getByTestId('inbox-list').locator('[data-list-item="1"]')).toBeFocused()
    // Typing in a field never moves the list.
    const search = page.getByRole('searchbox', { name: 'Search messages' })
    await search.click()
    await page.keyboard.press('j')
    await expect(search).toBeFocused()
    await expect(search).toHaveValue('j')
  })

  test('@admin UX-A-7: the Activity log’s area label is readable (≥ 11 px, ≥ 4.5:1) in both themes', async ({ page }) => {
    await loginAsAdmin(page)
    for (const theme of ['light', 'dark'] as const) {
      await withTheme(page, theme)
      await page.goto('/admin/system?view=activity')
      const row = page.locator('[data-list-item="0"]')
      await expect(row).toBeVisible()
      await settle(page)
      const label = await row.evaluate((el) => {
        const p = Array.from(el.querySelectorAll('p')).filter((n) => n.getClientRects().length).pop()!
        p.setAttribute('data-e2e-area', '')
        const cs = getComputedStyle(p)
        return { size: parseFloat(cs.fontSize), color: cs.color }
      })
      expect(label.size).toBeGreaterThanOrEqual(11)
      const bg = await opaqueBackground(page, '[data-e2e-area]')
      expect(await contrastOf(page, label.color, bg), `area label (${theme})`).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('@admin UX-A-8: on a phone, a table wider than the screen is a focusable, labelled region', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard?tab=analytics')
    await expect(page.getByRole('tabpanel')).toBeVisible()
    await settle(page)
    const containers = page.locator('.chakra-table__container')
    test.skip((await containers.count()) === 0, 'no analytics tables in this store yet')
    const states = await containers.evaluateAll((els) =>
      els.map((el) => ({
        overflows: el.scrollWidth - el.clientWidth > 1,
        focusable: el.getAttribute('tabindex') === '0',
        role: el.getAttribute('role'),
        label: el.getAttribute('aria-label'),
        hasFocusable: !!el.querySelector('a[href], button, input, [tabindex="0"]'),
      })),
    )
    for (const s of states) {
      if (!s.overflows) {
        expect(s.focusable, 'a table that fits adds no tab stop').toBe(false)
        continue
      }
      if (s.hasFocusable) continue
      expect(s.focusable).toBe(true)
      expect(s.role).toBe('region')
      expect(s.label).toBeTruthy()
    }
  })

  test('@admin VISU-4: the content health summary labels share one line', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/system?view=content')
    const links = page.locator('#ch-links')
    await expect(links).toBeVisible({ timeout: 20_000 })
    const tops = await page.evaluate(() => ({
      severity: Array.from(document.querySelectorAll('[data-severity] > p:first-child')).map((p) => Math.round(p.getBoundingClientRect().top)),
      links: Math.round(document.getElementById('ch-links')!.getBoundingClientRect().top),
    }))
    expect(tops.severity.length).toBe(3)
    for (const t of tops.severity) expect(Math.abs(t - tops.links)).toBeLessThanOrEqual(1)
  })

  test('@admin VISU-6: the editor header lines its rows up under the title on a phone and keeps the actions together on a tablet', async ({ page }) => {
    await loginAsAdmin(page)
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/admin/blog/edit')
      const bar = page.locator('[data-admin-titlebar]')
      const publish = bar.getByRole('button', { name: /^Publish/ })
      await expect(publish).toBeVisible()
      const m = await bar.evaluate((el) => {
        const h1 = el.querySelector('h1')!
        const titleBox = h1.getBoundingClientRect()
        // The status + actions group: the title block's sibling.
        const group = h1.parentElement!.parentElement!.nextElementSibling as HTMLElement
        const visible = Array.from(group.querySelectorAll<HTMLElement>('*')).filter((n) => n.getClientRects().length && n.getBoundingClientRect().width > 0)
        const rows = new Set(visible.filter((n) => n.matches('a, button')).map((b) => Math.round(b.getBoundingClientRect().top)))
        const g = group.getBoundingClientRect()
        const firstLeft = Math.min(...visible.map((n) => n.getBoundingClientRect().left))
        return { titleLeft: Math.round(titleBox.left), titleBottom: titleBox.bottom, groupTop: g.top, firstLeft: Math.round(firstLeft), rows: rows.size, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }
      })
      expect(m.scrollWidth, `no sideways scroll at ${width}`).toBeLessThanOrEqual(m.clientWidth)
      // The actions are one row — never a lone control on a row of its own …
      expect(m.rows, `one row of actions at ${width}`).toBe(1)
      // … and once the group wraps under the title, it starts at the title's edge (not hanging off the right).
      if (m.groupTop >= m.titleBottom) expect(m.firstLeft, `the wrapped rows start under the title at ${width}`).toBe(m.titleLeft)
    }
  })
})
