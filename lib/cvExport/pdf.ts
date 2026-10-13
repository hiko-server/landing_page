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
 *     fixed labels, so visibility is decided before this file runs.
 *   - Deterministic for the same input: the creation date is the CV's last
 *     save, so the bytes (and the ETag derived from the model) are stable.
 */

import fs from 'node:fs'
import path from 'node:path'
import PDFDocument, { type PDFStructureContent, type PDFStructureElement } from 'pdfkit'
import { create as createFont, type Font } from 'fontkit'
import { cvLabels } from '../cvFormat'
import { layoutRuns, type FontKey, type Line, type Measurer, type Run } from './pdfLayout'
import type { CvDocModel, ModelEntry, ModelSection } from './model'

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
}

export type PdfResult = { buffer: Buffer; pages: number; missing: string[] }

const STRINGS = {
  en: { cv: 'CV', subject: 'Curriculum vitae', skills: 'Skills' },
  zh: { cv: '简历', subject: '个人简历', skills: '技能' },
} as const

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
    const rightNatural = Math.max(0, ...right.map((runs) => this.layout(runs, 10_000)[0]?.width || 0))
    const rightW = Math.min(rightNatural, CW * 0.5)
    const leftW = rightW ? CW - rightW - 18 : CW

    const top = this.y
    if (model.name || model.nameAside) {
      const runs: Run[] = [{ text: model.name, size: SIZE.name, bold: true, color: INK }]
      if (model.nameAside) runs.push({ text: `${model.name ? '  ' : ''}${model.nameAside}`, size: SIZE.aside, color: MUTED })
      this.para(this.root, 'H1', runs, { width: leftW, size: SIZE.name, gapAfter: 1 })
    }
    const web: Run[] = []
    const items = [...(c.website ? [c.website] : []), ...c.profiles]
    items.forEach((link, i) => {
      if (i) web.push({ text: '  ·  ', size: SIZE.contact, color: SUBTLE })
      web.push({ text: link.text, size: SIZE.contact, color: link.href ? this.linkColor : BODY, link: link.href || undefined, keep: true })
    })
    if (web.length) this.para(this.root, 'P', web, { width: leftW, size: SIZE.contact })
    const leftBottom = this.y

    // Right column, top-aligned with the name.
    let ry = top + (model.name ? (this.lineHeight(SIZE.name) - this.lineHeight(SIZE.contact)) / 2 : 0)
    for (const runs of right) {
      const lines = this.layout(runs, rightW)
      if (!lines.length) continue
      const el = this.el(this.root, 'P')
      ry = this.lines(el, 'P', lines, { x: MARGIN.left + CW - rightW, width: rightW, align: 'right', size: SIZE.contact, atY: ry })
      el.end()
    }
    this.y = Math.max(leftBottom, ry) + 8
    this.rule(this.y, 1.6)
    this.y += 10

    if (model.summary) this.para(this.root, 'P', [{ text: model.summary, size: SIZE.body, color: BODY }], { size: SIZE.body, gapAfter: 10 })
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

  entry(sect: PDFStructureElement, e: ModelEntry) {
    const div = this.el(sect, 'Div')
    const meta = [e.date, e.place].filter(Boolean).join('  |  ')
    const metaLines = meta ? this.layout([{ text: meta, size: SIZE.meta, color: MUTED }], CW * 0.42) : []
    const metaW = Math.max(0, ...metaLines.map((l) => l.width))
    const titleW = metaW ? CW - metaW - 14 : CW
    const titleLines = e.title ? this.layout([{ text: e.title, size: SIZE.h3, bold: true, color: INK }], titleW) : []
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
    const keep = s.kind === 'entries' ? this.lineHeight(SIZE.h3) + this.lineHeight(SIZE.body) * 2 : this.lineHeight(SIZE.body) * 2
    this.sectionTitle(sect, s.title, keep)
    if (s.kind === 'entries') for (const e of s.entries) this.entry(sect, e)
    else if (s.kind === 'skills') this.skills(sect, s)
    else {
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
  w.footers()
  w.root.end()
  const pages = doc.bufferedPageRange().count
  doc.end()
  const buffer = await done
  return { buffer, pages, missing: Array.from(w.missing) }
}
