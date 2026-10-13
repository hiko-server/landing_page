/**
 * CV localisation extras — pure and client-safe (unit-tested). The hook
 * points every CV output uses: the A4 sheet and the Reading view on /cv and
 * /cv/zh, and the server-generated PDFs.
 *
 *   cvHeaderExtras(availability, lang)
 *     The header lines that come from the owner's availability (Home editor):
 *       - 'en': the right-to-work line (workStatus)
 *       - 'zh': the right-to-work line (workStatus_zh) and the job intent
 *         (求职意向: roles_zh · city_zh · `from` as 到岗时间) — the job intent
 *         only while the status is open / limited.
 *     Only owner-entered text, nothing derived; null when there is nothing
 *     to show. Never part of JSON-LD or the vCard.
 *
 *   pdfPhoto(fullSections)
 *     The photo a language's PDF may print: personalInformation.photo when
 *     its `photoOnPdf` switch is on (off by default) and the section is on
 *     the CV. Pass the FULL editor document of that language
 *     (lib/cvdata readCvData) — the public views never contain the photo
 *     (lib/cvVisibility PRIVATE_SECTION_FIELDS), so the website, search
 *     index, JSON-LD and vCard cannot show it.
 */

import type { CvLang } from './cvVisibility'
import { isCvImageRef } from './url'

export type CvJobIntent = {
  /** Target roles, in the CV's language. */
  roles: string[]
  city: string
  /** 'YYYY-MM' the owner can start, or ''. */
  from: string
}

export type CvHeaderExtras = {
  /** The owner's right-to-work line in this language. */
  workStatus?: string
  /** 求职意向 — Chinese CV only. */
  jobIntent?: CvJobIntent
}

type AvailabilityLike = {
  status?: unknown
  from?: unknown
  roles_zh?: unknown
  city_zh?: unknown
  workStatus?: unknown
  workStatus_zh?: unknown
} | null | undefined

const STATUSES = new Set(['open', 'limited', 'closed'])
const line = (v: unknown) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim() : '')

export function cvHeaderExtras(availability: AvailabilityLike, lang: CvLang): CvHeaderExtras | null {
  if (!availability || !STATUSES.has(String(availability.status))) return null
  const out: CvHeaderExtras = {}
  const workStatus = line(lang === 'zh' ? availability.workStatus_zh : availability.workStatus)
  if (workStatus) out.workStatus = workStatus
  if (lang === 'zh' && availability.status !== 'closed') {
    const roles = Array.isArray(availability.roles_zh) ? Array.from(new Set(availability.roles_zh.map(line).filter(Boolean))) : []
    const city = line(availability.city_zh)
    const fromMatch = /^(\d{4}-(0[1-9]|1[0-2]))/.exec(line(availability.from))
    const from = fromMatch ? fromMatch[1] : ''
    // A start date alone is not a job intent: roles or a city must be set.
    if (roles.length || city) out.jobIntent = { roles, city, from }
  }
  return out.workStatus || out.jobIntent ? out : null
}

/** Labels of the header lines per language. */
export const CV_EXTRAS_LABELS = {
  en: { workStatus: 'Work authorisation', jobIntent: 'Job intent', roles: 'Roles', city: 'City', from: 'Available from' },
  zh: { workStatus: '工作身份', jobIntent: '求职意向', roles: '意向岗位', city: '意向城市', from: '到岗时间' },
} as const

type SectionLike = { sessionName?: unknown; isVisible?: unknown; [k: string]: unknown }

/** The photo URL a language's PDF may print, or null (see the module comment). */
export function pdfPhoto(fullSections: readonly unknown[] | null | undefined): string | null {
  const info = (Array.isArray(fullSections) ? fullSections : []).find(
    (s): s is SectionLike => !!s && typeof s === 'object' && (s as SectionLike).sessionName === 'personalInformation',
  )
  if (!info || info.isVisible === false || info.photoOnPdf !== true) return null
  const photo = typeof info.photo === 'string' ? info.photo.trim() : ''
  return photo && isCvImageRef(photo) ? photo : null
}
