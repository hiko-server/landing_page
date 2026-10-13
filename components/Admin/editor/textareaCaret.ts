/**
 * Helpers for the raw-MDX textarea: caret coordinates (for anchoring the
 * slash menu), the "/command" trigger before the caret, and line/column →
 * offset (for jumping to a compile error).
 */

const MIRRORED: Array<keyof CSSStyleDeclaration> = [
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
]

/** Viewport rectangle (zero width) of the caret at `position` in a textarea. */
export function textareaCaretRect(ta: HTMLTextAreaElement, position: number): DOMRect {
  const style = window.getComputedStyle(ta)
  const mirror = document.createElement('div')
  const ms = mirror.style as unknown as Record<string, string>
  for (const prop of MIRRORED) ms[prop as string] = style[prop] as string
  ms.position = 'absolute'
  ms.visibility = 'hidden'
  ms.top = '0'
  ms.left = '-9999px'
  ms.whiteSpace = 'pre-wrap'
  ms.overflowWrap = 'break-word'
  mirror.textContent = ta.value.slice(0, position)
  const marker = document.createElement('span')
  marker.textContent = ta.value.slice(position) || '.'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4
  const top = marker.offsetTop - ta.scrollTop
  const left = marker.offsetLeft - ta.scrollLeft
  document.body.removeChild(mirror)
  const box = ta.getBoundingClientRect()
  return new DOMRect(box.left + left, box.top + top, 0, lineHeight)
}

/**
 * The "/query" being typed right before the caret: a slash at the start of
 * a line or after whitespace, followed by letters/digits/-. Null otherwise.
 */
export function slashTriggerAt(value: string, caret: number): { from: number; query: string } | null {
  const before = value.slice(0, caret)
  const m = /(^|[\s])\/([\w-]{0,24})$/.exec(before)
  if (!m) return null
  const from = caret - m[2].length - 1
  return { from, query: m[2] }
}

/** Offset of 1-based `line` / `column` in `text` (clamped to the text). */
export function offsetOfLineColumn(text: string, line: number, column = 1): number {
  const lines = text.split('\n')
  const l = Math.min(Math.max(1, Math.trunc(line) || 1), lines.length)
  let offset = 0
  for (let i = 0; i < l - 1; i++) offset += lines[i].length + 1
  const c = Math.min(Math.max(1, Math.trunc(column) || 1), lines[l - 1].length + 1)
  return offset + c - 1
}

/** Index (0-based) of the last Markdown heading at or above `caret`, outside code fences; -1 when none. */
export function headingIndexAt(text: string, caret: number): number {
  const lines = text.slice(0, caret).split('\n')
  let fence: string | null = null
  let index = -1
  for (const line of lines) {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      continue
    }
    if (f) {
      fence = f[1]
      continue
    }
    if (/^ {0,3}#{1,6}\s+\S/.test(line)) index++
  }
  return index
}
