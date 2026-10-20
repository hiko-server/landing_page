import type { Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, settle, seriousA11yViolations } from './fixtures'

/**
 * bilingual-site stream (F3): the Chinese pages (/zh, /zh/about, /zh/work,
 * /zh/blog, /zh/contact) exist only while the owner's Chinese copy does;
 * each pair links both ways (hreflang alternates with an English x-default,
 * the header's language switch), the chrome speaks the page's language and
 * the sitemap lists what exists.
 *
 * Public tests use whatever the store holds (the CI store has no Chinese
 * copy: every Chinese page is a 404 and every switch is hidden). The @admin
 * test writes synthetic Chinese copy through the admin API, checks the pages
 * and the editors, then restores the store as it found it.
 */

const PAIRS: ReadonlyArray<[en: string, zh: string]> = [
  ['/', '/zh'],
  ['/about', '/zh/about'],
  ['/work', '/zh/work'],
  ['/blog', '/zh/blog'],
  ['/contact', '/zh/contact'],
]

/** The page's hreflang alternates as "<hreflang> <path>". */
async function alternates(page: Page): Promise<string[]> {
  const list = await page
    .locator('head link[rel="alternate"][hreflang]')
    .evaluateAll((els) => els.map((e) => `${e.getAttribute('hreflang')} ${new URL(e.getAttribute('href') || '').pathname}`))
  return list.sort()
}

const pairAlternates = (en: string, zh: string) => [`en ${en}`, `x-default ${en}`, `zh-Hans ${zh}`].sort()

/** Same-origin fetch from the page (the session cookie is Secure: the browser sends it to 127.0.0.1, Playwright's request client does not). */
function adminFetch(page: Page, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return page.evaluate(
    async ([m, u, b, h]) => {
      const res = await fetch(u as string, {
        method: m as string,
        headers: { 'Content-Type': 'application/json', ...(h as Record<string, string>) },
        body: b === undefined ? undefined : JSON.stringify(b),
      })
      return { status: res.status, etag: res.headers.get('ETag'), text: await res.text() }
    },
    [method, url, body, headers] as const,
  )
}

const ifMatch = (etag: string | null): Record<string, string> => (etag ? { 'If-Match': etag } : {})

test.describe('bilingual site (F3)', () => {
  test('each Chinese page exists only with its Chinese copy; a pair links both ways', async ({ page, request }) => {
    test.setTimeout(120_000)
    for (const [en, zh] of PAIRS) {
      const status = (await request.get(zh)).status()
      expect([200, 404], zh).toContain(status)
      await page.goto(en)
      await settle(page)
      const toZh = page.locator('header [data-lang-switch]')
      if (status === 404) {
        // No Chinese page: no switch, no alternate that would lead to a 404.
        await expect(toZh, en).toHaveCount(0)
        expect((await alternates(page)).filter((a) => a.startsWith('zh-')), en).toEqual([])
        continue
      }
      await expect(toZh).toHaveAttribute('href', zh)
      await expect(toZh).toHaveAttribute('hreflang', 'zh-Hans')
      await expect(toZh).toHaveAttribute('lang', 'zh-Hans')
      await expect(toZh).toHaveText('中文')
      expect(await alternates(page), en).toEqual(pairAlternates(en, zh))

      // The switch keeps the page: /about → /zh/about, and back.
      await toZh.click()
      await expect(page).toHaveURL(new RegExp(`${zh.replace(/\//g, '\\/')}$`))
      await settle(page)
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')
      const toEn = page.locator('header [data-lang-switch]')
      await expect(toEn).toHaveAttribute('href', en)
      await expect(toEn).toHaveText('English')
      expect(await alternates(page), zh).toEqual(pairAlternates(en, zh))
      // The chrome speaks Chinese and simply inherits <html lang>.
      const nav = page.getByRole('navigation', { name: '主导航' })
      await expect(nav).toBeVisible()
      await expect(nav.getByRole('link', { name: '简历' })).toHaveAttribute('href', '/cv/zh')
      expect(await page.locator('header').first().evaluate((el) => el.closest('[lang]')?.tagName)).toBe('HTML')
      await expect(page.locator('a.skip-nav')).toHaveText('跳到正文')
      expect(await seriousA11yViolations(page), zh).toEqual([])
    }
  })

  test('a Chinese page’s navigation leads to the Chinese pages that exist and marks its own section', async ({ page, request }) => {
    const live: string[] = []
    for (const [en, zh] of PAIRS) if ((await request.get(zh)).status() === 200) live.push(en)
    const listing = live.find((p) => p === '/blog' || p === '/work')
    test.skip(!listing, 'no post or case study in Chinese in the store')
    const zh = `/zh${listing}`
    await page.goto(zh)
    await settle(page)
    const nav = page.getByRole('navigation', { name: '主导航' })
    const own = nav.getByRole('link', { name: listing === '/blog' ? '文章' : '项目' })
    await expect(own).toHaveAttribute('href', zh)
    await expect(own).toHaveAttribute('aria-current', 'page')
    for (const [en, label] of [['/', '首页'], ['/about', '关于'], ['/contact', '联系']] as const) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', live.includes(en) ? (en === '/' ? '/zh' : `/zh${en}`) : en)
    }
    // Every listed piece is in Chinese.
    const langs = await page.locator('main article[lang], main li[lang]').evaluateAll((els) => els.map((e) => e.getAttribute('lang') || ''))
    for (const l of langs) expect(l).toMatch(/^zh/)
  })

  test('/cv ⇄ /cv/zh through the header switch; /now, without a Chinese page, has none', async ({ page }) => {
    await page.goto('/cv')
    await settle(page)
    const toZh = page.locator('header [data-lang-switch]')
    await expect(toZh).toHaveAttribute('href', '/cv/zh')
    await toZh.click()
    await expect(page).toHaveURL(/\/cv\/zh$/)
    await settle(page)
    await expect(page.locator('header [data-lang-switch]')).toHaveAttribute('href', '/cv')
    await expect(page.getByRole('button', { name: '打开菜单' }).or(page.getByRole('navigation', { name: '主导航' })).first()).toBeAttached()

    await page.goto('/now')
    await settle(page)
    await expect(page.locator('header [data-lang-switch]')).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('a missing address under /zh/ answers 404 in Chinese', async ({ page }) => {
    const res = await page.goto('/zh/no-such-page-f3')
    expect(res?.status()).toBe(404)
    await settle(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('这个页面不存在。')
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')
    expect(await seriousA11yViolations(page)).toEqual([])
  })

  test('the sitemap and /llms.txt list exactly the Chinese pages that exist', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text()
    const llms = await (await request.get('/llms.txt')).text()
    for (const [en, zh] of PAIRS) {
      const exists = (await request.get(zh)).status() === 200
      // The page's own entry (not /cv/zh): the origin, then exactly its path.
      const entry = new RegExp(`<loc>https?://[^/<]+${zh.replace(/\//g, '\\/')}</loc>([\\s\\S]*?)</url>`).exec(xml)
      expect(!!entry, zh).toBe(exists)
      if (!entry) continue
      expect(entry[1]).toMatch(new RegExp(`hreflang="en" href="https?://[^/"]+${en.replace(/\//g, '\\/')}"`))
      expect(entry[1]).toMatch(new RegExp(`hreflang="zh-Hans" href="https?://[^/"]+${zh.replace(/\//g, '\\/')}"`))
      expect(entry[1]).toMatch(/hreflang="x-default"/)
      expect(llms).toContain(`${zh}>`)
    }
  })
})

test.describe('bilingual site (F3): the owner’s Chinese copy', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  test('Chinese tagline, contact copy and bio publish /zh, /zh/contact and /zh/about; removing them takes the pages down @admin', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    const home = await adminFetch(page, 'GET', '/api/admin/home')
    expect(home.status).toBe(200)
    const bio = await adminFetch(page, 'GET', '/api/admin/page?name=about-zh')
    expect(bio.status).toBe(200)
    const original = JSON.parse(home.text) as Record<string, any>
    const originalBio = JSON.parse(bio.text) as { frontmatter: Record<string, unknown>; body: string }
    const stamp = Date.now()
    const TAGLINE = `端到端测试 | 中文标语 ${stamp}`
    const HEADING = `端到端测试的联系标题 ${stamp}`
    const BIO = `端到端测试写的中文简介，测试结束后删除。${stamp}`
    try {
      const doc = {
        ...original,
        hero: { ...original.hero, tagline_zh: TAGLINE },
        contact: { ...(original.contact || {}), heading_zh: HEADING, blurb_zh: '端到端测试写的中文说明。' },
      }
      const saved = await adminFetch(page, 'PUT', '/api/home', doc, ifMatch(home.etag))
      expect(saved.status, saved.text).toBe(200)
      expect((JSON.parse(saved.text) as { revalidated?: string[] }).revalidated).toEqual(expect.arrayContaining(['/zh', '/zh/contact']))
      const put = await adminFetch(page, 'PUT', '/api/admin/page', { name: 'about-zh', frontmatter: { title: '关于' }, body: `${BIO}\n` }, ifMatch(bio.etag))
      expect(put.status, put.text).toBe(200)
      expect((JSON.parse(put.text) as { revalidated: string[] }).revalidated).toEqual(expect.arrayContaining(['/zh/about', '/about']))

      const status = JSON.parse((await adminFetch(page, 'GET', '/api/admin/zh-pages')).text) as { pages: Array<{ path: string; live: boolean }> }
      for (const p of ['/zh', '/zh/about', '/zh/contact']) expect(status.pages.find((s) => s.path === p)?.live, p).toBe(true)

      // /zh: the owner's tagline, the Chinese interface, the pair.
      await page.goto('/zh')
      await settle(page)
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')
      await expect(page.locator('main')).toContainText(`中文标语 ${stamp}`)
      await expect(page.locator('header [data-lang-switch]')).toHaveAttribute('href', '/')
      expect(await alternates(page)).toEqual(pairAlternates('/', '/zh'))
      expect(await seriousA11yViolations(page)).toEqual([])
      await page.goto('/')
      await expect(page.locator('header [data-lang-switch]')).toHaveAttribute('href', '/zh')
      await expect(page.locator('main')).not.toContainText(TAGLINE)

      // /zh/about: the Chinese bio.
      await page.goto('/zh/about')
      await settle(page)
      await expect(page.locator('#about-bio')).toContainText(BIO)
      await expect(page.locator('header [data-lang-switch]')).toHaveAttribute('href', '/about')
      await page.goto('/about')
      await expect(page.locator('header [data-lang-switch]')).toHaveAttribute('href', '/zh/about')
      await expect(page.locator('main')).not.toContainText(BIO)

      // /zh/contact: the Chinese heading, a Chinese form.
      await page.goto('/zh/contact')
      await settle(page)
      await expect(page.getByRole('heading', { name: HEADING })).toBeVisible()
      await expect(page.getByRole('button', { name: '发送留言' })).toBeVisible()
      expect(await seriousA11yViolations(page)).toEqual([])

      // The editors: the Chinese bio beside the English one; the Home editor's Chinese section.
      await page.goto('/admin/about?lang=zh')
      await expect(page.getByRole('heading', { name: 'Edit /zh/about' })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Language version' }).getByRole('link', { name: /中文/ })).toHaveAttribute('aria-current', 'page')
      await page.goto('/admin/dashboard?tab=home')
      const tagline = page.getByLabel('Tagline (中文)')
      await expect(tagline).toHaveValue(TAGLINE)
      await expect(page.getByTestId('zh-page-status')).toContainText('/zh/contact')
    } finally {
      // Leave the store as found, whatever step failed.
      const current = await adminFetch(page, 'GET', '/api/admin/home')
      const restored = await adminFetch(page, 'PUT', '/api/home', original, ifMatch(current.etag))
      expect(restored.status, restored.text).toBe(200)
      const nowBio = await adminFetch(page, 'GET', '/api/admin/page?name=about-zh')
      const frontmatter = Object.keys(originalBio.frontmatter || {}).length ? originalBio.frontmatter : { title: '关于' }
      const back = await adminFetch(page, 'PUT', '/api/admin/page', { name: 'about-zh', frontmatter, body: originalBio.body || '' }, ifMatch(nowBio.etag))
      expect(back.status, back.text).toBe(200)
    }

    // Without the copy the pages are gone again (unless the owner had written it before).
    if (!original.hero?.tagline_zh) expect((await page.request.get('/zh')).status()).toBe(404)
    if (!(originalBio.body || '').trim()) {
      expect((await page.request.get('/zh/about')).status()).toBe(404)
      await page.goto('/about')
      await expect(page.locator('header [data-lang-switch]')).toHaveCount(0)
    }
  })
})
