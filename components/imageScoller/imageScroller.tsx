import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Box, Flex, HStack, IconButton, Link, Text } from '@chakra-ui/react'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { GoArrowLeft, GoArrowRight } from 'react-icons/go'
import { FaPause, FaPlay } from 'react-icons/fa'

import Lightbox, { type LightboxItem } from '../Common/Lightbox'
import { safeHref } from '../../lib/cvFormat'

/**
 * A home "Field notes" photo. `width` / `height` / `srcSet` are attached on
 * the server (intrinsic size of the local file and its upload variants).
 */
export type ScrollerImage = {
  url: string
  describe?: string
  redirectTo?: string
  visible?: boolean
  width?: number
  height?: number
  srcSet?: string
}

const AUTOPLAY_MS = 6000
/** Ignore scroll events this long after a programmatic scroll starts. */
const PROGRAMMATIC_MS = 700
const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const TILE_SIZES = '(min-width: 62em) 340px, (min-width: 48em) 46vw, 80vw'
const EDGE_MASK = 'linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent)'

const validSize = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined)

/**
 * "Field notes" — a full-width, horizontally scroll-snapping photo strip.
 *
 *   - 83% / 48% / 32% wide 4:3 tiles (phone / tablet / desktop), lazy images
 *     with intrinsic width/height, soft fade at both edges.
 *   - Each photo is a button that opens the shared-element Lightbox; an
 *     optional link from the Home editor sits in the caption.
 *   - Prev / next scroll by one tile (wrapping at the ends); the dots are the
 *     strip's snap positions (24×24 hit areas, transform-only active pill).
 *   - Autoplay advances every 6 s, paused on hover, focus, a hidden tab, while
 *     off-screen or in the viewer, and with reduced motion; an explicit play /
 *     pause control (WCAG 2.2.2). Position changes the visitor makes are
 *     announced politely.
 */
const ImageScroller = ({ images }: { images?: ScrollerImage[] }) => {
  // Only safe image sources / link targets reach the DOM (admin-supplied URLs).
  const data = useMemo(
    () =>
      (images || [])
        .filter((i) => i && i.visible !== false)
        .map((i) => ({
          url: safeHref(i.url),
          describe: typeof i.describe === 'string' ? i.describe.trim() : '',
          redirectTo: safeHref(i.redirectTo),
          width: validSize(i.width),
          height: validSize(i.height),
          srcSet: typeof i.srcSet === 'string' && i.srcSet ? i.srcSet : undefined,
        }))
        .filter((i) => i.url),
    [images],
  )
  const count = data.length
  const reduce = useReducedMotion()
  const layoutPrefix = `field-notes-${useId().replace(/:/g, '')}`

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
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
        return `Photo ${pos + 1} of ${count}${d ? `: ${d}` : ''}`
      }
      return `Photos ${pos + 1}–${Math.min(count, pos + visible)} of ${count}`
    },
    [count, data],
  )

  const scrollToPosition = useCallback(
    (pos: number, userAction: boolean) => {
      const el = scrollerRef.current
      const step = stepPx()
      if (!el || !step) return
      const target = ((pos % positions) + positions) % positions
      programmaticAt.current = Date.now()
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollTo({ left: target * step, behavior: smooth ? 'smooth' : 'auto' })
      setPosition(target)
      if (userAction) setAnnounce(describePosition(target, positions))
    },
    [positions, stepPx, describePosition],
  )

  const go = useCallback((delta: number, userAction: boolean) => scrollToPosition(position + delta, userAction), [position, scrollToPosition])

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
    alt: img.describe || `Photo ${i + 1} of ${count}`,
    caption: img.describe || undefined,
    width: img.width,
    height: img.height,
  }))

  return (
    <LayoutGroup id={layoutPrefix}>
      <Box
        ref={rootRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Field notes photos"
        borderRadius="12px"
        sx={{
          '& > .field-notes-strip': { gridAutoColumns: { base: '83%', md: '48%', lg: '32%' } },
          // The strip's edge mask would fade a ring drawn on the strip itself:
          // keyboard focus on it is shown on this unmasked parent instead.
          '&:has(> .field-notes-strip:focus-visible)': { outline: '2px solid var(--accent)', outlineOffset: '4px' },
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget as Node)) setFocused(false)
        }}
      >
        <motion.div
          ref={scrollerRef}
          layoutScroll
          tabIndex={0}
          aria-label="Photos (scrolls horizontally)"
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
                  aria-label={`Enlarge photo: ${alt}`}
                  onClick={() => setViewer(i)}
                  display="block"
                  w="100%"
                  p={0}
                  borderRadius="lg"
                  cursor="zoom-in"
                  _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                >
                  <motion.div
                    layoutId={reduce ? undefined : `${layoutPrefix}-${i}`}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    style={{
                      position: 'relative',
                      aspectRatio: '4 / 3',
                      overflow: 'hidden',
                      borderRadius: 8,
                      border: '1px solid var(--chakra-colors-page-border)',
                      background: 'var(--chakra-colors-page-bg-elevated)',
                    }}
                  >
                    <motion.img
                      layout={reduce ? undefined : true}
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
                  </motion.div>
                </Box>
                {(img.describe || img.redirectTo) && (
                  <Flex as="figcaption" mt={2.5} gap={3} align="baseline" justify="space-between" fontSize="13px" color="page.fg-secondary" lineHeight="1.5">
                    <Text as="span" minW={0} noOfLines={2}>
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
                        Visit <span className="nudge-ne" aria-hidden>↗</span>
                        <span className="sr-only">
                          {' '}
                          {img.describe || `photo ${i + 1}`} link{img.redirectTo.startsWith('/') ? '' : ' (opens in a new tab)'}
                        </span>
                      </Link>
                    )}
                  </Flex>
                )}
              </Box>
            )
          })}
        </motion.div>

        <Text className="sr-only" aria-live="polite" aria-atomic="true">
          {announce}
        </Text>

        {positions > 1 ? (
          <Flex mt={3} align="center" justify="space-between" gap={3} px={{ base: 0, md: '24px' }}>
            <HStack spacing={0} role="group" aria-label="Choose position">
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
                aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}
                aria-pressed={!playing}
                icon={playing ? <FaPause size={10} /> : <FaPlay size={10} />}
                size="sm"
                variant="ghost"
                color="page.fg-secondary"
                onClick={() => setPlaying((p) => !p)}
                isDisabled={!!reduce}
              />
              <IconButton aria-label="Previous photos" icon={<GoArrowLeft />} size="sm" variant="outline" borderColor="page.border-strong" onClick={() => go(-1, true)} />
              <IconButton aria-label="Next photos" icon={<GoArrowRight />} size="sm" variant="outline" borderColor="page.border-strong" onClick={() => go(1, true)} />
            </HStack>
          </Flex>
        ) : null}
      </Box>

      <Lightbox items={items} index={viewer} onIndexChange={setViewer} layoutIdPrefix={reduce ? undefined : layoutPrefix} />
    </LayoutGroup>
  )
}

export default ImageScroller
