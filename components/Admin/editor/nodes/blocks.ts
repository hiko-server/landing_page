import { Extension, Node } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'

/**
 * Schema pieces that let the editor hold everything Markdown can say about
 * the StarterKit's own nodes:
 *
 *   - the document: blocks, plus videos (a video is only a player at the
 *     top level of an article — lib/rehype/autoEmbed — so it cannot sit in
 *     a quote, list, callout or table);
 *   - code blocks keep the fence's meta (`title="…"`, `{1,3}`: the file tab
 *     and highlighted lines of components/MDX/CodeBlock);
 *   - lists keep tight / loose spacing (`spread`), list items a GFM task box
 *     (`checked`: true / false; null = none) — toggled by clicking the box
 *     or ⌘↵ / Ctrl+↵ in the item.
 */

/** Toggle the task box of the list item at `pos` (before the item). */
function toggleTaskAt(view: { state: EditorState; dispatch: (tr: Transaction) => void }, pos: number): boolean {
  const node = view.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'listItem' || typeof node.attrs.checked !== 'boolean') return false
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }))
  return true
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    markdownAttributes: {
      /** Tick / untick the task box of the list item holding the caret. */
      toggleTask: () => ReturnType
    }
  }
}

export const MarkdownDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: '(block | topBlock)+',
})

export const MarkdownAttributes = Extension.create({
  name: 'markdownAttributes',

  addCommands() {
    return {
      toggleTask:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name !== 'listItem') continue
            const item = $from.node(d)
            if (typeof item.attrs.checked !== 'boolean') return false
            if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(d), undefined, { ...item.attrs, checked: !item.attrs.checked }))
            return true
          }
          return false
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => this.editor.commands.toggleTask(),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('taskBoxes'),
        props: {
          handleDOMEvents: {
            // The box is drawn left of the item (its ::before): a press there toggles it.
            mousedown: (view, event) => {
              const li = (event.target as HTMLElement | null)?.closest?.('li[data-checked]') as HTMLElement | null
              if (!li || !view.editable || event.clientX >= li.getBoundingClientRect().left) return false
              const pos = view.posAtDOM(li, 0) - 1
              if (pos < 0) return false
              event.preventDefault()
              return toggleTaskAt(view, pos)
            },
          },
        },
      }),
    ]
  },

  addGlobalAttributes() {
    return [
      {
        types: ['codeBlock'],
        attributes: {
          meta: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-meta') || null,
            renderHTML: (attrs: { meta?: string | null }) => (attrs.meta ? { 'data-meta': attrs.meta } : {}),
          },
        },
      },
      {
        types: ['bulletList', 'orderedList'],
        attributes: {
          spread: {
            default: false,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-spread') === 'true',
            renderHTML: (attrs: { spread?: boolean }) => (attrs.spread ? { 'data-spread': 'true' } : {}),
          },
        },
      },
      {
        types: ['listItem'],
        attributes: {
          checked: {
            default: null,
            parseHTML: (el: HTMLElement) => {
              const v = el.getAttribute('data-checked')
              if (v === 'true' || v === 'false') return v === 'true'
              const box = el.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null
              return box ? box.checked : null
            },
            renderHTML: (attrs: { checked?: boolean | null }) => (typeof attrs.checked === 'boolean' ? { 'data-checked': String(attrs.checked) } : {}),
          },
        },
      },
    ]
  },
})
