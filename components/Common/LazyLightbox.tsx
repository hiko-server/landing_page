import { useState, type ComponentProps } from 'react'
import dynamic from 'next/dynamic'
import type LightboxComponent from './Lightbox'

/**
 * The image viewer, loaded on demand (G5): it is a Chakra Modal animated
 * with framer-motion, interaction-only code that has no business in a page's
 * first-load JavaScript.
 *
 *   - Nothing renders (and nothing downloads) until the viewer is first
 *     opened; `preloadLightbox()` — called when a pointer reaches an image or
 *     an image button gets focus — starts the download earlier, so the
 *     first open is normally instant.
 *   - Once opened, the viewer stays mounted, exactly like an eagerly
 *     imported one: closing it runs the same exit and shared-layout
 *     animation back into its tile.
 */

const loadLightbox = () => import('./Lightbox')

const Lightbox = dynamic(loadLightbox, { ssr: false, loading: () => null })

let requested = false

/** Start downloading the viewer (idempotent, failures ignored: opening retries). */
export function preloadLightbox(): void {
  if (requested) return
  requested = true
  loadLightbox().catch(() => {
    requested = false
  })
}

type Props = ComponentProps<typeof LightboxComponent>

export default function LazyLightbox(props: Props) {
  const [used, setUsed] = useState(false)
  if (!used && props.index !== null && props.index !== undefined) setUsed(true)
  return used ? <Lightbox {...props} /> : null
}
