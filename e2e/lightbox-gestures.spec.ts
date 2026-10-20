import { devices, type Browser, type Page } from '@playwright/test'
import { test, expect, ADMIN, loginAsAdmin, settle, seriousA11yViolations } from './fixtures'

/**
 * C3 — Lightbox gestures 2.0 (components/Common/Lightbox.tsx and
 * lightboxEngine.ts): the open / close morph out of and back into the tile,
 * keyboard, mouse, wheel, touch (swipe, double tap, pinch, drag to close,
 * pan into the next image), focus, reduced motion.
 *
 * Public tests use the home page's Field Notes and skip without them (the
 * CI store is empty); the @admin test writes a synthetic draft article with
 * three tracked images, looks at it in Draft Mode on a desktop and on a
 * touch phone, and deletes it again.
 *
 * Touch input: Chromium gets real multi-touch through the DevTools protocol
 * (touch-action and pointer capture apply as on a phone); other engines,
 * which have no multi-touch input API, get the same gestures as pointer
 * events dispatched to the viewer's stage.
 */

// Pixel 7 emulation (its defaultBrowserType cannot be set inside a describe).
const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7']
const PIXEL = { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }

type View = { scale: number; x: number; y: number; track: number; overlay: number; counter: string; cx: number; cy: number }

async function view(page: Page): Promise<View> {
  return page.evaluate(() => {
    const matrix = (el: Element | null) => {
      const t = el ? getComputedStyle(el).transform : 'none'
      return t && t !== 'none' ? new DOMMatrixReadOnly(t) : new DOMMatrixReadOnly()
    }
    const layer = Array.from(document.querySelectorAll('.lightbox-layer')).find((l) => !l.closest('[aria-hidden="true"]')) ?? null
    const m = matrix(layer)
    const r = layer?.getBoundingClientRect()
    const overlay = document.querySelector('.chakra-modal__overlay')
    return {
      scale: m.a,
      x: m.e,
      y: m.f,
      track: matrix(document.querySelector('.lightbox-stage > div')).e,
      overlay: overlay ? Number(getComputedStyle(overlay).opacity) : 0,
      counter: document.querySelector('.lightbox-counter')?.textContent ?? '',
      cx: r ? r.left + r.width / 2 : 0,
      cy: r ? r.top + r.height / 2 : 0,
    }
  })
}

/** Waits until nothing in the viewer moves (springs, momentum, morphs). */
async function idle(page: Page): Promise<void> {
  await expect(page.locator('.lightbox-stage')).toHaveAttribute('data-motion', 'idle')
}

/**
 * Records, on every animation frame from now on, the current image's scale
 * and the strip's offset (the morph's first frames; no glide under reduced
 * motion).
 */
async function recordScales(page: Page, frames = 40): Promise<void> {
  await page.evaluate((max) => {
    const w = window as unknown as { __lbScales: number[]; __lbTrack: number[] }
    w.__lbScales = []
    w.__lbTrack = []
    const loop = () => {
      const layer = Array.from(document.querySelectorAll('.lightbox-layer')).find((l) => !l.closest('[aria-hidden="true"]'))
      if (layer) {
        const t = getComputedStyle(layer).transform
        w.__lbScales.push(t && t !== 'none' ? Math.round(new DOMMatrixReadOnly(t).a * 1000) / 1000 : 1)
        const track = document.querySelector('.lightbox-stage > div')
        const m = track ? getComputedStyle(track).transform : 'none'
        w.__lbTrack.push(m && m !== 'none' ? Math.round(new DOMMatrixReadOnly(m).e) : 0)
      }
      if (w.__lbScales.length < max) requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }, frames)
}

const recordedScales = (page: Page) => page.evaluate(() => (window as unknown as { __lbScales: number[] }).__lbScales)
const recordedTrack = (page: Page) => page.evaluate(() => (window as unknown as { __lbTrack: number[] }).__lbTrack)

/** The home page's Field Notes tiles (null when this store has fewer than two photos). */
async function fieldNotes(page: Page) {
  await page.goto('/', { waitUntil: 'load' })
  const section = page.locator('#section-photos')
  if (!(await section.count())) return null
  await section.scrollIntoViewIfNeeded()
  const tiles = section.locator('.field-notes-strip button')
  await tiles.first().waitFor()
  const count = await tiles.count()
  if (count < 2) return null
  await settle(page)
  return { tiles, count }
}

type Point = { x: number; y: number }

/** Touch input (see the header): `start` / `move` with every finger down, `end` lifts them all. */
async function fingers(page: Page, browserName: string) {
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page)
    const send = (type: string, points: Point[]) =>
      cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) })
    return { start: (p: Point[]) => send('touchStart', p), move: (p: Point[]) => send('touchMove', p), end: () => send('touchEnd', []) }
  }
  let down: Point[] = []
  const fire = (type: string, points: Point[]) =>
    page.evaluate(
      ([kind, list]) => {
        const stage = document.querySelector('.lightbox-stage')
        list.forEach((p, id) =>
          stage?.dispatchEvent(
            new PointerEvent(kind, { pointerId: 40 + id, pointerType: 'touch', isPrimary: id === 0, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, buttons: kind === 'pointerup' ? 0 : 1 }),
          ),
        )
      },
      [type, points] as const,
    )
  return {
    start: async (p: Point[]) => {
      down = p
      await fire('pointerdown', p)
    },
    move: async (p: Point[]) => {
      down = p
      await fire('pointermove', p)
    },
    end: async () => {
      await fire('pointerup', down)
      down = []
    },
  }
}

type Fingers = Awaited<ReturnType<typeof fingers>>

/** One finger from `a` to `b` in `steps` moves `ms` apart, optionally resting before it lifts. */
async function drag(page: Page, f: Fingers, a: Point, b: Point, steps = 8, ms = 16, rest = 0): Promise<void> {
  await f.start([a])
  for (let i = 1; i <= steps; i++) {
    if (i > 1) await page.waitForTimeout(ms)
    await f.move([{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }])
  }
  // A flick lifts right after its last move; a held drag rests first.
  if (rest) await page.waitForTimeout(rest)
  await f.end()
}

async function doubleTap(page: Page, f: Fingers, p: Point): Promise<void> {
  await f.start([p])
  await f.end()
  await page.waitForTimeout(60)
  await f.start([p])
  await f.end()
}

/** Two fingers around `c`, from `from` px apart to `to` px apart (horizontal). */
async function pinch(page: Page, f: Fingers, c: Point, from: number, to: number, steps = 8): Promise<void> {
  const at = (d: number) => [
    { x: c.x - d / 2, y: c.y },
    { x: c.x + d / 2, y: c.y },
  ]
  await f.start(at(from))
  for (let i = 1; i <= steps; i++) {
    await f.move(at(from + ((to - from) * i) / steps))
    await page.waitForTimeout(16)
  }
  await f.end()
}

const pageZoom = (page: Page) => page.evaluate(() => window.visualViewport?.scale ?? 1)

/**
 * Where a click, a double tap or the zoom button takes the image on screen
 * (lib/lightboxGestures zoomInScale): 2.5× or enough to fill the stage, but
 * never past one file pixel per CSS pixel; `zoomable` is false when the
 * image is already shown at (about) its file's size (VISU-5).
 */
async function oneShot(page: Page): Promise<{ zoomable: boolean; scale: number }> {
  return page.evaluate(() => {
    const layer = Array.from(document.querySelectorAll<HTMLElement>('.lightbox-layer')).find((l) => !l.closest('[aria-hidden="true"]'))!
    const img = layer.querySelector<HTMLImageElement>('img:not([aria-hidden])')!
    const widths = [img.getAttribute('srcset'), img.closest('picture')?.querySelector('source')?.getAttribute('srcset')].flatMap((s) =>
      Array.from((s || '').matchAll(/\s(\d+)w(?=\s*(?:,|$))/g), (m) => Number(m[1])),
    )
    const source = widths.length ? Math.max(...widths) : Number(img.getAttribute('width')) || img.naturalWidth
    const stage = document.querySelector('.lightbox-stage')!.getBoundingClientRect()
    const fill = Math.max(stage.width / layer.offsetWidth, stage.height / layer.offsetHeight)
    const native = source / layer.offsetWidth
    return { zoomable: native >= 1.2, scale: Math.min(Math.max(2.5, fill), 4, native) }
  })
}

/**
 * A narrow desktop window: a Field Notes photo is shown smaller than its
 * file, so a click and the zoom button have something to zoom to (at
 * 1280 × 800 an 800 px photo is shown at its full size and offers none),
 * and zoomed to its file's size it is wider than the window (so it pans).
 */
const NARROW_DESKTOP = { width: 600, height: 700 }

/** The image's fitted (unzoomed) size and the stage's. */
const sizes = (page: Page) =>
  page.evaluate(() => {
    const layer = Array.from(document.querySelectorAll<HTMLElement>('.lightbox-layer')).find((l) => !l.closest('[aria-hidden="true"]'))!
    const stage = document.querySelector('.lightbox-stage')!.getBoundingClientRect()
    return { w: layer.offsetWidth, h: layer.offsetHeight, stageW: stage.width, stageH: stage.height }
  })

// ── Desktop: morph, keyboard, mouse, wheel, focus ─────────────────────────

test.describe('lightbox gestures: desktop', () => {
  test('opens out of its tile and closes back into it; the tile hides meanwhile; focus returns to it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop pointer')
    const notes = await fieldNotes(page)
    test.skip(!notes, 'no Field Notes photos in this content store')
    const tile = notes!.tiles.nth(1)
    await tile.hover()
    await recordScales(page)
    await tile.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await idle(page)
    const scales = await recordedScales(page)
    expect(scales[0], 'the first frame is still the size of the tile').toBeLessThan(0.95)
    expect(scales.at(-1)).toBeCloseTo(1, 2)
    const v = await view(page)
    expect(v.counter).toBe(`2 / ${notes!.count}`)
    expect(v.overlay).toBe(1)
    // The tile's box is hidden while the viewer shows its photo (the picture moves, it is not duplicated).
    const box = tile.locator(':scope > div')
    await expect(box).toHaveCSS('visibility', 'hidden')
    await expect(page.getByRole('button', { name: 'Close image viewer' })).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(box).toHaveCSS('visibility', 'visible')
    await expect(tile).toBeFocused()
  })

  test('keyboard: ← → wrap, Home / End, + − 0 zoom with an announcement, arrows pan a zoomed image', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop keyboard')
    await page.setViewportSize(NARROW_DESKTOP)
    const notes = await fieldNotes(page)
    test.skip(!notes, 'no Field Notes photos in this content store')
    const n = notes!.count
    await notes!.tiles.first().click()
    await idle(page)
    const counter = page.locator('.lightbox-counter')
    await expect(counter).toHaveText(`1 / ${n}`)
    await page.keyboard.press('ArrowRight')
    await expect(counter).toHaveText(`2 / ${n}`)
    await idle(page)
    expect((await view(page)).track).toBe(0)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(counter).toHaveText(`${n} / ${n}`)
    await page.keyboard.press('Home')
    await expect(counter).toHaveText(`1 / ${n}`)
    await page.keyboard.press('End')
    await expect(counter).toHaveText(`${n} / ${n}`)
    await page.keyboard.press('Home')
    await idle(page)

    const status = page.getByRole('dialog').getByRole('status')
    await page.keyboard.press('+')
    await idle(page)
    expect((await view(page)).scale).toBeCloseTo(1.5, 2)
    await expect(status).toHaveText('Zoom 150%')
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible()
    await page.keyboard.press('=')
    await idle(page)
    const zoomed = await view(page)
    expect(zoomed.scale).toBeCloseTo(2.25, 2)
    // A zoomed image pans with the arrows instead of paging.
    await page.keyboard.press('ArrowLeft')
    await idle(page)
    const panned = await view(page)
    expect(panned.x).toBeGreaterThan(zoomed.x + 20)
    expect(panned.counter).toBe(`1 / ${n}`)
    await page.keyboard.press('0')
    await idle(page)
    expect((await view(page)).scale).toBe(1)
    await expect(status).toHaveText('Zoom 100%')
    await page.keyboard.press('-')
    await idle(page)
    expect((await view(page)).scale).toBe(1)
    // The zoom button does the same — as far as the file has pixels.
    const shot = await oneShot(page)
    test.skip(!shot.zoomable, 'this store\'s first photo is not larger than it is shown here')
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await idle(page)
    expect((await view(page)).scale).toBeCloseTo(shot.scale, 2)
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await idle(page)
    expect((await view(page)).scale).toBe(1)
  })

  test('mouse: a click zooms at the pointer (as far as the file has pixels), a double click is one zoom, dragging pans, the wheel zooms at the pointer, a click beside the image closes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop pointer')
    await page.setViewportSize(NARROW_DESKTOP)
    const notes = await fieldNotes(page)
    test.skip(!notes, 'no Field Notes photos in this content store')
    await notes!.tiles.first().click()
    await idle(page)
    const fitted = await view(page)
    const shot = await oneShot(page)
    test.skip(!shot.zoomable, 'this store\'s first photo is not larger than it is shown here')
    const p = { x: fitted.cx + 40, y: fitted.cy + 20 }

    await page.mouse.click(p.x, p.y)
    await idle(page)
    let v = await view(page)
    expect(v.scale).toBeCloseTo(shot.scale, 2)
    // The point under the pointer stayed under it (along each axis where the zoomed photo is larger than the stage; where it fits it stays centred).
    const box = await sizes(page)
    if (box.w * v.scale > box.stageW + 1) expect(Math.abs(v.cx + 40 * v.scale - p.x)).toBeLessThan(2)
    if (box.h * v.scale > box.stageH + 1) expect(Math.abs(v.cy + 20 * v.scale - p.y)).toBeLessThan(2)
    expect(box.w * v.scale > box.stageW + 1 || box.h * v.scale > box.stageH + 1, 'zoomed past the stage on one axis at least').toBe(true)
    await page.mouse.click(p.x, p.y)
    await idle(page)
    expect((await view(page)).scale).toBe(1)

    await page.mouse.dblclick(fitted.cx, fitted.cy)
    await idle(page)
    v = await view(page)
    expect(v.scale, 'a double click zooms once (not in and straight back out)').toBeCloseTo(shot.scale, 2)

    // Drag to pan (slowly: no momentum to speak of) — magnified on purpose
    // (+ +: 2.25×) so the photo is wider than the window.
    await page.keyboard.press('0')
    await idle(page)
    await page.keyboard.press('+')
    await page.keyboard.press('+')
    await idle(page)
    v = await view(page)
    await page.mouse.move(fitted.cx, fitted.cy)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(fitted.cx - 20 * i, fitted.cy - 6 * i)
      await page.waitForTimeout(30)
    }
    await page.waitForTimeout(120)
    await page.mouse.up()
    await idle(page)
    const panned = await view(page)
    expect(panned.x).toBeLessThan(v.x - 60)
    expect(panned.counter).toBe(`1 / ${notes!.count}`)
    await page.keyboard.press('0')
    await idle(page)

    // The wheel zooms at the pointer; Ctrl + wheel (a trackpad pinch) too.
    await page.mouse.move(fitted.cx, fitted.cy)
    await page.mouse.wheel(0, -300)
    await idle(page)
    const wheeled = (await view(page)).scale
    expect(wheeled).toBeGreaterThan(1.3)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, 30)
    await page.keyboard.up('Control')
    await idle(page)
    expect((await view(page)).scale).toBeLessThan(wheeled)
    await page.keyboard.press('0')
    await idle(page)

    // Beside the fitted image: closes.
    await page.mouse.click(fitted.cx, 30)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await pageZoom(page)).toBe(1)
  })

  test('focus stays inside the viewer; the open viewer passes axe', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop keyboard')
    await page.setViewportSize(NARROW_DESKTOP)
    const notes = await fieldNotes(page)
    test.skip(!notes, 'no Field Notes photos in this content store')
    await notes!.tiles.first().focus()
    await page.keyboard.press('Enter')
    await idle(page)
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Close image viewer' })).toBeFocused()
    const seen = new Set<string>()
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      const where = await page.evaluate(() => ({ inside: !!document.activeElement?.closest('[role="dialog"]'), label: document.activeElement?.getAttribute('aria-label') || '' }))
      expect(where.inside, 'Tab never leaves the viewer').toBe(true)
      seen.add(where.label)
    }
    const { zoomable } = await oneShot(page)
    expect([...seen].sort()).toEqual(['Close image viewer', 'Next image', 'Previous image', ...(zoomable ? ['Zoom in'] : [])])
    expect(await seriousA11yViolations(page)).toEqual([])
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(notes!.tiles.first()).toBeFocused()
  })
})

// ── Touch ────────────────────────────────────────────────────────────────────

test.describe('lightbox gestures: touch', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation')
  test.use(PIXEL)

  test('swipe pages both ways and wraps; a slow short drag snaps back', async ({ page, browserName }) => {
    const notes = await fieldNotes(page)
    test.skip(!notes, 'no Field Notes photos in this content store')
    const n = notes!.count
    await notes!.tiles.first().tap()
    await idle(page)
    const f = await fingers(page, browserName)
    const c = await view(page)
    expect(c.counter).toBe(`1 / ${n}`)

    await drag(page, f, { x: c.cx + 120, y: c.cy }, { x: c.cx - 140, y: c.cy })
    await expect(page.locator('.lightbox-counter')).toHaveText(`2 / ${n}`)
    await idle(page)
    expect((await view(page)).track).toBe(0)
    await drag(page, f, { x: c.cx - 120, y: c.cy }, { x: c.cx + 140, y: c.cy })
    await expect(page.locator('.lightbox-counter')).toHaveText(`1 / ${n}`)
    await idle(page)
    await drag(page, f, { x: c.cx - 120, y: c.cy }, { x: c.cx + 140, y: c.cy })
    await expect(page.locator('.lightbox-counter')).toHaveText(`${n} / ${n}`)
    await idle(page)
    // Slow, short, held before lifting: back to where it was.
    await drag(page, f, { x: c.cx, y: c.cy }, { x: c.cx - 50, y: c.cy }, 5, 40, 150)
    await idle(page)
    const after = await view(page)
    expect(after.counter).toBe(`${n} / ${n}`)
    expect(after.track).toBe(0)
  })

  test('double tap zooms in at the finger and back out; pinch zooms the picture, never the page', async ({ page, browserName }) => {
    const notes = await fieldNotes(page)
    test.skip(!notes, 'no Field Notes photos in this content store')
    await notes!.tiles.first().tap()
    await idle(page)
    const f = await fingers(page, browserName)
    const c = await view(page)

    const shot = await oneShot(page)
    test.skip(!shot.zoomable, 'this store\'s first photo is not larger than a phone shows it')
    await doubleTap(page, f, { x: c.cx, y: c.cy })
    await idle(page)
    // As far as the file has pixels (not to fill the screen: that would blow it up).
    expect((await view(page)).scale).toBeCloseTo(shot.scale, 2)
    await doubleTap(page, f, { x: c.cx, y: c.cy })
    await idle(page)
    expect((await view(page)).scale).toBe(1)

    await pinch(page, f, { x: c.cx, y: c.cy }, 60, 180)
    await idle(page)
    const pinched = await view(page)
    expect(pinched.scale).toBeGreaterThan(2.6)
    expect(pinched.scale).toBeLessThan(3.4)
    expect(await pageZoom(page), 'the page itself is not zoomed').toBe(1)
    await expect(page.locator('.lightbox-stage')).toHaveCSS('touch-action', 'none')

    // One finger pans the zoomed picture (slowly, so it stays inside its bounds).
    await drag(page, f, { x: c.cx, y: c.cy }, { x: c.cx - 60, y: c.cy - 30 }, 6, 30, 120)
    await idle(page)
    const panned = await view(page)
    expect(panned.x).toBeLessThan(pinched.x - 30)
    expect(panned.counter).toBe(`1 / ${notes!.count}`)

    // Back to fitted, then pinch it small: the viewer closes into the tile.
    await doubleTap(page, f, { x: c.cx, y: c.cy })
    await idle(page)
    await pinch(page, f, { x: c.cx, y: c.cy }, 220, 70)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await pageZoom(page)).toBe(1)
    await expect(notes!.tiles.first().locator(':scope > div')).toHaveCSS('visibility', 'visible')
  })

  test('a zoomed image pans to its edge, then runs into the next one; dragging down closes into its tile', async ({ page, browserName }) => {
    const notes = await fieldNotes(page)
    test.skip(!notes, 'no Field Notes photos in this content store')
    await notes!.tiles.first().tap()
    await idle(page)
    const f = await fingers(page, browserName)
    const c = await view(page)
    const shot = await oneShot(page)
    test.skip(!shot.zoomable, 'this store\'s first photo is not larger than a phone shows it')
    await doubleTap(page, f, { x: c.cx, y: c.cy })
    await idle(page)
    expect((await view(page)).scale).toBeCloseTo(shot.scale, 2)

    // Pan slowly to the image's right edge (held: no momentum), then keep going: the strip moves on.
    const width = page.viewportSize()!.width
    const y = c.cy - 40
    const box = await sizes(page)
    // How far it pans before its edge meets the stage's; a little past it (less than a page turn) it stays.
    const range = (box.w * shot.scale - box.stageW) / 2
    expect(range, 'zoomed wider than the phone').toBeGreaterThan(60)
    await drag(page, f, { x: width - 16, y }, { x: width - 16 - (range + 40), y }, 8, 30, 150)
    await idle(page)
    const atEdge = await view(page)
    expect(atEdge.counter, 'held at the edge: still the same image').toBe(`1 / ${notes!.count}`)
    expect(atEdge.x).toBeLessThan(-(range - 2))
    await drag(page, f, { x: width - 16, y }, { x: width / 3, y }, 8, 30, 150)
    await expect(page.locator('.lightbox-counter')).toHaveText(`2 / ${notes!.count}`)
    await idle(page)
    expect((await view(page)).scale, 'the next image starts fitted').toBe(1)

    // Drag down: the image follows the finger and the backdrop fades; let go and it flies into its tile.
    await f.start([{ x: c.cx, y: c.cy }])
    for (let i = 1; i <= 6; i++) {
      await f.move([{ x: c.cx + i * 3, y: c.cy + i * 25 }])
      await page.waitForTimeout(16)
    }
    const mid = await view(page)
    expect(mid.y).toBeGreaterThan(100)
    expect(mid.overlay).toBeLessThan(0.8)
    await f.end()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await pageZoom(page)).toBe(1)
    // The strip followed the viewer: the second photo's tile is the one on screen and visible again.
    const second = notes!.tiles.nth(1)
    await expect(second.locator(':scope > div')).toHaveCSS('visibility', 'visible')
    await expect(second).toBeInViewport({ ratio: 0.5 })
  })
})

// ── Reduced motion ───────────────────────────────────────────────────────────

test.describe('lightbox gestures: reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('no morph and no glide: opens, pages, zooms and closes at once; gestures still work', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop keyboard')
    const notes = await fieldNotes(page)
    test.skip(!notes, 'no Field Notes photos in this content store')
    await notes!.tiles.first().hover()
    await recordScales(page, 12)
    await notes!.tiles.first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect.poll(async () => (await recordedScales(page)).length).toBe(12)
    expect(new Set(await recordedScales(page)), 'every frame at rest: no morph').toEqual(new Set([1]))
    await expect(page.locator('.lightbox-stage')).toHaveAttribute('data-motion', 'idle')
    expect((await view(page)).overlay).toBe(1)

    // Paging and zooming jump: no frame ever shows the strip between images or the image between sizes.
    await recordScales(page, 30)
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.lightbox-counter')).toHaveText(`2 / ${notes!.count}`)
    await page.keyboard.press('+')
    await expect.poll(async () => (await view(page)).scale).toBeCloseTo(1.5, 2)
    await expect.poll(async () => (await recordedScales(page)).length).toBe(30)
    expect(new Set(await recordedTrack(page)), 'the strip never glides').toEqual(new Set([0]))
    expect([...new Set(await recordedScales(page))].every((s) => s === 1 || s === 1.5), 'no zoom in between').toBe(true)
    await page.keyboard.press('0')
    await expect.poll(async () => (await view(page)).scale).toBe(1)
    // Gestures still work: a click zooms at once (as far as the file has pixels), or closes a photo shown at its full size.
    const v = await view(page)
    const shot = await oneShot(page)
    await page.mouse.click(v.cx, v.cy)
    if (shot.zoomable) {
      await expect.poll(async () => (await view(page)).scale).toBeCloseTo(shot.scale, 2)
      await page.keyboard.press('Escape')
    }
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

// ── Article images (synthetic draft) ────────────────────────────────────────

test.describe('lightbox gestures: article images', { tag: '@admin' }, () => {
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
    'An opening paragraph that is long enough to be the excerpt of this end-to-end post about the image viewer.',
    '',
    '![A mountain range at dusk](/images/hero/hero-mountains-1600.webp "First caption: the mountains")',
    '',
    'A paragraph between the figures, so they stay figures of their own rather than a gallery.',
    '',
    '![A grey placeholder portrait](/images/avatar-placeholder.png "Second caption: the portrait")',
    '',
    'Another paragraph between two figures.',
    '',
    '![The site icon](/icons/icon-512.png "Third caption: the icon")',
  ].join('\n')

  async function touchPage(browser: Browser, page: Page) {
    const phone = await browser.newContext({ ...PIXEL, storageState: await page.context().storageState() })
    const tab = await phone.newPage()
    const errors: string[] = []
    tab.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    tab.on('pageerror', (e) => errors.push(e.message))
    return { phone, tab, errors }
  }

  test('an article image grows out of its own frame, steps through every image with its caption, and closes into the frame on screen — on a desktop and on a phone', async ({ page, browser, browserName }) => {
    await loginAsAdmin(page)
    const slug = `e2e-lightbox-${Date.now()}`
    const created = await adminFetch(page, 'PUT', '/api/admin/posts', {
      slug,
      create: true,
      frontmatter: { title: 'E2E image viewer', date: '2026-05-30', description: 'Created by the lightbox end-to-end suite; deleted afterwards.', draft: true },
      body: BODY,
    })
    expect(created.status, created.text).toBe(200)
    try {
      await page.goto(`/api/admin/draft?path=${encodeURIComponent(`/blog/${slug}`)}`)
      await expect(page).toHaveURL(new RegExp(`/blog/${slug}$`))
      await settle(page)
      const buttons = page.locator('#article-body button.zoomable')
      await expect(buttons).toHaveCount(3)
      const second = buttons.nth(1)
      await second.scrollIntoViewIfNeeded()
      await second.hover()
      await page.waitForTimeout(300)
      const shownWidth = await second.locator('[data-zoom-frame] img').evaluate((img) => img.getBoundingClientRect().width)
      await recordScales(page)
      await second.click()
      await expect(page.getByRole('dialog', { name: /Image 2 of 3: A grey placeholder portrait/ })).toBeVisible()
      const dialog = page.getByRole('dialog')
      await idle(page)
      // The first frame draws the picture exactly as large as the page did (smaller or larger than the viewer's).
      const restWidth = await page.evaluate(() => (Array.from(document.querySelectorAll('.lightbox-layer')).find((l) => !l.closest('[aria-hidden="true"]')) as HTMLElement).offsetWidth)
      const first = (await recordedScales(page))[0]
      expect(Math.abs(first - shownWidth / restWidth), `starts at the page size (${first} vs ${shownWidth}/${restWidth})`).toBeLessThan(0.04)
      expect(Math.abs(first - 1)).toBeGreaterThan(0.05)
      await expect(second.locator('[data-zoom-frame]')).toHaveCSS('visibility', 'hidden')
      await expect(page.locator('.lightbox-counter')).toHaveText('2 / 3')
      await expect(dialog.getByText('Second caption: the portrait')).toBeVisible()
      await page.keyboard.press('ArrowRight')
      await expect(page.locator('.lightbox-counter')).toHaveText('3 / 3')
      await expect(page.getByRole('dialog', { name: /Image 3 of 3: The site icon/ })).toBeVisible()
      await expect(dialog.getByText('Third caption: the icon')).toBeVisible()
      await expect(second.locator('[data-zoom-frame]')).toHaveCSS('visibility', 'visible')
      await page.keyboard.press('ArrowRight')
      await expect(page.locator('.lightbox-counter')).toHaveText('1 / 3')
      await page.keyboard.press('ArrowRight')
      await expect(page.locator('.lightbox-counter')).toHaveText('2 / 3')
      await idle(page)
      expect(await seriousA11yViolations(page)).toEqual([])
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(second).toBeFocused()

      // The same article on a phone (the Draft Mode cookie travels with the session).
      const { phone, tab, errors } = await touchPage(browser, page)
      try {
        await tab.goto(page.url(), { waitUntil: 'load' })
        await settle(tab)
        const first = tab.locator('#article-body button.zoomable').first()
        await first.scrollIntoViewIfNeeded()
        await first.tap()
        await expect(tab.getByRole('dialog')).toBeVisible()
        await idle(tab)
        const f = await fingers(tab, browserName)
        const c = await view(tab)
        await drag(tab, f, { x: c.cx + 100, y: c.cy }, { x: c.cx - 140, y: c.cy })
        await expect(tab.locator('.lightbox-counter')).toHaveText('2 / 3')
        await idle(tab)
        const shot = await oneShot(tab)
        await doubleTap(tab, f, { x: c.cx, y: c.cy })
        await idle(tab)
        // As far as the file has pixels (none for a photo already shown at its full size).
        expect((await view(tab)).scale).toBeCloseTo(shot.zoomable ? shot.scale : 1, 2)
        await doubleTap(tab, f, { x: c.cx, y: c.cy })
        await idle(tab)
        await drag(tab, f, { x: c.cx, y: c.cy - 60 }, { x: c.cx, y: c.cy + 200 }, 6, 16)
        await expect(tab.getByRole('dialog')).toHaveCount(0)
        expect(await pageZoom(tab)).toBe(1)
        expect(errors).toEqual([])
      } finally {
        await phone.close()
      }
    } finally {
      await adminFetch(page, 'DELETE', `/api/admin/posts?slug=${slug}`)
    }
  })
})
