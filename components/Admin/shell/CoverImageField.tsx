import React, { useEffect, useId, useRef, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Image,
  Input,
  Text,
  useToast,
} from '@chakra-ui/react'
import { UPLOAD_ACCEPT, altFromFileName, uploadImage } from '../editor/upload'
import { inputProps, MONO, outlineButtonProps, warnTextProps } from './ui'
import { cleanFocus, COVER_RECOMMENDED_MIN as COVER_RECOMMENDED, COVER_SHARP_MIN as COVER_SHARP, focusPoint } from '../../../lib/caseStudy'

/**
 * Cover image picker for blog posts and case studies: URL input, upload
 * through the image pipeline (resized, WebP variants; failures — network,
 * 413, unsupported type — become a toast, never an unhandled rejection), a
 * preview, and optionally the cover's alt text.
 *
 * The preview reports the image's real size (onMeasure, for the publish
 * checklist) and says when it is too small: under COVER_SHARP px the site
 * draws it at its own size on a panel instead of stretching it (D2).
 * With `onFocusChange` the preview is the 16:10 crop the site uses, and a
 * click — or the arrow keys on the marker — sets the focal point the crop
 * keeps in view ("x% y%").
 */

export type CoverSize = { width: number; height: number }

function FocusPicker({ src, focus, onChange, onMeasure }: { src: string; focus: string; onChange: (f: string) => void; onMeasure: (s: CoverSize | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const { x, y } = focusPoint(focus)
  const set = (nx: number, ny: number) => {
    const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)))
    onChange(cleanFocus(`${clamp(nx)}% ${clamp(ny)}%`))
  }
  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || !r.width || !r.height) return
    set(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100)
  }
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const m = moves[e.key]
    if (!m) return
    e.preventDefault()
    set(x + m[0], y + m[1])
  }
  return (
    <Box w="100%" maxW="320px">
      <Box
        ref={box}
        position="relative"
        borderRadius="md"
        overflow="hidden"
        border="1px solid"
        borderColor="page.border"
        bg="page.bg-elevated"
        cursor="crosshair"
        sx={{ aspectRatio: '16 / 10', touchAction: 'none' }}
        onPointerDown={onPointer}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => onMeasure({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
          onError={() => onMeasure(null)}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${x}% ${y}%`, pointerEvents: 'none' }}
        />
        <Box
          as="button"
          type="button"
          position="absolute"
          left={`${x}%`}
          top={`${y}%`}
          transform="translate(-50%, -50%)"
          w="22px"
          h="22px"
          borderRadius="full"
          border="2px solid white"
          boxShadow="0 0 0 1px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.5)"
          bg="rgba(79,70,229,0.55)"
          aria-label={`Focal point ${Math.round(x)}% from the left, ${Math.round(y)}% from the top. Arrow keys move it (Shift: faster).`}
          onKeyDown={onKey}
          onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
        />
      </Box>
      <Flex mt={1.5} justify="space-between" align="center" gap={2}>
        <Text fontSize="11px" fontFamily={MONO} color="page.fg-secondary" className="tnum">
          Focal point {Math.round(x)}% {Math.round(y)}%
        </Text>
        <Button size="xs" variant="ghost" color="page.fg-secondary" onClick={() => onChange('')} isDisabled={!cleanFocus(focus)}>
          Centre
        </Button>
      </Flex>
    </Box>
  )
}

function SizeNote({ size }: { size: CoverSize | null }) {
  if (!size) return null
  const dims = `${size.width} × ${size.height} px`
  if (size.width < COVER_SHARP) {
    return (
      <Text fontSize="xs" {...warnTextProps} mt={1.5} role="status">
        {dims} — too small to fill the cover: the site shows it at its own size on a tinted panel. Upload one at least {COVER_RECOMMENDED} px wide.
      </Text>
    )
  }
  if (size.width < COVER_RECOMMENDED) {
    return (
      <Text fontSize="xs" {...warnTextProps} mt={1.5} role="status">
        {dims} — fine, but {COVER_RECOMMENDED} px or wider stays sharp on large and high-density screens.
      </Text>
    )
  }
  return (
    <Text fontSize="xs" color="page.fg-secondary" mt={1.5} className="tnum">
      {dims}
    </Text>
  )
}

export default function CoverImageField({
  value,
  onChange,
  inputId,
  alt,
  onAltChange,
  focus,
  onFocusChange,
  onMeasure,
}: {
  value: string
  onChange: (url: string) => void
  /** id of the URL input (the publish checklist links to it). */
  inputId?: string
  /** Alt text of the cover, when the collection stores one. */
  alt?: string
  onAltChange?: (alt: string) => void
  /** Focal point ("x% y%"), when the collection stores one. */
  focus?: string
  onFocusChange?: (focus: string) => void
  /** The loaded preview's real size (null while unknown or when it fails to load). */
  onMeasure?: (size: CoverSize | null) => void
}) {
  const [size, setSize] = useState<CoverSize | null>(null)
  const measure = (s: CoverSize | null) => {
    setSize(s)
    onMeasure?.(s)
  }
  // A new URL: the old size no longer applies.
  useEffect(() => {
    setSize(null)
    onMeasure?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const helpId = useId()
  const autoId = useId()
  const altId = useId()
  const urlId = inputId || autoId

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const img = await uploadImage(file)
      onChange(img.url)
      if (onAltChange && !alt?.trim()) onAltChange(altFromFileName(file.name))
      toast({
        status: img.warning ? 'warning' : 'success',
        title: 'Cover uploaded',
        description: img.warning || (img.variants.length ? `Responsive sizes: ${img.variants.length + 1}` : undefined),
        position: 'bottom-right',
      })
    } catch (err) {
      toast({
        status: 'error',
        title: 'Cover upload failed',
        description: err instanceof Error ? err.message : String(err),
        position: 'bottom-right',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <FormControl>
      <FormLabel fontSize="13px" htmlFor={urlId}>
        Cover image
      </FormLabel>
      <Flex gap={4} align="flex-start" direction={{ base: 'column', sm: 'row' }}>
        {value && onFocusChange ? (
          <FocusPicker src={value} focus={focus || ''} onChange={onFocusChange} onMeasure={measure} />
        ) : value ? (
          <Image
            src={value}
            alt=""
            maxH="120px"
            maxW={{ base: '100%', sm: '200px' }}
            objectFit="cover"
            borderRadius="md"
            border="1px solid"
            borderColor="page.border"
            onLoad={(e) => measure({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
            onError={() => measure(null)}
          />
        ) : null}
        <Box flex="1" w="100%">
          <Input
            {...inputProps}
            id={urlId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="/uploads/cover.png or https://…"
            aria-describedby={helpId}
          />
          <FormHelperText id={helpId} fontSize="xs" color="page.fg-secondary">
            JPEG, PNG, WebP or GIF up to 8 MB, ideally {COVER_RECOMMENDED} px wide or more. Large images are resized and get responsive versions.
          </FormHelperText>
          {value ? <SizeNote size={size} /> : null}
          <Flex mt={2} gap={2}>
            <Button
              size="xs"
              {...outlineButtonProps}
              onClick={() => fileRef.current?.click()}
              isLoading={uploading}
              loadingText="Uploading"
            >
              Upload…
            </Button>
            {value ? (
              <Button size="xs" variant="ghost" color="page.fg-secondary" onClick={() => onChange('')}>
                Remove
              </Button>
            ) : null}
          </Flex>
          {onAltChange && value ? (
            <Box mt={3}>
              <FormLabel htmlFor={altId} fontSize="12px" mb={1} color="page.fg-secondary">
                Cover alt text
              </FormLabel>
              <Input
                {...inputProps}
                id={altId}
                size="sm"
                value={alt || ''}
                onChange={(e) => onAltChange(e.target.value)}
                placeholder="What the cover shows"
              />
            </Box>
          ) : null}
          <input ref={fileRef} type="file" accept={UPLOAD_ACCEPT} hidden onChange={onFile} aria-hidden tabIndex={-1} />
        </Box>
      </Flex>
    </FormControl>
  )
}
