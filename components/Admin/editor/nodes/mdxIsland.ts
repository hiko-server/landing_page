import { Extension, Node } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, NodeSelection, type EditorState } from '@tiptap/pm/state'

/**
 * MDX islands: source the visual editor keeps exactly as written — JSX
 * components (`<Figure …/>`, `<details>`…), `{expressions}` and `{/* notes *\/}`,
 * import / export lines, footnotes (`[^1]` and `[^1]: …`), reference links
 * and their definitions. The Markdown bridge reads each one by position
 * from the source and writes it back unchanged, so a body that uses them
 * can be edited visually without losing a character.
 *
 *   - `mdxBlock`  a block of source (its own paragraph in the MDX);
 *   - `mdxInline` source inside a line of text.
 *
 * The node views (views/MdxIslandView) show the source and edit it in
 * place; an edit is parsed again, so source that turns into plain Markdown
 * becomes ordinary editable content.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mdxIsland: {
      /** An empty MDX block at the selection, opened for editing. */
      insertMdxBlock: (source?: string) => ReturnType
    }
  }
}

const sourceAttr = {
  default: '',
  parseHTML: (el: HTMLElement) => el.getAttribute('data-source') ?? el.textContent ?? '',
  renderHTML: (attrs: { source?: string }) => ({ 'data-source': attrs.source || '' }),
}

export const MdxBlock = Node.create({
  name: 'mdxBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return { source: sourceAttr }
  },

  parseHTML() {
    return [{ tag: 'pre[data-mdx-block]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['pre', { 'data-mdx-block': '', class: 'tt-mdx-block', ...HTMLAttributes }, String(node.attrs.source || '')]
  },

  addCommands() {
    return {
      insertMdxBlock:
        (source = '') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { source } }),
    }
  },
})

export const MdxInline = Node.create({
  name: 'mdxInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { source: sourceAttr }
  },

  parseHTML() {
    return [{ tag: 'code[data-mdx-inline]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['code', { 'data-mdx-inline': '', class: 'tt-mdx-inline', ...HTMLAttributes }, String(node.attrs.source || '')]
  },
})

/** The selected inline atom (an inline island or image), if the selection is one. */
function selectedInlineAtom(state: EditorState): NodeSelection | null {
  const sel = state.selection
  return sel instanceof NodeSelection && sel.node.isInline && sel.node.isAtom ? sel : null
}

/**
 * Typing never replaces an inline island or image by accident: with one
 * selected (a click at the end of its line selects it), text and Enter go
 * after it. Backspace / Delete still remove it.
 */
export const InlineAtomGuard = Extension.create({
  name: 'inlineAtomGuard',
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const sel = selectedInlineAtom(this.editor.state)
        // An island opens its source on Enter (views/MdxIslandView); other atoms: a new line after.
        if (!sel || sel.node.type.name === 'mdxInline') return false
        return this.editor.chain().setTextSelection(sel.to).splitBlock().run()
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('inlineAtomGuard'),
        props: {
          handleTextInput: (view, _from, _to, text) => {
            const sel = selectedInlineAtom(view.state)
            if (!sel) return false
            const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, sel.to)).insertText(text, sel.to)
            view.dispatch(tr.scrollIntoView())
            return true
          },
        },
      }),
    ]
  },
})
