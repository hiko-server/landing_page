import type { NextApiRequest, NextApiResponse } from 'next'
import { withApi } from '../../../lib/apiHandler'
import { sendNotModified, sendVersionedBody } from '../../../lib/http'
import { absUrl } from '../../../lib/schema'
import { inlineDisposition, isExportFormat } from '../../../lib/cvExport/files'
import { getCvExport } from '../../../lib/cvExport/service'
import { recordServerGoal } from '../../../lib/analytics/events'
import { cvFileProp } from '../../../lib/analytics/eventsShared'

/**
 * GET|HEAD /api/cv/export?lang=en|zh&format=pdf|txt|json — the downloadable
 * CVs. Public URLs (next.config.js rewrites): /cv.pdf, /cv.txt, /cv.json,
 * /cv/zh.pdf, /cv/zh.txt, /cv/zh.json.
 *
 * Built from the public, CV-audience view only (lib/cvExport): nothing the
 * owner hid can be in a file. Caching never serves a stale CV:
 *   - ETag = hash of everything the file is made of (lib/cvExport/service),
 *     so it changes with every CV save that changes the file;
 *   - `Cache-Control: public, max-age=0, must-revalidate`: browsers and
 *     Cloudflare revalidate every time (a 304 when nothing changed); the
 *     edge purge on a CV save also lists these paths (lib/revalidate).
 *     Because every open reaches this route, a GET answered 200 or 304
 *     counts one cv_download goal event (lib/analytics/events: language +
 *     format only, the daily visitor hash, the page-view exclusions; never
 *     HEAD or a prefetch).
 * `Content-Disposition: inline` with the dated name: opening the URL views
 * the file, the page's download links save it as "Li-Yanpei-CV-2026-10.pdf".
 * `Link: rel=canonical` points search engines at the HTML CV; the text and
 * JSON files are not for indexing (X-Robots-Tag: noindex).
 */
export default withApi('cv/export', async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const lang = req.query.lang === 'zh' ? 'zh' : req.query.lang === 'en' || req.query.lang === undefined ? 'en' : null
  const format = req.query.format ?? 'pdf'
  if (!lang || !isExportFormat(format)) return res.status(400).json({ error: 'Use lang=en|zh and format=pdf|txt|json' })

  const result = await getCvExport(lang, format)
  res.setHeader('Vary', 'Accept-Encoding')
  if (!result.ok) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(result.status).json({ error: result.error })
  }
  const file = result.file
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
  if (file.updatedAt > 0) res.setHeader('Last-Modified', new Date(file.updatedAt).toUTCString())
  res.setHeader('Content-Language', lang === 'zh' ? 'zh-Hans' : 'en')
  res.setHeader('Link', `<${absUrl(lang === 'zh' ? '/cv/zh' : '/cv')}>; rel="canonical"`)
  if (format !== 'pdf') res.setHeader('X-Robots-Tag', 'noindex')

  if (req.method === 'GET') recordServerGoal(req, 'cv_download', cvFileProp(lang, format) ?? '')
  const inm = req.headers['if-none-match']
  const tags = (Array.isArray(inm) ? inm.join(',') : inm || '').split(',').map((t) => t.trim().replace(/^W\//, ''))
  if (tags.includes(file.etag) || tags.includes('*')) return sendNotModified(res, file.etag)

  res.setHeader('Content-Type', file.contentType)
  res.setHeader('Content-Disposition', inlineDisposition(file.filename))
  return sendVersionedBody(res, 200, file.body, file.etag, req.method === 'HEAD')
})
