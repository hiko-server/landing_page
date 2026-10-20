import { withApi } from '../../lib/apiHandler'
import { readPublicHome } from '../../lib/home'
import { referenceMonth } from '../../lib/clock'
import { profileLinks } from '../../lib/cvLinks'
import { loadCvSource } from '../../lib/cvSource'
import { absUrl } from '../../lib/schema'
import { buildVcard, currentRoleFrom, vcardFileName } from '../../lib/vcard'
import { recordServerGoal } from '../../lib/analytics/events'

/**
 * GET /api/vcard → "Li-Yanpei.vcf" (vCard 4.0, lib/vcard.ts; the file name
 * follows the visible name and is neutral when the owner hides it).
 *
 * Built from the public, CV-scoped personal information of the 'download'
 * surface (hidden e-mail / phone / address never appear; one the owner keeps
 * to the pages or private links neither), the current role from work experience, the
 * public GitHub / LinkedIn profiles the CV prints (lib/cvLinks) and the
 * public home avatar.
 *
 * Revalidated at the origin on every request (`no-cache`; Next's API
 * response carries an ETag of the card and answers 304 while it is
 * unchanged), so a CV save shows up at once and every save of the card
 * reaches this route: a GET counts one vcard_save goal event
 * (lib/analytics/events: no property, the daily visitor hash, the page-view
 * exclusions; never HEAD or a prefetch).
 */
export default withApi('vcard', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const now = referenceMonth()
  // The vCard is a download: the 'download' surface's audiences apply (lib/cvVisibility).
  const { sections } = await loadCvSource('en', now, { surface: 'download' })
  const personal = sections.find((s) => s.sessionName === 'personalInformation') ?? null
  const work = sections.find((s) => s.sessionName === 'workExperience') ?? null
  const avatar = (readPublicHome()?.hero?.avatarUrl || '').trim()

  const card = buildVcard(personal, currentRoleFrom(work, now), {
    photoUrl: avatar ? absUrl(avatar) : undefined,
    profiles: profileLinks(personal),
  })

  res.setHeader('Content-Type', 'text/vcard; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${vcardFileName(personal)}"`)
  res.setHeader('Cache-Control', 'public, no-cache')
  if (req.method === 'GET') recordServerGoal(req, 'vcard_save')
  return res.status(200).send(card)
})
