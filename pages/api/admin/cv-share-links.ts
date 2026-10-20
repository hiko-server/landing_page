import type { NextApiRequest, NextApiResponse } from 'next'
import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import { recordAdminAudit } from '../../../lib/audit/record'
import { requireRecentAuth } from '../../../lib/adminAuth/stepUp'
import { readVariant } from '../../../lib/cvVariantsStore'
import { DEFAULT_EXPIRY_DAYS, SHARE_LINK_ID_RE, expiryDays, sharePagePath } from '../../../lib/cvShare/links'
import { createShareLink, editShareLink, getShareLink, listShareLinks, removeShareLink, revokeShareLink } from '../../../lib/cvShare/store'

/**
 * Private share links of CV variants (E4) — admin only.
 *
 *   GET [?variant=<id>]               { links } newest first (never a token)
 *   POST { variantId, lang, days, note? }
 *                                     a new link: { link, token, path } — the
 *                                     ONLY time the token is shown; the store
 *                                     keeps its hash. Asks for a recent
 *                                     sign-in ("Confirm it's you", lib/
 *                                     adminAuth/stepUp): a link hands out
 *                                     whatever the variant shows privately.
 *   PATCH { id, action: 'revoke' }    ends a link at once
 *   PATCH { id, action: 'extend', days }   a new expiry, `days` from now
 *                                     (recent sign-in, like creating one)
 *   PATCH { id, action: 'note', note }     the owner's label
 *   DELETE { id }                     forgets a revoked or expired link
 *
 * Every change is in the activity log — never the token, the note or a
 * visitor detail (there are none to log).
 */

function badId(res: NextApiResponse) {
  return res.status(404).json({ error: 'No such link' })
}

export default withApi('admin/cv-share-links', async (req: NextApiRequest, res: NextApiResponse) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>

  if (req.method === 'GET') {
    const variantId = typeof req.query.variant === 'string' ? req.query.variant : undefined
    return res.status(200).json({ links: listShareLinks(variantId ? { variantId } : {}) })
  }

  const rl = rateLimit(req, 60, 10 * 60 * 1000, 'admin-cv-share-links')
  if (!rl.allowed) return res.status(429).json({ error: 'Too many changes in a short time — try again in a few minutes' })

  if (req.method === 'POST') {
    const variant = readVariant(b.variantId)
    if (!variant) return res.status(404).json({ error: 'Save the variant first — no saved variant has this id.' })
    const lang = b.lang === 'zh' ? 'zh' : b.lang === 'en' || b.lang === undefined ? 'en' : null
    if (!lang) return res.status(400).json({ error: 'lang must be en or zh' })
    const days = b.days === undefined ? DEFAULT_EXPIRY_DAYS : expiryDays(b.days)
    if (days === null) return res.status(400).json({ error: 'A link expires after 1 to 365 days.' })
    if (!requireRecentAuth(req, res)) return
    const made = createShareLink({ variantId: variant.id, lang, days, note: typeof b.note === 'string' ? b.note : '' })
    if (!made.ok) return res.status(made.code === 'NO_KEY' ? 503 : 409).json({ code: made.code, error: made.error })
    recordAdminAudit(req, res, {
      action: 'cv.share-link-create',
      area: 'cv',
      target: variant.name.slice(0, 60),
      summary: `Created a private CV link for “${variant.name}” (${lang === 'zh' ? '中文' : 'English'}, ${days} day${days === 1 ? '' : 's'})`,
    })
    return res.status(201).json({ link: made.link, token: made.token, path: sharePagePath(made.token) })
  }

  if (req.method === 'PATCH') {
    const id = typeof b.id === 'string' && SHARE_LINK_ID_RE.test(b.id) ? b.id : null
    const existing = id ? getShareLink(id) : null
    if (!existing) return badId(res)
    const variantName = readVariant(existing.variantId)?.name?.slice(0, 60) || null
    if (b.action === 'revoke') {
      const link = revokeShareLink(existing.id)
      if (!link) return badId(res)
      if (existing.revokedAt === null) {
        recordAdminAudit(req, res, { action: 'cv.share-link-revoke', area: 'cv', target: variantName, summary: `Revoked a private CV link${variantName ? ` for “${variantName}”` : ''}` })
      }
      return res.status(200).json({ link })
    }
    if (b.action === 'extend') {
      const days = expiryDays(b.days)
      if (days === null) return res.status(400).json({ error: 'A link expires after 1 to 365 days.' })
      if (existing.revokedAt !== null) return res.status(409).json({ error: 'A revoked link stays revoked — create a new one.' })
      if (!requireRecentAuth(req, res)) return
      const link = editShareLink(existing.id, { extendDays: days })
      recordAdminAudit(req, res, { action: 'cv.share-link-extend', area: 'cv', target: variantName, summary: `Set a private CV link to expire in ${days} day${days === 1 ? '' : 's'}` })
      return res.status(200).json({ link })
    }
    if (b.action === 'note') {
      const link = editShareLink(existing.id, { note: b.note })
      recordAdminAudit(req, res, { action: 'cv.share-link-note', area: 'cv', target: variantName, summary: 'Changed the note of a private CV link' })
      return res.status(200).json({ link })
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  if (req.method === 'DELETE') {
    const id = typeof b.id === 'string' && SHARE_LINK_ID_RE.test(b.id) ? b.id : null
    const existing = id ? getShareLink(id) : null
    if (!existing) return badId(res)
    if (!removeShareLink(existing.id)) return res.status(409).json({ error: 'Revoke the link before removing it.' })
    recordAdminAudit(req, res, { action: 'cv.share-link-remove', area: 'cv', target: null, summary: 'Removed an ended private CV link from the list' })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
})
