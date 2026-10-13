/**
 * The richer facts of the site's Person entity (schema.org), derived from
 * the PUBLIC, website-audience English CV. Pure; unit-tested. The shared
 * Person loader (lib/personFacts) merges them into the facts every page
 * emits under the one @id.
 *
 *   hasCredential  degrees whose (visible) end date has passed — never an
 *                  in-progress degree, never one with a hidden end date
 *   award          competition results ("IEEE Xtreme 19.0 — 18th Worldwide")
 *   knowsLanguage  the language section's names, with a BCP 47 code when
 *                  known (Mandarin → cmn, Cantonese → yue, English → en)
 *   jobTitle /     only for a role that is running right now (started, end
 *   worksFor       "Present" or in the future) — otherwise the site-wide
 *                  default job title stays and there is no employer
 *   affiliation    schools of studies that are running right now
 */

import type { CvSectionLike } from './cvVisibility'
import { webHref } from './cvLinks'
import { parseCvDate } from './cvFormat'
import { bullets, entryStatus, field, list } from '../components/CVViewerPage/fields'
import { languageNames } from '../components/LandingPage/heroIdentity'
import type { PersonFacts } from './schema'

/** Language names (EN and 中文) → BCP 47 codes; unknown names keep no code. */
export const LANGUAGE_CODES: Readonly<Record<string, string>> = {
  english: 'en',
  英语: 'en',
  英文: 'en',
  mandarin: 'cmn',
  'mandarin chinese': 'cmn',
  putonghua: 'cmn',
  普通话: 'cmn',
  普通話: 'cmn',
  国语: 'cmn',
  國語: 'cmn',
  cantonese: 'yue',
  粤语: 'yue',
  粵語: 'yue',
  广东话: 'yue',
  廣東話: 'yue',
  chinese: 'zh',
  中文: 'zh',
  汉语: 'zh',
  漢語: 'zh',
  hokkien: 'nan',
  shanghainese: 'wuu',
  hakka: 'hak',
  japanese: 'ja',
  日语: 'ja',
  korean: 'ko',
  韩语: 'ko',
  french: 'fr',
  法语: 'fr',
  german: 'de',
  德语: 'de',
  spanish: 'es',
  西班牙语: 'es',
  portuguese: 'pt',
  italian: 'it',
  russian: 'ru',
  arabic: 'ar',
  hindi: 'hi',
  vietnamese: 'vi',
  thai: 'th',
  indonesian: 'id',
  malay: 'ms',
}

export function languageCode(name: string): string {
  return LANGUAGE_CODES[name.trim().toLowerCase()] || ''
}

const MAX_AWARDS = 10

/** 'YYYY-MM' / 'YYYY' of a stored date, '' otherwise. */
function isoMonth(value: string): string {
  const d = parseCvDate(value)
  if (!d) return ''
  return d.m ? `${d.y}-${String(d.m).padStart(2, '0')}` : String(d.y)
}

export type PersonExtras = Pick<PersonFacts, 'hasCredential' | 'award' | 'knowsLanguage' | 'jobTitle' | 'worksFor' | 'affiliation'>

/**
 * @param sections public, website-audience EN sections (education,
 *   competitionAwards, extraSkill, workExperience)
 * @param now reference month 'YYYY-MM' (lib/clock)
 */
export function personExtrasFromCv(sections: readonly CvSectionLike[] | null | undefined, now: string): PersonExtras {
  const all = Array.isArray(sections) ? sections : []
  const find = (n: string) => all.find((s) => s?.sessionName === n)
  const out: PersonExtras = {}

  const education = list(find('education'), 'educationExperience')
  const credentials = education
    .filter((e) => entryStatus(e, now) === 'past' && field(e, 'degree'))
    .map((e) => ({
      name: field(e, 'degree'),
      ...(field(e, 'schoolName') ? { school: field(e, 'schoolName') } : {}),
      ...(isoMonth(field(e, 'endDate')) ? { date: isoMonth(field(e, 'endDate')) } : {}),
    }))
  if (credentials.length) out.hasCredential = credentials

  const studying = education.filter((e) => entryStatus(e, now) === 'current' && field(e, 'schoolName')).map((e) => ({ name: field(e, 'schoolName') }))
  if (studying.length) out.affiliation = studying

  const awards = list(find('competitionAwards'), 'awards')
    .map((a) => {
      const contest = field(a, 'contestName')
      const result = field(a, 'award')
      return contest && result ? `${contest} — ${result}` : contest || result
    })
    .filter(Boolean)
    .slice(0, MAX_AWARDS)
  if (awards.length) out.award = awards

  const langs = languageNames(bullets(find('extraSkill'), 'points')).map((name) => {
    const code = languageCode(name)
    return code ? { name, code } : { name }
  })
  if (langs.length) out.knowsLanguage = langs

  const role = list(find('workExperience'), 'experiences').find((e) => entryStatus(e, now) === 'current' && (field(e, 'jobTitle') || field(e, 'companyName')))
  if (role) {
    if (field(role, 'jobTitle')) out.jobTitle = field(role, 'jobTitle')
    if (field(role, 'companyName')) {
      const url = webHref(field(role, 'companyURL'))
      out.worksFor = { name: field(role, 'companyName'), ...(url ? { url } : {}) }
    }
  }
  return out
}
