import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Flex, HStack, IconButton, Link, Text, useColorModeValue } from '@chakra-ui/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { GoArrowLeft, GoArrowRight } from 'react-icons/go'
import { FaPause, FaPlay } from 'react-icons/fa'

import { safeHref } from '../../lib/cvFormat'

export type ScrollerImage = { url: string; describe?: string; redirectTo?: string; visible?: boolean }

const AUTOPLAY_MS = 6000
const SWIPE_PX = 60

/**
 * "Field notes" photo carousel.
 *
 *   - crossfade + drag / swipe, arrow keys when focused
 *   - fixed 3:2 frame, so slides never shift the layout
 *   - autoplay pauses on hover, focus, a hidden tab, or when the visitor
 *     asks for reduced motion; an explicit play / pause control (WCAG 2.2.2)
 *   - every control is a labelled button; captions double as alt text
 */
const ImageScroller = ({ images }: { images?: ScrollerImage[] }) => {
  // Only safe image sources / link targets reach the DOM (admin-supplied URLs).
  const data = (images || [])
    .filter((i) => i && i.visible !== false)
    .map((i) => ({ ...i, url: safeHref(i.url), redirectTo: safeHref(i.redirectTo) }))
    .filter((i) => i.url)
  const reduce = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState(1)
  const [playing, setPlaying] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [tabHidden, setTabHidden] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const dotIdle = useColorModeValue('rgba(0,0,0,0.18)', 'rgba(255,255,255,0.25)')

  const count = data.length
  const go = useCallback(
    (delta: number) => {
      if (count < 2) return
      setDir(delta >= 0 ? 1 : -1)
      setIndex((i) => (i + delta + count) % count)
    },
    [count],
  )

  useEffect(() => {
    const onVis = () => setTabHidden(document.visibilityState === 'hidden')
    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const autoplay = count > 1 && playing && !reduce && !hovered && !focused && !tabHidden
  useEffect(() => {
    if (!autoplay) return
    const id = window.setTimeout(() => go(1), AUTOPLAY_MS)
    return () => window.clearTimeout(id)
  }, [autoplay, index, go])

  // Keep the index valid when the photo list changes.
  useEffect(() => {
    if (index >= count && count > 0) setIndex(0)
  }, [count, index])

  if (!count) return null
  const current = data[Math.min(index, count - 1)]
  const label = current.describe?.trim() || `Photo ${index + 1} of ${count}`

  const slide = (
    <Box
      as="img"
      src={current.url}
      alt={label}
      loading={index === 0 ? 'eager' : 'lazy'}
      decoding="async"
      w="100%"
      h="100%"
      objectFit="cover"
      draggable={false}
      userSelect="none"
    />
  )

  return (
    <Box
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Field notes photos"
      tabIndex={0}
      outline="none"
      _focusVisible={{ boxShadow: '0 0 0 2px var(--accent)', borderRadius: 'lg' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setFocused(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          go(1)
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          go(-1)
        }
      }}
    >
      <Box
        position="relative"
        w="100%"
        sx={{ aspectRatio: '3 / 2' }}
        overflow="hidden"
        borderRadius="lg"
        border="1px solid"
        borderColor="page.border"
        bg="page.bg-elevated"
      >
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={`${index}-${current.url}`}
            custom={dir}
            initial={{ opacity: 0, x: reduce ? 0 : dir * 24, scale: reduce ? 1 : 1.02 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: reduce ? 0 : dir * -24 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            drag={count > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.x < -SWIPE_PX) go(1)
              else if (info.offset.x > SWIPE_PX) go(-1)
            }}
            style={{ position: 'absolute', inset: 0, cursor: count > 1 ? 'grab' : 'default', touchAction: 'pan-y' }}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
          >
            {current.redirectTo ? (
              <Link
                href={current.redirectTo}
                isExternal={!current.redirectTo.startsWith('/')}
                display="block"
                w="100%"
                h="100%"
                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px' }}
              >
                {slide}
              </Link>
            ) : (
              slide
            )}
          </motion.div>
        </AnimatePresence>

        {count > 1 ? (
          <Text
            position="absolute"
            top={2}
            right={2}
            px={2}
            py="1px"
            borderRadius="full"
            bg="blackAlpha.600"
            color="white"
            fontFamily="var(--font-geist-mono), monospace"
            fontSize="10px"
            letterSpacing="0.06em"
            aria-hidden
          >
            {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
          </Text>
        ) : null}
      </Box>

      <Text mt={3} fontSize="13px" color="page.fg-secondary" minH="1.4em" aria-live={autoplay ? 'off' : 'polite'}>
        {current.describe || ' '}
      </Text>

      {count > 1 ? (
        <Flex mt={3} align="center" justify="space-between" gap={3}>
          <HStack spacing={1.5} as="div" role="group" aria-label="Choose photo">
            {data.map((img, i) => (
              <Box
                key={`${img.url}-${i}`}
                as="button"
                type="button"
                aria-label={`Show photo ${i + 1}${img.describe ? `: ${img.describe}` : ''}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => {
                  setDir(i > index ? 1 : -1)
                  setIndex(i)
                }}
                w={i === index ? '18px' : '6px'}
                h="6px"
                borderRadius="full"
                bg={i === index ? 'var(--accent)' : dotIdle}
                transition="width 260ms var(--ease-out-quart), background-color 200ms"
                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
              />
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
            <IconButton aria-label="Previous photo" icon={<GoArrowLeft />} size="sm" variant="outline" borderColor="page.border-strong" onClick={() => go(-1)} />
            <IconButton aria-label="Next photo" icon={<GoArrowRight />} size="sm" variant="outline" borderColor="page.border-strong" onClick={() => go(1)} />
          </HStack>
        </Flex>
      ) : null}
    </Box>
  )
}

export default ImageScroller
