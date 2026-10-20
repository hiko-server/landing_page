import { Extension, commands as coreCommands, type JSONContent } from '@tiptap/core'
import { Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { docToMarkdown, markdownToDoc, plainMarkdownToDoc } from './index'
import { isCodeEditorHtml, looksLikeMarkdown, singleUrl, singleVideoUrl } from './paste'
import { insertTopLevel, topLevelInsertPoint } from '../nodes/videoEmbed'

/**
 * TipTap extension: Markdown (MDX) is the editor's storage format.
 *
 *   - `editor.storage.markdown.getMarkdown()` writes the document as MDX
 *     (./index docToMarkdown);
 *   - a string given as content (`content`, `setContent(md)`) is read as
 *     MDX with the site's parser — invalid MDX falls back to plain Markdown,
 *     so the editor never fails to open (the visual tab is guarded by
 *     visualFidelity in the first place);
 *   - copying writes Markdown as the plain-text version; pasting plain text
 *     that looks like Markdown (or text from a code editor, whose HTML is
 *     only colouring) inserts structure; a lone YouTube / Vimeo URL on an
 *     empty line becomes a video; a URL pasted over selected text links it.
 *
 * Pure parsing / writing lives in ./index (no DOM), so Node tests can create
 * a headless editor from Markdown.
 */

/** The document of `md`: MDX first, plain Markdown when it is not valid MDX. */
export function contentOf(md: string): JSONContent {
  try {
    return markdownToDoc(md)
  } catch {
    return plainMarkdownToDoc(md)
  }
}

/** A slice of pasted Markdown, open at both ends so a single paragraph flows into the line. */
export function markdownSlice(schema: Schema, text: string): Slice | null {
  try {
    const doc = schema.nodeFromJSON(plainMarkdownToDoc(text))
    const content = doc.content
    if (!content.size) return null
    return Slice.maxOpen(content)
  } catch {
    return null
  }
}

function inCode(view: EditorView): boolean {
  const { $from } = view.state.selection
  return $from.parent.type.spec.code === true || $from.marks().some((m) => m.type.spec.code === true)
}

/** The Markdown of a copied slice (inline content is wrapped in a paragraph). */
export function sliceMarkdown(content: Fragment): string {
  const nodes: JSONContent[] = []
  let inline: JSONContent[] = []
  const flush = () => {
    if (inline.length) nodes.push({ type: 'paragraph', content: inline })
    inline = []
  }
  content.forEach((node: PMNode) => {
    if (node.isInline) inline.push(node.toJSON() as JSONContent)
    else {
      flush()
      // Rows / cells copied out of a table: their text, one row per line.
      if (node.type.spec.tableRole && node.type.name !== 'table') nodes.push({ type: 'paragraph', content: [{ type: 'text', text: node.textContent || ' ' }] })
      else nodes.push(node.toJSON() as JSONContent)
    }
  })
  flush()
  try {
    return docToMarkdown({ type: 'doc', content: nodes })
  } catch {
    return content.textBetween(0, content.size, '\n\n')
  }
}

export const MarkdownBridge = Extension.create({
  name: 'markdown',
  // Commands of lower-priority extensions win: this one's setContent replaces
  // TipTap's own (core extensions have priority 100).
  priority: 50,

  addStorage() {
    return {
      getMarkdown: (() => '') as () => string,
    }
  },

  onBeforeCreate() {
    this.storage.getMarkdown = () => docToMarkdown(this.editor.state.doc.toJSON() as JSONContent)
    const content = this.editor.options.content
    if (typeof content === 'string') this.editor.options.content = contentOf(content)
  },

  addCommands() {
    return {
      // A string is Markdown (MDX), not HTML.
      setContent:
        (content, options) =>
        (props) =>
          coreCommands.setContent(typeof content === 'string' ? contentOf(content) : content, options)(props),
    }
  },

  addExtensions() {
    return [MarkdownClipboard]
  },
})

/**
 * Copy and paste in Markdown. A separate extension so that its plugin comes
 * before TipTap's plain-text clipboard serializer and the link extension's
 * paste handler (priority 1000): a pasted video URL becomes a video.
 */
export const MarkdownClipboard = Extension.create({
  name: 'markdownClipboard',
  priority: 1001,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('markdownClipboard'),
        props: {
          clipboardTextSerializer: (slice) => sliceMarkdown(slice.content),
          clipboardTextParser: (text, _context, plain, view) => {
            if (plain || inCode(view) || !looksLikeMarkdown(text)) return null as unknown as Slice
            return markdownSlice(view.state.schema, text) as Slice
          },
          handlePaste: (view, event) => {
            const data = event.clipboardData
            if (!data || inCode(view)) return false
            const text = data.getData('text/plain')
            const html = data.getData('text/html')
            const { state } = view
            const { selection } = state

            // A URL over selected text: link it.
            const url = singleUrl(text)
            if (url && !selection.empty && selection.$from.sameParent(selection.$to) && selection.$from.parent.inlineContent) {
              const link = state.schema.marks.link
              if (link) {
                view.dispatch(state.tr.addMark(selection.from, selection.to, link.create({ href: url })))
                return true
              }
            }

            // A video URL alone on an empty top-level line: the player.
            const video = singleVideoUrl(text)
            const $from = selection.$from
            if (video && selection.empty && $from.depth === 1 && $from.parent.type.name === 'paragraph' && !$from.parent.content.size) {
              const type = state.schema.nodes.videoEmbed
              if (type) {
                view.dispatch(insertTopLevel(state.tr, type.create({ url: video }), topLevelInsertPoint(state)))
                return true
              }
            }

            // Markdown from a code editor (its HTML is only colouring).
            if (html && text && isCodeEditorHtml(html, Array.from(data.types || [])) && looksLikeMarkdown(text)) {
              const slice = markdownSlice(state.schema, text)
              if (slice) {
                view.dispatch(state.tr.replaceSelection(slice).scrollIntoView())
                return true
              }
            }
            return false
          },
        },
      }),
    ]
  },
})
