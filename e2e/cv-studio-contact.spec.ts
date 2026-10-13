import AxeBuilder from '@axe-core/playwright'
import { test, expect, settle, seriousA11yViolations, ADMIN, loginAsAdmin } from './fixtures'
import type { Page } from '@playwright/test'

/** Serious / critical WCAG 2.x A–AA violations inside one region of the page. */
async function seriousViolationsIn(page: Page, selector: string) {
  const result = await new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }))
}

/**
 * Stream "cv-studio-contact": the structured contact form (E12), its privacy
 * notice and message retention (I11), /contact as ISR (G1), the
 * right-to-work line and the Chinese job intent from the availability
 * (CRIT-work-status, E10), the CV Studio's new fields and sections (E10,
 * E11) and the recruiter-readiness panel (E9).
 *
 * Public checks run anywhere (production included); @admin ones sign in and
 * change the home document — they restore it — or the Studio without saving.
 */

const form = (page: Page) => page.locator('form').filter({ has: page.getByRole('button', { name: /send message/i }) })

test.describe('contact form: structure and privacy', () => {
  test('/contact is statically generated and states what is kept and for how long', async ({ page }) => {
    const res = await page.goto('/contact')
    expect(res?.status()).toBe(200)
    // ISR: a cacheable response (s-maxage), never per-request no-store.
    expect(res?.headers()['cache-control'] || '').toMatch(/s-maxage=\d+/)
    const notice = page.locator('#contact-privacy')
    await expect(notice).toContainText('private inbox')
    await expect(notice).toContainText(/deleted automatically after (\d+ (days|months|years)|12 months)|delete them myself/)
    await expect(notice.getByRole('link', { name: 'How this site handles data' })).toHaveAttribute('href', '/colophon#privacy')
  })

  test('picking a reason reveals its optional fields; a non-https link is refused before sending', async ({ page }) => {
    await page.goto('/contact')
    const f = form(page)
    // The form starts short: no structured fields before a reason is chosen.
    await expect(f.locator('fieldset[data-inquiry]')).toHaveCount(0)

    const reason = f.getByRole('combobox', { name: /^reason/i })
    await reason.selectOption('Hiring')
    const role = f.locator('fieldset[data-inquiry="role"]')
    await expect(role).toBeVisible()
    await expect(role.getByRole('textbox', { name: 'Company' })).toBeVisible()
    await expect(role.getByRole('textbox', { name: 'Job posting link' })).toBeVisible()
    await expect(role.getByRole('combobox', { name: 'Ideal start' })).toBeVisible()
    // Announced politely for screen readers.
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Added optional fields' })).toHaveCount(1)

    const link = role.getByRole('textbox', { name: 'Job posting link' })
    await link.fill('http://jobs.example.com/123')
    await link.blur()
    await expect(role.getByText('The link must be a full https:// address.')).toBeVisible()
    await expect(f.getByRole('button', { name: /send message/i })).toBeDisabled()
    await link.fill('https://jobs.example.com/123')
    await expect(role.getByText('The link must be a full https:// address.')).toHaveCount(0)

    await settle(page)
    expect(await seriousA11yViolations(page)).toEqual([])

    await reason.selectOption('Mentorship')
    await expect(f.locator('fieldset[data-inquiry]')).toHaveCount(0)
    await reason.selectOption('Collaboration')
    const collab = f.locator('fieldset[data-inquiry="collab"]')
    await expect(collab.getByRole('textbox', { name: 'Organisation or project' })).toBeVisible()
    await expect(collab.getByRole('combobox')).toHaveCount(0)
  })

  test('the disclosed fields fit a phone without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/contact')
    await form(page).getByRole('combobox', { name: /^reason/i }).selectOption('Hiring')
    await expect(form(page).locator('fieldset[data-inquiry="role"]')).toBeVisible()
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
    expect(widths.scroll).toBeLessThanOrEqual(widths.inner)
  })

  test('/colophon explains the contact inbox and its retention', async ({ page }) => {
    await page.goto('/colophon')
    const privacy = page.locator('#privacy')
    await expect(privacy).toContainText('private inbox')
    await expect(privacy).toContainText('deleted automatically')
    await expect(privacy.getByRole('link', { name: 'contact form' })).toHaveAttribute('href', '/contact')
  })
})

// ── Admin ──────────────────────────────────────────────────────────────────

/** The full home document and its version, fetched by the signed-in page (same-origin, its session cookie). */
async function homeVersion(page: Page): Promise<{ doc: Record<string, any>; etag: string }> {
  const r = await page.evaluate(async () => {
    const res = await fetch('/api/admin/home', { cache: 'no-store', credentials: 'same-origin' })
    return { status: res.status, etag: res.headers.get('ETag') || '"0"', doc: await res.json() }
  })
  expect(r.status).toBe(200)
  return { doc: r.doc, etag: r.etag }
}

async function putHome(page: Page, doc: Record<string, any>, etag: string): Promise<string> {
  const r = await page.evaluate(
    async ({ doc, etag }) => {
      const res = await fetch('/api/home', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify(doc),
      })
      return { status: res.status, body: await res.json().catch(() => ({})) }
    },
    { doc, etag },
  )
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.etag as string
}

test.describe('availability lines on the contact card and the CV header', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  test.describe.configure({ mode: 'serial' })

  test('work authorisation (EN / 中文) and the Chinese job intent render only where they belong', async ({ page }) => {
    await loginAsAdmin(page)
    const request = page.request
    const original = await homeVersion(page)
    const marker = `E2E-${Date.now()}`
    const next = {
      ...original.doc,
      availability: {
        status: 'open',
        label: 'Open to new roles',
        from: '2027-01',
        roles: ['Frontend engineer'],
        roles_zh: [`前端工程师${marker}`],
        city_zh: '香港',
        workStatus: `Work status line ${marker}`,
        workStatus_zh: `工作身份行 ${marker}`,
      },
    }
    const etag = await putHome(page, next, original.etag)
    try {
      // /contact (ISR, regenerated by the save): the English line on the card.
      await page.goto('/contact')
      const card = page.locator('#availability')
      await expect(card.locator('[data-work-status]')).toContainText(`Work status line ${marker}`)
      await expect(card).not.toContainText('工作身份行')
      // Next to the hiring fields of the form too.
      await form(page).getByRole('combobox', { name: /^reason/i }).selectOption('Hiring')
      await expect(form(page).locator('[data-work-status]')).toContainText(`Work status line ${marker}`)

      // /cv: the English line in the A4 header; no job intent on the English CV.
      await page.goto('/cv')
      const sheet = page.locator('#A4Paper')
      await expect(sheet.locator('[data-cv-extra="workStatus"]')).toContainText(`Work authorisation: Work status line ${marker}`)
      await expect(sheet.locator('[data-cv-extra="jobIntent"]')).toHaveCount(0)

      // /cv/zh: 求职意向 with roles, city and start, plus the Chinese right-to-work line.
      await page.goto('/cv/zh')
      const zh = page.locator('#A4Paper')
      await expect(zh.locator('[data-cv-extra="jobIntent"]')).toContainText(`求职意向：前端工程师${marker}`)
      await expect(zh.locator('[data-cv-extra="jobIntent"]')).toContainText('意向城市：香港')
      await expect(zh.locator('[data-cv-extra="jobIntent"]')).toContainText('到岗时间：2027.01')
      await expect(zh.locator('[data-cv-extra="workStatus"]')).toContainText(`工作身份：工作身份行 ${marker}`)

      // Never in the structured data or the vCard.
      const ldJson = await page.locator('script[type="application/ld+json"]').allTextContents()
      expect(ldJson.join('\n')).not.toContain(marker)
      const vcard = await (await request.get('/api/vcard')).text()
      expect(vcard).not.toContain(marker)

      // A closed status keeps the right-to-work line but drops the job intent.
      await putHome(page, { ...next, availability: { ...next.availability, status: 'closed' } }, etag)
      await page.goto('/cv/zh')
      await expect(page.locator('#A4Paper [data-cv-extra="jobIntent"]')).toHaveCount(0)
      await expect(page.locator('#A4Paper [data-cv-extra="workStatus"]')).toHaveCount(1)
    } finally {
      const current = await homeVersion(page)
      await putHome(page, original.doc, current.etag)
    }
  })
})

test.describe('structured inquiry reaches the Inbox', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('a hiring message keeps its company, link and timeline', async ({ page }) => {
    const subject = `E2E structured inquiry ${Date.now()}`
    await page.goto('/contact')
    const f = form(page)
    await f.getByRole('textbox', { name: /^name\b/i }).fill('E2E Recruiter')
    await f.getByRole('textbox', { name: /^email\b/i }).fill('e2e-recruiter@example.com')
    await f.getByRole('combobox', { name: /^reason/i }).selectOption('Hiring')
    await f.getByRole('textbox', { name: /^subject\b/i }).fill(subject)
    const role = f.locator('fieldset[data-inquiry="role"]')
    await role.getByRole('textbox', { name: 'Company' }).fill('E2E Example Ltd')
    await role.getByRole('textbox', { name: 'Job posting link' }).fill('https://jobs.example.com/e2e-role')
    await role.getByRole('combobox', { name: 'Ideal start' }).selectOption('1-3m')
    await f.getByRole('textbox', { name: /^message\b/i }).fill('Automated end-to-end check of the structured contact form. Please ignore.')
    const question = f.getByText(/What is \d+ \+ \d+\?/)
    await expect(question).toBeVisible()
    const [, a, b] = ((await question.textContent()) || '').match(/(\d+)\s*\+\s*(\d+)/) || []
    await f.getByRole('textbox', { name: /human check/i }).fill(String(Number(a) + Number(b)))
    await page.waitForTimeout(2500)
    const sent = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/contact' && r.request().method() === 'POST')
    await f.getByRole('button', { name: /send message/i }).click()
    const response = await sent
    expect(response.status()).toBe(200)
    const body = response.request().postDataJSON()
    expect(body).toMatchObject({ reason: 'Hiring', intent: 'role', company: 'E2E Example Ltd', roleUrl: 'https://jobs.example.com/e2e-role', timeline: '1-3m' })
    await expect(page.getByRole('heading', { name: 'Message sent' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'While you wait' }).getByRole('link', { name: 'Read my CV' })).toHaveAttribute('href', '/cv')

    await loginAsAdmin(page)
    await page.goto('/admin/dashboard?tab=inbox')
    await page.getByText(subject).first().click()
    const details = page.getByRole('region', { name: 'Inquiry details' })
    await expect(details).toContainText('Role / hiring')
    await expect(details).toContainText('E2E Example Ltd')
    await expect(details).toContainText('In 1–3 months')
    const link = details.getByRole('link', { name: /jobs\.example\.com\/e2e-role/ })
    await expect(link).toHaveAttribute('rel', /nofollow/)
    await expect(page.locator('[data-retention]')).toContainText(/deleted automatically after|Automatic deletion is off/)
  })
})

test.describe('CV Studio: readiness, photo and recommendations', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('the readiness panel lists findings, jumps to a field and dismisses one (unsaved)', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard?tab=cv&panel=readiness')
    const drawer = page.getByRole('dialog', { name: /recruiter readiness/i })
    await expect(drawer).toBeVisible()
    const rows = drawer.locator('li[data-finding]')
    const button = page.locator('[data-readiness-count]')
    const empty = drawer.getByText('Nothing to flag')
    if ((await rows.count()) === 0) {
      // An empty store (CI) has nothing to check: the empty state says so.
      await expect(empty).toBeVisible()
      return
    }
    const before = Number(await button.getAttribute('data-readiness-count'))
    expect(before).toBeGreaterThan(0)
    await settle(page)
    // The drawer itself (the dashboard behind it is another stream's surface).
    expect(await seriousViolationsIn(page, '.chakra-modal__content')).toEqual([])

    // Dismiss the first finding: the count drops and the CV becomes unsaved.
    await rows.first().getByRole('button', { name: /^Dismiss:/ }).click()
    await expect(button).toHaveAttribute('data-readiness-count', String(before - 1))
    await expect(drawer.getByRole('button', { name: /show dismissed \(1\)/i })).toBeVisible()

    // Jump: the drawer closes and focus lands inside the editor.
    const jumpable = rows.filter({ has: page.getByRole('button', { name: /^Go to the field:/ }) }).first()
    if (await jumpable.count()) {
      await jumpable.getByRole('button', { name: /^Go to the field:/ }).click()
      await expect(drawer).toBeHidden()
      await expect(page.locator('[data-flash]')).toHaveCount(1)
    }
  })

  test('Personal Info offers the PDF-only photo (off by default); a recommendation shows only with permission', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard?tab=cv')
    const studio = page.getByRole('navigation', { name: 'CV sections' })
    await expect(studio).toBeVisible()

    // Photo field: upload control and its per-language switch, off.
    await studio.getByText('Personal Info', { exact: true }).first().click()
    await expect(page.getByRole('button', { name: /upload photo/i })).toBeVisible()
    const photoSwitch = page.getByRole('group', { name: /Put the photo on this language’s PDF/ }).getByRole('checkbox')
    await expect(photoSwitch).not.toBeChecked()

    // Add a Recommendations section (not saved), from the keyboard.
    const add = page.getByRole('button', { name: /add section/i })
    if (await add.count()) {
      await add.first().click()
      const option = page.getByRole('menuitem', { name: /Recommendations/ })
      if (await option.count()) {
        await option.focus()
        await page.keyboard.press('Enter')
        await page.getByRole('button', { name: /add recommendation/i }).click()
        const quote = `E2E quote ${Date.now()}`
        await page.getByLabel('Quote').last().fill(quote)
        await page.getByLabel('Name').last().fill('E2E Person')
        const preview = page.locator('#A4Paper')
        // Without permission the A4 preview leaves it out.
        await expect(preview).not.toContainText(quote)
        await page.getByRole('group', { name: /They agreed to have this published/ }).getByRole('checkbox').check({ force: true })
        await expect(preview).toContainText(quote)
      }
    }
  })
})
