import { element, hasDescendant, isElement, type HastElement, type HastNode } from './hast'

/**
 * rehype plugin: no block-level element ever stays inside a paragraph.
 *
 * A `<p>` may only hold phrasing content. When the HTML parser meets e.g. a
 * `<figure>`, `<details>` or `<div>` start tag inside an open `<p>` it closes
 * the paragraph first, so the browser's DOM no longer matches the server
 * render: React reports a hydration mismatch (#418/#423) and re-renders the
 * whole root on the client.
 *
 * Markdown never produces that shape, but MDX text-level JSX does —
 * `Text <Figure src="…" /> more`, `<YouTube id="…" />(source)`, an inline
 * `<iframe>` or `<details>`. Those elements render as blocks
 * (components/MDX: figure, the YouTube facade and the iframe frame are
 * <div>-based), so the paragraph is split around them, the same way the
 * parser would, minus the empty paragraphs:
 *
 *   p(Text, figure, more) → p(Text), figure, p(more)
 *
 * Inline ancestors between the paragraph and the block (em, strong, …) are
 * split along with it. A figure inside a link keeps the link: it is reduced
 * to its image (an image inside a link is navigation, never a zoomable
 * figure), which is the shape `[![alt](src)](href)` compiles to.
 *
 * Images that share a paragraph with text stay where they are; their
 * renderer (components/MDX/Figure.tsx MdxImage) emits phrasing content only.
 */

/** Elements rendered as blocks (or that the parser treats as closing an open <p>). */
const BLOCK_TAGS = ['figure', 'figcaption', 'iframe', 'youtube-embed', 'details', 'summary', 'div', 'section', 'blockquote', 'pre', 'table', 'ul', 'ol', 'hr']

const isBlock = (node: HastNode) => isElement(node, BLOCK_TAGS)
const isBlank = (node: HastNode) => node.type === 'text' && !(node.value ?? '').trim()

/** The phrasing pieces and lifted blocks an element splits into, in document order. */
function split(el: HastElement, inLink: boolean): HastNode[] {
  const out: HastNode[] = []
  let run: HastNode[] = []
  const flush = () => {
    if (!run.length) return
    // An id stays with the first piece only (ids are unique).
    const properties = { ...el.properties }
    if (out.length) delete properties.id
    out.push(element(el.tagName, properties, run))
    run = []
  }
  for (const child of el.children) {
    if (inLink && isElement(child, 'figure')) {
      run.push(...child.children.filter((c) => isElement(c, 'img')))
      continue
    }
    if (isBlock(child)) {
      flush()
      out.push(child)
      continue
    }
    if (isElement(child) && hasDescendant(child, isBlock)) {
      for (const part of split(child, inLink || child.tagName === 'a')) {
        if (isBlock(part)) {
          flush()
          out.push(part)
        } else run.push(part)
      }
      continue
    }
    run.push(child)
  }
  flush()
  return out
}

function lift(parent: HastNode): void {
  const kids = parent.children
  if (!kids) return
  const out: HastNode[] = []
  for (const child of kids) {
    if (isElement(child, 'p') && hasDescendant(child, isBlock)) {
      for (const part of split(child, false)) {
        if (isElement(part, 'p') && part.children.every(isBlank)) continue
        lift(part)
        out.push(part)
      }
      continue
    }
    lift(child)
    out.push(child)
  }
  parent.children = out
}

export default function rehypeLiftBlocks() {
  return (tree: HastNode) => {
    lift(tree)
  }
}
