import { element, isElement, textOf, type HastElement, type HastNode } from './hast'

/**
 * rehype plugin: the fallback for CSS `text-autospace` in Chinese and
 * Japanese articles (F1, W3C clreq §3.2.2 "spacing between Han and Western
 * characters").
 *
 * Where a Han / kana character touches a Latin, Greek or Cyrillic letter or
 * an ASCII digit with no space between them (“使用TensorFlow训练”), an empty
 * `<span class="autospace">` is inserted at the boundary — inside a text
 * node, or between two inline siblings (“中文<code>npm</code>”,
 * “<strong>模型</strong>YOLOv8”). styles/globals.css gives it a 1/8 em
 * margin only in browsers without `text-autospace`; browsers that have it
 * space the text themselves and the span stays empty and zero-width. The
 * text itself is never changed (copying, search and screen readers read it
 * as written), and a space the author typed is left alone.
 *
 * Also marks `<em>` / `<i>` whose text has no Han or kana with
 * `data-script="latin"`: the stylesheet keeps those italic, while Chinese
 * emphasis uses emphasis dots (着重号) instead of a slanted fake italic.
 *
 * Code (`pre`, `code`, `kbd`, `samp`) is never entered, though its first
 * and last characters count at its edges. The feeds drop the marks
 * (lib/feedHtml.ts); the Markdown twins are built from the source and never
 * see them.
 */
export type AutospaceOptions = {
  /** BCP-47 language of the article; the plugin runs for zh-* and ja only. */
  lang?: string
}

const IDEOGRAPHIC_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
/** Western letters and ASCII digits — not the full-width forms (U+FF00–FFEF), which are spaced like ideographs. */
const WESTERN_RE = /(?![＀-￯])[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}0-9]/u

const SKIP = new Set(['pre', 'code', 'kbd', 'samp', 'script', 'style', 'svg', 'math', 'textarea'])
/**
 * Elements that sit in a line of text: a boundary between two of them is a
 * boundary in the text. Not `sup` / `sub`: a footnote reference ("文字¹",
 * shown as "[1]") or an exponent is set close to its word.
 */
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'time', 'u', 'var'])

const isIdeographic = (ch: string) => IDEOGRAPHIC_RE.test(ch)
const isWestern = (ch: string) => WESTERN_RE.test(ch)

/** True when the two characters meet across scripts and want a gap. */
export function needsGap(before: string, after: string): boolean {
  if (!before || !after) return false
  return (isIdeographic(before) && isWestern(after)) || (isWestern(before) && isIdeographic(after))
}

export const AUTOSPACE_CLASS = 'autospace'

const gap = (): HastElement => element('span', { className: [AUTOSPACE_CLASS] }, [])

function isGap(node: HastNode | undefined): boolean {
  return !!node && isElement(node, 'span') && Array.isArray(node.properties?.className) && (node.properties.className as unknown[]).includes(AUTOSPACE_CLASS)
}

/** Split a text value at every boundary that needs a gap. */
export function splitAtGaps(value: string): string[] {
  const chars = Array.from(value)
  const parts: string[] = []
  let start = 0
  for (let i = 1; i < chars.length; i++) {
    if (needsGap(chars[i - 1], chars[i])) {
      parts.push(chars.slice(start, i).join(''))
      start = i
    }
  }
  parts.push(chars.slice(start).join(''))
  return parts
}

function edgeChar(node: HastNode, end: 'first' | 'last'): string {
  if (isGap(node)) return ''
  if (node.type === 'text') {
    const chars = Array.from(node.value || '')
    return (end === 'first' ? chars[0] : chars[chars.length - 1]) || ''
  }
  if (!isElement(node) || !INLINE.has(node.tagName)) return ''
  const chars = Array.from(textOf(node))
  return (end === 'first' ? chars[0] : chars[chars.length - 1]) || ''
}

function transform(parent: HastNode): void {
  const kids = parent.children
  if (!kids) return
  const split: HastNode[] = []
  for (const child of kids) {
    if (child.type === 'text') {
      const parts = splitAtGaps(child.value || '')
      parts.forEach((part, i) => {
        if (i > 0) split.push(gap())
        split.push({ type: 'text', value: part })
      })
      continue
    }
    if (isElement(child)) {
      if ((child.tagName === 'em' || child.tagName === 'i') && !IDEOGRAPHIC_RE.test(textOf(child)) && WESTERN_RE.test(textOf(child))) {
        child.properties = { ...child.properties, dataScript: 'latin' }
      }
      if (!SKIP.has(child.tagName)) transform(child)
    }
    split.push(child)
  }
  const out: HastNode[] = []
  for (const node of split) {
    const prev = out[out.length - 1]
    if (prev && !isGap(prev) && !isGap(node) && needsGap(edgeChar(prev, 'last'), edgeChar(node, 'first'))) out.push(gap())
    out.push(node)
  }
  parent.children = out
}

export default function rehypeAutospace(options: AutospaceOptions = {}) {
  return (tree: HastNode) => {
    const lang = (options.lang || '').toLowerCase()
    if (!(lang === 'zh' || lang.startsWith('zh-') || lang === 'ja' || lang.startsWith('ja-'))) return
    transform(tree)
  }
}
