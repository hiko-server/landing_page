import type { APIRequestContext, Locator, Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, seriousA11yViolations, settle, undersizedTargets } from './fixtures'

/**
 * search-ask (F4 / J1): Chinese and natural-language site search, and
 * "Ask Lucian" — answers quoted from the site's own pages, with sources.
 *
 * The public tests run on any store: with an empty one (CI) they check the
 * honest "nothing here" path, the contact handoff, the entry points and the
 * accessibility of the Ask view; with content (local, after a deploy) they
 * also derive questions and searches from the served index and follow a
 * citation to its quote. The @admin test adds a synthetic CV entry, finds it
 * through Ask in both languages, hides it (gone from the answers) and
 * restores the CV it started from.
 */

type AskIndex = {
  sources: Array<{ url: string; page: string; kind: string; lang: string; topic?: string }>
  passages: Array<{ t: string; s: number; f?: unknown; m?: number }>
}
type IndexBody = { docs: Array<{ kind: string; title: string; href: string; lang?: string }>; ask?: AskIndex }

async function fetchIndex(request: APIRequestContext): Promise<IndexBody> {
  return (await (await request.get('/api/search-index')).json()) as IndexBody
}

async function openPalette(page: Page): Promise<{ dialog: Locator; input: Locator }> {
  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('ControlOrMeta+KeyK')
  const dialog = page.getByRole('dialog', { name: 'Command palette' })
  const input = dialog.getByRole('combobox')
  await expect(input).toBeFocused()
  return { dialog, input }
}

async function openAsk(page: Page): Promise<{ dialog: Locator; input: Locator }> {
  const p = await openPalette(page)
  await p.dialog.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(p.dialog.getByRole('button', { name: 'Ask', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(p.input).toBeFocused()
  return p
}

/** A word of a passage that few other passages contain (a question about it has an answer). */
function distinctiveWord(index: AskIndex, pick: (p: AskIndex['passages'][number]) => boolean): { word: string; passage: AskIndex['passages'][number] } | null {
  const stop = new Set(['about', 'their', 'there', 'which', 'would', 'these', 'those', 'while', 'where', 'other', 'using', 'with', 'from'])
  for (const passage of index.passages.filter(pick)) {
    const words = (passage.t.match(/[A-Za-z]{6,}/g) || []).filter((w) => !stop.has(w.toLowerCase()))
    for (const word of words) {
      const n = index.passages.filter((p) => p.t.toLowerCase().includes(word.toLowerCase())).length
      if (n <= 2) return { word, passage }
    }
  }
  return null
}

test.describe('Ask Lucian (J1)', () => {
  test('Search ↔ Ask: the mode switch, an honest "no answer", and the question handed to the contact form', async ({ page }) => {
    await page.goto('/')
    const { dialog, input } = await openAsk(page)
    await expect(input).toHaveAttribute('placeholder', /Ask about/)
    await expect(dialog.getByText(/Nothing is generated/)).toBeVisible()

    const question = 'Does he collect zqxw stamps?'
    await input.fill(question)
    await expect(dialog.getByText('Nothing on this site answers that yet.')).toBeVisible()
    await settle(page)
    // The live region says it (aria-live polite), and nothing is quoted.
    await expect(dialog.getByRole('status')).toHaveText('No answer on this site')
    await expect(dialog.getByRole('listbox').getByRole('group')).toHaveCount(0)
    const direct = dialog.getByRole('option', { name: /Ask Lucian directly/ })
    await expect(direct).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.getByRole('option', { name: `Search the site for “${question}”` })).toBeVisible()
    expect(await seriousA11yViolations(page)).toEqual([])

    // ↵ on "Ask Lucian directly": the contact form opens with the question as its message — nothing in the URL.
    await page.keyboard.press('Enter')
    await page.waitForURL((url) => url.pathname === '/contact')
    expect(page.url()).not.toContain('zqxw')
    await expect(page.getByRole('textbox', { name: /^Message/ })).toHaveValue(question)
  })

  test('the keyboard: ↑ ↓ move through the options, Backspace on an empty question returns to Search', async ({ page }) => {
    await page.goto('/')
    const { dialog, input } = await openAsk(page)
    await input.fill('zqxw unknown thing?')
    await expect(dialog.getByRole('option')).toHaveCount(2)
    await page.keyboard.press('ArrowDown')
    const second = dialog.getByRole('option').nth(1)
    await expect(second).toHaveAttribute('aria-selected', 'true')
    await expect(input).toHaveAttribute('aria-activedescendant', (await second.getAttribute('id')) as string)
    // "Search the site for …" switches back to Search with the same words.
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('button', { name: 'Search', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(input).toHaveValue('zqxw unknown thing?')
    // A question typed in Search offers "Ask" first.
    await expect(dialog.getByRole('option').first()).toContainText('Ask: zqxw unknown thing?')
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('button', { name: 'Ask', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await input.fill('')
    await page.keyboard.press('Backspace')
    await expect(dialog.getByRole('button', { name: 'Search', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('a question about the site is answered with quotes and sources; a citation opens its quote', async ({ page, request }) => {
    const index = await fetchIndex(request)
    const ask = index.ask
    test.skip(!ask || !ask.passages.length, 'the store has no public content')
    const found = distinctiveWord(ask!, (p) => p.f !== undefined && !p.m && !!ask!.sources[p.s]?.url.startsWith('/cv#'))
    test.skip(!found, 'no distinctive CV line')
    const { word, passage } = found!
    const source = ask!.sources[passage.s]

    await page.goto('/')
    const { dialog, input } = await openAsk(page)
    await input.fill(`What about ${word}?`)
    const quote = dialog.getByRole('option').filter({ hasText: passage.t.slice(0, 40) }).first()
    await expect(quote).toBeVisible()
    await expect(dialog.getByRole('status')).toHaveText(/quotes? from \d+ sources?/)
    // The matched word is marked, the quote links to its passage with a text fragment, the source is a chip.
    await expect(quote.locator('mark').first()).toBeVisible()
    const href = (await quote.getAttribute('href')) as string
    expect(href.startsWith(source.url)).toBe(true)
    expect(href).toContain(':~:text=')
    await expect(dialog.getByRole('listbox').getByRole('group').first()).toBeVisible()
    await settle(page)
    expect(await seriousA11yViolations(page)).toEqual([])
    expect(await undersizedTargets(page)).toEqual([])

    // Open it: a full navigation to the CV (the browser highlights the quote).
    await quote.hover()
    await page.keyboard.press('Enter')
    await page.waitForURL((url) => url.pathname === '/cv')
    await settle(page)
    await expect(page.getByText(passage.t.slice(0, 40)).filter({ visible: true }).first()).toBeVisible()
  })

  test('on the page it cites, a quote is scrolled to and marked in place', async ({ page, request }) => {
    const index = await fetchIndex(request)
    const ask = index.ask
    test.skip(!ask || !ask.passages.length, 'the store has no public content')
    const found = distinctiveWord(ask!, (p) => p.f !== undefined && !p.m && !!ask!.sources[p.s]?.url.startsWith('/cv#'))
    test.skip(!found, 'no distinctive CV line')
    await page.goto('/cv')
    const { dialog, input } = await openAsk(page)
    await input.fill(`What about ${found!.word}?`)
    const quote = dialog.getByRole('option').filter({ hasText: found!.passage.t.slice(0, 40) }).first()
    await quote.click()
    await expect(dialog).toBeHidden()
    expect(new URL(page.url()).pathname).toBe('/cv')
    await expect.poll(() => page.evaluate(() => (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.has('cited-quote') ?? false)).toBe(true)
  })

  test('suggested questions are ones the site answers, in both languages', async ({ page, request }) => {
    const index = await fetchIndex(request)
    test.skip(!index.ask || !index.ask.passages.length, 'the store has no public content')
    await page.goto('/')
    const { dialog } = await openAsk(page)
    const suggestions = dialog.getByRole('listbox', { name: 'Try asking' }).getByRole('option')
    const n = await suggestions.count()
    test.skip(n === 0, 'no suggested question is answered by this content')
    await suggestions.first().click()
    await expect(dialog.getByRole('status')).toHaveText(/quotes? from \d+ sources?|段原文/)
  })

  test('/about and /contact offer "Ask Lucian", which opens the palette in Ask mode', async ({ page }) => {
    for (const path of ['/contact', '/about']) {
      await page.goto(path)
      const entry = page.getByRole('region', { name: 'Ask Lucian' })
      if (path === '/about' && !(await entry.count())) continue // no CV or bio to quote yet
      await expect(entry).toBeVisible()
      await expect(entry.getByText('问问 Lucian')).toHaveAttribute('lang', 'zh-Hans')
      await entry.getByRole('button', { name: 'Ask a question…' }).click()
      const dialog = page.getByRole('dialog', { name: 'Command palette' })
      await expect(dialog.getByRole('button', { name: 'Ask', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(dialog.getByRole('combobox')).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(entry.getByRole('button', { name: 'Ask a question…' })).toBeFocused()
    }
  })
})

test.describe('Ask Lucian under reduced motion and on a phone', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 375, height: 812 } })

  test('the answer appears at once (no reveal animation) and the palette never scrolls sideways', async ({ page, request }) => {
    const index = await fetchIndex(request)
    await page.goto('/')
    const { dialog, input } = await openAsk(page)
    const found = index.ask ? distinctiveWord(index.ask, (p) => !p.m) : null
    await input.fill(found ? `What about ${found.word}?` : 'zqxw?')
    await expect(dialog.getByRole('status')).not.toHaveText('Loading the site’s passages')
    await expect(dialog.getByRole('option').first()).toBeVisible()
    // The reveal never runs: every answer part is there at once, fully opaque.
    const reveal = await dialog.evaluate((el) =>
      Array.from(el.querySelectorAll('.ask-reveal')).map((n) => [getComputedStyle(n).animationName, getComputedStyle(n).opacity, n.getAnimations().length]),
    )
    for (const [name, opacity, running] of reveal) expect([name, opacity, running]).toEqual(['none', '1', 0])
    const overflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    // The mode switch keeps its names when the labels are icons only.
    await expect(dialog.getByRole('button', { name: 'Search', exact: true })).toBeVisible()
  })
})

test.describe('CJK and natural-language search (F4)', () => {
  test('a Chinese word finds the Chinese CV, with the match marked', async ({ page, request }) => {
    const index = await fetchIndex(request)
    const zh = index.docs.find((d) => d.kind === 'cv' && /^zh/.test(d.lang || '') && /[一-鿿]{2}/.test(d.title))
    test.skip(!zh, 'no Chinese CV entry')
    const word = (zh!.title.match(/[一-鿿]{2}/) as RegExpMatchArray)[0]
    await page.goto('/')
    const { dialog, input } = await openPalette(page)
    await input.fill(word)
    const hit = dialog.getByRole('option').filter({ hasText: zh!.title }).first()
    await expect(hit).toBeVisible()
    await expect(hit.locator('mark').first()).toHaveText(new RegExp(word))
    await expect(hit).toContainText('中文')
  })

  test('a question in Search drops its question words and still finds the entry', async ({ page, request }) => {
    const index = await fetchIndex(request)
    const cv = index.docs.find((d) => d.kind === 'cv' && (d.lang || 'en') === 'en' && /^[A-Za-z]{6,}/.test(d.title))
    test.skip(!cv, 'no English CV entry')
    const word = (cv!.title.match(/^[A-Za-z]{6,}/) as RegExpMatchArray)[0]
    await page.goto('/')
    const { dialog, input } = await openPalette(page)
    await input.fill(`Does he have ${word}?`)
    await expect(dialog.getByRole('option').filter({ hasText: cv!.title }).first()).toBeVisible()
    await expect(dialog.getByRole('option').first()).toContainText(`Ask: Does he have ${word}?`)
  })

  test('the 404 suggestions mark what matched', async ({ page, request }) => {
    const index = await fetchIndex(request)
    const cv = index.docs.find((d) => d.kind === 'cv' && /^[A-Za-z]{6,}\b/.test(d.title))
    test.skip(!cv, 'no CV entry')
    const word = (cv!.title.match(/^[A-Za-z]{6,}/) as RegExpMatchArray)[0].toLowerCase()
    expect((await page.goto(`/${word}`))?.status()).toBe(404)
    const region = page.getByRole('region', { name: 'Did you mean' })
    await expect(region.locator('mark').first()).toBeVisible()
  })
})

type CvDoc = { en: any[]; zh: any[] }

test.describe('Ask follows CV saves', { tag: '@admin' }, () => {
  test.skip(!ADMIN.email || !ADMIN.password, 'ADMIN_EMAIL / ADMIN_PASS not set')
  test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 })

  test('a new CV line is answered (EN and 中文) right after the save, and disappears when hidden', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    const adminFetch = (method: string, url: string, body?: unknown) =>
      page.evaluate(
        async ([m, u, b]) => {
          const res = await fetch(u as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })
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
    }
    const stamp = Date.now().toString(36)
    const EN = `Zephyrine${stamp} certification of the example kind`
    const ZH = `泽菲琳${stamp}示例认证`
    const add = (sections: any[], name: string): any[] => {
      const cert = { issuingOrganization: 'Example Board', CertificationList: [{ certificationName: name, issuedDate: '2026-01' }] }
      const at = sections.findIndex((s) => s?.sessionName === 'certification')
      if (at < 0) return [...sections, { sessionName: 'certification', certifications: [cert] }]
      return sections.map((s, i) => (i === at ? { ...s, certifications: [...(Array.isArray(s.certifications) ? s.certifications : []), cert] } : s))
    }
    const withEntry: CvDoc = { en: add(original.en, EN), zh: add(original.zh, ZH) }
    try {
      await writeCv(withEntry)
      await page.goto('/')
      let p = await openAsk(page)
      await p.input.fill(`Does he hold the Zephyrine${stamp} certification?`)
      await expect(p.dialog.getByRole('option').filter({ hasText: `Zephyrine${stamp}` }).first()).toBeVisible()
      await p.input.fill(`他有泽菲琳${stamp}示例认证吗？`)
      await expect(p.dialog.getByRole('option').filter({ hasText: `泽菲琳${stamp}` }).first()).toBeVisible()
      await page.keyboard.press('Escape')

      // Hidden in CV Studio's data: gone from the next index.
      const hide = (sections: any[]) =>
        sections.map((s) =>
          s?.sessionName === 'certification'
            ? { ...s, certifications: s.certifications.map((c: any) => (c.CertificationList?.[0]?.certificationName === EN || c.CertificationList?.[0]?.certificationName === ZH ? { ...c, isVisible: false } : c)) }
            : s,
        )
      await writeCv({ en: hide(withEntry.en), zh: hide(withEntry.zh) })
      await page.goto('/')
      p = await openAsk(page)
      await p.input.fill(`Does he hold the Zephyrine${stamp} certification?`)
      await expect(p.dialog.getByText('Nothing on this site answers that yet.')).toBeVisible()
      expect(await (await page.request.get('/api/search-index')).text()).not.toContain(`Zephyrine${stamp}`)
    } finally {
      await writeCv(original)
    }
  })
})
