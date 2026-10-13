import type { AnyExtension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import { Markdown } from 'tiptap-markdown'

/**
 * The TipTap extension set of the admin rich editor, shared by RichEditor and
 * the headless round-trip tests (no DOM needed to build it).
 *
 * Markdown is the storage format (tiptap-markdown); everything here must
 * survive md → ProseMirror → md unchanged for plain Markdown. JSX is never
 * produced in the visual editor (mdxRisk contract: bodies with JSX stay in
 * the MDX tab).
 */

const toDimension = (value: string | null): number | null => {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** The part of prosemirror-markdown's serializer state the image writer uses. */
type MarkdownState = { write: (text: string) => void; esc: (text: string) => string; closeBlock: (node: PMNode) => void }

/**
 * `![alt](src "title")` as its own block. (tiptap-markdown's default image
 * writer is the inline one, which glues a block image to the next
 * paragraph, so the next load turned it into an inline image.)
 */
export function serializeBlockImage(state: MarkdownState, node: PMNode): void {
  const alt = state.esc(String(node.attrs.alt || ''))
  const src = String(node.attrs.src || '').replace(/[()]/g, '\\$&')
  const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : ''
  state.write(`![${alt}](${src}${title})`)
  state.closeBlock(node)
}

/**
 * Image node that keeps the intrinsic width / height known from the upload
 * API, so the editor reserves the image's box before it loads. Markdown
 * stays `![alt](src)` (dimensions are display hints, not content).
 */
export const SizedImage = Image.extend({
  addStorage() {
    return {
      markdown: {
        serialize: serializeBlockImage,
        parse: {
          // handled by markdown-it
        },
      },
    }
  },
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

export function baseExtensions(opts: { placeholder?: string } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: { HTMLAttributes: { class: 'tt-codeblock' } },
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    SizedImage.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'tt-image' } }),
    Placeholder.configure({ placeholder: opts.placeholder || 'Write something… Type / for blocks.' }),
    Typography,
    Markdown.configure({
      html: true,
      linkify: true,
      breaks: false,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ]
}
