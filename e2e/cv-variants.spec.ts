import type { Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, seriousA11yViolations, settle } from './fixtures'
import { pdfText, squashSpace } from './pdfText'

/**
 * CV variants and private links (E4).
 *
 * Public: a share address that opens nothing is the same neutral 404
 * everywhere — page, language page and PDF — and every answer under /cv/r/
 * is private, never stored, never indexed and sends no Referer.
 *
 * @admin: a field kept to downloads and private links (synthetic phone
 * number) is gone from /cv (HTML and __NEXT_DATA__) and /api/cvdata but in
 * /cv.txt and the PDF; the Studio shows the field's "Shows on" chip. A
 * variant made in "Variants & links" with chosen entries, a private link
 * made for it, opened as a visitor (no cookie): the variant's CV with the
 * private field, its PDF, nothing of the variant's name or the owner's note;
 * the open is counted after the page has been seen; revoking ends it at
 * once. The stored CV and variants are restored afterwards.
 */

const TOKEN_SHAPE = 'Abcdefghijklmnopqrstuvwxyz012345678901234_-'

test.describe('private CV links — public', () => {
  test('an address that opens nothing: the same neutral 404, private and unindexed, for the page, the language page and the PDF', async ({ page, request }) => {
    for (const path of [`/cv/r/${TOKEN_SHAPE}`, `/cv/r/${TOKEN_SHAPE}/zh`, '/cv/r/short']) {
      const res = await page.goto(path)
      expect(res?.status(), path).toBe(404)
      const h = res!.headers()
      expect(h['x-robots-tag'], path).toMatch(/noindex/)
      expect(h['cache-control'], path).toMatch(/no-store/)
      expect(h['referrer-policy'], path).toBe('no-referrer')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(path.endsWith('/zh') ? '此链接已不可用' : 'This link isn’t available')
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
      await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
      await expect(page.getByRole('link', { name: path.endsWith('/zh') ? '查看公开简历' : 'View the public CV' })).toBeVisible()
    }
    await settle(page)
    expect(await seriousA11yViolations(page)).toEqual([])
    const pdf = await request.get(`/cv/r/${TOKEN_SHAPE}/en.pdf`)
    expect(pdf.status()).toBe(404)
    expect(pdf.headers()['cache-control']).toMatch(/no-store/)
    expect(pdf.headers()['x-robots-tag']).toMatch(/noindex/)
    // The open beacon answers the same 204 whatever it is sent.
    expect((await request.post('/api/cv/share', { data: JSON.stringify({ t: TOKEN_SHAPE }), headers: { 'Content-Type': 'text/plain' } })).status()).toBe(204)
  })
})

type CvDoc = { en: any[]; zh: any[] }

async function adminFetch(p: Page, method: string, url: string, body?: unknown) {
  return p.evaluate(
    async ([m, u, b]) => {
      const res = await fetch(u as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })
      return { status: res.status, text: await res.text(), etag: res.headers.get('ETag') }
    },
    [method, url, body] as const,
  )
}

test.describe('CV audiences, variants and private links', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 })

  test('a field kept off the pages; a variant shared by a private link, opened, counted and revoked', async ({ page, browser, request }) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await loginAsAdmin(page)

    const stored = await adminFetch(page, 'GET', '/api/admin/cvdata')
    expect(stored.status, stored.text).toBe(200)
    const original = JSON.parse(stored.text) as CvDoc
    const variantsBefore = await adminFetch(page, 'GET', '/api/admin/cv-variants')
    const originalVariants = JSON.parse(variantsBefore.text).variants

    const PHONE = '+00 5550 0199'
    const ROLE_A = 'E2E Role Alpha'
    const ROLE_B = 'E2E Role Beta'
    const withFixture = (lang: 'en' | 'zh') => {
      const list = original[lang].filter((s) => s?.sessionName !== 'personalInformation' && s?.sessionName !== 'workExperience')
      return [
        { sessionName: 'personalInformation', firstName: 'Example', lastName: 'Person', phoneNumber: PHONE, fieldsOnlyIn: { phoneNumber: ['download', 'private'] } },
        {
          sessionName: 'workExperience',
          headerName: lang === 'zh' ? '工作经历' : 'WORK EXPERIENCE',
          experiences: [
            { uid: 'e2e-role-a', jobTitle: ROLE_A, companyName: 'Example Co', startDate: '2024-01', endDate: 'present' },
            { uid: 'e2e-role-b', jobTitle: ROLE_B, companyName: 'Example Lab', startDate: '2023-01', endDate: '2023-12' },
          ],
        },
        ...list,
      ]
    }
    const put = await adminFetch(page, 'PUT', '/api/cvdata', { en: withFixture('en'), zh: withFixture('zh') })
    expect(put.status, put.text).toBe(200)

    let linkUrl = ''
    try {
      // ── The audience on the public outputs ────────────────────────────
      const cvHtml = await (await request.get('/cv')).text()
      expect(cvHtml, '/cv HTML and __NEXT_DATA__').not.toContain(PHONE)
      expect(cvHtml).toContain(ROLE_A)
      expect(await (await request.get('/api/cvdata')).text(), '/api/cvdata').not.toContain(PHONE)
      expect(await (await request.get('/cv.txt')).text(), '/cv.txt').toContain(PHONE)
      expect(squashSpace(pdfText(await (await request.get('/cv.pdf')).body())), '/cv.pdf').toContain(squashSpace(PHONE))

      // ── The Studio shows it next to the field ─────────────────────────
      await page.goto('/admin/dashboard?tab=cv')
      await page.getByRole('navigation', { name: 'CV sections' }).getByText('Personal Info').first().click()
      const chip = page.getByRole('button', { name: /^Where Phone shows: Files · Links/ })
      await expect(chip).toBeVisible()
      await chip.click()
      await expect(page.getByRole('menuitemcheckbox', { name: /Public pages/ })).toHaveAttribute('aria-checked', 'false')
      await expect(page.getByRole('menuitemcheckbox', { name: /Private links/ })).toHaveAttribute('aria-checked', 'true')
      await page.keyboard.press('Escape')

      // ── A variant with one chosen role ────────────────────────────────
      await page.goto('/admin/dashboard?tab=cv&view=variants')
      await page.getByRole('button', { name: 'New variant' }).click()
      const name = page.getByLabel('Variant name')
      await name.fill('E2E Machine learning')
      await page.getByRole('button', { name: '1 page' }).click()
      const work = page.getByRole('listitem').filter({ hasText: 'WORK EXPERIENCE' }).first()
      await work.getByRole('button', { name: /Entries/ }).click()
      await work.getByRole('radio', { name: 'Choose…' }).click()
      // By keyboard: Space on the entry's checkbox.
      const beta = work.getByRole('checkbox', { name: new RegExp(ROLE_B) })
      await beta.focus()
      await page.keyboard.press('Space')
      await expect(beta).not.toBeChecked()
      const saved = page.waitForResponse((r) => r.url().endsWith('/api/admin/cv-variants') && r.request().method() === 'PUT')
      await page.getByRole('button', { name: 'Save variants' }).click()
      expect((await saved).status()).toBe(200)
      await expect(page.getByText(/PDF/).first()).toBeVisible()
      await settle(page)
      expect(await seriousA11yViolations(page), 'Variants & links: axe serious/critical').toEqual([])

      // ── A private link ────────────────────────────────────────────────
      await page.getByPlaceholder(/Who it is for/).fill('E2E note for Example Corp')
      await page.getByRole('button', { name: 'Make link' }).click()
      const field = page.getByLabel('Private link', { exact: true })
      await expect(field).toHaveValue(/\/cv\/r\/[A-Za-z0-9_-]{43}$/)
      linkUrl = await field.inputValue()

      // ── Opened as a visitor (no cookie) ───────────────────────────────
      const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      const v = await visitor.newPage()
      const res = await v.goto(linkUrl)
      expect(res?.status()).toBe(200)
      const h = res!.headers()
      expect(h['cache-control']).toMatch(/private/)
      expect(h['cache-control']).toMatch(/no-store/)
      expect(h['x-robots-tag']).toMatch(/noindex/)
      expect(h['referrer-policy']).toBe('no-referrer')
      await expect(v.getByText('Shared privately').first()).toBeVisible()
      const html = await v.content()
      expect(html).toContain(PHONE)
      expect(html).toContain(ROLE_A)
      expect(html, 'a role the variant leaves out').not.toContain(ROLE_B)
      expect(html, 'the variant’s name is the owner’s').not.toContain('E2E Machine learning')
      expect(html, 'the note is the owner’s').not.toContain('E2E note')
      await expect(v.locator('link[rel="canonical"]')).toHaveCount(0)
      await expect(v.locator('script[type="application/ld+json"]')).toHaveCount(0)
      await settle(v)
      expect(await seriousA11yViolations(v), 'the shared CV: axe serious/critical').toEqual([])
      const pdfHref = await v.getByRole('link', { name: 'Download PDF' }).first().getAttribute('href')
      const pdf = await v.request.get(new URL(pdfHref!, linkUrl).toString())
      expect(pdf.status()).toBe(200)
      expect(pdf.headers()['content-type']).toBe('application/pdf')
      const pdfBody = squashSpace(pdfText(await pdf.body()))
      expect(pdfBody).toContain(squashSpace(PHONE))
      expect(pdfBody).toContain(squashSpace(ROLE_A))
      expect(pdfBody).not.toContain(squashSpace(ROLE_B))
      // An automated browser (a mail scanner, a link preview) is never counted…
      await v.waitForTimeout(4000)
      await visitor.close()
      const opens = async () => {
        const links = JSON.parse((await adminFetch(page, 'GET', '/api/admin/cv-share-links')).text).links as Array<{ openCount: number; note: string; lastOpenedDay: string | null }>
        return links.find((l) => l.note === 'E2E note for Example Corp')
      }
      expect((await opens())?.openCount).toBe(0)

      // …a person's browser is, once the page has been seen for a moment: +1 and the day, nothing else.
      const person = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      })
      await person.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }))
      const p = await person.newPage()
      await p.goto(linkUrl)
      await expect(p.getByText('Shared privately').first()).toBeVisible()
      await expect.poll(async () => (await opens())?.openCount, { timeout: 15_000 }).toBe(1)
      expect((await opens())?.lastOpenedDay).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      await person.close()

      // ── Revoked: gone at once ─────────────────────────────────────────
      await page.reload()
      await page.getByRole('navigation', { name: 'CV variants' }).getByRole('button', { name: /E2E Machine learning/ }).click()
      await expect(page.getByText(/Opened once · last \d{4}-\d{2}-\d{2}/)).toBeVisible()
      await page.getByRole('button', { name: /^Revoke E2E note/ }).click()
      await page.getByRole('group', { name: 'Confirm revoking' }).getByRole('button', { name: 'Revoke' }).click()
      await expect(page.getByText('Revoked').first()).toBeVisible()
      const gone = await request.get(new URL(linkUrl).pathname)
      expect(gone.status()).toBe(404)
      expect(await gone.text()).not.toContain(ROLE_A)
    } finally {
      // Restore the variants (revoking what this test made) and the CV.
      const now = await adminFetch(page, 'GET', '/api/admin/cv-variants')
      await adminFetch(page, 'PUT', '/api/admin/cv-variants', { variants: originalVariants }).then(async (r) => {
        if (r.status === 409) return
        expect(r.status, r.text).toBe(200)
      })
      void now
      const back = await adminFetch(page, 'PUT', '/api/cvdata', original)
      expect(back.status, back.text).toBe(200)
      if (linkUrl) expect((await request.get(new URL(linkUrl).pathname)).status()).toBe(404)
    }
  })
})
