/**
 * Detects MDX constructs that the visual (TipTap) editor cannot represent.
 *
 * TipTap only models CommonMark-ish blocks. Opening a body that contains any
 * of the constructs below in the WYSIWYG tab and typing a single character
 * makes it re-serialise the whole document, silently dropping or escaping
 * them. RichEditor runs this before it lets the visual tab take over.
 *
 * Fenced code blocks and inline code spans are ignored: whatever is inside
 * them is literal text that both editors preserve.
 */

export type MdxRiskKind = 'jsx' | 'esm' | 'expression' | 'table' | 'footnote'

export type MdxRisk = {
  kind: MdxRiskKind
  label: string
  /** What the visual editor would do to it. */
  effect: string
  count: number
  /** 1-based line numbers of the first few occurrences. */
  lines: number[]
  /** First occurrence, trimmed for display. */
  sample: string
}

const META: Record<MdxRiskKind, { label: string; effect: string }> = {
  jsx: { label: 'JSX / HTML tags', effect: 'components are removed or flattened to plain text' },
  esm: { label: 'import / export lines', effect: 'turned into ordinary paragraphs' },
  expression: {
    label: '{expressions}',
    effect: 'braces are escaped, so the expression stops running',
  },
  table: { label: 'GFM tables', effect: 'tables collapse into plain paragraphs' },
  footnote: { label: 'Footnotes', effect: 'references are escaped and stop linking' },
}

const ORDER: MdxRiskKind[] = ['jsx', 'esm', 'expression', 'table', 'footnote']
const MAX_LINES = 3
const SAMPLE_LEN = 60

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/
const INLINE_CODE_RE = /(`+)[\s\S]*?\1/g
const ESM_RE = /^(import|export)\s/
// `<Tag`, `</Tag`, `<tag.member`, `<>` / `</>`. Requires the name to be
// followed by whitespace, `>` / `/>` or the end of the line, so autolinks
// such as <https://x.y> or <me@x.y> and comparisons like `a < b` don't match.
const TAG_RE = /<\/?[A-Za-z][\w.:-]*(?=\s|\/?>|$)|<\/?>/
const TAG_STRIP_RE = /<\/?[A-Za-z][^<>]*>|<\/?>/g
const FOOTNOTE_RE = /\[\^[^\]\s]+\]/
const TABLE_DELIM_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$|^\s*\|\s*:?-+:?\s*\|\s*$/

function clip(s: string): string {
  const t = s.trim()
  return t.length > SAMPLE_LEN ? `${t.slice(0, SAMPLE_LEN - 1)}…` : t
}

export function detectMdxRisks(source: string): MdxRisk[] {
  if (!source) return []
  const found = new Map<MdxRiskKind, MdxRisk>()
  const note = (kind: MdxRiskKind, lineNo: number, text: string) => {
    const hit = found.get(kind)
    if (hit) {
      hit.count += 1
      if (hit.lines.length < MAX_LINES) hit.lines.push(lineNo)
      return
    }
    found.set(kind, { kind, ...META[kind], count: 1, lines: [lineNo], sample: clip(text) })
  }

  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let fence: { char: string; len: number } | null = null
  let prevText = ''

  lines.forEach((raw, i) => {
    const lineNo = i + 1
    const fenceMatch = raw.match(FENCE_RE)
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.char &&
        fenceMatch[1].length >= fence.len &&
        !raw.slice(fenceMatch[0].length).trim()
      ) {
        fence = null
      }
      prevText = ''
      return
    }
    if (fenceMatch) {
      fence = { char: fenceMatch[1][0], len: fenceMatch[1].length }
      prevText = ''
      return
    }

    const text = raw.replace(INLINE_CODE_RE, '')
    if (ESM_RE.test(raw)) note('esm', lineNo, raw)
    if (TAG_RE.test(text)) note('jsx', lineNo, raw)
    if (text.replace(TAG_STRIP_RE, '').includes('{')) note('expression', lineNo, raw)
    if (FOOTNOTE_RE.test(text)) note('footnote', lineNo, raw)
    if (TABLE_DELIM_RE.test(text) && prevText.includes('|')) note('table', lineNo - 1, prevText)
    prevText = text
  })

  return ORDER.filter((k) => found.has(k)).map((k) => found.get(k) as MdxRisk)
}

/** "JSX / HTML tags (3), GFM tables (1)" — for compact confirmations. */
export function summarizeMdxRisks(risks: MdxRisk[]): string {
  return risks.map((r) => `${r.label} (${r.count})`).join(', ')
}
