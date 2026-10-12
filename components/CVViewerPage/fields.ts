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
import { cleanList, cvLabels, formatCvDate, formatCvRange, formatGraduation, isFuture, isPresent } from '../../lib/cvFormat'

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
 * end alone.
 */
export function entryRange(
  node: unknown,
  lang: CvLang,
  opts: { futureEndAsPresent?: boolean; startKey?: string; endKey?: string } = {},
): string {
  const start = field(node, opts.startKey || 'startDate')
  const end = field(node, opts.endKey || 'endDate')
  return formatCvRange(start, end, lang, { futureEndAsPresent: opts.futureEndAsPresent })
}

/** Graduation line of a degree ("Expected Jun 2026"); '' when the end date is hidden. */
export function graduation(node: unknown, lang: CvLang): string {
  return formatGraduation(field(node, 'endDate'), lang)
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
export function entryStatus(node: unknown, now: Date = new Date()): EntryStatus {
  const end = field(node, 'endDate')
  if (!end) return 'unknown'
  if (!isPresent(end) && !isFuture(end, now)) return 'past'
  const start = field(node, 'startDate')
  return start && isFuture(start, now) ? 'upcoming' : 'current'
}
