import AxeBuilder from '@axe-core/playwright'
import sharp from 'sharp'
import type { Locator, Page, Route } from '@playwright/test'
import { test, expect, ADMIN, adminCleanup, loginAsAdmin, settle } from './fixtures'

/**
 * Review round 3, accessibility and interaction fixes (UX-A-1 … UX-A-12):
 *
 *   - UX-A-1  a selected figure's caption / video's title stays readable in
 *             the light theme (the hidden node selection painted it white)
 *   - UX-A-2  Tab into the footer of a review page never leaves the focused
 *             link behind the fixed "Preview" bar (WCAG 2.2 SC 2.4.11)
 *   - UX-A-3  editor prompts, errors, the block menu's Delete, the island's
 *             Done / the video's Apply and the CV audience menu meet 4.5:1
 *   - UX-A-4  "Create & copy link" says it copied: the new row's button and
 *             the dialog's polite status line
 *   - UX-A-5  the block island's source textarea has a name; the hint names
 *             the platform's shortcut
 *   - UX-A-6  Alt+F10 into the table toolbar shows the focus ring, also
 *             after a mouse click into the cell
 *   - UX-A-7  the schedule dialog hands focus back to the Publish button
 *             (the sheet's "Schedule…" is gone) or to ⋯
 *   - UX-A-8  controls that remove themselves hand focus on, never to <body>
 *   - UX-A-9  a past or emptied publish time is explained, in a live region
 *             linked to the fields and to the disabled Schedule button
 *   - UX-A-10 solid red confirm buttons meet 4.5:1 in light mode
 *   - UX-A-11 video and figure controls are 24px targets (SC 2.5.8)
 *   - UX-A-12 the visual-fidelity banner is not re-announced at every pause
 *
 * Every test makes its own synthetic draft (or serves synthetic data to the
 * page) and deletes what it made. Admin-only: needs ADMIN_EMAIL / ADMIN_PASS.
 */

const today = () => new Date().toISOString().slice(0, 10)

async function adminFetch(page: Page, method: string, url: string, body?: unknown) {
  return page.evaluate(
    async ([m, u, b]) => {
      const res = await fetch(u as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })
      return { status: res.status, text: await res.text() }
    },
    [method, url, body] as const,
  )
}

async function createDraft(page: Page, slug: string, body: string, title = 'E2E review r3', draft = true) {
  const out = await adminFetch(page, 'PUT', '/api/admin/posts', {
    slug,
    create: true,
    frontmatter: { title, date: today(), draft, description: 'Created by the review-r3 end-to-end suite; deleted afterwards.' },
    body,
  })
  expect(out.status, out.text).toBe(200)
}

/** A stored theme preference, so Chakra and the CSS tokens agree from the first paint. */
const useTheme = (page: Page, theme: 'light' | 'dark') => page.addInitScript((t) => window.localStorage.setItem('theme-preference', t), theme)

async function openEditor(page: Page, slug: string): Promise<Locator> {
  await page.goto(`/admin/blog/edit?slug=${slug}`)
  const prose = page.locator('.tt-prose')
  await expect(prose).toBeVisible()
  return prose
}

/** The caret right after `text` in the visual editor (set through the editor, the same on every platform). */
async function caretAfter(page: Page, text: string) {
  const ok = await page.evaluate((t) => {
    type Ed = {
      state: { doc: { descendants: (f: (n: { isText: boolean; text?: string }, pos: number) => boolean | void) => void } }
      commands: { setTextSelection: (p: number) => boolean }
      view: { focus: () => void }
    }
    const editor = (document.querySelector('.ProseMirror') as unknown as { editor?: Ed }).editor
    if (!editor) return false
    let at = -1
    editor.state.doc.descendants((n, pos) => {
      if (at >= 0) return false
      if (n.isText && n.text?.includes(t)) at = pos + n.text.indexOf(t) + t.length
    })
    if (at < 0) return false
    editor.commands.setTextSelection(at)
    editor.view.focus()
    return true
  }, text)
  expect(ok, `caret after "${text}"`).toBe(true)
}

/** axe over part of the page, for the given rules only; returns the violations' ids and targets. */
async function axeRules(page: Page, include: string, rules: string[]) {
  await settle(page)
  const result = await new AxeBuilder({ page }).include(include).withRules(rules).analyze()
  return result.violations.map((v) => ({ id: v.id, targets: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} — ${n.failureSummary?.split('\n').pop()?.trim()}`) }))
}

/** Grey-level spread (max − min) of an element's pixels: near 0 when its text cannot be seen. */
async function inkSpread(locator: Locator): Promise<number> {
  const raw = await sharp(await locator.screenshot()).greyscale().raw().toBuffer()
  let min = 255
  let max = 0
  for (const v of raw) {
    if (v < min) min = v
    if (v > max) max = v
  }
  return max - min
}

/** The text colour a selection paints over an element, and the element's own. */
const selectionColours = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement
    return { selection: getComputedStyle(el, '::selection').color, own: getComputedStyle(el).color }
  }, selector)

/** Separate clients for the write limits (lib/mdx-admin: 30 saves per 10 minutes per client). */
let clients = 0
const clientHeaders = () => ({ 'cf-connecting-ip': `192.0.2.${(clients++ % 250) + 1}` })

const FIGURE_AND_VIDEO = ['Above.', '', '![](/images/hero/hero-mountains-1600.webp "Example landscape")', '', '[Example walkthrough](https://www.youtube.com/watch?v=jkAqK3vqILI)', '', 'A closing paragraph.'].join('\n')

/** Synthetic CV variants and private links served to the page (nothing is written). */
async function serveShareLinks(page: Page) {
  const now = Date.now()
  const variant = { id: 'vexample01', name: 'Example variant', pageTarget: null, sections: [{ name: 'personalInformation' }], createdAt: now, updatedAt: now }
  const link = { id: 'lexample0001', variantId: variant.id, lang: 'en', note: 'Example link', createdAt: now, expiresAt: now + 7 * 86_400_000, revokedAt: null as number | null, openCount: 0, lastOpenedDay: null, state: 'active' }
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers: { ETag: '"e2e-r3"' }, body: JSON.stringify(body) })
  await page.route('**/api/admin/cv-variants', (route) =>
    route.request().method() === 'GET' ? json(route, { variants: [variant], keyConfigured: true }) : json(route, { en: { pages: 1, lastPageFill: 0.5 }, zh: null }),
  )
  await page.route('**/api/admin/security/recent', (route) => json(route, { recent: true }))
  await page.route('**/api/admin/cv-share-links', (route) => {
    const method = route.request().method()
    if (method === 'POST') return json(route, { path: `/cv/r/${'A'.repeat(43)}` })
    if (method === 'PATCH') {
      link.revokedAt = Date.now()
      link.state = 'revoked'
      return json(route, { link })
    }
    return json(route, { links: [link] })
  })
  await page.goto('/admin/dashboard?tab=cv&view=variants')
  const revoke = page.getByRole('button', { name: 'Revoke Example link' })
  await expect(revoke).toBeVisible()
  return revoke
}

/** A review link to a long synthetic draft, made through the admin API: its address. */
async function reviewLinkTo(page: Page, slug: string): Promise<string> {
  const paragraphs = Array.from({ length: 24 }, (_, i) => `Paragraph ${i + 1} of a long synthetic draft that keeps the footer far below the first screen.`)
  await createDraft(page, slug, ['An opening line with [an example link](https://example.com).', '', ...paragraphs.flatMap((p) => [p, ''])].join('\n'), 'E2E review r3 long draft')
  const out = await adminFetch(page, 'POST', '/api/admin/review-links', { collection: 'blog', slug, ttlHours: 1, label: 'Example reviewer' })
  expect(out.status, out.text).toBeLessThan(300)
  const path = (JSON.parse(out.text) as { link?: { path?: string } }).link?.path || ''
  expect(path).toMatch(/^\/review\//)
  return new URL(path, page.url()).toString()
}

test.describe('review-r3 accessibility fixes', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  test.use({ actionTimeout: 15_000 })

  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders(clientHeaders())
  })

  test('UX-A-1: a selected figure’s caption and video’s title stay readable in the light theme @admin', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await useTheme(page, 'light')
    await loginAsAdmin(page)
    const slug = `e2e-r3-select-${Date.now()}`
    await createDraft(page, slug, FIGURE_AND_VIDEO)
    try {
      const prose = await openEditor(page, slug)
      const figure = prose.locator('figure.tt-figure')
      const caption = figure.getByRole('textbox', { name: 'Caption' })
      await expect(caption).toHaveValue('Example landscape')
      // A click on the image, then the keyboard path (↓ from the line above): the same node selection.
      await figure.locator('img').click()
      await expect(figure).toHaveAttribute('data-selected', 'true')
      await expect(page.locator('.ProseMirror')).toHaveClass(/ProseMirror-hideselection/)
      const byClick = await selectionColours(page, '.tt-figure-caption')
      expect(byClick.selection, 'the selection paints the caption in its own colour').toBe(byClick.own)
      expect(await inkSpread(caption), 'caption text visible after a click').toBeGreaterThan(100)
      await caretAfter(page, 'Above.')
      await page.keyboard.press('ArrowDown')
      await expect(figure).toHaveAttribute('data-selected', 'true')
      expect(await inkSpread(caption), 'caption text visible after ↓').toBeGreaterThan(100)

      const video = prose.locator('.tt-video')
      const title = video.getByRole('textbox', { name: 'Video title' })
      await expect(title).toHaveValue('Example walkthrough')
      await video.locator('.tt-video-frame').click()
      await expect(video).toHaveAttribute('data-selected', 'true')
      const vt = await selectionColours(page, '.tt-video-title')
      expect(vt.selection).toBe(vt.own)
      expect(await inkSpread(title), 'video title visible after a click').toBeGreaterThan(100)

      // Ordinary text selection keeps the site's white on accent.
      await caretAfter(page, 'A closing')
      const para = await selectionColours(page, '.tt-prose > p:last-of-type')
      expect(para.selection).toBe('rgb(255, 255, 255)')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('UX-A-11: the video’s title, link and Change link and the figure’s caption are 24px targets @admin', async ({ page }) => {
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 })
      if (width === 1440) await loginAsAdmin(page)
      const slug = `e2e-r3-targets-${width}-${Date.now()}`
      await createDraft(page, slug, FIGURE_AND_VIDEO)
      try {
        const prose = await openEditor(page, slug)
        const video = prose.locator('.tt-video')
        await video.locator('.tt-video-frame').click()
        await expect(video).toHaveAttribute('data-selected', 'true')
        for (const target of [video.getByRole('textbox', { name: 'Video title' }), video.getByRole('link', { name: /Open on YouTube/ }), video.getByRole('button', { name: 'Change link' })]) {
          const label = await target.evaluate((el) => el.textContent?.trim() || el.getAttribute('aria-label') || el.tagName)
          expect((await target.boundingBox())?.height ?? 0, `${width}px: ${label}`).toBeGreaterThanOrEqual(24)
        }
        expect(await axeRules(page, '.tt-video', ['target-size']), `${width}px: video`).toEqual([])
        const figure = prose.locator('figure.tt-figure')
        await figure.locator('img').click()
        await expect(figure).toHaveAttribute('data-selected', 'true')
        expect((await figure.getByRole('textbox', { name: 'Caption' }).boundingBox())?.height ?? 0, `${width}px: caption`).toBeGreaterThanOrEqual(24)
        expect(await axeRules(page, 'figure.tt-figure', ['target-size']), `${width}px: figure`).toEqual([])
      } finally {
        await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
      }
    }
  })

  test('UX-A-3: editor prompts, hints, errors, Apply and the block menu’s Delete are AA in the light theme @admin', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await useTheme(page, 'light')
    await loginAsAdmin(page)
    const slug = `e2e-r3-contrast-${Date.now()}`
    await createDraft(page, slug, FIGURE_AND_VIDEO)
    try {
      const prose = await openEditor(page, slug)
      const figure = prose.locator('figure.tt-figure')
      await expect(figure).toContainText('Missing — describe what the image shows')
      expect(await axeRules(page, 'figure.tt-figure', ['color-contrast']), 'missing-alt prompt').toEqual([])
      await figure.getByRole('textbox', { name: /Alt text/ }).fill('IMG_1234.jpg')
      await expect(figure).toContainText('That looks like a file name')
      expect(await axeRules(page, 'figure.tt-figure', ['color-contrast']), 'file-name hint').toEqual([])

      const video = prose.locator('.tt-video')
      await video.locator('.tt-video-frame').click()
      await video.getByRole('button', { name: 'Change link' }).click()
      await video.getByRole('textbox', { name: 'YouTube or Vimeo link' }).fill('not a video link')
      await video.getByRole('button', { name: 'Apply' }).click()
      await expect(video.getByRole('alert')).toContainText('isn’t a YouTube or Vimeo')
      await page.mouse.move(0, 0)
      expect(await axeRules(page, '.tt-video', ['color-contrast']), 'video link error and Apply').toEqual([])
      await page.keyboard.press('Escape')

      await prose.getByText('A closing paragraph.').hover()
      await page.getByRole('button', { name: 'Block actions — drag to move' }).click()
      await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
      await page.mouse.move(0, 0)
      expect(await axeRules(page, '[role="menu"]', ['color-contrast']), 'block menu').toEqual([])
      await page.keyboard.press('Escape')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('UX-A-5 / UX-A-3: the MDX island source has a name and the platform’s shortcut; its error and Done are AA @admin', async ({ page }) => {
    await useTheme(page, 'light')
    // A Windows browser, whatever machine runs the suite: the hint says Ctrl.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' })
      Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => ({ platform: 'Windows' }) })
    })
    await loginAsAdmin(page)
    const slug = `e2e-r3-island-${Date.now()}`
    await createDraft(page, slug, 'Before.\n\n<Figure src="/icons/icon-512.png" alt="Icon" />')
    try {
      const prose = await openEditor(page, slug)
      const island = prose.locator('.tt-mdx-block')
      await island.getByRole('button', { name: /Edit the source/ }).click()
      const source = island.locator('textarea')
      await expect(source).toBeFocused()
      await expect(source).toHaveAccessibleName('MDX source: <Figure>')
      await expect(source).toHaveAccessibleDescription('Ctrl+↵ apply · Esc cancel')
      await expect(source).toHaveAttribute('aria-keyshortcuts', 'Control+Enter Escape')
      expect(await axeRules(page, '.tt-mdx-block', ['label', 'color-contrast']), 'island editor').toEqual([])
      await source.fill('<Figure src="/icons/icon-512.png" alt="Icon"')
      await island.getByRole('button', { name: 'Done' }).click()
      await expect(island.getByRole('alert')).toContainText('line')
      await page.mouse.move(0, 0)
      expect(await axeRules(page, '.tt-mdx-block', ['color-contrast']), 'island error and Done').toEqual([])
      await page.keyboard.press('Escape')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('UX-A-6: Alt+F10 after a mouse click into a cell shows the focus ring, in light and dark @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-r3-table-${Date.now()}`
    await createDraft(page, slug, 'Start here.\n\n| Name | Score |\n| - | - |\n| Ada | 42 |')
    try {
      for (const theme of ['light', 'dark'] as const) {
        await page.evaluate((t) => window.localStorage.setItem('theme-preference', t), theme)
        const prose = await openEditor(page, slug)
        await prose.locator('table.tt-table').getByText('42').click()
        await page.waitForTimeout(300)
        await page.keyboard.press('Alt+F10')
        const first = page.getByRole('toolbar', { name: /Table/ }).getByRole('button', { name: 'Row above' })
        await expect(first).toBeFocused()
        const ring = await first.evaluate((el) => {
          const s = getComputedStyle(el)
          return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor }
        })
        expect(ring.style, theme).toBe('solid')
        expect(ring.width, theme).toBe('2px')
        expect(ring.color, `${theme}: the accent ring, not a transparent outline`).toBe('rgb(99, 102, 241)')
      }
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('UX-A-7: the schedule dialog hands focus back to “Publish…” (from the sheet) or to ⋯ (from the menu) @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-r3-sched-focus-${Date.now()}`
    await createDraft(page, slug, 'A draft that the review-r3 suite opens the schedule dialog for.')
    try {
      await openEditor(page, slug)
      const publish = page.getByRole('button', { name: 'Publish…' })
      const more = page.getByRole('button', { name: 'More actions' })
      const dialog = page.getByTestId('schedule-dialog')
      for (const close of ['Escape', 'Cancel'] as const) {
        await publish.click()
        await page.getByRole('dialog').getByRole('button', { name: 'Schedule…' }).click()
        await expect(dialog).toBeVisible()
        if (close === 'Escape') await page.keyboard.press('Escape')
        else await dialog.getByRole('button', { name: 'Cancel' }).click()
        await expect(dialog).toBeHidden()
        await expect(publish, `closed with ${close}`).toBeFocused()
      }
      // From the ⋯ menu → back on ⋯. The pause lets the closed menu's own refocus run first: the
      // dialog then closes in a commit that re-merges the menu button's ref (a plain ref is null there).
      for (const pause of [0, 400]) {
        await more.click()
        await page.getByRole('menuitem', { name: 'Schedule…' }).click()
        await expect(dialog).toBeVisible()
        await page.waitForTimeout(pause)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(more, `after a ${pause}ms pause`).toBeFocused()
      }
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('UX-A-9: a past or emptied time is explained in a live region the fields and the disabled Schedule point at @admin', async ({ page }) => {
    await useTheme(page, 'light')
    await loginAsAdmin(page)
    const slug = `e2e-r3-sched-why-${Date.now()}`
    await createDraft(page, slug, 'A draft that the review-r3 suite opens the schedule dialog for.')
    try {
      await openEditor(page, slug)
      await page.getByRole('button', { name: 'More actions' }).click()
      await page.getByRole('menuitem', { name: 'Schedule…' }).click()
      const dialog = page.getByTestId('schedule-dialog')
      const group = dialog.getByRole('group', { name: 'Publish' })
      const date = group.getByLabel('Date', { exact: true })
      const time = group.getByLabel(/^Time/)
      const msg = dialog.getByTestId('schedule-publish-msg')
      const schedule = dialog.getByRole('button', { name: 'Schedule', exact: true })
      // The message region is in the page before anything goes wrong.
      await expect(msg).toHaveAttribute('aria-live', 'polite')
      await expect(msg).toContainText('Goes live')
      await expect(date).not.toHaveAttribute('aria-invalid', 'true')
      const msgId = (await msg.getAttribute('id')) || ''
      await date.fill('2020-01-01')
      await expect(msg).toContainText('That time has passed')
      for (const field of [date, time]) {
        await expect(field).toHaveAttribute('aria-invalid', 'true')
        await expect(field).toHaveAttribute('aria-describedby', new RegExp(msgId.replace(/[:.]/g, '\\$&')))
      }
      await expect(schedule).toBeDisabled()
      await expect(schedule).toHaveAccessibleDescription(/That time has passed/)
      await date.fill('')
      await expect(msg).toContainText('Pick a date and a time.')
      await expect(schedule).toHaveAccessibleDescription('Pick a date and a time.')
      // The unpublish picker says the same for its own emptied date.
      await dialog.getByText('Unpublish it again later').click()
      const unpublishMsg = dialog.getByTestId('schedule-unpublish-msg')
      await expect(unpublishMsg).toContainText('Unpublishes')
      await dialog.locator('input[type="date"]').nth(1).fill('')
      await expect(unpublishMsg).toContainText('Pick a date and a time.')
      expect(await axeRules(page, '[data-testid="schedule-dialog"]', ['color-contrast', 'aria-valid-attr-value']), 'schedule dialog').toEqual([])
      await page.keyboard.press('Escape')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }

    // A live post with nothing to publish can only unpublish later: until that is ticked, Schedule says why it is off.
    const live = `e2e-r3-sched-live-${Date.now()}`
    await createDraft(page, live, 'A live post the review-r3 suite opens the schedule dialog for.', 'E2E review r3 live', false)
    try {
      await openEditor(page, live)
      await page.getByRole('button', { name: 'More actions' }).click()
      await page.getByRole('menuitem', { name: 'Schedule…' }).click()
      const dialog = page.getByTestId('schedule-dialog')
      const schedule = dialog.getByRole('button', { name: 'Schedule', exact: true })
      await expect(schedule).toBeDisabled()
      await expect(dialog.getByText('Tick “Unpublish automatically” to pick when.')).toBeVisible()
      await expect(schedule).toHaveAccessibleDescription('Tick “Unpublish automatically” to pick when.')
      await dialog.getByText('Unpublish automatically', { exact: true }).click()
      await expect(schedule).toBeEnabled()
      await expect(dialog.getByText('Tick “Unpublish automatically” to pick when.')).toHaveCount(0)
      await page.keyboard.press('Escape')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${live}`)
    }
  })

  test('UX-A-10 / UX-A-8: the unschedule confirm is white on red.600; unscheduling from the banner keeps focus @admin', async ({ page }) => {
    await useTheme(page, 'light')
    await loginAsAdmin(page)
    const slug = `e2e-r3-unschedule-${Date.now()}`
    await createDraft(page, slug, 'A draft that the review-r3 suite schedules and unschedules.')
    try {
      await openEditor(page, slug)
      await page.getByRole('button', { name: 'More actions' }).click()
      await page.getByRole('menuitem', { name: 'Schedule…' }).click()
      const dialog = page.getByTestId('schedule-dialog')
      await dialog.getByRole('button', { name: /^Tomorrow morning/ }).click()
      await dialog.getByRole('button', { name: 'Schedule', exact: true }).click()
      await expect(dialog).toBeHidden()
      const banner = page.getByTestId('schedule-banner')
      await banner.getByRole('button', { name: 'Unschedule' }).click()
      const confirm = banner.getByRole('button', { name: 'Confirm — unschedule' })
      await expect(confirm).toBeFocused()
      await page.mouse.move(0, 0)
      await settle(page)
      expect(await confirm.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(197, 48, 48)')
      expect(await axeRules(page, '[data-testid="schedule-banner"]', ['color-contrast']), 'unschedule confirm').toEqual([])
      // The banner goes away under the focus: focus lands on "Publish…", not on <body>.
      await page.keyboard.press('Enter')
      await expect(banner).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Publish…' })).toBeFocused()
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('UX-A-4 / UX-A-8: Create & copy link says it copied; turning a link off keeps focus on its row @admin', async ({ page }) => {
    await loginAsAdmin(page)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
    const slug = `e2e-r3-copy-${Date.now()}`
    await createDraft(page, slug, 'A draft the review-r3 suite shares for review.')
    try {
      await openEditor(page, slug)
      await page.getByRole('button', { name: 'More actions' }).click()
      await page.getByRole('menuitem', { name: 'Share for review…' }).click()
      const dialog = page.getByTestId('review-links-dialog')
      await dialog.getByLabel(/^Note/).fill('Example reviewer')
      // What the status regions that are in the dialog BEFORE the click come to say
      // (a region inserted with its words already in it is often not read out).
      await page.evaluate(() => {
        const w = window as unknown as { __announced: string[] }
        w.__announced = []
        const box = document.querySelector('[data-testid="review-links-dialog"]') as HTMLElement
        const regions = Array.from(box.querySelectorAll('[role="status"]'))
        new MutationObserver(() => {
          for (const region of regions) {
            const text = (region.textContent || '').trim()
            if (text && !w.__announced.includes(text)) w.__announced.push(text)
          }
        }).observe(box, { subtree: true, childList: true, characterData: true })
      })
      await dialog.getByRole('button', { name: 'Create & copy link' }).click()
      const row = dialog.getByTestId('review-link').first()
      await expect(row).toContainText('Example reviewer')
      await expect(row.getByRole('button', { name: /^Copy the review link/ })).toHaveText('Copied')
      await expect.poll(() => page.evaluate(() => (window as unknown as { __announced: string[] }).__announced)).toContain('Review link created and copied to the clipboard.')
      const url = (await row.getByTestId('review-link-url').textContent()) || ''
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url)

      // Turned off from the keyboard: focus stays on the link's row, which says "off".
      await row.getByRole('button', { name: /^Turn off the review link/ }).focus()
      await page.keyboard.press('Enter')
      await expect(row.getByRole('button', { name: 'Confirm: turn this review link off' })).toBeFocused()
      await page.keyboard.press('Enter')
      const off = dialog.locator('[data-testid="review-link"][data-status="revoked"]')
      await expect(off).toBeFocused()
      await expect(off.getByRole('status')).toHaveText('Review link turned off')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('UX-A-2: tabbing through a review page never leaves a footer link behind the Preview bar (375 and 1440) @admin', async ({ page, browser }) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    const slug = `e2e-r3-review-${Date.now()}`
    try {
      const url = await reviewLinkTo(page, slug)
      for (const viewport of [
        { width: 375, height: 700 },
        { width: 1440, height: 800 },
      ]) {
        const reader = await browser.newContext({ viewport })
        try {
          const p = await reader.newPage()
          await p.goto(url)
          await expect(p.getByTestId('review-bar')).toBeVisible()
          const seen: string[] = []
          const hidden: string[] = []
          let inFooter = false
          for (let i = 0; i < 160; i++) {
            await p.keyboard.press('Tab')
            const at = await p.evaluate(async () => {
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
              const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
              const bar = document.querySelector('[data-testid="review-bar"]')!.getBoundingClientRect()
              return { where: 'footer' as const, label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), visible: !!hit && el.contains(hit), top: Math.round(box.top), barTop: Math.round(bar.top) }
            })
            if (at.where === 'footer') {
              inFooter = true
              seen.push(at.label)
              if (!at.visible) hidden.push(`${at.label} (top ${at.top}, bar ${at.barTop})`)
            } else if (inFooter) break
          }
          expect(seen.length, `${viewport.width}px: footer links reached`).toBeGreaterThan(3)
          expect(hidden, `${viewport.width}px: footer links hidden behind the review bar`).toEqual([])
        } finally {
          await reader.close()
        }
      }
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('UX-A-8: CV private links — Keep, Revoke and Done hand focus on @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const revoke = await serveShareLinks(page)
    await revoke.click()
    const group = page.getByRole('group', { name: 'Confirm revoking' })
    await group.getByRole('button', { name: 'Keep' }).focus()
    await page.keyboard.press('Enter')
    await expect(revoke).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(group.getByRole('button', { name: 'Revoke' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Remove Example link from the list' })).toBeFocused()

    const note = page.getByPlaceholder(/Who it is for/)
    await note.fill('Example Corp')
    await page.getByRole('button', { name: 'Make link' }).click()
    await expect(page.getByLabel('Private link', { exact: true })).toHaveValue(/\/cv\/r\/A{43}$/)
    await page.getByRole('button', { name: 'Done' }).focus()
    await page.keyboard.press('Enter')
    await expect(note).toBeFocused()
  })

  test('UX-A-10: the CV link’s Revoke confirm (solid red) is AA in the light theme @admin', async ({ page }) => {
    await useTheme(page, 'light')
    await loginAsAdmin(page)
    const revoke = await serveShareLinks(page)
    await revoke.click()
    await page.mouse.move(0, 0)
    expect(await axeRules(page, '[role="group"][aria-label="Confirm revoking"]', ['color-contrast']), 'Revoke confirm').toEqual([])
  })

  test('UX-A-8: analytics — a removed filter chip hands focus on; the custom range returns to Period @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const report = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/analytics' && !new URL(r.url()).searchParams.has('values'))
    await page.goto(`/admin/dashboard?tab=analytics&f=${encodeURIComponent('page:is:/nope')}&f=${encodeURIComponent('device:is:desktop')}`)
    expect((await report).status()).toBe(200)
    const chips = page.getByRole('list', { name: 'Active filters' })
    await expect(chips.getByRole('listitem')).toHaveCount(3)
    await chips.getByRole('button', { name: 'Remove filter: Page is /nope' }).focus()
    await page.keyboard.press('Enter')
    await expect(chips.getByRole('button', { name: 'Remove filter: Device is Desktop' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Filter', exact: true })).toBeFocused()

    const period = page.getByTestId('period-button')
    await period.click()
    await page.getByRole('menuitem', { name: 'Custom range…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Custom range' })
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(400)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(period).toBeFocused()
  })

  test('UX-A-3: the CV audience menu keeps AA hints on the focused row in dark mode @admin', async ({ page }) => {
    await useTheme(page, 'dark')
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard?tab=cv')
    await page.getByRole('navigation', { name: 'CV sections' }).getByText('Personal Info').first().click()
    const toggle = page.locator('[data-audience-toggle]').first()
    await expect(toggle).toBeVisible()
    await toggle.click()
    const menu = page.getByRole('menu').filter({ has: page.getByRole('menuitemcheckbox') })
    await expect(menu).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(menu.locator('[role="menuitemcheckbox"]:focus')).toHaveCount(1)
    await page.mouse.move(0, 0)
    expect(await axeRules(page, '[role="menu"]', ['color-contrast']), 'audience menu, focused row').toEqual([])
    await page.keyboard.press('Escape')
  })

  test('UX-A-12: typing JSX in the MDX tab announces the visual editor’s state once, not at every pause @admin', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/blog/edit')
    await expect(page.locator('.tt-prose')).toBeVisible()
    // The live preview would compile the half-typed body (422s the browser logs).
    await page.getByRole('button', { name: /Hide preview/ }).click()
    await page.getByRole('tab', { name: 'MDX' }).click()
    await page.locator('textarea').first().click()
    await page.evaluate(() => {
      const w = window as unknown as { __alertChanges: number; __live: string[] }
      w.__alertChanges = 0
      w.__live = []
      new MutationObserver((records) => {
        for (const r of records) {
          const node = r.target instanceof Element ? r.target : r.target.parentElement
          const added = r.type === 'childList' && Array.from(r.addedNodes).some((n) => n instanceof Element && (n.matches('[role="alert"]') || !!n.querySelector('[role="alert"]')))
          if (node?.closest('[role="alert"]') || added) w.__alertChanges++
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true })
      const live = document.querySelector('[data-testid="editor-live"]') as HTMLElement
      new MutationObserver(() => {
        const text = (live.textContent || '').trim()
        if (text) w.__live.push(text)
      }).observe(live, { subtree: true, childList: true, characterData: true })
    })
    for (const chunk of ['<Callout ', 'type="note">', 'Some ', 'text', '</Callout']) {
      await page.keyboard.type(chunk)
      await page.waitForTimeout(700)
    }
    const banner = page.getByTestId('visual-fidelity')
    await expect(banner).toContainText('not valid MDX')
    await expect(banner).not.toHaveAttribute('role', 'alert')
    await page.keyboard.type('>')
    await expect(banner).toHaveCount(0)
    await page.waitForTimeout(300)
    const { alerts, live } = await page.evaluate(() => {
      const w = window as unknown as { __alertChanges: number; __live: string[] }
      return { alerts: w.__alertChanges, live: w.__live }
    })
    expect(alerts, 'no assertive alert changed while typing').toBe(0)
    expect(live.filter((t) => /not valid MDX/.test(t)), 'the invalid state is announced once').toHaveLength(1)
    expect(live.at(-1)).toBe('The MDX is valid again.')
  })
})
