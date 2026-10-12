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
import { uploadImageFile } from './http'
import { inputProps, outlineButtonProps } from './ui'

/**
 * Cover image picker for blog posts and case studies: URL input, upload
 * (failures — network, 413, non-JSON — become a toast, never an unhandled
 * rejection) and a preview.
 */
export default function CoverImageField({
  value,
  onChange,
}: {
  value: string
  onChange: (url: string) => void
}) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const helpId = useId()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const { url, warning } = await uploadImageFile(file)
      onChange(url)
      toast({
        status: warning ? 'warning' : 'success',
        title: 'Cover uploaded',
        description: warning,
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
      <FormLabel fontSize="13px">Cover image</FormLabel>
      <Flex gap={4} align="flex-start" direction={{ base: 'column', sm: 'row' }}>
        {value ? (
          <Image
            src={value}
            alt="Cover preview"
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
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="/uploads/cover.png or https://…"
            aria-describedby={helpId}
          />
          <FormHelperText id={helpId} fontSize="xs" color="page.fg-secondary">
            JPEG, PNG, WebP, GIF or AVIF up to 8 MB.
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
              <Button
                size="xs"
                variant="ghost"
                color="page.fg-secondary"
                onClick={() => onChange('')}
              >
                Remove
              </Button>
            ) : null}
          </Flex>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onFile}
            aria-hidden
            tabIndex={-1}
          />
        </Box>
      </Flex>
    </FormControl>
  )
}
