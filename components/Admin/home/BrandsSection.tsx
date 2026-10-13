import { Box, Button, Flex, Text } from '@chakra-ui/react'
import { AddIcon } from '@chakra-ui/icons'
import SortableList from '../shell/SortableList'
import { outlineButtonProps } from '../shell/ui'
import { moveItem, newId, type BrandItem } from './homeForm'
import {
  CardShell,
  ImagePreview,
  ScaleField,
  TextField,
  UploadDropZone,
  linkError,
  useCardUpload,
  useUndoableRemove,
  type SectionProps,
} from './ImageCards'

const nameFromFile = (file: File) =>
  (file.name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()

/**
 * Affiliation logos as sortable cards: checkerboard preview (shows
 * transparency) with the logo scale applied, name, link, image URL and a
 * 0.5–2 scale. Same card, drop zone and Undo as the photos.
 */
export default function BrandsSection({ value, onChange }: SectionProps<BrandItem[]>) {
  const remove = useUndoableRemove(onChange, 'logo')
  const { busy, upload } = useCardUpload()
  const patch = (id: string, change: Partial<BrandItem>) =>
    onChange((prev) => prev.map((b) => (b._id === id ? { ...b, ...change } : b)))

  return (
    <Box>
      <UploadDropZone
        label="Add logos"
        hint="Drop logo files here or pick them — SVG, PNG or WebP keep transparency."
        onUploaded={(url, file) =>
          onChange((prev) => [...prev, { _id: newId(), name: nameFromFile(file), href: '', image: url, scale: 1 }])
        }
      />
      {value.length === 0 ? (
        <Text fontSize="sm" color="page.fg-secondary" mb={3}>
          No logos yet — the brand strip stays hidden until you add one.
        </Text>
      ) : (
        <SortableList
          items={value}
          getId={(b) => b._id}
          itemNoun="logo"
          ariaLabel="Brand logos, in display order"
          layout="grid"
          columns={{ base: 1, md: 2, xl: 3 }}
          onReorder={(from, to) => onChange((prev) => moveItem(prev, from, to))}
          renderOverlay={(b) => (
            <Box w="220px" bg="page.bg" border="1px solid" borderColor="accent.500" borderRadius="lg" p={2} boxShadow="xl">
              <ImagePreview src={b.image} alt="" variant="brand" scale={b.scale} />
              <Text mt={1.5} fontSize="xs" noOfLines={1}>
                {b.name || 'Unnamed logo'}
              </Text>
            </Box>
          )}
          renderItem={(b, { index }) => (
            <CardShell
              index={index}
              noun="logo"
              replacing={busy === b._id}
              preview={<ImagePreview src={b.image} alt={b.name ? `${b.name} logo` : `Logo ${index + 1}`} variant="brand" scale={b.scale} />}
              onReplace={(file) => void upload(b._id, file, (url) => patch(b._id, { image: url }))}
              onMoveTop={() => onChange((prev) => moveItem(prev, prev.findIndex((x) => x._id === b._id), 0))}
              onRemove={() => remove(value, index)}
            >
              <TextField label="Name" value={b.name} onChange={(v) => patch(b._id, { name: v })} placeholder="Organisation name (alt text)" />
              <TextField label="Link" value={b.href} onChange={(v) => patch(b._id, { href: v })} placeholder="https://…" invalid={linkError(b.href)} />
              <TextField label="Image URL" value={b.image} onChange={(v) => patch(b._id, { image: v })} placeholder="/images/brand/…" invalid={linkError(b.image)} />
              <ScaleField value={b.scale} onChange={(v) => patch(b._id, { scale: v })} />
            </CardShell>
          )}
        />
      )}
      <Flex mt={3}>
        <Button
          size="sm"
          {...outlineButtonProps}
          leftIcon={<AddIcon boxSize={2.5} />}
          onClick={() => onChange((prev) => [...prev, { _id: newId(), name: '', href: '', image: '', scale: 1 }])}
        >
          Add empty logo card
        </Button>
      </Flex>
    </Box>
  )
}
