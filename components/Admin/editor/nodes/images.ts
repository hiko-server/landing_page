import { Node, mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'

/**
 * Images in the visual editor, matching how the site reads them
 * (lib/rehype/images.ts, lib/rehype/galleries.ts):
 *
 *   - `image` (block): an image alone in its paragraph — a figure. Its
 *     title is the caption (shown under it; the alt text is the caption
 *     when there is no title and the alt is real text), a `#wide` / `#full`
 *     fragment on the source breaks it out of the text column. The node
 *     view (views/ImageView) edits the caption in place, prompts for alt
 *     text and offers the three widths.
 *   - `inlineImage`: an image that shares its paragraph with text or other
 *     images (a paragraph of images only is a gallery). Edited through the
 *     image bubble (alt text, width).
 *
 * `width` / `height` on the block image are the upload's intrinsic size, a
 * display hint for the editor (the box is reserved before the file loads);
 * Markdown stays `![alt](src "title")`.
 */

const toDimension = (value: string | null): number | null => {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export const FigureImage = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => toDimension(el.getAttribute('width')),
        renderHTML: (attrs: { width?: number | null }) => (attrs.width ? { width: String(attrs.width) } : {}),
      },
      height: {
        default: null,
        parseHTML: (el: HTMLElement) => toDimension(el.getAttribute('height')),
        renderHTML: (attrs: { height?: number | null }) => (attrs.height ? { height: String(attrs.height) } : {}),
      },
    }
  },
})

export const InlineImage = Node.create({
  name: 'inlineImage',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    }
  },

  parseHTML() {
    // Inside a line of text (a lone image in a paragraph is a figure: `image`).
    return [{ tag: 'img[src]:not([src^="data:"])', priority: 60, context: 'paragraph/|heading/|tableCell/|tableHeader/' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes({ class: 'tt-inline-image', draggable: 'false' }, HTMLAttributes)]
  },
})
