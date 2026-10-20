/**
 * Contact page logic — pure, shared by ContactPro, AvailabilityCard and their
 * unit tests.
 *
 * Form validation mirrors what POST /api/contact enforces (name, a well-formed email, a
 * subject — the chosen reason stands in when the subject is blank — and a
 * message) plus the client-side human check, so a form the UI lets through
 * is one the server accepts.
 *
 * Every message is in the page's language: the functions take the page's
 * words (lib/uiStrings/contact — /zh/contact passes the Chinese ones, F3)
 * and default to English.
 */

import { INTENT_FIELDS, ROLE_URL_TOO_LONG, checkRoleUrl, type InquiryIntent, type InquiryTimeline } from '../../lib/inquiry'
import { retentionPeriodIn } from '../../lib/retention'
import { fillUi } from '../../lib/uiStrings'
import { CONTACT_EN, type ContactStrings } from '../../lib/uiStrings/contact-en'

export const MESSAGE_MAX = 5000

/** Same pattern the API uses to reject malformed addresses. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ContactField = 'name' | 'email' | 'subject' | 'roleUrl' | 'message' | 'mathAnswer'

export type ContactValues = {
  name: string
  email: string
  reason: string
  subject: string
  message: string
  mathAnswer: string
  /** Structured inquiry fields (lib/inquiry.ts) — only the ones the reason's intent discloses are sent. */
  company: string
  roleUrl: string
  timeline: InquiryTimeline | ''
}

export const EMPTY_INQUIRY = { company: '', roleUrl: '', timeline: '' } as const

export type ContactErrors = Partial<Record<ContactField, string>>

/** Order in which problems are listed in the submit hint (= visual order). */
export const FIELD_ORDER: readonly ContactField[] = ['name', 'email', 'subject', 'roleUrl', 'message', 'mathAnswer']

/**
 * @param expectedMath the human-check sum, or null while it is not generated yet
 *                     (the form cannot be valid until it is).
 * @param intent       the chosen reason's intent; its disclosed fields are checked
 *                     ('other' / omitted: none).
 * @param t            the page's words (lib/uiStrings/contact; English by default).
 */
export function validateContact(v: ContactValues, expectedMath: number | null, intent: InquiryIntent = 'other', t: ContactStrings = CONTACT_EN): ContactErrors {
  const errors: ContactErrors = {}
  const e = t.errors
  if (!v.name.trim()) errors.name = e.name
  const email = v.email.trim()
  if (!email) errors.email = e.emailMissing
  else if (!EMAIL_RE.test(email)) errors.email = e.emailBad
  if (!v.subject.trim() && !v.reason.trim()) errors.subject = e.subject
  const link = (v.roleUrl || '').trim()
  if (INTENT_FIELDS[intent].includes('roleUrl') && link) {
    const checked = checkRoleUrl(link)
    if (!checked.ok) errors.roleUrl = checked.error === ROLE_URL_TOO_LONG ? e.linkLong : e.link
  }
  if (!v.message.trim()) errors.message = e.message
  else if (v.message.length > MESSAGE_MAX) errors.message = fillUi(e.messageLong, { max: MESSAGE_MAX.toLocaleString('en-US') })
  if (expectedMath === null) errors.mathAnswer = e.mathLoading
  else if (!v.mathAnswer.trim()) errors.mathAnswer = e.mathMissing
  else if (v.mathAnswer.trim() !== String(expectedMath)) errors.mathAnswer = e.mathWrong
  return errors
}

export function isContactValid(errors: ContactErrors): boolean {
  return FIELD_ORDER.every((f) => !errors[f])
}

/** "Add your name and a message to send." ("请填写姓名和留言后再发送。") — explains why Send is disabled. */
export function submitHint(errors: ContactErrors, t: ContactStrings = CONTACT_EN): string {
  const { labels, sep, and, template } = t.hint
  const missing = FIELD_ORDER.filter((f) => errors[f]).map((f) => labels[f])
  if (!missing.length) return ''
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(sep)}${and}${missing[missing.length - 1]}`
  return fillUi(template, { list })
}

/** Fields that should show their error now: touched ones, or all after a submit attempt. */
export function visibleErrors(errors: ContactErrors, touched: Partial<Record<ContactField, boolean>>, all: boolean): ContactErrors {
  const out: ContactErrors = {}
  for (const f of FIELD_ORDER) if (errors[f] && (all || touched[f])) out[f] = errors[f]
  return out
}

// ── Back/forward cache restore ───────────────────────────────────────────

/** A challenge older than this is replaced when the page comes back from the back/forward cache. */
export const RESTORE_REFRESH_AFTER_MS = 5 * 60 * 1000

/**
 * Whether a `pageshow` should replace the visible human-check challenge: only
 * a restore from the back/forward cache (`persisted`), only while the form
 * shows a challenge (fetched at `fetchedAt`, ms; 0 = none, 1 = in flight)
 * and only when it is old enough that it may expire before the visitor
 * sends — the server accepts a nonce for 30 minutes.
 */
export function shouldRefreshChallengeOnRestore(opts: { persisted: boolean; fetchedAt: number; now: number; sent: boolean }): boolean {
  if (!opts.persisted || opts.sent || opts.fetchedAt <= 1) return false
  return opts.now - opts.fetchedAt >= RESTORE_REFRESH_AFTER_MS
}

// ── Availability (home.availability): components/Common/availability ────

export { availabilityView, type AvailabilityStatus, type AvailabilityView } from './availability'

/**
 * The contact form's privacy notice: what is kept, why and for how long.
 * `retentionDays`: the server's CONTACT_RETENTION_DAYS (0 = no automatic
 * expiry), or null while it is not known yet (the sentence about the
 * period is left out rather than guessed).
 */
export function privacyNoticeText(retentionDays: number | null, t: ContactStrings = CONTACT_EN): string {
  const { what, manual, auto, periods } = t.privacy
  // Chinese sentences follow each other without a space.
  const join = (a: string, b: string) => (/[\u3400-\u9fff。]$/.test(a) ? `${a}${b}` : `${a} ${b}`)
  if (retentionDays === null || !Number.isFinite(retentionDays) || retentionDays < 0) return what
  if (retentionDays === 0) return join(what, manual)
  return join(what, fillUi(auto, { period: retentionPeriodIn(retentionDays, periods) }))
}

/** The structured fields to send for an intent (blank ones and undisclosed ones left out). */
export function inquiryPayload(
  v: Pick<ContactValues, 'reason' | 'company' | 'roleUrl' | 'timeline'>,
  intent: InquiryIntent,
): { reason: string; intent: InquiryIntent; company?: string; roleUrl?: string; timeline?: InquiryTimeline } {
  const fields = INTENT_FIELDS[intent]
  const out: { reason: string; intent: InquiryIntent; company?: string; roleUrl?: string; timeline?: InquiryTimeline } = {
    reason: v.reason.trim(),
    intent,
  }
  if (fields.includes('company') && v.company.trim()) out.company = v.company.trim()
  if (fields.includes('roleUrl') && v.roleUrl.trim()) out.roleUrl = v.roleUrl.trim()
  if (fields.includes('timeline') && v.timeline) out.timeline = v.timeline
  return out
}
