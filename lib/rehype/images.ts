import { element, isElement, walk, type HastElement, type HastNode } from './hast'

/**
 * rehype plugin: well-behaved article images.
 *
 *   - `loading="lazy"` + `decoding="async"` on every <img>;
 *   - intrinsic `width`/`height` when `resolveSize` knows them, so the
 *     browser reserves the box before the file arrives (no layout shift);
 *   - an image that is alone in its paragraph becomes
 *     `<figure class="article-figure"><img><figcaption>` — the caption is the
 *     markdown title (`![alt](src "title")`), else a meaningful alt text
 *     (file-name alts such as "image.png" are never shown as captions).
 */
export type ImageSize = { width: number; height: number }

export type ImagesOptions = {
  resolveSize?: (src: string) => ImageSize | null
}

const FILENAME_ALT_RE = /^[\w\s().-]*\.(png|jpe?g|gif|webp|avif|svg|bmp|heic)$/i

/** Caption for a figure: title first, then an alt that is real text (not a file name). */
export function captionFor(alt: unknown, title: unknown): string {
  const t = typeof title === 'string' ? title.trim() : ''
  if (t) return t
  const a = typeof alt === 'string' ? alt.trim() : ''
  if (!a || FILENAME_ALT_RE.test(a)) return ''
  return a
}

function isBlankText(node: HastNode): boolean {
  return node.type === 'text' && !(node.value ?? '').trim()
}

function enhance(img: HastElement, resolveSize: ImagesOptions['resolveSize']) {
  const p = img.properties
  p.loading = 'lazy'
  p.decoding = 'async'
  const hasSize = p.width !== undefined && p.height !== undefined
  if (!hasSize && resolveSize && typeof p.src === 'string') {
    const size = resolveSize(p.src)
    if (size) {
      p.width = size.width
      p.height = size.height
    }
  }
}

export default function rehypeImages(options: ImagesOptions = {}) {
  return (tree: HastNode) => {
    walk(tree, (node, parent, index) => {
      if (isElement(node, 'img')) {
        enhance(node, options.resolveSize)
        return
      }
      if (!isElement(node, 'p') || !parent?.children) return
      const meaningful = node.children.filter((c) => !isBlankText(c))
      if (meaningful.length !== 1 || !isElement(meaningful[0], 'img')) return
      const img = meaningful[0]
      enhance(img, options.resolveSize)
      const caption = captionFor(img.properties.alt, img.properties.title)
      // The caption is shown visibly; a duplicate tooltip adds nothing.
      if (caption && caption === img.properties.title) delete img.properties.title
      const children: HastNode[] = [img]
      if (caption) children.push(element('figcaption', {}, [{ type: 'text', value: caption }]))
      parent.children[index] = element('figure', { className: ['article-figure'] }, children)
    })
  }
}
