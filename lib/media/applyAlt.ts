import type { BodyScan } from '../contentHealth/mdxScan'
import { altState, originalOfRef } from './usage'
import { markdownAlt } from './view'

export { markdownAlt }

/**
 * "Use the default alt text where it is missing" (H7) — the pure part,
 * unit-tested; lib/media/applyAltServer writes the documents.
 *
 * In a body, an image of the upload whose alt text is missing or is a file
 * name gets the default: `![](/uploads/a.png)` → `![A desk](/uploads/a.png)`,
 * `<img src="/uploads/a.png" />` → `<img alt="A desk" src="/uploads/a.png" />`.
 * A JSX image with alt="" is decorative on purpose and is left alone, so is
 * code (the parser never reports images inside it). A cover gets the
 * default as its `coverAlt` when that is empty or a file name.
 */

const MD_ALT_RE = /^!\[([^\]]*)\]/

/** A JSX attribute for `alt` (null when the text holds both quote kinds — left for the owner). */
export function jsxAltAttribute(alt: string): string | null {
  const a = alt.replace(/\s+/g, ' ').trim()
  if (!a.includes('"')) return `alt="${a}"`
  if (!a.includes("'")) return `alt='${a}'`
  return null
}

const ALT_ATTR_RE = /\balt=(?:"[^"]*"|'[^']*')/

/**
 * Fill the alt text of every image of `name` in `body` that has none (or a
 * file name). `scan` is the body's scan (lib/contentHealth/mdxScan). Returns
 * the new body and how many images changed.
 */
export function fillBodyAlt(body: string, scan: BodyScan, name: string, alt: string): { body: string; changed: number } {
  if (!scan.ok || !alt.trim()) return { body, changed: 0 }
  const edits: Array<{ start: number; end: number; text: string }> = []
  for (const img of scan.images) {
    const m = /\/uploads\/([A-Za-z0-9._%-]+)/.exec(img.url)
    if (!m || originalOfRef(m[1]) !== name) continue
    const state = altState(img.alt, img.jsx)
    if (state !== 'missing' && state !== 'meaningless') continue
    const [start, end] = img.span
    const source = body.slice(start, end)
    if (!img.jsx) {
      if (!MD_ALT_RE.test(source)) continue
      edits.push({ start, end, text: source.replace(MD_ALT_RE, `![${markdownAlt(alt)}]`) })
      continue
    }
    const attribute = jsxAltAttribute(alt)
    if (!attribute) continue
    if (img.alt === null) {
      const tag = /^<([A-Za-z][\w.]*)/.exec(source)
      if (!tag) continue
      edits.push({ start, end, text: `${source.slice(0, tag[0].length)} ${attribute}${source.slice(tag[0].length)}` })
    } else if (ALT_ATTR_RE.test(source)) {
      edits.push({ start, end, text: source.replace(ALT_ATTR_RE, attribute) })
    }
  }
  if (!edits.length) return { body, changed: 0 }
  let out = body
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return { body: out, changed: edits.length }
}

/** The frontmatter with a cover of `name` given the default alt when it has none (or a file name). */
export function fillCoverAlt(frontmatter: Record<string, unknown>, name: string, alt: string): { frontmatter: Record<string, unknown>; changed: number } {
  const cover = typeof frontmatter.cover === 'string' ? frontmatter.cover : ''
  const m = /\/uploads\/([A-Za-z0-9._%-]+)/.exec(cover)
  if (!m || originalOfRef(m[1]) !== name || !alt.trim()) return { frontmatter, changed: 0 }
  const state = altState(typeof frontmatter.coverAlt === 'string' ? frontmatter.coverAlt : '')
  if (state !== 'missing' && state !== 'meaningless') return { frontmatter, changed: 0 }
  return { frontmatter: { ...frontmatter, coverAlt: alt.replace(/\s+/g, ' ').trim() }, changed: 1 }
}

/** Which default fits a document's language: English, Chinese, or none (another language). */
export function altForLang(lang: string, meta: { alt: string; altZh: string }): string {
  if (/^zh/i.test(lang)) return meta.altZh
  if (/^en/i.test(lang)) return meta.alt
  return ''
}
