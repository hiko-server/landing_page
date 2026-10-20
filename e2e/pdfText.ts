import zlib from 'node:zlib'

/**
 * The text a PDF draws, decoded the way a reader's copy / search does: the
 * content streams' TJ / Tj strings mapped through each font's ToUnicode
 * CMap. Written for the CVs lib/cvExport/pdf renders (pdfkit: Identity-H
 * Type0 fonts with 2-byte codes, uncompressed object dictionaries, Flate
 * streams) — enough to assert what a recruiter's PDF viewer finds, without
 * a PDF library. Text blocks are joined by newlines, in drawing order.
 */
export function pdfText(pdf: Buffer): string {
  return pdfTextRuns(pdf)
    .map((r) => r.text)
    .join('\n')
}

/** One drawn text block and the font it is set in (its BaseFont without the subset tag, e.g. "Geist-SemiBold"). */
export type PdfTextRun = { font: string; text: string }

/** The drawn text blocks with their fonts, in drawing order. */
export function pdfTextRuns(pdf: Buffer): PdfTextRun[] {
  const src = pdf.toString('latin1')
  const objects = new Map<number, { dict: string; stream: string | null }>()
  const objRe = /(\d+) 0 obj\s*<</g
  for (let m = objRe.exec(src); m; m = objRe.exec(src)) {
    // The dictionary, nested << >> included.
    const open = m.index + m[0].length - 2
    let depth = 0
    let i = open
    for (; i < src.length - 1; i++) {
      if (src[i] === '<' && src[i + 1] === '<') {
        depth++
        i++
      } else if (src[i] === '>' && src[i + 1] === '>') {
        depth--
        i++
        if (depth === 0) break
      }
    }
    const dict = src.slice(open + 2, i - 1)
    let stream: string | null = null
    let next = i + 1
    const head = /^\s*stream\r?\n/.exec(src.slice(next, next + 16))
    // A direct /Length (pdfkit writes no indirect ones).
    const length = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(dict)
    if (head && length && !length[2]) {
      const start = next + head[0].length
      const raw = pdf.subarray(start, start + Number(length[1]))
      try {
        stream = /\/FlateDecode/.test(dict) ? zlib.inflateSync(raw).toString('latin1') : raw.toString('latin1')
      } catch {
        stream = null
      }
      next = start + Number(length[1])
    }
    objects.set(Number(m[1]), { dict, stream })
    objRe.lastIndex = next
  }

  // Font resource name (F1, F2, …) → code → text, from each Type0 font's ToUnicode.
  const cmaps = new Map<string, Map<number, string>>()
  const baseFonts = new Map<string, string>()
  const hexText = (hex: string) => {
    let out = ''
    for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
    return out
  }
  for (const { dict } of objects.values()) {
    const fonts = /\/Font\s*<<([\s\S]*?)>>/.exec(dict)
    if (!fonts) continue
    for (const f of fonts[1].matchAll(/\/(F\d+)\s+(\d+) 0 R/g)) {
      if (cmaps.has(f[1])) continue
      const font = objects.get(Number(f[2]))
      baseFonts.set(f[1], (font && /\/BaseFont\s*\/(?:[A-Z]{6}\+)?([^\s/]+)/.exec(font.dict)?.[1]) || '')
      const ref = font && /\/ToUnicode\s+(\d+) 0 R/.exec(font.dict)
      const cmap = ref ? objects.get(Number(ref[1]))?.stream : null
      const map = new Map<number, string>()
      if (cmap) {
        for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
          for (const r of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(\[[^\]]*\]|<[0-9a-f]+>)/gi)) {
            const lo = parseInt(r[1], 16)
            const hi = parseInt(r[2], 16)
            if (r[3].startsWith('[')) {
              // A ligature maps to several code units, written with spaces: <0074 0074> = "tt".
              const dst = Array.from(r[3].matchAll(/<([0-9a-f\s]+)>/gi)).map((d) => hexText(d[1].replace(/\s+/g, '')))
              for (let c = lo; c <= hi; c++) map.set(c, dst[c - lo] ?? '')
            } else {
              const base = parseInt(r[3].slice(1, -1), 16)
              for (let c = lo; c <= hi; c++) map.set(c, String.fromCodePoint(base + (c - lo)))
            }
          }
        }
        for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
          for (const c of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f\s]+)>/gi)) map.set(parseInt(c[1], 16), hexText(c[2].replace(/\s+/g, '')))
        }
      }
      cmaps.set(f[1], map)
    }
  }

  const runs: PdfTextRun[] = []
  for (const { dict, stream } of objects.values()) {
    // Page content streams only (fonts, CMaps, images and metadata carry a type or a Length1).
    if (!stream || /\/(Subtype|Type|Length1)\b/.test(dict) || !/\bBT\b/.test(stream)) continue
    let font = ''
    for (const bt of stream.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)) {
      let text = ''
      for (const op of bt[1].matchAll(/\/(F\d+)\s+[\d.]+\s+Tf|\[((?:[^\]])*)\]\s*TJ|<([0-9a-f]*)>\s*Tj/gi)) {
        if (op[1]) {
          font = op[1]
          continue
        }
        const map = cmaps.get(font)
        const hexes = op[2] !== undefined ? Array.from(op[2].matchAll(/<([0-9a-f]*)>/gi)).map((h) => h[1]) : [op[3]]
        for (const hex of hexes) {
          for (let i = 0; i + 4 <= hex.length; i += 4) text += map?.get(parseInt(hex.slice(i, i + 4), 16)) ?? ''
        }
      }
      if (text) runs.push({ font: baseFonts.get(font) || '', text })
    }
  }
  return runs
}

/** Compare texts ignoring whitespace (a wrapped line, a piece boundary). */
export const squashSpace = (s: string) => s.replace(/\s+/g, '')
