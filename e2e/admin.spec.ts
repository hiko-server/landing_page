import { test, expect, ADMIN, loginAsAdmin } from './fixtures'

/**
 * Owner flows against the CI container (tag @admin — excluded from the
 * post-deploy production run). ADMIN_EMAIL / ADMIN_PASS come from the job env,
 * the same values the container was started with.
 */
test.describe('admin', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('a logged-out visit to the dashboard redirects to the login with ?next=', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await page.goto('/admin/dashboard')
      await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fdashboard$/)
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('the dashboard tabs all render', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard')
    for (const name of ['Home', 'CV', 'Versions', 'Storage', 'Inbox', 'Analytics']) {
      const tab = page.getByRole('tab', { name: new RegExp(`^${name}\\b`) })
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tabpanel').filter({ visible: true }).first()).toBeVisible()
      await expect(page.getByText('[ERR]'), `${name} tab fell back to its error panel`).toHaveCount(0)
    }
  })

  test("'?' opens the keyboard shortcuts overlay", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin')
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('?')
    const overlay = page.getByRole('dialog', { name: /keyboard shortcuts/i })
    await expect(overlay).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(overlay).toBeHidden()
  })

  test('CV Studio: a hidden field disappears from the public API and /cv, and comes back', async ({ page, request }) => {
    await loginAsAdmin(page)
    const openStudio = async () => {
      await page.goto('/admin/dashboard?tab=cv')
      // The label gains a "hidden" chip while the field is hidden.
      const phone = page.getByLabel(/^phone\b/i).first()
      await expect(phone).toBeVisible()
      return phone
    }
    const eye = () => page.getByRole('button', { name: 'Hide Phone from CV and website' }).first()
    const save = async () => {
      const response = page.waitForResponse(
        (r) => /^\/api\/(admin\/)?cvdata$/.test(new URL(r.url()).pathname) && r.request().method() === 'PUT',
      )
      await page.keyboard.press('ControlOrMeta+KeyS')
      expect((await response).status()).toBe(200)
    }
    const publicCv = async () => (await (await request.get('/api/cvdata')).text()) as string

    const phoneValue = (await (await openStudio()).inputValue()).trim()
    test.skip(!phoneValue, 'the seeded CV has no phone number to hide')

    // A retry may start from a hidden phone: show it first.
    if ((await eye().getAttribute('aria-pressed')) === 'true') {
      await eye().click()
      await save()
    }

    await eye().click()
    await expect(eye()).toHaveAttribute('aria-pressed', 'true')
    await save()
    expect(await publicCv()).not.toContain(phoneValue)
    await page.goto('/cv')
    await expect(page.locator('main')).not.toContainText(phoneValue)

    await openStudio()
    await expect(eye()).toHaveAttribute('aria-pressed', 'true')
    await eye().click()
    await expect(eye()).toHaveAttribute('aria-pressed', 'false')
    await save()
    expect(await publicCv()).toContain(phoneValue)
    await page.goto('/cv')
    await expect(page.locator('main')).toContainText(phoneValue)
  })

  test("two editors saving the same post: the second sees 'Changed elsewhere'", async ({ page, browser }) => {
    await loginAsAdmin(page)
    const slug = `e2e-conflict-${Date.now()}`
    // Through the page's own fetch: the session cookie is Secure, which the
    // browser sends to http://127.0.0.1 (a secure context) but Playwright's
    // request client does not.
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
    const created = await adminFetch('PUT', '/api/admin/posts', {
      slug,
      create: true,
      frontmatter: {
        title: 'E2E conflict check',
        date: new Date().toISOString().slice(0, 10),
        description: 'Created by the end-to-end suite to exercise concurrent edits; deleted afterwards.',
        draft: true,
      },
      body: 'First version.\n',
    })
    expect(created.status, created.text).toBe(200)

    const second = await browser.newContext({ storageState: await page.context().storageState() })
    try {
      const pageB = await second.newPage()
      const url = `/admin/blog/edit?slug=${slug}`
      await Promise.all([page.goto(url), pageB.goto(url)])
      const titleA = page.getByLabel(/^title\b/i)
      const titleB = pageB.getByLabel(/^title\b/i)
      await expect(titleA).toHaveValue('E2E conflict check')
      await expect(titleB).toHaveValue('E2E conflict check')

      await titleA.fill('E2E conflict check (A)')
      const savedA = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/posts' && r.request().method() === 'PUT')
      await page.keyboard.press('ControlOrMeta+KeyS')
      expect((await savedA).status()).toBe(200)

      await titleB.fill('E2E conflict check (B)')
      await pageB.keyboard.press('ControlOrMeta+KeyS')
      const dialog = pageB.getByRole('alertdialog').or(pageB.getByRole('dialog')).filter({ hasText: /changed elsewhere/i })
      await expect(dialog).toBeVisible()
    } finally {
      await second.close()
      await adminFetch('DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })

  test('saving a post from the editor keeps the frontmatter fields the form does not show', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-frontmatter-${Date.now()}`
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
    const created = await adminFetch('PUT', '/api/admin/posts', {
      slug,
      create: true,
      frontmatter: {
        title: 'E2E frontmatter check',
        seoTitle: 'E2E frontmatter check — search title',
        date: new Date().toISOString().slice(0, 10),
        updated: '2026-01-02',
        lang: 'en',
        coverAlt: 'Alt text the post form does not edit',
        description: 'Created by the end-to-end suite to check that a save keeps unmodelled fields; deleted afterwards.',
        draft: true,
      },
      body: 'First version.\n',
    })
    expect(created.status, created.text).toBe(200)
    try {
      await page.goto(`/admin/blog/edit?slug=${slug}`)
      const title = page.getByLabel(/^title\b/i)
      await expect(title).toHaveValue('E2E frontmatter check')
      await title.fill('E2E frontmatter check (edited)')
      const saved = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/posts' && r.request().method() === 'PUT')
      await page.keyboard.press('ControlOrMeta+KeyS')
      expect((await saved).status()).toBe(200)

      const stored = await adminFetch('GET', `/api/admin/posts?slug=${slug}`)
      expect(stored.status, stored.text).toBe(200)
      const fm = (JSON.parse(stored.text) as { frontmatter: Record<string, unknown> }).frontmatter
      expect(fm.title).toBe('E2E frontmatter check (edited)')
      expect(fm).toMatchObject({
        seoTitle: 'E2E frontmatter check — search title',
        updated: '2026-01-02',
        lang: 'en',
        coverAlt: 'Alt text the post form does not edit',
      })
    } finally {
      await adminFetch('DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })
})
