import type { Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, settle, seriousA11yViolations } from './fixtures'

/**
 * reading-work stream (D1–D5, D7, D8, E8): case studies "At a glance",
 * covers, click-to-load videos with stored posters, callouts, wide figures,
 * galleries, the end-of-article author card and sharing, post ↔ case-study
 * links, shareable tag filters and the /work archive.
 *
 * Public tests use whatever the store holds and skip what it does not have
 * (the CI store is empty). The @admin tests create their own draft content
 * through the admin API, look at it in Draft Mode and delete it again.
 */

type ListItem = { slug: string; permalink?: string; tags?: string[]; listed?: boolean }

async function list(page: Page, kind: 'blog' | 'work'): Promise<ListItem[]> {
  const res = await page.request.get(`/api/${kind}/list`)
  if (!res.ok()) return []
  const body = (await res.json()) as { items?: ListItem[] }
  return body.items || []
}

/**
 * Sum of the layout shifts (not caused by input) that move an element of the
 * filtered list (`[data-tag-item]` or anything inside one) since the page
 * started loading. Shifts elsewhere (the site chrome) are not this feature's.
 */
async function trackListShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __listShift: number }
    w.__listShift = 0
    new PerformanceObserver((entries) => {
      for (const e of entries.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node | null }> }>) {
        if (e.hadRecentInput) continue
        const inList = (e.sources || []).some((s) => {
          const n = s.node
          const el = n && n.nodeType === 1 ? (n as Element) : n?.parentElement
          return !!el?.closest('[data-tag-item]')
        })
        if (inList) w.__listShift += e.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
}

const thirdPartyVideoHost = /(^|\.)(ytimg\.com|youtube\.com|youtube-nocookie\.com|vimeo\.com|vimeocdn\.com|googlevideo\.com)$/

function watchVideoRequests(page: Page): string[] {
  const hits: string[] = []
  page.on('request', (r) => {
    try {
      if (thirdPartyVideoHost.test(new URL(r.url()).hostname)) hits.push(r.url())
    } catch {
      /* ignore */
    }
  })
  return hits
}

test.describe('reading-work: public pages', () => {
  test('/work: equal 16:10 cover slots, the archive of CV projects, and a shareable tag filter', async ({ page }) => {
    const work = await list(page, 'work')
    test.skip(work.length === 0, 'no published case studies (empty store)')
    await page.goto('/work', { waitUntil: 'load' })
    await settle(page)

    // Every card has a cover slot (image, small image on a panel, or typographic), all 16:10.
    const ratios = await page.locator('article.work-card .work-cover').evaluateAll((els) => els.map((el) => Math.round((el.clientWidth / el.clientHeight) * 100) / 100))
    // A case study published in several languages has one card (F2: `listed`).
    expect(ratios.length).toBe(work.filter((w) => w.listed !== false).length)
    for (const r of ratios) expect(r).toBeCloseTo(1.6, 1)

    const archive = page.locator('section[aria-labelledby="archive-heading"]')
    if (await archive.count()) {
      await expect(archive.getByRole('heading', { name: 'All projects' })).toBeVisible()
      await expect(archive.locator('table caption')).toHaveText('All projects from the CV, newest first')
      expect(await archive.locator('tbody tr').count()).toBeGreaterThan(0)
    }

    const chips = page.getByRole('group', { name: 'Filter projects by technology' })
    test.skip((await chips.count()) === 0, 'no technology tags to filter by')
    const chip = chips.getByRole('button').nth(1)
    const label = ((await chip.textContent()) || '').replace(/^#/, '').replace(/\s*\(\d+\)$/, '')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/\/work\?tag=[^&]+$/)
    expect(await page.evaluate(() => document.activeElement?.textContent || '')).toContain(label)
    const visibleTags = await page.locator('[data-tag-item]:visible').evaluateAll((els) => els.map((el) => el.getAttribute('data-tag-slugs') || ''))
    const slug = new URL(page.url()).searchParams.get('tag') || ''
    expect(visibleTags.length).toBeGreaterThan(0)
    for (const t of visibleTags) expect(t.split(' ')).toContain(slug)
    await chips.getByRole('button', { name: /^all/ }).click()
    await expect(page).toHaveURL(/\/work$/)
  })

  test('/blog?tag= opens already filtered, with no layout shift, and the chips keep the URL in sync', async ({ page, browser }) => {
    const posts = await list(page, 'blog')
    const tagged = posts.find((p) => (p.tags || []).length > 0)
    test.skip(!tagged || posts.length < 2, 'needs two posts, one of them tagged')
    // Find the slug of the post's first tag the way the page builds it.
    await page.goto('/blog', { waitUntil: 'load' })
    const first = page.getByRole('group', { name: 'Filter posts by tag' }).getByRole('button').nth(1)
    await first.click()
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/\?tag=/)
    const slug = new URL(page.url()).searchParams.get('tag')
    expect(slug).toBeTruthy()
    const expected = await page.locator('[data-tag-item]:visible').count()

    await trackListShift(page)
    await page.goto(`/blog?tag=${slug}`, { waitUntil: 'load' })
    await settle(page)
    await expect(page.locator('[data-tag-item]:visible')).toHaveCount(expected)
    await expect(page.getByRole('group', { name: 'Filter posts by tag' }).getByRole('button', { pressed: true })).toHaveText(/^#/)
    const shift = await page.evaluate(() => (window as unknown as { __listShift: number }).__listShift)
    expect(shift, 'layout shift of the list while the filtered page loads').toBe(0)
    // The pre-paint style is gone once React owns the state.
    await expect(page.locator('#tag-filter-prepaint')).toHaveCount(0)

    // Before any JavaScript bundle runs (blocked here), the inline pre-paint
    // script alone already shows the filtered list.
    const noJs = await browser.newContext()
    try {
      const raw = await noJs.newPage()
      await raw.route(/\/_next\/static\/chunks\//, (route) => route.abort())
      await raw.goto(`/blog?tag=${slug}`, { waitUntil: 'load' })
      await expect(raw.locator('#tag-filter-prepaint')).toHaveCount(1)
      await expect(raw.locator('[data-tag-item]:visible')).toHaveCount(expected)
    } finally {
      await noJs.close()
    }
  })

  test('posts and case studies end with the author card and a share row; tags link to the filtered list', async ({ page, context }) => {
    const posts = await list(page, 'blog')
    test.skip(posts.length === 0, 'no published posts (empty store)')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const path = posts[0].permalink ? new URL(posts[0].permalink, 'http://x').pathname : `/blog/${posts[0].slug}`
    await page.goto(path, { waitUntil: 'load' })
    const author = page.locator('section[aria-labelledby="author-heading"]')
    await expect(author.getByRole('heading', { name: 'Written by' })).toBeVisible()
    await expect(author.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact')
    await expect(author.getByRole('link', { name: /View CV/ })).toHaveAttribute('href', /^\/cv(\/zh)?$/)

    const share = page.getByRole('group', { name: 'Share' })
    await share.getByRole('button', { name: 'Copy link' }).click()
    await expect(share.getByRole('button', { name: 'Copied' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`${path.replace(/[/]/g, '\\/')}$`))
    await expect(share.getByRole('link', { name: /LinkedIn/ })).toHaveAttribute('href', /^https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=https%3A%2F%2F/)

    const wechat = share.getByRole('button', { name: 'WeChat' })
    await expect(wechat).toHaveAttribute('aria-expanded', 'false')
    await wechat.click()
    await expect(wechat).toHaveAttribute('aria-expanded', 'true')
    const qr = page.getByRole('img', { name: /^QR code of https:\/\// })
    await expect(qr).toBeVisible()
    expect(await qr.locator('svg path').count()).toBeGreaterThan(0)

    const tag = page.locator('ul[aria-label="Tags"] a').first()
    if (await tag.count()) {
      await tag.click()
      await expect(page).toHaveURL(/\/blog\?tag=/)
      await expect(page.getByRole('group', { name: 'Filter posts by tag' }).getByRole('button', { pressed: true })).toBeVisible()
    }
  })

  test('a video in an article requests nothing from YouTube or Vimeo until play is pressed', async ({ page }) => {
    const items = [...(await list(page, 'work')).map((w) => `/work/${w.slug}`), ...(await list(page, 'blog')).map((p) => `/blog/${p.slug}`)]
    let found = ''
    for (const p of items) {
      const html = await (await page.request.get(p)).text()
      if (/class="[^"]*video-embed/.test(html)) {
        found = p
        break
      }
    }
    test.skip(!found, 'no article with a video')
    const hits = watchVideoRequests(page)
    await page.goto(found, { waitUntil: 'networkidle' })
    const facade = page.locator('.video-embed').first()
    await facade.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    expect(hits, 'third-party video requests before play').toEqual([])
    const poster = facade.locator('img')
    if (await poster.count()) expect(new URL((await poster.getAttribute('src')) || '', page.url()).origin).toBe(new URL(page.url()).origin)
    await expect(facade.locator('figcaption')).toContainText('only when you press play')
  })

  test('/colophon discloses the click-to-load players', async ({ page }) => {
    await page.goto('/colophon')
    await expect(page.locator('#privacy')).toContainText('Videos in articles are click-to-load')
  })
})

test.describe('reading-work: authored content', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')

  const adminFetch = (page: Page, method: string, url: string, body?: unknown) =>
    page.evaluate(
      async ([m, u, b]) => {
        const res = await fetch(u as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })
        return { status: res.status, text: await res.text() }
      },
      [method, url, body] as const,
    )

  const BODY = [
    'An opening paragraph that is long enough to be the excerpt of this end-to-end case study.',
    '',
    '> [!NOTE]',
    '> Notes like this one are callouts.',
    '',
    '> [!WARNING]',
    '> And this is a warning.',
    '',
    '> [!TIP]',
    '> A tip.',
    '',
    '> [!IMPORTANT]',
    '> Something important.',
    '',
    '> [!CAUTION]',
    '> A caution.',
    '',
    '## Gallery',
    '',
    '![A mountain range](/images/hero/hero-mountains-1600.webp)',
    '',
    '![A portrait](/images/hikoAvator.png)',
    '',
    '![A team at a science park](/images/imageScroller/wegreenAI_hkstp.jpeg)',
    '',
    '## Wide',
    '',
    'Text before the wide figure.[^1]',
    '',
    '![The mountains, wide](/images/hero/hero-mountains-1600.webp#full)',
    '',
    '<details>',
    '<summary>Deep dive</summary>',
    '',
    'Hidden details.',
    '',
    '</details>',
    '',
    'https://www.youtube.com/watch?v=jkAqK3vqILI',
    '',
    '[^1]: A footnote.',
  ].join('\n')

  test('a draft case study renders At a glance, callouts, a gallery, a full-width figure, footnotes and a click-to-load video', async ({ page }) => {
    await loginAsAdmin(page)
    const slug = `e2e-reading-${Date.now()}`
    const created = await adminFetch(page, 'PUT', '/api/admin/work', {
      slug,
      create: true,
      frontmatter: {
        title: 'E2E reading check',
        description: 'Created by the reading-work end-to-end suite to check the article features; deleted afterwards.',
        status: 'case-study',
        draft: true,
        summary: 'Every reading feature renders on one page.',
        outcomes: [
          { value: '93.59', unit: '%', label: 'Offline classifier accuracy', source: 'Labelled run', sourceUrl: '#gallery' },
          { value: '61', unit: 'ms', label: 'Recognition time' },
        ],
        team: 'Solo',
        published: '2026-05-30',
        tech: ['E2E stack'],
      },
      body: BODY,
    })
    expect(created.status, created.text).toBe(200)
    try {
      const hits = watchVideoRequests(page)
      await page.goto(`/api/admin/draft?path=${encodeURIComponent(`/work/${slug}`)}`)
      await expect(page).toHaveURL(new RegExp(`/work/${slug}$`))
      await settle(page)

      const glance = page.locator('section[aria-labelledby="glance-heading"]')
      await expect(glance).toContainText('Every reading feature renders on one page.')
      await expect(glance.locator('dt')).toHaveText(['Offline classifier accuracy', 'Recognition time'])
      await expect(glance.locator('dd').first()).toHaveText('93.59%')
      await expect(page.locator('dl').filter({ hasText: 'Published' })).toContainText('May 30, 2026')

      await expect(page.locator('[role="note"][data-callout="note"]')).toContainText('Note')
      await expect(page.locator('[role="note"][data-callout="warning"]')).toContainText('Warning')

      const gallery = page.locator('figure.article-gallery')
      await expect(gallery).toHaveCount(1)
      await expect(gallery.locator('.gallery-row')).toHaveCount(2)
      // Cells of the two-image row share one height.
      const heights = await gallery.locator('.gallery-row').nth(1).locator('img').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
      expect(Math.abs(heights[0] - heights[1])).toBeLessThanOrEqual(1)
      await gallery.locator('button.zoomable').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')

      // Below xl there is no outline rail: the full-width figure is wider than the 68ch text.
      await page.setViewportSize({ width: 1100, height: 800 })
      const full = page.locator('figure[data-width="full"]')
      await expect(full).toHaveCount(1)
      await full.scrollIntoViewIfNeeded()
      const prose = await page.locator('.article-prose').first().boundingBox()
      const fig = await full.boundingBox()
      expect(fig!.width).toBeGreaterThan(prose!.width + 100)
      expect(Math.round(fig!.x)).toBe(Math.round(prose!.x))
      await page.setViewportSize({ width: 1280, height: 800 })

      await expect(page.locator('a[data-footnote-ref]')).toHaveCount(1)
      await page.getByText('Deep dive').click()
      await expect(page.getByText('Hidden details.')).toBeVisible()

      const facade = page.locator('.video-embed')
      await facade.scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      expect(hits, 'no third-party video requests before play').toEqual([])
      await page.route(/youtube-nocookie\.com/, (route) => route.abort())
      await facade.getByRole('button', { name: /^Play video/ }).click()
      const frame = facade.locator('iframe')
      await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/jkAqK3vqILI\?autoplay=1/)
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME')

      expect(await seriousA11yViolations(page)).toEqual([])
      await page.emulateMedia({ colorScheme: 'light' })
      await page.evaluate(() => {
        localStorage.setItem('chakra-ui-color-mode', 'light')
      })
      await page.reload()
      await settle(page)
      expect(await seriousA11yViolations(page), 'light theme').toEqual([])

      await page.setViewportSize({ width: 375, height: 812 })
      await page.reload()
      await settle(page)
      const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
      expect(widths.scroll).toBeLessThanOrEqual(widths.inner)
      // Full width on a phone: the figure reaches both screen edges.
      const phoneFig = await page.locator('figure[data-width="full"]').boundingBox()
      expect(Math.round(phoneFig!.x)).toBe(0)
      expect(Math.round(phoneFig!.width)).toBe(375)
    } finally {
      await adminFetch(page, 'DELETE', `/api/admin/work?slug=${slug}`)
    }
  })

  test('a post names its case study; the case-study editor offers the documented template and the checklist follows it', async ({ page }) => {
    await loginAsAdmin(page)
    const stamp = Date.now()
    const work = `e2e-study-${stamp}`
    const post = `e2e-post-${stamp}`
    const madeWork = await adminFetch(page, 'PUT', '/api/admin/work', {
      slug: work,
      create: true,
      frontmatter: { title: 'E2E linked study', description: 'Created by the reading-work end-to-end suite; deleted afterwards.', status: 'case-study' },
      body: 'Body of the linked study.',
    })
    expect(madeWork.status, madeWork.text).toBe(200)
    try {
      const madePost = await adminFetch(page, 'PUT', '/api/admin/posts', {
        slug: post,
        create: true,
        frontmatter: { title: 'E2E linked post', date: '2026-05-30', description: 'Created by the reading-work end-to-end suite; deleted afterwards.', draft: true, project: work },
        body: 'Body of the linked post.',
      })
      expect(madePost.status, madePost.text).toBe(200)

      await page.goto(`/admin/blog/edit?slug=${post}`)
      await expect(page.getByLabel('Case study')).toHaveValue(work)

      await page.goto(`/api/admin/draft?path=${encodeURIComponent(`/blog/${post}`)}`)
      await expect(page).toHaveURL(new RegExp(`/blog/${post}$`))
      const meta = page.locator('dl').filter({ hasText: 'Case study' })
      await expect(meta.getByRole('link', { name: 'E2E linked study' })).toHaveAttribute('href', `/work/${work}`)
      await expect(page.locator('section[aria-labelledby="related-heading"]').getByRole('link', { name: /E2E linked study/ })).toBeVisible()

      // A new case study starts from the documented template.
      await page.goto('/admin/work/edit')
      const card = page.locator('section[aria-labelledby="cs-template-heading"]')
      await expect(card).toBeVisible()
      await card.getByRole('button', { name: 'Use the template' }).click()
      await expect(card).toHaveCount(0)
      await expect(page.getByRole('tab', { name: 'MDX' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('textarea').first()).toHaveValue(/## The problem\n\n\{\/\* Case-study template:/)
      await page.getByLabel(/^title\b/i).fill('E2E template check')
      await page.getByRole('button', { name: 'Publish…' }).click()
      const sheet = page.getByRole('dialog')
      await expect(sheet).toContainText('No outcome summary')
      await expect(sheet).toContainText('6 template notes left in the body')
      await expect(sheet).toContainText('Section “The problem” is empty')
      await page.keyboard.press('Escape')
    } finally {
      await adminFetch(page, 'DELETE', `/api/admin/posts?slug=${post}`)
      await adminFetch(page, 'DELETE', `/api/admin/work?slug=${work}`)
    }
  })

  test('the case-study editor edits metrics and the cover focal point', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/work/edit')
    await page.getByRole('button', { name: 'Add metric' }).click()
    await page.getByLabel('Metric 1 — value').fill('93.59')
    await page.getByLabel('Metric 1 — unit').fill('%')
    await page.getByLabel('Metric 1 — what was measured').fill('Accuracy')
    await expect(page.getByText('Reads: 93.59% · Accuracy')).toBeVisible()
    await page.getByRole('button', { name: 'Add metric' }).click()
    await page.getByLabel('Metric 2 — value').fill('61')
    await expect(page.getByText('Add both a value and a label — incomplete rows are not shown.')).toBeVisible()
    await page.getByRole('button', { name: 'Move metric 2 up' }).click()
    await expect(page.getByLabel('Metric 1 — value')).toHaveValue('61')
    await page.getByRole('button', { name: 'Remove metric 1' }).click()
    await expect(page.getByLabel('Metric 1 — value')).toHaveValue('93.59')

    await page.getByLabel('Cover image').fill('/images/hero/hero-mountains-1600.webp')
    const marker = page.getByRole('button', { name: /^Focal point 50% from the left, 50% from the top/ })
    await expect(marker).toBeVisible()
    await marker.focus()
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('button', { name: /^Focal point 40% from the left, 49% from the top/ })).toBeVisible()
    await expect(page.getByText(/1600 × 1067 px/)).toBeVisible()
  })
})
