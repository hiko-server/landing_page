import React, { useEffect, useId, useState } from 'react'
import { Box, Button, Flex, Input, Link, Text } from '@chakra-ui/react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { PlayIcon } from '../../../Icons/ui/content'
import { VIDEO_PLAYER_HOST, VIDEO_PROVIDER_LABEL, parseVideoUrl, videoWatchUrl, type VideoRef } from '../../../../lib/videoUrl'
import { videoLinkUrl } from '../slashItems'
import { MONO, primaryButtonProps } from '../../shell/ui'
import { tabStop, useEditorUi } from './editorUi'

/**
 * A video in the visual editor, drawn like the site's click-to-load player
 * (components/MDX/VideoEmbed): a 16:9 frame with the stored poster — asked
 * for from this site only (/api/admin/video-poster; posters are imported
 * when the article is saved, never loaded from YouTube or Vimeo here) —
 * the title and the provider. Under it: the title (what the player is
 * called for screen readers and shows on the poster), the link to the
 * video and "Change link".
 */

type Poster = { src: string; width: number; height: number } | null

const posterCache = new Map<string, Promise<Poster>>()

function loadPoster(url: string): Promise<Poster> {
  const hit = posterCache.get(url)
  if (hit) return hit
  const p = fetch(`/api/admin/video-poster?url=${encodeURIComponent(url)}`, { cache: 'no-store' })
    .then(async (res) => (res.ok ? (((await res.json()) as { poster?: Poster }).poster ?? null) : null))
    .catch(() => null)
  posterCache.set(url, p)
  return p
}

function formatStart(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export default function VideoView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const ui = useEditorUi()
  const id = useId()
  const url = String(node.attrs.url || '')
  const title = String(node.attrs.title || '')
  const ref: VideoRef | null = parseVideoUrl(url)
  const [poster, setPoster] = useState<Poster>(null)
  const [editingUrl, setEditingUrl] = useState(false)
  const [draftUrl, setDraftUrl] = useState(url)
  const [urlError, setUrlError] = useState('')
  const [focusWithin, setFocusWithin] = useState(false)
  const active = selected || focusWithin

  useEffect(() => {
    let live = true
    setPoster(null)
    if (ref) void loadPoster(url).then((p) => live && setPoster(p))
    return () => {
      live = false
    }
    // ref is derived from url.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  if (!ref) {
    return (
      <NodeViewWrapper className="tt-video" data-selected={selected || undefined}>
        <Text fontSize="13px" color="status.error" contentEditable={false}>
          Not a YouTube or Vimeo link: {url}
        </Text>
      </NodeViewWrapper>
    )
  }

  const provider = VIDEO_PROVIDER_LABEL[ref.provider]
  const watch = videoWatchUrl(ref)

  const applyUrl = () => {
    const next = videoLinkUrl(draftUrl)
    if (!next) {
      setUrlError('That isn’t a YouTube or Vimeo video link.')
      return
    }
    updateAttributes({ url: next })
    setEditingUrl(false)
    setUrlError('')
    ui.announce('Video link changed.')
    requestAnimationFrame(() => editor.commands.focus())
  }

  return (
    <NodeViewWrapper
      className="tt-video"
      data-selected={selected || undefined}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
      }}
    >
      <Box
        className="tt-video-frame"
        data-drag-handle
        position="relative"
        w="100%"
        sx={{ aspectRatio: '16 / 9' }}
        borderRadius="lg"
        overflow="hidden"
        border="1px solid"
        borderColor="page.border"
        bg="page.bg-elevated"
        contentEditable={false}
        suppressContentEditableWarning
      >
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster.src} alt="" width={poster.width} height={poster.height} draggable={false} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Box
            aria-hidden
            position="absolute"
            inset={0}
            style={{
              backgroundImage: 'radial-gradient(circle, var(--dot-color) 1px, transparent 1px), radial-gradient(circle at 85% 0%, var(--accent-soft), transparent 55%)',
              backgroundSize: '8px 8px, 100% 100%',
            }}
          />
        )}
        {poster ? <Box aria-hidden position="absolute" inset={0} style={{ backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.62), rgba(0,0,0,0) 55%)' }} /> : null}
        <Flex
          aria-hidden
          position="absolute"
          top="50%"
          left="50%"
          transform="translate(-50%, -50%)"
          align="center"
          justify="center"
          w="60px"
          h="42px"
          borderRadius="12px"
          bg="rgba(0,0,0,0.72)"
          color="white"
        >
          <PlayIcon size="md" fill="currentColor" />
        </Flex>
        <Flex
          position="absolute"
          left={3}
          right={3}
          bottom={2.5}
          align="baseline"
          justify="space-between"
          gap={3}
          color={poster ? 'white' : 'page.fg'}
          textShadow={poster ? '0 1px 2px rgba(0,0,0,0.5)' : undefined}
        >
          <Text as="span" fontWeight={500} fontSize="14px" noOfLines={2} minW={0}>
            {title || <Text as="span" opacity={0.75}>Untitled video</Text>}
          </Text>
          <Text as="span" flexShrink={0} fontFamily={MONO} fontSize="11px" letterSpacing="0.08em" textTransform="uppercase" opacity={0.85}>
            {provider}
          </Text>
        </Flex>
      </Box>

      <Box contentEditable={false} suppressContentEditableWarning mt={2}>
        <Input
          size="sm"
          variant="unstyled"
          className="tt-video-title"
          value={title}
          onChange={(e) => updateAttributes({ title: e.target.value || null })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault()
              editor.commands.focus()
            }
          }}
          placeholder="Video title (on the poster; read by screen readers)"
          aria-label="Video title"
          tabIndex={tabStop(active)}
          autoComplete="off"
        />
        <Flex mt={1} gap={3} align="center" wrap="wrap" fontSize="12px" fontFamily={MONO} color="page.fg-secondary" justify="center">
          <span>
            Click-to-load · plays from {VIDEO_PLAYER_HOST[ref.provider]}
            {ref.start ? ` · starts at ${formatStart(ref.start)}` : ''}
            {poster ? '' : ' · poster added when saved'}
          </span>
          {/* 24px targets (WCAG 2.2 SC 2.5.8): the editable text around them is a target too. */}
          <Link href={watch} isExternal color="accent.text" tabIndex={tabStop(active)} display="inline-flex" alignItems="center" minH="24px">
            Open on {provider} ↗
          </Link>
          <Button
            size="xs"
            variant="link"
            color="page.fg-secondary"
            fontFamily={MONO}
            fontWeight={400}
            minH="24px"
            onClick={() => {
              setDraftUrl(url)
              setUrlError('')
              setEditingUrl((v) => !v)
            }}
            aria-expanded={editingUrl}
            aria-controls={`${id}-url`}
            tabIndex={tabStop(active)}
          >
            Change link
          </Button>
        </Flex>
        {editingUrl ? (
          <Box id={`${id}-url`} mt={2} mx="auto" maxW="560px">
            <Text as="label" htmlFor={`${id}-url-input`} display="block" fontSize="12px" color="page.fg-secondary" mb={1}>
              YouTube or Vimeo link
            </Text>
            <Flex gap={2}>
              <Input
                id={`${id}-url-input`}
                size="sm"
                type="url"
                inputMode="url"
                value={draftUrl}
                autoFocus
                onChange={(e) => {
                  setDraftUrl(e.target.value)
                  setUrlError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyUrl()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setEditingUrl(false)
                    editor.commands.focus()
                  }
                }}
                isInvalid={!!urlError}
                aria-describedby={urlError ? `${id}-url-err` : undefined}
                bg="page.bg"
                borderColor="page.border-strong"
                autoComplete="off"
              />
              <Button size="sm" {...primaryButtonProps} onClick={applyUrl} flexShrink={0}>
                Apply
              </Button>
            </Flex>
            {urlError ? (
              <Text id={`${id}-url-err`} role="alert" fontSize="12px" color="status.error" mt={1}>
                {urlError}
              </Text>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </NodeViewWrapper>
  )
}
