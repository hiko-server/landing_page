import { useRef, useState } from 'react'
import { Box, Button, Flex, Image, Text } from '@chakra-ui/react'
import { uploadHomeImage } from '../home/imageUpload'
import { stripTs } from '../home/homeForm'
import { monoFont, useStudioTokens } from './fields'

/**
 * Studio control for the PDF-only photo (E10). Uploads through the shared
 * image pipeline (downscaled, EXIF / GPS stripped on the server) and stores
 * the /uploads/… path. "Use the EN / 中文 photo" copies the other
 * language's photo when this one has none. The value never reaches a public
 * page (lib/cvVisibility PRIVATE_SECTION_FIELDS).
 */
export default function PhotoField({
  value,
  onChange,
  twin,
  otherLabel,
}: {
  value: string
  onChange: (v: string) => void
  /** The other language's photo, if any. */
  twin?: unknown
  otherLabel: string
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const { border, dim, surfaceAlt } = useStudioTokens()
  const twinPhoto = typeof twin === 'string' && twin.trim() && twin.trim() !== value ? twin.trim() : ''

  const upload = async (file: File) => {
    setBusy(true)
    setStatus('Uploading…')
    try {
      const { url, warning } = await uploadHomeImage(file)
      onChange(stripTs(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost'))
      setStatus(warning ? `Uploaded — ${warning}` : 'Photo uploaded. Save the CV to keep it.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Flex gap={4} align="flex-start" wrap="wrap">
      <Box
        w="90px"
        h="120px"
        flexShrink={0}
        borderRadius="md"
        border="1px dashed"
        borderColor={border}
        bg={surfaceAlt}
        overflow="hidden"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        {value ? (
          <Image src={value} alt="Current PDF photo" w="100%" h="100%" objectFit="cover" />
        ) : (
          <Text fontFamily={monoFont} fontSize="10px" color={dim} textAlign="center" px={2}>
            no photo
          </Text>
        )}
      </Box>
      <Flex direction="column" gap={2} minW={0} flex="1 1 200px">
        <Flex gap={2} wrap="wrap">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} isLoading={busy} loadingText="Uploading">
            {value ? 'Replace photo…' : 'Upload photo…'}
          </Button>
          {value ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange('')
                setStatus('Photo removed. Save the CV to apply.')
              }}
            >
              Remove
            </Button>
          ) : null}
          {twinPhoto && !value ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange(twinPhoto)
                setStatus(`Using the ${otherLabel} photo.`)
              }}
            >
              Use the {otherLabel} photo
            </Button>
          ) : null}
        </Flex>
        <Text fontSize="11px" color={dim} role="status" aria-live="polite" minH="1.4em">
          {status}
        </Text>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ''
          }}
        />
      </Flex>
    </Flex>
  )
}
