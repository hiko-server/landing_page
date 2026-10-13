/**
 * The CV's "Updated <month year>" marker — on /cv, /cv/zh and in every
 * downloadable file. Client-safe and pure.
 */

import type { CvLang } from '../cvVisibility'

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 'YYYY-MM' of an epoch-ms timestamp in Hong Kong time ('' for 0 / invalid). */
export function monthOf(updatedAt: number | null | undefined, timeZone = 'Asia/Hong_Kong'): string {
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) return ''
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(updatedAt))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return y && m ? `${y}-${m}` : ''
}

/** "October 2026" / "2026 年 10 月" for a 'YYYY-MM'; '' for anything else. */
export function monthLabel(month: string, lang: CvLang): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month || '')
  if (!m) return ''
  return lang === 'zh' ? `${m[1]} 年 ${Number(m[2])} 月` : `${MONTHS_EN[Number(m[2]) - 1]} ${m[1]}`
}

/** "Updated October 2026" / "更新于 2026 年 10 月"; '' when the month is unknown. */
export function updatedLabel(month: string, lang: CvLang): string {
  const label = monthLabel(month, lang)
  if (!label) return ''
  return lang === 'zh' ? `更新于 ${label}` : `Updated ${label}`
}
