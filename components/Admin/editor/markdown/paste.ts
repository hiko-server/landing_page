import { parseVideoUrl } from '../../../../lib/videoUrl'

/**
 * How the visual editor reads pasted text (pure; unit-tested).
 *
 *   - Markdown (from a README, a code editor, a chat) becomes structure:
 *     headings, lists, quotes, code fences, tables, links, emphasis;
 *   - text that merely contains a `*` or an `_` stays text: it is read as
 *     Markdown only when it shows Markdown structure or inline syntax;
 *   - a single YouTube / Vimeo URL on an empty line becomes a video, and a
 *     single URL pasted over selected text links it.
 */

const BLOCK_LINE_RES = [
  /^#{1,6}\s+\S/, // heading
  /^\s{0,3}[-*+]\s+\S/, // bullet
  /^\s{0,3}\d{1,9}[.)]\s+\S/, // ordered item
  /^\s{0,3}>\s?/, // quote
  /^\s{0,3}(```|~~~)/, // fence
  /^\s{0,3}\|.*\|\s*$/, // table row
  /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/, // rule
  /^\s{0,3}[-*+]\s+\[[ xX]\]\s/, // task
]

const INLINE_RES = [
  /\*\*[^*\s][^*]*\*\*/, // **strong**
  /(^|[\s(])__[^_\s][^_]*__(?=$|[\s).,;:!?])/, // __strong__
  /\[[^\]\n]+\]\((?:https?:\/\/|\/|#|mailto:)[^)\s]*\)/, // [text](url)
  /!\[[^\]\n]*\]\([^)\s]+\)/, // ![alt](src)
  /`[^`\n]+`/, // `code`
  /~~[^~\s][^~]*~~/, // ~~strike~~
  /(^|[\s(])\*[^*\s][^*\n]*\*(?=$|[\s).,;:!?])/, // *emphasis*
  /(^|[\s(])_[^_\s][^_\n]*_(?=$|[\s).,;:!?])/, // _emphasis_
]

const TABLE_DELIM_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/

/** Whether pasted plain text is meant as Markdown. */
export function looksLikeMarkdown(text: string): boolean {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
  if (lines.some((l) => TABLE_DELIM_RE.test(l))) return true
  const blockHits = lines.filter((l) => BLOCK_LINE_RES.some((re) => re.test(l))).length
  if (blockHits >= 1 && (blockHits >= 2 || lines.length <= 3 || /^\s{0,3}(```|~~~|#{1,6}\s)/m.test(text))) return true
  return INLINE_RES.some((re) => re.test(text))
}

/** The pasted text when it is exactly one http(s) URL, else null. */
export function singleUrl(text: string): string | null {
  const t = String(text || '').trim()
  if (!t || /\s/.test(t) || t.length > 2048) return null
  try {
    const u = new URL(t)
    return u.protocol === 'https:' || u.protocol === 'http:' ? t : null
  } catch {
    return null
  }
}

/** The pasted text when it is exactly one YouTube / Vimeo URL, else null. */
export function singleVideoUrl(text: string): string | null {
  const url = singleUrl(text)
  return url && parseVideoUrl(url) ? url : null
}

/**
 * HTML on the clipboard that is only a code editor's colouring of plain
 * text (VS Code, JetBrains, Sublime): read the text instead.
 */
export function isCodeEditorHtml(html: string, types: readonly string[]): boolean {
  if (types.includes('vscode-editor-data')) return true
  const head = String(html || '').slice(0, 2000)
  return /white-space:\s*pre/i.test(head) && /font-family:[^;"]*(mono|menlo|consolas|courier|jetbrains)/i.test(head) && !/<(h[1-6]|ul|ol|table|blockquote|p)\b/i.test(head)
}
