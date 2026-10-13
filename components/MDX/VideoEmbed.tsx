import { useEffect, useRef, useState } from 'react'
import { Box, Link, Text } from '@chakra-ui/react'
import { printableLinkUrl } from '../../lib/print'
import { VIDEO_PLAYER_HOST, VIDEO_PROVIDER_LABEL, videoPlayerUrl, videoRefFromProps, videoWatchUrl } from '../../lib/videoUrl'

/**
 * Click-to-load video player for `youtube-embed` / `vimeo-embed` elements
 * (a lone YouTube / Vimeo link or `<YouTube id="…" />`, compiled by
 * lib/rehype/autoEmbed.ts).
 *
 * Until the visitor presses play nothing is requested from YouTube or
 * Vimeo: the still image is a copy stored on this site (lib/videoPoster.ts;
 * a neutral panel until it has been imported), there is no player script,
 * no cookie and no third-party frame. Pressing play swaps in the
 * privacy-enhanced player (youtube-nocookie.com, Vimeo with dnt=1) with
 * autoplay and moves focus to it. The caption says where the video plays
 * from and links to its page, which also works where the player is blocked.
 *
 * 16:9 box reserved from the first paint (no layout shift); the play button
 * is a real <button> with the video's name; the poster zoom on hover is off
 * under reduced motion; forced-colours mode keeps the button outlined.
 */

type Props = {
  'data-youtube-id'?: string
  'data-vimeo-id'?: string
  'data-vimeo-hash'?: string
  'data-start'?: string | number
  'data-poster'?: string
  'data-poster-srcset'?: string
  'data-poster-width'?: string | number
  'data-poster-height'?: string | number
  'data-ui-lang'?: string
  title?: string
}

const MONO = 'var(--font-geist-mono), monospace'
/** Same column as article images (lib/rehype/images.ts ARTICLE_IMAGE_SIZES). */
const POSTER_SIZES = '(min-width: 768px) 720px, 100vw'

const COPY = {
  en: {
    fallback: (p: string) => `${p} video`,
    play: (t: string) => `Play video: ${t}`,
    note: (p: string, host: string) => `Loads from ${host} (${p}) only when you press play.`,
    watch: (p: string) => `Watch on ${p}`,
  },
  zh: {
    fallback: (p: string) => `${p} 视频`,
    play: (t: string) => `播放视频：${t}`,
    note: (p: string, host: string) => `按下播放后才会从 ${host}（${p}）加载。`,
    watch: (p: string) => `在 ${p} 观看`,
  },
} as const

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export default function VideoEmbed(props: Props) {
  const video = videoRefFromProps(props as Record<string, unknown>)
  const [playing, setPlaying] = useState(false)
  const frame = useRef<HTMLIFrameElement | null>(null)

  // The play button is replaced by the player: keep keyboard focus with it.
  useEffect(() => {
    if (playing) frame.current?.focus()
  }, [playing])

  if (!video) return null

  const copy = props['data-ui-lang'] === 'zh' ? COPY.zh : COPY.en
  const provider = VIDEO_PROVIDER_LABEL[video.provider]
  const title = (props.title || '').trim()
  const name = title || copy.fallback(provider)
  const poster = typeof props['data-poster'] === 'string' && /^\/(?!\/)/.test(props['data-poster']) ? props['data-poster'] : ''
  const posterW = num(props['data-poster-width'])
  const posterH = num(props['data-poster-height'])
  const watch = videoWatchUrl(video)

  return (
    <Box as="figure" className="video-embed" my={8} mx={0}>
      <Box
        position="relative"
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
            src={videoPlayerUrl(video, { autoplay: true })}
            title={name}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
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
            aria-label={copy.play(name)}
            position="absolute"
            inset={0}
            w="100%"
            h="100%"
            p={0}
            border={0}
            bg="transparent"
            cursor="pointer"
            textAlign="left"
            sx={{
              '& .video-play': { transition: 'transform 200ms var(--ease-out-quart), background-color 200ms var(--ease-out-quart)' },
              '@media (hover: hover)': { '&:hover .video-play': { bg: 'accent.solid' } },
              '@media (hover: hover) and (prefers-reduced-motion: no-preference)': {
                '& .video-poster': { transition: 'transform 400ms var(--ease-out-quart)' },
                '&:hover .video-poster': { transform: 'scale(1.015)' },
                '&:hover .video-play': { transform: 'translate(-50%, -50%) scale(1.06)' },
              },
            }}
            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-4px' }}
          >
            {poster ? (
              // A same-site copy of the thumbnail (never i.ytimg.com / vimeocdn.com).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="video-poster"
                src={poster}
                srcSet={props['data-poster-srcset'] || undefined}
                sizes={props['data-poster-srcset'] ? POSTER_SIZES : undefined}
                alt=""
                width={posterW}
                height={posterH}
                loading="lazy"
                decoding="async"
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Box
                aria-hidden
                position="absolute"
                inset={0}
                // Plain style: Chakra would try to read the gradients as theme tokens.
                style={{
                  backgroundImage: 'radial-gradient(circle, var(--dot-color) 1px, transparent 1px), radial-gradient(circle at 85% 0%, var(--accent-soft), transparent 55%)',
                  backgroundSize: '8px 8px, 100% 100%',
                }}
              />
            )}
            {poster ? (
              <Box aria-hidden position="absolute" inset={0} style={{ backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.62), rgba(0,0,0,0) 55%)' }} />
            ) : null}
            <Text
              as="span"
              aria-hidden
              position="absolute"
              left={{ base: 3, sm: 4 }}
              right={{ base: 3, sm: 4 }}
              bottom={{ base: 2.5, sm: 3.5 }}
              display="flex"
              alignItems="baseline"
              justifyContent="space-between"
              gap={3}
              color={poster ? 'white' : 'page.fg'}
              textShadow={poster ? '0 1px 2px rgba(0,0,0,0.5)' : undefined}
            >
              <Text as="span" fontWeight={500} fontSize={{ base: '14px', sm: '15px' }} noOfLines={2} minW={0}>
                {title}
              </Text>
              <Text as="span" flexShrink={0} fontFamily={MONO} fontSize="11px" letterSpacing="0.08em" textTransform="uppercase" opacity={0.85}>
                {provider}
              </Text>
            </Text>
            <Box
              as="span"
              aria-hidden
              className="video-play"
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
      <Text
        as="figcaption"
        mt={3}
        display="flex"
        flexWrap="wrap"
        columnGap={3}
        rowGap={1}
        fontFamily={MONO}
        fontSize="12px"
        lineHeight="1.5"
        color="page.fg-secondary"
      >
        <span>{copy.note(provider, VIDEO_PLAYER_HOST[video.provider])}</span>
        <Link href={watch} isExternal color="accent.text" className="link-underline" data-print-url={printableLinkUrl(watch, copy.watch(provider))}>
          {copy.watch(provider)}{' '}
          <span className="nudge-ne" aria-hidden>
            ↗
          </span>
        </Link>
      </Text>
    </Box>
  )
}
