/**
 * The CV's display name, from the public (pruned) Personal Info section.
 * Pure (.ts) so the A4 sheet, the Reading view, the exports (lib/cvExport)
 * and node:test share it; PersonalInformation.tsx re-exports it.
 */

import type { PersonalInformation } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { field } from './fields'

/**
 * EN: "Lucian LI, Yanpei" (preferred name + upper-cased family name, given
 * name); ZH: family + given name ("李彦霈") with the preferred name as a
 * quiet aside. Hidden name parts are simply absent.
 */
export function composeName(data: Partial<PersonalInformation> | unknown, lang: CvLang): { main: string; aside: string } {
  const first = field(data, 'firstName')
  const last = field(data, 'lastName')
  const nick = field(data, 'nickName')
  if (lang === 'zh') {
    // Chinese order: family name + given name, preferred name as a quiet aside.
    return { main: `${last}${first}`, aside: nick }
  }
  const lead = [nick, last.toUpperCase()].filter(Boolean).join(' ')
  return { main: [lead, first].filter(Boolean).join(', '), aside: '' }
}

/** The public Chinese name ("李彦霈") from the Chinese CV's personal information; '' when hidden or unset. */
export function publicNameZh(zhSections: ReadonlyArray<{ sessionName?: string }> | null | undefined): string {
  const info = (zhSections || []).find((s) => s?.sessionName === 'personalInformation')
  return info ? composeName(info, 'zh').main : ''
}
