import type { AnyExtension, Node as TiptapNode } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { ReactNodeViewRenderer, type ReactNodeViewRendererOptions } from '@tiptap/react'
import { figureWidthOfSrc } from '../../../../lib/rehype/galleries'
import CalloutView from './CalloutView'
import ImageView from './ImageView'
import VideoView from './VideoView'
import { MdxBlockView, MdxInlineView } from './MdxIslandView'

/**
 * The visual editor's React node views, attached to the schema extensions
 * of ../extensions (which stay DOM-free for the Node tests).
 */
const VIEWS: Record<string, Parameters<typeof ReactNodeViewRenderer>[0]> = {
  callout: CalloutView,
  image: ImageView,
  videoEmbed: VideoView,
  mdxBlock: MdxBlockView,
  mdxInline: MdxInlineView,
}

/** Options of the node view's outer element (the direct child of the editor for a top-level node). */
const OPTIONS: Record<string, Partial<ReactNodeViewRendererOptions>> = {
  mdxInline: { as: 'span' },
  // The figure's width on the page, for the editor's breakout styles (../editorStyles).
  image: { attrs: ({ node }: { node: PMNode }) => ({ 'data-figure-width': figureWidthOfSrc(node.attrs.src) || 'text' }) },
}

export function withNodeViews(extensions: AnyExtension[]): AnyExtension[] {
  return extensions.map((ext) => {
    const view = VIEWS[ext.name]
    if (!view || ext.type !== 'node') return ext
    const options = OPTIONS[ext.name] || {}
    return (ext as TiptapNode).extend({
      addNodeView() {
        return ReactNodeViewRenderer(view, options)
      },
    })
  })
}
