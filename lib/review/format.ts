import { uiLangOf } from '../uiStrings'
import { formatSiteTime, zonedParts } from '../schedule/time'

/**
 * A review link's times for its reader (H5): computed on the server in
 * Hong Kong time and sent as text, so the page reads the same in every
 * browser and hydrates without a mismatch. English "Sun 1 Nov 2026, 09:00
 * HKT"; Chinese "2026年11月1日 09:00（香港时间）". Pure.
 */
export function formatReviewTime(ms: number, lang: string | null | undefined): string {
  const ui = uiLangOf(lang)
  if (ui === 'en') return formatSiteTime(ms)
  const { date, time } = zonedParts(ms)
  const [y, m, d] = date.split('-').map(Number)
  return `${y}年${m}月${d}日 ${time}（${ui === 'zh-Hant' ? '香港時間' : '香港时间'}）`
}

/** The interface language a reader asked for (Accept-Language), for pages without an article. */
export function acceptLanguageUi(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header.join(',') : header || ''
  const ranked = raw
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      return { tag: tag.trim(), q: q ? Number(q.slice(2)) : 1 }
    })
    .filter((x) => x.tag && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q)
  return ranked[0]?.tag || 'en'
}
