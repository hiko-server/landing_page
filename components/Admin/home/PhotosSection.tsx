import { Box, Button, Flex, Text } from '@chakra-ui/react'
import { AddIcon } from '@chakra-ui/icons'
import SortableList from '../shell/SortableList'
import { outlineButtonProps } from '../shell/ui'
import { moveItem, newId, type PhotoItem } from './homeForm'
import { LibraryButton, useLibraryPicker, type LibraryRequest } from '../media/LibraryPicker'
import { newPhotoFromLibrary, photoFromLibrary } from './libraryPick'
import {
  AltMissingChip,
  CardShell,
  ImagePreview,
  TextField,
  UploadDropZone,
  VisibleSwitch,
  linkError,
  useCardUpload,
  useUndoableRemove,
  type SectionProps,
} from './ImageCards'

/**
 * Field-notes photos as sortable cards: 16:10 preview, description (used as
 * the alt text), link, visibility, drag handle and a ⋯ menu (replace, move
 * to top, remove with Undo). A drop zone above adds several images at once.
 * "Library…" (beside the drop zone's button, on each card's image URL and
 * in its ⋯ menu) picks an uploaded image from the media library with its
 * alt text in English — the description — and its Chinese default as the
 * Chinese caption (./libraryPick).
 */
export default function PhotosSection({ value, onChange }: SectionProps<PhotoItem[]>) {
  const remove = useUndoableRemove(onChange, 'photo')
  const { busy, upload } = useCardUpload()
  const library = useLibraryPicker()
  const patch = (id: string, change: Partial<PhotoItem>) =>
    onChange((prev) => prev.map((p) => (p._id === id ? { ...p, ...change } : p)))
  const pickFor = (p: PhotoItem, index: number): LibraryRequest => ({
    labels: { title: `Choose photo ${index + 1}`, confirm: 'Use this photo' },
    altLang: 'en',
    current: p.url,
    onPick: (img) => onChange((prev) => prev.map((x) => (x._id === p._id ? { ...x, ...photoFromLibrary(x, img) } : x))),
  })

  return (
    <Box>
      <UploadDropZone
        label="Add photos"
        hint="Drop images here (several at once) or pick files — JPEG, PNG, WebP, GIF, up to 8 MB each."
        onUploaded={(url) => onChange((prev) => [...prev, { _id: newId(), url, describe: '', redirectTo: '', visible: true }])}
        extra={
          <LibraryButton
            size="sm"
            context="— add a photo from the media library"
            onClick={() =>
              library.open({
                labels: { title: 'Add a photo from the library', confirm: 'Add photo' },
                altLang: 'en',
                onPick: (img) => onChange((prev) => [...prev, { _id: newId(), ...newPhotoFromLibrary(img) }]),
              })
            }
          >
            From library…
          </LibraryButton>
        }
      />
      {value.length === 0 ? (
        <Text fontSize="sm" color="page.fg-secondary" mb={3}>
          No photos yet — the field-notes strip stays hidden until you add one.
        </Text>
      ) : (
        <SortableList
          items={value}
          getId={(p) => p._id}
          itemNoun="photo"
          ariaLabel="Photos, in display order"
          layout="grid"
          columns={{ base: 1, md: 2, xl: 3 }}
          onReorder={(from, to) => onChange((prev) => moveItem(prev, from, to))}
          renderOverlay={(p) => (
            <Box w="240px" bg="page.bg" border="1px solid" borderColor="accent.500" borderRadius="lg" p={2} boxShadow="xl">
              <ImagePreview src={p.url} alt="" variant="photo" />
              <Text mt={1.5} fontSize="xs" noOfLines={1}>
                {p.describe || 'Untitled photo'}
              </Text>
            </Box>
          )}
          renderItem={(p, { index }) => (
            <CardShell
              index={index}
              noun="photo"
              replacing={busy === p._id}
              preview={<ImagePreview src={p.url} alt={p.describe || `Photo ${index + 1}`} variant="photo" />}
              headerExtra={<VisibleSwitch checked={p.visible} onChange={(v) => patch(p._id, { visible: v })} label={`Show photo ${index + 1} on the home page`} />}
              onReplace={(file) => void upload(p._id, file, (url) => patch(p._id, { url }))}
              onLibrary={() => library.open(pickFor(p, index))}
              onMoveTop={() => onChange((prev) => moveItem(prev, prev.findIndex((x) => x._id === p._id), 0))}
              onRemove={() => remove(value, index)}
            >
              <TextField
                label="Description / alt text"
                value={p.describe}
                onChange={(v) => patch(p._id, { describe: v })}
                placeholder="What the photo shows"
                extra={p.describe.trim() ? null : <AltMissingChip />}
              />
              <TextField
                label="Link"
                value={p.redirectTo}
                onChange={(v) => patch(p._id, { redirectTo: v })}
                placeholder="https://… or /work/…"
                invalid={linkError(p.redirectTo)}
              />
              <TextField
                label="Image URL"
                value={p.url}
                onChange={(v) => patch(p._id, { url: v })}
                placeholder="/uploads/…"
                invalid={linkError(p.url)}
                extra={<LibraryButton variant="ghost" color="accent.text" context={`for photo ${index + 1}`} onClick={() => library.open(pickFor(p, index))} />}
              />
            </CardShell>
          )}
        />
      )}
      <Flex mt={3}>
        <Button
          size="sm"
          {...outlineButtonProps}
          leftIcon={<AddIcon boxSize={2.5} />}
          onClick={() => onChange((prev) => [...prev, { _id: newId(), url: '', describe: '', redirectTo: '', visible: true }])}
        >
          Add empty photo card
        </Button>
      </Flex>
      {library.element}
    </Box>
  )
}
