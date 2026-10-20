import { test, expect, ADMIN, adminCleanup, loginAsAdmin, seriousA11yViolations, settle } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * admin-editorial (wave 2B): the post / case-study editor's editorial tools.
 *
 *   H4  a published post saves "changes not live yet"; Draft Mode previews
 *       them at the real URL; "Publish changes" shows the diff, then goes live
 *   H3  the writing bar: counts, find & replace (⌘F in the editor), focus
 *       mode and typewriter scrolling
 *   H1  "Search & sharing": search title, the Google result and the real
 *       signed social card, WeChat shown honestly
 *   H6  changing a slug: the old address answers 308, links are rewritten
 *   H16 tags (unify spellings, merge) and the content export (.zip)
 *
 * Every test creates its own synthetic content (owner-neutral) and deletes
 * it afterwards. Admin-only: needs ADMIN_EMAIL / ADMIN_PASS.
 */

const adminFetch = (page: Page, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  page.evaluate(
    async ([m, u, b, h]) => {
      const res = await fetch(u as string, {
        method: m as string,
        headers: { 'Content-Type': 'application/json', ...(h as Record<string, string>) },
        body: b === undefined ? undefined : JSON.stringify(b),
      })
      return { status: res.status, text: await res.text(), etag: res.headers.get('ETag') }
    },
    [method, url, body, headers] as const,
  )

/** Clean-up requests outside the page (no console noise when something is already gone). */
const cleanup = adminCleanup

const today = () => new Date().toISOString().slice(0, 10)

async function createPost(page: Page, slug: string, frontmatter: Record<string, unknown>, body: string) {
  const out = await adminFetch(page, 'PUT', '/api/admin/posts', {
    slug,
    create: true,
    frontmatter: { date: today(), description: 'Created by the admin-editorial end-to-end suite to exercise the editorial tools; deleted afterwards.', ...frontmatter },
    body,
  })
  expect(out.status, out.text).toBe(200)
}

test.describe('admin-editorial', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('a published post keeps its live version while changes are saved, previewed and then published with a diff @admin', async ({ page, browser }) => {
    await loginAsAdmin(page)
    const slug = `e2e-pending-${Date.now()}`
    await createPost(page, slug, { title: 'E2E pending changes' }, 'The published paragraph that visitors read while the changes are prepared.\n')
    try {
      await page.goto(`/admin/blog/edit?slug=${slug}`)
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Publish changes…' })).toBeDisabled()
      await expect(page.getByTestId('autosave-status')).toHaveText('Published · everything here is live')

      await page.getByRole('tab', { name: 'MDX' }).click()
      const textarea = page.locator('textarea').first()
      await textarea.fill('The published paragraph that visitors read while the changes are prepared.\n\nA second paragraph that is not live yet.\n')
      await expect(page.getByTestId('autosave-status')).toContainText('Unsaved')
      const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/posts' && r.request().method() === 'PUT')
      await page.keyboard.press('ControlOrMeta+KeyS')
      const put = await saved
      expect(put.status()).toBe(200)
      expect(JSON.parse(put.request().postData() || '{}').target).toBe('pending')
      await expect(page.getByTestId('pending-banner')).toBeVisible()
      await expect(page.getByTestId('pending-badge')).toHaveText('changes not live')
      await expect(page.getByTestId('autosave-status')).toContainText('not live yet')

      // Visitors (no Draft Mode cookie) still get the published version.
      const visitor = await browser.newContext()
      try {
        const res = await visitor.request.get(`/blog/${slug}`)
        expect(res.status()).toBe(200)
        expect(await res.text()).not.toContain('not live yet')
      } finally {
        await visitor.close()
      }

      // Draft Mode previews the changes at the real address, and says what it shows.
      await page.goto(`/api/admin/draft?path=${encodeURIComponent(`/blog/${slug}`)}`)
      await expect(page).toHaveURL(new RegExp(`/blog/${slug}$`))
      await expect(page.getByRole('region', { name: 'Preview of unpublished changes' })).toContainText('visitors still see the published version')
      await expect(page.locator('article, main').first()).toContainText('A second paragraph that is not live yet.')
      await page.getByRole('region', { name: 'Preview of unpublished changes' }).getByRole('link').click()
      await page.waitForURL(new RegExp(`/blog/${slug}$`))

      await page.goto(`/admin/blog/edit?slug=${slug}`)
      await page.getByTestId('pending-banner').getByRole('button', { name: 'Review & publish…' }).click()
      const sheet = page.getByRole('dialog')
      await expect(sheet).toContainText('Publish these changes?')
      await expect(sheet.getByRole('region', { name: 'Differences from the live version' })).toContainText(/\+\s*A second paragraph that is not live yet\./)
      await sheet.getByText('Mark as updated today').click()
      await expect(sheet.getByRole('checkbox', { name: /Mark as updated today/ })).toBeChecked()
      const published = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/posts' && r.request().method() === 'PUT')
      await sheet.getByRole('button', { name: 'Publish changes' }).click()
      const live = await published
      expect(live.status()).toBe(200)
      const sent = JSON.parse(live.request().postData() || '{}')
      expect(sent.target).toBe('live')
      expect(sent.frontmatter.updated).toBe(today())
      await expect(page.getByTestId('pending-banner')).toHaveCount(0)
      await expect(page.getByTestId('autosave-status')).toHaveText('Published · everything here is live')

      const after = await page.request.get(`/blog/${slug}`)
      expect(await after.text()).toContain('A second paragraph that is not live yet.')
    } finally {
      await cleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('the writing bar counts words (CJK per character), finds and replaces inside the editor, and toggles focus and typewriter modes @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-writing-${Date.now()}`
    await createPost(page, slug, { title: 'E2E writing tools', draft: true }, 'Edge ML runs on the device. The ML model is small.\n\n边缘设备上的模型\n')
    try {
      await page.goto(`/admin/blog/edit?slug=${slug}`)
      await expect(page.getByTestId('writing-stats')).toHaveText('19 words · 1 min read')
      await page.getByTestId('writing-stats').click()
      const stats = page.getByRole('dialog')
      await expect(stats).toContainText('of which CJK characters')
      await expect(stats).toContainText('8')
      await page.keyboard.press('Escape')

      // ⌘F / Ctrl+F inside the editor opens find & replace with focus in the field.
      const prose = page.locator('.tt-prose')
      await prose.click()
      await page.keyboard.press('ControlOrMeta+KeyF')
      const find = page.getByRole('search', { name: 'Find and replace' })
      await expect(find).toBeVisible()
      await expect(find.getByRole('textbox', { name: 'Find', exact: true })).toBeFocused()
      await page.keyboard.type('ml')
      await expect(find).toContainText('1 of 2')
      await expect(page.locator('.tt-find-match')).toHaveCount(2)
      await find.getByRole('button', { name: 'Whole word' }).click()
      await expect(find.getByRole('button', { name: 'Whole word' })).toHaveAttribute('aria-pressed', 'true')
      await find.getByLabel('Replace with').fill('machine learning')
      await find.getByRole('button', { name: 'Replace all' }).click()
      await expect(find).toContainText('No results')
      await expect(prose).toContainText('Edge machine learning runs on the device. The machine learning model is small.')
      await page.keyboard.press('Escape')
      await expect(find).toHaveCount(0)

      // Focus mode and typewriter scrolling are toggles remembered on this device.
      const focus = page.getByRole('button', { name: 'Focus', exact: true })
      await focus.click()
      await expect(focus).toHaveAttribute('aria-pressed', 'true')
      await prose.click()
      await expect(page.locator('.tt-prose > .tt-focus-block')).toHaveCount(1)
      const typewriter = page.getByRole('button', { name: 'Typewriter', exact: true })
      await typewriter.click()
      await expect(typewriter).toHaveAttribute('aria-pressed', 'true')
      await page.reload()
      await expect(page.getByRole('button', { name: 'Focus', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: 'Focus', exact: true }).click()
      await page.getByRole('button', { name: 'Typewriter', exact: true }).click()
    } finally {
      await cleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('Search & sharing previews the Google result and the real signed card; WeChat is shown honestly @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-seo-${Date.now()}`
    // A description under 70 characters: the page (and so the preview) sends the first paragraph instead.
    await createPost(page, slug, { title: 'E2E search and sharing', draft: true, tags: ['E2E'], description: 'Too short.' }, 'An opening paragraph long enough to be the summary that link previews show under the title of this post.\n')
    try {
      await page.goto(`/admin/blog/edit?slug=${slug}`)
      const section = page.locator('#item-seo')
      const toggle = section.getByRole('button', { name: /Search & sharing/ })
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      const seoTitle = section.getByLabel('Search title')
      await seoTitle.fill('A shorter title for search results')
      await expect(section.getByTestId('serp-title')).toHaveText('A shorter title for search results · Li Yanpei')
      await expect(section.getByTestId('serp-description')).toContainText('An opening paragraph long enough')
      await expect(section).toContainText('under 70, so the page sends the first paragraph instead')
      // The card is the real /api/og image, signed for the unsaved state.
      const card = section.locator('img[src^="/api/og?"]').first()
      await expect(card).toBeVisible({ timeout: 15_000 })
      await expect(card).toHaveAttribute('src', /sig=/)
      await expect.poll(() => card.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1200)
      await expect(section).toContainText('only the page title and a generic link icon — no image or description')
      await section.getByText('Mark as updated', { exact: true }).click()
      await expect(section.getByLabel('Mark as updated')).toBeChecked()
      await expect(section.getByLabel('Updated on')).toHaveValue(today())
      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])
    } finally {
      await cleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('changing a slug keeps the old address working (308) and rewrites links to it @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const stamp = Date.now()
    const from = `e2e-rename-${stamp}`
    const to = `e2e-renamed-${stamp}`
    const linker = `e2e-linker-${stamp}`
    await createPost(page, from, { title: 'E2E rename source' }, 'The post that moves.\n')
    await createPost(page, linker, { title: 'E2E rename linker', draft: true }, `Read [the other post](/blog/${from}) — and \`/blog/${from}\` in code stays.\n`)
    try {
      await page.goto(`/admin/blog/edit?slug=${from}`)
      await expect(page.locator('#item-slug')).toHaveAttribute('readonly', '')
      await page.getByRole('button', { name: 'Change…' }).click()
      const dialog = page.getByRole('dialog', { name: 'Change the address' })
      await dialog.getByLabel('New slug').fill(to)
      await expect(dialog.getByRole('status')).toContainText('Updates 1 internal link')
      await expect(dialog.getByRole('status')).toContainText('E2E rename linker')
      await expect(dialog.getByRole('checkbox', { name: /Keep links to the old address working/ })).toBeChecked()
      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])
      await dialog.getByRole('button', { name: 'Change address' }).click()
      await expect(page).toHaveURL(new RegExp(`slug=${to}$`))
      await expect(page.locator('#item-slug')).toHaveValue(to)
      await expect(page.getByText(`/blog/${from}`, { exact: true })).toBeVisible()

      const old = await page.request.get(`/blog/${from}`, { maxRedirects: 0 })
      expect(old.status()).toBe(308)
      expect(old.headers()['location']).toBe(`/blog/${to}`)
      const linked = JSON.parse((await adminFetch(page, 'GET', `/api/admin/posts?slug=${linker}`)).text) as { body: string }
      expect(linked.body).toBe(`Read [the other post](/blog/${to}) — and \`/blog/${from}\` in code stays.\n`)
    } finally {
      await cleanup(page, 'POST', '/api/admin/posts', { action: 'remove-redirect', slug: to, from })
      await cleanup(page, 'DELETE', `/api/admin/posts?slug=${to}`)
      await cleanup(page, 'DELETE', `/api/admin/posts?slug=${from}`)
      await cleanup(page, 'DELETE', `/api/admin/posts?slug=${linker}`)
    }
  })

  test('tags: unify spellings and merge across posts; export everything as a zip @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const stamp = Date.now()
    const a = `e2e-tags-a-${stamp}`
    const b = `e2e-tags-b-${stamp}`
    const tagA = `E2E Alpha ${stamp}`
    await createPost(page, a, { title: 'E2E tags A', draft: true, tags: [tagA, `E2E Beta ${stamp}`] }, 'Body A.\n')
    await createPost(page, b, { title: 'E2E tags B', draft: true, tags: [tagA.toLowerCase()] }, 'Body B.\n')
    try {
      await page.goto('/admin/tags')
      await expect(page.getByRole('heading', { name: 'Tags & export' })).toBeVisible()
      await page.getByLabel('Filter tags').fill(`${stamp}`)
      const rows = page.getByTestId('tag-row')
      await expect(rows).toHaveCount(2)
      const alpha = rows.filter({ hasText: tagA })
      await expect(alpha).toContainText(`Also written “${tagA.toLowerCase()}”`)
      await alpha.getByRole('button', { name: `Unify the spellings of “${tagA}”` }).click()
      let dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('status')).toContainText('on 1 post')
      await dialog.getByRole('button', { name: /^Rename/ }).click()
      await expect(dialog).toHaveCount(0)
      await expect(rows.filter({ hasText: tagA })).not.toContainText('Also written')

      for (const row of await rows.all()) await row.locator('label.chakra-checkbox').click()
      await page.getByRole('button', { name: 'Merge 2 tags…' }).click()
      dialog = page.getByRole('dialog')
      await dialog.getByLabel('Merged tag name').fill(`E2E Merged ${stamp}`)
      await expect(dialog.getByRole('status')).toContainText('on 2 posts')
      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])
      await dialog.getByRole('button', { name: /^Merge/ }).click()
      await expect(dialog).toHaveCount(0)
      await expect(rows).toHaveCount(1)
      await expect(rows.first()).toContainText(`E2E Merged ${stamp}`)
      await expect(rows.first()).toContainText('2 posts')
      const stored = JSON.parse((await adminFetch(page, 'GET', `/api/admin/posts?slug=${a}`)).text) as { frontmatter: { tags: string[] } }
      expect(stored.frontmatter.tags).toEqual([`E2E Merged ${stamp}`])

      const download = page.waitForEvent('download')
      await page.getByTestId('content-export').click()
      const file = await download
      expect(file.suggestedFilename()).toMatch(/^[a-z0-9.-]+-content-\d{4}-\d{2}-\d{2}\.zip$/)
      const stream = await file.createReadStream()
      const chunks: Buffer[] = []
      for await (const c of stream) chunks.push(c as Buffer)
      const zip = Buffer.concat(chunks)
      expect(zip.subarray(0, 2).toString('latin1')).toBe('PK')
      expect(zip.includes(Buffer.from(`blog/${a}.mdx`))).toBe(true)
      expect(zip.includes(Buffer.from('manifest.json'))).toBe(true)
    } finally {
      await cleanup(page, 'DELETE', `/api/admin/posts?slug=${a}`)
      await cleanup(page, 'DELETE', `/api/admin/posts?slug=${b}`)
    }
  })
})
