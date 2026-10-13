/**
 * Visibility-aware field access for every CV renderer (A4 sheet, the mobile
 * Reading view, /now). Pure, so it is unit-tested and runs on server + client.
 *
 * The A4 sheet normally receives pruned public data, where a hidden field is
 * blank AND listed in `redacted`. It can also receive an editor document
 * (hiddenFields metadata still present). isRedacted() covers both, so every
 * accessor here treats "the owner hid this" as empty — and, crucially, the
 * date helpers never turn a hidden date into "Present" / "No Expiry".
 */

import { hiddenIndices, isRedacted, type CvLang } from '../../lib/cvVisibility'
import { cleanList, cvLabels, formatCvDate, formatCvRange, formatGraduation, isFuture, isPresent, type CvNow } from '../../lib/cvFormat'

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Trimmed string at node[key]; '' when hidden by the owner or not a string. */
export function field(node: unknown, key: string): string {
  if (!isObject(node) || isRedacted(node, key)) return ''
  const v = node[key]
  return typeof v === 'string' ? v.trim() : ''
}

/** Objects of a list that are not switched off (pruned lists pass through unchanged). */
export function entries<T>(list: readonly T[] | null | undefined): T[] {
  return Array.isArray(list) ? list.filter((x) => isObject(x) && (x as any).isVisible !== false) : []
}

/** Visible objects of the list at node[key]; [] when the whole field is hidden. */
export function list<T = any>(node: unknown, key: string): T[] {
  if (!isObject(node) || isRedacted(node, key)) return []
  return entries(node[key] as T[] | undefined)
}

/** Non-blank string bullets at node[key], minus hidden indices; [] when the field is hidden. */
export function bullets(node: unknown, key: string): string[] {
  if (!isObject(node) || isRedacted(node, key)) return []
  const list = node[key]
  if (!Array.isArray(list)) return []
  const skip = new Set(hiddenIndices(node, key))
  return cleanList(skip.size ? list.filter((_, i) => !skip.has(i)) : list).map((s) => s.trim())
}

/** Join the non-empty parts with `sep` — no orphan separators. */
export function joinParts(parts: ReadonlyArray<string | null | undefined | false>, sep: string): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '').join(sep)
}

/** "Label: value" (EN) / "标签：值" (ZH), or '' when the value is empty. */
export function labelled(label: string, value: string, lang: CvLang): string {
  return value ? `${label}${lang === 'zh' ? '：' : ': '}${value}` : ''
}

/**
 * Date range of an entry. A hidden start or end is simply absent: a hidden
 * end date shows the start alone (never "Present"); a hidden start shows the
 * end alone. Pass `now` (the page's reference month, lib/clock.ts) whenever
 * `futureEndAsPresent` is set, so server and client agree.
 */
export function entryRange(
  node: unknown,
  lang: CvLang,
  opts: { futureEndAsPresent?: boolean; startKey?: string; endKey?: string; now?: CvNow } = {},
): string {
  const start = field(node, opts.startKey || 'startDate')
  const end = field(node, opts.endKey || 'endDate')
  return formatCvRange(start, end, lang, { futureEndAsPresent: opts.futureEndAsPresent, now: opts.now })
}

/** Graduation line of a degree ("Expected Jun 2026"); '' when the end date is hidden. */
export function graduation(node: unknown, lang: CvLang, now?: CvNow): string {
  return formatGraduation(field(node, 'endDate'), lang, now)
}

const EXPIRES = { en: 'Expires', zh: '有效期至' } as const

/**
 * Validity of a certificate:
 *   issued + expiry       → "Dec 2024 – Dec 2027"
 *   issued, no expiry     → "Dec 2024 – No Expiry" (only when the expiry is genuinely empty)
 *   issued, expiry hidden → "Dec 2024"
 *   expiry only           → "Expires Dec 2027"
 */
export function certificateValidity(cert: unknown, lang: CvLang): string {
  const issued = formatCvDate(field(cert, 'issuedDate'), lang)
  const expiry = formatCvDate(field(cert, 'expirationDate'), lang)
  if (issued && expiry) return `${issued} – ${expiry}`
  if (issued) return isRedacted(cert, 'expirationDate') ? issued : `${issued} – ${cvLabels(lang).noExpiry}`
  if (expiry) return `${EXPIRES[lang] || EXPIRES.en} ${expiry}`
  return ''
}

export type EntryStatus = 'current' | 'upcoming' | 'past' | 'unknown'

/**
 * Where an entry sits in time, from the dates the visitor can see. A hidden
 * (or missing) end date is 'unknown' — it must never make an old role look
 * current.
 */
export function entryStatus(node: unknown, now: CvNow = new Date()): EntryStatus {
  const end = field(node, 'endDate')
  if (!end) return 'unknown'
  if (!isPresent(end) && !isFuture(end, now)) return 'past'
  const start = field(node, 'startDate')
  return start && isFuture(start, now) ? 'upcoming' : 'current'
}

// ── Stable anchors (/cv#cv-workExperience-0) ─────────────────────────────
// Search results and the command palette link to CV sections and entries.
// The index is the entry's position in the public (pruned) list of visible
// entries — `list(section, key)` — before any renderer-specific filtering,
// so the same entry has the same anchor on the A4 sheet and in the Reading
// view. Certifications count across all visible issuers in order.

/** Anchor id of a CV section: `cv-<sessionName>`. */
export function cvSectionAnchor(sessionName: string): string {
  return `cv-${sessionName}`
}

/** Anchor id of a CV entry: `cv-<sessionName>-<index>`. */
export function cvEntryAnchor(sessionName: string, index: number): string {
  return `cv-${sessionName}-${index}`
}

/** Visible entries of node[key] paired with their anchor index. */
export function indexedList<T = any>(node: unknown, key: string): Array<{ item: T; index: number }> {
  return list<T>(node, key).map((item, index) => ({ item, index }))
}

/** Every visible certificate across the visible issuers, with its anchor index. */
export function indexedCertificates(section: unknown): Array<{ org: any; cert: any; index: number }> {
  return list(section, 'certifications')
    .flatMap((org) => list<any>(org, 'CertificationList').map((cert) => ({ org, cert })))
    .map((row, index) => ({ ...row, index }))
}

// ── /cv and /cv/zh SEO copy ──────────────────────────────────────────────
// Descriptions name only sections that actually have public content, in a
// fixed order, so the meta description never promises a hidden section.

/** Sections the descriptions mention, in mention order, with the list that holds their entries. */
const SEO_SECTIONS: ReadonlyArray<{ name: string; keys: readonly string[]; en: string; zh: string }> = [
  { name: 'education', keys: ['educationExperience'], en: 'education', zh: '教育' },
  { name: 'workExperience', keys: ['experiences'], en: 'experience', zh: '工作经历' },
  { name: 'project', keys: ['projectExperience'], en: 'projects', zh: '项目' },
  { name: 'patents', keys: ['patentExperience'], en: 'patents', zh: '专利' },
  { name: 'competitionAwards', keys: ['awards'], en: 'awards', zh: '奖项' },
  { name: 'certification', keys: ['certifications'], en: 'certifications', zh: '证书' },
]

/** sessionNames (from SEO_SECTIONS) that have at least one visible entry in these public sections. */
export function publicSeoSections(sections: readonly unknown[] | null | undefined): string[] {
  const all = Array.isArray(sections) ? sections : []
  return SEO_SECTIONS.filter(({ name, keys }) => {
    const section = all.find((s) => isObject(s) && s.sessionName === name && s.isVisible !== false)
    return !!section && keys.some((k) => list(section, k).length > 0)
  }).map((s) => s.name)
}

function enumerate(items: string[], lang: CvLang): string {
  if (items.length <= 1) return items.join('')
  if (lang === 'zh') return `${items.slice(0, -1).join('、')}与${items[items.length - 1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * Meta description of the CV page in its language, from the public section
 * names present (publicSeoSections) and the public Chinese name (zh only).
 */
export function cvDescription(lang: CvLang, opts: { present: readonly string[]; nameZh?: string }): string {
  const parts = SEO_SECTIONS.filter((s) => opts.present.includes(s.name)).map((s) => (lang === 'zh' ? s.zh : s.en))
  if (lang === 'zh') {
    const who = opts.nameZh ? `${opts.nameZh}（Lucian）` : 'Li Yanpei（Lucian）'
    return parts.length
      ? `${who}的中文简历：${enumerate(parts, 'zh')}，可打印为 A4 PDF。`
      : `${who}的中文简历，可打印为 A4 PDF。`
  }
  return parts.length
    ? `The CV / résumé of Li Yanpei (Lucian) in English and Chinese: ${enumerate(parts, 'en')}, printable as an A4 PDF.`
    : 'The CV / résumé of Li Yanpei (Lucian) in English and Chinese, printable as an A4 PDF.'
}
