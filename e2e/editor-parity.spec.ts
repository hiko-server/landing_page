import { test, expect, ADMIN, adminCleanup, loginAsAdmin, seriousA11yViolations, settle } from './fixtures'
import type { Locator, Page } from '@playwright/test'

/**
 * editor-parity (H2): the visual editor holds what the site renders —
 * GFM tables, callouts, videos, figures (caption, alt text, width), MDX
 * islands — edits them in place, moves blocks (drag handle menu,
 * Alt+↑ / ↓), reads pasted Markdown, and writes the body back unchanged.
 *
 * Every test creates its own synthetic draft (owner-neutral) and deletes
 * it afterwards. Admin-only: needs ADMIN_EMAIL / ADMIN_PASS.
 *
 * EDITOR_PARITY_SHOTS=<dir> also saves screenshots of the editor (1440 / 768
 * / 375) for a visual review, in EDITOR_PARITY_THEME (light | dark).
 */

const SHOTS = process.env.EDITOR_PARITY_SHOTS || ''
/** The theme the screenshots are taken in (a stored preference, so Chakra and the CSS tokens agree). */
const SHOT_THEME = process.env.EDITOR_PARITY_THEME === 'light' ? 'light' : 'dark'

const today = () => new Date().toISOString().slice(0, 10)

/** A body with every block the editor models, in the editor's own Markdown style (so a save writes it back byte for byte). */
const RICH_BODY = [
  'An opening paragraph with **bold**, *italic*, `code` and a [link](https://example.com).',
  '',
  '> [!TIP]',
  '> Keep the example rig on its own power supply.',
  '',
  '| Stage | Median | p95 |',
  '| :- | -: | -: |',
  '| Capture | 12 ms | 18 ms |',
  '| Detect | 31 ms | 44 ms |',
  '',
  '![A mountain range at dusk (example)](/images/hero/hero-mountains-1600.webp#wide "Example landscape")',
  '',
  '[Example walkthrough](https://www.youtube.com/watch?v=jkAqK3vqILI)',
  '',
  '<Figure src="/icons/icon-512.png" alt="The site icon" caption="An MDX component" />',
  '',
  'A closing paragraph with a note.[^1]',
  '',
  '[^1]: The footnote stays as written.',
].join('\n')

async function adminFetch(page: Page, method: string, url: string, body?: unknown) {
  return page.evaluate(
    async ([m, u, b]) => {
      const res = await fetch(u as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })
      return { status: res.status, text: await res.text() }
    },
    [method, url, body] as const,
  )
}

async function createDraft(page: Page, slug: string, body: string, title = 'E2E editor parity') {
  const out = await adminFetch(page, 'PUT', '/api/admin/posts', {
    slug,
    create: true,
    frontmatter: { title, date: today(), draft: true, description: 'Created by the editor-parity end-to-end suite to exercise the visual editor; deleted afterwards.' },
    body,
  })
  expect(out.status, out.text).toBe(200)
}

async function savedBody(page: Page, slug: string): Promise<string> {
  const out = await adminFetch(page, 'GET', `/api/admin/posts?slug=${slug}`)
  expect(out.status).toBe(200)
  return String((JSON.parse(out.text) as { body?: string }).body ?? '')
}

async function save(page: Page) {
  const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/posts' && r.request().method() === 'PUT')
  await page.keyboard.press('ControlOrMeta+KeyS')
  expect((await saved).status()).toBe(200)
}

async function openEditor(page: Page, slug: string): Promise<Locator> {
  if (SHOTS) await page.addInitScript((t) => window.localStorage.setItem('theme-preference', t), SHOT_THEME)
  await page.goto(`/admin/blog/edit?slug=${slug}`)
  const prose = page.locator('.tt-prose')
  await expect(prose).toBeVisible()
  return prose
}

/**
 * The caret right after `text` in the visual editor (through the editor, so
 * the place is exact on every platform: macOS has no End key for lines).
 */
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
  await expect(page.locator('.ProseMirror')).toBeFocused()
}

/** The MDX tab's text (without saving). */
async function mdxText(page: Page): Promise<string> {
  await page.getByRole('tab', { name: 'MDX' }).click()
  const value = await page.locator('textarea').first().inputValue()
  await page.getByRole('tab', { name: 'Visual' }).click()
  await expect(page.locator('.tt-prose')).toBeVisible()
  return value
}

/** A paste of plain text (and optionally HTML) into the visual editor, as the browser delivers it. */
async function paste(page: Page, text: string, opts: { html?: string; vscode?: boolean } = {}) {
  await page.evaluate(
    ([t, h, v]) => {
      const dt = new DataTransfer()
      dt.setData('text/plain', t as string)
      if (h) dt.setData('text/html', h as string)
      if (v) dt.setData('vscode-editor-data', '{"mode":"markdown"}')
      const target = document.querySelector('.ProseMirror') as HTMLElement
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    },
    [text, opts.html || '', !!opts.vscode] as const,
  )
}

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  await settle(page)
  await page.screenshot({ path: `${SHOTS}/${name}-${SHOT_THEME}.png`, fullPage: false })
}

test.describe('editor-parity', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('the visual editor shows tables, callouts, figures, videos and MDX blocks, and saves the body back unchanged @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-parity-${Date.now()}`
    await createDraft(page, slug, RICH_BODY)
    try {
      const prose = await openEditor(page, slug)
      await expect(page.getByRole('tab', { name: 'Visual' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByTestId('visual-fidelity')).toHaveCount(0)

      await expect(prose.locator('table.tt-table th').first()).toHaveText('Stage')
      await expect(prose.locator('table.tt-table td[data-align="right"]').first()).toHaveText('12 ms')
      await expect(prose.locator('.tt-callout[data-callout="tip"]')).toContainText('Keep the example rig')
      await expect(prose.getByRole('button', { name: 'Tip callout — change the type' })).toBeVisible()
      const figure = prose.locator('figure.tt-figure')
      await expect(figure.getByRole('textbox', { name: 'Caption' })).toHaveValue('Example landscape')
      await expect(figure.locator('img')).toHaveAttribute('alt', 'A mountain range at dusk (example)')
      await expect(prose.locator('[data-figure-width="wide"]')).toHaveCount(1)
      await expect(prose.locator('.tt-video')).toContainText('Example walkthrough')
      await expect(prose.locator('.tt-mdx-block[data-kind="component"]')).toContainText('<Figure')
      await expect(prose.locator('.tt-mdx-inline[data-kind="footnote-ref"]')).toHaveText('[^1]')

      for (const [w, h] of [
        [1440, 1000],
        [768, 1024],
        [375, 812],
      ]) {
        await page.setViewportSize({ width: w, height: h })
        await prose.locator('table.tt-table td').first().click()
        await shoot(page, `editor-rich-${w}`)
        await prose.locator('.tt-video').scrollIntoViewIfNeeded()
        await shoot(page, `editor-rich-lower-${w}`)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `no horizontal overflow at ${w}px`).toBeLessThanOrEqual(0)
      }
      await page.setViewportSize({ width: 1280, height: 800 })

      // One small edit: the rest is written back byte for byte.
      await caretAfter(page, 'A closing paragraph')
      await page.keyboard.type(' that ends')
      await save(page)
      expect(await savedBody(page, slug)).toBe(RICH_BODY.replace('A closing paragraph', 'A closing paragraph that ends'))

      await settle(page)
      expect(await seriousA11yViolations(page)).toEqual([])
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('tables: /table inserts one; Tab and Enter move between cells; the toolbar aligns columns and turns the header row off @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-parity-table-${Date.now()}`
    await createDraft(page, slug, 'Start here.')
    try {
      const prose = await openEditor(page, slug)
      await caretAfter(page, 'Start here.')
      await page.keyboard.press('Enter')
      await page.keyboard.type('/table')
      await expect(page.getByRole('option', { name: /Table/ }).first()).toHaveAttribute('aria-selected', 'true')
      await page.keyboard.press('Enter')
      const table = prose.locator('table.tt-table')
      await expect(table.locator('tr')).toHaveCount(3)
      await expect(page.getByTestId('editor-live')).toContainText('Table inserted')
      for (const [text, key] of [
        ['Name', 'Tab'],
        ['Score', 'Tab'],
        ['Note', 'Tab'],
        ['Ada', 'Tab'],
        ['42', 'Tab'],
        ['first', 'Enter'],
        ['later', ''],
      ]) {
        await page.keyboard.type(text)
        if (key) await page.keyboard.press(key)
      }
      const toolbar = page.getByRole('toolbar', { name: /Table/ })
      await expect(toolbar).toBeVisible()
      await table.getByText('42').click()
      await toolbar.getByRole('button', { name: 'Align column right' }).click()
      await expect(toolbar.getByRole('button', { name: 'Align column right' })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('editor-live')).toContainText('Column aligned right.')
      await shoot(page, 'table-toolbar')
      // Alt+F10 reaches the toolbar from the keyboard; Esc goes back to the cell.
      await page.keyboard.press('Alt+F10')
      await expect(toolbar.getByRole('button', { name: 'Row above' })).toBeFocused()
      await page.keyboard.press('ArrowRight')
      await expect(toolbar.getByRole('button', { name: /Row below/ })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(prose).toBeFocused()
      expect(await mdxText(page)).toBe('Start here.\n\n| Name | Score | Note |\n| - | -: | - |\n| Ada | 42 | first |\n| | | later |')

      await table.getByText('Ada').click()
      await toolbar.getByRole('button', { name: 'Header row: on' }).click()
      await expect(table.locator('th')).toHaveCount(0)
      expect(await mdxText(page)).toBe('Start here.\n\n| | | |\n| - | -: | - |\n| Name | Score | Note |\n| Ada | 42 | first |\n| | | later |')
      await save(page)
      // The page renders the alignment (the article's table honours GFM alignment).
      const preview = await adminFetch(page, 'POST', '/api/admin/preview', { body: await savedBody(page, slug) })
      expect(preview.status).toBe(200)
      expect(preview.text).toContain('"align":"right"')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('callouts: the label is a menu that changes the type or removes the callout; /caution makes one @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-parity-callout-${Date.now()}`
    await createDraft(page, slug, '> [!NOTE]\n> An example note.')
    try {
      const prose = await openEditor(page, slug)
      await prose.getByRole('button', { name: 'Note callout — change the type' }).click()
      const menu = page.getByRole('menu')
      await expect(menu.getByRole('menuitemradio', { name: 'Note' })).toHaveAttribute('aria-checked', 'true')
      await shoot(page, 'callout-menu')
      await menu.getByRole('menuitemradio', { name: 'Warning' }).click()
      await expect(prose.locator('.tt-callout[data-callout="warning"]')).toHaveCount(1)
      expect(await mdxText(page)).toBe('> [!WARNING]\n> An example note.')
      await prose.getByRole('button', { name: 'Warning callout — change the type' }).click()
      await page.getByRole('menuitem', { name: 'Remove callout (keep the text)' }).click()
      await expect(prose.locator('.tt-callout')).toHaveCount(0)
      expect(await mdxText(page)).toBe('An example note.')

      await caretAfter(page, 'An example note.')
      await page.keyboard.press('Enter')
      await page.keyboard.type('/caution')
      await page.keyboard.press('Enter')
      await page.keyboard.type('Mains voltage.')
      await expect(prose.locator('.tt-callout[data-callout="caution"]')).toContainText('Mains voltage.')
      expect(await mdxText(page)).toBe('An example note.\n\n> [!CAUTION]\n> Mains voltage.')

      // Keyboard only: from the callout's text, Tab reaches its type menu; arrows and Enter choose.
      await caretAfter(page, 'Mains')
      await page.keyboard.press('Tab')
      const typeButton = prose.getByRole('button', { name: 'Caution callout — change the type' })
      await expect(typeButton).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('menuitemradio', { name: 'Caution' })).toBeFocused()
      await page.keyboard.press('Home')
      await expect(page.getByRole('menuitemradio', { name: 'Note' })).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await expect(prose.locator('.tt-callout[data-callout="tip"]')).toContainText('Mains voltage.')
      await expect(prose).toBeFocused()
      expect(await mdxText(page)).toBe('An example note.\n\n> [!TIP]\n> Mains voltage.')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('typing [!WARNING] at the start of a quote makes it a callout, as the page reads it @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-parity-quote-${Date.now()}`
    await createDraft(page, slug, 'Intro.')
    try {
      const prose = await openEditor(page, slug)
      await caretAfter(page, 'Intro.')
      await page.keyboard.press('Enter')
      await page.keyboard.type('> [!WARNING] Hot surface')
      await expect(prose.locator('.tt-callout[data-callout="warning"]')).toContainText('Hot surface')
      expect(await mdxText(page)).toBe('Intro.\n\n> [!WARNING]\n> Hot surface')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('figures: the alt text prompt, the caption in place and the width presets @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-parity-figure-${Date.now()}`
    await createDraft(page, slug, 'Above.\n\n![](/images/hero/hero-mountains-1600.webp)')
    try {
      const prose = await openEditor(page, slug)
      const figure = prose.locator('figure.tt-figure')
      await expect(figure).toContainText('Missing — describe what the image shows')
      const alt = figure.getByRole('textbox', { name: /Alt text/ })
      await expect(alt).toHaveAttribute('aria-invalid', 'true')
      await alt.fill('Mountain ridges at dusk')
      await expect(alt).not.toHaveAttribute('aria-invalid', 'true')
      await figure.getByRole('textbox', { name: 'Caption' }).fill('An example landscape')
      await figure.locator('img').click()
      const tools = figure.getByRole('toolbar', { name: 'Image' })
      await expect(tools).toHaveAttribute('data-visible', 'true')
      await tools.getByRole('button', { name: 'Full' }).click()
      await expect(tools.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'true')
      await expect(prose.locator('[data-figure-width="full"]')).toHaveCount(1)
      await shoot(page, 'figure-selected')
      expect(await mdxText(page)).toBe('Above.\n\n![Mountain ridges at dusk](/images/hero/hero-mountains-1600.webp#full "An example landscape")')

      // Keyboard only: ↓ from the line above selects the figure, Tab reaches its toolbar.
      await caretAfter(page, 'Above.')
      await page.keyboard.press('ArrowDown')
      await expect(tools).toHaveAttribute('data-visible', 'true')
      await page.keyboard.press('Tab')
      await expect(tools.getByRole('button', { name: 'Text' })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(tools.getByRole('button', { name: 'Wide' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(tools.getByRole('button', { name: 'Wide' })).toHaveAttribute('aria-pressed', 'true')
      expect(await mdxText(page)).toBe('Above.\n\n![Mountain ridges at dusk](/images/hero/hero-mountains-1600.webp#wide "An example landscape")')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('videos: a YouTube link pasted on an empty line becomes the player; its title is edited under it @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-parity-video-${Date.now()}`
    await createDraft(page, slug, 'Intro.')
    try {
      const prose = await openEditor(page, slug)
      await caretAfter(page, 'Intro.')
      await page.keyboard.press('Enter')
      await paste(page, 'https://youtu.be/jkAqK3vqILI')
      const video = prose.locator('.tt-video')
      await expect(video).toHaveCount(1)
      await expect(video).toContainText('plays from youtube-nocookie.com')
      await video.getByRole('textbox', { name: 'Video title' }).fill('An example walkthrough')
      await expect(video).toContainText('An example walkthrough')
      await shoot(page, 'video')
      expect(await mdxText(page)).toBe('Intro.\n\n[An example walkthrough](https://youtu.be/jkAqK3vqILI)')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('blocks move with Alt+↑ / ↓ and from the block handle’s menu (move, duplicate, delete) @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-parity-move-${Date.now()}`
    await createDraft(page, slug, 'First block.\n\nSecond block.\n\nThird block.')
    try {
      const prose = await openEditor(page, slug)
      await caretAfter(page, 'Third')
      await page.keyboard.press('Alt+ArrowUp')
      await expect(page.getByTestId('editor-live')).toContainText('Block moved up.')
      expect(await mdxText(page)).toBe('First block.\n\nThird block.\n\nSecond block.')

      const handle = page.getByRole('button', { name: 'Block actions — drag to move' })
      await prose.getByText('First block.').hover()
      await expect(handle).toBeVisible()
      await handle.click()
      await shoot(page, 'block-menu')
      await page.getByRole('menuitem', { name: /Move down/ }).click()
      expect(await mdxText(page)).toBe('Third block.\n\nFirst block.\n\nSecond block.')
      await prose.getByText('Second block.').hover()
      await handle.click()
      await page.getByRole('menuitem', { name: 'Duplicate' }).click()
      expect(await mdxText(page)).toBe('Third block.\n\nFirst block.\n\nSecond block.\n\nSecond block.')
      await prose.getByText('Third block.').hover()
      await handle.click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      expect(await mdxText(page)).toBe('First block.\n\nSecond block.\n\nSecond block.')

      // Dragging the handle moves the block (ProseMirror's drop: before the block it lands on).
      await caretAfter(page, 'First block.')
      await page.keyboard.type(' One')
      await prose.getByText('First block. One').hover()
      const from = await handle.boundingBox()
      const to = await prose.getByText('Second block.').last().boundingBox()
      expect(from && to).toBeTruthy()
      if (from && to) {
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
        await page.mouse.down()
        await page.mouse.move(from.x + 40, from.y + 40, { steps: 3 })
        // The end of the last block's line: the block lands after it.
        await page.mouse.move(to.x + to.width - 8, to.y + to.height / 2, { steps: 6 })
        await page.mouse.up()
      }
      expect(await mdxText(page)).toBe('Second block.\n\nSecond block.\n\nFirst block. One')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('pasted Markdown (plain or from a code editor) becomes headings, lists, tables, code and links @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-parity-paste-${Date.now()}`
    await createDraft(page, slug, 'Notes:')
    try {
      const prose = await openEditor(page, slug)
      await caretAfter(page, 'Notes:')
      await page.keyboard.press('Enter')
      await paste(page, '## Plan\n\n- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```js\nrun()\n```\n\nSee [the docs](https://example.com).')
      await expect(prose.locator('h2')).toHaveText('Plan')
      await expect(prose.locator('ul li')).toHaveCount(2)
      await expect(prose.locator('table.tt-table')).toHaveCount(1)
      await expect(prose.locator('pre')).toContainText('run()')
      await expect(prose.getByRole('link', { name: 'the docs' })).toHaveAttribute('href', 'https://example.com')
      expect(await mdxText(page)).toBe('Notes:\n\n## Plan\n\n- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```js\nrun()\n```\n\nSee [the docs](https://example.com).')
      // From a code editor (its HTML is only colouring): read as Markdown too.
      await caretAfter(page, 'the docs')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Enter')
      await paste(page, '> quoted *line*', { html: '<div style="white-space: pre; font-family: Menlo"><span>&gt; quoted *line*</span></div>', vscode: true })
      await expect(prose.locator('blockquote em')).toHaveText('line')
      // Plain prose with stray symbols stays text.
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await paste(page, '2 * 3 = 6 and snake_case')
      await expect(prose).toContainText('2 * 3 = 6 and snake_case')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('MDX blocks: the source is edited in place, invalid MDX names its line, /mdx adds one @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-parity-mdx-${Date.now()}`
    await createDraft(page, slug, 'Before.\n\n<Figure src="/icons/icon-512.png" alt="Icon" />')
    try {
      const prose = await openEditor(page, slug)
      const island = prose.locator('.tt-mdx-block')
      await expect(island).toContainText('<Figure>')
      await island.getByRole('button', { name: /Edit the source/ }).click()
      const source = island.locator('textarea')
      await expect(source).toBeFocused()
      await source.fill('<Figure src="/icons/icon-512.png" alt="Icon"')
      await island.getByRole('button', { name: 'Done' }).click()
      await expect(island.getByRole('alert')).toContainText('line')
      await shoot(page, 'mdx-error')
      await source.fill('<Figure src="/icons/icon-512.png" alt="The site icon" />')
      await page.keyboard.press('ControlOrMeta+Enter')
      await expect(island.locator('textarea')).toHaveCount(0)
      expect(await mdxText(page)).toBe('Before.\n\n<Figure src="/icons/icon-512.png" alt="The site icon" />')

      await caretAfter(page, 'Before.')
      await page.keyboard.press('Enter')
      await page.keyboard.type('/mdx')
      await page.keyboard.press('Enter')
      const fresh = prose.locator('.tt-mdx-block').first()
      await expect(fresh.locator('textarea')).toBeFocused()
      await page.keyboard.type('{/* An editorial note */}')
      await page.keyboard.press('ControlOrMeta+Enter')
      expect(await mdxText(page)).toBe('Before.\n\n{/* An editorial note */}\n\n<Figure src="/icons/icon-512.png" alt="The site icon" />')
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('a body that is not valid MDX opens on the MDX tab, says why and jumps to the line @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-parity-invalid-${Date.now()}`
    // The API refuses to store invalid MDX (422): break it in the MDX tab instead.
    await createDraft(page, slug, 'Line one.\n\nLine two.')
    try {
      await openEditor(page, slug)
      // The live preview would compile the broken body (a 422 the browser logs): hide it first.
      await page.getByRole('button', { name: /Hide preview/ }).click()
      await page.getByRole('tab', { name: 'MDX' }).click()
      const textarea = page.locator('textarea').first()
      await textarea.fill('Line one.\n\nLine two.\n\n<Figure src="/icons/icon-512.png"')
      await page.getByRole('tab', { name: 'Visual' }).click()
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toContainText('Fix the MDX first')
      await expect(dialog.getByRole('button', { name: 'Open visual editor' })).toHaveCount(0)
      await shoot(page, 'fidelity-dialog')
      await dialog.getByRole('button', { name: /Go to line/ }).click()
      await expect(textarea).toBeFocused()
      await expect(page.getByTestId('visual-fidelity')).toContainText('not valid MDX')
      await textarea.fill('Line one.\n\nLine two.\n\n<Figure src="/icons/icon-512.png" />')
      await expect(page.getByTestId('visual-fidelity')).toHaveCount(0)
      await page.getByRole('tab', { name: 'Visual' }).click()
      await expect(page.locator('.tt-mdx-block')).toHaveCount(1)
    } finally {
      await adminCleanup(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })
})
