import type { JSONContent } from '@tiptap/core'
import { markdownToDoc, parseProblem, type MdxParseProblem } from './index'

/**
 * MDX islands (source the visual editor keeps verbatim): what to call one,
 * and what an edit of its source turns into. Pure; unit-tested.
 */

export type IslandKind = 'component' | 'comment' | 'expression' | 'esm' | 'footnote' | 'footnote-ref' | 'definition' | 'reference' | 'mdx'

export type IslandInfo = { kind: IslandKind; label: string }

const JSX_NAME_RE = /^<\/?([A-Za-z][\w.:-]*)?/

/** A short description of an island's source ("Component <Figure>", "Note", "Footnote [^1]"…). */
export function describeIsland(source: string): IslandInfo {
  const s = String(source || '').trim()
  if (s.startsWith('{/*') || /^\{\s*\/\*/.test(s)) return { kind: 'comment', label: 'Note (not shown on the page)' }
  if (s.startsWith('{')) return { kind: 'expression', label: 'Expression (removed on the page)' }
  if (/^(import|export)\s/.test(s)) return { kind: 'esm', label: s.startsWith('import') ? 'Import (removed on the page)' : 'Export (removed on the page)' }
  const fn = /^\[\^([^\]\s]+)\]:/.exec(s)
  if (fn) return { kind: 'footnote', label: `Footnote [^${fn[1]}]` }
  const ref = /^\[\^([^\]\s]+)\]$/.exec(s)
  if (ref) return { kind: 'footnote-ref', label: `[^${ref[1]}]` }
  if (/^\[[^\]]+\]:\s*\S/.test(s)) return { kind: 'definition', label: 'Link definition' }
  if (s.startsWith('[') || s.startsWith('![')) return { kind: 'reference', label: 'Reference link' }
  if (s.startsWith('<')) {
    const m = JSX_NAME_RE.exec(s)
    const name = m?.[1]
    return { kind: 'component', label: name ? `<${name}>` : '<> fragment' }
  }
  return { kind: 'mdx', label: 'MDX' }
}

export type IslandEdit =
  /** Still MDX the editor keeps verbatim: store the new source. */
  | { ok: true; keep: true }
  /** Now ordinary content (or nothing): replace the island with it. */
  | { ok: true; keep: false; content: JSONContent[] }
  | { ok: false; problem: MdxParseProblem }

/** Kinds whose meaning depends on the rest of the document (a definition elsewhere): never re-read alone. */
const CONTEXTUAL: IslandKind[] = ['footnote', 'footnote-ref', 'definition', 'reference']

const isIsland = (n: JSONContent) => n.type === 'mdxBlock' || n.type === 'mdxInline'
const isBlank = (n: JSONContent) => n.type === 'text' && !String(n.text || '').trim()

function parse(source: string): { ok: true; blocks: JSONContent[] } | { ok: false; problem: MdxParseProblem } {
  try {
    const doc = markdownToDoc(source)
    return { ok: true, blocks: (doc.content || []).filter((n) => !(n.type === 'paragraph' && !n.content?.length)) }
  } catch (err) {
    return { ok: false, problem: parseProblem(err) }
  }
}

/**
 * Re-read an edited block island. Invalid MDX is reported (line, column);
 * source that is still MDX the editor keeps as source stays an island; source
 * that became plain Markdown turns into ordinary content; empty source
 * removes it.
 */
export function readBlockIsland(source: string): IslandEdit {
  if (!source.trim()) return { ok: true, keep: false, content: [] }
  const parsed = parse(source)
  if (!parsed.ok) return parsed
  if (CONTEXTUAL.includes(describeIsland(source).kind)) return { ok: true, keep: true }
  const { blocks } = parsed
  if (blocks.length === 1 && blocks[0].type === 'mdxBlock') return { ok: true, keep: true }
  if (blocks.length === 1 && blocks[0].type === 'paragraph' && (blocks[0].content || []).every((n) => isIsland(n) || isBlank(n))) return { ok: true, keep: true }
  return { ok: true, keep: false, content: blocks }
}

/** Re-read an edited inline island: it has to stay within its line (one paragraph). */
export function readInlineIsland(source: string): IslandEdit {
  if (!source.trim()) return { ok: true, keep: false, content: [] }
  const parsed = parse(source)
  if (!parsed.ok) return parsed
  if (CONTEXTUAL.includes(describeIsland(source).kind)) return { ok: true, keep: true }
  const { blocks } = parsed
  if (blocks.length === 1 && blocks[0].type === 'mdxBlock') return { ok: true, keep: true }
  if (blocks.length === 1 && blocks[0].type === 'paragraph') {
    const content = blocks[0].content || []
    if (content.length === 1 && isIsland(content[0])) return { ok: true, keep: true }
    return { ok: true, keep: false, content }
  }
  return { ok: false, problem: { message: 'Inline MDX has to stay within its line (no blank lines or blocks).' } }
}
