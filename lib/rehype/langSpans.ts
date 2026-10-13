import { classList, element, isElement, type HastElement, type HastNode } from './hast'

/**
 * rehype plugin: language of parts (WCAG 3.1.2).
 *
 * In an English article, runs of Chinese (two or more Han characters, with
 * the CJK punctuation and spaces between them) are wrapped in
 * `<span lang="zh-Hans">`; in a Chinese article, runs of two or more Latin
 * words are wrapped in `<span lang="en">`. Screen readers then switch voice
 * for the passage, and the browser picks the right font fallback and line
 * breaking. A single Han character or a lone Latin word (a product name,
 * "API") is left alone.
 *
 * Code (`pre`, `code`, `kbd`, `samp`), scripts/styles, and any subtree with
 * an explicit `lang` are skipped. Runs inside existing inline elements are
 * wrapped within that element, so the tree structure never changes beyond
 * the added spans.
 */
export type LangSpansOptions = {
  /** BCP-47 language of the article ("en", "zh-Hans", …). */
  lang?: string
}

const SKIP_TAGS = new Set(['pre', 'code', 'kbd', 'samp', 'script', 'style', 'svg', 'math', 'textarea'])

// A Han run: Han characters, optionally joined by CJK punctuation, full-width
// forms, middle dots and spaces — but it must start and end on a Han
// character and contain at least two of them.
const HAN = '\\p{Script=Han}'
const CJK_PUNCT = '\\u3000-\\u303f\\uff00-\\uffef\\u00b7\\u2014\\u2026\\u201c\\u201d\\u2018\\u2019'
const HAN_RUN_RE = new RegExp(`${HAN}(?:[${CJK_PUNCT}\\s]*${HAN})+(?:[${CJK_PUNCT}]+)?`, 'gu')

// A Latin run: two or more Latin words (letters/digits with inner ' - . and
// optional trailing punctuation) separated by spaces / light punctuation.
const LATIN_WORD = "[\\p{Script=Latin}][\\p{Script=Latin}\\p{N}'’.-]*"
const LATIN_RUN_RE = new RegExp(`${LATIN_WORD}(?:[\\s,;:!?()"“”]+${LATIN_WORD})+[.!?]?`, 'gu')

export type LangPart = { text: string; lang?: string }

/**
 * Split `text` into parts, tagging foreign-script runs with `foreignLang`.
 * `kind` decides which runs count as foreign: Han runs ('han') or Latin
 * runs ('latin').
 */
export function splitByScript(text: string, kind: 'han' | 'latin', foreignLang: string): LangPart[] {
  const re = kind === 'han' ? HAN_RUN_RE : LATIN_RUN_RE
  const parts: LangPart[] = []
  let last = 0
  re.lastIndex = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    parts.push({ text: m[0], lang: foreignLang })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts.length ? parts : [{ text }]
}

/** Which runs to tag for an article language; null when nothing is foreign. */
export function foreignRuns(articleLang: string | undefined): { kind: 'han' | 'latin'; lang: string } | null {
  const lang = (articleLang || 'en').toLowerCase()
  if (lang === 'en' || lang.startsWith('en-')) return { kind: 'han', lang: 'zh-Hans' }
  if (lang === 'zh' || lang.startsWith('zh-')) return { kind: 'latin', lang: 'en' }
  return null
}

function hasExplicitLang(node: HastElement): boolean {
  const p = node.properties
  return (typeof p.lang === 'string' && p.lang !== '') || (typeof p.xmlLang === 'string' && p.xmlLang !== '')
}

function transform(parent: HastNode, kind: 'han' | 'latin', lang: string): void {
  const kids = parent.children
  if (!kids) return
  const next: HastNode[] = []
  for (const child of kids) {
    if (child.type === 'text') {
      const parts = splitByScript(child.value ?? '', kind, lang)
      if (parts.length === 1 && !parts[0].lang) {
        next.push(child)
        continue
      }
      for (const part of parts) {
        next.push(part.lang ? element('span', { lang: part.lang }, [{ type: 'text', value: part.text }]) : { type: 'text', value: part.text })
      }
      continue
    }
    if (isElement(child)) {
      const skip =
        SKIP_TAGS.has(child.tagName) ||
        hasExplicitLang(child) ||
        // rehype-pretty-code's wrapper around a code block.
        child.properties['data-rehype-pretty-code-figure'] !== undefined ||
        classList(child).includes('no-lang-spans')
      if (!skip) transform(child, kind, lang)
    }
    next.push(child)
  }
  parent.children = next
}

export default function rehypeLangSpans(options: LangSpansOptions = {}) {
  return (tree: HastNode) => {
    const runs = foreignRuns(options.lang)
    if (!runs) return
    transform(tree, runs.kind, runs.lang)
  }
}
