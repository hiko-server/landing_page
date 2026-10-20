import { createContext, useContext } from 'react'
import type { UploadedImage } from '../upload'

/**
 * What the visual editor's node views need from the editor around them
 * (RichEditor provides it): image uploads with the shared error toast, and
 * a polite live region for actions that move or change things.
 */
export type EditorUi = {
  upload: (file: File) => Promise<UploadedImage | null>
  announce: (message: string) => void
}

export const EditorUiContext = createContext<EditorUi>({
  upload: async () => null,
  announce: () => undefined,
})

export const useEditorUi = () => useContext(EditorUiContext)

/** Node-view controls are reachable with Tab only while their node is selected (no tab stops all over the document). */
export const tabStop = (selected: boolean) => (selected ? 0 : -1)
