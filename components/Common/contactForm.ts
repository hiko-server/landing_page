/**
 * Contact form validation — pure, shared by ContactPro and its unit tests.
 *
 * Mirrors what POST /api/contact enforces (name, a well-formed email, a
 * subject — the chosen reason stands in when the subject is blank — and a
 * message) plus the client-side human check, so a form the UI lets through
 * is one the server accepts.
 */

export const MESSAGE_MAX = 5000

/** Same pattern the API uses to reject malformed addresses. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ContactField = 'name' | 'email' | 'subject' | 'message' | 'mathAnswer'

export type ContactValues = {
  name: string
  email: string
  reason: string
  subject: string
  message: string
  mathAnswer: string
}

export type ContactErrors = Partial<Record<ContactField, string>>

/** Order in which problems are listed in the submit hint (= visual order). */
export const FIELD_ORDER: readonly ContactField[] = ['name', 'email', 'subject', 'message', 'mathAnswer']

const HINT_LABEL: Record<ContactField, string> = {
  name: 'your name',
  email: 'a valid email',
  subject: 'a subject',
  message: 'a message',
  mathAnswer: 'the human-check answer',
}

/**
 * @param expectedMath the human-check sum, or null while it is not generated yet
 *                     (the form cannot be valid until it is).
 */
export function validateContact(v: ContactValues, expectedMath: number | null): ContactErrors {
  const errors: ContactErrors = {}
  if (!v.name.trim()) errors.name = 'Please enter your name.'
  const email = v.email.trim()
  if (!email) errors.email = 'Please enter your email address.'
  else if (!EMAIL_RE.test(email)) errors.email = 'That email address doesn’t look right.'
  if (!v.subject.trim() && !v.reason.trim()) errors.subject = 'Add a subject or pick a reason.'
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
