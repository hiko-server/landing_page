import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, seriousA11yViolations, settle } from './fixtures'
import { pdfText, squashSpace } from './pdfText'

/**
 * Publications, phase 2: a public paper reaches the PDF CVs (as text a PDF
 * viewer finds), the plain-text CV, the JSON Resume, the home page's
 * "Selected Publications", the /about rail's count and the ⌘K search index
 * — and nothing hidden does. Without a paper none of it exists. The admin
 * test writes a CV with a paper and restores the stored CV afterwards.
 */

// The admin test adds (then removes) a paper: run this file's tests in order
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

test.describe('publications phase 2 without a public paper', () => {
  test('no home section, no rail link, no paper in search', async ({ page, request }) => {
    test.skip(await hasPublicPapers(request), 'the store has public papers')
    await page.goto('/')
    await expect(page.locator('#section-publications')).toHaveCount(0)
    await page.goto('/about')
    await expect(page.locator('a[href="/publications"]')).toHaveCount(0)
    const index = (await (await request.get('/api/search-index')).json()) as { docs: Array<{ href: string }> }
    expect(index.docs.filter((d) => d.href.startsWith('/publications'))).toEqual([])
  })
})

type CvDoc = { en: any[]; zh: any[] }

test.describe('publications phase 2 everywhere', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 })

  test('a paper added to the CV appears in the PDF text, the text CV, the JSON Resume, the home section, the /about rail and search — nothing hidden does', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000)
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
      const body = JSON.parse(r.text) as { revalidated?: string[]; revalidateFailed?: string[] }
      expect(body.revalidateFailed ?? [], 'every CV page regenerated').toEqual([])
    }

    const info = original.en.find((s) => s?.sessionName === 'personalInformation')
    const hidden = (k: string) => Array.isArray(info?.hiddenFields) && info.hiddenFields.includes(k)
    const ownName = info?.firstName && info?.lastName && !hidden('firstName') && !hidden('lastName') ? `${info.firstName} ${info.lastName}` : ''
    const stamp = Date.now()
    const TITLE = `E2E paper ${stamp}`
    const VENUE = 'E2E Journal of Testing'
    const DOI = `10.5555/e2e-phase2.${stamp}`
    const SECRET = `ZZ-E2E-HIDDEN-${stamp}`
    const paper = {
      title: TITLE,
      authors: [ownName || 'E2E Author', `${SECRET} Coauthor`, 'E2E Coauthor'],
      hiddenItems: { authors: [1] },
      venue: VENUE,
      venueType: 'journal',
      status: 'published',
      date: '2026-05',
      volume: '7',
      issue: '2',
      pages: '10-20',
      doi: DOI,
      abstract: `${SECRET} abstract`,
      hiddenFields: ['abstract'],
      keywords: ['end-to-end'],
    }
    const withPaper = (lang: 'en' | 'zh') => [
      ...original[lang].filter((s) => s?.sessionName !== 'publications'),
      { sessionName: 'publications', headerName: lang === 'zh' ? '论文' : 'Publications', papers: [paper] },
    ]

    try {
      await writeCv({ en: withPaper('en'), zh: withPaper('zh') })

      // ── The PDF CVs: the paper is real, findable text ──────────────────
      for (const path of ['/cv.pdf', '/cv/zh.pdf']) {
        const res = await request.get(path)
        expect(res.status(), path).toBe(200)
        const body = await res.body()
        const text = squashSpace(pdfText(body))
        expect(text, `${path}: title`).toContain(squashSpace(TITLE))
        expect(text, `${path}: venue`).toContain(squashSpace(VENUE))
        expect(text, `${path}: DOI as its URL`).toContain(squashSpace(`https://doi.org/${DOI}`))
        expect(text, `${path}: the hidden co-author is a placeholder`).toContain('…')
        if (ownName) expect(text).toContain(squashSpace(ownName))
        expect(body.toString('latin1'), `${path}: DOI link`).toContain(`/URI (https://doi.org/${DOI})`)
        expect(text).not.toContain(SECRET)
        expect(body.toString('latin1')).not.toContain(SECRET)
      }

      // ── Plain text and JSON Resume ─────────────────────────────────────
      const txt = await (await request.get('/cv.txt')).text()
      expect(txt).toContain(TITLE)
      expect(txt).toContain(`${VENUE}, 7(2), 10–20`)
      expect(txt).toContain(`https://doi.org/${DOI}`)
      expect(txt).not.toContain(SECRET)
      const resume = (await (await request.get('/cv.json')).json()) as { publications: Array<Record<string, string>> }
      expect(resume.publications[0]).toEqual({ name: TITLE, publisher: VENUE, releaseDate: '2026-05', url: `https://doi.org/${DOI}` })
      expect(JSON.stringify(resume)).not.toContain(SECRET)

      // ── Home: "Selected Publications" ──────────────────────────────────
      await page.goto('/')
      const section = page.locator('#section-publications')
      await expect(section.getByRole('heading', { level: 2, name: 'Selected Publications' })).toBeVisible()
      const link = section.getByRole('link', { name: TITLE, exact: true })
      await expect(link).toHaveAttribute('href', /^\/publications#[a-z0-9]+$/)
      if (ownName) await expect(section.locator('strong', { hasText: ownName })).toBeVisible()
      await expect(section.getByRole('link', { name: /^All publications/ })).toHaveAttribute('href', '/publications')
      expect(await page.content()).not.toContain(SECRET)
      await settle(page)
      expect(await seriousA11yViolations(page), 'axe serious/critical').toEqual([])
      const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
      expect(widths.scroll).toBeLessThanOrEqual(widths.inner)
      // The row link opens the paper on /publications.
      const href = (await link.getAttribute('href')) as string
      await link.click()
      await page.waitForURL(`**${href}`)
      await expect(page.locator(`[id="${href.split('#')[1]}"]`)).toContainText(TITLE)

      // ── /about: the rail links /publications with the count ───────────
      await page.goto('/about')
      const rail = page.getByRole('link', { name: 'Publications: 1 paper' })
      await expect(rail).toBeVisible()
      await expect(rail).toHaveAttribute('href', '/publications')
      expect(await page.content()).not.toContain(SECRET)

      // ── Search: the index and the ⌘K palette ──────────────────────────
      const index = (await (await request.get('/api/search-index')).json()) as { docs: Array<Record<string, unknown>> }
      const doc = index.docs.find((d) => d.title === TITLE)
      expect(doc, 'the paper is indexed').toBeTruthy()
      expect(doc?.href).toBe(href)
      expect(doc?.description).toBe(`${VENUE} · 2026`)
      expect(JSON.stringify(index)).not.toContain(SECRET)
      await page.goto('/')
      const input = await openPalette(page)
      await input.fill(`paper ${stamp}`)
      const option = page.getByRole('option', { name: new RegExp(TITLE) }).first()
      await expect(option).toBeVisible()
      await option.click()
      await page.waitForURL(`**${href}`)
    } finally {
      await writeCv(original)
    }

    // Restored: no paper anywhere again (the original store had none, or its own).
    const after = (await (await request.get('/api/search-index')).json()) as { docs: Array<{ title: string }> }
    expect(after.docs.some((d) => d.title === TITLE)).toBe(false)
  })
})
