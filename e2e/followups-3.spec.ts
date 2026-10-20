import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import AxeBuilder from '@axe-core/playwright'
import type { APIRequestContext, Locator, Page } from '@playwright/test'
import { test, expect, settle, ADMIN, adminCleanup, loginAsAdmin } from './fixtures'
import { pdfText, squashSpace } from './pdfText'

/**
 * followups-3 (after the final batch), desktop Chromium.
 *
 * 1. ⌘K reopened while the last palette is still leaving (public).
 * 2. The media library's picker in the home editor (field-note photos,
 *    logos, the avatar) and CV Studio (the PDF photo) — @admin.
 * 3. An audience per bullet (E4): a bullet kept to downloads and private
 *    links is gone from /cv and /api/cvdata but in /cv.txt and the PDF; its
 *    "Shows on" chip in CV Studio, the A4 preview as /cv and as the PDF, and
 *    the Hidden items panel — @admin. The CV is restored afterwards.
 *
 * ── 1 ──
 *
 * The bug (found by patch-2b1): after the palette opened a page, the route
 * transition keeps the leaving dialog in the document, hidden, until it
 * settles (lib/viewTransition liftDismissibleLayers). ⌘K pressed then
 * brought that same dialog back: its field was hidden and could not take
 * focus, so the focus trap parked focus on the modal container — typing went
 * nowhere. Reproducible with the CPU slowed 6× (CDP CPU throttling). Now
 * every opening is a fresh dialog (components/General-UI/paletteSession.ts).
 *
 * Production-safe: only GETs and in-page actions.
 */

type IndexBody = { docs: Array<{ kind: string; title: string; href: string }> }

async function firstPost(request: APIRequestContext): Promise<{ title: string; href: string } | undefined> {
  const index = (await (await request.get('/api/search-index')).json()) as IndexBody
  return index.docs.find((d) => d.kind === 'post')
}

/** Every task on the page's main thread takes `rate` times longer. */
async function slowCpu(page: Page, rate: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
}

/** Palette layers (scrim and panel) in the document, shown or not. */
const paletteLayers = (page: Page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('.chakra-modal__content')).map((el) => getComputedStyle(el).visibility))

test.describe('⌘K reopened while the last palette is still leaving', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools feature')
  })

  test('⌘K again right after it opened a page, while the closing dialog is still on its way out: the new search field has focus at once and keeps it through the route transition; Escape hands focus to the new page (CPU 6× slower)', async ({ page, request }) => {
    const post = await firstPost(request)
    test.skip(!post, 'empty store: no post')
    await page.goto('/blog')
    await settle(page)
    await slowCpu(page, 6)
    await page.keyboard.press('ControlOrMeta+KeyK')
    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    const input = dialog.getByRole('combobox')
    await expect(input).toBeFocused()
    await input.fill(post!.title.slice(0, 24))
    await expect(dialog.getByRole('option').filter({ hasText: post!.title }).first()).toBeVisible()
    // ⌘K the moment the page starts to change (Next's routeChangeStart): the
    // dialog that opened it is still in the document, leaving — the window a
    // visitor's quick ⌘K falls into, hit every time. The route transition
    // then hides the overlays on screen as the page changes.
    await page.evaluate(() => {
      type Events = { on: (e: string, f: () => void) => void; off: (e: string, f: () => void) => void }
      const w = window as unknown as { next: { router: { events: Events } }; __reopen?: number }
      const events = w.next.router.events
      const onStart = () => {
        events.off('routeChangeStart', onStart)
        w.__reopen = document.querySelectorAll('.chakra-modal__content').length
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true }))
      }
      events.on('routeChangeStart', onStart)
    })
    await page.keyboard.press('Enter')
    await page.waitForURL(`**${post!.href}`)
    expect(await page.evaluate(() => (window as unknown as { __reopen?: number }).__reopen), 'the dialog that opened the page was still there at the reopen').toBe(1)

    await expect(input).toBeFocused()
    await expect(dialog).toBeVisible()
    // Typing goes into the field, and the palette works as usual.
    await page.keyboard.type('theme')
    await expect(input).toHaveValue('theme')
    await expect(dialog.getByRole('option').first()).toBeVisible()
    // Only the new dialog is left once the transition settled, shown, with the focus.
    await expect.poll(() => paletteLayers(page)).toEqual(['visible'])
    await expect(input).toBeFocused()

    // Escape: focus goes to the start of the new page — never the body or a hidden field.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('#main')).toBeFocused()
    expect(new URL(page.url()).pathname).toBe(post!.href)
  })

  test('reopened while the next page is still loading: it stays open over the new page with the field focused (CPU 6× slower)', async ({ page, request }) => {
    const post = await firstPost(request)
    test.skip(!post, 'empty store: no post')
    // The post's page data is held until the palette has been reopened.
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route(`**/_next/data/**${post!.href}.json*`, async (route) => {
      await gate
      await route.continue()
    })
    await page.goto('/blog')
    await settle(page)
    await slowCpu(page, 6)
    await page.keyboard.press('ControlOrMeta+KeyK')
    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    const input = dialog.getByRole('combobox')
    await expect(input).toBeFocused()
    await input.fill(post!.title.slice(0, 24))
    await expect(dialog.getByRole('option').filter({ hasText: post!.title }).first()).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(input).toBeFocused()
    await page.keyboard.type('cv')
    // The page arrives: the route transition leaves the open palette in place, shown, with its focus and text.
    release()
    await page.waitForURL(`**${post!.href}`)
    await expect(page.locator('main h1').first()).toBeVisible()
    await expect.poll(() => paletteLayers(page)).toEqual(['visible'])
    await expect(dialog).toBeVisible()
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('cv')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('closed with Escape and reopened before it faded out: a fresh, fully opaque dialog with the field focused; focus returns to the search button (CPU 6× slower)', async ({ page }) => {
    await page.goto('/blog')
    await settle(page)
    await slowCpu(page, 6)
    const trigger = page.getByRole('button', { name: 'Open command palette' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    const input = dialog.getByRole('combobox')
    await expect(input).toBeFocused()
    await settle(page)
    // How many palette layers are in the document when ⌘K arrives.
    await page.evaluate(() => {
      const w = window as unknown as { __layersAtK?: number }
      document.addEventListener(
        'keydown',
        (e) => {
          if (w.__layersAtK === undefined && e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) w.__layersAtK = document.querySelectorAll('.chakra-modal__content').length
        },
        { capture: true },
      )
    })
    // Escape starts the click-opened dialog's fade-out; ⌘K at once, while it runs.
    await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+KeyK')
    expect(await page.evaluate(() => (window as unknown as { __layersAtK: number }).__layersAtK), 'the closed dialog was still fading out').toBe(1)
    await expect(input).toBeFocused()
    // From the keyboard it opens without an entrance: never left half-faded.
    await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('.chakra-modal__content')).map((el) => getComputedStyle(el).opacity))).toEqual(['1'])
    // A nested page and back still work in the new dialog: Theme ›, then Backspace; Escape closes.
    const themeEntry = dialog.getByRole('option').filter({ hasText: /^Theme/ })
    await expect(themeEntry).toBeVisible()
    await themeEntry.click()
    await expect(dialog.getByRole('listbox', { name: 'Theme' })).toBeVisible()
    await expect(input).toBeFocused()
    await page.keyboard.press('Backspace')
    await expect(dialog.getByRole('listbox', { name: 'Commands' })).toBeVisible()
    await expect(input).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    // Focus returns where the palette was first opened from.
    await expect(trigger).toBeFocused()
  })

  test('opened again after it fully closed: focus returns to the search button as before', async ({ page }) => {
    await page.goto('/blog')
    await settle(page)
    const trigger = page.getByRole('button', { name: 'Open command palette' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    await expect(dialog.getByRole('combobox')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(dialog.getByRole('combobox')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })
})

// ── 2: the media library in the home editor and CV Studio (@admin) ─────────

const stamp = Date.now().toString(36)

async function gradient(width: number, height: number, a: string, b: string, kind: 'png' | 'gif' = 'png'): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
  const img = sharp(Buffer.from(svg))
  return kind === 'gif' ? img.gif().toBuffer() : img.png().toBuffer()
}

/** Same-origin fetch from the page (the session cookie is Secure). */
const adminFetch = (page: Page, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  page.evaluate(
    async ([m, u, b, h]) => {
      const res = await fetch(u as string, { method: m as string, headers: { 'Content-Type': 'application/json', ...(h as Record<string, string>) }, body: b === undefined ? undefined : JSON.stringify(b) })
      return { status: res.status, etag: res.headers.get('ETag'), text: await res.text() }
    },
    [method, url, body, headers] as const,
  )

/** Upload through the editors' pipeline; returns the stored name. */
async function apiUpload(page: Page, filename: string, buf: Buffer, mime = 'image/png'): Promise<string> {
  const out = await adminFetch(page, 'POST', '/api/admin/upload-image', { filename, dataUrl: `data:${mime};base64,${buf.toString('base64')}` })
  expect(out.status, out.text).toBe(200)
  return decodeURIComponent(JSON.parse(out.text).url.replace('/uploads/', ''))
}

type LibraryItem = { name: string; usage: Array<{ doc: string; label: string; alt: string | null }> }
async function libraryItem(page: Page, name: string): Promise<LibraryItem | undefined> {
  const out = await adminFetch(page, 'GET', '/api/admin/media')
  expect(out.status).toBe(200)
  return (JSON.parse(out.text) as { items: LibraryItem[] }).items.find((i) => i.name === name)
}

async function removeUploads(page: Page, names: string[]) {
  const live = names.filter(Boolean)
  if (!live.length) return
  await adminCleanup(page, 'POST', '/api/admin/media', { action: 'delete', names: live })
  await adminCleanup(page, 'POST', '/api/admin/media', { action: 'purge', names: live })
}

async function pickerViolations(page: Page) {
  const result = await new AxeBuilder({ page }).include('[data-testid="media-picker"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  return result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }))
}

/** Search the open picker for `name` and select its tile (one click). */
async function choose(picker: Locator, name: string) {
  await picker.getByRole('searchbox', { name: 'Search images' }).fill(name)
  const tile = picker.locator(`[data-testid="media-tile"][data-name="${name}"]`)
  await expect(tile).toBeVisible()
  await tile.click()
}

const SHOTS = process.env.FOLLOWUPS3_SHOTS_DIR

/**
 * 1440 / 768 / 375 in both themes (FOLLOWUPS3_SHOTS_DIR). `open` loads the
 * screen once per theme (the theme is read on load); the viewport then
 * changes under it (one load per theme keeps the editors' own requests —
 * the logos' measurements — well under their rate limits).
 */
async function shots(page: Page, name: string, open: () => Promise<void>) {
  if (!SHOTS) return
  fs.mkdirSync(SHOTS, { recursive: true })
  for (const theme of ['dark', 'light'] as const) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.evaluate((t) => localStorage.setItem('theme-preference', t), theme)
    await open()
    for (const [w, h] of [
      [1440, 900],
      [768, 1024],
      [375, 812],
    ] as const) {
      await page.setViewportSize({ width: w, height: h })
      await settle(page)
      await page.screenshot({ path: path.join(SHOTS, `${name}-${w}-${theme}.png`) })
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 })
}

test.describe('the media library in the home editor and CV Studio', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  test.describe.configure({ mode: 'serial' })

  test('home: a field-note photo, a logo and the avatar from the library — texts filled, saved, and listed where they are used @admin', async ({ page }) => {
    test.setTimeout(SHOTS ? 360_000 : 180_000)
    page.on('dialog', (d) => void d.accept())
    await loginAsAdmin(page)
    const original = await adminFetch(page, 'GET', '/api/admin/home')
    expect(original.status).toBe(200)
    const created: string[] = []
    try {
      const photo = await apiUpload(page, `e2e-fieldnote-${stamp}.png`, await gradient(1200, 800, '#1c7ed6', '#f59f00'))
      const photo2 = await apiUpload(page, `e2e-fieldnote-b-${stamp}.png`, await gradient(1000, 700, '#2f9e44', '#e8590c'))
      const logo = await apiUpload(page, `e2e-org-logo-${stamp}.png`, await gradient(600, 200, '#495057', '#adb5bd'))
      created.push(photo, photo2, logo)
      const meta = await adminFetch(page, 'POST', '/api/admin/media', { action: 'meta', name: photo, alt: 'A blue and amber gradient', altZh: '蓝色和琥珀色的渐变', expectedUpdatedAt: 0 })
      expect(meta.status, meta.text).toBe(200)
      const metaLogo = await adminFetch(page, 'POST', '/api/admin/media', { action: 'meta', name: logo, alt: 'Example Org', expectedUpdatedAt: 0 })
      expect(metaLogo.status, metaLogo.text).toBe(200)

      await page.goto('/admin/dashboard?tab=home')
      const picker = page.getByTestId('media-picker')

      // Field notes: "From library…" beside "Add photos" adds a card with the image's texts.
      const addPhoto = page.getByRole('button', { name: /^From library… — add a photo from the media library$/ })
      await expect(addPhoto).toBeVisible()
      const cardsBefore = await page.getByRole('button', { name: /^Library… for photo \d+$/ }).count()
      await addPhoto.click()
      await expect(picker).toBeVisible()
      await expect(picker.getByText('Add a photo from the library', { exact: true })).toBeVisible()
      await expect(picker.getByRole('searchbox', { name: 'Search images' })).toBeFocused()
      await choose(picker, photo)
      // The field's alt text is English only: no language switch, the default offered.
      await expect(picker.getByRole('tablist')).toHaveCount(0)
      await expect(picker.getByLabel('Alt text (English)')).toHaveValue('A blue and amber gradient')
      expect(await pickerViolations(page)).toEqual([])
      await picker.getByRole('button', { name: 'Add photo', exact: true }).click()
      await expect(picker).toHaveCount(0)
      const n = cardsBefore + 1
      const libraryForNew = page.getByRole('button', { name: `Library… for photo ${n}` })
      await expect(libraryForNew).toBeVisible()
      const card = page.getByRole('group', { name: `Photo ${n}`, exact: true })
      await expect(card.getByLabel('Description / alt text')).toHaveValue('A blue and amber gradient')
      await expect(card.getByLabel('Image URL')).toHaveValue(`/uploads/${photo}`)

      // The card's own "Library…": the picker opens on its image; another image brings its own (empty) texts.
      await libraryForNew.click()
      await expect(picker.getByText(`Choose photo ${n}`, { exact: true })).toBeVisible()
      await expect(picker.locator(`[data-testid="media-tile"][data-name="${photo}"]`).getByRole('button')).toHaveAttribute('aria-current', 'true')
      await expect(picker.getByLabel('Alt text (English)')).toHaveValue('A blue and amber gradient')
      await choose(picker, photo2)
      await expect(picker.getByLabel('Alt text (English)')).toHaveValue('')
      await picker.getByLabel('Alt text (English)').fill('A green and orange gradient')
      // ⌘ / Ctrl + Enter uses it.
      await page.keyboard.press('ControlOrMeta+Enter')
      await expect(picker).toHaveCount(0)
      await expect(card.getByLabel('Image URL')).toHaveValue(`/uploads/${photo2}`)
      await expect(card.getByLabel('Description / alt text')).toHaveValue('A green and orange gradient')
      // Focus is back on the button that opened it.
      await expect(libraryForNew).toBeFocused()

      // Logos: added from the library, named by the image's alt text.
      const logosBefore = await page.getByRole('button', { name: /^Library… for logo \d+$/ }).count()
      await page.getByRole('button', { name: /^From library… — add a logo from the media library$/ }).click()
      await choose(picker, logo)
      await picker.getByRole('button', { name: 'Add logo', exact: true }).click()
      await expect(picker).toHaveCount(0)
      const logoCard = page.getByRole('group', { name: `Logo ${logosBefore + 1}`, exact: true })
      await expect(logoCard.getByLabel('Name', { exact: true })).toHaveValue('Example Org')
      await expect(logoCard.getByLabel('Image URL')).toHaveValue(`/uploads/${logo}`)

      // The avatar: no alt text in the picker (the portrait's is the page's own).
      await page.getByRole('button', { name: /^Choose from library… — choose the avatar from the media library$/ }).click()
      await expect(picker.getByText('Choose the avatar', { exact: true })).toBeVisible()
      await choose(picker, photo)
      await expect(picker.getByLabel(/^Alt text/)).toHaveCount(0)
      await expect(picker.getByText('Not used anywhere yet')).toBeVisible()
      await picker.getByRole('button', { name: 'Use as avatar', exact: true }).click()
      await expect(page.getByLabel('Avatar URL')).toHaveValue(`/uploads/${photo}`)

      // Save: the library lists where each image is used, with its alt state.
      const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/home' && r.request().method() === 'PUT')
      await page.getByRole('button', { name: 'Save changes' }).click()
      expect((await saved).status()).toBe(200)
      const photo2Uses = (await libraryItem(page, photo2))?.usage ?? []
      expect(photo2Uses.map((u) => [u.doc, u.label, u.alt])).toEqual([['home', 'Field notes › A green and orange gradient', 'ok']])
      const photoUses = (await libraryItem(page, photo))?.usage ?? []
      expect(photoUses.map((u) => [u.doc, u.label])).toEqual([['home', 'Introduction › Portrait']])
      const logoUses = (await libraryItem(page, logo))?.usage ?? []
      expect(logoUses.map((u) => [u.doc, u.label, u.alt])).toEqual([['home', 'Brand strip › Example Org › Logo', 'ok']])

      await shots(page, 'home-photo-picker', async () => {
        await page.goto('/admin/dashboard?tab=home')
        await page.getByRole('button', { name: `Library… for photo ${n}` }).click()
        await expect(picker.getByLabel('Alt text (English)')).toBeVisible()
      })
      await shots(page, 'home-avatar-picker', async () => {
        await page.goto('/admin/dashboard?tab=home')
        await page.getByRole('button', { name: /^Choose from library… — choose the avatar/ }).click()
        await expect(picker.locator(`[data-testid="media-tile"][data-name="${photo}"]`).getByRole('button')).toHaveAttribute('aria-current', 'true')
      })
      await shots(page, 'home-photo-cards', async () => {
        await page.goto('/admin/dashboard?tab=home')
        await page.getByRole('button', { name: `Library… for photo ${n}` }).scrollIntoViewIfNeeded()
      })
    } finally {
      const current = await adminFetch(page, 'GET', '/api/admin/home')
      const restored = await adminFetch(page, 'PUT', '/api/home', JSON.parse(original.text), current.etag ? { 'If-Match': current.etag } : {})
      expect(restored.status, restored.text).toBe(200)
      await removeUploads(page, created)
    }
  })

  test('CV Studio: the PDF photo from the library — still JPEG, PNG or WebP only, selected and announced @admin', async ({ page }) => {
    test.setTimeout(SHOTS ? 360_000 : 120_000)
    page.on('dialog', (d) => void d.accept())
    await loginAsAdmin(page)
    const created: string[] = []
    try {
      const still = await apiUpload(page, `e2e-pdf-photo-${stamp}.png`, await gradient(600, 800, '#5c7cfa', '#fab005'))
      const gif = await apiUpload(page, `e2e-pdf-photo-gif-${stamp}.gif`, await gradient(300, 400, '#e64980', '#20c997', 'gif'), 'image/gif')
      created.push(still, gif)

      await page.goto('/admin/dashboard?tab=cv')
      const studio = page.getByRole('navigation', { name: 'CV sections' })
      await expect(studio).toBeVisible()
      await studio.getByText('Personal Info', { exact: true }).first().click()
      const open = page.getByRole('button', { name: /^From library… — choose the PDF photo from the media library$/ })
      await expect(open).toBeVisible()
      await open.click()
      const picker = page.getByTestId('media-picker')
      await expect(picker.getByText('Choose the photo for the PDF', { exact: true })).toBeVisible()
      await expect(picker).toContainText('(JPEG, PNG or WebP)')
      // The GIF is not offered; the still image is.
      await picker.getByRole('searchbox', { name: 'Search images' }).fill(`e2e-pdf-photo`)
      await expect(picker.locator(`[data-testid="media-tile"][data-name="${still}"]`)).toBeVisible()
      await expect(picker.locator(`[data-testid="media-tile"][data-name="${gif}"]`)).toHaveCount(0)
      await picker.locator(`[data-testid="media-tile"][data-name="${still}"]`).click()
      await expect(picker.getByLabel(/^Alt text/)).toHaveCount(0)
      expect(await pickerViolations(page)).toEqual([])
      await picker.getByRole('button', { name: 'Use on the PDF', exact: true }).click()
      await expect(picker).toHaveCount(0)
      await expect(page.getByRole('img', { name: 'Current PDF photo' })).toHaveAttribute('src', `/uploads/${still}`)
      await expect(page.getByText('Photo chosen from the library. Save the CV to keep it.')).toBeVisible()
      await expect(open).toBeFocused()
      await shots(page, 'cv-photo-picker', async () => {
        await page.goto('/admin/dashboard?tab=cv')
        await page.getByRole('navigation', { name: 'CV sections' }).getByText('Personal Info', { exact: true }).first().click()
        await page.getByRole('button', { name: /^From library… — choose the PDF photo/ }).click()
        await picker.getByRole('searchbox', { name: 'Search images' }).fill('e2e-pdf-photo')
        await picker.locator(`[data-testid="media-tile"][data-name="${still}"]`).click()
      })
      // Not saved: the CV is left as it was.
    } finally {
      await removeUploads(page, created)
    }
  })
})

// ── 3: an audience per bullet (@admin) ─────────────────────────────────────

test.describe('CV: an audience per bullet', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 })

  test('a bullet kept to downloads and private links: off /cv and the API, in the text and PDF; its chip, the preview and Hidden items in CV Studio @admin', async ({ page, request }) => {
    test.setTimeout(180_000)
    page.on('dialog', (d) => void d.accept())
    await page.setViewportSize({ width: 1440, height: 1000 })
    await loginAsAdmin(page)
    const stored = await adminFetch(page, 'GET', '/api/admin/cvdata')
    expect(stored.status, stored.text).toBe(200)
    const original = JSON.parse(stored.text) as { en: Array<Record<string, unknown>>; zh: Array<Record<string, unknown>> }
    const PUBLIC_POINT = `E2E public point ${stamp}`
    const LIMITED_POINT = `E2E downloads-only point ${stamp}`
    const withFixture = (lang: 'en' | 'zh') => [
      ...original[lang].filter((sec) => sec?.sessionName !== 'extraSkill'),
      {
        sessionName: 'extraSkill',
        headerName: lang === 'zh' ? '语言能力' : 'LANGUAGE SKILLS',
        points: [PUBLIC_POINT, LIMITED_POINT],
        itemsOnlyIn: { points: { '1': ['download', 'private'] } },
      },
    ]
    const put = await adminFetch(page, 'PUT', '/api/cvdata', { en: withFixture('en'), zh: withFixture('zh') })
    expect(put.status, put.text).toBe(200)
    try {
      // ── The public outputs ──────────────────────────────────────────────
      const cvHtml = await (await request.get('/cv')).text()
      expect(cvHtml).toContain(PUBLIC_POINT)
      expect(cvHtml, '/cv HTML and __NEXT_DATA__').not.toContain(LIMITED_POINT)
      expect(cvHtml).not.toContain('itemsOnlyIn')
      const api = await (await request.get('/api/cvdata')).text()
      expect(api, '/api/cvdata').not.toContain(LIMITED_POINT)
      expect(api).not.toContain('itemsOnlyIn')
      expect(await (await request.get('/cv.txt')).text(), '/cv.txt').toContain(LIMITED_POINT)
      expect(squashSpace(pdfText(await (await request.get('/cv.pdf')).body())), '/cv.pdf').toContain(squashSpace(LIMITED_POINT))

      // ── CV Studio: the bullet's chip and menu ──────────────────────────
      await page.goto('/admin/dashboard?tab=cv')
      await page.getByRole('navigation', { name: 'CV sections' }).getByText('Languages', { exact: true }).first().click()
      const chip = page.getByRole('button', { name: `Where “${LIMITED_POINT}” shows: Files · Links (Downloads + Private links)` })
      await expect(chip).toBeVisible()
      await expect(page.getByRole('button', { name: `Where “${PUBLIC_POINT}” shows: everywhere` })).toBeVisible()
      const preview = page.locator('#A4Paper')
      const showAs = page.getByRole('group', { name: 'Show the A4 CV as' })
      await showAs.getByRole('button', { name: '/cv' }).click()
      await expect(preview).toContainText(PUBLIC_POINT)
      await expect(preview).not.toContainText(LIMITED_POINT)
      await showAs.getByRole('button', { name: 'PDF' }).click()
      await expect(preview).toContainText(LIMITED_POINT)
      await showAs.getByRole('button', { name: '/cv' }).click()

      // From the keyboard: open the menu, put Public pages back on → everywhere.
      await chip.focus()
      await page.keyboard.press('Enter')
      const pages = page.getByRole('menuitemcheckbox', { name: /Public pages/ })
      await expect(pages).toHaveAttribute('aria-checked', 'false')
      await expect(page.getByRole('menuitemcheckbox', { name: /Downloads/ })).toHaveAttribute('aria-checked', 'true')
      await pages.focus()
      await page.keyboard.press('Space')
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: `Where “${LIMITED_POINT}” shows: everywhere` })).toBeVisible()
      await expect(preview).toContainText(LIMITED_POINT)
      // Undo brings the limit back (one step).
      await page.keyboard.press('ControlOrMeta+KeyZ')
      await expect(chip).toBeVisible()
      await expect(preview).not.toContainText(LIMITED_POINT)

      // ── Hidden items lists it; "Everywhere" resets it ──────────────────
      await page.getByRole('button', { name: /hidden items$/ }).click()
      const panel = page.getByRole('dialog').filter({ hasText: 'Hidden items' })
      await expect(panel).toBeVisible()
      await expect(panel.getByText(`Only on Downloads + Private links · ${LIMITED_POINT}`).first()).toBeVisible()
      await panel.getByRole('button', { name: 'Show Points #2 everywhere' }).first().click()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: `Where “${LIMITED_POINT}” shows: everywhere` })).toBeVisible()
      // Not saved: the stored CV is restored below either way.
    } finally {
      const back = await adminFetch(page, 'PUT', '/api/cvdata', original)
      expect(back.status, back.text).toBe(200)
    }
  })
})
