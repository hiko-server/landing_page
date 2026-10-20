import { readCvData, readPublicCvSections } from './cvdata'
import { readPublicHome } from './home'
import { safeHref } from './cvFormat'
import { variantAvifSrcSet, variantSrcSet, variantUrl } from './uploadVariants'
import { availabilityView } from '../components/Common/availability'
import { heroCopy, heroIdentity, portraitAlt } from '../components/LandingPage/heroIdentity'
import { PERSON_NAME } from './schema'

/**
 * Who wrote the article — the end-of-article author card (D7). SERVER-ONLY
 * (content store), called in getStaticProps of posts and case studies.
 *
 * Only public data, the same the home hero shows:
 *   - the name from the website view of the CV (heroIdentity: hidden names
 *     stay hidden), the nickname in brackets;
 *   - the role: the first phrase of the Home editor's tagline (heroCopy);
 *   - the portrait with the Home editor's crop (object-position), as its
 *     640 px variant;
 *   - the availability only when the owner set one (never guessed).
 * Best effort: a failing source contributes nothing.
 */

export type AuthorCardData = {
  name: string
  role: string
  avatar: { src: string; srcSet: string | null; avifSrcSet?: string | null; position: string } | null
  availability: { status: 'open' | 'limited' | 'closed'; label: string } | null
}

const clampPct = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n * 10) / 10)) : 50
}

export function loadAuthorCard(): AuthorCardData {
  let name = PERSON_NAME
  try {
    const cv = readPublicCvSections('website', ['personalInformation'], ['en', 'zh'])
    const stored = readCvData()
    const storedHasPersonalInfo = [...stored.en, ...stored.zh].some((s) => s?.sessionName === 'personalInformation')
    const info = (list: typeof cv.en) => list.find((s) => s.sessionName === 'personalInformation')
    const id = heroIdentity(info(cv.en), info(cv.zh), { storedHasPersonalInfo })
    const alt = portraitAlt(id)
    if (alt && alt !== 'Portrait') name = alt
  } catch {
    /* the built-in name */
  }

  let role = heroCopy('').role
  let avatar: AuthorCardData['avatar'] = null
  let availability: AuthorCardData['availability'] = null
  try {
    const home = readPublicHome()
    role = heroCopy(home?.hero?.tagline).role
    const url = safeHref(home?.hero?.avatarUrl)
    if (url.startsWith('/')) {
      const t = home?.hero?.avatarTransform
      const srcSet = variantSrcSet(url) || null
      avatar = {
        src: variantUrl(url, 640),
        srcSet,
        avifSrcSet: srcSet ? variantAvifSrcSet(url) || null : null,
        position: `${clampPct(t?.x ?? 50)}% ${clampPct(t?.y ?? 50)}%`,
      }
    }
    const view = availabilityView(home?.availability)
    if (view) availability = { status: view.status, label: view.label }
  } catch {
    /* no home document: name and role only */
  }
  return { name, role, avatar, availability }
}
