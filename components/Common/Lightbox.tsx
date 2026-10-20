import { useState } from 'react'
import { Box, Flex, IconButton, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Text } from '@chakra-ui/react'
import { motion, useReducedMotion, type PanInfo } from 'framer-motion'
import { ArrowLeftIcon, ArrowRightIcon } from '../Icons/ui/content'
import { motionTransition } from '../../theme/tokens'
import { fillUi } from '../../lib/uiStrings'
import { CONTENT_UI } from '../../lib/uiStrings/content'
import { useUiLang } from './uiLang'

/**
 * Full-screen image viewer shared by the home photo strip and article images.
 *
 *   <LayoutGroup>
 *     …tiles: <motion.div layoutId={`${prefix}-${i}`}><motion.img layout …/></motion.div>
 *     <Lightbox items={items} index={open} onIndexChange={setOpen} layoutIdPrefix={prefix} />
 *   </LayoutGroup>
 *
 * - With `layoutIdPrefix`, the image the viewer was opened on morphs out of
 *   (and back into) its tile through a framer shared layout (spring 300/30).
 *   After stepping to another image the viewer cross-fades instead, so no
 *   picture ever flies in from behind the overlay. Without a prefix, or under
 *   reduced motion, every image simply fades in over 120 ms.
 * - ← / → step (wrapping), Esc closes, and a vertical drag past 120 px
 *   closes. Focus is trapped while open and returns to the opener on close.
 * - `n / N` counter in tabular mono; the caption fades in under the image.
 */

export type LightboxItem = {
  src: string
  srcSet?: string
  alt: string
  caption?: string
  width?: number
  height?: number
}

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const
const FADE = motionTransition('fast')
const DRAG_CLOSE_PX = 120
/** Vertical room kept for the top bar, caption and padding. */
const CHROME_PX = 168

export default function Lightbox({
  items,
  index,
  onIndexChange,
  layoutIdPrefix,
}: {
  items: LightboxItem[]
  index: number | null
  onIndexChange: (i: number | null) => void
  layoutIdPrefix?: string
}) {
  const reduce = useReducedMotion()
  // Labels in the surrounding article's language (lib/uiStrings), English elsewhere.
  const t = CONTENT_UI[useUiLang()]
  const count = items.length
  const isOpen = index !== null && index >= 0 && index < count
  const current = isOpen ? items[index] : null

  // The index the viewer was opened on, and whether the visitor has stepped
  // away from it since (derived during render so the first open frame
  // already carries the shared layoutId).
  const [origin, setOrigin] = useState<number | null>(null)
  const [stepped, setStepped] = useState(false)
  if (isOpen && origin === null) setOrigin(index)
  if (!isOpen && origin !== null) {
    setOrigin(null)
    setStepped(false)
  }
  if (isOpen && origin !== null && index !== origin && !stepped) setStepped(true)

  const shared = Boolean(layoutIdPrefix) && !reduce && !stepped && isOpen && index === (origin ?? index)
  const close = () => onIndexChange(null)
  const step = (delta: number) => {
    if (!isOpen || count < 2) return
    onIndexChange((((index + delta) % count) + count) % count)
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.y) > DRAG_CLOSE_PX) close()
  }

  const ratio = current?.width && current?.height ? current.width / current.height : null

  return (
    <Modal isOpen={isOpen} onClose={close} size="full" motionPreset="none" returnFocusOnClose blockScrollOnMount>
      <ModalOverlay bg="rgba(5,5,5,0.92)" />
      <ModalContent
        bg="transparent"
        color="white"
        boxShadow="none"
        m={0}
        borderRadius={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            step(1)
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault()
            step(-1)
          }
        }}
      >
        <ModalHeader className="sr-only">
          {current ? fillUi(current.alt ? t.imageOfAlt : t.imageOf, { i: index! + 1, n: count, alt: current.alt || '' }) : t.imageViewer}
        </ModalHeader>

        <Flex
          position="absolute"
          top={0}
          insetInline={0}
          h="56px"
          px={{ base: 4, md: 6 }}
          align="center"
          justify="space-between"
          zIndex={2}
          pointerEvents="none"
        >
          <Text
            as="span"
            fontFamily={monoFont}
            fontSize="12px"
            letterSpacing="0.06em"
            color="whiteAlpha.800"
            sx={{ fontVariantNumeric: 'tabular-nums' }}
            aria-hidden
          >
            {current ? `${index! + 1} / ${count}` : ''}
          </Text>
        </Flex>
        <ModalCloseButton
          aria-label={t.closeImageViewer}
          top={2}
          right={{ base: 2, md: 4 }}
          w="40px"
          h="40px"
          color="white"
          zIndex={3}
          _hover={{ bg: 'whiteAlpha.200' }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
        />

        <ModalBody
          p={0}
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          minH="100dvh"
          px={{ base: 3, md: 20 }}
          pt="56px"
          pb={6}
          onClick={(e) => {
            // A click on the backdrop (not on the image or a control) closes.
            if (e.target === e.currentTarget) close()
          }}
        >
          {current && (
            <motion.div
              // Fixed-position container: tells framer to measure from here.
              layoutRoot
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '100%' }}
            >
              <motion.div
                key={shared ? 'shared' : `fade-${index}`}
                layoutId={shared ? `${layoutIdPrefix}-${index}` : undefined}
                initial={shared ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={shared ? SPRING : FADE}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.2}
                onDragEnd={onDragEnd}
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: 8,
                  // Single-finger pans go to the drag-to-close gesture; a
                  // two-finger pinch still zooms the image natively.
                  touchAction: 'pinch-zoom',
                  cursor: 'grab',
                  maxWidth: '100%',
                  ...(ratio
                    ? {
                        aspectRatio: `${current.width} / ${current.height}`,
                        width: `min(100%, calc((100dvh - ${CHROME_PX}px) * ${ratio.toFixed(4)}), ${current.width}px)`,
                      }
                    : null),
                }}
              >
                <motion.img
                  layout={shared ? true : undefined}
                  src={current.src}
                  srcSet={current.srcSet}
                  sizes="100vw"
                  alt={current.alt}
                  width={current.width}
                  height={current.height}
                  decoding="async"
                  draggable={false}
                  style={
                    ratio
                      ? { display: 'block', width: '100%', height: '100%', objectFit: 'cover', maxWidth: 'none' }
                      : {
                          display: 'block',
                          width: 'auto',
                          height: 'auto',
                          maxWidth: '100%',
                          maxHeight: `calc(100dvh - ${CHROME_PX}px)`,
                          objectFit: 'contain',
                        }
                  }
                />
              </motion.div>

              <Box minH="1.5em" mt={4} maxW="72ch" textAlign="center" aria-live="polite">
                {current.caption ? (
                  <motion.p
                    key={`caption-${index}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ ...FADE, delay: reduce ? 0 : 0.12 }}
                    style={{ fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,0.86)' }}
                  >
                    {current.caption}
                  </motion.p>
                ) : null}
              </Box>
            </motion.div>
          )}
        </ModalBody>

        {count > 1 && (
          <>
            <IconButton
              aria-label={t.previousImage}
              icon={<ArrowLeftIcon size="sm" />}
              onClick={() => step(-1)}
              position="absolute"
              left={{ base: 2, md: 4 }}
              top="50%"
              transform="translateY(-50%)"
              w="44px"
              h="44px"
              minW="44px"
              borderRadius="full"
              bg="blackAlpha.600"
              color="white"
              zIndex={2}
              _hover={{ bg: 'blackAlpha.800' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
            />
            <IconButton
              aria-label={t.nextImage}
              icon={<ArrowRightIcon size="sm" />}
              onClick={() => step(1)}
              position="absolute"
              right={{ base: 2, md: 4 }}
              top="50%"
              transform="translateY(-50%)"
              w="44px"
              h="44px"
              minW="44px"
              borderRadius="full"
              bg="blackAlpha.600"
              color="white"
              zIndex={2}
              _hover={{ bg: 'blackAlpha.800' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
            />
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
