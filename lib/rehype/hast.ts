/**
 * Minimal hast (HTML AST) shapes and helpers for the in-house rehype
 * plugins. Only the fields the plugins read or write are modelled, so the
 * plugins stay dependency-free (no unist-util-visit / hast-util-to-string).
 */

export type HastNode = {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  value?: string
}

export type HastElement = HastNode & {
  type: 'element'
  tagName: string
  properties: Record<string, unknown>
  children: HastNode[]
}

export function isElement(node: HastNode | undefined, tagName?: string | readonly string[]): node is HastElement {
  if (!node || node.type !== 'element' || typeof node.tagName !== 'string') return false
  if (tagName === undefined) return true
  return typeof tagName === 'string' ? node.tagName === tagName : tagName.includes(node.tagName)
}

/** Concatenated text content (like Node.textContent). */
export function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? ''
  if (!node.children) return ''
  return node.children.map(textOf).join('')
}

/** Depth-first walk; the callback may replace `parent.children[index]` in place. */
export function walk(
  node: HastNode,
  visit: (node: HastNode, parent: HastNode | null, index: number) => void,
  parent: HastNode | null = null,
  index = -1,
): void {
  visit(node, parent, index)
  const kids = node.children
  if (!kids) return
  for (let i = 0; i < kids.length; i++) walk(kids[i], visit, node, i)
}

export function hasDescendant(node: HastNode, test: (n: HastNode) => boolean): boolean {
  return (node.children ?? []).some((c) => test(c) || hasDescendant(c, test))
}

export function classList(node: HastNode): string[] {
  const value = node.properties?.className
  if (Array.isArray(value)) return value.map(String)
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : []
}

export function element(tagName: string, properties: Record<string, unknown>, children: HastNode[]): HastElement {
  return { type: 'element', tagName, properties, children }
}

/** An article image as the lightbox shows it. */
export type TreeImage = {
  src: string
  srcSet?: string
  alt: string
  caption?: string
  width?: number
  height?: number
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Every <img> of a compiled article in document order, with the caption of
 * its figure when it has one. Images inside links are skipped (they are
 * navigation, not zoomable figures).
 */
export function collectImages(tree: HastNode): TreeImage[] {
  const out: TreeImage[] = []
  const visit = (node: HastNode, caption: string | undefined, inLink: boolean) => {
    if (isElement(node, 'img')) {
      const p = node.properties
      if (inLink || typeof p.src !== 'string' || !p.src) return
      out.push({
        src: p.src,
        ...(typeof p.srcSet === 'string' && p.srcSet ? { srcSet: p.srcSet } : {}),
        alt: typeof p.alt === 'string' ? p.alt : '',
        ...(caption ? { caption } : {}),
        ...(num(p.width) && num(p.height) ? { width: num(p.width), height: num(p.height) } : {}),
      })
      return
    }
    let nextCaption = caption
    if (isElement(node, 'figure')) {
      const cap = node.children.find((c) => isElement(c, 'figcaption'))
      nextCaption = cap ? textOf(cap).replace(/\s+/g, ' ').trim() || undefined : undefined
    }
    const link = inLink || isElement(node, 'a')
    for (const child of node.children ?? []) visit(child, nextCaption, link)
  }
  visit(tree, undefined, false)
  return out
}
