/**
 * Minimal typings for the server-only PDF stack (lib/cvExport/pdf.ts):
 * pdfkit 0.20, fontkit 2 and linebreak 1 ship no TypeScript declarations.
 * Only the API surface the CV renderer uses is declared.
 */

declare module 'fontkit' {
  export interface Font {
    unitsPerEm: number
    ascent: number
    descent: number
    hasGlyphForCodePoint(codePoint: number): boolean
    layout(text: string): unknown
  }
  export function create(buffer: Uint8Array, postscriptName?: string): Font
}

declare module 'linebreak' {
  export interface Break {
    position: number
    required: boolean
  }
  export default class LineBreaker {
    constructor(text: string)
    nextBreak(): Break | null
  }
}

declare module 'pdfkit' {
  import type { Readable } from 'stream'

  export interface PDFStructureContent {
    readonly refs: unknown[]
  }

  export interface PDFStructureElement {
    add(child: PDFStructureElement | PDFStructureContent | (() => void)): this
    end(): void
  }

  export type StructureOptions = { title?: string; lang?: string; alt?: string; expanded?: string; actual?: string }

  export type TextOptions = {
    lineBreak?: boolean
    baseline?: 'alphabetic' | 'top' | 'bottom' | 'middle' | 'hanging' | 'ideographic'
    characterSpacing?: number
    fill?: boolean
    stroke?: boolean
    oblique?: boolean | number
  }

  export type DocumentOptions = {
    size?: string | [number, number]
    margin?: number
    margins?: { top: number; bottom: number; left: number; right: number }
    autoFirstPage?: boolean
    bufferPages?: boolean
    compress?: boolean
    tagged?: boolean
    lang?: string
    displayTitle?: boolean
    pdfVersion?: '1.3' | '1.4' | '1.5' | '1.6' | '1.7' | '1.7ext3'
    /** null: no default font is loaded (every font is registered by the caller). */
    font?: string | null
    info?: Record<string, string | Date>
  }

  export default class PDFDocument extends Readable {
    constructor(options?: DocumentOptions)
    page: { width: number; height: number }
    info: Record<string, string | Date>
    registerFont(name: string, src: unknown): this
    font(name: string): this
    fontSize(size: number): this
    fillColor(color: string, opacity?: number): this
    strokeColor(color: string, opacity?: number): this
    lineWidth(width: number): this
    moveTo(x: number, y: number): this
    lineTo(x: number, y: number): this
    stroke(color?: string): this
    save(): this
    restore(): this
    text(text: string, x?: number, y?: number, options?: TextOptions): this
    widthOfString(text: string, options?: TextOptions): number
    link(x: number, y: number, w: number, h: number, url: string, options?: Record<string, unknown>): this
    rect(x: number, y: number, w: number, h: number): this
    image(src: Buffer | string, x?: number, y?: number, options?: { width?: number; height?: number; fit?: [number, number]; align?: string; valign?: string }): this
    addPage(options?: DocumentOptions): this
    switchToPage(n: number): this
    bufferedPageRange(): { start: number; count: number }
    struct(type: string, options?: StructureOptions, children?: unknown): PDFStructureElement
    addStructure(element: PDFStructureElement): this
    markContent(tag: string, options?: Record<string, unknown> | null): this
    markStructureContent(tag: string, options?: Record<string, unknown>): PDFStructureContent
    endMarkedContent(): this
    end(): void
  }
}
