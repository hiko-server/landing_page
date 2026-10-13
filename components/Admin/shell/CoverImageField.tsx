import React, { useId, useRef, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Image,
  Input,
  useToast,
} from '@chakra-ui/react'
import { UPLOAD_ACCEPT, altFromFileName, uploadImage } from '../editor/upload'
import { inputProps, outlineButtonProps } from './ui'

/**
 * Cover image picker for blog posts and case studies: URL input, upload
 * through the image pipeline (resized, WebP variants; failures — network,
 * 413, unsupported type — become a toast, never an unhandled rejection), a
 * preview, and optionally the cover's alt text.
 */
export default function CoverImageField({
  value,
  onChange,
  inputId,
  alt,
  onAltChange,
}: {
  value: string
  onChange: (url: string) => void
  /** id of the URL input (the publish checklist links to it). */
  inputId?: string
  /** Alt text of the cover, when the collection stores one. */
  alt?: string
  onAltChange?: (alt: string) => void
}) {
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
        {value ? (
          <Image
            src={value}
            alt=""
            maxH="120px"
            maxW={{ base: '100%', sm: '200px' }}
            objectFit="cover"
            borderRadius="md"
            border="1px solid"
            borderColor="page.border"
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
            JPEG, PNG, WebP or GIF up to 8 MB. Large images are resized and get responsive versions.
          </FormHelperText>
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
