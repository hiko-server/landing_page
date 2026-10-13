import { withApi } from '../../lib/apiHandler'
import { readPublicCvSections } from '../../lib/cvdata'
import { readPublicHome } from '../../lib/home'
import { referenceMonth } from '../../lib/clock'
import { absUrl } from '../../lib/schema'
import { buildVcard, currentRoleFrom, vcardFileName } from '../../lib/vcard'

/**
 * GET /api/vcard → "Li-Yanpei.vcf" (vCard 4.0, lib/vcard.ts; the file name
 * follows the visible name and is neutral when the owner hides it).
 *
 * Built from the public, CV-scoped personal information (hidden e-mail /
 * phone / address never appear), the current role from work experience and
 * the public home avatar. Cached at the edge for an hour.
 */
export default withApi('vcard', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { en } = readPublicCvSections('cv', ['personalInformation', 'workExperience'], ['en'])
  const personal = en.find((s) => s.sessionName === 'personalInformation') ?? null
  const work = en.find((s) => s.sessionName === 'workExperience') ?? null
  const avatar = (readPublicHome()?.hero?.avatarUrl || '').trim()

  const card = buildVcard(personal, currentRoleFrom(work, referenceMonth()), {
    photoUrl: avatar ? absUrl(avatar) : undefined,
  })

  res.setHeader('Content-Type', 'text/vcard; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${vcardFileName(personal)}"`)
  res.setHeader('Cache-Control', 'public, s-maxage=3600')
  return res.status(200).send(card)
})
