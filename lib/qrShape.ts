/**
 * The drawing of a lib/qr.ts QR code (its viewBox and path data), so
 * components/Common/QrSvg.tsx can render it as React elements instead of
 * writing the SVG markup with innerHTML. No HTML is ever parsed in the
 * browser: nothing reaches a DOM-XSS sink (Trusted Types, lib/csp.js), and
 * a QR string that is not the expected shape draws nothing rather than
 * whatever it contains.
 */

export type QrShape = {
  /** "0 0 25 25" */
  viewBox: string
  /** One `d` per <path> (qrcode draws the modules as one stroked path). */
  paths: string[]
}

const NUM = '\\d{1,4}(?:\\.\\d{1,4})?'
const VIEWBOX_RE = new RegExp(`^<svg\\b[^>]*\\bviewBox="(${NUM} ${NUM} ${NUM} ${NUM})"`)
// Path data of moves and horizontal / vertical lines: all qrcode emits.
const PATH_RE = /<path\b[^>]*?\sd="([MmHhVvLlZz0-9 .,-]{1,20000})"[^>]*\/?>/g

/** The QR drawing in `svg`, or null when it is not an SVG with a numeric viewBox. */
export function qrShape(svg: string | null | undefined): QrShape | null {
  if (typeof svg !== 'string') return null
  const viewBox = VIEWBOX_RE.exec(svg.trim())?.[1]
  if (!viewBox) return null
  return { viewBox, paths: Array.from(svg.matchAll(PATH_RE), (m) => m[1]) }
}
