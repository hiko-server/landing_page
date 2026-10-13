import React from 'react'

/**
 * Helpers for fenced code rendered from the compiled hast tree
 * (./CodeBlock, ./MDXContent). Plain .ts so the logic is testable without
 * a JSX transform.
 *
 * rehype-pretty-code wraps every highlighted block in
 * `<figure data-rehype-pretty-code-figure>`; a block with a title
 * (```ts title="lib/a.ts") also gets a
 * `<figcaption data-rehype-pretty-code-title>` before its <pre>, and one
 * with caption="…" a `<figcaption data-rehype-pretty-code-caption>` after it.
 */

/** Plain text of rendered code (the highlighted spans keep their newlines as text nodes). */
export function codeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(codeText).join('')
  if (React.isValidElement(node)) return codeText((node.props as { children?: React.ReactNode }).children)
  return ''
}

export type CodeFigureParts = {
  /** The block's title (the filename tab), '' when it has none. */
  title: string
  /** The code block (<pre>) element, null when the figure holds none. */
  pre: React.ReactElement | null
  /** Everything else in the figure, in order (a caption). */
  rest: React.ReactNode[]
}

const TITLE_ATTR = 'data-rehype-pretty-code-title'
const CAPTION_ATTR = 'data-rehype-pretty-code-caption'

/** Split the children of a rehype-pretty-code figure into its title, its <pre> and the rest. */
export function splitCodeFigure(children: React.ReactNode): CodeFigureParts {
  let title = ''
  let pre: React.ReactElement | null = null
  const rest: React.ReactNode[] = []
  for (const child of React.Children.toArray(children)) {
    if (typeof child === 'string' && !child.trim()) continue
    if (React.isValidElement(child)) {
      const props = child.props as Record<string, unknown>
      if (!title && props[TITLE_ATTR] !== undefined) {
        title = codeText(props.children as React.ReactNode).replace(/\s+/g, ' ').trim()
        continue
      }
      if (!pre && props['data-language'] !== undefined && props[TITLE_ATTR] === undefined && props[CAPTION_ATTR] === undefined) {
        pre = child
        continue
      }
    }
    rest.push(child)
  }
  return { title, pre, rest }
}
