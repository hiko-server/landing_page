import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { test, expect, ADMIN, adminCleanup, loginAsAdmin, seriousA11yViolations, settle } from './fixtures'
import type { Locator, Page } from '@playwright/test'

/**
 * media-library (wave 3, H7): Admin → Media.
 *
 *   - uploads by button and by drag-and-drop; the grid, the detail drawer,
 *     default alt text and caption (⌘S), where an image is used;
 *   - inserting from the library into the editor with those texts;
 *   - safe delete (refused while used), the trash, Undo / Restore, Delete now;
 *   - "Replace file": the post that used it points at the new file and the
 *     old address answers 308;
 *   - keyboard (/ to search, arrows, Enter, Escape), filters in the address,
 *     the list view, and axe on the page and the open drawer.
 *
 * Every image is generated here (synthetic gradients, owner-neutral names)
 * and removed afterwards; nothing else in the library is touched. With
 * MEDIA_SHOTS_DIR set, screenshots at 375 / 768 / 1440 px in both themes go
 * there. Admin-only: needs ADMIN_EMAIL / ADMIN_PASS.
 */

const stamp = Date.now().toString(36)

async function png(width: number, height: number, a: string, b: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#ffffff" fill-opacity="0.35"/></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

const adminFetch = (page: Page, method: string, url: string, body?: unknown) =>
  page.evaluate(
    async ([m, u, b]) => {
      const res = await fetch(u as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })
      return { status: res.status, text: await res.text() }
    },
    [method, url, body] as const,
  )

/** Upload through the API (the editors' pipeline); returns the stored name. */
async function apiUpload(page: Page, filename: string, buf: Buffer): Promise<string> {
  const out = await adminFetch(page, 'POST', '/api/admin/upload-image', { filename, dataUrl: `data:image/png;base64,${buf.toString('base64')}` })
  expect(out.status, out.text).toBe(200)
  return decodeURIComponent(JSON.parse(out.text).url.replace('/uploads/', ''))
}

async function library(page: Page): Promise<{ items: Array<{ name: string; usage: unknown[]; meta: { alt: string; caption: string } | null }>; trash: Array<{ name: string }> }> {
  const out = await adminFetch(page, 'GET', '/api/admin/media')
  expect(out.status).toBe(200)
  return JSON.parse(out.text)
}

/** Remove synthetic uploads whatever state they are in (library or trash). */
async function removeUploads(page: Page, names: string[]) {
  const live = names.filter(Boolean)
  if (!live.length) return
  await adminCleanup(page, 'POST', '/api/admin/media', { action: 'delete', names: live })
  await adminCleanup(page, 'POST', '/api/admin/media', { action: 'purge', names: live })
}

const tile = (page: Page, name: string): Locator => page.locator(`[data-testid="media-tile"][data-name="${name}"]`)

async function createDraft(page: Page, slug: string, body: string) {
  const out = await adminFetch(page, 'PUT', '/api/admin/posts', {
    slug,
    create: true,
    frontmatter: { title: `E2E media ${slug}`, date: new Date().toISOString().slice(0, 10), draft: true, description: 'Created by the media-library end-to-end suite; deleted afterwards.' },
    body,
  })
  expect(out.status, out.text).toBe(200)
}

test.describe('media library', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  test.describe.configure({ mode: 'serial' })

  test('uploads by button and drop, texts, usage, insert from the library, safe delete, trash and restore @admin', async ({ page }) => {
    test.setTimeout(150_000)
    // Leaving the editor with the inserted (unsaved) image: no "Leave site?" prompt in the way.
    page.on('dialog', (d) => void d.accept())
    await loginAsAdmin(page)
    const slug = `e2e-media-${stamp}`
    const created: string[] = []
    try {
      await page.goto('/admin/media')
      await expect(page.getByTestId('media-summary')).toContainText('image')

      // Upload with the button (the hidden picker).
      const a = await png(1200, 800, '#3b5bdb', '#f08c00')
      await page.getByTestId('media-upload-input').setInputFiles({ name: `e2e-gradient-${stamp}.png`, mimeType: 'image/png', buffer: a })
      const panel = page.getByTestId('upload-panel')
      await expect(panel).toContainText('1 uploaded', { timeout: 60_000 })
      const nameA = (await library(page)).items.find((i) => i.name.includes(`e2e-gradient-${stamp}`))?.name || ''
      expect(nameA).not.toBe('')
      created.push(nameA)
      await expect(tile(page, nameA)).toBeVisible()

      // Drop a file anywhere on the page: the overlay shows while dragging.
      const b = await png(600, 900, '#2b8a3e', '#e64980')
      await page.evaluate(
        async ([b64, fileName]) => {
          const bin = atob(b64 as string)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const dt = new DataTransfer()
          dt.items.add(new File([bytes], fileName as string, { type: 'image/png' }))
          window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }))
          window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
          ;(window as unknown as { __dt: DataTransfer }).__dt = dt
        },
        [b.toString('base64'), `e2e-drop-${stamp}.png`] as const,
      )
      await expect(page.getByTestId('drop-overlay')).toBeVisible()
      await page.evaluate(() => window.dispatchEvent(new DragEvent('drop', { dataTransfer: (window as unknown as { __dt: DataTransfer }).__dt, bubbles: true, cancelable: true })))
      await expect(page.getByTestId('drop-overlay')).toHaveCount(0)
      await expect(panel).toContainText('2 uploaded', { timeout: 60_000 })
      const nameB = (await library(page)).items.find((i) => i.name.includes(`e2e-drop-${stamp}`))?.name || ''
      expect(nameB).not.toBe('')
      created.push(nameB)

      // The drawer: facts, sizes, texts saved with ⌘S.
      await tile(page, nameA).locator('button').first().click()
      const drawer = page.getByTestId('media-drawer')
      await expect(drawer).toContainText(nameA)
      await expect(drawer).toContainText('1200 × 800')
      await expect(drawer).toContainText('Nothing on the site refers to it.')
      await expect(drawer).toContainText('Complete: every page serves the smallest file')
      await expect(page).toHaveURL(new RegExp(`open=${encodeURIComponent(nameA).replace(/\./g, '\\.')}`))
      await drawer.getByLabel('Alt text', { exact: true }).fill('A blue to orange gradient with a pale circle')
      await drawer.getByLabel('Caption', { exact: true }).fill('E2E gradient')
      await page.keyboard.press('ControlOrMeta+KeyS')
      await expect(drawer.getByText(/^Saved/)).toBeVisible()
      await drawer.getByRole('tab', { name: '中文' }).click()
      await drawer.getByLabel('Alt text (中文)').fill('蓝色到橙色的渐变')
      await drawer.getByRole('button', { name: 'Save texts' }).click()
      await expect(drawer.getByRole('button', { name: 'Save texts' })).toBeDisabled()
      const meta = (await library(page)).items.find((i) => i.name === nameA)?.meta as { alt: string; altZh: string; caption: string } | null
      expect(meta).toMatchObject({ alt: 'A blue to orange gradient with a pale circle', altZh: '蓝色到橙色的渐变', caption: 'E2E gradient' })
      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)

      // Used by a draft: the drawer says where, and the trash refuses it.
      await createDraft(page, slug, `Intro\n\n![](/uploads/${nameA})\n`)
      await page.goto(`/admin/media?open=${encodeURIComponent(nameA)}`)
      await expect(drawer).toContainText('Used in 1 place')
      await expect(drawer).toContainText(`E2E media ${slug}`)
      await expect(drawer).toContainText('Draft')
      await expect(drawer).toContainText('Body · line 3')
      await expect(drawer).toContainText('no alt text')
      await expect(drawer.getByRole('button', { name: 'Move to trash…' })).toBeDisabled()
      const refused = await adminFetch(page, 'POST', '/api/admin/media', { action: 'delete', names: [nameA] })
      expect(JSON.parse(refused.text).failed[0].code).toBe('IN_USE')

      // The default alt text fills the place that shows it without one.
      await expect(drawer).toContainText('Shown without alt text in 1 place.')
      await drawer.getByRole('button', { name: 'Use the default alt text there' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Fill in' }).click()
      await expect(page.getByText('Alt text filled in 1 place')).toBeVisible()
      await expect(drawer).not.toContainText('no alt text')
      const filled = JSON.parse((await adminFetch(page, 'GET', `/api/admin/posts?slug=${slug}`)).text)
      expect(filled.body).toContain(`![A blue to orange gradient with a pale circle](/uploads/${nameA})`)

      // Insert from the library into the editor: the default texts come along.
      await page.goto(`/admin/blog/edit?slug=${slug}`)
      await page.getByRole('tab', { name: 'MDX' }).click()
      const textarea = page.locator('textarea').first()
      await textarea.click()
      await page.keyboard.press('ControlOrMeta+End')
      await page.getByRole('button', { name: 'Insert from library…' }).click()
      const picker = page.getByTestId('media-picker')
      await expect(picker).toBeVisible()
      await picker.getByLabel('Search images').fill(`e2e-gradient-${stamp}`)
      await picker.locator(`[data-testid="media-tile"][data-name="${nameA}"] button`).first().click()
      await expect(picker.getByLabel('Alt text')).toHaveValue('A blue to orange gradient with a pale circle')
      await expect(picker.getByLabel('Caption')).toHaveValue('E2E gradient')
      await picker.getByRole('button', { name: 'Insert image' }).click()
      await expect(picker).toHaveCount(0)
      await expect(textarea).toHaveValue(new RegExp(`!\\[A blue to orange gradient with a pale circle\\]\\(/uploads/${nameA.replace(/\./g, '\\.')} "E2E gradient"\\)`))

      // Unused again: into the trash (Undo), restore from the trash, delete for good.
      expect(await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)).toBe(200)
      await page.goto(`/admin/media?open=${encodeURIComponent(nameA)}`)
      await drawer.getByRole('button', { name: 'Move to trash…' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Move to trash' }).click()
      await expect(page.getByText(`Moved ${nameA} to the trash.`)).toBeVisible()
      await expect(tile(page, nameA)).toHaveCount(0)
      expect((await page.request.get(`/uploads/${nameA}`)).status()).toBe(404)
      await page.getByRole('button', { name: 'Undo' }).click()
      await expect(tile(page, nameA)).toBeVisible()
      expect((await page.request.get(`/uploads/${nameA}`)).status()).toBe(200)
      expect((await library(page)).items.find((i) => i.name === nameA)?.meta?.alt).toBe('A blue to orange gradient with a pale circle')

      await adminFetch(page, 'POST', '/api/admin/media', { action: 'delete', names: [nameA] })
      await page.goto('/admin/media?view=trash')
      const row = page.locator(`[data-testid="trash-row"][data-name="${nameA}"]`)
      await expect(row).toContainText('30 days left')
      await row.getByRole('button', { name: 'Restore' }).click()
      await expect(row).toHaveCount(0)
      await adminFetch(page, 'POST', '/api/admin/media', { action: 'delete', names: [nameA] })
      await page.reload()
      await row.getByRole('button', { name: `Delete ${nameA} now` }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Delete for good' }).click()
      await expect(row).toHaveCount(0)
      expect((await library(page)).trash.some((t) => t.name === nameA)).toBe(false)
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
      await removeUploads(page, created)
    }
  })

  test('replacing a file moves its references and the old address redirects @admin', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    const slug = `e2e-media-replace-${stamp}`
    const created: string[] = []
    try {
      const oldName = await apiUpload(page, `${Date.now()}-e2e-replace-${stamp}.png`, await png(800, 600, '#5f3dc4', '#15aabf'))
      created.push(oldName)
      await createDraft(page, slug, `![Two tones](/uploads/${oldName})\n`)
      await page.goto(`/admin/media?open=${encodeURIComponent(oldName)}`)
      const drawer = page.getByTestId('media-drawer')
      await expect(drawer).toContainText('Used in 1 place')
      await drawer.locator('input[type="file"]').setInputFiles({ name: `e2e-replacement-${stamp}.png`, mimeType: 'image/png', buffer: await png(1000, 750, '#e8590c', '#1c7ed6') })
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toContainText(`e2e-replacement-${stamp}.png`)
      await dialog.getByRole('button', { name: 'Replace' }).click()
      await expect(page.getByText('Replaced — 1 reference updated')).toBeVisible({ timeout: 60_000 })
      const newName = (await library(page)).items.find((i) => i.name.includes(`e2e-replacement-${stamp}`))?.name || ''
      expect(newName).not.toBe('')
      created.push(newName)
      await expect(drawer).toContainText(newName)
      await expect(drawer).toContainText(`It replaced ${oldName}`)

      const post = JSON.parse((await adminFetch(page, 'GET', `/api/admin/posts?slug=${slug}`)).text)
      expect(String(post.body)).toContain(`/uploads/${newName}`)
      const old = await page.request.get(`/uploads/${oldName}`, { maxRedirects: 0 })
      expect(old.status()).toBe(308)
      expect(old.headers().location).toBe(`/uploads/${encodeURIComponent(newName)}`)
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
      await removeUploads(page, created)
    }
  })

  test('keyboard, filters in the address, the list view and accessibility @admin', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    const created: string[] = []
    try {
      created.push(await apiUpload(page, `${Date.now()}-e2e-keys-a-${stamp}.png`, await png(640, 640, '#364fc7', '#ffd43b')))
      created.push(await apiUpload(page, `${Date.now()}-e2e-keys-b-${stamp}.png`, await png(900, 500, '#c2255c', '#74b816')))
      await page.goto('/admin/media')
      await expect(page.getByTestId('media-tile').first()).toBeVisible()

      // "/" searches; the query and the filters live in the address.
      await page.keyboard.press('/')
      const search = page.getByRole('searchbox', { name: 'Search the media library' })
      await expect(search).toBeFocused()
      await page.keyboard.type(`e2e-keys-`)
      await expect(page.getByTestId('media-tile')).toHaveCount(2)
      await expect(page).toHaveURL(/q=e2e-keys-/)
      await page.getByTestId('flag-unused').click()
      await expect(page.getByTestId('flag-unused')).toHaveAttribute('aria-pressed', 'true')
      await expect(page).toHaveURL(/filter=unused/)
      await page.reload()
      await expect(page.getByTestId('media-tile')).toHaveCount(2)
      await expect(page.getByTestId('flag-unused')).toHaveAttribute('aria-pressed', 'true')

      // Arrow keys move between tiles; Enter opens; Escape closes and returns focus.
      const first = page.getByTestId('media-tile').nth(0).locator('button').first()
      await first.focus()
      await page.keyboard.press('ArrowRight')
      const second = page.getByTestId('media-tile').nth(1).locator('button').first()
      await expect(second).toBeFocused()
      await page.keyboard.press('x')
      await expect(page.getByTestId('bulk-bar')).toContainText('1 selected')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('bulk-bar')).toHaveCount(0)
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('media-drawer')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('media-drawer')).toHaveCount(0)
      await expect(second).toBeFocused()

      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])

      // The list view, remembered in this browser.
      await page.getByRole('button', { name: 'List' }).click()
      await expect(page.getByTestId('media-row')).toHaveCount(2)
      await page.reload()
      await expect(page.getByTestId('media-row')).toHaveCount(2)
      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])
      await page.getByRole('button', { name: 'Grid' }).click()

      const shots = process.env.MEDIA_SHOTS_DIR
      if (shots) {
        fs.mkdirSync(shots, { recursive: true })
        await page.goto('/admin/media')
        for (const theme of ['dark', 'light'] as const) {
          for (const [w, h] of [
            [1440, 900],
            [768, 1024],
            [375, 812],
          ] as const) {
            await page.evaluate((t) => localStorage.setItem('theme-preference', t), theme)
            await page.setViewportSize({ width: w, height: h })
            await page.goto(`/admin/media?q=${encodeURIComponent(`e2e-keys ${stamp}`)}&open=${encodeURIComponent(created[0])}`)
            const drawer = page.getByTestId('media-drawer')
            await expect(drawer).toBeVisible()
            // The drawer slides in with a JS-driven transition: wait until it rests at the edge.
            await expect.poll(() => drawer.evaluate((el) => Math.round(el.getBoundingClientRect().right))).toBe(w)
            await settle(page)
            await page.screenshot({ path: path.join(shots, `e2e-drawer-${w}-${theme}.png`) })
            expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
          }
        }
      }
    } finally {
      await removeUploads(page, created)
    }
  })
})

test('the media API and the trash preview are admin only', async ({ request }) => {
  expect((await request.get('/api/admin/media')).status()).toBe(401)
  expect((await request.get('/api/admin/media/preview?name=x.png')).status()).toBe(401)
  const post = await request.post('/api/admin/media', { data: { action: 'delete', names: ['x.png'] }, headers: { 'Content-Type': 'application/json' } })
  expect([401, 403]).toContain(post.status())
})
