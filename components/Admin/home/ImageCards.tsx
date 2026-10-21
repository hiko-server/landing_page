import React, { useCallback, useId, useRef, useState } from 'react'
import {
  AspectRatio,
  Badge,
  Box,
  Button,
  CloseButton,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  IconButton,
  Input,
  List,
  ListItem,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Spinner,
  Switch,
  Text,
  useToast,
} from '@chakra-ui/react'
import { FaEllipsisH } from 'react-icons/fa'
import { FiUploadCloud } from 'react-icons/fi'
import { HOME_LIMITS, snapBrandScale } from '../../../lib/homeShape'
import { SortableHandle } from '../shell/SortableList'
import { MONO, inputProps, outlineButtonProps } from '../shell/ui'
import { insertAt, isLinkUrl, normalizeUrl } from './homeForm'
import { uploadHomeImage } from './imageUpload'

/** Shared building blocks of the Photos and Brands sections. */

export type Updater<T> = React.Dispatch<React.SetStateAction<T>>
export type SectionProps<T> = { value: T; onChange: Updater<T> }

const UNDO_MS = 8000

/**
 * Remove an item with an "Undo" toast (8 s) that puts it back at its
 * original index — unless it was restored or re-added meanwhile.
 */
export function useUndoableRemove<T extends { _id: string }>(onChange: Updater<T[]>, noun: string) {
  const toast = useToast()
  return useCallback(
    (items: T[], index: number) => {
      const item = items[index]
      if (!item) return
      onChange((prev) => prev.filter((it) => it._id !== item._id))
      const id = `undo-${item._id}`
      toast.close(id)
      toast({
        id,
        duration: UNDO_MS,
        position: 'bottom',
        render: ({ onClose }) => (
          <HStack
            bg="page.fg"
            color="page.bg"
            px={4}
            py={2.5}
            borderRadius="lg"
            boxShadow="xl"
            spacing={4}
            fontSize="13px"
            maxW="calc(100vw - 32px)"
            role="status"
          >
            <Text>Removed {noun}</Text>
            <Button
              size="xs"
              variant="outline"
              color="inherit"
              borderColor="currentColor"
              _hover={{ bg: 'rgba(127,127,127,0.18)' }}
              onClick={() => {
                onChange((prev) => (prev.some((it) => it._id === item._id) ? prev : insertAt(prev, index, item)))
                onClose()
              }}
            >
              Undo
            </Button>
          </HStack>
        ),
      })
    },
    [onChange, toast, noun],
  )
}

type UploadRow = { key: string; name: string; state: 'queued' | 'uploading' | 'done' | 'error'; message?: string }

/**
 * Drop zone (and file picker) for several images at once. Files upload one
 * after another; each finished upload calls `onUploaded(url)` right away, so
 * cards appear as files complete. Per-file progress is listed below.
 * `extra` sits beside the button (the media library's "Library…").
 */
export function UploadDropZone({ label, hint, onUploaded, extra }: { label: string; hint: string; onUploaded: (url: string, file: File) => void; extra?: React.ReactNode }) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [over, setOver] = useState(false)
  const [rows, setRows] = useState<UploadRow[]>([])
  const busy = rows.some((r) => r.state === 'queued' || r.state === 'uploading')
  const hintId = useId()

  const run = async (files: File[]) => {
    const images = files.filter((f) => !f.type || f.type.startsWith('image/'))
    if (images.length < files.length) {
      toast({ status: 'warning', title: 'Only images can be added here', position: 'bottom-right' })
    }
    if (!images.length) return
    const batch = images.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name || `image ${i + 1}`, state: 'queued' as const }))
    setRows((prev) => [...prev.filter((r) => r.state === 'error'), ...batch])
    for (let i = 0; i < images.length; i++) {
      const key = batch[i].key
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, state: 'uploading' } : r)))
      try {
        const { url, warning } = await uploadHomeImage(images[i])
        onUploaded(url, images[i])
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, state: 'done', message: warning } : r)))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, state: 'error', message } : r)))
      }
    }
    // Keep failures visible; finished uploads are already cards.
    setRows((prev) => prev.filter((r) => r.state === 'error' || (r.state === 'done' && r.message)))
  }

  return (
    <Box mb={4}>
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        align="center"
        justify="center"
        gap={3}
        px={4}
        py={5}
        border="1px dashed"
        borderColor={over ? 'accent.500' : 'page.border-strong'}
        bg={over ? 'var(--accent-soft)' : 'page.bg-elevated'}
        borderRadius="lg"
        textAlign="center"
        transition="border-color 160ms var(--ease-out-quart), background-color 160ms var(--ease-out-quart)"
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer.types).includes('Files')) return
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files?.length) return
          e.preventDefault()
          setOver(false)
          void run(Array.from(e.dataTransfer.files))
        }}
      >
        <Box as={FiUploadCloud} boxSize={5} color="page.fg-secondary" aria-hidden />
        <Text fontSize="sm" color="page.fg-secondary" id={hintId}>
          {hint}
        </Text>
        <HStack spacing={2}>
          <Button size="sm" {...outlineButtonProps} onClick={() => inputRef.current?.click()} isLoading={busy} loadingText="Uploading" aria-describedby={hintId}>
            {label}
          </Button>
          {extra}
        </HStack>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const files = Array.from(e.target.files || [])
            e.target.value = ''
            void run(files)
          }}
        />
      </Flex>
      <List mt={rows.length ? 2 : 0} spacing={1} aria-live="polite" fontFamily={MONO} fontSize="11px">
        {rows.map((r) => (
          <ListItem key={r.key} display="flex" alignItems="center" gap={2} color={r.state === 'error' ? 'red.600' : 'page.fg-secondary'} _dark={r.state === 'error' ? { color: 'red.300' } : undefined}>
            {r.state === 'uploading' ? <Spinner size="xs" /> : null}
            <Text as="span" noOfLines={1} flex={1} minW={0}>
              {r.name} —{' '}
              {r.state === 'queued' ? 'waiting' : r.state === 'uploading' ? 'uploading…' : r.state === 'done' ? r.message || 'added' : r.message}
            </Text>
            {r.state === 'error' || r.state === 'done' ? (
              <CloseButton size="sm" aria-label={`Dismiss ${r.name}`} onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} />
            ) : null}
          </ListItem>
        ))}
      </List>
    </Box>
  )
}

const CHECKERBOARD =
  'repeating-conic-gradient(var(--chakra-colors-page-bg-overlay) 0% 25%, var(--chakra-colors-page-bg) 0% 50%) 50% / 16px 16px'

/** 16:10 preview; brands get a checkerboard (transparency) and the logo scale applied. */
export function ImagePreview({ src, alt, variant, scale = 1 }: { src: string; alt: string; variant: 'photo' | 'brand'; scale?: number }) {
  return (
    <AspectRatio ratio={16 / 10} borderRadius="md" overflow="hidden" border="1px solid" borderColor="page.border" bg={variant === 'brand' ? undefined : 'page.bg-elevated'} sx={variant === 'brand' ? { background: CHECKERBOARD } : undefined}>
      {src ? (
        <Box
          as="img"
          src={normalizeUrl(src)}
          alt={alt}
          loading="lazy"
          decoding="async"
          w="100%"
          h="100%"
          objectFit={variant === 'brand' ? 'contain' : 'cover'}
          // AspectRatio forces `object-fit: cover` on a direct <img> child
          // (".css-… > img"), which cropped logos; the doubled class wins.
          sx={variant === 'brand' ? { '&&': { objectFit: 'contain' } } : undefined}
          p={variant === 'brand' ? 4 : 0}
          style={variant === 'brand' ? { transform: `scale(${snapBrandScale(scale)})` } : undefined}
        />
      ) : (
        <Flex align="center" justify="center" color="page.fg-secondary" fontSize="xs" fontFamily={MONO}>
          no image
        </Flex>
      )}
    </AspectRatio>
  )
}

/** Card chrome: preview, a header with handle / number / extras / ⋯ menu, then fields. */
export function CardShell({
  index,
  noun,
  preview,
  headerExtra,
  onReplace,
  onLibrary,
  onMoveTop,
  onRemove,
  children,
  replacing,
}: {
  index: number
  noun: string
  preview: React.ReactNode
  headerExtra?: React.ReactNode
  onReplace: (file: File) => void
  /** Replace the image with one from the media library. */
  onLibrary?: () => void
  onMoveTop: () => void
  onRemove: () => void
  children: React.ReactNode
  replacing?: boolean
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  return (
    // A named group, so a screen reader says whose fields these are ("Photo 3").
    <Box role="group" aria-label={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${index + 1}`} border="1px solid" borderColor="page.border" borderRadius="lg" bg="page.bg" p={3} h="100%">
      <Flex align="center" gap={1} mb={2}>
        <SortableHandle label={`Reorder ${noun} ${index + 1}`} />
        <Text fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="tnum">
          [{String(index + 1).padStart(2, '0')}]
        </Text>
        {replacing ? <Spinner size="xs" ml={1} aria-label="Replacing image" /> : null}
        <HStack ml="auto" spacing={1}>
          {headerExtra}
          <Menu isLazy placement="bottom-end">
            <MenuButton as={IconButton} aria-label={`${noun} ${index + 1} actions`} icon={<FaEllipsisH />} size="sm" variant="ghost" color="page.fg-secondary" />
            <MenuList bg="page.bg-elevated" borderColor="page.border" fontSize="sm" zIndex={20}>
              <MenuItem bg="transparent" _hover={{ bg: 'page.bg-overlay' }} _focus={{ bg: 'page.bg-overlay' }} onClick={() => fileRef.current?.click()}>
                Replace image…
              </MenuItem>
              {onLibrary ? (
                <MenuItem bg="transparent" _hover={{ bg: 'page.bg-overlay' }} _focus={{ bg: 'page.bg-overlay' }} onClick={onLibrary}>
                  Replace from library…
                </MenuItem>
              ) : null}
              <MenuItem bg="transparent" _hover={{ bg: 'page.bg-overlay' }} _focus={{ bg: 'page.bg-overlay' }} onClick={onMoveTop} isDisabled={index === 0}>
                Move to top
              </MenuItem>
              <MenuItem bg="transparent" color="red.600" _dark={{ color: 'red.300' }} _hover={{ bg: 'page.bg-overlay' }} _focus={{ bg: 'page.bg-overlay' }} onClick={onRemove}>
                Remove
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) onReplace(f)
          }}
        />
      </Flex>
      {preview}
      <Box mt={3} display="grid" gap={3}>
        {children}
      </Box>
    </Box>
  )
}

/** Labelled text input; `invalid` shows the message under it. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  invalid,
  help,
  extra,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  invalid?: string
  help?: React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <FormControl isInvalid={!!invalid}>
      <Flex align="center" justify="space-between" gap={2} mb={1}>
        <FormLabel m={0} fontSize="xs" color="page.fg-secondary">
          {label}
        </FormLabel>
        {extra}
      </Flex>
      <Input size="sm" {...inputProps} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {invalid ? <FormErrorMessage fontSize="xs">{invalid}</FormErrorMessage> : null}
      {help && !invalid ? (
        <Text mt={1} fontSize="xs" color="page.fg-secondary">
          {help}
        </Text>
      ) : null}
    </FormControl>
  )
}

export const linkError = (u: string) => (u && !isLinkUrl(u) ? 'Start with / or http(s)://' : undefined)

/** The "alt missing" chip shown on photos without a description. */
export function AltMissingChip() {
  return (
    <Badge variant="outline" colorScheme="orange" fontFamily={MONO} fontSize="9px" textTransform="none">
      alt missing
    </Badge>
  )
}

/** Visible switch for a photo. */
export function VisibleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const id = useId()
  return (
    <HStack spacing={1.5}>
      <Text as="label" htmlFor={id} fontSize="xs" color="page.fg-secondary">
        Visible
      </Text>
      <Switch id={id} size="sm" colorScheme="purple" isChecked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
    </HStack>
  )
}

/** 0.5–2 logo scale, step 0.05. */
export function ScaleField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { brandScaleMin: min, brandScaleMax: max, brandScaleStep: step } = HOME_LIMITS
  return (
    <FormControl>
      <FormLabel mb={1} fontSize="xs" color="page.fg-secondary">
        Logo scale
      </FormLabel>
      <NumberInput
        size="sm"
        min={min}
        max={max}
        step={step}
        precision={2}
        value={value}
        onChange={(_s, n) => {
          if (Number.isFinite(n)) onChange(n)
        }}
        onBlur={() => onChange(snapBrandScale(value))}
        clampValueOnBlur
        focusBorderColor="accent.500"
      >
        <NumberInputField className="tnum" />
        <NumberInputStepper>
          <NumberIncrementStepper />
          <NumberDecrementStepper />
        </NumberInputStepper>
      </NumberInput>
    </FormControl>
  )
}

/** Run an upload for one card, with toasts for warnings and failures. */
export function useCardUpload() {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const upload = useCallback(
    async (key: string, file: File, apply: (url: string) => void) => {
      setBusy(key)
      try {
        const { url, warning } = await uploadHomeImage(file)
        apply(url)
        toast({ status: warning ? 'warning' : 'success', title: 'Image replaced', description: warning, position: 'bottom-right' })
      } catch (err) {
        toast({ status: 'error', title: 'Image upload failed', description: err instanceof Error ? err.message : String(err), position: 'bottom-right' })
      } finally {
        setBusy(null)
      }
    },
    [toast],
  )
  return { busy, upload }
}
