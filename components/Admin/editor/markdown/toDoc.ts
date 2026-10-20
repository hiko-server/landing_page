import type { JSONContent } from '@tiptap/core'
import { CALLOUT_MARKER_RE } from '../../../../lib/rehype/calloutMarker'
import { parseVideoUrl } from '../../../../lib/videoUrl'
import { isBlankText, mdText, type MdNode, type MdRoot } from './mdast'

/**
 * mdast → the visual editor's document (ProseMirror JSON), with the same
 * reading the site's compiler applies (lib/mdx.ts), so every node the
 * editor shows becomes the same thing on the page:
 *
 *   - a top-level paragraph that is only a YouTube / Vimeo link is a video
 *     (lib/rehype/autoEmbed.ts: the link text, unless it is the URL, is the
 *     title);
 *   - a paragraph that is only an image is a figure (lib/rehype/images.ts:
 *     the title is the caption, `#wide` / `#full` its width);
 *   - a blockquote that opens with `[!NOTE]` … `[!CAUTION]` is a callout
 *     (lib/rehype/alerts.ts, the same marker rule and body trimming);
 *   - GFM tables keep their column alignment; a header row with only empty
 *     cells means "no header row";
 *   - lists keep their start number, tight / loose spacing and task boxes;
 *     code keeps its language and meta (`title="…"`, `{1,3}`);
 *   - anything else — JSX, `{expressions}`, import / export, footnotes,
 *     reference links and definitions — becomes an MDX island holding its
 *     exact source, written back unchanged (./fromDoc).
 *
 * `source` is the text the tree was parsed from: islands are cut out of it
 * by position. Inside a quote or list, the container's prefix ("> ", the
 * item indent) is removed from the island's later lines — the serializer
 * puts it back.
 */

type Mark = { type: string; attrs?: Record<string, unknown> }

type Ctx = {
  source: string
  /** Converting the root's direct children (videos live only there). */
  top: boolean
  /** Width of the container prefix on the lines of the block being read. */
  prefix: number
  /** Pasted plain Markdown: raw HTML is text, not an island. */
  plain: boolean
}

const BOLD: Mark = { type: 'bold' }
const ITALIC: Mark = { type: 'italic' }
const STRIKE: Mark = { type: 'strike' }
const CODE: Mark = { type: 'code' }

/** Island source: the node's text in the source, container prefixes removed. */
export function islandSource(node: MdNode, source: string, prefix: number): string | null {
  const start = node.position?.start?.offset
  const end = node.position?.end?.offset
  if (typeof start !== 'number' || typeof end !== 'number' || end < start) return null
  const text = source.slice(start, end)
  if (prefix <= 0 || !text.includes('\n')) return text
  return text
    .split('\n')
    .map((line, i) => {
      if (i === 0) return line
      let k = 0
      while (k < prefix && k < line.length && (line[k] === ' ' || line[k] === '>' || line[k] === '\t')) k++
      return line.slice(k)
    })
    .join('\n')
}

const columnOf = (node: MdNode): number => Math.max(0, (node.position?.start?.column ?? 1) - 1)

function withMark(marks: Mark[], mark: Mark): Mark[] {
  return marks.some((m) => m.type === mark.type) ? marks : [...marks, mark]
}

function textNode(text: string, marks: Mark[]): JSONContent | null {
  if (!text) return null
  return marks.length ? { type: 'text', text, marks } : { type: 'text', text }
}

function island(node: MdNode, ctx: Ctx, inline: boolean, marks: Mark[] = []): JSONContent {
  const source = islandSource(node, ctx.source, ctx.prefix) ?? fallbackSource(node)
  const out: JSONContent = { type: inline ? 'mdxInline' : 'mdxBlock', attrs: { source } }
  if (inline && marks.length) out.marks = marks
  return out
}

/** Source of a node without a position (never expected from the parser; a safe, visible stand-in). */
function fallbackSource(node: MdNode): string {
  return typeof node.value === 'string' ? node.value : mdText(node)
}

/** Inline content (phrasing) → text nodes with marks, hard breaks, inline images and islands. */
function inlines(children: MdNode[] | undefined, ctx: Ctx, marks: Mark[] = []): JSONContent[] {
  const out: JSONContent[] = []
  const push = (n: JSONContent | null) => {
    if (n) out.push(n)
  }
  for (const child of children || []) {
    switch (child.type) {
      case 'text':
        push(textNode(child.value || '', marks))
        break
      case 'emphasis':
        out.push(...inlines(child.children, ctx, withMark(marks, ITALIC)))
        break
      case 'strong':
        out.push(...inlines(child.children, ctx, withMark(marks, BOLD)))
        break
      case 'delete':
        out.push(...inlines(child.children, ctx, withMark(marks, STRIKE)))
        break
      case 'inlineCode':
        push(textNode(child.value || '', withMark(marks, CODE)))
        break
      case 'link': {
        const link: Mark = { type: 'link', attrs: { href: child.url || '', title: child.title || null } }
        out.push(...inlines(child.children, ctx, [...marks.filter((m) => m.type !== 'link'), link]))
        break
      }
      case 'image': {
        const img: JSONContent = { type: 'inlineImage', attrs: { src: child.url || '', alt: child.alt || null, title: child.title || null } }
        if (marks.length) img.marks = marks
        out.push(img)
        break
      }
      case 'break':
        out.push({ type: 'hardBreak' })
        break
      case 'html':
        if (ctx.plain) {
          push(textNode(child.value || '', marks))
          break
        }
        out.push(island(child, ctx, true, marks))
        break
      default:
        out.push(island(child, ctx, true, marks))
    }
  }
  return out
}

/** The only meaningful child of a paragraph (whitespace text ignored), or null. */
function loneChild(p: MdNode): MdNode | null {
  const meaningful = (p.children || []).filter((c) => !isBlankText(c))
  return meaningful.length === 1 ? meaningful[0] : null
}

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '')

/** A top-level paragraph that is only a video link → its URL and title (lib/rehype/autoEmbed embedForParagraph). */
export function videoOfParagraph(p: MdNode): { url: string; title: string } | null {
  const a = loneChild(p)
  if (!a || a.type !== 'link') return null
  const href = a.url || ''
  if (!parseVideoUrl(href)) return null
  const text = mdText(a).replace(/\s+/g, ' ').trim()
  const title = text && !sameUrl(text, href) && !/^https?:\/\//i.test(text) ? text.slice(0, 200) : ''
  return { url: href, title }
}

/** A blockquote that is a callout → its type and body (lib/rehype/alerts calloutFor, on mdast). */
export function calloutOfQuote(quote: MdNode): { type: string; body: MdNode[] } | null {
  const children = quote.children || []
  const first = children[0]
  if (!first || first.type !== 'paragraph') return null
  const lead = first.children?.[0]
  if (!lead || lead.type !== 'text') return null
  const m = CALLOUT_MARKER_RE.exec(lead.value || '')
  if (!m) return null
  const rest: MdNode[] = [{ ...lead, value: (lead.value || '').slice(m[0].length), position: undefined }, ...(first.children || []).slice(1)]
  // Leading whitespace and line breaks go, as the compiler trims them.
  while (rest.length) {
    const head = rest[0]
    if (head.type === 'break' || isBlankText(head)) {
      rest.shift()
      continue
    }
    if (head.type === 'text') rest[0] = { ...head, value: (head.value || '').replace(/^\s+/, '') }
    break
  }
  const body = rest.length ? [{ ...first, children: rest }, ...children.slice(1)] : children.slice(1)
  return { type: m[1].toLowerCase(), body }
}

/** hast's list looseness (mdast-util-to-hast listLoose). */
function listLoose(list: MdNode): boolean {
  if (list.spread) return true
  return (list.children || []).some((item) => (item.spread === null || item.spread === undefined ? (item.children || []).length > 1 : Boolean(item.spread)))
}

const emptyParagraph = (): JSONContent => ({ type: 'paragraph' })

/** At least one block (quotes, callouts and items cannot be empty in the editor; empty paragraphs are not written). */
function nonEmpty(blocks: JSONContent[]): JSONContent[] {
  return blocks.length ? blocks : [emptyParagraph()]
}

function cellAlign(value: unknown): 'left' | 'center' | 'right' | null {
  return value === 'left' || value === 'center' || value === 'right' ? value : null
}

function table(node: MdNode, ctx: Ctx): JSONContent {
  const rows = node.children || []
  const align = node.align || []
  const width = Math.max(1, align.length || rows[0]?.children?.length || 1)
  const header = rows[0]
  const headerless = rows.length > 1 && !!header && (header.children || []).every((cell) => !(cell.children || []).some((c) => !isBlankText(c)))
  const bodyRows = headerless ? rows.slice(1) : rows
  const content = bodyRows.map((row, r) => {
    const cells: JSONContent[] = []
    for (let c = 0; c < width; c++) {
      const cell = row.children?.[c]
      const inner = cell ? inlines(cell.children, { ...ctx, prefix: columnOf(row) }) : []
      const a = cellAlign(align[c])
      const json: JSONContent = { type: !headerless && r === 0 ? 'tableHeader' : 'tableCell' }
      if (a) json.attrs = { align: a }
      if (inner.length) json.content = inner
      cells.push(json)
    }
    return { type: 'tableRow', content: cells }
  })
  return { type: 'table', content }
}

function block(node: MdNode, ctx: Ctx): JSONContent[] {
  const inner: Ctx = { ...ctx, top: false, prefix: columnOf(node) }
  switch (node.type) {
    case 'paragraph': {
      if (ctx.top) {
        const video = videoOfParagraph(node)
        if (video) return [{ type: 'videoEmbed', attrs: { url: video.url, title: video.title || null } }]
      }
      const only = loneChild(node)
      if (only && only.type === 'image') {
        return [{ type: 'image', attrs: { src: only.url || '', alt: only.alt || null, title: only.title || null } }]
      }
      const content = inlines(node.children, inner)
      return [content.length ? { type: 'paragraph', content } : emptyParagraph()]
    }
    case 'heading': {
      const content = inlines(node.children, inner)
      const level = Math.min(6, Math.max(1, node.depth || 1))
      return [content.length ? { type: 'heading', attrs: { level }, content } : { type: 'heading', attrs: { level } }]
    }
    case 'thematicBreak':
      return [{ type: 'horizontalRule' }]
    case 'blockquote': {
      const callout = calloutOfQuote(node)
      if (callout) return [{ type: 'callout', attrs: { type: callout.type }, content: nonEmpty(blocks(callout.body, inner)) }]
      return [{ type: 'blockquote', content: nonEmpty(blocks(node.children || [], inner)) }]
    }
    case 'list': {
      const spread = listLoose(node)
      const items = (node.children || []).map((item) => {
        const content = blocks(item.children || [], inner)
        // An item starts with a paragraph in the editor; an empty one is never written.
        if (!content.length || content[0].type !== 'paragraph') content.unshift(emptyParagraph())
        const json: JSONContent = { type: 'listItem', content }
        if (typeof item.checked === 'boolean') json.attrs = { checked: item.checked }
        return json
      })
      if (!items.length) return []
      if (node.ordered) {
        const start = typeof node.start === 'number' ? node.start : 1
        return [{ type: 'orderedList', attrs: { start, spread }, content: items }]
      }
      return [{ type: 'bulletList', attrs: { spread }, content: items }]
    }
    case 'code': {
      const json: JSONContent = { type: 'codeBlock', attrs: { language: node.lang || null, meta: node.meta || null } }
      if (node.value) json.content = [{ type: 'text', text: node.value }]
      return [json]
    }
    case 'table':
      return [table(node, inner)]
    case 'html':
      if (ctx.plain) return node.value ? [{ type: 'paragraph', content: [{ type: 'text', text: node.value }] }] : []
      return [island(node, { ...ctx, prefix: columnOf(node) }, false)]
    default:
      // JSX, expressions, ESM, footnote definitions, link definitions, …
      return [island(node, { ...ctx, prefix: columnOf(node) }, false)]
  }
}

function blocks(children: MdNode[], ctx: Ctx): JSONContent[] {
  return children.flatMap((child) => block(child, ctx))
}

/** The editor document of a parsed body. */
export function mdastToDoc(root: MdRoot, source: string, opts: { plain?: boolean } = {}): JSONContent {
  const content = blocks(root.children || [], { source, top: true, prefix: 0, plain: !!opts.plain })
  return { type: 'doc', content: content.length ? content : [emptyParagraph()] }
}
