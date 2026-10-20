import React, { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button, VisuallyHidden, type ButtonProps } from '@chakra-ui/react'
import type { MediaFormat } from '../../../lib/media/types'
import type { PickedImage, PickerLabels } from './MediaPicker'
import { outlineButtonProps } from '../shell/ui'

/**
 * The media library for the image fields outside the post editor
 * (followups-3): the home editor's field-note photos, affiliation logos and
 * portrait, and CV Studio's PDF photo. One picker per editor section
 * (`useLibraryPicker`), opened with the field's own request — its labels,
 * alt-text language, formats and current value — and loaded on demand like
 * the editor's: the picker's code is fetched when it is first opened (or
 * warmed when a "Library…" button is hovered or focused).
 *
 * The usage index needs nothing from here: the field's new value is stored
 * with the home document or the CV (kv rows), and the library rebuilds
 * "where it is used" whenever the stored content changed (lib/media/library).
 */

const loadPicker = () => import('./MediaPicker')
/**
 * The picker, loaded on demand — the one place it is imported from (the
 * post editor and the cover field use it too), so its code stays one chunk.
 */
export const MediaPickerLazy = dynamic(loadPicker, { ssr: false })

/** Fetch the picker's code ahead of the first click (idempotent; failures retried on open). */
export function preloadMediaPicker(): void {
  loadPicker().catch(() => undefined)
}

export type LibraryRequest = {
  labels: PickerLabels
  /** The language of the field's alt text, or null when it has none. */
  altLang: 'en' | 'zh' | null
  formats?: readonly MediaFormat[]
  /** The field's value (its image is selected when the picker opens). */
  current?: string
  onPick: (image: PickedImage) => void
}

/** One picker for a group of fields: `open(request)` shows it; render `element` once. */
export function useLibraryPicker(): { open: (request: LibraryRequest) => void; element: React.ReactNode } {
  const [request, setRequest] = useState<LibraryRequest | null>(null)
  const open = useCallback((next: LibraryRequest) => setRequest(next), [])
  const element = request ? (
    <MediaPickerLazy
      isOpen
      mode="field"
      labels={request.labels}
      altLang={request.altLang}
      formats={request.formats}
      current={request.current}
      onPick={request.onPick}
      onClose={() => setRequest(null)}
    />
  ) : null
  return { open, element }
}

/**
 * "Library…" next to an upload control: opens the picker. `context` is read
 * after the visible words ("Library… for photo 3"), so the accessible name
 * starts with what is on screen (WCAG 2.5.3) and still says which field.
 */
export function LibraryButton({ context, onClick, children = 'Library…', ...rest }: { context: string; onClick: () => void; children?: React.ReactNode } & Omit<ButtonProps, 'onClick' | 'children'>) {
  return (
    <Button size="xs" {...outlineButtonProps} {...rest} onClick={onClick} onPointerEnter={preloadMediaPicker} onFocus={preloadMediaPicker}>
      {children}
      <VisuallyHidden> {context}</VisuallyHidden>
    </Button>
  )
}
