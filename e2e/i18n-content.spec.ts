import type { Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, settle, seriousA11yViolations } from './fixtures'

/**
 * i18n-content stream (F1, F2, G9): the Chinese typesetting layer and the
 * Chinese interface words of zh posts and case studies, linked EN ↔ ZH
 * translations (language switch, hreflang, sitemap, one index entry per
 * piece, the editor's translation block) and the machine-readable outputs
 * (/llms.txt, /llms-full.txt, the Markdown twins).
 *
 * Public tests use whatever the store holds and skip what it does not have
 * (the CI store is empty). The @admin test publishes a synthetic EN / ZH pair
 * and a draft through the admin API, checks every surface, then deletes them.
 */

type ListItem = { slug: string; title: string; lang: string; permalink: string; listed?: boolean; translations?: Array<{ lang: string; permalink: string }> }

async function list(page: Page, kind: 'blog' | 'work'): Promise<ListItem[]> {
  const res = await page.request.get(`/api/${kind}/list`)
  if (!res.ok()) return []
  return ((await res.json()) as { items?: ListItem[] }).items || []
}

const isZh = (lang: string) => /^zh(-|$)/i.test(lang)

test.describe('i18n-content: machine-readable outputs (G9)', () => {
  test('/llms.txt lists every published post and case study, each Markdown twin answers, drafts and robots unchanged', async ({ page }) => {
    const [posts, work] = await Promise.all([list(page, 'blog'), list(page, 'work')])
    const index = await page.request.get('/llms.txt')
    expect(index.status()).toBe(200)
    expect(index.headers()['content-type']).toBe('text/plain; charset=utf-8')
    expect(index.headers()['x-robots-tag']).toBe('noindex')
    const text = await index.text()
    expect(text).toMatch(/^# .+\n\n> .+/)
    expect(text).not.toMatch(/mailto:|tel:/)
    for (const item of [...posts, ...work]) expect(text).toContain(`${item.permalink}.md>`)

    const full = await page.request.get('/llms-full.txt')
    expect(full.status()).toBe(200)
    const fullText = await full.text()
    expect((fullText.match(/^- Canonical: /gm) || []).length).toBe(posts.length + work.length)

    for (const item of [...posts.slice(0, 3), ...work.slice(0, 2)]) {
      const twin = await page.request.get(`${item.permalink}.md`)
      expect(twin.status(), item.permalink).toBe(200)
      expect(twin.headers()['content-type']).toBe('text/markdown; charset=utf-8')
      expect(twin.headers()['x-robots-tag']).toBe('noindex')
      expect(twin.headers().link).toMatch(new RegExp(`${item.permalink.replace(/[/.]/g, '\\$&')}>; rel="canonical"$`))
      expect(twin.headers()['content-language']).toBe(item.lang)
      const md = await twin.text()
      expect(md.startsWith(`# ${item.title.replace(/\s+/g, ' ').trim()}\n`)).toBe(true)
    }

    expect((await page.request.get('/blog/no-such-post-xyz.md')).status()).toBe(404)
    const robots = await (await page.request.get('/robots.txt')).text()
    expect(robots).not.toMatch(/llms|GPTBot|ClaudeBot|Google-Extended/i)
  })

  test('an article links its Markdown twin from <head>', async ({ page }) => {
    const posts = await list(page, 'blog')
    test.skip(posts.length === 0, 'no published posts (empty store)')
    await page.goto(posts[0].permalink)
    await expect(page.locator('head link[rel="alternate"][type="text/markdown"]')).toHaveAttribute('href', `${posts[0].permalink}.md`)
  })
})

test.describe('i18n-content: Chinese articles (F1)', () => {
  test('a Chinese post reads in Chinese: labels, dates, typesetting; the chrome stays English', async ({ page }) => {
    const zh = (await list(page, 'blog')).find((p) => isZh(p.lang))
    test.skip(!zh, 'no Chinese post in the store')
    await page.goto(zh!.permalink)
    await settle(page)
    await expect(page.locator('html')).toHaveAttribute('lang', zh!.lang)
    await expect(page.getByRole('link', { name: '← 全部文章' })).toBeVisible()
    const meta = page.locator('article dl').first()
    await expect(meta).toContainText('日期')
    await expect(meta).toContainText('阅读')
    await expect(meta).toContainText(/\d{4}年\d{1,2}月\d{1,2}日/)
    await expect(meta).toContainText('分钟')
    await expect(page.locator('#author-heading')).toHaveText('作者')

    const style = await page.evaluate(() => {
      const h1 = document.querySelector('article.article-page header h1') as HTMLElement
      const prose = document.querySelector('article.article-page .article-prose') as HTMLElement
      const p = prose.querySelector('p') as HTMLElement
      const cs = getComputedStyle(prose)
      return {
        h1Tracking: getComputedStyle(h1).letterSpacing,
        lineHeightRatio: parseFloat(getComputedStyle(p).lineHeight) / parseFloat(getComputedStyle(p).fontSize),
        measureEm: parseFloat(cs.maxWidth) / parseFloat(cs.fontSize),
        family: getComputedStyle(p).fontFamily,
      }
    })
    expect(['0px', 'normal']).toContain(style.h1Tracking)
    expect(style.lineHeightRatio).toBeGreaterThan(1.8)
    expect(style.lineHeightRatio).toBeLessThan(1.9)
    expect(style.measureEm).toBeLessThanOrEqual(34.01)
    expect(style.family).toMatch(/^"?CJK punctuation SC"?, .*PingFang SC/)
    // The site chrome is English and says so (language of parts).
    expect(await page.evaluate(() => document.querySelector('header')?.closest('[lang]')?.getAttribute('lang'))).toBe('en')
    expect(await seriousA11yViolations(page)).toEqual([])
  })

  test('an English post keeps the English words and the Latin layout', async ({ page }) => {
    const en = (await list(page, 'blog')).find((p) => !isZh(p.lang))
    test.skip(!en, 'no English post in the store')
    await page.goto(en!.permalink)
    await expect(page.getByRole('link', { name: '← All posts' })).toBeVisible()
    await expect(page.locator('article dl').first()).toContainText('Date')
    const ratio = await page.evaluate(() => {
      const p = document.querySelector('article.article-page .article-prose p') as HTMLElement
      return parseFloat(getComputedStyle(p).lineHeight) / parseFloat(getComputedStyle(p).fontSize)
    })
    expect(ratio).toBeLessThan(1.8)
  })
})

test.describe('i18n-content: a translated pair', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  const adminFetch = (page: Page, method: string, url: string, body?: unknown) =>
    page.evaluate(
      async ([m, u, b]) => {
        const res = await fetch(u as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })
        return { status: res.status, text: await res.text() }
      },
      [method, url, body] as const,
    )

  test('switch, hreflang, sitemap, one index entry, Chinese typesetting, llms and twins; drafts stay out @admin', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    const stamp = Date.now()
    const key = `e2e-i18n-${stamp}`
    const en = `e2e-i18n-${stamp}-en`
    const zh = `e2e-i18n-${stamp}-zh`
    const tw = `e2e-i18n-${stamp}-zh-hant`
    const CANARY = `ZZ${stamp}ZZ`
    const enBody = [
      'An English version of a synthetic post, written by the end-to-end suite to check linked translations.',
      '',
      '## First section',
      '',
      'Some *emphasis* and `code`.',
      '',
      '## Second section',
      '',
      '```js',
      'const answer = 42',
      '```',
    ].join('\n')
    const zhBody = [
      '这是端到端测试写的一篇中文文章，用来检查中文排版和翻译链接是否正常工作。',
      '',
      '## 第一节',
      '',
      '使用TensorFlow训练模型，*非常*重要，推理只要61ms。',
      '',
      '## 第二节',
      '',
      '```js',
      'const answer = 42',
      '```',
    ].join('\n')
    const put = async (slug: string, frontmatter: Record<string, unknown>, body: string) => {
      const res = await adminFetch(page, 'PUT', '/api/admin/posts', { slug, create: true, frontmatter, body })
      expect(res.status, res.text).toBe(200)
    }
    try {
      await put(en, { title: 'E2E translated post', description: 'Synthetic English version created by the i18n-content end-to-end suite.', date: '2026-01-02', translationKey: key, lang: 'en', tags: ['E2E'] }, enBody)
      await put(zh, { title: '端到端测试的中文版本文章', description: '端到端测试创建的中文版本，测试结束后删除。', date: '2026-01-02', translationKey: key, lang: 'zh-Hans', tags: ['E2E'] }, zhBody)
      await put(tw, { title: `草稿 ${CANARY}`, date: '2026-01-02', translationKey: key, lang: 'zh-Hant', draft: true }, `草稿正文 ${CANARY}`)

      // F2 — the English page offers "阅读中文版" (and never the draft), with reciprocal hreflang.
      await page.goto(`/blog/${en}`)
      await settle(page)
      const toZh = page.locator('[data-language-switch]')
      await expect(toZh).toHaveText('阅读中文版')
      await expect(toZh).toHaveAttribute('hreflang', 'zh-Hans')
      await expect(toZh).toHaveAttribute('lang', 'zh-Hans')
      await expect(toZh).toHaveAttribute('href', `/blog/${zh}`)
      const alternates = await page.locator('head link[rel="alternate"][hreflang]').evaluateAll((els) => els.map((e) => `${e.getAttribute('hreflang')} ${new URL(e.getAttribute('href') || '').pathname}`))
      expect(alternates.sort()).toEqual([`en /blog/${en}`, `x-default /blog/${en}`, `zh-Hans /blog/${zh}`].sort())
      expect(await page.content()).not.toContain(CANARY)

      // Follow the switch: the Chinese page, its words and its typesetting.
      await toZh.click()
      await expect(page).toHaveURL(new RegExp(`/blog/${zh}$`))
      await settle(page)
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans')
      await expect(page.locator('[data-language-switch]')).toHaveText('Read in English')
      await expect(page.getByRole('link', { name: '← 全部文章' })).toBeVisible()
      await expect(page.locator('article dl').first()).toContainText('2026年1月2日')
      await expect(page.getByRole('button', { name: '复制代码' })).toBeAttached()
      await expect(page.locator('nav[aria-label="本页目录"], aside[aria-label="文章目录"]').first()).toBeAttached()
      const zhStyle = await page.evaluate(() => {
        const em = document.querySelector('article .article-prose em') as HTMLElement
        const ecs = getComputedStyle(em) as CSSStyleDeclaration & { webkitTextEmphasisStyle?: string }
        return {
          gaps: document.querySelectorAll('article .article-prose .autospace').length,
          emphasis: ecs.textEmphasisStyle || ecs.webkitTextEmphasisStyle || '',
          fontStyle: ecs.fontStyle,
          autospace: getComputedStyle(document.querySelector('article .article-prose') as HTMLElement).getPropertyValue('text-autospace'),
        }
      })
      expect(zhStyle.gaps).toBeGreaterThanOrEqual(3)
      expect(zhStyle.emphasis).toMatch(/dot/)
      expect(zhStyle.fontStyle).toBe('normal')
      expect(['normal', '']).toContain(zhStyle.autospace)
      // The text itself is unchanged (copy, search and screen readers read it as written).
      await expect(page.locator('article .article-prose p').nth(1)).toContainText('使用TensorFlow训练模型')
      expect(await seriousA11yViolations(page)).toEqual([])

      // One index entry for the pair (the English one), saying it is also in Chinese.
      await page.goto('/blog')
      await expect(page.locator(`a[href="/blog/${en}"]`)).toHaveCount(1)
      await expect(page.locator(`a[href="/blog/${zh}"]`)).toHaveCount(0)
      await expect(page.locator(`a[href="/blog/${en}"]`).locator('[data-also-in]')).toHaveText('Also in 简体中文')
      const listed = (await list(page, 'blog')).filter((p) => p.slug === en || p.slug === zh)
      expect(listed.map((p) => [p.slug, p.listed]).sort()).toEqual([[en, true], [zh, false]].sort())

      // The sitemap ties the versions together; drafts are absent.
      const sitemap = await (await page.request.get('/sitemap.xml')).text()
      for (const slug of [en, zh]) {
        const block = sitemap.slice(sitemap.indexOf(`/blog/${slug}</loc>`), sitemap.indexOf('</url>', sitemap.indexOf(`/blog/${slug}</loc>`)))
        expect(block).toContain(`hreflang="en" href="`)
        expect(block).toContain(`/blog/${en}" />`)
        expect(block).toContain(`hreflang="zh-Hans"`)
        expect(block).toContain(`hreflang="x-default"`)
      }
      expect(sitemap).not.toContain(tw)

      // G9 — both twins are listed and answer; the draft never appears and has no twin.
      const llms = await (await page.request.get('/llms.txt')).text()
      expect(llms).toContain(`/blog/${en}.md>`)
      expect(llms).toContain(`/blog/${zh}.md>`)
      expect(llms).not.toContain(CANARY)
      expect(llms).not.toContain(tw)
      expect(await (await page.request.get('/llms-full.txt')).text()).not.toContain(CANARY)
      const twin = await page.request.get(`/blog/${zh}.md`)
      expect(twin.status()).toBe(200)
      const md = await twin.text()
      expect(md).toContain('- Language: 简体中文 (zh-Hans)')
      expect(md).toMatch(new RegExp(`- Also in: \\[English\\]\\(<[^>]*/blog/${en}\\.md>\\) \\(en\\)`))
      expect(md).toContain('使用TensorFlow训练模型')
      expect((await page.request.get(`/blog/${tw}.md`)).status()).toBe(404)

      // The editor's translation block lists the other versions, the draft marked.
      await page.goto(`/admin/blog/edit?slug=${en}`)
      const block = page.locator('[data-translation-field]')
      await expect(block).toBeVisible()
      await expect(block.getByLabel('Translation key')).toHaveValue(key)
      await expect(block.getByRole('link', { name: '端到端测试的中文版本文章' })).toBeVisible()
      await expect(block.getByRole('link', { name: `草稿 ${CANARY}` })).toBeVisible()
      await expect(block.getByText('Drafts are linked once they are published.')).toBeVisible()
      await expect(block.getByRole('button', { name: 'Create draft' })).toHaveCount(0)
      // Typing keeps the key valid.
      await block.getByLabel('Translation key').fill('Not A Valid Key!')
      await expect(block.getByLabel('Translation key')).toHaveValue('not-a-valid-key')
    } finally {
      for (const slug of [tw, zh, en]) await adminFetch(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
    // Gone everywhere.
    expect((await page.request.get(`/blog/${en}.md`)).status()).toBe(404)
    expect(await (await page.request.get('/llms.txt')).text()).not.toContain(en)
  })

  test('the editor creates a translation draft from a saved version @admin', async ({ page }) => {
    await loginAsAdmin(page)
    const stamp = Date.now()
    const slug = `e2e-i18n-src-${stamp}`
    const created = await adminFetch(page, 'PUT', '/api/admin/work', {
      slug,
      create: true,
      frontmatter: { title: 'E2E translation source', description: 'Synthetic case study for the translation draft check.', draft: true, status: 'case-study', translationKey: slug, lang: 'en' },
      body: 'An English body written by the end-to-end suite.',
    })
    expect(created.status, created.text).toBe(200)
    const copy = `e2e-i18n-src-${stamp}-zh`
    try {
      await page.goto(`/admin/work/edit?slug=${slug}`)
      const block = page.locator('[data-translation-field]')
      await expect(block.getByLabel('Translation key')).toHaveValue(slug)
      await expect(block.getByLabel('New version in')).toHaveValue('zh-Hans')
      await block.getByRole('button', { name: 'Create draft' }).click()
      await expect(page).toHaveURL(new RegExp(`/admin/work/edit\\?slug=${copy}$`))
      const res = await adminFetch(page, 'GET', `/api/admin/work?slug=${copy}`)
      expect(res.status).toBe(200)
      const item = JSON.parse(res.text) as { frontmatter: Record<string, unknown>; body: string }
      expect(item.frontmatter).toMatchObject({ draft: true, lang: 'zh-Hans', translationKey: slug, title: 'E2E translation source' })
      expect(item.body).toBe('An English body written by the end-to-end suite.')
      // The new draft's block links back to the source.
      await expect(page.locator('[data-translation-field]').getByRole('link', { name: 'E2E translation source' })).toBeVisible()
    } finally {
      await adminFetch(page, 'DELETE', `/api/admin/work?slug=${copy}`)
      await adminFetch(page, 'DELETE', `/api/admin/work?slug=${slug}`)
    }
  })
})
