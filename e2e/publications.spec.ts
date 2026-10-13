import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, seriousA11yViolations, settle } from './fixtures'

/**
 * Publications (论文): nothing public exists until the owner adds a public
 * paper in CV Studio — then /cv, /publications, the nav and the ⌘K palette
 * show it, its citations copy, a hidden field disappears everywhere, and
 * deleting it brings the 404 back. The admin test restores the stored CV it
 * started from.
 */

const PRIMARY_NAV = { name: 'Primary' }

// The admin test adds (then deletes) a paper: run this file's tests in order
// in one worker, so the empty-store checks never see that paper.
test.describe.configure({ mode: 'default' })

async function hasPublicPapers(request: APIRequestContext): Promise<boolean> {
  return (await request.get('/publications')).status() === 200
}

async function openPalette(page: Page) {
  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('ControlOrMeta+KeyK')
  const input = page.getByRole('combobox')
  await expect(input).toBeVisible()
  return input
}

test.describe('publications without a public paper', () => {
  test('/publications answers 404 and nothing links to it', async ({ page, request }) => {
    test.skip(await hasPublicPapers(request), 'the store has public papers')
    const res = await page.goto('/publications')
    expect(res?.status()).toBe(404)
    for (const path of ['/', '/cv', '/cv/zh', '/blog']) {
      await page.goto(path)
      await expect(page.locator('a[href="/publications"]'), `${path} links to /publications`).toHaveCount(0)
    }
    expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/publications')
    // The palette does not offer the page either.
    await page.goto('/')
    const input = await openPalette(page)
    await input.fill('publications')
    await expect(page.getByRole('option', { name: /^Publications\b/ })).toHaveCount(0)
  })
})

type CvDoc = { en: any[]; zh: any[] }

test.describe('publications in CV Studio', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  // A stuck step fails fast, so the stored CV is still restored in `finally`.
  test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 })

  test('a paper added in CV Studio appears everywhere, its citations copy, a hidden DOI vanishes, deleting it restores the 404', async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(240_000)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await loginAsAdmin(page)

    // Through the page's own fetch: the session cookie is Secure (see admin.spec).
    const adminFetch = (method: string, url: string, body?: unknown) =>
      page.evaluate(
        async ([m, u, b]) => {
          const res = await fetch(u as string, {
            method: m as string,
            headers: { 'Content-Type': 'application/json' },
            body: b === undefined ? undefined : JSON.stringify(b),
          })
          return { status: res.status, text: await res.text() }
        },
        [method, url, body] as const,
      )
    const stored = await adminFetch('GET', '/api/admin/cvdata')
    expect(stored.status, stored.text).toBe(200)
    const original = JSON.parse(stored.text) as CvDoc
    const writeCv = async (doc: CvDoc) => {
      const r = await adminFetch('PUT', '/api/cvdata', doc)
      expect(r.status, r.text).toBe(200)
    }

    // The owner's public name (if the store has one) is emphasised in author lists.
    const info = original.en.find((s) => s?.sessionName === 'personalInformation')
    const hidden = (k: string) => Array.isArray(info?.hiddenFields) && info.hiddenFields.includes(k)
    const ownName = info?.firstName && info?.lastName && !hidden('firstName') && !hidden('lastName') ? `${info.firstName} ${info.lastName}` : ''
    const TITLE = `E2E paper ${Date.now()}`
    const DOI = '10.5555/e2e-publication.1'
    const coauthor = 'E2E Coauthor'
    const ABSTRACT = 'E2E abstract: written by the end-to-end suite and deleted afterwards.'
    const firstAuthor = ownName || 'E2E Author'

    const save = async () => {
      const response = page.waitForResponse((r) => /^\/api\/(admin\/)?cvdata$/.test(new URL(r.url()).pathname) && r.request().method() === 'PUT')
      await page.keyboard.press('ControlOrMeta+KeyS')
      const r = await response
      expect(r.status()).toBe(200)
      const body = (await r.json()) as { revalidated?: string[]; revalidateFailed?: string[] }
      expect(body.revalidateFailed ?? [], 'every CV page regenerated').toEqual([])
      expect(body.revalidated ?? []).toContain('/publications')
    }

    // A deterministic start: no publications section (a retry may have left one).
    const start: CvDoc = {
      en: original.en.filter((s) => s?.sessionName !== 'publications'),
      zh: original.zh.filter((s) => s?.sessionName !== 'publications'),
    }
    if (start.en.length !== original.en.length || start.zh.length !== original.zh.length) await writeCv(start)

    try {
      // ── Add the section and a paper ───────────────────────────────────
      await page.goto('/admin/dashboard?tab=cv')
      await page.getByRole('button', { name: 'Add section' }).click()
      await page.getByRole('menuitem', { name: /^Publications/ }).click()
      await page.getByRole('button', { name: 'Add paper' }).click()

      // Required fields add a visual "•" to their label text: match the accessible name instead.
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill(TITLE)
      // Authors: add, Enter for the next, reorder by keyboard, remove.
      await page.getByRole('button', { name: 'Add author' }).click()
      await page.keyboard.type(coauthor)
      await page.keyboard.press('Enter')
      await page.keyboard.type(firstAuthor)
      await page.keyboard.press('Alt+ArrowUp')
      await expect(page.getByRole('textbox', { name: /^Author 1 of 2/ })).toHaveValue(firstAuthor)
      await expect(page.getByRole('textbox', { name: /^Author 2 of 2/ })).toHaveValue(coauthor)
      await page.getByRole('button', { name: 'Add author' }).click()
      await page.keyboard.type('Removed Author')
      await page.getByRole('button', { name: 'Remove Author 3 of 3' }).click()
      await expect(page.getByRole('textbox', { name: /^Author \d of 2/ })).toHaveCount(2)

      await page.getByRole('textbox', { name: 'Venue', exact: true }).fill('E2E Journal of Testing')
      await page.getByRole('combobox', { name: 'Venue type', exact: true }).selectOption('journal')
      await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('accepted')
      await page.getByRole('textbox', { name: 'Date', exact: true }).fill('2026-05')
      await page.getByRole('textbox', { name: 'DOI', exact: true }).fill(DOI)
      await page.getByRole('textbox', { name: 'Abstract', exact: true }).fill(ABSTRACT)
      await save()

      // ── /publications ────────────────────────────────────────────────
      const res = await page.goto('/publications')
      expect(res?.status()).toBe(200)
      const item = page.locator('article').filter({ hasText: TITLE })
      await expect(item.getByRole('heading', { name: TITLE })).toBeVisible()
      await expect(item.getByText('Accepted', { exact: true }), 'unpublished work carries its status').toBeVisible()
      await expect(item.getByRole('link', { name: new RegExp(`doi:\\s*${DOI.replace(/\./g, '\\.')}`) })).toHaveAttribute('href', `https://doi.org/${DOI}`)
      if (ownName) await expect(item.locator('strong', { hasText: ownName })).toBeVisible()
      const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
      expect(ld.join('\n')).toContain('"ScholarlyArticle"')
      expect(ld.join('\n')).toContain(`"value":"${DOI}"`)

      await settle(page)
      await expect(page.locator('h1:visible')).toHaveCount(1)
      expect(await seriousA11yViolations(page), 'axe serious/critical').toEqual([])
      const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
      expect(widths.scroll).toBeLessThanOrEqual(widths.inner)

      // Copy BibTeX: toast + clipboard.
      await item.getByRole('button', { name: /^Copy BibTeX/ }).click()
      await expect(page.getByText('BibTeX copied')).toBeVisible()
      const bib = await page.evaluate(() => navigator.clipboard.readText())
      expect(bib).toMatch(/^@article\{/)
      expect(bib).toMatch(new RegExp(`doi\\s+= \\{${DOI.replace(/\./g, '\\.')}\\}`))
      expect(bib).toMatch(/note\s+= \{Accepted\}/)

      // The abstract is collapsed until asked for.
      const toggle = item.getByRole('button', { name: 'Abstract' })
      const panel = page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`)
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(panel).toHaveAttribute('inert', '')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(panel).not.toHaveAttribute('inert', '')
      await expect(panel.getByText(ABSTRACT)).toBeVisible()

      // The nav lists the page.
      await expect(page.getByRole('navigation', PRIMARY_NAV).getByRole('link', { name: 'Publications' })).toHaveAttribute('aria-current', 'page')

      // ── /cv, the nav and the palette ─────────────────────────────────
      await page.goto('/cv')
      await expect(page.locator('#A4Paper')).toContainText(TITLE)
      await expect(page.locator('#A4Paper')).toContainText('Accepted')
      // The abstract is a disclosure on screen and never printed.
      const abstract = page.locator('#A4Paper details')
      await expect(abstract.locator('summary')).toBeVisible()
      await page.emulateMedia({ media: 'print' })
      await expect(abstract).toBeHidden()
      await expect(page.locator('#A4Paper')).toContainText(TITLE)
      await page.emulateMedia({ media: 'screen' })
      await expect(page.getByRole('main').getByRole('link', { name: /^Publications/ }).first()).toHaveAttribute('href', '/publications')
      await expect(page.getByRole('navigation', PRIMARY_NAV).getByRole('link', { name: 'Publications' })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Publications' })).toBeVisible()
      const input = await openPalette(page)
      await input.fill('publications')
      const option = page.getByRole('option', { name: /^Publications\b/ }).first()
      await expect(option).toBeVisible()
      await option.click()
      await page.waitForURL('**/publications')

      // ── Hide the DOI: gone from every public surface ─────────────────
      await page.goto('/admin/dashboard?tab=cv')
      await page.getByRole('button', { name: /^Publications\b/ }).first().click()
      await page.getByRole('button', { name: 'Hide DOI from CV and website' }).click()
      await save()
      for (const path of ['/publications', '/cv']) {
        await page.goto(path)
        expect(await page.content(), `${path} still shows the hidden DOI`).not.toContain(DOI)
      }
      expect(await (await request.get('/api/cvdata')).text()).not.toContain(DOI)

      // ── Delete the paper: the 404 and the missing link come back ─────
      await page.goto('/admin/dashboard?tab=cv')
      await page.getByRole('button', { name: /^Publications\b/ }).first().click()
      await page.getByRole('button', { name: `More actions for ${TITLE}` }).click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      // Linked languages: the 中文 twin holds the shared status / date, so the Studio asks first.
      const both = page.getByRole('button', { name: 'Delete in both' })
      await both.waitFor({ state: 'visible', timeout: 5000 }).then(
        () => both.click(),
        () => undefined,
      )
      await save()
      expect((await page.goto('/publications'))?.status()).toBe(404)
      await page.goto('/')
      await expect(page.locator('a[href="/publications"]')).toHaveCount(0)
    } finally {
      await writeCv(original)
    }
  })
})
