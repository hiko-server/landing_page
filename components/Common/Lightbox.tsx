import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Box, Flex, HStack, IconButton, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Text } from '@chakra-ui/react'
import { m, useReducedMotion } from 'framer-motion'
import { ArrowLeftIcon, ArrowRightIcon, ZoomInIcon, ZoomOutIcon } from '../Icons/ui/content'
import Picture from './Picture'
import { LightboxEngine, originVisible, snapshotOrigin, FRAME_RADIUS } from './lightboxEngine'
import { MAX_SCALE, ZOOMED_EPSILON, sourcePixelWidth, windowIndices, wrapIndex } from '../../lib/lightboxGestures'
import { placeholderStyle } from '../../lib/lqip'
import { settleWithin } from '../../lib/viewTransition'
import { motionTransition } from '../../theme/tokens'
import { fillUi } from '../../lib/uiStrings'
import { CONTENT_UI } from '../../lib/uiStrings/content'
import { useUiLang } from './uiLang'

/**
 * Full-screen image viewer shared by the home photo strip and article
 * images (C3: gestures 2.0). Loaded on demand (./LazyLightbox).
 *
 *   <Lightbox items={items} index={open} onIndexChange={setOpen} originOf={(i) => tileBox[i]} />
 *
 * - Open / close: the image grows out of the page box `originOf(i)` returns
 *   (its tile or figure frame, which clips the <img> inside) and flies back
 *   into the box of the image on screen when it closes — from wherever a
 *   gesture left it. A box that is off screen gets a fade instead. The box
 *   is hidden while the viewer shows its image, so the picture moves rather
 *   than duplicates. Reduced motion: no morph, nothing glides.
 * - Touch: swipe sideways between images (spring, momentum carries over);
 *   drag up or down to close (the image follows the finger, the backdrop
 *   fades); pinch to zoom 1–4× with pan, pinch a fitted image small to
 *   close; double tap zooms at that point; a zoomed image pans with momentum
 *   and runs into its neighbour at the edge; a tap beside the image closes.
 *   The stage takes every touch gesture (touch-action: none) — pinch zooms
 *   the picture, never the page — while the page outside the viewer keeps
 *   the browser's own pinch-zoom.
 * - Mouse and trackpad: click the image to zoom there (and back), drag to
 *   pan; the wheel zooms at the pointer, a trackpad pinch too; a sideways
 *   trackpad swipe pages.
 * - A click, a double tap and the zoom button zoom only as far as the
 *   source has pixels (one file pixel per CSS pixel, PhotoSwipe's 1:1). An
 *   image already shown at its full size offers none of them: no zoom
 *   button, no zoom-in cursor, a click on it closes. Pinch, the wheel and
 *   + / − still magnify it on purpose.
 * - Keyboard: ← / → step (wrapping) or pan when zoomed, ↑ / ↓ pan, + / −
 *   zoom, 0 fits, Home / End jump, Esc closes. Focus is trapped while open
 *   and returns to the button of the image on screen (else the opener).
 * - Progressive: the picture starts as the page's already-decoded variant
 *   over its blur placeholder; the full-size source (AVIF where supported)
 *   fades in once decoded, and a larger one is fetched as you zoom in.
 * - `n / N` counter in tabular mono; the caption fades in under the image
 *   and steps aside while zoomed.
 */

export type LightboxItem = {
  src: string
  srcSet?: string
  /** AVIF variants, offered in a <picture> source (G4). */
  avifSrcSet?: string
  alt: string
  caption?: string
  width?: number
  height?: number
  /** Blur-up placeholder (C8): drawn behind the image until it has loaded. */
  placeholder?: string
}

type LightboxProps = {
  items: LightboxItem[]
  index: number | null
  onIndexChange: (i: number | null) => void
  /**
   * The page box image `i` opens from and closes into: the element that
   * clips the page's <img> (tile, figure frame). Its closest button gets
   * the focus back.
   */
  originOf?: (i: number) => HTMLElement | null
}

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const FADE = motionTransition('fast')
/** The top bar's height. */
const TOP_PX = 56
/** Room kept under the image for the caption. */
const BOTTOM_PX = 112
/** Vertical room kept for the top bar, the caption and padding. */
const CHROME_PX = TOP_PX + BOTTOM_PX
/** Side padding of a slide: the arrows sit in it on wider screens. */
const SIDE_PX = { base: 12, md: 80 }
const MD_MIN_WIDTH = 768

const ratioOf = (item: LightboxItem | undefined, learned?: number): number | null =>
  item?.width && item?.height ? item.width / item.height : learned && learned > 0 ? learned : null

/** The decoded image the page shows for `el` (its tile), to start the viewer's picture with. */
function decodedSourceOf(el: HTMLElement | null | undefined): { src: string; ratio: number | null } | null {
  const img = el?.querySelector('img')
  if (!img || !img.complete || !img.naturalWidth) return null
  const src = img.currentSrc || img.src
  return src ? { src, ratio: img.naturalHeight ? img.naturalWidth / img.naturalHeight : null } : null
}

function useViewport(active: boolean): { width: number; height: number } {
  const [vp, setVp] = useState(() => (typeof window === 'undefined' ? { width: 1280, height: 800 } : { width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    if (!active) return
    const update = () => setVp((v) => (v.width === window.innerWidth && v.height === window.innerHeight ? v : { width: window.innerWidth, height: window.innerHeight }))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [active])
  return vp
}

export default function Lightbox({ items, index, onIndexChange, originOf }: LightboxProps) {
  const reduce = !!useReducedMotion()
  // Labels in the surrounding article's language (lib/uiStrings), English elsewhere.
  const t = CONTENT_UI[useUiLang()]
  const count = items.length
  const isOpen = index !== null && index >= 0 && index < count
  const current = isOpen ? items[index] : null

  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  /** Where focus goes when the viewer has closed (set as it starts to close). */
  const finalFocus = useRef<HTMLElement | null>(null)
  /** The image the viewer was opened on, and what had the focus then. */
  const openedOn = useRef<number | null>(null)
  const openedFrom = useRef<HTMLElement | null>(null)
  const announceZoom = useRef(false)

  const [zoomed, setZoomed] = useState(false)
  /** The image on screen has more pixels than it is shown with (lightboxEngine zoomableChange). */
  const [zoomable, setZoomable] = useState(true)
  /** The largest zoom the current image has rested at: its source is chosen for it. */
  const [detail, setDetail] = useState(1)
  const [announcement, setAnnouncement] = useState('')
  /** Aspect ratios learned from loaded images without width / height. */
  const [learned, setLearned] = useState<Record<number, number>>({})
  const viewport = useViewport(isOpen)

  const latest = useRef({ index, count, items, onIndexChange, originOf, learned, t })
  latest.current = { index, count, items, onIndexChange, originOf, learned, t }
  const engineRef = useRef<LightboxEngine | null>(null)

  const requestClose = useCallback(() => {
    const { index: i, items: list, originOf: find, learned: ratios } = latest.current
    const engine = engineRef.current
    if (i === null || !engine || engine.isClosing()) return
    const el = find?.(i) ?? null
    const origin = snapshotOrigin(el, ratioOf(list[i], ratios[i]))
    const onScreen = originVisible(origin, { width: window.innerWidth, height: window.innerHeight })
    const opened = openedOn.current !== null ? find?.(openedOn.current) : null
    const button = (onScreen ? el : opened ?? el)?.closest<HTMLElement>('button, a[href], [tabindex]') ?? null
    finalFocus.current = button ?? (openedFrom.current?.isConnected ? openedFrom.current : null)
    engine.close(onScreen ? origin : null)
  }, [])

  if (!engineRef.current && typeof window !== 'undefined') {
    engineRef.current = new LightboxEngine(
      { stage: () => stageRef.current, track: () => trackRef.current, overlay: () => overlayRef.current, root: () => rootRef.current },
      {
        step: (delta) => {
          const { index: i, count: n, onIndexChange: change } = latest.current
          if (i !== null && n > 1) change(wrapIndex(i, delta, n))
        },
        requestClose: () => requestClose(),
        closed: () => latest.current.onIndexChange(null),
        zoomChange: (scale, settled) => {
          setZoomed(scale > ZOOMED_EPSILON)
          if (settled) {
            if (scale > ZOOMED_EPSILON) setDetail((d) => Math.max(d, Math.min(MAX_SCALE, Math.ceil(scale * 2) / 2)))
            if (announceZoom.current) {
              announceZoom.current = false
              setAnnouncement(fillUi(latest.current.t.zoomLevel, { n: Math.round(scale * 100) }))
            }
          }
        },
        zoomableChange: setZoomable,
      },
    )
  }
  const engine = engineRef.current

  // The image changed: fitted again, its own source tier.
  const [shownIndex, setShownIndex] = useState(index)
  if (index !== shownIndex) {
    setShownIndex(index)
    setDetail(1)
    setZoomed(false)
    if (index === null) setAnnouncement('')
  }
  if (isOpen && openedOn.current === null) {
    openedOn.current = index
    const active = typeof document === 'undefined' ? null : document.activeElement
    openedFrom.current = active instanceof HTMLElement && active !== document.body ? active : null
  }
  if (!isOpen && openedOn.current !== null && index === null) openedOn.current = null

  const learn = useCallback((i: number, ratio: number) => {
    setLearned((prev) => (prev[i] && Math.abs(prev[i] - ratio) < 0.001 ? prev : { ...prev, [i]: ratio }))
  }, [])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!engine || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !isOpen) return
    const zoomedNow = engine.isZoomed()
    const handled = () => e.preventDefault()
    switch (e.key) {
      case 'ArrowRight':
        handled()
        if (zoomedNow) engine.panBy(-1 / 6, 0)
        else engine.page(1)
        break
      case 'ArrowLeft':
        handled()
        if (zoomedNow) engine.panBy(1 / 6, 0)
        else engine.page(-1)
        break
      case 'ArrowUp':
        if (zoomedNow) {
          handled()
          engine.panBy(0, 1 / 6)
        }
        break
      case 'ArrowDown':
        if (zoomedNow) {
          handled()
          engine.panBy(0, -1 / 6)
        }
        break
      case '+':
      case '=':
        handled()
        announceZoom.current = true
        engine.zoomStep(1)
        break
      case '-':
      case '_':
        handled()
        announceZoom.current = true
        engine.zoomStep(-1)
        break
      case '0':
        handled()
        announceZoom.current = true
        engine.resetZoom()
        break
      case 'Home':
        if (count > 1 && index !== 0) {
          handled()
          onIndexChange(0)
        }
        break
      case 'End':
        if (count > 1 && index !== count - 1) {
          handled()
          onIndexChange(count - 1)
        }
        break
    }
  }

  const label = current ? fillUi(current.alt ? t.imageOfAlt : t.imageOf, { i: index! + 1, n: count, alt: current.alt || '' }) : t.imageViewer
  const md = viewport.width >= MD_MIN_WIDTH
  const sidePx = md ? SIDE_PX.md : SIDE_PX.base

  return (
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      size="full"
      motionPreset="none"
      initialFocusRef={closeRef}
      finalFocusRef={finalFocus}
      blockScrollOnMount
    >
      {/* Near-opaque in both themes: a light page must not read through behind the caption. */}
      <ModalOverlay ref={overlayRef} bg="rgba(5,5,5,0.96)" />
      <ModalContent
        ref={rootRef}
        bg="transparent"
        color="white"
        boxShadow="none"
        m={0}
        borderRadius={0}
        minH="100dvh"
        overflow="hidden"
        onKeyDown={onKeyDown}
      >
        <ModalHeader className="sr-only">{label}</ModalHeader>
        <ModalBody className="sr-only">{t.viewerKeys}</ModalBody>

        {isOpen && engine && (
          <Stage
            engine={engine}
            index={index!}
            count={count}
            items={items}
            reduce={reduce}
            originOf={originOf}
            learned={learned}
            learn={learn}
            detail={detail}
            sidePx={sidePx}
            viewport={viewport}
            stageRef={stageRef}
            trackRef={trackRef}
            openedOn={openedOn}
          />
        )}

        <Flex
          position="absolute"
          top={0}
          insetInline={0}
          h={`${TOP_PX}px`}
          pl={{ base: 4, md: 6 }}
          pr={{ base: 2, md: 4 }}
          align="center"
          justify="space-between"
          zIndex={2}
          pointerEvents="none"
          style={{ opacity: 'var(--lb-ui, 1)' }}
        >
          <Text
            as="span"
            className="lightbox-counter"
            fontFamily={monoFont}
            fontSize="12px"
            letterSpacing="0.06em"
            color="whiteAlpha.800"
            textShadow="0 1px 2px rgba(0,0,0,0.6)"
            sx={{ fontVariantNumeric: 'tabular-nums' }}
            aria-hidden
          >
            {current ? `${index! + 1} / ${count}` : ''}
          </Text>
          <HStack spacing={1} pointerEvents="auto">
            {/* Only when there is something to zoom to (or back from). */}
            {zoomable || zoomed ? (
              <ZoomButton
                zoomed={zoomed}
                label={zoomed ? t.zoomOut : t.zoomIn}
                onClick={() => {
                  announceZoom.current = true
                  engine?.toggleZoom()
                }}
                // Stepping to an image without zoom (not the viewer closing: its own focus return decides then).
                onRemoveWhileFocused={() => {
                  if (latest.current.index !== null) closeRef.current?.focus()
                }}
              />
            ) : null}
            <ModalCloseButton
              ref={closeRef}
              aria-label={t.closeImageViewer}
              position="static"
              w="40px"
              h="40px"
              color="white"
              borderRadius="full"
              _hover={{ bg: 'whiteAlpha.200' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
            />
          </HStack>
        </Flex>

        <Flex
          position="absolute"
          bottom={0}
          insetInline={0}
          minH={`${BOTTOM_PX}px`}
          px={{ base: count > 1 ? '68px' : 4, md: 4 }}
          pt={4}
          pb="max(24px, env(safe-area-inset-bottom))"
          justify="center"
          align="flex-start"
          zIndex={1}
          pointerEvents="none"
          aria-live="polite"
          style={{ opacity: 'var(--lb-caption, 1)', transition: reduce ? undefined : 'opacity 160ms ease-out' }}
        >
          {current?.caption ? (
            <m.p
              key={`caption-${index}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...FADE, delay: reduce ? 0 : 0.12 }}
              style={{ maxWidth: '72ch', textAlign: 'center', fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,0.86)', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
            >
              {current.caption}
            </m.p>
          ) : null}
        </Flex>

        {count > 1 && (
          <>
            <IconButton
              aria-label={t.previousImage}
              icon={<ArrowLeftIcon size="sm" />}
              onClick={() => engine?.page(-1)}
              position="absolute"
              left={{ base: 3, md: 4 }}
              // Phones: in the caption band, clear of the photo (a swipe that
              // starts at its edge must reach the stage). Wider: beside it.
              top={{ base: 'auto', md: '50%' }}
              bottom={{ base: 'max(20px, env(safe-area-inset-bottom))', md: 'auto' }}
              transform={{ base: 'none', md: 'translateY(-50%)' }}
              w="44px"
              h="44px"
              minW="44px"
              borderRadius="full"
              bg="blackAlpha.600"
              color="white"
              zIndex={2}
              // Opacity follows the engine frame by frame (--lb-ui), like the
              // top bar: only the hover colours ease, so the arrows never
              // flash in at full opacity while the viewer opens.
              transitionProperty="background-color, color, box-shadow"
              style={{ opacity: 'var(--lb-ui, 1)' }}
              _hover={{ bg: 'blackAlpha.800' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
            />
            <IconButton
              aria-label={t.nextImage}
              icon={<ArrowRightIcon size="sm" />}
              onClick={() => engine?.page(1)}
              position="absolute"
              right={{ base: 3, md: 4 }}
              // Phones: in the caption band, clear of the photo (a swipe that
              // starts at its edge must reach the stage). Wider: beside it.
              top={{ base: 'auto', md: '50%' }}
              bottom={{ base: 'max(20px, env(safe-area-inset-bottom))', md: 'auto' }}
              transform={{ base: 'none', md: 'translateY(-50%)' }}
              w="44px"
              h="44px"
              minW="44px"
              borderRadius="full"
              bg="blackAlpha.600"
              color="white"
              zIndex={2}
              // Opacity follows the engine frame by frame (--lb-ui), like the
              // top bar: only the hover colours ease, so the arrows never
              // flash in at full opacity while the viewer opens.
              transitionProperty="background-color, color, box-shadow"
              style={{ opacity: 'var(--lb-ui, 1)' }}
              _hover={{ bg: 'blackAlpha.800' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
            />
          </>
        )}

        <Box className="sr-only" role="status">
          {announcement}
        </Box>
      </ModalContent>
    </Modal>
  )
}

/**
 * The top bar's zoom toggle. It goes away when the image on screen has
 * nothing to zoom to; if it had the focus then (stepping with the arrow
 * keys), the focus moves to Close first rather than dropping out of the
 * dialog (its cleanup runs before the button leaves the DOM).
 */
function ZoomButton({ zoomed, label, onClick, onRemoveWhileFocused }: { zoomed: boolean; label: string; onClick: () => void; onRemoveWhileFocused: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const latestRemove = useRef(onRemoveWhileFocused)
  latestRemove.current = onRemoveWhileFocused
  useLayoutEffect(() => {
    const el = ref.current
    return () => {
      if (el && document.activeElement === el) latestRemove.current()
    }
  }, [])
  return (
    <IconButton
      ref={ref}
      aria-label={label}
      icon={zoomed ? <ZoomOutIcon size="sm" /> : <ZoomInIcon size="sm" />}
      onClick={onClick}
      variant="ghost"
      w="40px"
      h="40px"
      minW="40px"
      color="white"
      borderRadius="full"
      _hover={{ bg: 'whiteAlpha.200' }}
      _active={{ bg: 'whiteAlpha.300' }}
      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
    />
  )
}

type StageProps = {
  engine: LightboxEngine
  index: number
  count: number
  items: LightboxItem[]
  reduce: boolean
  originOf?: (i: number) => HTMLElement | null
  learned: Record<number, number>
  learn: (i: number, ratio: number) => void
  detail: number
  sidePx: number
  viewport: { width: number; height: number }
  stageRef: React.RefObject<HTMLDivElement>
  trackRef: React.RefObject<HTMLDivElement>
  openedOn: React.MutableRefObject<number | null>
}

/**
 * The gesture surface and its strip of (at most) three slides. Mounted with
 * the dialog's portal, so its layout effects run once every element is in
 * the DOM: the engine attaches and the open morph starts before the first
 * paint.
 */
function Stage({ engine, index, count, items, reduce, originOf, learned, learn, detail, sidePx, viewport, stageRef, trackRef, openedOn }: StageProps) {
  const windowed = windowIndices(index, count)

  useLayoutEffect(() => {
    engine.setReducedMotion(reduce)
  }, [engine, reduce])

  useLayoutEffect(() => {
    engine.setCount(count)
  }, [engine, count])

  // Mount: attach, then grow out of the tile the viewer was opened on.
  useLayoutEffect(() => {
    engine.setCount(count)
    engine.setReducedMotion(reduce)
    engine.attach()
    engine.setIndex(index)
    const i = openedOn.current ?? index
    const origin = snapshotOrigin(originOf?.(i), ratioOf(items[i], learned[i]))
    engine.open(origin)
    return () => engine.detach()
    // Mount only: later changes arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  useLayoutEffect(() => {
    engine.setIndex(index)
  }, [engine, index])

  // The page box of the image on screen is hidden while the viewer shows it,
  // so the picture moves instead of being duplicated (restored when the
  // image changes and when the viewer has gone).
  useLayoutEffect(() => {
    const el = originOf?.(index)
    if (!el) return
    const previous = el.style.visibility
    el.style.visibility = 'hidden'
    return () => {
      el.style.visibility = previous
    }
  }, [originOf, index])

  return (
    <Box
      ref={stageRef}
      className="lightbox-stage"
      position="fixed"
      inset={0}
      overflow="hidden"
      data-zoomed="false"
      data-zoomable="true"
      data-motion="idle"
      sx={{
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overscrollBehavior: 'contain',
        '& .lightbox-frame': { cursor: 'zoom-in' },
        // Shown at its full size: a click closes, nothing zooms.
        '&[data-zoomable="false"] .lightbox-frame': { cursor: 'default' },
        '&[data-zoomed="true"] .lightbox-frame': { cursor: 'grab' },
        '&[data-drag="true"], &[data-drag="true"] .lightbox-frame': { cursor: 'grabbing' },
      }}
    >
      <Box ref={trackRef} position="absolute" inset={0}>
        {windowed.map((i) => (
          <Slide
            key={i}
            i={i}
            item={items[i]}
            current={i === index}
            engine={engine}
            reduce={reduce}
            originOf={originOf}
            learnedRatio={learned[i]}
            learn={learn}
            detail={i === index ? detail : 1}
            sidePx={sidePx}
            viewport={viewport}
          />
        ))}
      </Box>
    </Box>
  )
}

type SlideProps = {
  i: number
  item: LightboxItem
  current: boolean
  engine: LightboxEngine
  reduce: boolean
  originOf?: (i: number) => HTMLElement | null
  learnedRatio?: number
  learn: (i: number, ratio: number) => void
  detail: number
  sidePx: number
  viewport: { width: number; height: number }
}

/**
 * One image of the strip. Its picture starts as the variant the page has
 * already decoded (the tile's) over the blur placeholder; the full-size
 * source fades in once it has loaded and decoded, and `sizes` grows with the
 * zoom so a sharper candidate is fetched (the browser keeps showing the old
 * one until the new one is ready).
 */
function Slide({ i, item, current, engine, reduce, originOf, learnedRatio, learn, detail, sidePx, viewport }: SlideProps) {
  const slideRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [low] = useState(() => decodedSourceOf(originOf?.(i)))
  const [ready, setReady] = useState(false)
  const [lowGone, setLowGone] = useState(false)

  useLayoutEffect(() => {
    const slide = slideRef.current
    const layer = layerRef.current
    const frame = frameRef.current
    if (slide && layer && frame) engine.registerSlide(i, { slide, layer, frame })
    return () => engine.registerSlide(i, null)
  }, [engine, i])

  useLayoutEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) setReady(true)
  }, [])

  // How far a click or the zoom button may zoom: the widest file the source
  // offers (its srcset, else its width, else — an <img> without either — the
  // decoded file's own width; a srcset image's naturalWidth is scaled by
  // `sizes`, so it never decides).
  const [decodedWidth, setDecodedWidth] = useState(0)
  const sourceWidth = sourcePixelWidth(item.width, item.srcSet, item.avifSrcSet) || decodedWidth
  useLayoutEffect(() => {
    engine.setSourceWidth(i, sourceWidth)
  }, [engine, i, sourceWidth])

  useEffect(() => {
    if (!ready || !low || lowGone) return
    const timer = window.setTimeout(() => setLowGone(true), reduce ? 0 : 260)
    return () => window.clearTimeout(timer)
  }, [ready, low, lowGone, reduce])

  const ratio = ratioOf(item, learnedRatio ?? low?.ratio ?? undefined)
  const naturalWidth = item.width || undefined
  const available = Math.max(1, viewport.width - 2 * sidePx)
  const fitted = ratio ? Math.min(available, Math.max(1, viewport.height - CHROME_PX) * ratio, naturalWidth ?? Infinity) : available
  const sizes = item.srcSet ? `${Math.ceil(fitted * detail)}px` : undefined

  const layerWidth = ratio
    ? `min(100%, calc((100dvh - ${CHROME_PX}px) * ${ratio.toFixed(4)})${naturalWidth ? `, ${naturalWidth}px` : ''})`
    : `min(100%, calc((100dvh - ${CHROME_PX}px) * 1.6))`

  const imgStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'block',
    width: '100%',
    height: '100%',
    maxWidth: 'none',
    objectFit: ratio ? 'cover' : 'contain',
  }

  return (
    <Box
      ref={slideRef}
      position="absolute"
      inset={0}
      display="flex"
      alignItems="center"
      justifyContent="center"
      pt={`${TOP_PX}px`}
      pb={`${BOTTOM_PX}px`}
      px={`${sidePx}px`}
      aria-hidden={current ? undefined : true}
    >
      <div ref={layerRef} className="lightbox-layer" style={{ position: 'relative', width: layerWidth, maxWidth: '100%', transformOrigin: '50% 50%' }}>
        <div
          ref={frameRef}
          className="lightbox-frame"
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: ratio ? String(ratio) : '16 / 10',
            overflow: 'hidden',
            borderRadius: FRAME_RADIUS,
            backgroundColor: 'rgba(255,255,255,0.04)',
            ...(ready ? null : placeholderStyle(item.placeholder, { width: item.width, height: item.height })),
          }}
        >
          {low && !lowGone ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={low.src} alt="" aria-hidden decoding="sync" draggable={false} style={imgStyle} />
          ) : null}
          <Picture avifSrcSet={item.srcSet ? item.avifSrcSet : null} sizes={sizes}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={item.src}
              srcSet={item.srcSet}
              sizes={sizes}
              alt={item.alt}
              width={item.width}
              height={item.height}
              decoding="async"
              draggable={false}
              {...{ fetchpriority: current ? 'high' : 'low' }}
              onLoad={(e) => {
                const img = e.currentTarget
                if (!item.width && img.naturalWidth && img.naturalHeight) learn(i, img.naturalWidth / img.naturalHeight)
                if (!item.srcSet && img.naturalWidth) setDecodedWidth(img.naturalWidth)
                // Shown once decoded, so the swap never stalls a frame.
                void settleWithin(typeof img.decode === 'function' ? img.decode() : Promise.resolve(), 400).then(() => setReady(true))
              }}
              onError={() => setReady(true)}
              style={{ ...imgStyle, opacity: ready ? 1 : 0, transition: reduce ? undefined : 'opacity 220ms ease-out' }}
            />
          </Picture>
        </div>
      </div>
    </Box>
  )
}
