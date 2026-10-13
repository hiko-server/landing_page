import { test, expect, settle } from './fixtures'

/**
 * Wave 2A streams working together (tests/wave2a-integration.test.ts has the
 * source-level checks). Each block names the streams it joins.
 */

// ── (c) home-about-isr rail + cv-docs PDFs ──────────────────────────────────

test('(c) the /about rail downloads the server-rendered PDF in the language the CV shows', async ({ page, request }) => {
  await page.goto('/about')
  await settle(page)
  const rail = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) })
  const pdf = rail.getByRole('link', { name: 'Download PDF' })
  await expect(pdf).toHaveAttribute('href', '/cv.pdf')
  await expect(pdf).toHaveAttribute('download', '')
  await expect(rail.getByRole('link', { name: /View CV/ })).toHaveAttribute('href', '/cv')

  const res = await request.get('/cv.pdf')
  // An empty store (the CI container) has no CV to render; with content it is a PDF.
  if (res.status() === 200) expect(res.headers()['content-type']).toContain('application/pdf')
  else expect(res.status()).toBe(404)

  const zh = page.getByRole('group', { name: 'CV language' }).getByRole('button', { name: '中文' })
  if ((await zh.count()) === 0) return // no Chinese CV: the toggle is not shown
  await zh.click()
  await expect(pdf).toHaveAttribute('href', '/cv/zh.pdf')
  await expect(rail.getByRole('link', { name: /View CV/ })).toHaveAttribute('href', '/cv/zh')
})

// ── (d) home-about-isr + cv-docs + cv-studio-contact: ISR coherence ─────────

test('(d) /, /about, /cv, /cv/zh and /contact are all served from the ISR cache with their windows', async ({ request }) => {
  // A copy prerendered during the build (or not yet warmed) still says 1 s; the regenerated one says the page's window.
  const windows: Record<string, number> = { '/': 3600, '/about': 3600, '/cv': 60, '/cv/zh': 60, '/contact': 300 }
  for (const [path, seconds] of Object.entries(windows)) {
    await expect
      .poll(
        async () => {
          const res = await request.get(path)
          expect(res.status(), path).toBe(200)
          expect(res.headers()['x-nextjs-cache'], `${path} is an ISR page`).toMatch(/HIT|STALE|MISS/)
          return /s-maxage=(\d+)/.exec(res.headers()['cache-control'] || '')?.[1]
        },
        { message: `${path} s-maxage`, timeout: 20_000, intervals: [250, 500, 1000, 2000] },
      )
      .toBe(String(seconds))
  }
})
