import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Global } from '@emotion/react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { useBottomBarOffset } from '../Common/useBottomBarOffset'

/**
 * What marks a page opened through a review link (H5) as a preview: a
 * "Preview" watermark across the viewport — faint, diagonal, never in the
 * way of the pointer or a screen reader, and printed with the page — and a
 * bar at the bottom that says what the reader is looking at and when the
 * link stops working. Words come from lib/uiStrings/review in the article's
 * language; the expiry is preformatted on the server.
 *
 * The page renders inside the site's <main>, a stacking context of its own
 * that the footer paints over, so once mounted the bar moves to <body>
 * (server HTML has it in place; nothing shifts) and the page gets room
 * below the footer for it.
 */

export type ReviewChromeProps = {
  /** Watermark word ("Preview", "预览"). */
  word: string
  /** What the reader sees ("Not published — shared privately for review."). */
  note: string
  /** "Link expires Sun 1 Nov 2026, 09:00 HKT". */
  expires: string
  /** Screen-reader name of the bar. */
  label: string
  /** BCP-47 language of the words. */
  lang: string
}

export function ReviewWatermark({ word }: { word: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const pattern = `review-watermark-${id}`
  return (
    <Box
      aria-hidden="true"
      data-testid="review-watermark"
      position="fixed"
      inset={0}
      zIndex={25}
      pointerEvents="none"
      color="page.fg"
      opacity={0.07}
      _dark={{ opacity: 0.06 }}
      sx={{
        '@media (forced-colors: active)': { display: 'none' },
        '@media print': { opacity: 0.08 },
      }}
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <defs>
          <pattern id={pattern} width="320" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
            <text x="0" y="120" fill="currentColor" fontFamily="var(--font-geist-sans), system-ui, sans-serif" fontSize="44" fontWeight="700" letterSpacing="6">
              {word.toUpperCase()}
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${pattern})`} />
      </svg>
    </Box>
  )
}

function BarBody({ word, note, expires, label, lang }: ReviewChromeProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  useBottomBarOffset(ref)
  return (
    <Box
      ref={ref}
      as="aside"
      role="region"
      aria-label={label}
      lang={lang}
      data-testid="review-bar"
      // Its controls are not scrolled clear of the bar they sit in (globals.css).
      data-bottom-bar=""
      position="fixed"
      left={0}
      right={0}
      bottom={0}
      zIndex={30}
      bg="page.bg-elevated"
      borderTop="1px solid"
      borderColor="page.border-strong"
      py={2.5}
      pb="calc(10px + env(safe-area-inset-bottom))"
      className="no-print"
      sx={{ '@media (forced-colors: active)': { borderTop: '2px solid CanvasText' } }}
    >
      {/* The page's gutter (16 / 24 / 32 px, as the header and footer), so its edges line up with theirs. */}
      <Flex maxW="var(--container-content)" mx="auto" px="var(--page-gutter)" align={{ base: 'flex-start', sm: 'center' }} direction={{ base: 'column', sm: 'row' }} gap={{ base: 1, sm: 3 }}>
        <Text
          as="span"
          flexShrink={0}
          fontFamily="var(--font-geist-mono), monospace"
          fontSize="11px"
          fontWeight={600}
          letterSpacing="0.12em"
          textTransform="uppercase"
          color="accent.text"
          border="1px solid"
          borderColor="accent.text"
          borderRadius="sm"
          px={1.5}
          lineHeight="18px"
        >
          {word}
        </Text>
        <Text as="p" m={0} fontSize="13px" color="page.fg" flex={1} minW={0}>
          {note}{' '}
          <Text as="span" color="page.fg-secondary" whiteSpace={{ base: 'normal', md: 'nowrap' }} className="tnum">
            {expires}
          </Text>
        </Text>
      </Flex>
    </Box>
  )
}

export function ReviewBar(props: ReviewChromeProps) {
  // In place for the server render and hydration, then on <body>, above the footer.
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(document.body), [])
  return (
    <>
      {/* Room after the footer for the bar, so the page's last line never ends up under it. */}
      <Global styles={{ body: { paddingBottom: 'var(--bottom-bar-h, 0px)' } }} />
      {host ? createPortal(<BarBody {...props} />, host) : <BarBody {...props} />}
    </>
  )
}

export default function ReviewChrome(props: ReviewChromeProps) {
  return (
    <>
      <ReviewWatermark word={props.word} />
      <ReviewBar {...props} />
    </>
  )
}
