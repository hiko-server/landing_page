import { devices } from '@playwright/test'
import { test, expect, settle, seriousA11yViolations, undersizedTargets, ADMIN, loginAsAdmin } from './fixtures'

/**
 * cv-docs stream: downloadable CVs (PDF / plain text / JSON Resume), the
 * "Updated" marker, evidence links, skill evidence, the richer Person
 * entity, ISR of /cv and /cv/zh — and, as the owner (@admin), that hiding a
 * field removes it from every file and from the regenerated pages.
 *
 * The CI container starts with an EMPTY content store: checks that need a
 * published CV skip themselves there and run against real content.
 */

type Page = import('@playwright/test').Page

async function hasCv(page: Page, path = '/cv'): Promise<boolean> {
  await page.goto(path)
  return (await page.locator('#A4Paper').count()) > 0
}

function jsonLd(html: string): Array<Record<string, any>> {
  const out: Array<Record<string, any>> = []
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    const data = JSON.parse(m[1])
    out.push(...(Array.isArray(data) ? data : [data]))
  }
  return out
}

test.describe('downloads', () => {
  test('"Download PDF" is a real file download with a dated name; the PDF is a tagged PDF 1.7', async ({ page }) => {
    test.skip(!(await hasCv(page)), 'no published CV')
    const link = page.getByRole('group', { name: 'Downloads' }).getByRole('link', { name: 'Download PDF' })
    await expect(link).toHaveAttribute('href', '/cv.pdf')
    await expect(link).toHaveAttribute('download', /^[A-Za-z0-9-]*CV-\d{4}-\d{2}\.pdf$/)
    const [download] = await Promise.all([page.waitForEvent('download'), link.click()])
    expect(download.suggestedFilename()).toMatch(/CV-\d{4}-\d{2}\.pdf$/)
    const res = await page.request.get('/cv.pdf')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('application/pdf')
    const body = (await res.body()).toString('latin1')
    expect(body.startsWith('%PDF-1.7')).toBe(true)
    for (const marker of ['/StructTreeRoot', '/Marked true', '/Lang (en)', '/DisplayDocTitle true', '/FontFile2']) expect(body).toContain(marker)
  })

  test('"More formats": keyboard disclosure with plain text, JSON Resume and print; Escape returns focus', async ({ page }) => {
    test.skip(!(await hasCv(page)), 'no published CV')
    const toggle = page.getByRole('group', { name: 'Downloads' }).getByRole('button', { name: 'More formats' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const list = page.locator(`#${await toggle.getAttribute('aria-controls')}`)
    await expect(list.getByRole('link', { name: /Plain text/ })).toHaveAttribute('href', '/cv.txt')
    await expect(list.getByRole('link', { name: /JSON Resume/ })).toHaveAttribute('href', '/cv.json')
    await expect(list.getByRole('button', { name: /Print this page/ })).toBeVisible()
    expect(await seriousA11yViolations(page), 'axe with the menu open').toEqual([])
    await page.keyboard.press('ArrowDown')
    await expect(list.getByRole('link', { name: /Plain text/ })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(list.getByRole('link', { name: /JSON Resume/ })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()
    await expect(list).toHaveCount(0)
    // Print goes through the browser.
    await page.evaluate(() => {
      const w = window as unknown as { __printed: number; print: () => void }
      w.__printed = 0
      w.print = () => {
        w.__printed++
      }
    })
    await toggle.click()
    await page.getByRole('button', { name: /Print this page/ }).click()
    expect(await page.evaluate(() => (window as any).__printed)).toBe(1)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  test('the files: types, dated names, ETag revalidation, canonical link; 中文 files from /cv/zh', async ({ request }) => {
    const probe = await request.get('/cv.txt')
    test.skip(probe.status() === 404, 'no published CV')
    expect(probe.headers()['content-type']).toBe('text/plain; charset=utf-8')
    expect(probe.headers()['cache-control']).toBe('public, max-age=0, must-revalidate')
    expect(probe.headers()['x-robots-tag']).toBe('noindex')
    expect(probe.headers()['content-disposition']).toMatch(/^inline; filename="[A-Za-z0-9-]*CV-\d{4}-\d{2}\.txt"/)
    const etag = probe.headers().etag
    expect(etag).toMatch(/^"[A-Za-z0-9_-]{32}"$/)
    const again = await request.get('/cv.txt', { headers: { 'If-None-Match': etag } })
    expect(again.status()).toBe(304)

    const json = await request.get('/cv.json')
    expect(json.headers()['content-type']).toBe('application/json; charset=utf-8')
    const resume = await json.json()
    expect(resume.$schema).toBe('https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json')
    expect(resume.meta.canonical).toMatch(/\/cv\.json$/)
    expect(resume.meta.version).toBe('v1.0.0')

    const pdf = await request.get('/cv.pdf')
    expect(pdf.headers().link).toMatch(/\/cv>; rel="canonical"$/)
    const zh = await request.get('/cv/zh.pdf')
    if (zh.status() === 200) {
      expect(zh.headers()['content-disposition']).toMatch(/CV-zh-\d{4}-\d{2}\.pdf"/)
      expect((await zh.body()).toString('latin1')).toContain('/Lang (zh-CN)')
      const zhTxt = await request.get('/cv/zh.txt')
      expect(zhTxt.headers()['content-language']).toBe('zh-Hans')
    }
    // HEAD: the same headers, no body (compared only while no concurrent save changed the file).
    const head = await request.head('/cv.pdf')
    expect(head.status()).toBe(200)
    const twin = await request.get('/cv.pdf')
    if (twin.headers().etag === head.headers().etag) expect(head.headers()['content-length']).toBe(twin.headers()['content-length'])
    expect((await request.get('/api/cv/export?lang=xx&format=pdf')).status()).toBe(400)
  })

  test('the palette downloads the PDFs', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard palette')
    test.skip(!(await hasCv(page)), 'no published CV')
    await settle(page)
    await page.keyboard.press('ControlOrMeta+KeyK')
    const input = page.getByRole('combobox', { name: /search/i })
    await expect(input).toBeVisible()
    await input.fill('download cv pdf')
    await expect(page.getByRole('option').first()).toContainText('Download CV (PDF)')
    const [download] = await Promise.all([page.waitForEvent('download'), input.press('Enter')])
    expect(download.suggestedFilename()).toMatch(/CV-\d{4}-\d{2}\.pdf$/)
  })
})

test.describe('page', () => {
  test('the "Updated" marker, the PDF alternate link and the CreativeWork with dateModified + files', async ({ page, request }) => {
    test.skip(!(await hasCv(page)), 'no published CV')
    const pageHeader = page.locator('main header:has(h1)')
    const time = pageHeader.locator('time[datetime]')
    await expect(time).toHaveAttribute('datetime', /^\d{4}-\d{2}$/)
    await expect(pageHeader).toContainText(/Updated [A-Z][a-z]+ \d{4}/)
    await expect(page.locator('link[rel="alternate"][type="application/pdf"]')).toHaveAttribute('href', /\/cv\.pdf$/)
    const work = jsonLd(await (await request.get('/cv')).text()).find((n) => n['@type'] === 'CreativeWork')!
    expect(work.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(work.encoding.map((e: any) => e.encodingFormat)).toEqual(['application/pdf', 'text/plain', 'application/json'])

    await page.goto('/cv/zh')
    await expect(page.locator('main header:has(h1)')).toContainText(/更新于 \d{4} 年 \d{1,2} 月/)
  })

  test('/cv and /cv/zh are ISR pages (served from the cache, short s-maxage)', async ({ request }) => {
    for (const path of ['/cv', '/cv/zh']) {
      await request.get(path)
      const res = await request.get(path)
      expect(res.status()).toBe(200)
      expect(res.headers()['x-nextjs-cache'], `${path} comes from the ISR cache`).toMatch(/HIT|STALE/)
      expect(res.headers()['cache-control']).toMatch(/s-maxage=(1|60)\b/)
    }
  })

  test('skill evidence: a role’s skill link opens its evidence row; evidence links resolve', async ({ page, request }) => {
    test.skip(!(await hasCv(page)), 'no published CV')
    const section = page.locator('section[aria-labelledby="cv-skill-evidence"]')
    test.skip(!(await section.count()), 'no skill with evidence')
    await expect(section.getByRole('heading', { name: 'Skill evidence' })).toBeVisible()
    const rows = section.locator('details[data-skill-evidence]')
    expect(await rows.count()).toBeGreaterThan(0)
    // No empty rows, never a "0".
    await expect(section).not.toContainText(/\b0 sources?\b/)
    const inSheet = page.locator('#A4Paper a[href^="#skill-"]').first()
    if (await inSheet.count()) {
      const id = (await inSheet.getAttribute('href'))!.slice(1)
      await inSheet.click()
      await expect(page.locator(`[id="${id}"]`)).toHaveAttribute('open', '')
      await expect(page.locator(`[id="${id}"] > summary`)).toBeFocused()
    }
    const first = rows.first()
    await first.locator('summary').click()
    const hrefs = await first.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') || ''))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      if (href.startsWith('#')) expect(await page.locator(`[id="${href.slice(1)}"]`).count(), `${href} exists on the page`).toBe(1)
      else expect((await request.get(href)).status(), `${href} resolves`).toBe(200)
    }
    expect(await seriousA11yViolations(page)).toEqual([])
    expect(await undersizedTargets(page)).toEqual([])
  })

  test('evidence links in the A4 header: GitHub / LinkedIn when public, never WhatsApp', async ({ page }) => {
    test.skip(!(await hasCv(page)), 'no published CV')
    const header = page.locator('#cv-personalInformation')
    await expect(header.locator('a[href*="wa.me"]')).toHaveCount(0)
    const profiles = header.locator('a[href^="https://github.com/"], a[href*="linkedin.com/"]')
    for (const a of await profiles.all()) await expect(a).toHaveAttribute('aria-label', /^(GitHub|LinkedIn): /)
  })

  test('home and about are og:type profile with a dated ProfilePage; the Person carries the CV facts', async ({ request }) => {
    for (const path of ['/', '/about']) {
      const html = await (await request.get(path)).text()
      expect(html).toMatch(/<meta property="og:type" content="profile"[^>]*>/)
      const nodes = jsonLd(html)
      const profile = nodes.find((n) => n['@type'] === 'ProfilePage')!
      const person = nodes.find((n) => n['@type'] === 'Person')!
      if (person.knowsLanguage) {
        for (const l of person.knowsLanguage) expect(l['@type']).toBe('Language')
        expect(profile.dateModified, `${path}: dateModified with the facts`).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      }
      for (const c of person.hasCredential || []) expect(c).toMatchObject({ '@type': 'EducationalOccupationalCredential', credentialCategory: 'degree' })
      const skills = (person.knowsAbout || []).map((s: string) => s.replace(/\([^)]*\)/g, '').trim().toLowerCase())
      expect(new Set(skills).size, 'knowsAbout de-duplicated').toBe(skills.length)
    }
  })

  test('the vCard carries the public profiles as SOCIALPROFILE lines', async ({ request }) => {
    const card = (await (await request.get('/api/vcard')).text()).replace(/\r\n /g, '')
    expect(card).toContain('BEGIN:VCARD')
    for (const line of card.split('\r\n').filter((l) => l.startsWith('SOCIALPROFILE'))) {
      expect(line).toMatch(/^SOCIALPROFILE;SERVICE-TYPE=(GitHub|LinkedIn):https:\/\//)
    }
    expect(card).not.toContain('wa.me')
  })
})

test.describe('phone', () => {
  const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7']
  void _browser
  test.use(pixel)

  test('the bottom bar downloads the PDF (no print dialog) and opens the formats upwards, inside the screen', async ({ page }) => {
    test.skip(!(await hasCv(page, '/cv/zh')), 'no published CV')
    await settle(page)
    const bar = page.locator('nav[data-bottom-bar]')
    const pdf = bar.getByRole('link', { name: '下载 PDF' })
    await expect(pdf).toHaveAttribute('href', '/cv/zh.pdf')
    await expect(pdf).toHaveAttribute('download', /CV-zh-\d{4}-\d{2}\.pdf$/)
    await bar.getByRole('button', { name: '更多格式' }).click()
    const menu = bar.locator('ul[id^="cv-formats-"]')
    await expect(menu).toBeVisible()
    const box = (await menu.boundingBox())!
    const barBox = (await bar.boundingBox())!
    expect(box.y + box.height, 'opens above the bar').toBeLessThanOrEqual(barBox.y + 1)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    await expect(menu.getByRole('link', { name: /纯文本/ })).toHaveAttribute('href', '/cv/zh.txt')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'no horizontal overflow').toBeLessThanOrEqual(0)
    expect(await undersizedTargets(page)).toEqual([])
  })
})

// Saving the CV is covered by admin.spec.ts ("CV Studio: a hidden field
// disappears …"), which also checks the files: two specs toggling the same
// CV in parallel workers would race each other's If-Match saves.
test.describe('owner', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('CV Studio edits the GitHub / LinkedIn profile links, each hideable', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/dashboard?tab=cv')
    await expect(page.getByLabel(/^GitHub\b/).first()).toBeVisible()
    await expect(page.getByLabel(/^LinkedIn\b/).first()).toBeVisible()
    for (const name of ['GitHub', 'LinkedIn']) await expect(page.getByRole('button', { name: `Hide ${name} from CV and website` }).first()).toBeVisible()
  })

  test('a signed-in owner gets the same public files as everyone (no hidden content for the admin either)', async ({ page, request }) => {
    await loginAsAdmin(page)
    const probe = await request.get('/cv.txt')
    test.skip(probe.status() === 404, 'no published CV')
    // Through the page's fetch: the session cookie is Secure (sent to 127.0.0.1, not by the request client).
    const ownerFetch = () => page.evaluate(async () => (await fetch('/cv.txt', { cache: 'no-store' })).text())
    const asOwner = await ownerFetch()
    const asPublic = await (await request.get('/cv.txt')).text()
    // Another admin test may save the CV in parallel: compare only a stable pair.
    if ((await ownerFetch()) === asOwner) expect(asPublic).toBe(asOwner)
  })
})
