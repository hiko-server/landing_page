/**
 * Line layout for the PDF CV — pure, so it is unit-tested without fonts.
 *
 * Text arrives as styled runs (regular / bold, colour, optional link) and
 * leaves as lines of pieces, each set in exactly one font:
 *
 *   - Font fallback per character: the Latin face (Geist Regular /
 *     SemiBold) when it has the glyph, else the CJK face (Noto Sans SC).
 *     Bold text that falls back to the CJK face (which ships one weight) is
 *     flagged `fauxBold` and drawn with a hairline stroke. Characters no
 *     face covers are dropped and reported (`onMissing`), never drawn as
 *     tofu boxes.
 *   - Line breaking at Unicode (UAX #14) break opportunities via
 *     `linebreak`, so English wraps between words, Chinese between
 *     characters (never before "，" / "。"), URLs after "/" and "-"; a
 *     segment wider than the line is split by characters.
 *   - Trailing spaces never count towards a line's width; leading spaces of
 *     a wrapped line are dropped.
 *   - A `keep` run (a URL, a skill tag) has no break opportunities of its
 *     own: it moves to the next line as a whole, and is split by characters
 *     only when it is wider than a full line.
 */

import LineBreaker from 'linebreak'

export type FontKey = 'regular' | 'bold' | 'cjk'

export interface Measurer {
  /** Advance width of `text` set in `font` at `size` pt (with optional letter spacing). */
  width(text: string, font: FontKey, size: number, characterSpacing?: number): number
  /** Whether `font` has a glyph for the code point. */
  has(codePoint: number, font: FontKey): boolean
}

export type Run = {
  text: string
  size: number
  bold?: boolean
  color?: string
  /** Absolute URL: the run is a link. */
  link?: string
  characterSpacing?: number
  /** Keep the run on one line when it fits (no break inside a URL or a skill tag). */
  keep?: boolean
}

export type Piece = {
  text: string
  font: FontKey
  fauxBold: boolean
  size: number
  color?: string
  link?: string
  characterSpacing?: number
  width: number
}

export type Line = { pieces: Piece[]; width: number }

/** Zero-width / invisible characters that are kept with the current piece, whatever the font. */
const INVISIBLE = /[​-‍⁠︀-️]/

/** Split one run into same-font pieces (no measuring). */
export function fontPieces(run: Run, m: Pick<Measurer, 'has'>, onMissing?: (ch: string) => void): Array<Omit<Piece, 'width'>> {
  const primary: FontKey = run.bold ? 'bold' : 'regular'
  const out: Array<Omit<Piece, 'width'>> = []
  let cur: Omit<Piece, 'width'> | null = null
  for (const ch of run.text) {
    const cp = ch.codePointAt(0) as number
    let font: FontKey | null
    if (ch === ' ' || INVISIBLE.test(ch)) font = cur ? cur.font : primary
    else if (m.has(cp, primary)) font = primary
    else if (m.has(cp, 'cjk')) font = 'cjk'
    else font = null
    if (font === null) {
      if (!/\s/.test(ch)) onMissing?.(ch)
      continue
    }
    if (cur && cur.font === font) {
      cur.text += ch
    } else {
      cur = {
        text: ch,
        font,
        fauxBold: !!run.bold && font === 'cjk',
        size: run.size,
        color: run.color,
        link: run.link,
        characterSpacing: run.characterSpacing,
      }
      out.push(cur)
    }
  }
  return out
}

function measure(p: Omit<Piece, 'width'>, m: Measurer): Piece {
  return { ...p, width: m.width(p.text, p.font, p.size, p.characterSpacing) }
}

const sameStyle = (a: Piece, b: Piece) =>
  a.font === b.font && a.fauxBold === b.fauxBold && a.size === b.size && a.color === b.color && a.link === b.link && a.characterSpacing === b.characterSpacing

function trimLine(pieces: Piece[], m: Measurer): Line {
  const out = pieces.map((p) => ({ ...p }))
  // Drop leading spaces of the first piece and trailing spaces of the last.
  while (out.length && !out[0].text.replace(/^\s+/, '')) out.shift()
  while (out.length && !out[out.length - 1].text.replace(/\s+$/, '')) out.pop()
  if (out.length) {
    const first = out[0]
    const lead = first.text.replace(/^\s+/, '')
    if (lead !== first.text) out[0] = measure({ ...first, text: lead }, m)
    const last = out[out.length - 1]
    const tail = last.text.replace(/\s+$/, '')
    if (tail !== last.text) out[out.length - 1] = measure({ ...last, text: tail }, m)
  }
  // Merge neighbours with the same style (fewer text operations).
  const merged: Piece[] = []
  for (const p of out) {
    const prev = merged[merged.length - 1]
    if (prev && sameStyle(prev, p)) merged[merged.length - 1] = { ...prev, text: prev.text + p.text, width: prev.width + p.width }
    else merged.push(p)
  }
  return { pieces: merged, width: merged.reduce((n, p) => n + p.width, 0) }
}

type Segment = { pieces: Piece[]; width: number; trailing: number; required: boolean }

/** Width of the trailing whitespace of a segment's last piece. */
function trailingWidth(pieces: Piece[], m: Measurer): number {
  const last = pieces[pieces.length - 1]
  if (!last) return 0
  const spaces = /\s+$/.exec(last.text)?.[0] || ''
  return spaces ? m.width(spaces.replace(/\n/g, ''), last.font, last.size, last.characterSpacing) : 0
}

/**
 * Lay out runs into lines no wider than `maxWidth` (pt). Newlines in the
 * text force a break. Returns at least one line when there is any visible
 * text, none otherwise.
 */
export function layoutRuns(runs: readonly Run[], maxWidth: number, m: Measurer, onMissing?: (ch: string) => void): Line[] {
  const flat = runs.map((r) => r.text).join('')
  if (!flat.trim()) return []
  // Run boundaries in the flat string.
  const bounds: Array<{ start: number; end: number; run: Run }> = []
  let at = 0
  for (const run of runs) {
    bounds.push({ start: at, end: at + run.text.length, run })
    at += run.text.length
  }
  const slice = (a: number, b: number): Piece[] => {
    const out: Piece[] = []
    for (const { start, end, run } of bounds) {
      const s = Math.max(a, start)
      const e = Math.min(b, end)
      if (s >= e) continue
      const text = flat.slice(s, e).replace(/\n/g, '')
      if (!text) continue
      for (const p of fontPieces({ ...run, text }, m, onMissing)) out.push(measure(p, m))
    }
    return out
  }

  const insideKeep = (pos: number) => bounds.some(({ start, end, run }) => run.keep && pos > start && pos < end)

  const segments: Segment[] = []
  const breaker = new LineBreaker(flat)
  let last = 0
  let bk = breaker.nextBreak()
  while (bk) {
    if (!bk.required && insideKeep(bk.position)) {
      bk = breaker.nextBreak()
      continue
    }
    const pieces = slice(last, bk.position)
    const width = pieces.reduce((n, p) => n + p.width, 0)
    segments.push({ pieces, width, trailing: trailingWidth(pieces, m), required: bk.required })
    last = bk.position
    bk = breaker.nextBreak()
  }

  const lines: Line[] = []
  let cur: Piece[] = []
  let curWidth = 0
  const flush = () => {
    const line = trimLine(cur, m)
    if (line.pieces.length) lines.push(line)
    cur = []
    curWidth = 0
  }

  for (const seg of segments) {
    if (seg.pieces.length) {
      const fits = curWidth + seg.width - seg.trailing <= maxWidth + 0.01
      if (!fits && cur.length) flush()
      if (seg.width - seg.trailing > maxWidth + 0.01) {
        // Longer than a whole line: split by characters.
        for (const piece of seg.pieces) {
          let chunk = ''
          for (const ch of piece.text) {
            const next = chunk + ch
            const w = m.width(next, piece.font, piece.size, piece.characterSpacing)
            if (curWidth + w > maxWidth + 0.01 && (chunk || cur.length)) {
              if (chunk) cur.push(measure({ ...piece, text: chunk }, m))
              flush()
              chunk = ch
            } else {
              chunk = next
            }
          }
          if (chunk) {
            const p = measure({ ...piece, text: chunk }, m)
            cur.push(p)
            curWidth += p.width
          }
        }
      } else {
        cur.push(...seg.pieces)
        curWidth += seg.width
      }
    }
    if (seg.required) flush()
  }
  if (cur.length) flush()
  return lines
}
