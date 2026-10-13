import type { CvLang } from '../../lib/cvVisibility'
import { formatCvDate } from '../../lib/cvFormat'
import { CV_EXTRAS_LABELS, type CvHeaderExtras } from '../../lib/cvLocale'

/** One labelled header line of the CV (A4 sheet, Reading view). */
export type ExtrasLine = { key: 'jobIntent' | 'workStatus'; label: string; value: string }

/**
 * The CV header lines from the owner's availability, in order; [] when there
 * is nothing to show. Pure (unit-tested; components/CVViewerPage/HeaderExtras
 * renders them).
 *
 *   求职意向：前端工程师、全栈工程师 ｜ 意向城市：香港 ｜ 到岗时间：2027.01
 *   工作身份：…
 */
export function extrasLines(extras: CvHeaderExtras | null | undefined, lang: CvLang): ExtrasLine[] {
  if (!extras) return []
  const L = CV_EXTRAS_LABELS[lang]
  const sep = lang === 'zh' ? '：' : ': '
  const lines: ExtrasLine[] = []
  const intent = extras.jobIntent
  if (intent) {
    const parts = [
      intent.roles.join(lang === 'zh' ? '、' : ', '),
      intent.city ? `${L.city}${sep}${intent.city}` : '',
      intent.from ? `${L.from}${sep}${formatCvDate(intent.from, lang)}` : '',
    ].filter(Boolean)
    if (parts.length) lines.push({ key: 'jobIntent', label: L.jobIntent, value: parts.join(lang === 'zh' ? ' ｜ ' : ' | ') })
  }
  if (extras.workStatus) lines.push({ key: 'workStatus', label: L.workStatus, value: extras.workStatus })
  return lines
}
