import type { NextApiRequest, NextApiResponse } from 'next'
import { withApi } from '../../../lib/apiHandler'
import { rateLimit } from '../../../lib/rateLimit'

/**
 * Private share links of CV variants (E4).
 *
 *   GET|HEAD ?token=&lang=en|zh   the variant's PDF — public URLs
 *                                 /cv/r/<token>/en.pdf and …/zh.pdf
 *                                 (next.config.js rewrites)
 *   POST {"t": token}             one counted open (lib/cvShare/openBeacon),
 *                                 sent as text/plain; always 204
 *
 * The PDF is rendered from the variant's selection for the 'private'
 * surface (lib/cvShare/page loadShareSource) through the same renderer and
 * in-memory cache as /cv.pdf (lib/cvExport/service). Every answer is
 * private, never stored and never indexed; a token that opens nothing gets
 * the same 404 whatever the reason.
 *
 * Counting an open records nothing about the visitor: +1 and the UTC day on
 * the link (lib/cvShare/store recordShareOpen). Not counted: Do Not Track /
 * Global Privacy Control, bots, a signed-in owner (the analytics rules,
 * lib/analytics/ingest dropReason), more than 20 beacons a client sends in
 * 10 minutes.
 */
export const config = { api: { bodyParser: { sizeLimit: '2kb' } } }

function privateHeaders(res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  res.setHeader('Referrer-Policy', 'no-referrer')
}

function tokenOf(body: unknown): string | null {
  let v: unknown = body
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return null
    }
  }
  const t = v && typeof v === 'object' ? (v as { t?: unknown }).t : null
  return typeof t === 'string' && t.length <= 64 ? t : null
}

async function sendPdf(req: NextApiRequest, res: NextApiResponse) {
  const lang = req.query.lang === 'zh' ? 'zh' : req.query.lang === 'en' ? 'en' : null
  const token = typeof req.query.token === 'string' ? req.query.token : null
  const notFound = () => res.status(404).json({ error: 'Not available' })
  if (!lang || !token) return notFound()
  const rl = rateLimit(req, 60, 10 * 60 * 1000, 'cv/share/pdf')
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' })
  const { resolveShare, loadShareSource } = await import('../../../lib/cvShare/page')
  const resolved = await resolveShare(token)
  if (!resolved) return notFound()
  const src = await loadShareSource(resolved.variant, lang)
  const { getCvExport } = await import('../../../lib/cvExport/service')
  const result = await getCvExport(lang, 'pdf', src)
  if (!result.ok) return notFound()
  const { inlineDisposition } = await import('../../../lib/cvExport/files')
  const file = result.file
  res.setHeader('Content-Type', file.contentType)
  res.setHeader('Content-Language', lang === 'zh' ? 'zh-Hans' : 'en')
  res.setHeader('Content-Disposition', inlineDisposition(file.filename))
  res.setHeader('Content-Length', file.body.length)
  res.statusCode = 200
  return res.end(req.method === 'HEAD' ? undefined : file.body)
}

export default withApi('cv/share', async (req, res, ctx) => {
  privateHeaders(res)
  if (req.method === 'GET' || req.method === 'HEAD') return sendPdf(req, res)
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, HEAD, POST')
    return res.status(405).end()
  }
  try {
    const { dropReason } = await import('../../../lib/analytics/ingest')
    const reason = dropReason(req)
    const token = tokenOf(req.body)
    if (!reason && token && rateLimit(req, 20, 10 * 60 * 1000, 'cv/share/open').allowed) {
      const { recordShareOpen } = await import('../../../lib/cvShare/store')
      recordShareOpen(token)
    }
  } catch (err) {
    ctx.log.warn('share-link open not recorded', { err })
  }
  return res.status(204).end()
})
