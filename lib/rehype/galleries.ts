import { classList, element, isElement, textOf, walk, type HastElement, type HastNode } from './hast'
import { captionFor } from './images'

/**
 * rehype plugin (runs after ./images, so sizes are known): figure widths and
 * image galleries.
 *
 * Widths — a figure can break out of the 68ch text column:
 *   `![alt](/uploads/x.webp#wide)` / `#full`, or `<Figure … size="wide" />`
 *   → `data-width="wide" | "full"` on the figure (the fragment is removed
 *   from the src). Wide reaches up to 64rem within the article column; full
 *   takes the whole column and, on phones, the screen edge to edge
 *   (components/MDX/Figure.tsx).
 *
 * Galleries — two or more images in a row become one grid:
 *   - consecutive lone-image figures (blank lines between the images) —
 *     a figure given a width of its own (#wide, size="full") stands alone —
 *   - a paragraph that holds only images (one per line, no blank lines),
 *     the gallery taking the widest width any of them asks for
 *   → <figure class="article-gallery"> with `div.gallery-row` rows of
 *   figures. Rows follow the images' shapes: a landscape image (wider than
 *   ~6:5) gets a row to itself; portrait and square images pair up, and an
 *   odd one out joins the row before it (three across) instead of being left
 *   alone. Each figure carries its aspect ratio (`data-ratio`), so a row's
 *   images share one height and the layout is reserved before any file
 *   loads (zero layout shift). When every image has the same caption it is
 *   shown once for the gallery. Unknown sizes count as 16:10.
 *
 * The lightbox still steps through every image (collectImages). The feeds
 * receive the figures as a flat list (lib/feedHtml.ts).
 */

export type FigureWidth = 'wide' | 'full'

const WIDTH_FRAGMENT_RE = /#(wide|full)$/i
const LANDSCAPE_MIN_RATIO = 1.2
const UNKNOWN_RATIO = 16 / 10

/** The width an image source asks for with its fragment (`#wide`, `#full`), or null. */
export function figureWidthOfSrc(src: unknown): FigureWidth | null {
  const m = typeof src === 'string' ? WIDTH_FRAGMENT_RE.exec(src.trim()) : null
  return m ? (m[1].toLowerCase() as FigureWidth) : null
}

/** The source with its width fragment set (or removed for null). Used by the editor's image bubble. */
export function withWidthFragment(src: string, width: FigureWidth | null): string {
  const base = src.trim().replace(WIDTH_FRAGMENT_RE, '')
  return width ? `${base}#${width}` : base
}

export function asFigureWidth(value: unknown): FigureWidth | null {
  return value === 'wide' || value === 'full' ? value : null
}

const isBlank = (node: HastNode) => node.type === 'text' && !(node.value ?? '').trim()
const isArticleFigure = (node: HastNode): node is HastElement => isElement(node, 'figure') && classList(node).includes('article-figure')

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function imageOf(figure: HastElement): HastElement | undefined {
  return figure.children.find((c): c is HastElement => isElement(c, 'img'))
}

/** Aspect ratio (width / height) of a figure's image; 16:10 when unknown. */
export function figureRatio(figure: HastElement): number {
  const img = imageOf(figure)
  const w = num(img?.properties.width)
  const h = num(img?.properties.height)
  return w && h ? w / h : UNKNOWN_RATIO
}

function captionOf(figure: HastElement): string {
  const cap = figure.children.find((c) => isElement(c, 'figcaption'))
  return cap ? textOf(cap).replace(/\s+/g, ' ').trim() : ''
}

const WIDTH_RANK: Record<FigureWidth, number> = { wide: 1, full: 2 }

/**
 * Rows of a gallery as index lists: landscape images alone; runs of
 * portrait / square images in pairs, an odd one joining the previous pair.
 */
export function galleryRows(ratios: readonly number[]): number[][] {
  const rows: number[][] = []
  let i = 0
  while (i < ratios.length) {
    if (ratios[i] >= LANDSCAPE_MIN_RATIO) {
      rows.push([i])
      i++
      continue
    }
    const run: number[] = []
    while (i < ratios.length && ratios[i] < LANDSCAPE_MIN_RATIO) run.push(i++)
    for (let k = 0; k < run.length; k += 2) rows.push(run.slice(k, k + 2))
    const last = rows[rows.length - 1]
    if (run.length > 2 && last.length === 1) {
      rows.pop()
      rows[rows.length - 1].push(last[0])
    }
  }
  return rows
}

/** One gallery built from figures (their captions merged when all are the same). */
export function buildGallery(figures: HastElement[]): HastElement {
  const captions = figures.map(captionOf)
  const shared = captions[0] && captions.every((c) => c === captions[0]) ? captions[0] : ''
  const items = figures.map((f) => {
    const children = shared ? f.children.filter((c) => !isElement(c, 'figcaption')) : f.children
    const properties: Record<string, unknown> = { ...f.properties, dataRatio: Math.round(figureRatio(f) * 1000) / 1000 }
    delete properties.dataWidth
    return element('figure', properties, children)
  })
  let width: FigureWidth | null = null
  for (const f of figures) {
    const w = asFigureWidth(f.properties.dataWidth)
    if (w && (!width || WIDTH_RANK[w] > WIDTH_RANK[width])) width = w
  }
  const rows = galleryRows(items.map((it) => Number(it.properties.dataRatio))).map((row) =>
    element('div', { className: ['gallery-row'], dataCount: row.length }, row.map((i) => items[i])),
  )
  const children: HastNode[] = [...rows]
  if (shared) children.push(element('figcaption', {}, [{ type: 'text', value: shared }]))
  return element('figure', { className: ['article-gallery'], ...(width ? { dataWidth: width } : {}) }, children)
}

/** A paragraph that holds only (two or more) images → one figure per image; null otherwise. */
function figuresOfImageParagraph(p: HastElement): HastElement[] | null {
  const meaningful = p.children.filter((c) => !isBlank(c) && !isElement(c, 'br'))
  if (meaningful.length < 2 || !meaningful.every((c) => isElement(c, 'img'))) return null
  return (meaningful as HastElement[]).map((img) => {
    const caption = captionFor(img.properties.alt, img.properties.title)
    if (caption && caption === img.properties.title) delete img.properties.title
    const children: HastNode[] = [img]
    if (caption) children.push(element('figcaption', {}, [{ type: 'text', value: caption }]))
    return element('figure', { className: ['article-figure'] }, children)
  })
}

/** Width fragments → data-width on the figure; the fragment leaves the src. */
function applyWidths(tree: HastNode): void {
  walk(tree, (node) => {
    if (!isElement(node, 'figure')) {
      if (isElement(node, 'img') && figureWidthOfSrc(node.properties.src)) {
        node.properties.src = withWidthFragment(String(node.properties.src), null)
      }
      return
    }
    if (!classList(node).includes('article-figure')) return
    const img = imageOf(node)
    const fromSrc = figureWidthOfSrc(img?.properties.src)
    if (img && fromSrc) img.properties.src = withWidthFragment(String(img.properties.src), null)
    const width = fromSrc || asFigureWidth(node.properties.dataWidth)
    if (width) node.properties.dataWidth = width
    else delete node.properties.dataWidth
  })
}

/** Group runs of figures among a parent's children into galleries (in place). */
function group(parent: HastNode): void {
  const kids = parent.children
  if (!kids) return
  const out: HastNode[] = []
  let run: HastElement[] = []
  let gap: HastNode[] = []
  const flush = () => {
    if (run.length >= 2) out.push(buildGallery(run))
    else out.push(...run)
    out.push(...gap)
    run = []
    gap = []
  }
  for (const child of kids) {
    const figures = isElement(child, 'p') ? figuresOfImageParagraph(child) : isArticleFigure(child) && !child.properties.dataWidth ? [child] : null
    if (figures) {
      gap = []
      run.push(...figures)
      continue
    }
    if (run.length && isBlank(child)) {
      gap.push(child)
      continue
    }
    flush()
    out.push(child)
  }
  flush()
  parent.children = out
}

export default function rehypeGalleries() {
  return (tree: HastNode) => {
    applyWidths(tree)
    group(tree)
  }
}
