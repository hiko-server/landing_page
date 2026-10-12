/**
 * Language-aware CV date + label formatting, shared by the A4 sheet (/cv,
 * print/PDF, Studio preview) and the /about accordion.
 *
 * Accepts the loose date strings already stored in cvdata: "2024", "2024-09",
 * "2024-09-01", "2024/9", "2024.09" — plus open-ended markers ("now",
 * "present", "至今"). Anything unparseable is shown verbatim instead of
 * printing "Invalid DateTime".
 */

import type { CvLang } from './cvVisibility'

const PRESENT_MARKERS = new Set(['now', 'present', 'current', 'ongoing', 'today', '至今', '现在', '今'])

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function isPresent(value: unknown): boolean {
  return typeof value === 'string' && PRESENT_MARKERS.has(value.trim().toLowerCase())
}

type Ym = { y: number; m: number | null }

export function parseCvDate(value: unknown): Ym | null {
  if (typeof value !== 'string') return null
  const m = value.trim().match(/^(\d{4})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?/)
  if (!m) return null
  const y = Number(m[1])
  const mo = m[2] ? Number(m[2]) : null
  if (mo !== null && (mo < 1 || mo > 12)) return { y, m: null }
  return { y, m: mo }
}

/** True when the date lies after the current month (e.g. an expected graduation). */
export function isFuture(value: unknown, now = new Date()): boolean {
  const d = parseCvDate(value)
  if (!d) return false
  const cur = now.getFullYear() * 12 + now.getMonth()
  const val = d.y * 12 + ((d.m ?? 12) - 1)
  return val > cur
}

export const CV_LABELS = {
  en: {
    present: 'Present',
    expected: 'Expected',
    noExpiry: 'No Expiry',
    gpa: 'GPA',
    major: 'Major',
    phone: 'M',
    email: 'E',
    at: 'at',
    credentialId: 'Credential ID',
    viewCredential: 'View Credential',
    status: 'Status',
    authority: 'Authority',
    languages: 'Languages',
    technical: 'Technical',
    entries: 'ENTRIES',
    items: 'ITEMS',
  },
  zh: {
    present: '至今',
    expected: '预计',
    noExpiry: '长期有效',
    gpa: 'GPA',
    major: '专业',
    phone: '电话',
    email: '邮箱',
    at: '·',
    credentialId: '证书编号',
    viewCredential: '查看证书',
    status: '状态',
    authority: '受理机构',
    languages: '语言',
    technical: '技术',
    entries: '项',
    items: '项',
  },
} as const

export type CvLabels = (typeof CV_LABELS)[CvLang]

export function cvLabels(lang: CvLang = 'en'): CvLabels {
  return CV_LABELS[lang] || CV_LABELS.en
}

/** "Sep 2024" (en) / "2024.09" (zh); year-only stays "2024"; open-ended → Present / 至今. */
export function formatCvDate(value: unknown, lang: CvLang = 'en'): string {
  if (value == null) return ''
  if (isPresent(value)) return cvLabels(lang).present
  const d = parseCvDate(value)
  if (!d) return typeof value === 'string' ? value.trim() : ''
  if (d.m == null) return String(d.y)
  return lang === 'zh' ? `${d.y}.${String(d.m).padStart(2, '0')}` : `${MONTHS_EN[d.m - 1]} ${d.y}`
}

/**
 * "Sep 2024 – Jun 2026". A missing start collapses to the end date; a missing
 * end collapses to the start. `futureEndAsPresent` renders a future end date
 * as "Present" (projects / jobs still running), otherwise the date is kept.
 */
export function formatCvRange(
  start: unknown,
  end: unknown,
  lang: CvLang = 'en',
  opts: { futureEndAsPresent?: boolean } = {},
): string {
  const s = formatCvDate(start, lang)
  const e = opts.futureEndAsPresent && isFuture(end) ? cvLabels(lang).present : formatCvDate(end, lang)
  if (s && e) return s === e ? s : `${s} – ${e}`
  return s || e
}

/** "Expected Jun 2026" for a future graduation date, else the plain date. */
export function formatGraduation(end: unknown, lang: CvLang = 'en'): string {
  const e = formatCvDate(end, lang)
  if (!e) return ''
  return isFuture(end) ? `${cvLabels(lang).expected} ${e}` : e
}

/** Strip protocol / trailing slash for display ("https://a.com/" → "a.com"). */
export function displayUrl(url: unknown): string {
  if (typeof url !== 'string') return ''
  return url.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/** Ensure an href has a protocol; stored values are often bare ("hiko.dev"). */
export function hrefOf(url: unknown): string {
  if (typeof url !== 'string' || !url.trim()) return ''
  const u = url.trim()
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

/**
 * Href for admin-supplied links rendered on public pages. Allows only
 * http(s), mailto: and tel: (plus same-site paths starting with a single
 * "/"); bare domains get https://. Anything else — javascript:, data:,
 * vbscript:, protocol-relative "//evil" — yields '' so callers render text
 * instead of a link.
 */
export function safeHref(url: unknown): string {
  if (typeof url !== 'string') return ''
  const u = url.trim()
  if (!u) return ''
  if (/^\/(?!\/)/.test(u)) return u
  if (/^(mailto|tel):/i.test(u)) return u
  if (/^https?:\/\//i.test(u)) return u
  // Any other explicit scheme (javascript:, data:, …) or protocol-relative URL is refused.
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return ''
  // Bare domain ("lucian-dev.com/x"): must look like a host.
  return /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(u) ? `https://${u}` : ''
}

/** Drop empty / whitespace-only strings from a bullet list. */
export function cleanList(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
}

/** Show `major` only when it adds information the degree title doesn't already carry. */
export function majorAddsInfo(degree: unknown, major: unknown): boolean {
  if (typeof major !== 'string' || !major.trim()) return false
  if (typeof degree !== 'string' || !degree.trim()) return true
  return !degree.toLowerCase().includes(major.trim().toLowerCase())
}
