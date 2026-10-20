/**
 * editor-parity (H2): property-based round trips of the Markdown bridge.
 *
 * A seeded generator builds random editor documents — paragraphs, headings,
 * lists, quotes, callouts, code, tables, figures — whose text is full of
 * characters Markdown and MDX give meaning to (`* _ ~ [ ] ( ) # > - + | { }
 * < > \` ! & 1.`), with random marks. For every document:
 *
 *   - its MDX parses (the escaping never produces invalid MDX);
 *   - reading that MDX back gives the same document (text, marks, block
 *     structure), once Markdown's own normalisations are applied (spaces at
 *     the edges of a block and of a mark do not survive Markdown);
 *   - writing it again gives the same text (a fixed point).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { JSONContent } from '@tiptap/core'
import { docToMarkdown, markdownToDoc, parseMdx } from '../components/Admin/editor/markdown/index'

/** mulberry32: small, seeded, reproducible. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS = ['alpha', 'beta', 'gamma', 'rig', 'servo', 'model', '中文', '测试', 'naïve', 'café', '42', '3.14', 'x']
// No bare URLs: GFM links them wherever they stand (after escapes are read), and so does the
// editor as they are typed or pasted (the link extension's autolink).
const SYMBOLS = ['*', '_', '~', '[', ']', '(', ')', '#', '>', '-', '+', '|', '{', '}', '<', '`', '!', '&', '\\', '1.', '**', '__', '~~', '[!NOTE]', '&amp;', '<b>', '{x}', '//', ':', '"', "'"]

function gen(seed: number) {
  const r = rng(seed)
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
  // In a table cell no backslash: GFM cannot write a code span with a backslash right before
  // a pipe there (`\\|` splits the row) — the one thing a cell can hold that its Markdown cannot.
  const word = (cell = false) => (r() < 0.3 ? pick(cell ? SYMBOLS.filter((x) => x !== '\\') : SYMBOLS) : pick(WORDS))
  const phrase = (n: number, cell = false) => Array.from({ length: n }, () => word(cell)).join(r() < 0.8 ? ' ' : '')

  const inline = (allowLinks = true): JSONContent[] => {
    const out: JSONContent[] = []
    const n = 1 + Math.floor(r() * 4)
    for (let i = 0; i < n; i++) {
      const text = phrase(1 + Math.floor(r() * 4), !allowLinks)
      const marks: NonNullable<JSONContent['marks']> = []
      if (r() < 0.25) marks.push({ type: 'bold' })
      if (r() < 0.2) marks.push({ type: 'italic' })
      if (r() < 0.1) marks.push({ type: 'strike' })
      if (r() < 0.12) marks.push({ type: 'code' })
      if (allowLinks && r() < 0.12) marks.push({ type: 'link', attrs: { href: `https://example.com/${pick(['a', 'b_c', 'd(e)', 'f?g=1'])}`, title: null } })
      // Code inside a link holds no "]": at the start of a line `[\`]:x\`](…)` reads as a link
      // definition, and a code span has no escapes (the one link text Markdown cannot write).
      const safe = marks.some((m) => m.type === 'code') && marks.some((m) => m.type === 'link') ? text.replace(/\]/g, ')') : text
      out.push(marks.length ? { type: 'text', text: safe, marks } : { type: 'text', text: safe })
      if (i < n - 1) out.push({ type: 'text', text: ' ' })
    }
    return out
  }
  const paragraph = (): JSONContent => ({ type: 'paragraph', content: inline() })
  const block = (depth: number): JSONContent => {
    const k = r()
    if (k < 0.35 || depth > 1) return paragraph()
    if (k < 0.45) return { type: 'heading', attrs: { level: 1 + Math.floor(r() * 4) }, content: inline() }
    if (k < 0.55) {
      const ordered = r() < 0.5
      const items = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ type: 'listItem', content: [paragraph()] }))
      return ordered ? { type: 'orderedList', attrs: { start: 1 + Math.floor(r() * 5), spread: false }, content: items } : { type: 'bulletList', attrs: { spread: false }, content: items }
    }
    if (k < 0.62) return { type: 'blockquote', content: [block(depth + 1)] }
    if (k < 0.7) return { type: 'callout', attrs: { type: pick(['note', 'tip', 'important', 'warning', 'caution']) }, content: [block(depth + 1)] }
    if (k < 0.78) return { type: 'codeBlock', attrs: { language: pick([null, 'ts', 'sh']), meta: null }, content: [{ type: 'text', text: `${phrase(3)}\n${phrase(2)}` }] }
    if (k < 0.88) {
      const cols = 1 + Math.floor(r() * 3)
      const row = (header: boolean) => ({
        type: 'tableRow',
        content: Array.from({ length: cols }, (_, c) => ({ type: header ? 'tableHeader' : 'tableCell', attrs: { align: c === 0 ? pick([null, 'left', 'center', 'right']) : null }, content: inline(false) })),
      })
      return { type: 'table', content: [row(true), row(false)] }
    }
    if (k < 0.94) return { type: 'image', attrs: { src: `/uploads/${pick(['a', 'b'])}.png${pick(['', '#wide', '#full'])}`, alt: phrase(2), title: r() < 0.5 ? phrase(2) : null } }
    return { type: 'horizontalRule' }
  }
  return { type: 'doc', content: Array.from({ length: 1 + Math.floor(r() * 5) }, () => block(0)) } as JSONContent
}

type Flat = { type: string; attrs?: Record<string, unknown>; text?: string; marks?: string[]; content?: Flat[] }

/** A document as Markdown can keep it: merged text with marks, block edges and mark edges trimmed, defaults filled. */
function normal(node: JSONContent): Flat {
  if (node.content && node.content.some((c) => c.type === 'text' || c.type === 'hardBreak' || c.type === 'inlineImage' || c.type === 'mdxInline')) {
    const runs: Flat[] = []
    for (const c of node.content) {
      const marks = (c.marks || []).map((m) => (m.type === 'link' ? `link:${m.attrs?.href}` : m.type)).sort()
      const text = c.type === 'text' ? c.text || '' : `<${c.type}>`
      const prev = runs[runs.length - 1]
      if (prev && JSON.stringify(prev.marks) === JSON.stringify(marks)) prev.text += text
      else runs.push({ type: 'run', text, marks })
    }
    // Markdown drops spaces at the edges of a block and moves them out of marks (a run of
    // spaces only keeps no mark); runs that end up alike merge again.
    const spaced = runs.map((r) => ({ ...r, text: r.text!.replace(/[ \t]+/g, ' '), marks: r.text!.trim() ? r.marks : [] }))
    const plain: Flat[] = []
    for (const r of spaced) {
      const prev = plain[plain.length - 1]
      if (prev && JSON.stringify(prev.marks) === JSON.stringify(r.marks)) prev.text += r.text!
      else plain.push({ ...r })
    }
    while (plain.length && !plain[0].text!.trim()) plain.shift()
    while (plain.length && !plain[plain.length - 1].text!.trim()) plain.pop()
    const joined = plain
      .map((r) => (r.marks!.some((m) => m !== 'code') ? `[${r.marks!.join(',')}]${r.text!.trim()}` : r.text))
      .join('|')
      .replace(/\s+/g, ' ')
      .trim()
    return { type: node.type || '', text: joined, attrs: blockAttrs(node) }
  }
  const content = (node.content || []).map(normal).filter((c) => !(c.type === 'paragraph' && !c.text))
  return { type: node.type || '', attrs: blockAttrs(node), ...(content.length ? { content } : {}) }
}

function blockAttrs(node: JSONContent): Record<string, unknown> | undefined {
  const a = node.attrs || {}
  switch (node.type) {
    case 'heading':
      return { level: a.level }
    case 'orderedList':
      return { start: a.start ?? 1 }
    case 'callout':
      return { type: a.type }
    case 'codeBlock':
      return { language: a.language || null }
    case 'tableHeader':
    case 'tableCell':
      return { align: a.align || null }
    case 'image':
      return { src: a.src, alt: a.alt || '', title: a.title || null }
    default:
      return undefined
  }
}

/** A table's alignment lives in its first row (the delimiter row): later rows take it. */
function alignColumns(doc: JSONContent): JSONContent {
  const walk = (n: JSONContent): JSONContent => {
    if (n.type === 'table' && n.content?.[0]) {
      const first = n.content[0]
      return {
        ...n,
        content: n.content.map((row) => ({
          ...row,
          content: (row.content || []).map((cell, c) => ({ ...cell, attrs: { ...(cell.attrs || {}), align: first.content?.[c]?.attrs?.align ?? null } })),
        })),
      }
    }
    return n.content ? { ...n, content: n.content.map(walk) } : n
  }
  return walk(doc)
}

/** As the compiler reads a quote whose text starts with `[!TYPE]`: a callout (the editor shows it so too, nodes/callout quotesToCallouts). */
function quotesAsCompiled(doc: JSONContent): JSONContent {
  const walk = (n: JSONContent): JSONContent => {
    const content = n.content?.map(walk)
    if (n.type === 'blockquote' && content?.[0]?.type === 'paragraph') {
      const lead = content[0].content?.[0]
      const m = lead && lead.type === 'text' && !lead.marks?.length ? /^\s*\[!(note|tip|important|warning|caution)\]/i.exec(lead.text || '') : null
      if (m && lead) {
        const first = { ...content[0], content: [{ ...lead, text: (lead.text || '').slice(m[0].length).replace(/^\s+/, '') }, ...(content[0].content || []).slice(1)].filter((c) => c.type !== 'text' || c.text) }
        return { type: 'callout', attrs: { type: m[1].toLowerCase() }, content: [first, ...content.slice(1)] }
      }
    }
    return content ? { ...n, content } : n
  }
  return walk(doc)
}

const RUNS = Number(process.env.EDITOR_PARITY_RUNS || 1000)

test(`${RUNS} random documents: valid MDX, read back the same, a fixed point`, () => {
  const seen = new Map<string, number>()
  const count = (n: JSONContent) => {
    seen.set(n.type || '', (seen.get(n.type || '') || 0) + 1)
    for (const m of n.marks || []) seen.set(`mark:${m.type}`, (seen.get(`mark:${m.type}`) || 0) + 1)
    n.content?.forEach(count)
  }
  for (let seed = 1; seed <= RUNS; seed++) {
    const doc = gen(seed)
    count(doc)
    const md = docToMarkdown(doc)
    assert.doesNotThrow(() => parseMdx(md), `seed ${seed}: valid MDX\n${md}`)
    const back = markdownToDoc(md)
    const aligned = alignColumns(doc)
    const compiled = quotesAsCompiled(aligned)
    assert.deepEqual(normal(back), normal(compiled), `seed ${seed}: the same document\n${md}`)
    const again = docToMarkdown(back)
    assert.equal(docToMarkdown(markdownToDoc(again)), again, `seed ${seed}: a fixed point\n${again}`)
    // Unless a quote turned into a callout (as on the page), the first writing is already the fixed point.
    if (JSON.stringify(compiled) === JSON.stringify(aligned)) assert.equal(again, md, `seed ${seed}: written the same\n${md}`)
  }
  // The generator really covers every block and mark.
  for (const type of ['table', 'callout', 'blockquote', 'codeBlock', 'orderedList', 'bulletList', 'heading', 'image', 'horizontalRule', 'mark:bold', 'mark:italic', 'mark:strike', 'mark:code', 'mark:link']) {
    assert.ok((seen.get(type) || 0) >= Math.min(10, RUNS / 30), `${type} generated ${seen.get(type) || 0} times`)
  }
})
