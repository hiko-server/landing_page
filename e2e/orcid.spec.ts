import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, seriousA11yViolations, settle } from './fixtures'
import { pdfText, squashSpace } from './pdfText'

/**
 * ORCID (stream "orcid"): nothing ORCID is public until the owner enters an
 * iD in CV Studio. The admin test enters one (ORCID's documented example
 * record, never the owner's), sees it on /cv, /cv/zh, the /about rail, the
 * JSON Resume, the plain-text CV, the vCard, the Person JSON-LD and
 * /llms.txt, hides it again (gone everywhere), and checks the Publications
 * import's states that need no network: no iD, and an ended session. The
 * import's mapping and every ORCID answer are unit-tested (tests/orcid-*).
 * The stored CV is restored afterwards.
 */

const ID = '0000-0002-1825-0097'
const URI = `https://orcid.org/${ID}`
const LINK_NAME = `ORCID iD: ${URI} (opens in a new tab)`

type CvDoc = { en: any[]; zh: any[] }

async function hasOrcid(request: APIRequestContext): Promise<boolean> {
  const res = await request.get('/cv.json')
  if (res.status() !== 200) return false
  return /orcid\.org/i.test(await res.text())
}

// The admin test sets (then removes) an iD: run this file's tests in order in one worker.
test.describe.configure({ mode: 'default' })

test.describe('ORCID without an iD', () => {
  test('no ORCID link, profile or line anywhere public; the colophon carries the trademark note', async ({ page, request }) => {
    test.skip(await hasOrcid(request), 'the store has an ORCID iD')
    for (const path of ['/cv', '/cv/zh', '/about']) {
      const res = await page.goto(path)
      if (res?.status() !== 200) continue
      await expect(page.locator('a[href^="https://orcid.org/"]'), `${path} links an ORCID record`).toHaveCount(0)
      await expect(page.locator('svg.orcid-id-icon'), `${path} shows the iD icon`).toHaveCount(0)
    }
    expect(await (await request.get('/llms.txt')).text()).not.toMatch(/orcid/i)
    const vcard = await request.get('/api/vcard')
    if (vcard.status() === 200) expect(await vcard.text()).not.toMatch(/orcid/i)

    await page.goto('/colophon')
    const note = page.getByRole('link', { name: 'trademark note' })
    await expect(note).toHaveAttribute('href', '/licenses/orcid.txt')
    const licence = await request.get('/licenses/orcid.txt')
    expect(licence.status()).toBe(200)
    expect(await licence.text()).toContain('trademarks of ORCID, Inc.')
  })
})

test.describe('ORCID iD in CV Studio', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 })

  test('set in Studio (a pasted link is stored bare) → shown on /cv, /cv/zh, /about and in every file; the import says what it needs; hidden → gone everywhere', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await loginAsAdmin(page)

    // Through the page's own fetch: the session cookie is Secure (see admin.spec).
    const adminFetch = (p: Page, method: string, url: string, body?: unknown) =>
      p.evaluate(
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
    const stored = await adminFetch(page, 'GET', '/api/admin/cvdata')
    expect(stored.status, stored.text).toBe(200)
    const original = JSON.parse(stored.text) as CvDoc
    const writeCv = async (doc: CvDoc) => {
      const r = await adminFetch(page, 'PUT', '/api/cvdata', doc)
      expect(r.status, r.text).toBe(200)
    }
    const save = async () => {
      const response = page.waitForResponse((r) => /^\/api\/(admin\/)?cvdata$/.test(new URL(r.url()).pathname) && r.request().method() === 'PUT')
      await page.keyboard.press('ControlOrMeta+KeyS')
      const r = await response
      expect(r.status()).toBe(200)
      const body = (await r.json()) as { revalidateFailed?: string[] }
      expect(body.revalidateFailed ?? [], 'every CV page regenerated').toEqual([])
    }

    // A deterministic start: Personal Info in both languages without an iD
    // (shown), and a Publications section (empty: nothing public) for the import row.
    const startLang = (lang: 'en' | 'zh') => {
      const list = original[lang].map((s) => {
        if (s?.sessionName !== 'personalInformation') return s
        const { orcid: _drop, ...rest } = s
        void _drop
        const hiddenFields = Array.isArray(s.hiddenFields) ? s.hiddenFields.filter((f: string) => f !== 'orcid') : undefined
        return { ...rest, ...(hiddenFields ? { hiddenFields } : {}) }
      })
      if (!list.some((s) => s?.sessionName === 'personalInformation')) {
        list.unshift({ sessionName: 'personalInformation', firstName: 'Example', lastName: 'Person', introduction: 'A synthetic summary written by the end-to-end suite.' })
      }
      if (!list.some((s) => s?.sessionName === 'publications')) list.push({ sessionName: 'publications', headerName: lang === 'zh' ? '论文' : 'Publications', papers: [] })
      return list
    }
    await writeCv({ en: startLang('en'), zh: startLang('zh') })

    try {
      await page.goto('/admin/dashboard?tab=cv')
      const sections = page.getByRole('navigation', { name: 'CV sections' })
      await expect(sections).toBeVisible()

      // ── No iD: the import row says where it goes ─────────────────────
      await page.getByRole('button', { name: /^Publications\b/ }).first().click()
      const row = page.getByTestId('orcid-import')
      await expect(row).toContainText('Add your ORCID iD in Personal Info')
      await expect(row.getByRole('button', { name: 'Import from ORCID…' })).toBeDisabled()
      await row.getByRole('button', { name: 'Add ORCID iD' }).click()

      // The jump opens Personal Info with the iD's input focused.
      const input = page.getByRole('textbox', { name: 'ORCID iD', exact: true })
      await expect(input).toBeFocused()
      // A typo in the last character is caught by the checksum, with its own message.
      await input.fill('0000-0002-1825-0098')
      await expect(page.getByText(/This ORCID iD has a typo/)).toBeVisible()
      // A pasted record link is stored as the bare iD.
      await input.fill(URI)
      await expect(input).toHaveValue(ID)
      await expect(page.getByText(/This ORCID iD has a typo/)).toHaveCount(0)
      await save()

      const after = JSON.parse((await adminFetch(page, 'GET', '/api/admin/cvdata')).text) as CvDoc
      for (const lang of ['en', 'zh'] as const) {
        expect(after[lang].find((s) => s?.sessionName === 'personalInformation')?.orcid, `${lang}: stored bare (shared field)`).toBe(ID)
      }

      // ── With an iD: the import is offered ───────────────────────────
      await page.getByRole('button', { name: /^Publications\b/ }).first().click()
      await expect(row).toContainText(URI)
      const importButton = row.getByRole('button', { name: 'Import from ORCID…' })
      await expect(importButton).toBeEnabled()

      // ── Public surfaces ─────────────────────────────────────────────
      for (const path of ['/cv', '/cv/zh']) {
        await page.goto(path)
        const link = page.getByRole('link', { name: LINK_NAME }).first()
        await expect(link, path).toBeVisible()
        await expect(link).toHaveAttribute('href', URI)
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toContainText(URI)
        await expect(link.locator('svg.orcid-id-icon')).toHaveCount(1)
        await settle(page)
        expect(await seriousA11yViolations(page), `${path}: axe serious/critical`).toEqual([])
        const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join('\n')
        expect(ld, `${path}: Person sameAs`).toContain(`"${URI}"`)
        expect(ld, `${path}: identifier`).toContain(`"propertyID":"ORCID"`)
      }

      await page.goto('/about')
      const rail = page.getByRole('link', { name: LINK_NAME })
      await expect(rail).toBeVisible()
      await expect(rail).toHaveAttribute('href', URI)

      const resume = (await (await request.get('/cv.json')).json()) as { basics?: { profiles?: Array<Record<string, string>> } }
      expect(resume.basics?.profiles).toContainEqual({ network: 'ORCID', username: ID, url: URI })
      expect(await (await request.get('/cv.txt')).text()).toContain(`ORCID: ${URI}`)
      expect(await (await request.get('/cv/zh.txt')).text()).toContain(`ORCID：${URI}`)
      const vcard = await (await request.get('/api/vcard')).text()
      expect(vcard).toContain(`URL;TYPE=orcid:${URI}`)
      expect(vcard).toContain(`X-ORCID:${ID}`)
      expect(await (await request.get('/llms.txt')).text()).toContain(`- ORCID iD: ${URI}`)
      for (const path of ['/cv.pdf', '/cv/zh.pdf']) {
        const res = await request.get(path)
        expect(res.status(), path).toBe(200)
        const body = await res.body()
        expect(squashSpace(pdfText(body)), `${path}: the URI as text`).toContain(URI)
        expect(body.toString('latin1'), `${path}: a link to the record`).toContain(`/URI (${URI})`)
      }

      // ── The import's error state, without the network: the session ends ──
      // In a second tab: its 401 is the point here, not a console error of the page under test.
      const studio = await page.context().newPage()
      try {
        await studio.goto('/admin/dashboard?tab=cv')
        await studio.getByRole('button', { name: /^Publications\b/ }).first().click()
        const open = studio.getByTestId('orcid-import').getByRole('button', { name: 'Import from ORCID…' })
        await expect(open).toBeEnabled()
        await studio.context().clearCookies()
        await open.click()
        const dialog = studio.getByRole('dialog', { name: /Import from ORCID/ })
        await expect(dialog).toBeVisible()
        await expect(dialog.getByRole('link', { name: LINK_NAME }), 'the dialog names the record it reads').toHaveAttribute('href', URI)
        await expect(dialog.getByRole('alert')).toContainText('Your session has ended')
        await expect(dialog.getByRole('link', { name: 'Sign in again' })).toBeVisible()
        await expect(dialog.getByRole('button', { name: 'Add 0 papers' })).toBeDisabled()
        await dialog.getByRole('button', { name: 'Cancel' }).click()
        await expect(dialog).toBeHidden()
        await expect(open, 'focus returns to the button').toBeFocused()
      } finally {
        await studio.close()
      }
      await loginAsAdmin(page)

      // ── Hidden: gone from every surface ────────────────────────────
      await page.goto('/admin/dashboard?tab=cv')
      await sections.getByText('Personal Info', { exact: true }).first().click()
      await page.getByRole('button', { name: 'Hide ORCID iD from CV and website' }).click()
      await save()
      for (const path of ['/cv', '/cv/zh', '/about']) {
        await page.goto(path)
        expect(await page.content(), `${path} still shows the hidden iD`).not.toContain(ID)
      }
      for (const path of ['/cv.json', '/cv/zh.json', '/cv.txt', '/api/vcard', '/llms.txt', '/api/cvdata']) {
        expect(await (await request.get(path)).text(), `${path} still carries the hidden iD`).not.toContain(ID)
      }
      for (const path of ['/cv.pdf', '/cv/zh.pdf']) {
        const body = await (await request.get(path)).body()
        expect(pdfText(body), `${path} still prints the hidden iD`).not.toContain(ID)
        expect(body.toString('latin1')).not.toContain(ID)
      }
    } finally {
      await loginAsAdmin(page)
      await writeCv(original)
    }
  })
})
