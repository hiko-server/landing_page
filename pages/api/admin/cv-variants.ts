import type { NextApiRequest, NextApiResponse } from 'next'
import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { ifMatchAllows, kvEtag } from '../../../lib/contentStore'
import { sendVersionedJson } from '../../../lib/http'
import { rateLimit } from '../../../lib/rateLimit'
import { recordAdminAudit } from '../../../lib/audit/record'
import { readVariants, writeVariants } from '../../../lib/cvVariantsStore'
import { validateVariantDoc, type CvVariant } from '../../../lib/cvVariants'
import type { CvLang } from '../../../lib/cvVisibility'

/**
 * CV variants (E4) — admin only.
 *
 *   GET                     { variants, keyConfigured } + ETag of the stored
 *                           document ("0" when none)
 *   GET ?pdf=<id>&lang=en|zh
 *                           the SAVED variant's PDF, exactly as its share
 *                           links serve it (for the owner to look at)
 *   PUT { variants }        save the whole list (If-Match against the ETag;
 *                           409 with the current ETag when it changed). A
 *                           variant left out is deleted and its share links
 *                           are revoked at once.
 *   POST { action: 'measure', variant }
 *                           render the variant's PDF in both languages over
 *                           the SAVED CV ('private' surface) and answer
 *                           { en, zh: { pages, lastPageFill } | null } —
 *                           what the page-count target is measured against.
 *                           Stores nothing.
 */
export const config = { api: { bodyParser: { sizeLimit: '256kb' } } }

type Measured = { pages: number; lastPageFill: number } | null

async function measure(variant: Pick<CvVariant, 'sections'>): Promise<Record<CvLang, Measured>> {
  const { loadShareSource } = await import('../../../lib/cvShare/page')
  const { getCvExport } = await import('../../../lib/cvExport/service')
  const out: Record<CvLang, Measured> = { en: null, zh: null }
  for (const lang of ['en', 'zh'] as const) {
    const src = await loadShareSource({ ...(variant as CvVariant) }, lang)
    const file = await getCvExport(lang, 'pdf', src)
    out[lang] = file.ok && typeof file.file.pages === 'number' ? { pages: file.file.pages, lastPageFill: file.file.lastPageFill ?? 1 } : null
  }
  return out
}

export default withApi('admin/cv-variants', async (req: NextApiRequest, res: NextApiResponse) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET' && typeof req.query.pdf === 'string') {
    const variant = readVariants().variants.find((v) => v.id === req.query.pdf)
    const lang: CvLang = req.query.lang === 'zh' ? 'zh' : 'en'
    if (!variant) return res.status(404).json({ error: 'No saved variant has this id.' })
    const { loadShareSource } = await import('../../../lib/cvShare/page')
    const { getCvExport } = await import('../../../lib/cvExport/service')
    const { inlineDisposition } = await import('../../../lib/cvExport/files')
    const result = await getCvExport(lang, 'pdf', await loadShareSource(variant, lang))
    if (!result.ok) return res.status(404).json({ error: lang === 'zh' ? 'This variant prints nothing in Chinese.' : 'This variant prints nothing in English.' })
    res.setHeader('Content-Type', result.file.contentType)
    res.setHeader('Content-Disposition', inlineDisposition(result.file.filename))
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    res.setHeader('Content-Length', result.file.body.length)
    res.statusCode = 200
    return res.end(result.file.body)
  }

  if (req.method === 'GET') {
    const { variants, version } = readVariants()
    const { shareKey } = await import('../../../lib/cvShare/token')
    return sendVersionedJson(res, 200, { variants, keyConfigured: !!shareKey() }, kvEtag(version))
  }

  if (req.method === 'POST') {
    const b = (req.body || {}) as Record<string, unknown>
    if (b.action !== 'measure') return res.status(400).json({ error: 'Unknown action' })
    const rl = rateLimit(req, 120, 10 * 60 * 1000, 'admin-cv-variants-measure')
    if (!rl.allowed) return res.status(429).json({ error: 'Too many measurements — try again in a minute' })
    const checked = validateVariantDoc({ variants: [b.variant] })
    if (!checked.ok) return res.status(422).json({ code: 'INVALID_VARIANTS', error: checked.errors[0]?.message, errors: checked.errors })
    return res.status(200).json(await measure(checked.doc.variants[0]))
  }

  if (req.method === 'PUT') {
    const rl = rateLimit(req, 60, 10 * 60 * 1000, 'admin-cv-variants')
    if (!rl.allowed) return res.status(429).json({ error: 'Too many saves in a short time — try again in a few minutes' })
    const checked = validateVariantDoc(req.body)
    if (!checked.ok) return res.status(422).json({ code: 'INVALID_VARIANTS', error: checked.errors[0]?.message, errors: checked.errors })
    const ifMatch = req.headers['if-match']
    const current = readVariants()
    if (!ifMatchAllows(ifMatch, current.version)) {
      const etag = kvEtag(current.version)
      return sendVersionedJson(res, 409, { error: 'conflict', message: 'The variants were changed elsewhere since you loaded them.', etag }, etag)
    }
    const now = Date.now()
    const before = new Map(current.variants.map((v) => [v.id, v]))
    const variants = checked.doc.variants.map((v) => {
      const prev = before.get(v.id)
      const same = prev && JSON.stringify({ ...prev, updatedAt: 0, createdAt: 0 }) === JSON.stringify({ ...v, updatedAt: 0, createdAt: 0 })
      return { ...v, createdAt: prev?.createdAt ?? v.createdAt, updatedAt: same ? prev.updatedAt : now }
    })
    const written = await writeVariants({ variants }, (version) => ifMatchAllows(ifMatch, version))
    if (!written.ok) {
      if (written.conflict) {
        const etag = kvEtag(written.conflict.updatedAt)
        return sendVersionedJson(res, 409, { error: 'conflict', message: 'The variants were changed elsewhere since you loaded them.', etag }, etag)
      }
      return res.status(500).json({ error: written.error })
    }
    // A deleted variant takes its links with it.
    const kept = new Set(variants.map((v) => v.id))
    const removed = current.variants.filter((v) => !kept.has(v.id))
    let revoked = 0
    if (removed.length) {
      const { revokeVariantLinks } = await import('../../../lib/cvShare/store')
      for (const v of removed) revoked += revokeVariantLinks(v.id, now)
    }
    const added = variants.filter((v) => !before.has(v.id)).length
    recordAdminAudit(req, res, {
      action: 'cv.variants-save',
      area: 'cv',
      target: String(variants.length),
      summary:
        removed.length && !added
          ? `Deleted ${removed.length === 1 ? 'a CV variant' : `${removed.length} CV variants`}${revoked ? ` and revoked ${revoked === 1 ? 'its link' : `${revoked} links`}` : ''}`
          : added && !removed.length
            ? `Added ${added === 1 ? 'a CV variant' : `${added} CV variants`}`
            : `Saved the CV variants (${variants.length})`,
    })
    const etag = kvEtag(written.updatedAt)
    return sendVersionedJson(res, 200, { ok: true, variants, revoked, ...(written.r2Warning ? { r2Warning: written.r2Warning } : {}) }, etag)
  }

  res.setHeader('Allow', 'GET, PUT, POST')
  return res.status(405).json({ error: 'Method not allowed' })
})
