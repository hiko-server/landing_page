import type { JSONContent } from '@tiptap/core'
import { parseMdx, parsePlainMarkdown, stringifyMdast } from './processors'
import { calloutOfQuote, mdastToDoc, videoOfParagraph } from './toDoc'
import { docToMdast } from './fromDoc'
import { parseVideoUrl } from '../../../../lib/videoUrl'
import type { MdNode, MdRoot } from './mdast'

/**
 * The visual editor's Markdown bridge: MDX body ⇄ editor document.
 *
 *   markdownToDoc(md)   parse with the site's own parser → ProseMirror JSON
 *   docToMarkdown(doc)  ProseMirror JSON → MDX (no final newline)
 *   visualFidelity(md)  can the visual editor hold this body without
 *                       changing the page? (parse error / lossy / ok)
 *
 * Pure and DOM-free: runs the same in the browser and in Node tests.
 */

export { parseMdx, parsePlainMarkdown, stringifyMdast } from './processors'
export { mdastToDoc } from './toDoc'
export { docToMdast } from './fromDoc'

/** The editor document of an MDX body (throws on invalid MDX). */
export function markdownToDoc(md: string): JSONContent {
  const source = String(md ?? '')
  return mdastToDoc(parseMdx(source), source)
}

/** The editor document of pasted plain Markdown (never throws). */
export function plainMarkdownToDoc(md: string): JSONContent {
  const source = String(md ?? '')
  return mdastToDoc(parsePlainMarkdown(source), source, { plain: true })
}

/** The MDX body of an editor document. */
export function docToMarkdown(doc: JSONContent): string {
  return stringifyMdast(docToMdast(doc))
}

// ── Fidelity ──────────────────────────────────────────────────────────────

export type MdxParseProblem = { message: string; line?: number; column?: number }

export type VisualFidelity =
  | { ok: true; markdown: string; islands: number }
  | { ok: false; reason: 'parse'; problem: MdxParseProblem }
  | { ok: false; reason: 'lossy'; line?: number }

type Place = { line?: unknown; column?: unknown; start?: { line?: unknown; column?: unknown } }

/** `(3:1-3:10)` in a message: some mdast-util-mdx-jsx errors carry their place only there (as lib/mdx.ts reads them). */
const REASON_POSITION_RE = /\((\d+):(\d+)(?:-\d+:\d+)?\)/

/** Line / column of a parser message. */
export function parseProblem(err: unknown): MdxParseProblem {
  const e = (err && typeof err === 'object' ? err : {}) as { reason?: unknown; message?: unknown; line?: unknown; column?: unknown; place?: Place }
  const message = String(e.reason || e.message || err || 'Invalid MDX').trim()
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : undefined)
  let line = num(e.line) ?? num(e.place?.start?.line) ?? num(e.place?.line)
  let column = num(e.column) ?? num(e.place?.start?.column) ?? num(e.place?.column)
  if (!line) {
    const m = REASON_POSITION_RE.exec(message)
    if (m) {
      line = num(Number(m[1]))
      column = num(Number(m[2]))
    }
  }
  return { message, ...(line ? { line } : {}), ...(column ? { column } : {}) }
}

const WRAPPERS = new Set(['strong', 'emphasis', 'delete', 'link'])

/**
 * Inline wrappers with the same extent (`**[x](…)**` / `[**x**](…)`,
 * `***x***`) in one fixed order: their nesting does not change what is
 * rendered or announced.
 */
export function sortWrapperChain(node: MdNode): MdNode {
  if (!WRAPPERS.has(node.type)) return node
  const chain: MdNode[] = [node]
  let last = node
  while (last.children && last.children.length === 1 && WRAPPERS.has(last.children[0].type)) {
    last = last.children[0]
    chain.push(last)
  }
  if (chain.length < 2) return node
  const inner = last.children || []
  const key = (n: MdNode) => `${n.type}|${n.url || ''}|${n.title || ''}`
  const sorted = [...chain].sort((a, b) => key(a).localeCompare(key(b)))
  let out: MdNode = { ...sorted[sorted.length - 1], children: inner }
  for (let i = sorted.length - 2; i >= 0; i--) out = { ...sorted[i], children: [out] }
  return out
}

const FLOW_KEYS = ['type', 'depth', 'ordered', 'start', 'checked', 'lang', 'meta', 'url', 'title', 'alt', 'value', 'name', 'identifier', 'label', 'referenceType']

/**
 * A comparable form of an mdast tree: positions and parser data dropped,
 * text merged with whitespace runs collapsed (the page renders them alike),
 * callouts and videos read the way the compiler reads them, list spacing
 * as hast sees it (loose or tight), table rows padded to the header.
 */
export function canonicalMdast(input: MdNode, top = true): unknown {
  const node = sortWrapperChain(input)
  if (node.type === 'blockquote') {
    const callout = calloutOfQuote(node)
    if (callout) return { type: 'callout', callout: callout.type, children: canonicalChildren(callout.body, false) }
  }
  if (node.type === 'paragraph' && top) {
    const video = videoOfParagraph(node)
    const ref = video ? parseVideoUrl(video.url) : null
    if (video && ref) return { type: 'video', ref: JSON.stringify(ref), title: video.title }
  }
  const out: Record<string, unknown> = {}
  for (const key of FLOW_KEYS) {
    const v = node[key]
    if (v === undefined || v === null || v === '') continue
    out[key] = key === 'value' && node.type === 'text' ? String(v).replace(/\s+/g, ' ') : v
  }
  if (node.type === 'list') {
    out.loose = Boolean(node.spread) || (node.children || []).some((i) => (i.spread === null || i.spread === undefined ? (i.children || []).length > 1 : Boolean(i.spread)))
    if (!node.ordered) delete out.start
  }
  if (node.type === 'table') {
    const width = (node.align || []).length
    out.align = (node.align || []).map((a) => a || null)
    out.children = (node.children || []).map((row) => ({
      type: 'tableRow',
      children: Array.from({ length: width }, (_, c) => ({ type: 'tableCell', children: canonicalChildren(row.children?.[c]?.children || [], false) })),
    }))
    return out
  }
  if (Array.isArray(node.attributes)) out.attributes = JSON.stringify(stripPositions(node.attributes))
  if (node.children) out.children = canonicalChildren(node.children, node.type === 'root')
  return out
}

function stripPositions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPositions)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) if (k !== 'position' && k !== 'data') out[k] = stripPositions(v)
    return out
  }
  return value
}

function canonicalChildren(children: MdNode[], top: boolean): unknown[] {
  const out: unknown[] = []
  for (const child of children) {
    const c = canonicalMdast(child, top) as Record<string, unknown>
    const prev = out[out.length - 1] as Record<string, unknown> | undefined
    if (c.type === 'text' && prev && prev.type === 'text') {
      prev.value = String(prev.value || '') + String(c.value || '')
      prev.value = String(prev.value).replace(/\s+/g, ' ')
      continue
    }
    if (c.type === 'text' && !c.value) continue
    out.push(c)
  }
  // Whitespace at the edges of a block does not render.
  const first = out[0] as Record<string, unknown> | undefined
  if (first?.type === 'text') first.value = String(first.value || '').replace(/^\s+/, '')
  const last = out[out.length - 1] as Record<string, unknown> | undefined
  if (last?.type === 'text') last.value = String(last.value || '').replace(/\s+$/, '')
  return out.filter((c) => !((c as Record<string, unknown>).type === 'text' && !(c as Record<string, unknown>).value))
}

/** 1-based source line of the first top-level node whose canonical form differs, if any. */
function firstDifference(a: MdRoot, b: MdRoot): number | undefined {
  const ca = canonicalChildren(a.children, true)
  const cb = canonicalChildren(b.children, true)
  const n = Math.max(ca.length, cb.length)
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(ca[i]) !== JSON.stringify(cb[i])) {
      const node = a.children[Math.min(i, a.children.length - 1)]
      return node?.position?.start?.line
    }
  }
  return undefined
}

/**
 * Whether the visual editor can hold `md` without changing the page: the
 * body is parsed, turned into an editor document, written back and parsed
 * again; both trees must read the same (canonicalMdast). `markdown` is what
 * the editor writes for it (the first edit saves that form).
 */
export function visualFidelity(md: string): VisualFidelity {
  const source = String(md ?? '')
  let original: MdRoot
  try {
    original = parseMdx(source)
  } catch (err) {
    return { ok: false, reason: 'parse', problem: parseProblem(err) }
  }
  let markdown: string
  let again: MdRoot
  let islands = 0
  try {
    const doc = mdastToDoc(original, source)
    islands = countIslands(doc)
    markdown = stringifyMdast(docToMdast(doc))
    again = parseMdx(markdown)
  } catch {
    return { ok: false, reason: 'lossy', line: 1 }
  }
  const same = JSON.stringify(canonicalMdast(original)) === JSON.stringify(canonicalMdast(again))
  if (!same) return { ok: false, reason: 'lossy', line: firstDifference(original, again) }
  return { ok: true, markdown, islands }
}

function countIslands(doc: JSONContent): number {
  let n = 0
  const walk = (node: JSONContent) => {
    if (node.type === 'mdxBlock' || node.type === 'mdxInline') n++
    node.content?.forEach(walk)
  }
  walk(doc)
  return n
}
