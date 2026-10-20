import type { APIRequestContext, Locator, Page } from '@playwright/test'
import { test, expect, settle } from './fixtures'

/**
 * patch-2b1 (after wave 2B), desktop Chromium: Enter in the ⌘K palette acts
 * on what the visitor sees — or would see — for the text in the field.
 *
 * The bug: the content index (/api/search-index) is fetched when the palette
 * first opens. Until it arrived, a typed title had a single row — "Ask: …" —
 * and Enter took it: the palette switched to Ask instead of opening the
 * title's page (seen on the live site, where the index takes a few hundred
 * milliseconds). Here the index is held back by the test, and the CPU is
 * slowed (CDP CPU throttling) so the deferred list lags behind the field too.
 *
 * Production-safe: only GETs and in-page actions.
 */

type IndexBody = { docs: Array<{ kind: string; title: string; href: string }> }

async function firstPost(request: APIRequestContext): Promise<{ title: string; href: string } | undefined> {
  const index = (await (await request.get('/api/search-index')).json()) as IndexBody
  return index.docs.find((d) => d.kind === 'post')
}

/** Holds the palette's content index until `release()` (a fresh page load fetches it again). */
async function holdSearchIndex(page: Page): Promise<{ release: () => void }> {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/search-index', async (route) => {
    await gate
    await route.continue()
  })
  return { release: () => release() }
}

/** Every task on the page's main thread takes `rate` times longer. */
async function slowCpu(page: Page, rate: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
}

async function openPalette(page: Page): Promise<{ dialog: Locator; input: Locator; askOn: Locator }> {
  await page.keyboard.press('ControlOrMeta+KeyK')
  const dialog = page.getByRole('dialog', { name: 'Command palette' })
  const input = dialog.getByRole('combobox')
  await expect(input).toBeFocused()
  return { dialog, input, askOn: dialog.getByRole('button', { name: 'Ask', exact: true }) }
}

test.describe('⌘K Enter acts on what the visitor sees', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools feature')
  })

  test('a typed title + Enter while the posts are still loading waits for them and opens the title — never Ask (CPU 6× slower)', async ({ page, request }) => {
    const post = await firstPost(request)
    test.skip(!post, 'empty store: no post')
    const index = await holdSearchIndex(page)
    await page.goto('/blog')
    await settle(page)
    await slowCpu(page, 6)
    const { dialog, input, askOn } = await openPalette(page)
    const query = post!.title.slice(0, 24)
    await input.fill(query)
    // Nothing to act on yet: no "Ask: …" row stands in for the title's result.
    await expect(dialog.getByRole('status')).toHaveText('Loading posts and projects…')
    await expect(dialog.getByText('still loading posts and projects…')).toBeVisible()
    await expect(dialog.getByRole('option').filter({ hasText: /^Ask:/ })).toHaveCount(0)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    await expect(dialog).toBeVisible()
    await expect(askOn).toHaveAttribute('aria-pressed', 'false')
    expect(new URL(page.url()).pathname).toBe('/blog')
    // The posts arrive: the Enter is carried out on the title's page.
    index.release()
    await page.waitForURL(`**${post!.href}`)
    await expect(dialog).toHaveCount(0)
  })

  test('Enter right after typing, on a slow CPU, opens the result for the typed text; a typed question asks', async ({ page, request }) => {
    const post = await firstPost(request)
    test.skip(!post, 'empty store: no post')
    await page.goto('/blog')
    await settle(page)
    await slowCpu(page, 6)
    let { dialog, input, askOn } = await openPalette(page)
    const query = post!.title.slice(0, 24)
    // The index is in once the post itself is a result (its row carries the whole title).
    await input.fill(query)
    await expect(dialog.getByRole('option').filter({ hasText: post!.title })).toBeVisible()
    await input.fill('')
    await expect(dialog.getByRole('listbox', { name: 'Commands' }).getByRole('group').first()).toBeVisible()
    // One input event, Enter at once: the deferred list still shows the browse view.
    await input.fill(query)
    await page.keyboard.press('Enter')
    await page.waitForURL(`**${post!.href}`)
    await expect(dialog).toHaveCount(0)

    // A question is the one search whose first row is "Ask: …" — at once,
    // while the posts are still loading too (a fresh page: its own index fetch).
    await page.goto('/blog')
    await settle(page)
    await slowCpu(page, 6)
    ;({ dialog, input, askOn } = await openPalette(page))
    await input.fill('What did he build at the edge?')
    await page.keyboard.press('Enter')
    await expect(askOn).toHaveAttribute('aria-pressed', 'true')
    await expect(input).toHaveValue('What did he build at the edge?')
    expect(new URL(page.url()).pathname).toBe('/blog')
  })

  test('while the posts load: a question offers Ask first; Enter on text that finds nothing stays in Search, and editing drops a waiting Enter', async ({ page, request }) => {
    const post = await firstPost(request)
    let index = await holdSearchIndex(page)
    await page.goto('/about')
    await settle(page)
    let { dialog, input, askOn } = await openPalette(page)
    const askRow = dialog.getByRole('option').filter({ hasText: /^Ask:/ })

    await input.fill('Does he have patents?')
    await expect(dialog.getByRole('option').first()).toContainText('Ask: Does he have patents?')
    await input.fill('zqxw qwrt vbnm')
    await expect(askRow).toHaveCount(0)
    await page.keyboard.press('Enter')
    index.release()
    // Nothing found: the "Ask: …" row now stands alone and highlighted — no mode switch happened.
    await expect(askRow).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.getByRole('status')).toHaveText('0 results')
    await expect(askOn).toHaveAttribute('aria-pressed', 'false')
    // Seen, it is what the next Enter does.
    await page.keyboard.press('Enter')
    await expect(askOn).toHaveAttribute('aria-pressed', 'true')

    test.skip(!post, 'empty store: no post')
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    index = await holdSearchIndex(page)
    await page.reload()
    await settle(page)
    ;({ dialog, input, askOn } = await openPalette(page))
    const query = post!.title.slice(0, 24)
    await input.fill(query)
    await page.keyboard.press('Enter')
    // Edited before the posts came: that Enter was for other text.
    await page.keyboard.press('Backspace')
    index.release()
    await expect(dialog.getByRole('option').filter({ hasText: post!.title })).toBeVisible()
    await page.waitForTimeout(400)
    expect(new URL(page.url()).pathname).toBe('/about')
    await expect(dialog).toBeVisible()
    await expect(askOn).toHaveAttribute('aria-pressed', 'false')
  })
})
