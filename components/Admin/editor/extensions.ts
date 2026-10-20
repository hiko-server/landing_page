import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Code from '@tiptap/extension-code'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import { MarkdownBridge } from './markdown/bridge'
import { MarkdownAttributes, MarkdownDocument } from './nodes/blocks'
import { FigureImage, InlineImage } from './nodes/images'
import { Callout } from './nodes/callout'
import { VideoEmbed } from './nodes/videoEmbed'
import { Table, TableCell, TableHeader, TableRoles, TableRow } from './nodes/table'
import { InlineAtomGuard, MdxBlock, MdxInline } from './nodes/mdxIsland'
import { BlockMove } from './nodes/blockMove'

/**
 * The TipTap extension set of the admin rich editor, shared by RichEditor
 * (which adds the node views, views/nodeViews) and the headless tests (no
 * DOM needed to build it).
 *
 * MDX is the storage format (./markdown: read with the site's own parser,
 * written with mdast-util-to-markdown). Every node here has an exact
 * Markdown form, so MDX → editor → MDX keeps the page the same
 * (tests/editor-parity-roundtrip.test.ts):
 *
 *   paragraphs, headings 1–6, quotes, lists (tight / loose, task boxes),
 *   code blocks (language + meta), rules, hard breaks; bold, italic,
 *   strikethrough, inline code (combinable with the others), links (with
 *   a title); figures (caption, alt text, width) and inline images; callouts;
 *   videos; GFM tables; MDX islands (JSX, expressions, ESM, footnotes —
 *   kept verbatim).
 *
 * Not offered: underline (Markdown has none).
 */

/** Inline code that can sit inside a link or bold text (`[\`x\`](…)`, `**\`x\`**`). */
const InlineCode = Code.extend({ excludes: '' })

export function baseExtensions(opts: { placeholder?: string } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      document: false,
      code: false,
      underline: false,
      codeBlock: { HTMLAttributes: { class: 'tt-codeblock' } },
      dropcursor: { color: false, width: 2, class: 'tt-dropcursor' },
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    MarkdownDocument,
    MarkdownAttributes,
    InlineCode,
    FigureImage.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'tt-image' } }),
    InlineImage,
    Callout,
    VideoEmbed,
    TableRoles,
    Table,
    TableRow,
    TableHeader,
    TableCell,
    MdxBlock,
    MdxInline,
    InlineAtomGuard,
    BlockMove,
    Placeholder.configure({ placeholder: opts.placeholder || 'Write something… Type / for blocks.' }),
    Typography,
    MarkdownBridge,
  ]
}
