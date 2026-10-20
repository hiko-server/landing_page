/**
 * Structured contact inquiries — pure and client-safe (the contact form, the
 * contact API, the admin Inbox and the Home editor share it; unit-tested).
 *
 * The visitor picks one of the owner's reasons ("Hiring", "Project Inquiry",
 * …). Each reason maps to an INTENT, and the intent decides which optional
 * structured fields the form discloses:
 *
 *   role       company · job posting link · ideal start
 *   freelance  company  · brief link       · timeline
 *   collab     organisation · link
 *   other      nothing extra
 *
 * Reasons are owner-editable, so the mapping is explicit
 * (`home.contact.intents`, reason label → intent) — never a guess from the
 * label's wording. Without a custom reason list the built-in reasons use
 * DEFAULT_REASON_INTENTS.
 *
 * Links are https only, length-capped and never fetched by the server; they
 * are only shown to the owner in the Inbox (as a nofollow link).
 */

import { isHttpsUrl } from './url'
import { INQUIRY_INTENTS, cleanIntentMap, isInquiryIntent, type InquiryIntent } from './homeShape'

export { INQUIRY_INTENTS, cleanIntentMap, isInquiryIntent, type InquiryIntent }

export const INQUIRY_TIMELINES = ['asap', 'within-1m', '1-3m', '3m-plus', 'flexible'] as const
export type InquiryTimeline = (typeof INQUIRY_TIMELINES)[number]

export type InquiryField = 'company' | 'roleUrl' | 'timeline'

/**
 * Server-side caps (the form uses the same values as maxLength).
 *
 * A link is capped twice: `roleUrlMax` on what the visitor typed or pasted,
 * and `roleUrlStoredMax` on its normalised form — what is e-mailed and kept
 * in the Inbox. Normalising percent-encodes non-ASCII characters (one Chinese
 * character becomes nine), so a 102-character job link can store as 534
 * characters; the stored cap leaves room for that, and checkRoleUrl refuses
 * a link whose normalised form would not fit, so whatever normalizeInquiry
 * accepts is always kept by parseInquiryMeta.
 */
export const INQUIRY_LIMITS = {
  reasonMax: 80,
  companyMax: 120,
  roleUrlMax: 500,
  roleUrlStoredMax: 2048,
} as const

/** What is stored with an Inbox message (every key optional; older messages have none). */
export type InquiryMeta = {
  reason?: string
  intent?: InquiryIntent
  company?: string
  roleUrl?: string
  timeline?: InquiryTimeline
}

/** The contact form's built-in reasons (used while the owner has not set a custom list). */
export const DEFAULT_REASONS: readonly string[] = ['Project Inquiry', 'Hiring', 'Collaboration', 'Consulting', 'Mentorship', 'Other']

/** Intent of each built-in reason. */
export const DEFAULT_REASON_INTENTS: Readonly<Record<string, InquiryIntent>> = {
  'Project Inquiry': 'freelance',
  Hiring: 'role',
  Collaboration: 'collab',
  Consulting: 'freelance',
  Mentorship: 'other',
  Other: 'other',
}

export const INTENT_LABEL: Record<InquiryIntent, string> = {
  role: 'Role / hiring',
  freelance: 'Freelance project',
  collab: 'Collaboration',
  other: 'Other',
}

export const TIMELINE_LABEL: Record<InquiryTimeline, string> = {
  asap: 'As soon as possible',
  'within-1m': 'Within a month',
  '1-3m': 'In 1–3 months',
  '3m-plus': 'In 3 months or later',
  flexible: 'Flexible / not sure yet',
}

/** Structured fields disclosed for each intent, in form order. */
export const INTENT_FIELDS: Record<InquiryIntent, readonly InquiryField[]> = {
  role: ['company', 'roleUrl', 'timeline'],
  freelance: ['company', 'roleUrl', 'timeline'],
  collab: ['company', 'roleUrl'],
  other: [],
}

type FieldCopy = { label: string; placeholder?: string }

/** Visible labels of the structured fields per intent (the Inbox uses the same words). */
export const INTENT_FIELD_COPY: Record<Exclude<InquiryIntent, 'other'>, Record<InquiryField, FieldCopy>> = {
  role: {
    company: { label: 'Company', placeholder: 'Who is hiring' },
    roleUrl: { label: 'Job posting link', placeholder: 'https://…' },
    timeline: { label: 'Ideal start' },
  },
  freelance: {
    company: { label: 'Company or organisation', placeholder: 'Who the project is for' },
    roleUrl: { label: 'Brief or project link', placeholder: 'https://…' },
    timeline: { label: 'Timeline' },
  },
  collab: {
    company: { label: 'Organisation or project', placeholder: 'Who you are working with' },
    roleUrl: { label: 'Link', placeholder: 'https://…' },
    timeline: { label: 'Timeline' },
  },
}

export function isInquiryTimeline(v: unknown): v is InquiryTimeline {
  return typeof v === 'string' && (INQUIRY_TIMELINES as readonly string[]).includes(v)
}

type ContactCopy = { reasons?: unknown; intents?: unknown } | null | undefined

const cleanReason = (r: unknown) => (typeof r === 'string' ? r.trim() : '')

/** The reasons the form offers: the owner's non-blank list, or the built-in one. */
export function reasonsOf(contact: ContactCopy): string[] {
  const own = Array.isArray(contact?.reasons) ? contact.reasons.map(cleanReason).filter(Boolean) : []
  return own.length ? Array.from(new Set(own)) : [...DEFAULT_REASONS]
}

/** True when the owner has a custom reason list (the explicit mapping applies). */
export function hasCustomReasons(contact: ContactCopy): boolean {
  return Array.isArray(contact?.reasons) && contact.reasons.some((r) => cleanReason(r))
}

/**
 * Intent of a reason: the owner's explicit mapping for a custom list (absent
 * → 'other'), the built-in mapping for the built-in list.
 */
export function intentOf(reason: string, contact: ContactCopy): InquiryIntent {
  const key = cleanReason(reason)
  if (!key) return 'other'
  if (hasCustomReasons(contact)) {
    const map = contact?.intents
    const v = map && typeof map === 'object' && !Array.isArray(map) ? (map as Record<string, unknown>)[key] : undefined
    return isInquiryIntent(v) ? v : 'other'
  }
  return DEFAULT_REASON_INTENTS[key] ?? 'other'
}

/** Strip CR/LF (mail-header injection), collapse whitespace, cap. */
export function cleanLine(v: unknown, max: number): string {
  return String(typeof v === 'string' ? v : '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

export type InquiryInput = {
  reason?: unknown
  intent?: unknown
  company?: unknown
  roleUrl?: unknown
  timeline?: unknown
}

export type InquiryResult = { ok: true; meta: InquiryMeta } | { ok: false; field: InquiryField; error: string }

export const ROLE_URL_ERROR = 'The link must be a full https:// address.'
export const ROLE_URL_TOO_LONG = 'This link is too long — paste a shorter link to the same page.'

/**
 * Check a typed link (form and API share it): too long as typed or once
 * normalised → ROLE_URL_TOO_LONG; not a plain https URL → ROLE_URL_ERROR;
 * otherwise the normalised href that is sent and stored.
 */
export function checkRoleUrl(value: string): { ok: true; href: string } | { ok: false; error: string } {
  const raw = value.trim()
  if (raw.length > INQUIRY_LIMITS.roleUrlMax) return { ok: false, error: ROLE_URL_TOO_LONG }
  if (!isHttpsUrl(raw)) return { ok: false, error: ROLE_URL_ERROR }
  const href = new URL(raw).toString()
  if (href.length > INQUIRY_LIMITS.roleUrlStoredMax) return { ok: false, error: ROLE_URL_TOO_LONG }
  return { ok: true, href }
}

/**
 * Validate and normalise the structured part of a contact submission.
 * Unknown intents count as 'other'; fields the intent does not disclose are
 * dropped; an unknown timeline is dropped; a link that is not a plain https
 * URL, or is too long (checkRoleUrl), is refused (the visitor can fix it).
 */
export function normalizeInquiry(input: InquiryInput): InquiryResult {
  const meta: InquiryMeta = {}
  const reason = cleanLine(input.reason, INQUIRY_LIMITS.reasonMax)
  if (reason) meta.reason = reason
  const intent: InquiryIntent = isInquiryIntent(input.intent) ? input.intent : 'other'
  if (isInquiryIntent(input.intent)) meta.intent = intent
  const allowed = new Set(INTENT_FIELDS[intent])
  if (allowed.has('company')) {
    const company = cleanLine(input.company, INQUIRY_LIMITS.companyMax)
    if (company) meta.company = company
  }
  if (allowed.has('roleUrl')) {
    const raw = typeof input.roleUrl === 'string' ? input.roleUrl.trim() : ''
    if (raw) {
      const link = checkRoleUrl(raw)
      if (!link.ok) return { ok: false, field: 'roleUrl', error: link.error }
      meta.roleUrl = link.href
    }
  }
  if (allowed.has('timeline') && isInquiryTimeline(input.timeline)) meta.timeline = input.timeline
  return { ok: true, meta }
}

/** Defensive read of a stored `meta` object (Inbox lines are data from disk). */
export function parseInquiryMeta(raw: unknown): InquiryMeta | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const meta: InquiryMeta = {}
  const reason = cleanLine(o.reason, INQUIRY_LIMITS.reasonMax)
  if (reason) meta.reason = reason
  if (isInquiryIntent(o.intent)) meta.intent = o.intent
  const company = cleanLine(o.company, INQUIRY_LIMITS.companyMax)
  if (company) meta.company = company
  if (typeof o.roleUrl === 'string' && o.roleUrl.length <= INQUIRY_LIMITS.roleUrlStoredMax && isHttpsUrl(o.roleUrl)) meta.roleUrl = o.roleUrl
  if (isInquiryTimeline(o.timeline)) meta.timeline = o.timeline
  return Object.keys(meta).length ? meta : undefined
}

/** "adds company, job posting link and ideal start" — what a kind adds to the form (Home editor). */
export function intentFieldsSummary(intent: InquiryIntent): string {
  if (intent === 'other') return 'no extra fields'
  const labels = INTENT_FIELDS[intent].map((f) => INTENT_FIELD_COPY[intent][f].label.toLowerCase())
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}` : labels[0]
  return `adds ${list}`
}

/** Label of a structured field for the given intent ('other' falls back to the role wording). */
export function fieldLabel(intent: InquiryIntent | undefined, field: InquiryField): string {
  const copy = INTENT_FIELD_COPY[intent && intent !== 'other' ? intent : 'role']
  return copy[field].label
}

/** "Label: value" rows of an inquiry, in form order (e-mail body, Inbox card). */
export function inquiryRows(meta: InquiryMeta | undefined): Array<{ key: keyof InquiryMeta; label: string; value: string }> {
  if (!meta) return []
  const rows: Array<{ key: keyof InquiryMeta; label: string; value: string }> = []
  if (meta.reason) rows.push({ key: 'reason', label: 'Reason', value: meta.reason })
  if (meta.intent) rows.push({ key: 'intent', label: 'Kind', value: INTENT_LABEL[meta.intent] })
  if (meta.company) rows.push({ key: 'company', label: fieldLabel(meta.intent, 'company'), value: meta.company })
  if (meta.roleUrl) rows.push({ key: 'roleUrl', label: fieldLabel(meta.intent, 'roleUrl'), value: meta.roleUrl })
  if (meta.timeline) rows.push({ key: 'timeline', label: fieldLabel(meta.intent, 'timeline'), value: TIMELINE_LABEL[meta.timeline] })
  return rows
}
