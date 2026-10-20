import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { CALLOUT_MARKER_RE, CALLOUT_TYPES, isCalloutType, type CalloutType } from '../../../../lib/rehype/calloutMarker'

/**
 * Callout node: the editor's form of a GitHub alert (`> [!NOTE]` …), which
 * the site renders as components/MDX/Callout (lib/rehype/alerts.ts). Holds
 * any blocks; its type (note, tip, important, warning, caution) is changed
 * from the callout's own menu (views/CalloutView).
 *
 *   - "/note", "/tip", "/warning"… make one; so does a quote whose text
 *     starts with `[!TIP]` (typed or pasted): the site reads that quote as a
 *     callout (lib/rehype/alerts.ts), so the editor shows it as one too;
 *   - Enter in an empty last paragraph leaves the callout; Backspace at the
 *     start of its first block lifts that block out (an empty callout is
 *     removed).
 */

export { CALLOUT_TYPES, type CalloutType }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the selected blocks in a callout (or change the type of the one around them). */
      setCallout: (type: CalloutType) => ReturnType
      /** Unwrap the callout around the selection. */
      unsetCallout: () => ReturnType
    }
  }
}

/**
 * Quotes the compiler reads as callouts, made callouts: a blockquote whose
 * first paragraph opens with plain text `[!TYPE]` (lib/rehype/alerts.ts
 * calloutFor) becomes a callout of that type, the marker and the spaces and
 * line breaks after it removed. Null when there is none.
 */
export function quotesToCallouts(state: EditorState): Transaction | null {
  const quote = state.schema.nodes.blockquote
  const callout = state.schema.nodes.callout
  if (!quote || !callout) return null
  const found: Array<{ pos: number; type: string; from: number; to: number }> = []
  state.doc.descendants((node, pos) => {
    if (node.type !== quote) return true
    const para = node.firstChild
    const lead = para?.type.name === 'paragraph' ? para.firstChild : null
    if (!lead || !lead.isText || lead.marks.length) return true
    const m = CALLOUT_MARKER_RE.exec(lead.text || '')
    if (!m) return true
    const start = pos + 2
    let end = start + m[0].length + (/^\s*/.exec((lead.text || '').slice(m[0].length))?.[0].length ?? 0)
    // Line breaks right after the marker go too (as the compiler trims them).
    if (end === start + lead.nodeSize) {
      let i = 1
      while (para && i < para.childCount && (para.child(i).type.name === 'hardBreak' || (para.child(i).isText && !(para.child(i).text || '').trim()))) {
        end += para.child(i).nodeSize
        i++
      }
    }
    found.push({ pos, type: m[1].toLowerCase(), from: start, to: end })
    return true
  })
  if (!found.length) return null
  const tr = state.tr
  for (const f of found.reverse()) {
    tr.delete(f.from, f.to)
    tr.setNodeMarkup(f.pos, callout, { type: f.type })
  }
  return tr
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: (el: HTMLElement) => {
          const v = (el.getAttribute('data-callout') || '').toLowerCase()
          return isCalloutType(v) ? v : 'note'
        },
        renderHTML: (attrs: { type?: string }) => ({ 'data-callout': isCalloutType(attrs.type) ? attrs.type : 'note' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }, { tag: 'aside[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'tt-callout', role: 'note' }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setCallout:
        (type) =>
        ({ state, commands }) => {
          const { $from } = state.selection
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === this.name) return commands.command(({ tr }) => {
              tr.setNodeMarkup($from.before(d), undefined, { ...$from.node(d).attrs, type })
              return true
            })
          }
          return commands.wrapIn(this.name, { type })
        },
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    }
  },

  addKeyboardShortcuts() {
    const inCallout = () => {
      const { $from, empty } = this.editor.state.selection
      if (!empty || $from.depth < 2) return null
      const callout = $from.node(-1)
      return callout.type.name === this.name ? { $from, callout } : null
    }
    return {
      Enter: () => {
        const at = inCallout()
        if (!at) return false
        const { $from, callout } = at
        const lastEmpty = $from.parent.type.name === 'paragraph' && !$from.parent.content.size && $from.index(-1) === callout.childCount - 1
        if (!lastEmpty || callout.childCount < 2) return false
        return this.editor.commands.lift(this.name)
      },
      Backspace: () => {
        const at = inCallout()
        if (!at) return false
        const { $from } = at
        if ($from.parentOffset !== 0 || $from.index(-1) !== 0) return false
        return this.editor.commands.lift(this.name)
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('quotesToCallouts'),
        appendTransaction: (trs, _old, state) => (trs.some((tr) => tr.docChanged) ? quotesToCallouts(state) : null),
      }),
    ]
  },
})
