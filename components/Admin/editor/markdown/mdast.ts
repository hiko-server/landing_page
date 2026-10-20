/**
 * The few mdast (Markdown AST) shapes the visual editor's Markdown bridge
 * reads and writes. Only the fields the bridge uses are modelled, so the
 * bridge does not depend on @types/mdast (a transitive package).
 */

export type MdPoint = { line?: number; column?: number; offset?: number }
export type MdPosition = { start?: MdPoint; end?: MdPoint }

export type MdNode = {
  type: string
  children?: MdNode[]
  value?: string
  position?: MdPosition
  data?: unknown
  /** heading */
  depth?: number
  /** list */
  ordered?: boolean | null
  start?: number | null
  spread?: boolean | null
  /** listItem */
  checked?: boolean | null
  /** code */
  lang?: string | null
  meta?: string | null
  /** link, image, definition */
  url?: string
  title?: string | null
  alt?: string | null
  /** table */
  align?: Array<'left' | 'right' | 'center' | null>
  /** callout (the bridge's own flow node) */
  calloutType?: string
  /** callout: the body's first paragraph may continue the marker line */
  joinMarker?: boolean
  [key: string]: unknown
}

export type MdRoot = MdNode & { type: 'root'; children: MdNode[] }

export const isParent = (node: MdNode): node is MdNode & { children: MdNode[] } => Array.isArray(node.children)

/** Concatenated text of a node (mdast-util-to-string semantics for the nodes the editor knows). */
export function mdText(node: MdNode): string {
  if (typeof node.value === 'string' && node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return node.value
  if (node.type === 'image') return node.alt || ''
  return (node.children || []).map(mdText).join('')
}

const BLANK_RE = /^\s*$/

/** A text node holding only whitespace. */
export const isBlankText = (node: MdNode): boolean => node.type === 'text' && BLANK_RE.test(node.value || '')
