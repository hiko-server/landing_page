import { element, isElement, walk, type HastElement, type HastNode } from './hast'
import { safeSrcSet } from './safeUrls'

/**
 * rehype plugin: well-behaved article images (zero layout shift).
 *
 *   - `loading="lazy"` + `decoding="async"` on every <img>;
 *   - intrinsic `width`/`height` when `resolveSize` knows them (local files,
 *     uploads, remote headers — lib/rehype/imageSize.ts), so the browser
 *     reserves the box before the file arrives;
 *   - `srcSet` + `sizes` for uploads that have responsive variants
 *     (`srcSetFor`, backed by lib/uploadVariants), entries filtered by the
 *     media URL rule of ./safeUrls;
 *   - an image that is alone in its paragraph becomes
 *     `<figure class="article-figure"><img><figcaption>` — the caption is the
 *     markdown title (`![alt](src "title")`), else a meaningful alt text
 *     (file-name alts such as "image.png" are never shown as captions).
 *     `<Figure>` from MDX arrives in that shape already. An image that
 *     shares its paragraph with text stays inline (MdxImage renders it with
 *     phrasing content only); block elements are lifted out of paragraphs
 *     by ./liftBlocks before this runs.
 *
 * Size lookups run concurrently and may be async (remote headers).
 */
export type ImageSize = { width: number; height: number }

export type SizeResolver = (src: string) => ImageSize | null | Promise<ImageSize | null>
export type SrcSetResolver = (src: string) => string | null | undefined | Promise<string | null | undefined>

export type ImagesOptions = {
  resolveSize?: SizeResolver
  srcSetFor?: SrcSetResolver
}

/** `sizes` for article images: the prose column is ~720px wide from md up. */
export const ARTICLE_IMAGE_SIZES = '(min-width: 768px) 720px, 100vw'

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

async function enhance(img: HastElement, options: ImagesOptions): Promise<void> {
  const p = img.properties
  p.loading = 'lazy'
  p.decoding = 'async'
  const src = typeof p.src === 'string' ? p.src : ''
  if (!src) return
  const hasSize = p.width !== undefined && p.height !== undefined
  const { resolveSize, srcSetFor } = options
  // A lookup that throws (sync or async) only costs the attribute, never the article.
  const [size, srcSet] = await Promise.all([
    !hasSize && resolveSize ? (async () => resolveSize(src))().catch(() => null) : null,
    p.srcSet === undefined && srcSetFor ? (async () => srcSetFor(src))().catch(() => null) : null,
  ])
  if (size) {
    p.width = size.width
    p.height = size.height
  }
  // Same URL rules as every other source in the tree (./safeUrls).
  const safe = safeSrcSet(srcSet)
  if (safe) {
    p.srcSet = safe
    p.sizes = ARTICLE_IMAGE_SIZES
  }
}

export default function rehypeImages(options: ImagesOptions = {}) {
  return async (tree: HastNode) => {
    const images: HastElement[] = []
    walk(tree, (node, parent, index) => {
      if (isElement(node, 'img')) {
        images.push(node)
        return
      }
      if (!isElement(node, 'p') || !parent?.children) return
      const meaningful = node.children.filter((c) => !isBlankText(c))
      if (meaningful.length !== 1 || !isElement(meaningful[0], 'img')) return
      const img = meaningful[0]
      const caption = captionFor(img.properties.alt, img.properties.title)
      // The caption is shown visibly; a duplicate tooltip adds nothing.
      if (caption && caption === img.properties.title) delete img.properties.title
      const children: HastNode[] = [img]
      if (caption) children.push(element('figcaption', {}, [{ type: 'text', value: caption }]))
      // The walk still descends into this paragraph's children, so the img is collected.
      parent.children[index] = element('figure', { className: ['article-figure'] }, children)
    })
    await Promise.all(images.map((img) => enhance(img, options)))
  }
}
