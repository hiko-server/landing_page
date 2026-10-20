import type { JSONContent } from '@tiptap/core'
import { isCalloutType } from '../../../../lib/rehype/calloutMarker'
import type { MdNode, MdRoot } from './mdast'

/**
 * The visual editor's document (ProseMirror JSON) → mdast, ready for
 * ./processors stringifyMdast. The inverse of ./toDoc:
 *
 *   - a figure is a paragraph holding only its image; a video is a
 *     paragraph holding only its link (`[title](url)`, or the bare URL —
 *     a GFM autolink — without a title);
 *   - a callout is the bridge's `callout` node (`> [!TYPE]` + body);
 *   - a table without a header row gets an empty one (GFM always has one);
 *     each column's alignment is its first cell's;
 *   - MDX islands are written back verbatim.
 *
 * Inline content is rebuilt as nested mdast marks, keeping a mark open
 * across neighbouring text where it continues. Markdown cannot express a
 * few editor states, which are written as their nearest equivalent: spaces
 * just inside `**…**` / `*…*` / `~~…~~` move outside the delimiters, spaces
 * at the edges of a paragraph and around its line breaks go (Markdown drops
 * them), a line break at the end of a paragraph goes (it would print a
 * backslash), and empty paragraphs are not written.
 */

type PMMark = { type: string; attrs?: Record<string, unknown> }

const ATTENTION: Record<string, string> = { bold: 'strong', italic: 'emphasis', strike: 'delete' }
/**
 * Outer to inner for marks that open and close together: `***x***` reads as
 * emphasis around strong, and `**[x](…)**` (bold around a link) is the
 * common way to write a bold link.
 */
const MARK_RANK: Record<string, number> = { italic: 0, bold: 1, strike: 2, link: 3 }

const sameMark = (a: PMMark, b: PMMark) =>
  a.type === b.type && (a.type !== 'link' || (a.attrs?.href === b.attrs?.href && (a.attrs?.title || null) === (b.attrs?.title || null)))

function wrapperFor(mark: PMMark): MdNode {
  if (mark.type === 'link') {
    const title = typeof mark.attrs?.title === 'string' && mark.attrs.title ? mark.attrs.title : null
    return { type: 'link', url: String(mark.attrs?.href ?? ''), title, children: [] }
  }
  return { type: ATTENTION[mark.type] || 'emphasis', children: [] }
}

function leafOf(node: JSONContent, code: boolean): MdNode | null {
  switch (node.type) {
    case 'text': {
      const value = node.text || ''
      if (!value) return null
      return code ? { type: 'inlineCode', value: value.replace(/\n/g, ' ') } : { type: 'text', value }
    }
    case 'hardBreak':
      return { type: 'break' }
    case 'inlineImage':
    case 'image':
      return { type: 'image', url: String(node.attrs?.src ?? ''), alt: String(node.attrs?.alt ?? ''), title: node.attrs?.title ? String(node.attrs.title) : null }
    case 'mdxInline':
      return { type: 'mdxIsland', value: String(node.attrs?.source ?? '') }
    default:
      return null
  }
}

/** Inline editor nodes → mdast phrasing with nested marks. */
export function phrasing(nodes: JSONContent[] | undefined): MdNode[] {
  const list = nodes || []
  const marksOf = (n: JSONContent) => ((n.marks || []) as PMMark[]).filter((m) => m.type in MARK_RANK)
  /** How many nodes from `i` on carry `mark` without a gap. */
  const runLength = (i: number, mark: PMMark) => {
    let j = i
    while (j < list.length && marksOf(list[j]).some((m) => sameMark(m, mark))) j++
    return j - i
  }
  const root: MdNode = { type: 'root', children: [] }
  const stack: Array<{ mark: PMMark | null; node: MdNode }> = [{ mark: null, node: root }]
  list.forEach((n, i) => {
    const code = (n.marks || []).some((m) => m.type === 'code')
    const marks = marksOf(n)
    // Marks already open stay where they are; new ones open the longest-running
    // outermost (so `**[a](…) b**` keeps the bold around the link), ties by rank.
    const open = stack.slice(1).map((s) => s.mark as PMMark)
    const continuing = open.filter((o) => marks.some((m) => sameMark(m, o)))
    const opening = marks
      .filter((m) => !open.some((o) => sameMark(m, o)))
      .map((m) => ({ m, run: runLength(i, m) }))
      .sort((a, b) => b.run - a.run || MARK_RANK[a.m.type] - MARK_RANK[b.m.type])
      .map((x) => x.m)
    const ordered = [...continuing, ...opening]
    let keep = 0
    while (keep < ordered.length && keep + 1 < stack.length && sameMark(ordered[keep], stack[keep + 1].mark as PMMark)) keep++
    stack.length = keep + 1
    for (const mark of ordered.slice(keep)) {
      const wrapper = wrapperFor(mark)
      ;(stack[stack.length - 1].node.children as MdNode[]).push(wrapper)
      stack.push({ mark, node: wrapper })
    }
    const leaf = leafOf(n, code)
    if (leaf) (stack[stack.length - 1].node.children as MdNode[]).push(leaf)
  })
  return tidy(root.children as MdNode[])
}

const isAttention = (n: MdNode) => n.type === 'strong' || n.type === 'emphasis' || n.type === 'delete'

/** Merge adjacent text, move edge spaces out of attention, drop empty wrappers. */
function tidy(children: MdNode[]): MdNode[] {
  const out: MdNode[] = []
  for (const child of children) {
    if (child.children) child.children = tidy(child.children)
    if (isAttention(child)) {
      const kids = child.children || []
      const first = kids[0]
      const last = kids[kids.length - 1]
      let lead = ''
      let trail = ''
      if (first?.type === 'text') {
        lead = /^\s*/.exec(first.value || '')?.[0] || ''
        first.value = (first.value || '').slice(lead.length)
      }
      if (last?.type === 'text') {
        trail = /\s*$/.exec(last.value || '')?.[0] || ''
        last.value = (last.value || '').slice(0, (last.value || '').length - trail.length)
      }
      child.children = kids.filter((k) => k.type !== 'text' || k.value)
      if (lead) pushText(out, lead)
      if (child.children.length) out.push(child)
      if (trail) pushText(out, trail)
      continue
    }
    if (child.type === 'link' && !(child.children || []).length) continue
    if (child.type === 'text') {
      pushText(out, child.value || '')
      continue
    }
    out.push(child)
  }
  return out
}

function pushText(out: MdNode[], value: string): void {
  if (!value) return
  const prev = out[out.length - 1]
  if (prev && prev.type === 'text') prev.value = (prev.value || '') + value
  else out.push({ type: 'text', value })
}

/** Markdown's view of a paragraph's edges: no surrounding spaces, no break at the end, no spaces around line breaks. */
function trimBlockInline(children: MdNode[]): MdNode[] {
  const out = children.map(function clean(n: MdNode): MdNode {
    if (n.type === 'text') return { ...n, value: (n.value || '').replace(/[ \t]*\n[ \t]*/g, '\n') }
    return n.children ? { ...n, children: n.children.map(clean) } : n
  })
  // An island right after a line break would read as a block of its own: the break becomes a space.
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]
    if (out[i].type === 'mdxIsland' && prev.type === 'text' && /\n$/.test(prev.value || '')) prev.value = (prev.value || '').replace(/\n$/, ' ')
  }
  const edge = (side: 'start' | 'end') => {
    for (;;) {
      const idx = side === 'start' ? 0 : out.length - 1
      const n = out[idx]
      if (!n) return
      if (n.type === 'text') {
        const v = side === 'start' ? (n.value || '').replace(/^\s+/, '') : (n.value || '').replace(/\s+$/, '')
        if (v) {
          out[idx] = { ...n, value: v }
          return
        }
        out.splice(idx, 1)
        continue
      }
      if (side === 'end' && n.type === 'break') {
        out.splice(idx, 1)
        continue
      }
      if ((isAttention(n) || n.type === 'link') && n.children?.length) {
        // Edge whitespace inside a mark at the edge of the block.
        const inner = side === 'start' ? n.children[0] : n.children[n.children.length - 1]
        if (inner.type === 'text') {
          const v = side === 'start' ? (inner.value || '').replace(/^\s+/, '') : (inner.value || '').replace(/\s+$/, '')
          const kids = [...n.children]
          kids[side === 'start' ? 0 : kids.length - 1] = { ...inner, value: v }
          out[idx] = { ...n, children: kids.filter((k) => k.type !== 'text' || k.value) }
          if (!out[idx].children?.length && n.type !== 'link') out.splice(idx, 1)
        }
      }
      return
    }
  }
  edge('start')
  edge('end')
  return out
}

function inlineContent(node: JSONContent): MdNode[] {
  return trimBlockInline(phrasing(node.content))
}

/**
 * Bare URLs a GFM autolink reads back exactly (a video paragraph holds
 * nothing else): no `_` `~` `*` (they could also be emphasis or
 * strikethrough) and no trailing punctuation (an autolink leaves it out).
 */
export const BARE_URL_RE = /^https?:\/\/[A-Za-z0-9.-]+(?:[/?#][A-Za-z0-9/?#=&%+.:@-]*[A-Za-z0-9/=-])?$/

function videoParagraph(node: JSONContent): MdNode {
  const url = String(node.attrs?.url ?? '')
  const title = typeof node.attrs?.title === 'string' ? node.attrs.title.replace(/\s+/g, ' ').trim() : ''
  if (!title && BARE_URL_RE.test(url)) {
    return { type: 'paragraph', children: [{ type: 'mdxIsland', value: url }] }
  }
  return { type: 'paragraph', children: [{ type: 'link', url, title: null, children: [{ type: 'text', value: title || url }] }] }
}

type Align = 'left' | 'right' | 'center' | null

function tableOf(node: JSONContent): MdNode {
  const rows = node.content || []
  const width = Math.max(1, ...rows.map((r) => (r.content || []).length))
  const align: Align[] = []
  for (let c = 0; c < width; c++) {
    const cell = rows[0]?.content?.[c]
    const a = cell?.attrs?.align
    align.push(a === 'left' || a === 'center' || a === 'right' ? a : null)
  }
  const cellOf = (cell: JSONContent | undefined): MdNode => ({ type: 'tableCell', children: cell ? inlineContent(cell) : [] })
  const rowOf = (row: JSONContent): MdNode => ({ type: 'tableRow', children: Array.from({ length: width }, (_, c) => cellOf(row.content?.[c])) })
  const hasHeader = !!rows[0] && (rows[0].content || []).length > 0 && (rows[0].content || []).every((c) => c.type === 'tableHeader')
  const children = rows.map(rowOf)
  if (!hasHeader) children.unshift({ type: 'tableRow', children: Array.from({ length: width }, () => ({ type: 'tableCell', children: [] })) })
  return { type: 'table', align, children }
}

function listOf(node: JSONContent, ordered: boolean): MdNode {
  const spread = Boolean(node.attrs?.spread)
  const items = (node.content || []).map((item): MdNode => {
    const checked = item.attrs?.checked
    return { type: 'listItem', spread, checked: typeof checked === 'boolean' ? checked : null, children: flow(item.content) }
  })
  const list: MdNode = { type: 'list', ordered, spread, children: items }
  if (ordered) {
    const start = Number(node.attrs?.start)
    list.start = Number.isInteger(start) && start >= 0 ? start : 1
  }
  return list
}

function blockOf(node: JSONContent): MdNode | null {
  switch (node.type) {
    case 'paragraph': {
      const children = inlineContent(node)
      return children.length ? { type: 'paragraph', children } : null
    }
    case 'heading': {
      const depth = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2))
      return { type: 'heading', depth, children: inlineContent(node) }
    }
    case 'blockquote':
      return { type: 'blockquote', children: flow(node.content) }
    case 'callout': {
      const type = isCalloutType(node.attrs?.type) ? node.attrs.type : 'note'
      const children = flow(node.content)
      const first = children[0]
      const joinMarker = !!first && first.type === 'paragraph' && first.children?.[0]?.type !== 'break'
      return { type: 'callout', calloutType: type, joinMarker, children }
    }
    case 'bulletList':
      return listOf(node, false)
    case 'orderedList':
      return listOf(node, true)
    case 'codeBlock': {
      const value = (node.content || []).map((t) => t.text || '').join('')
      const lang = typeof node.attrs?.language === 'string' && node.attrs.language.trim() ? node.attrs.language.trim() : null
      const meta = typeof node.attrs?.meta === 'string' && node.attrs.meta.trim() ? node.attrs.meta.trim() : null
      return { type: 'code', lang, meta: lang ? meta : null, value }
    }
    case 'horizontalRule':
      return { type: 'thematicBreak' }
    case 'image': {
      const leaf = leafOf(node, false)
      return leaf ? { type: 'paragraph', children: [leaf] } : null
    }
    case 'videoEmbed':
      return node.attrs?.url ? videoParagraph(node) : null
    case 'table':
      return tableOf(node)
    case 'mdxBlock': {
      const value = String(node.attrs?.source ?? '')
      return value.trim() ? { type: 'mdxIsland', value } : null
    }
    default:
      return null
  }
}

function flow(nodes: JSONContent[] | undefined): MdNode[] {
  const out: MdNode[] = []
  for (const n of nodes || []) {
    const b = blockOf(n)
    if (b) out.push(b)
  }
  return out
}

/** The mdast of an editor document. */
export function docToMdast(doc: JSONContent): MdRoot {
  return { type: 'root', children: flow(doc.content) }
}
