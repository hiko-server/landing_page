/**
 * Where the downloadable CVs live and what they are called. Client-safe
 * (the /cv download menu uses it) and pure.
 *
 *   /cv.pdf    /cv/zh.pdf     A4 PDF (lib/cvExport/pdf.ts)
 *   /cv.txt    /cv/zh.txt     plain text for "paste your CV" forms
 *   /cv.json   /cv/zh.json    JSON Resume 1.0.0 (https://jsonresume.org/schema)
 *
 * next.config.js rewrites these paths to /api/cv/export. URLs never change;
 * the download name carries the month of the last CV save:
 * "Li-Yanpei-CV-2026-10.pdf", "Li-Yanpei-CV-zh-2026-10.pdf".
 */

import type { CvLang } from '../cvVisibility'
import { field } from '../../components/CVViewerPage/fields'
import { EXPORT_FORMATS, EXPORT_PATHS, type ExportFormat } from './paths'

export { EXPORT_FORMATS, EXPORT_PATHS, cvPdfPath, type ExportFormat } from './paths'

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
}

/** Every public export path (both languages), e.g. for the edge purge list. */
export const ALL_EXPORT_PATHS: readonly string[] = (['en', 'zh'] as const).flatMap((l) => EXPORT_FORMATS.map((f) => EXPORT_PATHS[l][f]))

export function isExportFormat(v: unknown): v is ExportFormat {
  return typeof v === 'string' && (EXPORT_FORMATS as readonly string[]).includes(v)
}

const ascii = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * File name stem: "<Last>-<First>-CV[-zh]-<YYYY-MM>" from the visible ASCII
 * name parts of the ENGLISH Personal Info section (hidden or non-Latin names
 * leave just "CV[-zh]-<YYYY-MM>"); no month when it is unknown.
 */
export function cvFileBase(enPersonal: unknown, lang: CvLang, month: string): string {
  const name = [field(enPersonal, 'lastName'), field(enPersonal, 'firstName')].map(ascii).filter(Boolean)
  const parts = [...name, 'CV', ...(lang === 'zh' ? ['zh'] : []), ...(/^\d{4}-\d{2}$/.test(month) ? [month] : [])]
  return parts.join('-')
}

export function cvFileName(base: string, format: ExportFormat): string {
  return `${base}.${format}`
}

/**
 * `Content-Disposition: inline` with the download name (RFC 6266): opening
 * /cv.pdf shows the PDF, while "Save" and the page's download links (which
 * carry the `download` attribute) use the dated name.
 */
export function inlineDisposition(filename: string): string {
  const asciiName = filename.replace(/[^A-Za-z0-9_.-]/g, '_') || 'cv'
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `inline; filename="${asciiName}"; filename*=UTF-8''${encoded}`
}
