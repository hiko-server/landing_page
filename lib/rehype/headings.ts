import { createSlugger, type TocEntry } from '../toc'
import { element, hasDescendant, isElement, textOf, walk, type HastNode } from './hast'

/**
 * rehype plugin: stable heading ids, self-links and a table of contents.
 *
 *   - every h2–h6 gets a unique, Unicode-aware slug id (an author-supplied
 *     id is kept);
 *   - the heading text is wrapped in `<a class="heading-anchor" href="#id">`
 *     so the section can be linked and shared; headings that already contain
 *     a link get a trailing `<a class="heading-anchor heading-anchor-icon">`
 *     instead (links cannot nest);
 *   - h2/h3 entries are reported through `onToc` in document order. The TOC
 *     is therefore built from the very tree that is rendered, so its ids
 *     always match the page.
 *
 * The GFM endnotes label (remark-rehype's visually hidden
 * `<h2 id="footnote-label">` inside `<section data-footnotes>`) is left as
 * it is: it names the notes for screen readers, but it is not a section of
 * the article — no TOC entry, and no self-link a keyboard user would tab to
 * without seeing it.
 */
export type HeadingsOptions = {
  onToc?: (toc: TocEntry[]) => void
}

const HEADINGS = ['h2', 'h3', 'h4', 'h5', 'h6'] as const

/** The label heading of the GFM endnotes section. */
export function isFootnoteLabel(node: HastNode, parent: HastNode | null): boolean {
  return !!parent && isElement(parent, 'section') && !!parent.properties.dataFootnotes && isElement(node, HEADINGS)
}

export default function rehypeHeadings(options: HeadingsOptions = {}) {
  return (tree: HastNode) => {
    const slug = createSlugger()
    // Ids that already exist in the document must not be handed out again.
    walk(tree, (node) => {
      const id = isElement(node) ? node.properties.id : undefined
      if (typeof id === 'string' && id) slug(id)
    })

    const toc: TocEntry[] = []
    walk(tree, (node, parent) => {
      if (!isElement(node, HEADINGS) || isFootnoteLabel(node, parent)) return
      const text = textOf(node).replace(/\s+/g, ' ').trim()
      if (!text) return
      const existing = node.properties.id
      const id = typeof existing === 'string' && existing ? existing : slug(text)
      node.properties.id = id

      const containsLink = hasDescendant(node, (n) => isElement(n, 'a'))
      if (containsLink) {
        node.children.push(
          { type: 'text', value: ' ' },
          element('a', { className: ['heading-anchor', 'heading-anchor-icon'], href: `#${id}`, ariaLabel: `Link to section: ${text}` }, [
            { type: 'text', value: '#' },
          ]),
        )
      } else {
        node.children = [element('a', { className: ['heading-anchor'], href: `#${id}` }, node.children)]
      }

      if (node.tagName === 'h2' || node.tagName === 'h3') {
        toc.push({ id, text, depth: node.tagName === 'h2' ? 2 : 3 })
      }
    })
    options.onToc?.(toc)
  }
}
