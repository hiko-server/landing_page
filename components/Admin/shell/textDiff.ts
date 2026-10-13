/**
 * Line diff for the item history drawer (pure, unit-tested).
 *
 * Longest-common-subsequence over lines, after trimming the common prefix
 * and suffix (so the table only covers the changed middle). Inputs over
 * DIFF_MAX_LINES lines on either side are refused with { tooLarge: true }:
 * the quadratic table would be too slow in the browser.
 */

export const DIFF_MAX_LINES = 5000

export type DiffLine = {
  kind: 'same' | 'add' | 'del'
  text: string
  /** 1-based line number in the old text (same / del). */
  oldNo?: number
  /** 1-based line number in the new text (same / add). */
  newNo?: number
}

export type TextDiff =
  | { tooLarge: true }
  | { tooLarge: false; lines: DiffLine[]; added: number; removed: number }

function splitLines(s: string): string[] {
  if (!s) return []
  const lines = s.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Diff `before` → `after` line by line. */
export function diffLines(before: string, after: string, maxLines = DIFF_MAX_LINES): TextDiff {
  const a = splitLines(before)
  const b = splitLines(after)
  if (a.length > maxLines || b.length > maxLines) return { tooLarge: true }

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  // Intern lines so the inner loop compares integers.
  const ids = new Map<string, number>()
  const intern = (s: string) => {
    let id = ids.get(s)
    if (id === undefined) {
      id = ids.size
      ids.set(s, id)
    }
    return id
  }
  const ma = a.slice(start, endA).map(intern)
  const mb = b.slice(start, endB).map(intern)
  const n = ma.length
  const m = mb.length

  // lcs[i][j] = LCS length of ma[i..] and mb[j..], row-major (n+1)×(m+1).
  const width = m + 1
  const lcs = new Uint16Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        ma[i] === mb[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }

  const lines: DiffLine[] = []
  for (let k = 0; k < start; k++) lines.push({ kind: 'same', text: a[k], oldNo: k + 1, newNo: k + 1 })
  let i = 0
  let j = 0
  let added = 0
  let removed = 0
  while (i < n || j < m) {
    if (i < n && j < m && ma[i] === mb[j]) {
      lines.push({ kind: 'same', text: a[start + i], oldNo: start + i + 1, newNo: start + j + 1 })
      i++
      j++
    } else if (i < n && (j >= m || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
      // Deletions before insertions, as in a unified diff.
      lines.push({ kind: 'del', text: a[start + i], oldNo: start + i + 1 })
      removed++
      i++
    } else {
      lines.push({ kind: 'add', text: b[start + j], newNo: start + j + 1 })
      added++
      j++
    }
  }
  for (let k = 0; k < a.length - endA; k++) {
    lines.push({ kind: 'same', text: a[endA + k], oldNo: endA + k + 1, newNo: endB + k + 1 })
  }
  return { tooLarge: false, lines, added, removed }
}

export type DiffRow = { type: 'line'; line: DiffLine } | { type: 'skip'; count: number }

/** Unified-diff view: changed lines with `context` unchanged lines around them. */
export function collapseContext(lines: DiffLine[], context = 3): DiffRow[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, idx) => {
    if (l.kind === 'same') return
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep[k] = true
  })
  const rows: DiffRow[] = []
  let skipped = 0
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      if (skipped) rows.push({ type: 'skip', count: skipped })
      skipped = 0
      rows.push({ type: 'line', line: l })
    } else {
      skipped++
    }
  })
  if (skipped) rows.push({ type: 'skip', count: skipped })
  return rows
}

const FIELD_ORDER = ['title', 'description', 'date', 'updated', 'draft', 'tags', 'tech', 'role', 'period', 'status', 'featured', 'link', 'repo', 'cover', 'coverAlt']

function fieldValue(v: unknown): string {
  if (typeof v === 'string') return /[\n\r]/.test(v) ? JSON.stringify(v) : v
  return JSON.stringify(v)
}

/**
 * Canonical text of a document for diffing: one `key: value` line per
 * non-empty frontmatter field (known fields first, the rest sorted), a `---`
 * separator, then the body. Absent, empty and `false` fields are omitted so
 * an editor's "unset" and a stored "missing" compare equal.
 */
export function documentText(frontmatter: Record<string, unknown>, body: string): string {
  const keys = Object.keys(frontmatter || {}).filter((k) => {
    const v = frontmatter[k]
    return !(v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0))
  })
  keys.sort((x, y) => {
    const ix = FIELD_ORDER.indexOf(x)
    const iy = FIELD_ORDER.indexOf(y)
    if (ix !== -1 || iy !== -1) return (ix === -1 ? Infinity : ix) - (iy === -1 ? Infinity : iy)
    return x < y ? -1 : x > y ? 1 : 0
  })
  const head = keys.map((k) => `${k}: ${fieldValue(frontmatter[k])}`)
  return [...head, '---', ...(body ? [body.replace(/\s+$/, '')] : [])].join('\n')
}
