/**
 * The public URLs of the downloadable CVs (next.config.js rewrites them to
 * /api/cv/export). Pure and tiny, so site chrome (the mobile drawer) and the
 * /about rail can link the real PDFs without the rest of lib/cvExport;
 * lib/cvExport/files.ts re-exports it.
 */

import type { CvLang } from '../cvVisibility'

export const EXPORT_FORMATS = ['pdf', 'txt', 'json'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export const EXPORT_PATHS: Record<CvLang, Record<ExportFormat, string>> = {
  en: { pdf: '/cv.pdf', txt: '/cv.txt', json: '/cv.json' },
  zh: { pdf: '/cv/zh.pdf', txt: '/cv/zh.txt', json: '/cv/zh.json' },
}

/** The PDF CV of a language: /cv.pdf (English), /cv/zh.pdf (Chinese). */
export function cvPdfPath(lang: CvLang): string {
  return EXPORT_PATHS[lang].pdf
}
