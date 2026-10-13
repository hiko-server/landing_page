import { withApi } from '../../lib/apiHandler'
import { readPublicHome } from '../../lib/home'
import { referenceMonth } from '../../lib/clock'
import { profileLinks } from '../../lib/cvLinks'
import { loadCvSource } from '../../lib/cvSource'
import { absUrl } from '../../lib/schema'
import { buildVcard, currentRoleFrom, vcardFileName } from '../../lib/vcard'

/**
 * GET /api/vcard → "Li-Yanpei.vcf" (vCard 4.0, lib/vcard.ts; the file name
 * follows the visible name and is neutral when the owner hides it).
 *
 * Built from the public, CV-scoped personal information (hidden e-mail /
 * phone / address never appear), the current role from work experience, the
 * public GitHub / LinkedIn profiles the CV prints (lib/cvLinks) and the
 * public home avatar. Cached at the edge for an hour.
 */
export default withApi('vcard', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const now = referenceMonth()
  const { sections } = await loadCvSource('en', now)
  const personal = sections.find((s) => s.sessionName === 'personalInformation') ?? null
  const work = sections.find((s) => s.sessionName === 'workExperience') ?? null
  const avatar = (readPublicHome()?.hero?.avatarUrl || '').trim()

  const card = buildVcard(personal, currentRoleFrom(work, now), {
    photoUrl: avatar ? absUrl(avatar) : undefined,
    profiles: profileLinks(personal),
  })

  res.setHeader('Content-Type', 'text/vcard; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${vcardFileName(personal)}"`)
  res.setHeader('Cache-Control', 'public, s-maxage=3600')
  return res.status(200).send(card)
})
