import { useEffect, useRef, useState } from 'react'
import { Box } from '@chakra-ui/react'

/**
 * `<YouTube id="jkAqK3vqILI" title="…" />` in MDX (compiled to a
 * `youtube-embed` element by lib/rehype/stripMdxExpressions.ts, which also
 * validates the 11-character id).
 *
 * A facade: until the visitor asks for the video, the page loads one
 * thumbnail image from i.ytimg.com — no player script, no cookies, no third
 * party frames. Activating the button swaps in the privacy-enhanced
 * youtube-nocookie.com player with autoplay (allowed by the CSP frame-src).
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/

export default function YouTube(props: { 'data-youtube-id'?: string; title?: string }) {
  const id = props['data-youtube-id'] || ''
  const title = (props.title || '').trim() || 'YouTube video'
  const [playing, setPlaying] = useState(false)
  const frame = useRef<HTMLIFrameElement | null>(null)

  // The play button is replaced by the player: keep keyboard focus with it.
  useEffect(() => {
    if (playing) frame.current?.focus()
  }, [playing])

  if (!ID_RE.test(id)) return null

  return (
    <Box
      position="relative"
      my={8}
      w="100%"
      sx={{ aspectRatio: '16 / 9' }}
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="page.border"
      bg="page.bg-elevated"
    >
      {playing ? (
        <Box
          as="iframe"
          ref={frame}
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          position="absolute"
          inset={0}
          w="100%"
          h="100%"
          border={0}
        />
      ) : (
        <Box
          as="button"
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play video: ${title}`}
          position="absolute"
          inset={0}
          w="100%"
          h="100%"
          p={0}
          border={0}
          bg="transparent"
          cursor="pointer"
          sx={{
            '& .yt-play': { transition: 'transform 200ms var(--ease-out-quart), background-color 200ms var(--ease-out-quart)' },
            '@media (hover: hover)': { '&:hover .yt-play': { transform: 'translate(-50%, -50%) scale(1.06)', bg: 'accent.solid' } },
          }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-4px' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            decoding="async"
            width={480}
            height={360}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <Box
            as="span"
            aria-hidden
            className="yt-play"
            position="absolute"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            display="flex"
            alignItems="center"
            justifyContent="center"
            w="68px"
            h="48px"
            borderRadius="12px"
            bg="rgba(0,0,0,0.72)"
            color="white"
            sx={{ '@media (forced-colors: active)': { border: '2px solid ButtonText', bg: 'Canvas', color: 'ButtonText' } }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden focusable="false">
              <path d="M6 3.5v13l11-6.5-11-6.5z" />
            </svg>
          </Box>
        </Box>
      )}
    </Box>
  )
}
