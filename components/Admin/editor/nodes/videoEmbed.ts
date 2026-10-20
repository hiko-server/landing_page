import { Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { parseVideoUrl, videoWatchUrl } from '../../../../lib/videoUrl'

/**
 * Video node: a YouTube or Vimeo video, as the site plays it — a link alone
 * in a top-level paragraph compiles to the click-to-load player
 * (lib/rehype/autoEmbed.ts, components/MDX/VideoEmbed.tsx); its text, unless
 * it is the URL, is the title. The poster is imported into /uploads when
 * the article is saved (lib/videoPoster.ts), never fetched from YouTube or
 * Vimeo by the editor.
 *
 * Lives only at the top level (group `topBlock`, see ./blocks): inserting
 * one inside a quote, list or callout puts it after that block.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    videoEmbed: {
      /** Insert a video after the top-level block holding the selection (or in place of an empty paragraph). */
      insertVideo: (attrs: { url: string; title?: string | null }) => ReturnType
    }
  }
}

/** Where a top-level block goes for the selection: in place of an empty top-level paragraph, else after the top-level block. */
export function topLevelInsertPoint(state: EditorState): { from: number; to: number } {
  const { $from } = state.selection
  if ($from.depth === 0) {
    // A selected top-level node or a gap cursor: after the node, else here.
    const at = state.selection instanceof NodeSelection ? state.selection.to : $from.pos
    return { from: at, to: at }
  }
  const top = $from.node(1)
  const start = $from.before(1)
  if (top.type.name === 'paragraph' && top.content.size === 0) return { from: start, to: start + top.nodeSize }
  const after = $from.after(1)
  return { from: after, to: after }
}

/** Replace [from, to) with a top-level node and put the selection on it. */
export function insertTopLevel(tr: Transaction, node: PMNode, at: { from: number; to: number }): Transaction {
  tr.replaceWith(at.from, at.to, node)
  tr.setSelection(NodeSelection.create(tr.doc, at.from)).scrollIntoView()
  return tr
}

export const VideoEmbed = Node.create({
  name: 'videoEmbed',
  group: 'topBlock',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      url: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-url') || '',
      },
      title: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-title') || null,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-video-embed]' }]
  },

  renderHTML({ node }) {
    const url = String(node.attrs.url || '')
    const ref = parseVideoUrl(url)
    const href = ref ? videoWatchUrl(ref) : url
    const title = node.attrs.title ? String(node.attrs.title) : ''
    return [
      'div',
      { 'data-video-embed': '', 'data-url': url, ...(title ? { 'data-title': title } : {}), class: 'tt-video' },
      ['a', { href, rel: 'noopener noreferrer', target: '_blank' }, title || href],
    ]
  },

  addCommands() {
    return {
      insertVideo:
        ({ url, title }) =>
        ({ state, tr, dispatch }) => {
          if (!parseVideoUrl(url)) return false
          if (dispatch) {
            const node = state.schema.nodes[this.name].create({ url, title: title?.trim() || null })
            const at = topLevelInsertPoint(state)
            insertTopLevel(tr, node, at)
          }
          return true
        },
    }
  },
})
