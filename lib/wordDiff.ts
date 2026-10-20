/**
 * Word-level ("intraline") diff for the admin history views (pure, unit
 * tested; client-safe).
 *
 * Text is split into words, runs of whitespace and single punctuation marks
 * with Intl.Segmenter (word granularity — the ICU dictionary also splits
 * Chinese and Japanese into words, so "上海交通大学" → "上海" "交通" "大学"),
 * or, where the browser has no Intl.Segmenter, with a Unicode-aware regex
 * that treats every Han / Kana / Hangul character as its own token. The
 * token streams are aligned with a longest-common-subsequence table after
 * trimming the common prefix and suffix, so only the changed middle costs
 * anything; inputs whose changed middle exceeds `maxTokens` per side return
 * { tooLarge: true } and the caller shows whole lines instead.
 *
 * Whitespace-only equal runs squeezed between two changes are folded into
 * the change ("foo bar" → "baz qux" reads as one replacement, not four
 * fragments), which is what makes the highlight readable.
 */

export type WordSegment = { kind: 'same' | 'add' | 'del'; text: string }

export type WordDiff =
  | { tooLarge: true }
  | {
      tooLarge: false
      segments: WordSegment[]
      /** Tokens added + removed (0 = identical). */
      changed: number
      /** Share of the longer side's tokens that stayed the same, 0…1. */
      similarity: number
    }

export const WORD_DIFF_MAX_TOKENS = 1500

const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}'
const FALLBACK_TOKEN = new RegExp(`[${CJK}]|[\\p{L}\\p{N}\\p{M}_'’-]+|\\s+|[^\\s]`, 'gu')

type SegmenterLike = { segment(input: string): Iterable<{ segment: string }> }
let segmenter: SegmenterLike | null | undefined

function wordSegmenter(): SegmenterLike | null {
  if (segmenter !== undefined) return segmenter
  try {
    const Ctor = (Intl as unknown as { Segmenter?: new (locale?: string, opts?: { granularity: 'word' }) => SegmenterLike }).Segmenter
    segmenter = Ctor ? new Ctor(undefined, { granularity: 'word' }) : null
  } catch {
    segmenter = null
  }
  return segmenter
}

/** Words, whitespace runs and punctuation marks, in order; joining them gives the input back. */
export function tokenizeWords(text: string, opts: { useSegmenter?: boolean } = {}): string[] {
  if (!text) return []
  const seg = opts.useSegmenter === false ? null : wordSegmenter()
  if (seg) {
    const out: string[] = []
    for (const s of seg.segment(text)) {
      // The segmenter returns whitespace runs as single segments already;
      // keep punctuation clusters ("--", "…") as they come.
      out.push(s.segment)
    }
    return out
  }
  return text.match(FALLBACK_TOKEN) ?? [text]
}

function push(out: WordSegment[], kind: WordSegment['kind'], text: string) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.kind === kind) last.text += text
  else out.push({ kind, text })
}

const isBlank = (s: string) => /^\s+$/.test(s)

/**
 * Readable change blocks: a whitespace-only equal run between two changes
 * joins both sides of the change around it, and every maximal run of changes
 * becomes "removed text, then inserted text".
 */
export function normalizeSegments(segments: readonly WordSegment[]): WordSegment[] {
  const out: WordSegment[] = []
  let del = ''
  let add = ''
  const flush = () => {
    push(out, 'del', del)
    push(out, 'add', add)
    del = ''
    add = ''
  }
  segments.forEach((s, i) => {
    if (s.kind === 'del') del += s.text
    else if (s.kind === 'add') add += s.text
    else {
      const inChange = (del || add) && isBlank(s.text) && segments.slice(i + 1).find((x) => x.text)?.kind !== 'same' && i < segments.length - 1
      if (inChange) {
        del += s.text
        add += s.text
        return
      }
      flush()
      push(out, 'same', s.text)
    }
  })
  flush()
  return out
}

/** Diff `before` → `after` word by word. */
export function diffWords(before: string, after: string, opts: { maxTokens?: number; useSegmenter?: boolean } = {}): WordDiff {
  const maxTokens = opts.maxTokens ?? WORD_DIFF_MAX_TOKENS
  const a = tokenizeWords(before, opts)
  const b = tokenizeWords(after, opts)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const n = endA - start
  const m = endB - start
  if (n > maxTokens || m > maxTokens) return { tooLarge: true }

  const width = m + 1
  const lcs = new Uint16Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[start + i] === b[start + j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }

  const raw: WordSegment[] = []
  push(raw, 'same', a.slice(0, start).join(''))
  let i = 0
  let j = 0
  let changed = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      push(raw, 'same', a[start + i])
      i++
      j++
    } else if (i < n && (j >= m || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
      push(raw, 'del', a[start + i])
      changed++
      i++
    } else {
      push(raw, 'add', b[start + j])
      changed++
      j++
    }
  }
  push(raw, 'same', a.slice(endA).join(''))

  const common = start + (a.length - endA) + (n ? lcs[0] : 0)
  const longer = Math.max(a.length, b.length)
  return {
    tooLarge: false,
    segments: normalizeSegments(raw),
    changed,
    similarity: longer ? common / longer : 1,
  }
}

/** The removed side of a word diff (equal + removed parts). */
export function beforeSide(segments: readonly WordSegment[]): WordSegment[] {
  const out: WordSegment[] = []
  for (const s of segments) if (s.kind !== 'add') push(out, s.kind, s.text)
  return out
}

/** The inserted side of a word diff (equal + inserted parts). */
export function afterSide(segments: readonly WordSegment[]): WordSegment[] {
  const out: WordSegment[] = []
  for (const s of segments) if (s.kind !== 'del') push(out, s.kind, s.text)
  return out
}

/** Below this share of unchanged words two lines count as different lines, not an edit of one. */
export const PAIR_MIN_SIMILARITY = 0.3

type LineLike = { kind: 'same' | 'add' | 'del'; text: string }

/**
 * Word highlights for a line diff: each run of removed lines followed by a
 * run of added lines is paired line by line, and a pair that is similar
 * enough gets the words that changed. Returns one entry per input line —
 * the segments of that line's own side, or null (show it as a whole line).
 */
export function intralineHighlights(lines: readonly LineLike[], opts: { minSimilarity?: number; maxTokens?: number } = {}): Array<WordSegment[] | null> {
  const min = opts.minSimilarity ?? PAIR_MIN_SIMILARITY
  const out: Array<WordSegment[] | null> = lines.map(() => null)
  let k = 0
  while (k < lines.length) {
    if (lines[k].kind !== 'del') {
      k++
      continue
    }
    const delStart = k
    while (k < lines.length && lines[k].kind === 'del') k++
    const addStart = k
    while (k < lines.length && lines[k].kind === 'add') k++
    const pairs = Math.min(addStart - delStart, k - addStart)
    for (let p = 0; p < pairs; p++) {
      const d = diffWords(lines[delStart + p].text, lines[addStart + p].text, { maxTokens: opts.maxTokens })
      if (d.tooLarge || d.similarity < min) continue
      out[delStart + p] = beforeSide(d.segments)
      out[addStart + p] = afterSide(d.segments)
    }
  }
  return out
}
