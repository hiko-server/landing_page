import { fillUi } from '../../lib/uiStrings'
import { useHomeUi } from '../LandingPage/homeUi'
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Flex, HStack, IconButton, Link, Text } from '@chakra-ui/react'
import { useReducedMotion } from 'framer-motion'
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon } from '../Icons/ui/content'

import LazyLightbox, { preloadLightbox } from '../Common/LazyLightbox'
import type { LightboxItem } from '../Common/Lightbox'
import Picture from '../Common/Picture'
import { useImageReveal } from '../Common/useImageReveal'
import { safeHref } from '../../lib/cvFormat'

/**
 * A home "Field notes" photo. `width` / `height` / `srcSet` / `avifSrcSet` /
 * `placeholder` are attached on the server (intrinsic size of the local file,
 * its variants and its blur placeholder — lib/uploadVariants imageSources).
 */
export type ScrollerImage = {
  url: string
  describe?: string
  /** The caption's language where it is not the page's (an English caption on /zh, F3). */
  lang?: string
  redirectTo?: string
  visible?: boolean
  width?: number
  height?: number
  srcSet?: string
  avifSrcSet?: string
  placeholder?: string
}

const AUTOPLAY_MS = 6000
/** Ignore scroll events this long after a programmatic scroll starts. */
const PROGRAMMATIC_MS = 700
const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const TILE_SIZES = '(min-width: 62em) 340px, (min-width: 48em) 46vw, 80vw'
const EDGE_MASK = 'linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent)'

const validSize = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined)

type TileImage = { url: string; width?: number; height?: number; srcSet?: string; avifSrcSet?: string; placeholder?: string }

/**
 * One photo's 4:3 tile: WebP / AVIF candidates over the blurred placeholder
 * until the photo has loaded (components/Common/useImageReveal). The tile's
 * box is where the Lightbox grows out of and flies back into (`originOf`).
 */
const FieldNoteTile = forwardRef<HTMLDivElement, { img: TileImage }>(function FieldNoteTile({ img }, ref) {
  const reveal = useImageReveal(img.placeholder, { width: img.width, height: img.height, fit: 'cover' })
  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        aspectRatio: '4 / 3',
        overflow: 'hidden',
        borderRadius: 8,
        border: '1px solid var(--chakra-colors-page-border)',
        background: 'var(--chakra-colors-page-bg-elevated)',
        ...reveal.boxStyle,
      }}
    >
      <Picture avifSrcSet={img.avifSrcSet} sizes={TILE_SIZES}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={reveal.ref}
          {...reveal.imgProps}
          src={img.url}
          srcSet={img.srcSet}
          sizes={img.srcSet ? TILE_SIZES : undefined}
          alt=""
          width={img.width}
          height={img.height}
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', maxWidth: 'none' }}
        />
      </Picture>
    </div>
  )
})

/**
 * "Field notes" — a full-width, horizontally scroll-snapping photo strip.
 *
 *   - 83% / 48% / 32% wide 4:3 tiles (phone / tablet / desktop), lazy images
 *     with intrinsic width/height, soft fade at both edges.
 *   - Each photo is a button that opens the Lightbox, which grows out of
 *     the tile; stepping through photos in the viewer keeps the strip on
 *     the photo shown, so closing flies back into its tile. An optional link
 *     from the Home editor sits in the caption.
 *   - Prev / next scroll by one tile (wrapping at the ends); the dots are the
 *     strip's snap positions (24×24 hit areas, transform-only active pill).
 *   - Autoplay advances every 6 s, paused on hover, focus, a hidden tab, while
 *     off-screen or in the viewer, and with reduced motion; an explicit play /
 *     pause control (WCAG 2.2.2). Position changes the visitor makes are
 *     announced politely.
 */
const ImageScroller = ({ images }: { images?: ScrollerImage[] }) => {
  // The page's words (components/LandingPage/homeUi): Chinese on /zh.
  const { t } = useHomeUi()
  const p = t.photos
  // Only safe image sources / link targets reach the DOM (admin-supplied URLs).
  const data = useMemo(
    () =>
      (images || [])
        .filter((i) => i && i.visible !== false)
        .map((i) => ({
          url: safeHref(i.url),
          describe: typeof i.describe === 'string' ? i.describe.trim() : '',
          redirectTo: safeHref(i.redirectTo),
          lang: typeof i.lang === 'string' && i.lang ? i.lang : undefined,
          width: validSize(i.width),
          height: validSize(i.height),
          srcSet: typeof i.srcSet === 'string' && i.srcSet ? i.srcSet : undefined,
          avifSrcSet: typeof i.srcSet === 'string' && i.srcSet && typeof i.avifSrcSet === 'string' && i.avifSrcSet ? i.avifSrcSet : undefined,
          placeholder: typeof i.placeholder === 'string' && i.placeholder ? i.placeholder : undefined,
        }))
        .filter((i) => i.url),
    [images],
  )
  const count = data.length
  const reduce = useReducedMotion()

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const tileRefs = useRef<(HTMLDivElement | null)[]>([])
  const originOf = useCallback((i: number) => tileRefs.current[i] ?? null, [])
  const programmaticAt = useRef(0)
  const frame = useRef(0)

  const [position, setPosition] = useState(0)
  const [positions, setPositions] = useState(Math.max(1, count))
  const [playing, setPlaying] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [tabHidden, setTabHidden] = useState(false)
  const [inView, setInView] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)
  const [announce, setAnnounce] = useState('')

  /** Distance between two snap points (tile width + gap), in px. */
  const stepPx = useCallback(() => {
    const el = scrollerRef.current
    const tiles = el?.querySelectorAll<HTMLElement>('[data-tile]')
    if (!el || !tiles || !tiles.length) return 0
    if (tiles.length > 1) return tiles[1].offsetLeft - tiles[0].offsetLeft
    return tiles[0].offsetWidth
  }, [])

  const measure = useCallback(() => {
    const el = scrollerRef.current
    const step = stepPx()
    if (!el || !step) return
    const max = Math.max(0, el.scrollWidth - el.clientWidth)
    const snapCount = Math.max(1, Math.round(max / step) + 1)
    setPositions((p) => (p === snapCount ? p : snapCount))
    const atEnd = el.scrollLeft >= max - 2
    const pos = atEnd ? snapCount - 1 : Math.min(snapCount - 1, Math.round(el.scrollLeft / step))
    setPosition((p) => (p === pos ? p : pos))
  }, [stepPx])

  const describePosition = useCallback(
    (pos: number, snapCount: number) => {
      const visible = Math.max(1, count - snapCount + 1)
      if (visible === 1) {
        const d = data[pos]?.describe
        const at = fillUi(p.photo, { i: pos + 1, n: count })
        return d ? `${at}${p.photo.match(/[\u3400-\u9fff]/) ? '：' : ': '}${d}` : at
      }
      return fillUi(p.photoRange, { i: pos + 1, j: Math.min(count, pos + visible), n: count })
    },
    [count, data, p],
  )

  const scrollToPosition = useCallback(
    (pos: number, userAction: boolean, instant = false) => {
      const el = scrollerRef.current
      const step = stepPx()
      if (!el || !step) return
      const target = ((pos % positions) + positions) % positions
      programmaticAt.current = Date.now()
      const smooth = !instant && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollTo({ left: target * step, behavior: smooth ? 'smooth' : 'auto' })
      setPosition(target)
      if (userAction) setAnnounce(describePosition(target, positions))
    },
    [positions, stepPx, describePosition],
  )

  const go = useCallback((delta: number, userAction: boolean) => scrollToPosition(position + delta, userAction), [position, scrollToPosition])

  // The viewer moved to another photo: bring its tile into the strip (behind
  // the backdrop, at once), so the viewer can close into it.
  useEffect(() => {
    if (viewer === null) return
    const el = scrollerRef.current
    const tile = tileRefs.current[viewer]
    if (!el || !tile) return
    const box = el.getBoundingClientRect()
    const r = tile.getBoundingClientRect()
    if (r.left >= box.left && r.right <= box.right) return
    scrollToPosition(Math.min(viewer, positions - 1), false, true)
    // Only the photo shown decides; the strip's own position follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer])

  // Measure on mount, on resize and when the photo list changes.
  useEffect(() => {
    measure()
    const el = scrollerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, count])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  useEffect(() => {
    const onVis = () => setTabHidden(document.visibilityState === 'hidden')
    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [count])

  const autoplay = positions > 1 && playing && !reduce && !hovered && !focused && !tabHidden && inView && viewer === null
  useEffect(() => {
    if (!autoplay) return
    const id = window.setTimeout(() => go(1, false), AUTOPLAY_MS)
    return () => window.clearTimeout(id)
  }, [autoplay, position, go])

  const onScroll = () => {
    if (Date.now() - programmaticAt.current < PROGRAMMATIC_MS) return
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(measure)
  }

  if (!count) return null

  const items: LightboxItem[] = data.map((img, i) => ({
    src: img.url,
    srcSet: img.srcSet,
    avifSrcSet: img.avifSrcSet,
    alt: img.describe || fillUi(p.photo, { i: i + 1, n: count }),
    caption: img.describe || undefined,
    width: img.width,
    height: img.height,
    placeholder: img.placeholder,
  }))

  return (
    <>
      <Box
        ref={rootRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={p.region}
        borderRadius="12px"
        sx={{
          '& > .field-notes-strip': { gridAutoColumns: { base: '83%', md: '48%', lg: '32%' } },
          // The strip's edge mask would fade a ring drawn on the strip itself:
          // keyboard focus on it is shown on this unmasked parent instead.
          '&:has(> .field-notes-strip:focus-visible)': { outline: '2px solid var(--accent)', outlineOffset: '4px' },
        }}
        onMouseEnter={() => {
          setHovered(true)
          preloadLightbox()
        }}
        onMouseLeave={() => setHovered(false)}
        onPointerDown={preloadLightbox}
        onFocus={() => {
          setFocused(true)
          preloadLightbox()
        }}
        onBlur={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget as Node)) setFocused(false)
        }}
      >
        <div
          ref={scrollerRef}
          tabIndex={0}
          aria-label={p.scroller}
          onScroll={onScroll}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return
            if (e.key === 'ArrowRight') {
              e.preventDefault()
              go(1, true)
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              go(-1, true)
            }
          }}
          className="field-notes-strip"
          style={{
            // The containing block of the captions' absolutely positioned
            // .sr-only text: without it they resolve to an ancestor outside
            // this scroller, escape its clip and widen the whole page.
            position: 'relative',
            display: 'grid',
            gridAutoFlow: 'column',
            gap: 16,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollSnapType: 'x mandatory',
            overscrollBehaviorX: 'contain',
            scrollbarWidth: 'thin',
            maskImage: EDGE_MASK,
            WebkitMaskImage: EDGE_MASK,
            // Room for focus rings, which the scroll clip would otherwise cut.
            padding: '3px 24px 8px',
            scrollPaddingInline: 24,
            outline: 'none',
            borderRadius: 12,
          }}
        >
          {data.map((img, i) => {
            const alt = items[i].alt
            return (
              <Box as="figure" key={`${img.url}-${i}`} data-tile m={0} minW={0} sx={{ scrollSnapAlign: 'start' }}>
                <Box
                  as="button"
                  type="button"
                  aria-label={fillUi(p.enlarge, { alt })}
                  onClick={() => setViewer(i)}
                  display="block"
                  w="100%"
                  p={0}
                  borderRadius="lg"
                  cursor="zoom-in"
                  _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                >
                  <FieldNoteTile
                    img={img}
                    ref={(el) => {
                      tileRefs.current[i] = el
                    }}
                  />
                </Box>
                {(img.describe || img.redirectTo) && (
                  <Flex as="figcaption" mt={2.5} gap={3} align="baseline" justify="space-between" fontSize="13px" color="page.fg-secondary" lineHeight="1.5">
                    <Text as="span" minW={0} noOfLines={2} lang={img.lang}>
                      {img.describe}
                    </Text>
                    {img.redirectTo && (
                      <Link
                        href={img.redirectTo}
                        isExternal={!img.redirectTo.startsWith('/')}
                        rel={img.redirectTo.startsWith('/') ? undefined : 'noopener noreferrer'}
                        flexShrink={0}
                        display="inline-flex"
                        alignItems="center"
                        minH="24px"
                        fontFamily={monoFont}
                        fontSize="11px"
                        letterSpacing="0.04em"
                        color="accent.text"
                        _hover={{ textDecoration: 'underline' }}
                        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                      >
                        {p.visit} <span className="nudge-ne" aria-hidden>↗</span>
                        <span className="sr-only">
                          {' '}
                          {fillUi(p.link, { label: img.describe || fillUi(p.photo, { i: i + 1, n: count }) })}
                          {img.redirectTo.startsWith('/') ? '' : t.newTab}
                        </span>
                      </Link>
                    )}
                  </Flex>
                )}
              </Box>
            )
          })}
        </div>

        <Text className="sr-only" aria-live="polite" aria-atomic="true">
          {announce}
        </Text>

        {positions > 1 ? (
          <Flex mt={3} align="center" justify="space-between" gap={3} px={{ base: 0, md: '24px' }}>
            <HStack spacing={0} role="group" aria-label={p.choose}>
              {Array.from({ length: positions }, (_, i) => (
                <Box
                  key={i}
                  as="button"
                  type="button"
                  aria-label={describePosition(i, positions)}
                  aria-current={i === position ? 'true' : undefined}
                  onClick={() => scrollToPosition(i, true)}
                  display="grid"
                  placeItems="center"
                  w="24px"
                  h="24px"
                  bg="transparent"
                  borderRadius="full"
                  _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px' }}
                >
                  <Box
                    as="span"
                    aria-hidden
                    display="block"
                    w="6px"
                    h="6px"
                    borderRadius="full"
                    bg={i === position ? 'var(--accent)' : 'page.dot-idle'}
                    transform={i === position ? 'scaleX(3)' : 'none'}
                    transition="transform 260ms var(--ease-out-quart), background-color 200ms"
                    sx={{ '@media (forced-colors: active)': { bg: i === position ? 'Highlight' : 'CanvasText' } }}
                  />
                </Box>
              ))}
            </HStack>
            <HStack spacing={1}>
              <IconButton
                aria-label={playing ? p.pause : p.play}
                aria-pressed={!playing}
                icon={playing ? <PauseIcon size="xs" /> : <PlayIcon size="xs" />}
                size="sm"
                variant="ghost"
                color="page.fg-secondary"
                onClick={() => setPlaying((p) => !p)}
                isDisabled={!!reduce}
              />
              <IconButton aria-label={p.previous} icon={<ArrowLeftIcon size="sm" />} size="sm" variant="outline" borderColor="page.border-strong" onClick={() => go(-1, true)} />
              <IconButton aria-label={p.next} icon={<ArrowRightIcon size="sm" />} size="sm" variant="outline" borderColor="page.border-strong" onClick={() => go(1, true)} />
            </HStack>
          </Flex>
        ) : null}
      </Box>

      <LazyLightbox items={items} index={viewer} onIndexChange={setViewer} originOf={originOf} />
    </>
  )
}

export default ImageScroller
