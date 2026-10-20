/**
 * How an ORCID iD is shown on a web page (ORCID's iD display guidelines,
 * https://info.orcid.org/documentation/integration-guide/orcid-id-display-guidelines/):
 * the full https://orcid.org/… URI behind an iD icon, and
 *
 *   authenticated (the owner signed in to ORCID)  the green iD icon
 *   typed in                                       the unauthenticated iD icon,
 *                                                  the link followed by
 *                                                  "(unauthenticated)" in the
 *                                                  page's language
 *
 * — nothing else tells them apart. Pure; components/Common/OrcidIdLink
 * renders it. Files and structured data (PDF, text, JSON Resume, vCard,
 * JSON-LD) carry the URI alone either way.
 */

export type OrcidDisplayLang = 'en' | 'zh'

/** ORCID's own wording (its zh-CN guidelines use 未经认证). */
export const ORCID_UNAUTHENTICATED_SUFFIX: Record<OrcidDisplayLang, string> = {
  en: '(unauthenticated)',
  zh: '（未经认证）',
}

export type OrcidDisplay = {
  icon: 'authenticated' | 'unauthenticated'
  /** Text after the URI ('' for an authenticated iD). */
  suffix: string
  /** BCP 47 tag of the suffix when it is not English. */
  suffixLang?: 'zh-Hans'
}

export function orcidDisplay(authenticated: boolean, lang: OrcidDisplayLang = 'en'): OrcidDisplay {
  if (authenticated) return { icon: 'authenticated', suffix: '' }
  const l: OrcidDisplayLang = lang === 'zh' ? 'zh' : 'en'
  return { icon: 'unauthenticated', suffix: ORCID_UNAUTHENTICATED_SUFFIX[l], ...(l === 'zh' ? { suffixLang: 'zh-Hans' as const } : {}) }
}
