import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { calloutMarker, isCalloutType } from '../../../../lib/rehype/calloutMarker'
import type { MdNode, MdRoot } from './mdast'

/**
 * The unified processors behind the visual editor's Markdown bridge.
 *
 * Parsing uses exactly the parser the site compiles with (lib/mdx.ts:
 * remark-parse + remark-mdx + remark-gfm), so what the editor shows is what
 * the page renders. Pasted text is read as plain Markdown + GFM (no MDX:
 * a brace or a `<` in pasted prose stays text).
 *
 * Writing uses mdast-util-to-markdown (remark-stringify) with the GFM and
 * MDX extensions — its escaping keeps every character the author typed, and
 * the MDX extension escapes `{` and `<` so they stay text. The style:
 * `-` bullets, `*emphasis*`, `**strong**`, ``` fences, `---` rules, ATX
 * headings, `[text](url)` links (never `<url>` autolinks: MDX has none) and
 * GFM tables without pipe padding (an edit to one cell changes one line).
 *
 * Two node types of the bridge's own:
 *   - `callout`  a GitHub alert: `> [!NOTE]` then the body, quoted;
 *   - `mdxIsland` source text the editor keeps verbatim (JSX, expressions,
 *     ESM, footnotes, references) — written back exactly as it was read.
 */

const mdxParser = unified().use(remarkParse).use(remarkMdx).use(remarkGfm).freeze()
const markdownParser = unified().use(remarkParse).use(remarkGfm).freeze()

/** Parse an MDX body (throws the parser's VFileMessage on invalid MDX). */
export function parseMdx(source: string): MdRoot {
  return mdxParser.parse(source) as unknown as MdRoot
}

/** Parse plain Markdown + GFM (pasted text). */
export function parsePlainMarkdown(source: string): MdRoot {
  return markdownParser.parse(source) as unknown as MdRoot
}

type Info = { before: string; after: string; now: { line: number; column: number }; lineShift: number }
type Tracker = { move: (value: string) => string; shift: (n: number) => void; current: () => Info }
type State = {
  enter: (name: string) => () => void
  createTracker: (info: Info) => Tracker
  containerFlow: (node: MdNode, info: Info) => string
  indentLines: (value: string, map: (line: string, index: number, blank: boolean) => string) => string
}

type Handler = ((node: MdNode, parent: MdNode | undefined, state: State, info: Info) => string) & { peek?: (node: MdNode) => string }

/** `> [!NOTE]` + the body, quoted (the compiler's lib/rehype/alerts reads it back). */
const callout: Handler = (node, _parent, state, info) => {
  const type = isCalloutType(node.calloutType) ? node.calloutType : 'note'
  const marker = calloutMarker(type)
  const exit = state.enter('blockquote')
  const tracker = state.createTracker(info)
  tracker.move('> ')
  tracker.shift(2)
  const body = node.children && node.children.length ? state.containerFlow(node, tracker.current()) : ''
  exit()
  // `> [!NOTE]\n> First line…` when the body opens with a paragraph that may
  // continue the marker's line; otherwise the marker is a paragraph of its own.
  const text = !body ? marker : node.joinMarker ? `${marker}\n${body}` : `${marker}\n\n${body}`
  return state.indentLines(text, (line, _i, blank) => '>' + (blank ? '' : ' ') + line)
}
callout.peek = () => '>'

/** Source text kept verbatim. */
const mdxIsland: Handler = (node) => String(node.value ?? '')
mdxIsland.peek = (node) => String(node.value ?? '').charAt(0)

export const STRINGIFY_OPTIONS = {
  bullet: '-',
  bulletOther: '*',
  bulletOrdered: '.',
  emphasis: '*',
  strong: '*',
  fence: '`',
  fences: true,
  rule: '-',
  ruleRepetition: 3,
  ruleSpaces: false,
  setext: false,
  closeAtx: false,
  listItemIndent: 'one',
  incrementListMarker: true,
  quote: '"',
  resourceLink: true,
  tightDefinitions: false,
} as const

const stringifier = unified()
  .use(remarkStringify, { ...STRINGIFY_OPTIONS, handlers: { callout, mdxIsland } } as unknown as Parameters<typeof remarkStringify>[0])
  .use(remarkMdx)
  .use(remarkGfm, { tablePipeAlign: false })
  .freeze()

/** Markdown of an mdast tree, without a final newline (as the editor always wrote it). */
export function stringifyMdast(root: MdRoot): string {
  return stringifier.stringify(root as unknown as Parameters<typeof stringifier.stringify>[0]).replace(/\n+$/, '')
}
