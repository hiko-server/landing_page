/**
 * Contact page logic — pure, shared by ContactPro, AvailabilityCard and their
 * unit tests.
 *
 * Form validation mirrors what POST /api/contact enforces (name, a well-formed email, a
 * subject — the chosen reason stands in when the subject is blank — and a
 * message) plus the client-side human check, so a form the UI lets through
 * is one the server accepts.
 */

import { INTENT_FIELDS, checkRoleUrl, type InquiryIntent, type InquiryTimeline } from '../../lib/inquiry'
import { retentionPeriodText } from '../../lib/retention'

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

const HINT_LABEL: Record<ContactField, string> = {
  name: 'your name',
  email: 'a valid email',
  subject: 'a subject',
  roleUrl: 'an https:// link (or leave it empty)',
  message: 'a message',
  mathAnswer: 'the human-check answer',
}

/**
 * @param expectedMath the human-check sum, or null while it is not generated yet
 *                     (the form cannot be valid until it is).
 * @param intent       the chosen reason's intent; its disclosed fields are checked
 *                     ('other' / omitted: none).
 */
export function validateContact(v: ContactValues, expectedMath: number | null, intent: InquiryIntent = 'other'): ContactErrors {
  const errors: ContactErrors = {}
  if (!v.name.trim()) errors.name = 'Please enter your name.'
  const email = v.email.trim()
  if (!email) errors.email = 'Please enter your email address.'
  else if (!EMAIL_RE.test(email)) errors.email = 'That email address doesn’t look right.'
  if (!v.subject.trim() && !v.reason.trim()) errors.subject = 'Add a subject or pick a reason.'
  const link = (v.roleUrl || '').trim()
  if (INTENT_FIELDS[intent].includes('roleUrl') && link) {
    const checked = checkRoleUrl(link)
    if (!checked.ok) errors.roleUrl = checked.error
  }
  if (!v.message.trim()) errors.message = 'Please write a message.'
  else if (v.message.length > MESSAGE_MAX) errors.message = `Keep the message under ${MESSAGE_MAX.toLocaleString('en-US')} characters.`
  if (expectedMath === null) errors.mathAnswer = 'The human check is still loading.'
  else if (!v.mathAnswer.trim()) errors.mathAnswer = 'Answer the human check.'
  else if (v.mathAnswer.trim() !== String(expectedMath)) errors.mathAnswer = 'That sum isn’t right — try again.'
  return errors
}

export function isContactValid(errors: ContactErrors): boolean {
  return FIELD_ORDER.every((f) => !errors[f])
}

/** "Add your name and a message to send." — explains why Send is disabled. */
export function submitHint(errors: ContactErrors): string {
  const missing = FIELD_ORDER.filter((f) => errors[f]).map((f) => HINT_LABEL[f])
  if (!missing.length) return ''
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
  return `Add ${list} to send.`
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

// ── Availability (home.availability) ─────────────────────────────────────

export type AvailabilityStatus = 'open' | 'limited' | 'closed'

/** What AvailabilityCard renders; null renders nothing. */
export type AvailabilityView = {
  status: AvailabilityStatus
  label: string
  roles: string[]
  /** 'YYYY-MM' the availability starts, or '' when not set. */
  from: string
  /** An https booking link, or '' (other schemes are never linked). */
  bookingUrl: string
  /** The owner's right-to-work line (English), or ''. */
  workStatus: string
}

const DEFAULT_AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  open: 'Available for new work',
  limited: 'Limited availability',
  closed: 'Not taking on new work',
}

const isStatus = (v: unknown): v is AvailabilityStatus => v === 'open' || v === 'limited' || v === 'closed'
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function httpsUrl(v: unknown): string {
  const raw = text(v)
  if (!raw) return ''
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' ? u.toString() : ''
  } catch {
    return ''
  }
}

/**
 * The owner's availability as shown on /contact. Only an explicit status
 * (open / limited / closed) produces a card; the label defaults to a plain
 * description of that status. `label_zh` is for Chinese pages and not used here.
 */
export function availabilityView(
  a:
    | { status?: unknown; label?: unknown; roles?: unknown; from?: unknown; bookingUrl?: unknown; workStatus?: unknown }
    | null
    | undefined,
): AvailabilityView | null {
  if (!a || !isStatus(a.status)) return null
  const roles = Array.isArray(a.roles) ? Array.from(new Set(a.roles.map(text).filter(Boolean))) : []
  const from = /^(\d{4}-(0[1-9]|1[0-2]))(-\d{2})?$/.exec(text(a.from))
  return {
    status: a.status,
    label: text(a.label) || DEFAULT_AVAILABILITY_LABEL[a.status],
    roles,
    from: from ? from[1] : '',
    bookingUrl: httpsUrl(a.bookingUrl),
    workStatus: text(a.workStatus).replace(/[\r\n]+/g, ' '),
  }
}

/**
 * The contact form's privacy notice: what is kept, why and for how long.
 * `retentionDays`: the server's CONTACT_RETENTION_DAYS (0 = no automatic
 * expiry), or null while it is not known yet (the sentence about the
 * period is left out rather than guessed).
 */
export function privacyNoticeText(retentionDays: number | null): string {
  const what =
    'Your name, e-mail address and message are kept in my private inbox (and may be forwarded to my own mailbox), only so I can reply.'
  if (retentionDays === null || !Number.isFinite(retentionDays) || retentionDays < 0) return what
  if (retentionDays === 0) return `${what} I delete them myself when they are no longer needed.`
  return `${what} They are deleted automatically after ${retentionPeriodText(retentionDays)}.`
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
