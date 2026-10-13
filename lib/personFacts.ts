/**
 * The facts of the site's one Person entity (schema.org JSON-LD).
 *
 * Every page that emits the Person node (/, /about, /cv, /cv/zh) declares it
 * under the same @id (lib/schema PERSON_ID), so its facts must not differ
 * from page to page: they all take them from this loader.
 *
 * Only public data is read:
 *   - the website view of the CV: location (Personal Info address), schools,
 *     skills, and the 中文 name (via heroIdentity, exactly as the hero shows
 *     it) — contact details never;
 *   - the Home editor's portrait, as its 640 px variant when one is stored
 *     (personNode makes it absolute); without one the node keeps the site's
 *     default portrait, the same image the hero falls back to.
 *
 * SERVER-ONLY (content store + filesystem): import it inside
 * getServerSideProps. Best effort — a failing source just contributes nothing.
 */

import { readCvData, readPublicCvSections } from './cvdata'
import { readPublicHome } from './home'
import { safeHref } from './cvFormat'
import { personFactsFromCv, type PersonFacts } from './schema'
import { variantUrl } from './uploadVariants'
import { heroIdentity } from '../components/LandingPage/heroIdentity'

/** CV sections the Person facts come from (website audience). */
export const PERSON_CV_SECTIONS = ['personalInformation', 'education', 'skill'] as const

/** Width of the portrait variant used as the Person image. */
export const PERSON_IMAGE_WIDTH = 640

export function loadPersonFacts(): PersonFacts {
  let facts: PersonFacts = {}
  try {
    const cv = readPublicCvSections('website', PERSON_CV_SECTIONS, ['en', 'zh'])
    const stored = readCvData()
    const storedHasPersonalInfo = [...stored.en, ...stored.zh].some((s) => s?.sessionName === 'personalInformation')
    const info = (list: typeof cv.en) => list.find((s) => s.sessionName === 'personalInformation')
    const { nameZh } = heroIdentity(info(cv.en), info(cv.zh), { storedHasPersonalInfo })
    facts = { ...personFactsFromCv(cv.en), ...(nameZh ? { alternateName: [nameZh] } : {}) }
  } catch {
    /* no CV facts — the node keeps its built-in defaults */
  }
  try {
    const avatar = safeHref(readPublicHome()?.hero?.avatarUrl)
    if (avatar.startsWith('/')) facts.image = variantUrl(avatar, PERSON_IMAGE_WIDTH)
    else if (/^https?:\/\//i.test(avatar)) facts.image = avatar
  } catch {
    /* no portrait — the node keeps the default image */
  }
  return facts
}
