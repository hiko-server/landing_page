/**
 * The downloadable CVs (/cv.pdf, /cv.txt, /cv.json and the /cv/zh.* twins):
 * build, fingerprint and cache. SERVER-ONLY.
 *
 * A file is a pure function of its inputs — the public CV of the language
 * (lib/cvSource), the reference month, the accent colour and the renderer
 * version — so its ETag is a hash of exactly those inputs. Rendered bytes are
 * kept in a small in-memory cache keyed by that hash: saving the CV changes
 * the inputs, so the next request renders the new version (a CV save also
 * warms the PDFs in the background, warmCvExports). Nothing stale can be
 * served: there is no time-based expiry to wait for.
 */

import crypto from 'node:crypto'
import type { CvLang } from '../cvVisibility'
import { absUrl } from '../schema'
import { log } from '../log'
import { loadCvSource, type CvSource } from '../cvSource'
import { field } from '../../components/CVViewerPage/fields'
import { EXPORT_CONTENT_TYPES, EXPORT_PATHS, cvFileBase, cvFileName, type ExportFormat } from './files'
import { buildCvModel, hasContent, type CvDocModel } from './model'
import { renderCvText } from './text'
import { buildJsonResume } from './jsonResume'

/** Bump when the output of a renderer changes for the same input. */
export const EXPORT_VERSION = 1

export type CvExport = {
  body: Buffer
  contentType: string
  filename: string
  /** Strong ETag (quoted). */
  etag: string
  /** Last save of the CV (epoch ms), for Last-Modified; 0 when unknown. */
  updatedAt: number
  lang: CvLang
  format: ExportFormat
}

export type CvExportResult = { ok: true; file: CvExport } | { ok: false; status: 404; error: string }

const CACHE_MAX = 8
const cache = new Map<string, CvExport>()
const pending = new Map<string, Promise<CvExport>>()

function remember(key: string, file: CvExport) {
  cache.delete(key)
  cache.set(key, file)
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
}

/** Stable hash of the inputs of one file. */
export function fingerprint(parts: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('base64url').slice(0, 32)
}

function modelOf(src: CvSource): CvDocModel {
  return buildCvModel(src.sections, {
    lang: src.lang,
    now: src.now,
    updatedAt: src.updatedAt,
    canonical: absUrl(src.lang === 'zh' ? '/cv/zh' : '/cv'),
  })
}

function accentOf(src: CvSource): string {
  return field(
    src.sections.find((s) => s.sessionName === 'personalInformation'),
    'separatorColor',
  )
}

/** Build (or reuse) one downloadable CV. 404 when the language has nothing public to print. */
export async function getCvExport(lang: CvLang, format: ExportFormat, source?: CvSource): Promise<CvExportResult> {
  const src = source ?? (await loadCvSource(lang))
  const model = modelOf(src)
  if (!hasContent(model)) return { ok: false, status: 404, error: lang === 'zh' ? '中文简历暂未发布。' : 'The CV has not been published yet.' }

  const base = cvFileBase(src.enPersonal, lang, model.updatedMonth)
  const filename = cvFileName(base, format)
  const build = process.env.NEXT_PUBLIC_BUILD_SHA || ''

  if (format === 'json') {
    const resume = buildJsonResume(src.sections, { lang, now: src.now, canonical: absUrl(EXPORT_PATHS[lang].json), updatedAt: src.updatedAt })
    const body = Buffer.from(`${JSON.stringify(resume, null, 2)}\n`, 'utf8')
    return { ok: true, file: { body, contentType: EXPORT_CONTENT_TYPES.json, filename, etag: `"${fingerprint([EXPORT_VERSION, build, 'json', body.toString('utf8')])}"`, updatedAt: src.updatedAt, lang, format } }
  }
  if (format === 'txt') {
    const body = Buffer.from(renderCvText(model), 'utf8')
    return { ok: true, file: { body, contentType: EXPORT_CONTENT_TYPES.txt, filename, etag: `"${fingerprint([EXPORT_VERSION, build, 'txt', body.toString('utf8')])}"`, updatedAt: src.updatedAt, lang, format } }
  }

  const accent = accentOf(src)
  const key = fingerprint([EXPORT_VERSION, build, 'pdf', model, accent, src.updatedAt])
  const hit = cache.get(key)
  if (hit) {
    remember(key, hit)
    return { ok: true, file: { ...hit, filename } }
  }
  let job = pending.get(key)
  if (!job) {
    job = (async () => {
      const { loadPdfFonts, renderCvPdf } = await import('./pdf')
      const started = Date.now()
      const out = await renderCvPdf(model, { fonts: loadPdfFonts(), accent, updatedAt: src.updatedAt })
      if (out.missing.length) log.warn('cv pdf: characters without a glyph were left out', { lang, chars: out.missing.slice(0, 40).join('') })
      log.info('cv pdf rendered', { lang, pages: out.pages, bytes: out.buffer.length, ms: Date.now() - started })
      const file: CvExport = { body: out.buffer, contentType: EXPORT_CONTENT_TYPES.pdf, filename, etag: `"${key}"`, updatedAt: src.updatedAt, lang, format }
      remember(key, file)
      return file
    })()
    pending.set(key, job)
    job.finally(() => pending.delete(key)).catch(() => undefined)
  }
  return { ok: true, file: { ...(await job), filename } }
}

/** Render both PDFs in the background (after a CV save), so the next download is instant. Never throws. */
export function warmCvExports(): void {
  setTimeout(() => {
    for (const lang of ['en', 'zh'] as const) {
      getCvExport(lang, 'pdf').catch((err) => log.warn('cv pdf warm-up failed', { lang, err }))
    }
  }, 0)
}

/** Forget every rendered file (tests). */
export function clearCvExportCache(): void {
  cache.clear()
}
