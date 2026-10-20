/**
 * The downloadable A4 PDF CV, rendered on the server with pdfkit — no
 * headless browser. SERVER-ONLY (filesystem fonts).
 *
 *   - Real, selectable text in one reading order (header, then each
 *     section top to bottom); right-aligned dates sit on their entry's first
 *     line. Every font is embedded as a subset: Geist Regular / SemiBold for
 *     Latin text, Noto Sans SC for everything Geist lacks (lib/cvExport/
 *     pdfLayout picks the face per character), both under the OFL.
 *   - Tagged PDF 1.7: Document > H1 (name), P (contacts, with Link
 *     children), Sect > H2 / Div > H3, P, L > LI > Lbl + LBody; links are
 *     Link elements with their annotations attached; rules and the page
 *     footer are marked as artifacts. /Lang, a displayed title and the
 *     metadata (author, subject, keywords, dates) are set.
 *   - Draws ONLY the strings of the document model (lib/cvExport/model) plus
 *     fixed labels, so visibility is decided before this file runs. The
 *     header carries the availability lines (求职意向, right to work); the
 *     self-assessment prints as a statement with points and the
 *     recommendations as quotes with their credit (BlockQuote + P).
 *   - Publications print in citation style, like the A4 sheet: the title
 *     with its date, the authors (the owner in bold, a hidden co-author as
 *     "…"), the venue (slanted) with volume(issue), pages and publisher, the
 *     status of anything not yet published, the award, then the DOI as its
 *     https://doi.org/ link and the PDF / code / slides / paper links.
 *   - The optional photo (lib/cvExport/photo — only when the owner switched
 *     it on for this language's PDF) sits at the top right of the header as
 *     a tagged Figure with alternative text.
 *   - Deterministic for the same input: the creation date is the CV's last
 *     save, so the bytes (and the ETag derived from the model) are stable.
 */

import fs from 'node:fs'
import path from 'node:path'
import PDFDocument, { type PDFStructureContent, type PDFStructureElement } from 'pdfkit'
import { create as createFont, type Font } from 'fontkit'
import { cvLabels } from '../cvFormat'
import { layoutRuns, type FontKey, type Line, type Measurer, type Run } from './pdfLayout'
import type { CvDocModel, ModelEntry, ModelPublication, ModelQuote, ModelSection } from './model'
import type { PdfPhoto } from './photo'

/** Font files, relative to the app root (next.config.js traces them into the standalone build). */
export const PDF_FONT_FILES: Record<FontKey, string> = {
  regular: 'assets/og/Geist-Regular.ttf',
  bold: 'assets/og/Geist-SemiBold.ttf',
  cjk: 'assets/pdf/NotoSansSC-Regular.subset.ttf',
}

export type PdfFonts = Record<FontKey, Font>

let fontCache: PdfFonts | null = null

/** Parse the three faces once per process (lazily; ~8 MB, glyphs load on demand). */
export function loadPdfFonts(root: string = process.cwd()): PdfFonts {
  if (!fontCache) {
    const read = (key: FontKey) => createFont(new Uint8Array(fs.readFileSync(path.join(root, PDF_FONT_FILES[key]))))
    fontCache = { regular: read('regular'), bold: read('bold'), cjk: read('cjk') }
  }
  return fontCache
}

// ── Geometry & type scale (points; A4 = 595.28 × 841.89) ─────────────────

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = { left: 50, right: 50, top: 48, bottom: 58 }
const CW = PAGE_W - MARGIN.left - MARGIN.right
const BOTTOM = PAGE_H - MARGIN.bottom

const SIZE = { name: 20, aside: 11, contact: 8.8, h2: 9.6, h3: 10.2, body: 9.2, meta: 8.8, small: 8.4, footer: 7.4 }

/** Slant of a synthetic italic (degrees): the faces ship upright only. */
const ITALIC_SLANT = 11

const INK = '#111111'
const BODY = '#222222'
const MUTED = '#555555'
const SUBTLE = '#6e6e6e'
const DEFAULT_ACCENT = '#1d4ed8'

/** '#rrggbb' from '#rgb' / '#rrggbb'; null for anything else. */
export function normalizeHex(color: unknown): string | null {
  if (typeof color !== 'string') return null
  const c = color.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(c)) return c
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`
  return null
}

/** WCAG contrast ratio of a '#rrggbb' colour against white. */
export function contrastOnWhite(hex: string): number {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5)
  return 1.05 / (l + 0.05)
}

export type PdfRenderOptions = {
  fonts: PdfFonts
  /** The CV's accent / rule colour (Personal Info separatorColor). */
  accent?: string
  /** Last save of the CV (epoch ms): the PDF's creation / modification date. */
  updatedAt?: number | null
  /** Called with every string drawn (tests). */
  onText?: (text: string) => void
  /** The photo the owner switched on for this language's PDF (lib/cvExport/photo); null / absent = none. */
  photo?: PdfPhoto | null
}

export type PdfResult = {
  buffer: Buffer
  pages: number
  missing: string[]
  /** How much of the last page the content fills (0–1): how far over a page target a CV variant is (E4). */
  lastPageFill: number
}

const STRINGS = {
  en: { cv: 'CV', subject: 'Curriculum vitae', skills: 'Skills', photo: (name: string) => (name ? `Photo of ${name}` : 'Photo') },
  zh: { cv: '简历', subject: '个人简历', skills: '技能', photo: (name: string) => (name ? `${name}的照片` : '照片') },
} as const

/** Printed size of the header photo (points): a passport-style 2.5 × 3.5 cm box at most. */
const PHOTO_BOX = { w: 70, h: 92 }

/** Draw size of a photo inside PHOTO_BOX, keeping its aspect ratio. */
export function photoDrawSize(photo: Pick<PdfPhoto, 'width' | 'height'>): { w: number; h: number } {
  const ratio = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : PHOTO_BOX.w / PHOTO_BOX.h
  let h = PHOTO_BOX.h
  let w = h * ratio
  if (w > PHOTO_BOX.w) {
    w = PHOTO_BOX.w
    h = w / ratio
  }
  return { w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 }
}

class Writer {
  readonly doc: PDFDocument
  readonly m: Measurer
  readonly root: PDFStructureElement
  readonly missing = new Set<string>()
  readonly lead: number
  readonly accent: string
  readonly linkColor: string
  readonly model: CvDocModel
  readonly opts: PdfRenderOptions
  y = MARGIN.top

  constructor(doc: PDFDocument, fonts: PdfFonts, model: CvDocModel, opts: PdfRenderOptions) {
    this.doc = doc
    this.model = model
    this.opts = opts
    for (const key of ['regular', 'bold', 'cjk'] as const) doc.registerFont(key, fonts[key])
    const widths = new Map<string, number>()
    this.m = {
      has: (cp, font) => fonts[font].hasGlyphForCodePoint(cp),
      width: (text, font, size, characterSpacing = 0) => {
        const key = `${font}|${size}|${characterSpacing}|${text}`
        let w = widths.get(key)
        if (w === undefined) {
          w = doc.font(font).fontSize(size).widthOfString(text, characterSpacing ? { characterSpacing } : undefined)
          widths.set(key, w)
        }
        return w
      },
    }
    this.lead = model.lang === 'zh' ? 1.55 : 1.4
    this.accent = normalizeHex(opts.accent) || DEFAULT_ACCENT
    this.linkColor = contrastOnWhite(this.accent) >= 4.5 ? this.accent : INK
    this.root = doc.struct('Document')
    doc.addStructure(this.root)
  }

  lineHeight(size: number) {
    return size * this.lead
  }

  layout(runs: Run[], width: number): Line[] {
    return layoutRuns(
      runs.filter((r) => r.text),
      width,
      this.m,
      (ch) => this.missing.add(ch),
    )
  }

  newPage() {
    this.doc.addPage()
    this.y = MARGIN.top
  }

  /** Start a new page unless `height` more points fit on this one. */
  ensure(height: number) {
    if (this.y + height > BOTTOM && this.y > MARGIN.top) this.newPage()
  }

  el(parent: PDFStructureElement, type: string): PDFStructureElement {
    const e = this.doc.struct(type)
    parent.add(e)
    return e
  }

  private drawPiece(p: Line['pieces'][number], x: number, baseline: number) {
    const doc = this.doc
    doc.font(p.font).fontSize(p.size).fillColor(p.color || BODY)
    if (p.fauxBold) doc.lineWidth(p.size * 0.035).strokeColor(p.color || BODY)
    doc.text(p.text, x, baseline, {
      lineBreak: false,
      baseline: 'alphabetic',
      ...(p.characterSpacing ? { characterSpacing: p.characterSpacing } : null),
      ...(p.fauxBold ? { fill: true, stroke: true } : null),
      ...(p.italic ? { oblique: ITALIC_SLANT } : null),
    })
    this.opts.onText?.(p.text)
  }

  /**
   * Draw laid-out lines as marked content of `el` (tag `type`). Pieces that
   * carry a link become Link elements (with their annotation); a page break
   * inside the block closes the marked content and reopens it on the next
   * page. With `atY`, drawing starts there and `this.y` is left untouched.
   */
  lines(el: PDFStructureElement, type: string, lines: Line[], o: { x?: number; width?: number; align?: 'left' | 'right'; size: number; atY?: number }) {
    const doc = this.doc
    const x = o.x ?? MARGIN.left
    const width = o.width ?? CW
    const lh = this.lineHeight(o.size)
    let y = o.atY ?? this.y
    let content: PDFStructureContent | null = null
    let linkEl: PDFStructureElement | null = null
    let linkHref = ''
    const close = () => {
      if (content) {
        doc.endMarkedContent()
        content = null
      }
    }
    for (const line of lines) {
      if (y + lh > BOTTOM && o.atY === undefined) {
        close()
        this.newPage()
        y = this.y
      }
      const baseline = y + lh / 2 + o.size * 0.32
      let cx = o.align === 'right' ? x + width - line.width : x
      for (const p of line.pieces) {
        const href = p.link || ''
        if (href !== linkHref || !content) {
          close()
          if (href !== linkHref) {
            linkEl?.end()
            linkEl = href ? this.el(el, 'Link') : null
            linkHref = href
          }
          const target = linkEl || el
          content = doc.markStructureContent(linkEl ? 'Link' : type)
          target.add(content)
        }
        this.drawPiece(p, cx, baseline)
        if (href && linkEl) {
          // Underline (inside the link's own marked content) and the annotation.
          doc.save().lineWidth(0.5).strokeColor(p.color || this.linkColor)
          doc.moveTo(cx, baseline + 1.6).lineTo(cx + p.width, baseline + 1.6).stroke()
          doc.restore()
          doc.link(cx, y, p.width, lh, href, { structParent: linkEl, Contents: new String(href) })
        }
        cx += p.width
      }
      y += lh
    }
    close()
    linkEl?.end()
    if (o.atY === undefined) this.y = y
    return y
  }

  /** A paragraph element of laid-out runs. */
  para(parent: PDFStructureElement, type: string, runs: Run[], o: { x?: number; width?: number; size: number; align?: 'left' | 'right'; gapAfter?: number }) {
    const lines = this.layout(runs, o.width ?? CW)
    if (!lines.length) return
    const el = this.el(parent, type)
    this.lines(el, type, lines, o)
    el.end()
    this.y += o.gapAfter ?? 0
  }

  rule(y: number, width = 1.1, color = this.accent) {
    const doc = this.doc
    doc.markContent('Artifact', { type: 'Layout' })
    doc.save().lineWidth(width).strokeColor(color).moveTo(MARGIN.left, y).lineTo(MARGIN.left + CW, y).stroke().restore()
    doc.endMarkedContent()
  }

  // ── Blocks ─────────────────────────────────────────────────────────────

  header() {
    const { model } = this
    const L = cvLabels(model.lang)
    const c = model.contacts
    const sep = model.lang === 'zh' ? '：' : ': '

    // Right column: location, then phone | email (each a paragraph, right-aligned).
    const right: Run[][] = []
    if (c.location) right.push([{ text: c.location, size: SIZE.contact, color: BODY }])
    const reach: Run[] = []
    if (c.phone) reach.push({ text: `${L.phone}${sep}`, size: SIZE.contact, color: MUTED }, { text: c.phone, size: SIZE.contact, color: BODY, link: `tel:${c.phone.replace(/[^\d+]/g, '')}`, keep: true })
    if (c.phone && c.email) reach.push({ text: '  |  ', size: SIZE.contact, color: SUBTLE })
    if (c.email) reach.push({ text: `${L.email}${sep}`, size: SIZE.contact, color: MUTED }, { text: c.email, size: SIZE.contact, color: BODY, link: `mailto:${c.email}`, keep: true })
    if (reach.length) right.push(reach)
    const photo = this.opts.photo || null
    const photoSize = photo ? photoDrawSize(photo) : null
    const photoSpace = photoSize ? photoSize.w + 14 : 0
    const rightNatural = Math.max(0, ...right.map((runs) => this.layout(runs, 10_000)[0]?.width || 0))
    const rightW = Math.min(rightNatural, (CW - photoSpace) * 0.5)
    const leftW = CW - photoSpace - (rightW ? rightW + 18 : 0)

    const top = this.y
    if (model.name || model.nameAside) {
      const runs: Run[] = [{ text: model.name, size: SIZE.name, bold: true, color: INK }]
      if (model.nameAside) runs.push({ text: `${model.name ? '  ' : ''}${model.nameAside}`, size: SIZE.aside, color: MUTED })
      this.para(this.root, 'H1', runs, { width: leftW, size: SIZE.name, gapAfter: 1 })
    }
    const web: Run[] = []
    const items = [...(c.website ? [c.website] : []), ...c.profiles.filter((p) => p.kind !== 'orcid')]
    items.forEach((link, i) => {
      if (i) web.push({ text: '  ·  ', size: SIZE.contact, color: SUBTLE })
      web.push({ text: link.text, size: SIZE.contact, color: link.href ? this.linkColor : BODY, link: link.href || undefined, keep: true })
    })
    if (web.length) this.para(this.root, 'P', web, { width: leftW, size: SIZE.contact })
    // The ORCID iD as a labelled text link ("ORCID: https://orcid.org/…") — no vector logo in the PDF.
    for (const p of c.profiles) {
      if (p.kind !== 'orcid') continue
      this.para(
        this.root,
        'P',
        [
          { text: `${p.label}${sep}`, size: SIZE.contact, color: MUTED },
          { text: p.href, size: SIZE.contact, color: this.linkColor, link: p.href, keep: true },
        ],
        { width: leftW, size: SIZE.contact },
      )
    }
    // The availability lines: right to work, and 求职意向 on the Chinese CV.
    const lineSep = model.lang === 'zh' ? '：' : ': '
    model.headerLines.forEach((line, i) => {
      this.para(
        this.root,
        'P',
        [
          { text: `${line.label}${lineSep}`, size: SIZE.contact, color: MUTED, bold: true },
          { text: line.value, size: SIZE.contact, color: BODY },
        ],
        { width: leftW, size: SIZE.contact, gapAfter: i === model.headerLines.length - 1 ? 0 : 0.5 },
      )
    })
    const leftBottom = this.y

    // Right column, top-aligned with the name.
    let ry = top + (model.name ? (this.lineHeight(SIZE.name) - this.lineHeight(SIZE.contact)) / 2 : 0)
    for (const runs of right) {
      const lines = this.layout(runs, rightW)
      if (!lines.length) continue
      const el = this.el(this.root, 'P')
      ry = this.lines(el, 'P', lines, { x: MARGIN.left + CW - photoSpace - rightW, width: rightW, align: 'right', size: SIZE.contact, atY: ry })
      el.end()
    }
    let photoBottom = 0
    if (photo && photoSize) {
      photoBottom = top + photoSize.h
      this.figure(photo, MARGIN.left + CW - photoSize.w, top, photoSize)
    }
    this.y = Math.max(leftBottom, ry, photoBottom) + 8
    this.rule(this.y, 1.6)
    this.y += 10

    if (model.summary) this.para(this.root, 'P', [{ text: model.summary, size: SIZE.body, color: BODY }], { size: SIZE.body, gapAfter: 10 })
  }

  /** The header photo as a tagged Figure (alternative text: whose photo it is), with a hairline frame. */
  figure(photo: PdfPhoto, x: number, y: number, size: { w: number; h: number }) {
    const doc = this.doc
    const who = this.model.name || this.model.nameAside
    const fig = doc.struct('Figure', { alt: STRINGS[this.model.lang].photo(who) })
    this.root.add(fig)
    const content = doc.markStructureContent('Figure')
    fig.add(content)
    doc.image(photo.jpeg, x, y, { width: size.w, height: size.h })
    doc.endMarkedContent()
    fig.end()
    doc.markContent('Artifact', { type: 'Layout' })
    doc.save().lineWidth(0.5).strokeColor('#d4d4d4').rect(x, y, size.w, size.h).stroke().restore()
    doc.endMarkedContent()
  }

  sectionTitle(sect: PDFStructureElement, title: string, keep: number) {
    this.ensure(this.lineHeight(SIZE.h2) + 8 + keep)
    this.para(sect, 'H2', [{ text: title.toUpperCase(), size: SIZE.h2, bold: true, color: INK, characterSpacing: 0.6 }], { size: SIZE.h2 })
    this.rule(this.y + 1, 1.1)
    this.y += 7
  }

  bulletList(parent: PDFStructureElement, items: Array<{ text: string; sub: string[] }>, indent = 0) {
    if (!items.length) return
    const list = this.el(parent, 'L')
    const lh = this.lineHeight(SIZE.body)
    for (const item of items) {
      const li = this.el(list, 'LI')
      if (item.text) {
        const lines = this.layout([{ text: item.text, size: SIZE.body, color: BODY }], CW - indent - 11)
        if (this.y + lh > BOTTOM) this.newPage()
        const lbl = this.el(li, 'Lbl')
        this.lines(lbl, 'Lbl', this.layout([{ text: indent ? '–' : '•', size: SIZE.body, color: indent ? SUBTLE : this.accentOrMuted() }], 12), {
          x: MARGIN.left + indent + 1,
          size: SIZE.body,
          atY: this.y,
        })
        lbl.end()
        const body = this.el(li, 'LBody')
        this.lines(body, 'LBody', lines, { x: MARGIN.left + indent + 11, width: CW - indent - 11, size: SIZE.body })
        if (item.sub.length) this.bulletList(body, item.sub.map((text) => ({ text, sub: [] })), indent + 12)
        body.end()
      } else if (item.sub.length) {
        const body = this.el(li, 'LBody')
        this.bulletList(body, item.sub.map((text) => ({ text, sub: [] })), indent + 12)
        body.end()
      }
      li.end()
    }
    list.end()
    this.y += 1
  }

  private accentOrMuted() {
    return contrastOnWhite(this.accent) >= 3 ? this.accent : MUTED
  }

  /** An entry's first lines: the title (H3) with the date / place right-aligned on its first line. */
  entryHead(div: PDFStructureElement, title: string, meta: string) {
    const metaLines = meta ? this.layout([{ text: meta, size: SIZE.meta, color: MUTED }], CW * 0.42) : []
    const metaW = Math.max(0, ...metaLines.map((l) => l.width))
    const titleW = metaW ? CW - metaW - 14 : CW
    const titleLines = title ? this.layout([{ text: title, size: SIZE.h3, bold: true, color: INK }], titleW) : []
    const headH = Math.max(titleLines.length * this.lineHeight(SIZE.h3), metaLines.length * this.lineHeight(SIZE.meta))
    this.ensure(headH + this.lineHeight(SIZE.body) * 2)

    const top = this.y
    if (titleLines.length) {
      const h3 = this.el(div, 'H3')
      this.lines(h3, 'H3', titleLines, { width: titleW, size: SIZE.h3 })
      h3.end()
    }
    if (metaLines.length) {
      const p = this.el(div, 'P')
      const offset = titleLines.length ? (this.lineHeight(SIZE.h3) - this.lineHeight(SIZE.meta)) / 2 : 0
      const end = this.lines(p, 'P', metaLines, { x: MARGIN.left + CW - metaW, width: metaW, align: 'right', size: SIZE.meta, atY: top + offset })
      p.end()
      this.y = Math.max(this.y, end)
    }
  }

  entry(sect: PDFStructureElement, e: ModelEntry) {
    const div = this.el(sect, 'Div')
    this.entryHead(div, e.title, [e.date, e.place].filter(Boolean).join('  |  '))
    if (e.subtitle) {
      this.para(div, 'P', [{ text: e.subtitle, size: SIZE.body, color: BODY, link: e.subtitleHref || undefined }], { size: SIZE.body })
    }
    if (e.note) this.para(div, 'P', [{ text: e.note, size: SIZE.body, color: MUTED }], { size: SIZE.body })
    if (e.text) this.para(div, 'P', [{ text: e.text, size: SIZE.body, color: BODY }], { size: SIZE.body, gapAfter: 1 })
    this.bulletList(div, e.bullets)
    if (e.tags.length) {
      const L = STRINGS[this.model.lang]
      const sep = this.model.lang === 'zh' ? '：' : ': '
      const runs: Run[] = [{ text: `${L.skills}${sep}`, size: SIZE.small, color: MUTED, bold: true }]
      e.tags.forEach((tag, i) => {
        if (i) runs.push({ text: '  ·  ', size: SIZE.small, color: MUTED })
        runs.push({ text: tag, size: SIZE.small, color: MUTED, keep: true })
      })
      this.para(div, 'P', runs, { size: SIZE.small })
    }
    if (e.links.length) {
      const runs: Run[] = []
      const sep = this.model.lang === 'zh' ? '：' : ': '
      e.links.forEach((l, i) => {
        if (i) runs.push({ text: '     ', size: SIZE.small, color: MUTED })
        runs.push({ text: `${l.label}${sep}`, size: SIZE.small, color: MUTED }, { text: l.text, size: SIZE.small, color: this.linkColor, link: l.href, keep: true })
      })
      this.para(div, 'P', runs, { size: SIZE.small })
    }
    div.end()
    this.y += 7
  }

  /**
   * A paper in citation style: title + date, authors (the owner in bold),
   * venue line, status / award, links (the DOI first, printed as its URL).
   */
  publication(sect: PDFStructureElement, p: ModelPublication) {
    const zh = this.model.lang === 'zh'
    const div = this.el(sect, 'Div')
    this.entryHead(div, p.title, p.date)
    if (p.authors.length) {
      const runs: Run[] = []
      p.authors.forEach((a, i) => {
        if (i) runs.push({ text: ', ', size: SIZE.body, color: BODY })
        if (a.hidden) runs.push({ text: a.name, size: SIZE.body, color: SUBTLE })
        else runs.push({ text: a.name, size: SIZE.body, bold: a.self, color: a.self ? INK : BODY })
      })
      this.para(div, 'P', runs, { size: SIZE.body })
    }
    // "Venue, 12(3), 45–67. Publisher" — as the A4 sheet writes it.
    const tail = [p.details, p.publisher].filter(Boolean).join('. ')
    if (p.venue || tail) {
      const runs: Run[] = []
      if (p.venue) runs.push({ text: p.venue, size: SIZE.body, color: INK, italic: true })
      if (p.venue && tail) runs.push({ text: p.details ? ', ' : '. ', size: SIZE.body, color: BODY })
      if (tail) runs.push({ text: tail, size: SIZE.body, color: BODY })
      this.para(div, 'P', runs, { size: SIZE.body })
    }
    if (p.status || p.award) {
      const runs: Run[] = []
      // Small bold text: the accent only when it reads at 4.5:1 (else ink), like the links.
      if (p.status) runs.push({ text: zh ? p.status : p.status.toUpperCase(), size: SIZE.small, bold: true, color: this.linkColor, ...(zh ? null : { characterSpacing: 0.5 }) })
      if (p.status && p.award) runs.push({ text: '   ', size: SIZE.small, color: MUTED })
      if (p.award) runs.push({ text: p.award, size: SIZE.small, color: BODY, italic: true })
      this.para(div, 'P', runs, { size: SIZE.small })
    }
    if (p.links.length) {
      const runs: Run[] = []
      const sep = zh ? '：' : ': '
      p.links.forEach((l, i) => {
        if (i) runs.push({ text: '     ', size: SIZE.small, color: MUTED })
        // The DOI reads as its resolver URL (APA 7); the others carry their label.
        if (l.key !== 'doi') runs.push({ text: `${l.label}${sep}`, size: SIZE.small, color: MUTED })
        runs.push({ text: l.text, size: SIZE.small, color: this.linkColor, link: l.href, keep: true })
      })
      this.para(div, 'P', runs, { size: SIZE.small })
    }
    div.end()
    this.y += 7
  }

  /** A recommendation: the quote (BlockQuote) beside an accent bar, then "— name, credit" (the name links its source). */
  quote(sect: PDFStructureElement, q: ModelQuote) {
    const doc = this.doc
    const zh = this.model.lang === 'zh'
    const indent = 12
    const div = this.el(sect, 'Div')
    const lines = this.layout([{ text: zh ? `「${q.quote}」` : `“${q.quote}”`, size: SIZE.body, color: BODY }], CW - indent)
    const lh = this.lineHeight(SIZE.body)
    this.ensure(Math.min(lines.length, 3) * lh + this.lineHeight(SIZE.small))
    const page = doc.bufferedPageRange().count
    const top = this.y
    const bq = this.el(div, 'BlockQuote')
    this.lines(bq, 'BlockQuote', lines, { x: MARGIN.left + indent, width: CW - indent, size: SIZE.body })
    bq.end()
    if (doc.bufferedPageRange().count === page) {
      doc.markContent('Artifact', { type: 'Layout' })
      doc.save().lineWidth(1.6).strokeColor(this.accentOrMuted()).moveTo(MARGIN.left + 3, top + 2).lineTo(MARGIN.left + 3, this.y - 2).stroke().restore()
      doc.endMarkedContent()
    }
    const credit: Run[] = [
      { text: '— ', size: SIZE.small, color: MUTED },
      { text: q.name, size: SIZE.small, bold: true, color: q.href ? this.linkColor : INK, link: q.href || undefined },
    ]
    if (q.credit) credit.push({ text: `, ${q.credit}`, size: SIZE.small, color: MUTED })
    this.para(div, 'P', credit, { x: MARGIN.left + indent, width: CW - indent, size: SIZE.small })
    div.end()
    this.y += 7
  }

  skills(sect: PDFStructureElement, s: Extract<ModelSection, { kind: 'skills' }>) {
    const sep = this.model.lang === 'zh' ? '：' : ': '
    if (s.core.length) {
      const nameW = Math.min(CW * 0.3, Math.max(...s.core.map((c) => this.layout([{ text: c.name, size: SIZE.body, bold: true }], 10_000)[0]?.width || 0)) + 14)
      const list = this.el(sect, 'L')
      for (const c of s.core) {
        const nameLines = this.layout([{ text: c.name, size: SIZE.body, bold: true, color: INK }], nameW - 8)
        const levelLines = this.layout([{ text: c.level, size: SIZE.body, color: BODY }], CW - nameW)
        const h = Math.max(nameLines.length, levelLines.length) * this.lineHeight(SIZE.body)
        this.ensure(h)
        const li = this.el(list, 'LI')
        const top = this.y
        let end = top
        if (nameLines.length) {
          const lbl = this.el(li, 'Lbl')
          end = this.lines(lbl, 'Lbl', nameLines, { width: nameW - 8, size: SIZE.body, atY: top })
          lbl.end()
        }
        if (levelLines.length) {
          const body = this.el(li, 'LBody')
          end = Math.max(end, this.lines(body, 'LBody', levelLines, { x: MARGIN.left + nameW, width: CW - nameW, size: SIZE.body, atY: top }))
          body.end()
        }
        li.end()
        this.y = end + 0.5
      }
      list.end()
      this.y += 4
    }
    for (const g of s.groups) {
      const runs: Run[] = []
      if (g.name) runs.push({ text: g.items.length ? `${g.name}${sep}` : g.name, size: SIZE.body, bold: true, color: INK })
      if (g.items.length) runs.push({ text: g.items.join(', '), size: SIZE.body, color: BODY })
      this.ensure(this.lineHeight(SIZE.body))
      this.para(sect, 'P', runs, { size: SIZE.body, gapAfter: 2 })
    }
    this.y += 5
  }

  section(s: ModelSection) {
    const sect = this.el(this.root, 'Sect')
    const keep = s.kind === 'entries' || s.kind === 'publications' ? this.lineHeight(SIZE.h3) + this.lineHeight(SIZE.body) * 2 : this.lineHeight(SIZE.body) * 2
    this.sectionTitle(sect, s.title, keep)
    if (s.kind === 'entries') for (const e of s.entries) this.entry(sect, e)
    else if (s.kind === 'publications') for (const p of s.items) this.publication(sect, p)
    else if (s.kind === 'skills') this.skills(sect, s)
    else if (s.kind === 'quotes') for (const q of s.items) this.quote(sect, q)
    else if (s.kind === 'statement') {
      if (s.text) this.para(sect, 'P', [{ text: s.text, size: SIZE.body, color: BODY }], { size: SIZE.body, gapAfter: s.items.length ? 3 : 0 })
      this.bulletList(sect, s.items.map((text) => ({ text, sub: [] })))
      this.y += 6
    } else {
      this.bulletList(sect, s.items.map((text) => ({ text, sub: [] })))
      this.y += 6
    }
    sect.end()
    this.y += 4
  }

  footers() {
    const doc = this.doc
    const range = doc.bufferedPageRange()
    const left = [this.model.name || this.model.nameAside, this.model.updatedLabel].filter(Boolean).join('  ·  ')
    const site = this.model.canonical.replace(/^https?:\/\//, '')
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      const right = range.count > 1 ? `${site}  ·  ${i - range.start + 1} / ${range.count}` : site
      const y = PAGE_H - MARGIN.bottom + 24
      doc.markContent('Artifact', { type: 'Pagination', attached: ['Bottom'] })
      const leftLine = this.layout([{ text: left, size: SIZE.footer, color: SUBTLE }], CW * 0.6)[0]
      const rightLine = this.layout([{ text: right, size: SIZE.footer, color: SUBTLE }], CW * 0.4)[0]
      let cx = MARGIN.left
      for (const p of leftLine?.pieces || []) {
        this.drawPiece(p, cx, y)
        cx += p.width
      }
      cx = MARGIN.left + CW - (rightLine?.width || 0)
      for (const p of rightLine?.pieces || []) {
        this.drawPiece(p, cx, y)
        cx += p.width
      }
      doc.endMarkedContent()
    }
  }
}

/** The PDF bytes of a CV document model. */
export async function renderCvPdf(model: CvDocModel, opts: PdfRenderOptions): Promise<PdfResult> {
  const S = STRINGS[model.lang]
  const who = model.lang === 'zh' ? model.name || model.nameAside : [model.name, model.nameAside].filter(Boolean).join(' ')
  const when = typeof opts.updatedAt === 'number' && opts.updatedAt > 0 ? new Date(opts.updatedAt) : new Date(0)
  const info: Record<string, string | Date> = {
    Title: who ? `${who} — ${S.cv}` : S.cv,
    Subject: S.subject,
    Creator: model.canonical,
    CreationDate: when,
    ModDate: when,
  }
  if (who) info.Author = who
  if (model.keywords.length) info.Keywords = model.keywords.join(', ')

  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: MARGIN,
    bufferPages: true,
    tagged: true,
    pdfVersion: '1.7',
    lang: model.lang === 'zh' ? 'zh-CN' : 'en',
    displayTitle: true,
    font: null,
    info,
  })
  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const w = new Writer(doc, opts.fonts, model, opts)
  w.header()
  for (const s of model.sections) w.section(s)
  const lastPageFill = Math.min(1, Math.max(0, (w.y - MARGIN.top) / (BOTTOM - MARGIN.top)))
  w.footers()
  w.root.end()
  const pages = doc.bufferedPageRange().count
  doc.end()
  const buffer = await done
  return { buffer, pages, missing: Array.from(w.missing), lastPageFill: Math.round(lastPageFill * 100) / 100 }
}
