import { Box, Button, Flex, Text } from '@chakra-ui/react'
import { AddIcon } from '@chakra-ui/icons'
import SortableList from '../shell/SortableList'
import { outlineButtonProps } from '../shell/ui'
import { moveItem, newId, normalizeUrl, stripTs, type BrandItem } from './homeForm'
import { useLogoMetrics, type LogoMeasurement } from './useLogoMetrics'
import { BrandStrip, brandsForDisplay } from '../../BrandShowcase/BrandShowcase'
import { opticalLogoSize, UNMEASURED_LOGO } from '../../../lib/logoSize'
import { snapBrandScale } from '../../../lib/homeShape'
import { LibraryButton, useLibraryPicker, type LibraryRequest } from '../media/LibraryPicker'
import { logoFromLibrary, newLogoFromLibrary } from './libraryPick'
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

/** The image URL as it will be saved (no preview cache-buster, leading slash). */
const cleanImage = (u: string) => normalizeUrl(stripTs(u.trim()))

/** "Optical size 105 × 19 px · content 5.56:1 · ink 23 %" (or why there is none yet). */
function measurementText(measurement: LogoMeasurement | undefined, image: string, scale: number): string {
  if (!image) return 'No image yet.'
  if (measurement === undefined) return 'Measuring…'
  const m = measurement.metrics
  if (!m) {
    return `Not measurable${measurement.reason ? ` (${measurement.reason})` : ''}: shown in the fixed ${UNMEASURED_LOGO.width} × ${UNMEASURED_LOGO.height} px box.`
  }
  const { width, height } = opticalLogoSize(m, snapBrandScale(scale))
  return `Optical size ${width} × ${height} px · content ${m.aspect.toFixed(2)}:1 · ink ${Math.round(m.density * 100)} %`
}

/**
 * Affiliation logos as sortable cards: checkerboard preview (shows
 * transparency) with the logo scale applied, name, link, image URL and a
 * 0.5–2 scale. Same card, drop zone and Undo as the photos.
 *
 * Above the cards, a live preview of the public strip: logos are sized
 * optically from their measured content box and ink (lib/logoSize.ts — the
 * same measurement the save stores), and each card says what was measured,
 * so the scale is only needed for taste.
 *
 * "Library…" (beside the drop zone's button, on each card's image URL and
 * in its ⋯ menu) picks an uploaded logo from the media library; its English
 * alt text names a card that has no name yet (./libraryPick).
 */
export default function BrandsSection({ value, onChange }: SectionProps<BrandItem[]>) {
  const remove = useUndoableRemove(onChange, 'logo')
  const { busy, upload } = useCardUpload()
  const library = useLibraryPicker()
  const patch = (id: string, change: Partial<BrandItem>) =>
    onChange((prev) => prev.map((b) => (b._id === id ? { ...b, ...change } : b)))
  const pickFor = (b: BrandItem, index: number): LibraryRequest => ({
    labels: { title: `Choose logo ${index + 1}${b.name.trim() ? ` (${b.name.trim()})` : ''}`, confirm: 'Use this logo' },
    altLang: 'en',
    current: b.image,
    onPick: (img) => onChange((prev) => prev.map((x) => (x._id === b._id ? { ...x, ...logoFromLibrary(x, img) } : x))),
  })
  const measured = useLogoMetrics(value.map((b) => (b.image ? cleanImage(b.image) : '')))
  const preview = brandsForDisplay(
    value.map((b) => {
      const image = b.image ? cleanImage(b.image) : ''
      return { name: b.name, href: '', image, scale: b.scale, metrics: measured.get(image)?.metrics ?? undefined }
    }),
  )

  return (
    <Box>
      <UploadDropZone
        label="Add logos"
        hint="Drop logo files here or pick them — SVG, PNG or WebP keep transparency."
        onUploaded={(url, file) =>
          onChange((prev) => [...prev, { _id: newId(), name: nameFromFile(file), href: '', image: url, scale: 1 }])
        }
        extra={
          <LibraryButton
            size="sm"
            context="— add a logo from the media library"
            onClick={() =>
              library.open({
                labels: { title: 'Add a logo from the library', confirm: 'Add logo' },
                altLang: 'en',
                onPick: (img) => onChange((prev) => [...prev, { _id: newId(), ...newLogoFromLibrary(img) }]),
              })
            }
          >
            From library…
          </LibraryButton>
        }
      />
      {preview.length > 0 ? (
        <Box as="section" aria-label="Brand strip preview" mb={4} p={4} border="1px solid" borderColor="page.border" borderRadius="card" bg="page.bg">
          <Text textStyle="label" color="page.fg-secondary" mb={3}>
            Preview
          </Text>
          <BrandStrip brands={preview} />
          <Text mt={3} fontSize="xs" color="page.fg-secondary">
            Each logo is sized from its measured shape and ink, cropped to its content, and re-measured when you save.
            Logo scale multiplies that size.
          </Text>
        </Box>
      ) : null}
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
              onLibrary={() => library.open(pickFor(b, index))}
              onMoveTop={() => onChange((prev) => moveItem(prev, prev.findIndex((x) => x._id === b._id), 0))}
              onRemove={() => remove(value, index)}
            >
              <TextField label="Name" value={b.name} onChange={(v) => patch(b._id, { name: v })} placeholder="Organisation name (alt text)" />
              <TextField label="Link" value={b.href} onChange={(v) => patch(b._id, { href: v })} placeholder="https://…" invalid={linkError(b.href)} />
              <TextField
                label="Image URL"
                value={b.image}
                onChange={(v) => patch(b._id, { image: v })}
                placeholder="/images/brand/…"
                invalid={linkError(b.image)}
                extra={<LibraryButton variant="ghost" color="accent.text" context={`for logo ${index + 1}`} onClick={() => library.open(pickFor(b, index))} />}
              />
              <ScaleField value={b.scale} onChange={(v) => patch(b._id, { scale: v })} />
              <Text fontSize="xs" color="page.fg-secondary" className="tnum">
                {measurementText(b.image ? measured.get(cleanImage(b.image)) : undefined, b.image, b.scale)}
              </Text>
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
      {library.element}
    </Box>
  )
}
