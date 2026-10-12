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
